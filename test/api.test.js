import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_PREVIOUS,
  DEFAULT_QUORUM,
  DEFAULT_TTL_MS,
  DEFAULTS,
  DOWN,
  MAX_NAME_LENGTH,
  MIN_FLIP_OBSERVERS,
  REASON_EMPTY,
  REASON_EXPIRED,
  REASON_HELD,
  REASON_INSUFFICIENT,
  REASON_LONE_OBSERVER,
  REASON_QUORUM,
  REASON_SPLIT,
  REASONS,
  UNKNOWN,
  UP,
  VOTE_VALUES,
  QuorumVoteError,
  foldQuorum,
} from '../src/index.js';

test('constants publish the vote values, reasons, and defaults', () => {
  assert.deepEqual(VOTE_VALUES, [UP, DOWN, UNKNOWN]);
  assert.equal(UP, 'up');
  assert.equal(DOWN, 'down');
  assert.equal(UNKNOWN, 'unknown');
  assert.deepEqual(REASONS, [
    REASON_QUORUM,
    REASON_HELD,
    REASON_LONE_OBSERVER,
    REASON_INSUFFICIENT,
    REASON_EXPIRED,
    REASON_SPLIT,
    REASON_EMPTY,
  ]);
  assert.equal(new Set(REASONS).size, REASONS.length);
  assert.equal(MIN_FLIP_OBSERVERS, 2);
  assert.equal(MAX_NAME_LENGTH, 256);
  assert.equal(DEFAULT_QUORUM, 2);
  assert.equal(DEFAULT_TTL_MS, 30000);
  assert.equal(DEFAULT_PREVIOUS, UNKNOWN);
  assert.deepEqual(DEFAULTS, {
    quorum: DEFAULT_QUORUM,
    ttlMs: DEFAULT_TTL_MS,
    previous: DEFAULT_PREVIOUS,
  });
  assert.equal(Object.isFrozen(VOTE_VALUES), true);
  assert.equal(Object.isFrozen(REASONS), true);
  assert.equal(Object.isFrozen(DEFAULTS), true);
  assert.equal(foldQuorum.length, 4);
});

test('QuorumVoteError keeps its name and code', () => {
  const error = new QuorumVoteError('invalid_votes', 'votes must be an array');
  assert.equal(error.name, 'QuorumVoteError');
  assert.equal(error.code, 'invalid_votes');
  assert.equal(error.message, 'votes must be an array');
  assert.ok(error instanceof Error);
  assert.equal(typeof error.stack, 'string');
});

test('a result is frozen down to each ballot', () => {
  const result = foldQuorum(
    'primary',
    [
      { observer: 'west', value: UP, atMs: 4 },
      { observer: 'east', value: DOWN, atMs: 1 },
    ],
    { quorum: 2, ttlMs: 10, previous: UNKNOWN },
    5,
  );
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.counts), true);
  assert.equal(Object.isFrozen(result.ballots), true);
  assert.equal(Object.isFrozen(result.ballots[0]), true);
  assert.equal(Object.isFrozen(result.expired), true);
  assert.equal(Object.isFrozen(result.expired[0]), true);
  assert.throws(() => {
    result.verdict = DOWN;
  }, TypeError);
  assert.throws(() => {
    result.counts.up = 0;
  }, TypeError);
  assert.throws(() => {
    result.ballots.push({ observer: 'nord', value: UP, atMs: 5 });
  }, TypeError);
  assert.throws(() => {
    result.ballots[0].value = DOWN;
  }, TypeError);
  assert.equal(result.verdict, UNKNOWN);
  assert.deepEqual(
    result.ballots.map((ballot) => ballot.observer),
    ['east', 'west'],
  );
});

test('inputs and defaults stay unchanged across calls', () => {
  const votes = Object.freeze([
    Object.freeze({ observer: 'east', value: UP, atMs: 2 }),
    Object.freeze({ observer: 'west', value: UP, atMs: 2 }),
  ]);
  const options = Object.freeze({ quorum: 2, ttlMs: 5, previous: UNKNOWN });
  const votesBefore = structuredClone(votes);
  const optionsBefore = structuredClone(options);
  const defaultsBefore = structuredClone(DEFAULTS);
  const globalBefore = Object.getOwnPropertyNames(globalThis);
  const first = foldQuorum('primary', votes, options, 2);
  const second = foldQuorum('backup', votes, options, 2);
  assert.deepEqual(votes, votesBefore);
  assert.deepEqual(options, optionsBefore);
  assert.deepEqual(DEFAULTS, defaultsBefore);
  assert.deepEqual(Object.getOwnPropertyNames(globalThis), globalBefore);
  assert.equal(first.target, 'primary');
  assert.equal(second.target, 'backup');
  assert.equal(first.verdict, UP);
  assert.equal(second.verdict, UP);
  assert.notEqual(first, second);
  assert.notEqual(first.ballots[0], votes[0]);
  const encoded = JSON.parse(JSON.stringify(first));
  assert.equal(encoded.verdict, UP);
  assert.equal(encoded.counts.up, 2);
});
