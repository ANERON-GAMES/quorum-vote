import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DOWN, MAX_NAME_LENGTH, UNKNOWN, UP, foldQuorum } from '../src/index.js';
import { assertQuorumError, vote } from './helpers.js';

const NAME_MESSAGE = 'a string of 1 to 256 characters without spaces or control characters';
const TARGET_MESSAGE = `target must be ${NAME_MESSAGE}`;
const OBSERVER_MESSAGE = `votes[0].observer must be ${NAME_MESSAGE}`;
const VALUE_MESSAGE = 'votes[0].value must be "up", "down", or "unknown"';
const AT_MESSAGE = 'votes[0].atMs must be a safe integer';
const QUORUM_MESSAGE = 'quorum must be a safe integer greater than or equal to 1';
const TTL_MESSAGE = 'ttlMs must be a non-negative safe integer';
const PREVIOUS_MESSAGE = 'previous must be "up", "down", or "unknown"';
const NOW_MESSAGE = 'nowMs must be a safe integer';

const baseVote = () => vote('east', UP, 0);
const baseOptions = { quorum: 2, ttlMs: 10, previous: UNKNOWN };

function rejectTarget(target) {
  assertQuorumError(
    () => foldQuorum(target, [baseVote()], baseOptions, 0),
    'invalid_target',
    TARGET_MESSAGE,
  );
}

function rejectVotes(votes) {
  assertQuorumError(
    () => foldQuorum('primary', votes, baseOptions, 0),
    'invalid_votes',
    'votes must be an array',
  );
}

function rejectVote(entry) {
  assertQuorumError(
    () => foldQuorum('primary', [entry], baseOptions, 0),
    'invalid_vote',
    'votes[0] must be a plain object',
  );
}

function rejectObserver(observer) {
  assertQuorumError(
    () => foldQuorum('primary', [vote(observer, UP, 0)], baseOptions, 0),
    'invalid_observer',
    OBSERVER_MESSAGE,
  );
}

function rejectValue(value) {
  assertQuorumError(
    () => foldQuorum('primary', [{ observer: 'east', value, atMs: 0 }], baseOptions, 0),
    'invalid_value',
    VALUE_MESSAGE,
  );
}

function rejectAt(atMs) {
  assertQuorumError(
    () => foldQuorum('primary', [{ observer: 'east', value: UP, atMs }], baseOptions, 0),
    'invalid_at',
    AT_MESSAGE,
  );
}

function rejectOptions(options) {
  assertQuorumError(
    () => foldQuorum('primary', [baseVote()], options, 0),
    'invalid_options',
    'options must be a plain object',
  );
}

function rejectQuorum(quorum) {
  assertQuorumError(
    () => foldQuorum('primary', [baseVote()], { ...baseOptions, quorum }, 0),
    'invalid_quorum',
    QUORUM_MESSAGE,
  );
}

function rejectTtl(ttlMs) {
  assertQuorumError(
    () => foldQuorum('primary', [baseVote()], { ...baseOptions, ttlMs }, 0),
    'invalid_ttl',
    TTL_MESSAGE,
  );
}

function rejectPrevious(previous) {
  assertQuorumError(
    () => foldQuorum('primary', [baseVote()], { ...baseOptions, previous }, 0),
    'invalid_previous',
    PREVIOUS_MESSAGE,
  );
}

function rejectNow(nowMs) {
  assertQuorumError(
    () => foldQuorum('primary', [baseVote()], baseOptions, nowMs),
    'invalid_now',
    NOW_MESSAGE,
  );
}

test('target must be a bounded name', () => {
  for (const target of [
    undefined,
    null,
    '',
    ' ',
    'primary backup',
    'primary\n',
    'a\u0000',
    'a\u007f',
    'a\u0085',
    'a\u00a0b',
    'a\u3000b',
    'a'.repeat(MAX_NAME_LENGTH + 1),
    1,
    true,
    [],
    {},
  ]) {
    rejectTarget(target);
  }
  const longName = 'a'.repeat(MAX_NAME_LENGTH);
  const result = foldQuorum(longName, [vote('east', UP, 0), vote('west', UP, 0)], baseOptions, 0);
  assert.equal(result.target, longName);
  assert.equal(result.verdict, UP);
});

test('votes must be an array of plain vote objects', () => {
  for (const votes of [
    undefined,
    null,
    {},
    '[]',
    1,
    true,
    () => {},
    new Date(),
    vote('east', UP, 0),
  ]) {
    rejectVotes(votes);
  }
  for (const entry of [
    undefined,
    null,
    1,
    'east',
    true,
    [],
    () => {},
    new Date(),
    new (class Box {})(),
  ]) {
    rejectVote(entry);
  }
  const sparse = [];
  sparse[1] = baseVote();
  assertQuorumError(
    () => foldQuorum('primary', sparse, baseOptions, 0),
    'invalid_vote',
    'votes[0] must be a plain object',
  );
  assertQuorumError(
    () => foldQuorum('primary', [baseVote(), baseVote(), null], baseOptions, 0),
    'invalid_vote',
    'votes[2] must be a plain object',
  );
});

