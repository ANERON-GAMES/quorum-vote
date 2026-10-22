# @aneron/quorum-vote

Fold health votes from several observers into one quorum verdict for a target.
The package is a pure function: it does not read a clock, start a timer, touch shared state, or perform I/O.

## Purpose

`foldQuorum` answers one question: given the votes collected for a target, the caller's current time, and the last published verdict, what verdict should stand now?

Each observer contributes `up`, `down`, or `unknown`. A side becomes the verdict when enough fresh observers agree. Votes older than the configured lifetime are dropped. One observer is never enough to change the verdict, even when `quorum` is `1`. The caller keeps the previous verdict and passes it back on the next call, and the caller supplies the time, so a test can reproduce every result.

There are no runtime dependencies.

## Install

```sh
npm install @aneron/quorum-vote
```

The package name is `@aneron/quorum-vote`. It is ESM and requires Node.js 20 or newer.

## Usage

```js
import { DOWN, UNKNOWN, UP, foldQuorum } from '@aneron/quorum-vote';

const target = 'primary';
const options = { quorum: 2, ttlMs: 1000, previous: UNKNOWN };

const opened = foldQuorum(
  target,
  [
    { observer: 'east', value: UP, atMs: 1000 },
    { observer: 'west', value: UP, atMs: 1100 },
  ],
  options,
  1100,
);

const challenged = foldQuorum(
  target,
  [
    { observer: 'east', value: UP, atMs: 1000 },
    { observer: 'west', value: DOWN, atMs: 1500 },
  ],
  { ...options, previous: opened.verdict },
  1500,
);

const lone = foldQuorum(
  target,
  [{ observer: 'west', value: DOWN, atMs: 1500 }],
  { quorum: 1, ttlMs: 1000, previous: UP },
  1500,
);

const quiet = foldQuorum(
  target,
  [
    { observer: 'east', value: UP, atMs: 1000 },
    { observer: 'west', value: UP, atMs: 1100 },
  ],
  { ...options, previous: UP },
  2200,
);

const agreed = foldQuorum(
  target,
  [
    { observer: 'west', value: DOWN, atMs: 1500 },
    { observer: 'nord', value: DOWN, atMs: 1600 },
  ],
  { quorum: 2, ttlMs: 1000, previous: UP },
  1600,
);
```

`opened.verdict` is `up` with reason `quorum`. Both votes are inside the 1000 unit lifetime, and two observers agree.

`challenged.verdict` stays `up` with reason `held`. `west` changed to `down`, and one opposing observer leaves the supported verdict in place.

`lone.verdict` is `unknown` with reason `lone_observer`. `quorum` is `1`, so a single `down` would otherwise be enough, and the lone-observer rule still refuses the change. The previous `up` vote is already outside this call, so the result is `unknown` and the lone `down` is recorded in `ballots`.

`quiet.verdict` is `unknown` with reason `expired`. At time `2200` both of the opening votes are older than `ttlMs`.

`agreed.verdict` is `down` with reason `quorum`. Two observers agree, so the verdict can change.

Call the function once per target. Store `verdict` and pass it as `previous` on the next call for that same target.

## API

### `foldQuorum(target, votes, options, nowMs)`

```js
import { foldQuorum } from '@aneron/quorum-vote';

const result = foldQuorum(target, votes, options, nowMs);
```

| Argument  | Required | Meaning                                                                                                                  |
| --------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `target`  | yes      | Name of the target. A string of 1 to 256 characters, with no spaces or control characters. Comparison is case-sensitive. |
| `votes`   | yes      | Array of votes for that target. An empty array is valid.                                                                 |
| `options` | yes      | Plain object of limits. Every field is optional.                                                                         |
| `nowMs`   | yes      | Current time as a safe integer, in the same unit as `atMs` and `ttlMs`.                                                  |

A vote is a plain object:

| Field      | Meaning                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------- |
| `observer` | Observer name. Same character rules as `target`.                                             |
| `value`    | `up`, `down`, or `unknown`.                                                                  |
| `atMs`     | Safe integer time when the observer cast the vote. A value greater than `nowMs` is an error. |

`options`:

