import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_TTL_MS,
  DOWN,
  REASON_EMPTY,
  REASON_EXPIRED,
  REASON_HELD,
  REASON_INSUFFICIENT,
  REASON_LONE_OBSERVER,
  REASON_QUORUM,
  REASON_SPLIT,
  UNKNOWN,
  UP,
  foldQuorum,
} from '../src/index.js';
import { vote } from './helpers.js';

const zero = { up: 0, down: 0, unknown: 0 };

function counts(up, down, unknown) {
  return { up, down, unknown };
}

const cases = [
  {
    name: 'no votes leave an unknown verdict empty',
    votes: [],
    options: { quorum: 2, ttlMs: 10, previous: UNKNOWN },
    nowMs: 0,
    verdict: UNKNOWN,
    reason: REASON_EMPTY,
    flipped: false,
    counts: zero,
  },
  {
    name: 'no votes clear a previous up verdict',
    votes: [],
    options: { quorum: 2, ttlMs: 10, previous: UP },
    nowMs: 0,
    verdict: UNKNOWN,
    reason: REASON_EMPTY,
    flipped: true,
    counts: zero,
  },
  {
    name: 'no votes clear a previous down verdict',
    votes: [],
    options: { quorum: 1, ttlMs: 0, previous: DOWN },
    nowMs: 5,
    verdict: UNKNOWN,
    reason: REASON_EMPTY,
    flipped: true,
    counts: zero,
  },
  {
    name: 'stale votes expire a previous up verdict',
    votes: [vote('east', UP, 0), vote('west', UP, 1)],
    options: { quorum: 2, ttlMs: 10, previous: UP },
    nowMs: 12,
    verdict: UNKNOWN,
    reason: REASON_EXPIRED,
    flipped: true,
    counts: zero,
  },
  {
    name: 'stale votes expire without a flip when the previous verdict is unknown',
    votes: [vote('east', DOWN, 0)],
    options: { quorum: 1, ttlMs: 5, previous: UNKNOWN },
    nowMs: 6,
    verdict: UNKNOWN,
    reason: REASON_EXPIRED,
    flipped: false,
    counts: zero,
  },
  {
    name: 'two fresh up votes open an unknown target',
    votes: [vote('west', UP, 10), vote('east', UP, 9)],
    options: { quorum: 2, ttlMs: 10, previous: UNKNOWN },
    nowMs: 10,
    verdict: UP,
    reason: REASON_QUORUM,
    flipped: true,
    counts: counts(2, 0, 0),
  },
  {
    name: 'a full quorum that matches the previous verdict stays closed',
    votes: [vote('east', UP, 10), vote('west', UP, 10)],
    options: { quorum: 2, ttlMs: 10, previous: UP },
    nowMs: 10,
    verdict: UP,
    reason: REASON_QUORUM,
    flipped: false,
    counts: counts(2, 0, 0),
  },
  {
    name: 'two down votes flip up to down',
    votes: [vote('east', DOWN, 4), vote('nord', DOWN, 5)],
    options: { quorum: 2, ttlMs: 10, previous: UP },
    nowMs: 5,
    verdict: DOWN,
    reason: REASON_QUORUM,
    flipped: true,
    counts: counts(0, 2, 0),
  },
  {
    name: 'two down votes confirm an existing down verdict',
    votes: [vote('east', DOWN, 1), vote('west', DOWN, 1)],
    options: { quorum: 2, ttlMs: 3, previous: DOWN },
    nowMs: 1,
    verdict: DOWN,
    reason: REASON_QUORUM,
    flipped: false,
    counts: counts(0, 2, 0),
  },
  {
    name: 'one observer cannot open a verdict when quorum is 1',
    votes: [vote('east', UP, 0)],
    options: { quorum: 1, ttlMs: 10, previous: UNKNOWN },
    nowMs: 0,
    verdict: UNKNOWN,
    reason: REASON_LONE_OBSERVER,
    flipped: false,
    counts: counts(1, 0, 0),
  },
  {
    name: 'one matching observer holds the previous up verdict',
    votes: [vote('east', UP, 3)],
    options: { quorum: 1, ttlMs: 10, previous: UP },
    nowMs: 3,
    verdict: UP,
    reason: REASON_HELD,
    flipped: false,
    counts: counts(1, 0, 0),
  },
  {
    name: 'one opposing observer cannot flip down to up',
    votes: [vote('east', UP, 3)],
    options: { quorum: 1, ttlMs: 10, previous: DOWN },
    nowMs: 3,
    verdict: UNKNOWN,
    reason: REASON_LONE_OBSERVER,
    flipped: true,
    counts: counts(1, 0, 0),
  },
  {
    name: 'a lone opposing vote cannot replace a sustained up verdict',
    votes: [vote('east', UP, 3), vote('west', DOWN, 4)],
    options: { quorum: 1, ttlMs: 10, previous: UP },
    nowMs: 4,
    verdict: UP,
    reason: REASON_LONE_OBSERVER,
    flipped: false,
    counts: counts(1, 1, 0),
  },
  {
    name: 'one of two required votes holds the matching verdict',
    votes: [vote('east', UP, 8)],
    options: { quorum: 2, ttlMs: 10, previous: UP },
    nowMs: 8,
    verdict: UP,
    reason: REASON_HELD,
    flipped: false,
    counts: counts(1, 0, 0),
  },
  {
    name: 'one opposing vote below quorum clears an unsupported verdict to unknown',
    votes: [vote('west', DOWN, 8)],
    options: { quorum: 2, ttlMs: 10, previous: UP },
    nowMs: 8,
    verdict: UNKNOWN,
    reason: REASON_INSUFFICIENT,
    flipped: true,
    counts: counts(0, 1, 0),
  },
  {
    name: 'one vote on each side holds the supported verdict',
    votes: [vote('east', UP, 2), vote('west', DOWN, 2)],
    options: { quorum: 2, ttlMs: 4, previous: UP },
    nowMs: 2,
    verdict: UP,
    reason: REASON_HELD,
    flipped: false,
    counts: counts(1, 1, 0),
  },
  {
    name: 'a single up vote is insufficient when quorum is 2',
    votes: [vote('east', UP, 2)],
    options: { quorum: 2, ttlMs: 4, previous: UNKNOWN },
    nowMs: 2,
    verdict: UNKNOWN,
    reason: REASON_INSUFFICIENT,
    flipped: false,
    counts: counts(1, 0, 0),
  },
  {
    name: 'opposite single votes are insufficient when quorum is 2',
    votes: [vote('east', UP, 2), vote('west', DOWN, 2)],
    options: { quorum: 2, ttlMs: 4, previous: UNKNOWN },
    nowMs: 2,
    verdict: UNKNOWN,
    reason: REASON_INSUFFICIENT,
    flipped: false,
    counts: counts(1, 1, 0),
  },
  {
    name: 'both sides reaching the flip quorum split',
    votes: [vote('a', UP, 1), vote('b', UP, 1), vote('c', DOWN, 1), vote('d', DOWN, 1)],
    options: { quorum: 2, ttlMs: 5, previous: UP },
    nowMs: 1,
    verdict: UNKNOWN,
    reason: REASON_SPLIT,
    flipped: true,
    counts: counts(2, 2, 0),
  },
  {
    name: 'a split from unknown stays unknown',
    votes: [vote('a', UP, 1), vote('b', UP, 1), vote('c', DOWN, 1), vote('d', DOWN, 1)],
    options: { quorum: 2, ttlMs: 5, previous: UNKNOWN },
    nowMs: 1,
    verdict: UNKNOWN,
    reason: REASON_SPLIT,
    flipped: false,
    counts: counts(2, 2, 0),
  },
  {
    name: 'three up votes and two down votes still split at quorum 2',
    votes: [
      vote('a', UP, 1),
      vote('b', UP, 1),
      vote('c', UP, 1),
      vote('d', DOWN, 1),
      vote('e', DOWN, 1),
    ],
    options: { quorum: 2, ttlMs: 5, previous: UP },
    nowMs: 1,
    verdict: UNKNOWN,
    reason: REASON_SPLIT,
    flipped: true,
    counts: counts(3, 2, 0),
  },
  {
    name: 'two up votes hold a larger quorum',
    votes: [vote('east', UP, 1), vote('west', UP, 1)],
    options: { quorum: 3, ttlMs: 5, previous: UP },
    nowMs: 1,
    verdict: UP,
    reason: REASON_HELD,
    flipped: false,
    counts: counts(2, 0, 0),
  },
  {
    name: 'two up votes miss quorum 3 from unknown',
    votes: [vote('east', UP, 1), vote('west', UP, 1)],
    options: { quorum: 3, ttlMs: 5, previous: UNKNOWN },
    nowMs: 1,
    verdict: UNKNOWN,
    reason: REASON_INSUFFICIENT,
    flipped: false,
    counts: counts(2, 0, 0),
  },
  {
    name: 'three agreeing observers meet quorum 3',
    votes: [vote('east', UP, 1), vote('west', UP, 1), vote('nord', UP, 1)],
    options: { quorum: 3, ttlMs: 5, previous: UNKNOWN },
    nowMs: 1,
    verdict: UP,
    reason: REASON_QUORUM,
    flipped: true,
    counts: counts(3, 0, 0),
  },
  {
    name: 'an unknown vote does not open a verdict',
    votes: [vote('east', UNKNOWN, 1)],
    options: { quorum: 1, ttlMs: 5, previous: UNKNOWN },
    nowMs: 1,
    verdict: UNKNOWN,
    reason: REASON_INSUFFICIENT,
    flipped: false,
    counts: counts(0, 0, 1),
  },
  {
    name: 'two unknown votes clear an unsupported up verdict',
    votes: [vote('east', UNKNOWN, 1), vote('west', UNKNOWN, 1)],
    options: { quorum: 2, ttlMs: 5, previous: UP },
    nowMs: 1,
    verdict: UNKNOWN,
    reason: REASON_INSUFFICIENT,
    flipped: true,
    counts: counts(0, 0, 2),
  },
  {
    name: 'two down votes outvote one up vote once quorum is 2',
    votes: [vote('east', UP, 1), vote('west', DOWN, 1), vote('nord', DOWN, 1)],
    options: { quorum: 2, ttlMs: 5, previous: UP },
    nowMs: 1,
    verdict: DOWN,
    reason: REASON_QUORUM,
    flipped: true,
    counts: counts(1, 2, 0),
  },
  {
    name: 'three supporters hold quorum 4 against two opponents',
    votes: [
      vote('a', DOWN, 1),
      vote('b', DOWN, 1),
      vote('c', DOWN, 1),
      vote('d', UP, 1),
      vote('e', UP, 1),
    ],
    options: { quorum: 4, ttlMs: 5, previous: DOWN },
    nowMs: 1,
    verdict: DOWN,
    reason: REASON_HELD,
    flipped: false,
    counts: counts(2, 3, 0),
  },
  {
    name: 'quorum 1 still requires two observers to flip to down',
    votes: [vote('west', DOWN, 2), vote('nord', DOWN, 2)],
    options: { quorum: 1, ttlMs: 5, previous: UP },
    nowMs: 2,
    verdict: DOWN,
    reason: REASON_QUORUM,
    flipped: true,
    counts: counts(0, 2, 0),
  },
  {
    name: 'disagreeing lone observers leave unknown in place',
    votes: [vote('east', UP, 2), vote('west', DOWN, 2)],
    options: { quorum: 1, ttlMs: 5, previous: UNKNOWN },
    nowMs: 2,
    verdict: UNKNOWN,
    reason: REASON_LONE_OBSERVER,
    flipped: false,
    counts: counts(1, 1, 0),
  },
  {
    name: 'a minority below the larger quorum does not block',
    votes: [
      vote('a', UP, 1),
      vote('b', UP, 1),
      vote('c', UP, 1),
      vote('d', DOWN, 1),
      vote('e', DOWN, 1),
    ],
    options: { quorum: 3, ttlMs: 4, previous: DOWN },
    nowMs: 1,
    verdict: UP,
    reason: REASON_QUORUM,
    flipped: true,
    counts: counts(3, 2, 0),
  },
];