test('observer and value and atMs are checked after unknown fields', () => {
  for (const observer of [
    undefined,
    null,
    '',
    ' ',
    'east west',
    'east\nwest',
    'east\t',
    'a\u0007',
    'a\u007f',
    'a\u00a0',
    'a'.repeat(MAX_NAME_LENGTH + 1),
    1,
    true,
    [],
    {},
  ]) {
    rejectObserver(observer);
  }
  const longObserver = 'b'.repeat(MAX_NAME_LENGTH);
  const named = foldQuorum(
    'primary',
    [vote(longObserver, UP, 0), vote('west', UP, 0)],
    baseOptions,
    0,
  );
  assert.equal(named.ballots[0].observer, longObserver);

  const dotted = foldQuorum(
    'primary',
    [vote('zone:east.1_a', UP, 0), vote('west', DOWN, 0)],
    baseOptions,
    0,
  );
  assert.equal(dotted.ballots[0].observer, 'west');
  assert.equal(dotted.ballots[1].observer, 'zone:east.1_a');

  for (const value of [
    undefined,
    null,
    '',
    'UP',
    'Up',
    'unknown ',
    ' yes',
    1,
    true,
    [],
    {},
    DOWN.toUpperCase(),
  ]) {
    rejectValue(value);
  }
  for (const atMs of [
    undefined,
    null,
    1.5,
    NaN,
    Infinity,
    -Infinity,
    '0',
    true,
    1n,
    [],
    {},
    () => {},
  ]) {
    rejectAt(atMs);
  }

  const extra = { observer: 'east', value: UP, atMs: 0, note: true, extra: 1 };
  assertQuorumError(
    () => foldQuorum('primary', [extra], baseOptions, 0),
    'unknown_vote_field',
    'votes[0] has unknown field "extra"',
  );
  const hidden = vote('east', UP, 0);
  Object.defineProperty(hidden, 'hidden', { value: 1, enumerable: false });
  assertQuorumError(
    () => foldQuorum('primary', [hidden], baseOptions, 0),
    'unknown_vote_field',
    'votes[0] has unknown field "hidden"',
  );
  const symbolic = vote('east', UP, 0);
  symbolic[Symbol('extra')] = true;
  assertQuorumError(
    () => foldQuorum('primary', [symbolic], baseOptions, 0),
    'invalid_vote',
    'votes[0] must not contain symbol keys',
  );
  const both = vote('east', UP, 0);
  both.note = true;
  both[Symbol('extra')] = true;
  assertQuorumError(
    () => foldQuorum('primary', [both], baseOptions, 0),
    'unknown_vote_field',
    'votes[0] has unknown field "note"',
  );
  const inherited = { observer: 'east', value: UP, atMs: 0, __proto__: { polluted: true } };
  assertQuorumError(
    () => foldQuorum('primary', [inherited], baseOptions, 0),
    'invalid_vote',
    'votes[0] must be a plain object',
  );
  assert.equal({}.polluted, undefined);

  const parsed = JSON.parse(
    '{"observer":"east","value":"up","atMs":0,"__proto__":{"polluted":true}}',
  );
  assertQuorumError(
    () => foldQuorum('primary', [parsed], baseOptions, 0),
    'unknown_vote_field',
    'votes[0] has unknown field "__proto__"',
  );
  assert.equal({}.polluted, undefined);

  const bare = Object.create(null);
  bare.observer = 'east';
  bare.value = UP;
  bare.atMs = 0;
  const other = Object.create(null);
  other.observer = 'west';
  other.value = UP;
  other.atMs = 0;
  const accepted = foldQuorum('primary', [bare, other], baseOptions, 0);
  assert.equal(accepted.verdict, UP);
});

