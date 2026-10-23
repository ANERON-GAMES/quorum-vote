import assert from 'node:assert/strict';
import { QuorumVoteError } from '../src/index.js';

export function assertQuorumError(run, code, message) {
  assert.throws(run, (error) => {
    assert.ok(error instanceof Error);
    assert.ok(error instanceof QuorumVoteError);
    assert.equal(error.name, 'QuorumVoteError');
    assert.equal(error.code, code);
    assert.equal(error.message, message);
    return true;
  });
}

export function vote(observer, value, atMs) {
  return { observer, value, atMs };
}