for (const item of cases) {
  test(item.name, () => {
    const result = foldQuorum('primary', item.votes, item.options, item.nowMs);
    assert.equal(result.target, 'primary');
    assert.equal(result.verdict, item.verdict);
    assert.equal(result.reason, item.reason);
    assert.equal(result.flipped, item.flipped);
    assert.equal(result.previous, item.options.previous);
    assert.equal(result.quorum, item.options.quorum);
    assert.equal(result.flipQuorum, Math.max(item.options.quorum, 2));
    assert.equal(result.ttlMs, item.options.ttlMs);
    assert.deepEqual(result.counts, item.counts);
    assert.equal(result.ballots.length, item.counts.up + item.counts.down + item.counts.unknown);
  });
}

test('freshness is inclusive of the ttl boundary and exclusive past it', () => {
  const votes = [vote('east', UP, 90), vote('west', UP, 90)];
  const inside = foldQuorum('primary', votes, { quorum: 2, ttlMs: 10, previous: UNKNOWN }, 100);
  assert.equal(inside.verdict, UP);
  assert.equal(inside.reason, REASON_QUORUM);
  assert.equal(inside.expired.length, 0);

  const outside = foldQuorum('primary', votes, { quorum: 2, ttlMs: 10, previous: UP }, 101);
  assert.equal(outside.verdict, UNKNOWN);
  assert.equal(outside.reason, REASON_EXPIRED);
  assert.equal(outside.expired.length, 2);
  assert.deepEqual(
    outside.expired.map((ballot) => ballot.observer),
    ['east', 'west'],
  );
});