test('options, quorum, ttl, previous, and nowMs are validated', () => {
  for (const options of [
    undefined,
    null,
    [],
    1,
    'options',
    () => {},
    new Date(),
    new (class Box {})(),
  ]) {
    rejectOptions(options);
  }
  for (const quorum of [
    undefined,
    null,
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    -Infinity,
    '2',
    true,
    false,
    [],
    {},
    1n,
  ]) {
    if (quorum === undefined) {
      continue;
    }
    rejectQuorum(quorum);
  }
  for (const ttlMs of [null, -1, 1.5, NaN, Infinity, -Infinity, '0', true, false, [], {}, 1n]) {
    rejectTtl(ttlMs);
  }
  for (const previous of [null, '', 'UP', 'held', 1, true, [], {}, UNKNOWN.toUpperCase()]) {
    rejectPrevious(previous);
  }
  for (const nowMs of [
    undefined,
    null,
    1.5,
    NaN,
    Infinity,
    -Infinity,
    '0',
    true,
    false,
    [],
    {},
    () => {},
    1n,
  ]) {
    rejectNow(nowMs);
  }

  assertQuorumError(
    () => foldQuorum('primary', [baseVote()], { ...baseOptions, window: 1, anchor: 2 }, 0),
    'unknown_option',
    'unknown option "anchor"',
  );
  const options = { quorum: 2, ttlMs: 10, previous: UNKNOWN };
  options[Symbol('extra')] = true;
  assertQuorumError(
    () => foldQuorum('primary', [baseVote()], options, 0),
    'unknown_option',
    'options must not contain symbol keys',
  );
  const polluted = { quorum: 2 };
  polluted.constructor = { prototype: { polluted: true } };
  assertQuorumError(
    () => foldQuorum('primary', [baseVote(), vote('west', UP, 0)], polluted, 0),
    'unknown_option',
    'unknown option "constructor"',
  );
  assert.equal({}.polluted, undefined);

  const bare = Object.create(null);
  bare.quorum = 2;
  bare.ttlMs = 10;
  bare.previous = DOWN;
  const result = foldQuorum('primary', [vote('east', DOWN, 0), vote('west', DOWN, 0)], bare, 0);
  assert.equal(result.previous, DOWN);
  assert.equal(result.verdict, DOWN);
});

test('a future vote is rejected in index order and a conflict names the earliest observer', () => {
  assertQuorumError(
    () => foldQuorum('primary', [vote('east', UP, 0), vote('west', UP, 6)], baseOptions, 5),
    'vote_in_future',
    'votes[1].atMs must be less than or equal to nowMs',
  );
  assertQuorumError(
    () => foldQuorum('primary', [vote('east', UP, 2)], { quorum: 1.5, ttlMs: 10 }, 1),
    'invalid_quorum',
    QUORUM_MESSAGE,
  );
  assertQuorumError(
    () =>
      foldQuorum(
        'primary',
        [vote('west', UP, 4), vote('west', DOWN, 4), vote('east', UP, 4), vote('east', DOWN, 4)],
        baseOptions,
        100,
      ),
    'conflicting_vote',
    'observer "east" has conflicting votes at the same atMs',
  );
  assertQuorumError(
    () =>
      foldQuorum(
        'primary',
        [vote('east', UP, 1), vote('east', DOWN, 1), vote('east', UP, 9)],
        baseOptions,
        10,
      ),
    'conflicting_vote',
    'observer "east" has conflicting votes at the same atMs',
  );
  const repeated = foldQuorum(
    'primary',
    [vote('east', UP, 3), vote('east', UP, 3), vote('west', UP, 3)],
    baseOptions,
    3,
  );
  assert.equal(repeated.ballots.length, 2);
  assert.equal(repeated.verdict, UP);
});

test('explicit undefined options fall back to defaults', () => {
  const result = foldQuorum(
    'primary',
    [vote('east', UP, 0), vote('west', UP, 0)],
    { quorum: undefined, ttlMs: undefined, previous: undefined },
    0,
  );
  assert.equal(result.quorum, 2);
  assert.equal(result.ttlMs, 30000);
  assert.equal(result.previous, UNKNOWN);
  assert.equal(result.flipQuorum, 2);
  assert.equal(result.verdict, UP);
  assert.equal(result.reason, 'quorum');
});

test('integer-valued numbers and the extreme safe clock are accepted', () => {
  const wide = foldQuorum(
    'primary',
    [
      { observer: 'east', value: UP, atMs: Number.MIN_SAFE_INTEGER },
      { observer: 'west', value: UP, atMs: Number.MIN_SAFE_INTEGER },
    ],
    { quorum: 1.0, ttlMs: Number.MAX_SAFE_INTEGER, previous: UNKNOWN },
    0,
  );
  assert.equal(wide.verdict, UP);
  assert.equal(wide.ballots[0].atMs, Number.MIN_SAFE_INTEGER);

  const stale = foldQuorum(
    'primary',
    [
      { observer: 'east', value: UP, atMs: Number.MIN_SAFE_INTEGER },
      { observer: 'west', value: UP, atMs: Number.MIN_SAFE_INTEGER },
    ],
    { quorum: Number.MAX_SAFE_INTEGER, ttlMs: Number.MAX_SAFE_INTEGER - 1, previous: UP },
    0,
  );
  assert.equal(stale.reason, 'expired');
  assert.equal(stale.verdict, UNKNOWN);
  assert.equal(stale.quorum, Number.MAX_SAFE_INTEGER);
  assert.equal(stale.flipQuorum, Number.MAX_SAFE_INTEGER);

  const edge = foldQuorum(
    'primary',
    [
      { observer: 'east', value: DOWN, atMs: Number.MAX_SAFE_INTEGER },
      { observer: 'west', value: DOWN, atMs: Number.MAX_SAFE_INTEGER },
    ],
    { quorum: 2, ttlMs: 0, previous: UNKNOWN },
    Number.MAX_SAFE_INTEGER,
  );
  assert.equal(edge.verdict, DOWN);
  assert.equal(edge.expired.length, 0);
});