| Field      | Default   | Meaning                                                                                                                                                                               |
| ---------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quorum`   | `2`       | Safe integer greater than or equal to `1`. This many fresh agreeing observers are required before a side can carry a verdict. The flip rule below can raise the effective bar to `2`. |
| `ttlMs`    | `30000`   | Non-negative safe integer. A vote is fresh when `nowMs - atMs` is from `0` through `ttlMs` inclusive.                                                                                 |
| `previous` | `unknown` | Last published verdict: `up`, `down`, or `unknown`.                                                                                                                                   |

An omitted field and a field set to `undefined` both use the default. Any other key is an error. `1.0` is a safe integer and is accepted for `quorum` and `ttlMs`.

The return value is a frozen plain object:

| Field        | Meaning                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| `target`     | The target argument.                                                                                         |
| `verdict`    | `up`, `down`, or `unknown`.                                                                                  |
| `previous`   | The previous verdict used for this call.                                                                     |
| `flipped`    | `true` when `verdict` and `previous` differ.                                                                 |
| `reason`     | Why the verdict was chosen. One of the reason constants.                                                     |
| `quorum`     | Resolved `quorum`.                                                                                           |
| `flipQuorum` | `max(quorum, 2)`. A side needs this many fresh votes to change the verdict.                                  |
| `ttlMs`      | Resolved lifetime.                                                                                           |
| `counts`     | Frozen `{ up, down, unknown }` counts of fresh ballots.                                                      |
| `ballots`    | Frozen array of fresh ballots, sorted by observer name. Each ballot is a frozen `{ observer, value, atMs }`. |
| `expired`    | Frozen array of stale ballots after per-observer dedupe, sorted by observer name.                            |

`ballots` and `expired` contain one entry per observer. When an observer casts more than one vote, the entry with the greatest `atMs` is kept and the older entries are discarded. Equal timestamps with different values are an error. Equal timestamps with the same value collapse to one ballot.

Reasons:

| Reason          | When it is used                                                                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `empty`         | `votes` is empty. The verdict is `unknown`.                                                                                                                |
| `expired`       | Every deduped vote is stale. The verdict is `unknown`.                                                                                                     |
| `split`         | Both `up` and `down` have at least `flipQuorum` fresh votes. The verdict is `unknown`.                                                                     |
| `quorum`        | One side has at least `flipQuorum` fresh votes. That side is the verdict.                                                                                  |
| `held`          | The previous `up` or `down` verdict still has at least one fresh supporting vote, and the opposite side has not reached `flipQuorum`.                      |
| `lone_observer` | A side reached `quorum` with only one observer, so the verdict was left unchanged. When the previous verdict is also unsupported, the result is `unknown`. |
| `insufficient`  | Fresh votes exist, and none of the rules above produce `up` or `down`. The verdict is `unknown`.                                                           |

`unknown` votes are counted and listed. They do not support `up` or `down`.

Observer name order is UTF-16 code unit order. `A` sorts before `a`.

### `QuorumVoteError`

Every rejected input throws `QuorumVoteError`. The error is an `Error` with `name` set to `QuorumVoteError` and a stable string `code`.

| Code                 | Message                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `invalid_target`     | `target must be a string of 1 to 256 characters without spaces or control characters`                |
| `invalid_votes`      | `votes must be an array`                                                                             |
| `invalid_vote`       | `votes[index] must be a plain object`, or `votes[index] must not contain symbol keys`                |
| `unknown_vote_field` | `votes[index] has unknown field "..."`                                                               |
| `invalid_observer`   | `votes[index].observer must be a string of 1 to 256 characters without spaces or control characters` |
| `invalid_value`      | `votes[index].value must be "up", "down", or "unknown"`                                              |
| `invalid_at`         | `votes[index].atMs must be a safe integer`                                                           |
| `invalid_options`    | `options must be a plain object`                                                                     |
| `unknown_option`     | `unknown option "..."`, or `options must not contain symbol keys`                                    |
| `invalid_quorum`     | `quorum must be a safe integer greater than or equal to 1`                                           |
| `invalid_ttl`        | `ttlMs must be a non-negative safe integer`                                                          |
| `invalid_previous`   | `previous must be "up", "down", or "unknown"`                                                        |
| `invalid_now`        | `nowMs must be a safe integer`                                                                       |
| `vote_in_future`     | `votes[index].atMs must be less than or equal to nowMs`                                              |
| `conflicting_vote`   | `observer "..." has conflicting votes at the same atMs`                                              |

Validation walks the arguments in order: `target`, `votes`, `options`, `nowMs`, then future timestamps, then conflicts. The first problem is the error that is thrown. Unknown fields are reported before a missing or invalid known field. When several unknown names are present, the name that sorts first is reported. When several observers conflict, the observer name that sorts first is reported.

A plain object is an object whose prototype is `Object.prototype` or `null`. Arrays, class instances, and other built-in objects are rejected. Own symbol keys and own non-enumerable keys are rejected.

### Constants

| Export                 | Value                                                               |
| ---------------------- | ------------------------------------------------------------------- |
| `UP`                   | `'up'`                                                              |
| `DOWN`                 | `'down'`                                                            |
| `UNKNOWN`              | `'unknown'`                                                         |
| `VOTE_VALUES`          | Frozen `['up', 'down', 'unknown']`                                  |
| `REASON_QUORUM`        | `'quorum'`                                                          |
| `REASON_HELD`          | `'held'`                                                            |
| `REASON_LONE_OBSERVER` | `'lone_observer'`                                                   |
| `REASON_INSUFFICIENT`  | `'insufficient'`                                                    |
| `REASON_EXPIRED`       | `'expired'`                                                         |
| `REASON_SPLIT`         | `'split'`                                                           |
| `REASON_EMPTY`         | `'empty'`                                                           |
| `REASONS`              | Frozen array of the seven reason strings, in the order listed above |
| `MIN_FLIP_OBSERVERS`   | `2`                                                                 |
| `MAX_NAME_LENGTH`      | `256`                                                               |
| `DEFAULT_QUORUM`       | `2`                                                                 |
| `DEFAULT_TTL_MS`       | `30000`                                                             |
| `DEFAULT_PREVIOUS`     | `'unknown'`                                                         |
| `DEFAULTS`             | Frozen `{ quorum, ttlMs, previous }`                                |

## Design

The package holds no verdict of its own. Two calls with the same arguments return the same frozen result, and a call for one target has no effect on a later call for another target. Inputs are read and left unchanged. The result, its `counts`, and every ballot are frozen.

`nowMs`, `atMs`, and `ttlMs` share one integer time unit. The `Ms` suffix is the name of the option. The package does not convert units and does not call a clock. Age is `nowMs - atMs`, compared with exact integer arithmetic, so values at the ends of the safe-integer range stay exact. A vote with `atMs === nowMs - ttlMs` is fresh. A vote one unit older is stale. `ttlMs` of `0` keeps only votes cast at `nowMs`.

Each observer contributes one ballot: the vote with the greatest `atMs`. The kept vote is also the freshest vote from that observer, because a larger `atMs` is a smaller age. Older votes are dropped before expiry is applied, so `expired` lists the stale kept ballot and omits the discarded history.

`flipQuorum` is the greater of `quorum` and `MIN_FLIP_OBSERVERS`. The decision then follows this order:

1. An empty vote list yields `unknown` for reason `empty`.
2. A list whose kept votes are all stale yields `unknown` for reason `expired`.
3. When both `up` and `down` have at least `flipQuorum` fresh votes, the verdict is `unknown` for reason `split`.
4. When one side has at least `flipQuorum` fresh votes, that side is the verdict for reason `quorum`.
5. When the previous verdict is `up` or `down` and at least one fresh vote still supports it, that verdict stays. The reason is `lone_observer` when the opposite side met `quorum` with a single observer, and `held` otherwise.
6. When a side met `quorum` with a single observer and the previous verdict has no fresh support, the verdict is `unknown` for reason `lone_observer`.
7. Any other fresh list yields `unknown` for reason `insufficient`.

The quorum is an absolute count. It is the number of agreeing observers required, and a larger side does not outvote a smaller side that also reached `flipQuorum`. With `quorum` of `2`, three `up` votes and two `down` votes are a split. With `quorum` of `3`, those same votes produce `up`, because `down` is below the bar.

A lone observer may keep a previous `up` or `down` verdict that their fresh vote still supports. A lone observer may not create a verdict from `unknown`, and may not replace `up` with `down` or `down` with `up`. Setting `quorum` to `1` changes the lone-observer reason, and the flip bar stays at two observers.

An empty list and a fully stale list both publish `unknown`. Expiry is the clock removing support. It does not award the verdict to whatever single vote happens to remain. After the verdict returns to `unknown`, a later call can publish `up` or `down` once `flipQuorum` observers agree.

Observers are equal. The package has no weights, roles, or priority. Names are case-sensitive and are not trimmed. The caller splits a multi-target collection into one call per target.

## License

MIT. Copyright (c) 2026 Vadim Gubin. The full text is in `LICENSE`.