test('a zero ttl keeps only votes cast at nowMs', () => {
  const votes = [vote('east', UP, 7), vote('west', UP, 6)];
  const now = foldQuorum('primary', votes, { quorum: 2, ttlMs: 0, previous: UNKNOWN }, 7);
  assert.equal(now.verdict, UNKNOWN);
  assert.equal(now.reason, REASON_INSUFFICIENT);
  assert.equal(now.ballots.length, 1);
  assert.equal(now.ballots[0].observer, 'east');
  assert.equal(now.expired[0].observer, 'west');

  const both = foldQuorum(
    'primary',
    [vote('east', DOWN, 7), vote('west', DOWN, 7)],
    { quorum: 2, ttlMs: 0, previous: UP },
    7,
  );
  assert.equal(both.verdict, DOWN);
  assert.equal(both.reason, REASON_QUORUM);
});

test('the default ttl boundary follows the exported default', () => {
  const fresh = foldQuorum(
    'primary',
    [vote('east', UP, 0), vote('west', UP, 0)],
    { quorum: 2, previous: UNKNOWN },
    DEFAULT_TTL_MS,
  );
  assert.equal(fresh.ttlMs, DEFAULT_TTL_MS);
  assert.equal(fresh.verdict, UP);
  assert.equal(fresh.reason, REASON_QUORUM);

  const aged = foldQuorum(
    'primary',
    [vote('east', UP, 0), vote('west', UP, 0)],
    { quorum: 2, previous: UP },
    DEFAULT_TTL_MS + 1,
  );
  assert.equal(aged.verdict, UNKNOWN);
  assert.equal(aged.reason, REASON_EXPIRED);
  assert.equal(aged.ballots.length, 0);
  assert.equal(aged.expired.length, 2);

  const partial = foldQuorum(
    'primary',
    [vote('east', UP, 0), vote('west', UP, 1)],
    { quorum: 2, previous: UP },
    DEFAULT_TTL_MS + 1,
  );
  assert.equal(partial.verdict, UP);
  assert.equal(partial.reason, REASON_HELD);
  assert.equal(partial.ballots.length, 1);
  assert.equal(partial.ballots[0].observer, 'west');
  assert.equal(partial.expired[0].observer, 'east');
});

test('negative timestamps use the same age rule', () => {
  const exact = foldQuorum(
    'primary',
    [vote('east', UP, -5), vote('west', UP, -5)],
    { quorum: 2, ttlMs: 0, previous: UNKNOWN },
    -5,
  );
  assert.equal(exact.verdict, UP);

  const stale = foldQuorum(
    'primary',
    [vote('east', UP, -6), vote('west', UP, -6)],
    { quorum: 2, ttlMs: 0, previous: UP },
    -5,
  );
  assert.equal(stale.reason, REASON_EXPIRED);

  const window = foldQuorum(
    'primary',
    [vote('east', DOWN, -6), vote('west', DOWN, -6)],
    { quorum: 2, ttlMs: 1, previous: UNKNOWN },
    -5,
  );
  assert.equal(window.verdict, DOWN);
});

test('the newest vote for an observer replaces older votes', () => {
  const result = foldQuorum(
    'primary',
    [
      vote('east', UP, 1),
      vote('east', UNKNOWN, 3),
      vote('east', DOWN, 5),
      vote('west', UP, 5),
      vote('nord', UP, 4),
    ],
    { quorum: 2, ttlMs: 10, previous: UNKNOWN },
    5,
  );
  assert.deepEqual(result.ballots, [
    { observer: 'east', value: DOWN, atMs: 5 },
    { observer: 'nord', value: UP, atMs: 4 },
    { observer: 'west', value: UP, atMs: 5 },
  ]);
  assert.equal(result.verdict, UP);
  assert.equal(result.counts.down, 1);
  assert.equal(result.expired.length, 0);
});

test('a stale newest vote is the only expired ballot for that observer', () => {
  const result = foldQuorum(
    'primary',
    [vote('east', UP, 1), vote('east', DOWN, 20), vote('west', UP, 1)],
    { quorum: 2, ttlMs: 30, previous: UP },
    100,
  );
  assert.equal(result.reason, REASON_EXPIRED);
  assert.deepEqual(result.expired, [
    { observer: 'east', value: DOWN, atMs: 20 },
    { observer: 'west', value: UP, atMs: 1 },
  ]);
  assert.equal(result.ballots.length, 0);
});

test('ballot order follows observer names and ignores input order', () => {
  const options = { quorum: 2, ttlMs: 20, previous: UNKNOWN };
  const first = [vote('b', UP, 3), vote('A', DOWN, 1), vote('a', UP, 4), vote('A', UP, 2)];
  const second = [first[3], first[2], first[0], first[1]];
  const left = foldQuorum('primary', first, options, 10);
  const right = foldQuorum('primary', second, options, 10);
  assert.deepEqual(left, right);
  assert.deepEqual(
    left.ballots.map((ballot) => ballot.observer),
    ['A', 'a', 'b'],
  );
  assert.equal(left.ballots[0].value, UP);
  assert.equal(left.ballots[0].atMs, 2);
  assert.equal(left.verdict, UP);
});

test('expired ballots are sorted and omitted from counts', () => {
  const result = foldQuorum(
    'primary',
    [vote('c', UNKNOWN, 0), vote('a', DOWN, 0), vote('b', UP, 9)],
    { quorum: 2, ttlMs: 5, previous: UNKNOWN },
    10,
  );
  assert.deepEqual(
    result.expired.map((ballot) => ballot.observer),
    ['a', 'c'],
  );
  assert.deepEqual(result.ballots, [{ observer: 'b', value: UP, atMs: 9 }]);
  assert.deepEqual(result.counts, counts(1, 0, 0));
  assert.equal(result.reason, REASON_INSUFFICIENT);
});

test('callers can chain the previous verdict as the clock moves', () => {
  const ttlMs = 50;
  const opened = foldQuorum(
    'primary',
    [vote('east', UP, 0), vote('west', UP, 0)],
    { quorum: 2, ttlMs, previous: UNKNOWN },
    0,
  );
  assert.equal(opened.verdict, UP);

  const challenged = foldQuorum(
    'primary',
    [vote('east', UP, 0), vote('west', DOWN, 10)],
    { quorum: 2, ttlMs, previous: opened.verdict },
    10,
  );
  assert.equal(challenged.verdict, UP);
  assert.equal(challenged.reason, REASON_HELD);
  assert.equal(challenged.flipped, false);

  const silent = foldQuorum(
    'primary',
    [vote('east', UP, 0), vote('west', DOWN, 10)],
    { quorum: 2, ttlMs, previous: challenged.verdict },
    100,
  );
  assert.equal(silent.verdict, UNKNOWN);
  assert.equal(silent.reason, REASON_EXPIRED);

  const closed = foldQuorum(
    'primary',
    [vote('west', DOWN, 100), vote('nord', DOWN, 100)],
    { quorum: 2, ttlMs, previous: silent.verdict },
    100,
  );
  assert.equal(closed.verdict, DOWN);
  assert.equal(closed.reason, REASON_QUORUM);
  assert.equal(closed.flipped, true);
});

test('separate targets do not share a verdict', () => {
  const votes = [vote('east', UP, 0), vote('west', UP, 0)];
  const options = { quorum: 2, ttlMs: 10, previous: UNKNOWN };
  const upTarget = foldQuorum('alpha', votes, options, 0);
  const downTarget = foldQuorum('beta', [vote('east', DOWN, 0), vote('west', DOWN, 0)], options, 0);
  assert.equal(upTarget.verdict, UP);
  assert.equal(downTarget.verdict, DOWN);
  const again = foldQuorum('alpha', votes, options, 0);
  assert.deepEqual(again, upTarget);
});

test('ten observers meet an equal quorum and miss the next integer', () => {
  const votes = [];
  for (let index = 0; index < 10; index += 1) {
    votes.push(vote(`n${index}`, UP, 5));
  }
  const met = foldQuorum('primary', votes, { quorum: 10, ttlMs: 5, previous: UNKNOWN }, 5);
  assert.equal(met.verdict, UP);
  assert.equal(met.reason, REASON_QUORUM);
  assert.equal(met.flipQuorum, 10);
  assert.equal(met.ballots.length, 10);
  const names = met.ballots.map((ballot) => ballot.observer);
  const sorted = [...names];
  sorted.sort();
  assert.deepEqual(names, sorted);

  const short = foldQuorum('primary', votes, { quorum: 11, ttlMs: 5, previous: UNKNOWN }, 5);
  assert.equal(short.verdict, UNKNOWN);
  assert.equal(short.reason, REASON_INSUFFICIENT);
  assert.equal(short.flipQuorum, 11);

  const held = foldQuorum('primary', votes, { quorum: 11, ttlMs: 5, previous: UP }, 5);
  assert.equal(held.verdict, UP);
  assert.equal(held.reason, REASON_HELD);
});

test('unknown abstentions leave a reached quorum intact', () => {
  const result = foldQuorum(
    'primary',
    [vote('east', UP, 1), vote('west', UP, 1), vote('nord', UNKNOWN, 2), vote('south', UNKNOWN, 0)],
    { quorum: 2, ttlMs: 10, previous: DOWN },
    2,
  );
  assert.equal(result.verdict, UP);
  assert.equal(result.reason, REASON_QUORUM);
  assert.deepEqual(result.counts, counts(2, 0, 2));
  assert.equal(result.flipped, true);
});

test('a vote at the far safe integer stays fresh only inside an exact ttl', () => {
  const votes = [
    vote('east', UP, Number.MIN_SAFE_INTEGER),
    vote('west', UP, Number.MIN_SAFE_INTEGER),
  ];
  const fresh = foldQuorum(
    'primary',
    votes,
    { quorum: 2, ttlMs: Number.MAX_SAFE_INTEGER, previous: UNKNOWN },
    0,
  );
  assert.equal(fresh.reason, REASON_QUORUM);
  assert.equal(fresh.verdict, UP);

  const stale = foldQuorum(
    'primary',
    votes,
    { quorum: 2, ttlMs: Number.MAX_SAFE_INTEGER, previous: UP },
    Number.MAX_SAFE_INTEGER,
  );
  assert.equal(stale.reason, REASON_EXPIRED);
  assert.equal(stale.verdict, UNKNOWN);
});

test('the documented usage sequence keeps its published verdicts', () => {
  const target = 'primary';
  const options = { quorum: 2, ttlMs: 1000, previous: UNKNOWN };
  const opened = foldQuorum(
    target,
    [vote('east', UP, 1000), vote('west', UP, 1100)],
    options,
    1100,
  );
  assert.equal(opened.verdict, UP);
  assert.equal(opened.reason, REASON_QUORUM);
  assert.equal(opened.flipped, true);
  assert.equal(opened.flipQuorum, 2);
  assert.deepEqual(opened.counts, counts(2, 0, 0));
  assert.deepEqual(opened.expired, []);

  const challenged = foldQuorum(
    target,
    [vote('east', UP, 1000), vote('west', DOWN, 1500)],
    { ...options, previous: opened.verdict },
    1500,
  );
  assert.equal(challenged.verdict, UP);
  assert.equal(challenged.reason, REASON_HELD);
  assert.equal(challenged.flipped, false);

  const lone = foldQuorum(
    target,
    [vote('west', DOWN, 1500)],
    { quorum: 1, ttlMs: 1000, previous: UP },
    1500,
  );
  assert.equal(lone.verdict, UNKNOWN);
  assert.equal(lone.reason, REASON_LONE_OBSERVER);
  assert.equal(lone.flipped, true);
  assert.equal(lone.flipQuorum, 2);

  const quiet = foldQuorum(
    target,
    [vote('east', UP, 1000), vote('west', UP, 1100)],
    { ...options, previous: UP },
    2200,
  );
  assert.equal(quiet.verdict, UNKNOWN);
  assert.equal(quiet.reason, REASON_EXPIRED);
  assert.equal(quiet.flipped, true);
  assert.equal(quiet.ballots.length, 0);
  assert.equal(quiet.expired.length, 2);

  const agreed = foldQuorum(
    target,
    [vote('west', DOWN, 1500), vote('nord', DOWN, 1600)],
    { quorum: 2, ttlMs: 1000, previous: UP },
    1600,
  );
  assert.equal(agreed.verdict, DOWN);
  assert.equal(agreed.reason, REASON_QUORUM);
  assert.equal(agreed.flipped, true);
  assert.deepEqual(agreed.counts, counts(0, 2, 0));
});
