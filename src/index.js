export const UP = 'up';
export const DOWN = 'down';
export const UNKNOWN = 'unknown';

export const VOTE_VALUES = Object.freeze([UP, DOWN, UNKNOWN]);

export const REASON_QUORUM = 'quorum';
export const REASON_HELD = 'held';
export const REASON_LONE_OBSERVER = 'lone_observer';
export const REASON_INSUFFICIENT = 'insufficient';
export const REASON_EXPIRED = 'expired';
export const REASON_SPLIT = 'split';
export const REASON_EMPTY = 'empty';

export const REASONS = Object.freeze([
  REASON_QUORUM,
  REASON_HELD,
  REASON_LONE_OBSERVER,
  REASON_INSUFFICIENT,
  REASON_EXPIRED,
  REASON_SPLIT,
  REASON_EMPTY,
]);

export const MIN_FLIP_OBSERVERS = 2;
export const MAX_NAME_LENGTH = 256;
export const DEFAULT_QUORUM = 2;
export const DEFAULT_TTL_MS = 30000;
export const DEFAULT_PREVIOUS = UNKNOWN;

export const DEFAULTS = Object.freeze({
  quorum: DEFAULT_QUORUM,
  ttlMs: DEFAULT_TTL_MS,
  previous: DEFAULT_PREVIOUS,
});

const VOTE_KEYS = new Set(['observer', 'value', 'atMs']);
const OPTION_KEYS = new Set(['quorum', 'ttlMs', 'previous']);
const VALUE_SET = new Set(VOTE_VALUES);
const NAME_MESSAGE = 'a string of 1 to 256 characters without spaces or control characters';

export class QuorumVoteError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'QuorumVoteError';
    this.code = code;
  }
}

function invalid(code, message) {
  throw new QuorumVoteError(code, message);
}

function isPlainObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isVoteValue(value) {
  return typeof value === 'string' && VALUE_SET.has(value);
}

function isQuorum(value) {
  return Number.isSafeInteger(value) && value >= 1;
}

function isNonNegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isName(value) {
  if (typeof value !== 'string') {
    return false;
  }
  if (value.length < 1 || value.length > MAX_NAME_LENGTH) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) {
      return false;
    }
  }
  return !/\s/u.test(value);
}

function compareStrings(left, right) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function firstUnknown(object, allowed) {
  const names = [];
  let hasSymbol = false;
  for (const key of Reflect.ownKeys(object)) {
    if (typeof key === 'symbol') {
      hasSymbol = true;
      continue;
    }
    if (!allowed.has(key)) {
      names.push(key);
    }
  }
  names.sort(compareStrings);
  return { name: names[0], hasSymbol };
}

function readOptional(object, key, fallback, validate, code, message) {
  if (!Object.hasOwn(object, key)) {
    return fallback;
  }
  const value = object[key];
  if (value === undefined) {
    return fallback;
  }
  if (!validate(value)) {
    invalid(code, message);
  }
  return value;
}

function validateTarget(target) {
  if (!isName(target)) {
    invalid('invalid_target', `target must be ${NAME_MESSAGE}`);
  }
  return target;
}

function normalizeVote(vote, index) {
  if (!isPlainObject(vote)) {
    invalid('invalid_vote', `votes[${index}] must be a plain object`);
  }
  const unknown = firstUnknown(vote, VOTE_KEYS);
  if (unknown.name !== undefined) {
    invalid('unknown_vote_field', `votes[${index}] has unknown field "${unknown.name}"`);
  }
  if (unknown.hasSymbol) {
    invalid('invalid_vote', `votes[${index}] must not contain symbol keys`);
  }
  if (!isName(vote.observer)) {
    invalid('invalid_observer', `votes[${index}].observer must be ${NAME_MESSAGE}`);
  }
  if (!isVoteValue(vote.value)) {
    invalid('invalid_value', `votes[${index}].value must be "up", "down", or "unknown"`);
  }
  if (!Number.isSafeInteger(vote.atMs)) {
    invalid('invalid_at', `votes[${index}].atMs must be a safe integer`);
  }
  return {
    observer: vote.observer,
    value: vote.value,
    atMs: vote.atMs,
  };
}

function validateVotes(votes) {
  if (!Array.isArray(votes)) {
    invalid('invalid_votes', 'votes must be an array');
  }
  const normalized = [];
  for (let index = 0; index < votes.length; index += 1) {
    normalized.push(normalizeVote(votes[index], index));
  }
  return normalized;
}

function resolveOptions(options) {
  if (!isPlainObject(options)) {
    invalid('invalid_options', 'options must be a plain object');
  }
  const unknown = firstUnknown(options, OPTION_KEYS);
  if (unknown.name !== undefined) {
    invalid('unknown_option', `unknown option "${unknown.name}"`);
  }
  if (unknown.hasSymbol) {
    invalid('unknown_option', 'options must not contain symbol keys');
  }
  const quorum = readOptional(
    options,
    'quorum',
    DEFAULT_QUORUM,
    isQuorum,
    'invalid_quorum',
    'quorum must be a safe integer greater than or equal to 1',
  );
  const ttlMs = readOptional(
    options,
    'ttlMs',
    DEFAULT_TTL_MS,
    isNonNegativeSafeInteger,
    'invalid_ttl',
    'ttlMs must be a non-negative safe integer',
  );
  const previous = readOptional(
    options,
    'previous',
    DEFAULT_PREVIOUS,
    isVoteValue,
    'invalid_previous',
    'previous must be "up", "down", or "unknown"',
  );
  return { quorum, ttlMs, previous };
}

function validateNow(nowMs) {
  if (!Number.isSafeInteger(nowMs)) {
    invalid('invalid_now', 'nowMs must be a safe integer');
  }
}

function rejectFuture(ballots, nowMs) {
  for (let index = 0; index < ballots.length; index += 1) {
    if (ballots[index].atMs > nowMs) {
      invalid('vote_in_future', `votes[${index}].atMs must be less than or equal to nowMs`);
    }
  }
}

function dedupe(ballots) {
  const newest = new Map();
  const atValue = new Map();
  const conflicts = new Set();
  for (const ballot of ballots) {
    const key = `${ballot.observer}\u0000${ballot.atMs}`;
    const prior = atValue.get(key);
    if (prior === undefined) {
      atValue.set(key, ballot.value);
    } else if (prior !== ballot.value) {
      conflicts.add(ballot.observer);
    }
    const current = newest.get(ballot.observer);
    if (current === undefined || ballot.atMs > current.atMs) {
      newest.set(ballot.observer, ballot);
    }
  }
  if (conflicts.size > 0) {
    const names = [...conflicts];
    names.sort(compareStrings);
    invalid('conflicting_vote', `observer "${names[0]}" has conflicting votes at the same atMs`);
  }
  return [...newest.values()];
}

function isFresh(atMs, nowMs, ttlMs) {
  return BigInt(nowMs) - BigInt(atMs) <= BigInt(ttlMs);
}

function compareObserver(left, right) {
  return compareStrings(left.observer, right.observer);
}

function partition(ballots, nowMs, ttlMs) {
  const fresh = [];
  const stale = [];
  for (const ballot of ballots) {
    if (isFresh(ballot.atMs, nowMs, ttlMs)) {
      fresh.push(ballot);
    } else {
      stale.push(ballot);
    }
  }
  fresh.sort(compareObserver);
  stale.sort(compareObserver);
  return { fresh, stale };
}

function countBallots(ballots) {
  const counts = { up: 0, down: 0, unknown: 0 };
  for (const ballot of ballots) {
    if (ballot.value === UP) {
      counts.up += 1;
    } else if (ballot.value === DOWN) {
      counts.down += 1;
    } else {
      counts.unknown += 1;
    }
  }
  return counts;
}

function flipQuorumFor(quorum) {
  if (quorum > MIN_FLIP_OBSERVERS) {
    return quorum;
  }
  return MIN_FLIP_OBSERVERS;
}

function decide(counts, previous, quorum) {
  const flipQuorum = flipQuorumFor(quorum);
  const upCanFlip = counts.up >= flipQuorum;
  const downCanFlip = counts.down >= flipQuorum;
  if (upCanFlip && downCanFlip) {
    return { verdict: UNKNOWN, reason: REASON_SPLIT };
  }
  if (upCanFlip) {
    return { verdict: UP, reason: REASON_QUORUM };
  }
  if (downCanFlip) {
    return { verdict: DOWN, reason: REASON_QUORUM };
  }

  const loneUp = counts.up >= quorum && counts.up < MIN_FLIP_OBSERVERS;
  const loneDown = counts.down >= quorum && counts.down < MIN_FLIP_OBSERVERS;
  const sustained = (previous === UP && counts.up >= 1) || (previous === DOWN && counts.down >= 1);
  if (sustained) {
    const blocked = (loneUp && previous !== UP) || (loneDown && previous !== DOWN);
    if (blocked) {
      return { verdict: previous, reason: REASON_LONE_OBSERVER };
    }
    return { verdict: previous, reason: REASON_HELD };
  }
  if (loneUp || loneDown) {
    return { verdict: UNKNOWN, reason: REASON_LONE_OBSERVER };
  }
  return { verdict: UNKNOWN, reason: REASON_INSUFFICIENT };
}

function freezeBallot(ballot) {
  return Object.freeze({
    observer: ballot.observer,
    value: ballot.value,
    atMs: ballot.atMs,
  });
}

function freezeBallots(ballots) {
  const frozen = [];
  for (const ballot of ballots) {
    frozen.push(freezeBallot(ballot));
  }
  return Object.freeze(frozen);
}

export function foldQuorum(target, votes, options, nowMs) {
  const targetName = validateTarget(target);
  const normalized = validateVotes(votes);
  const resolved = resolveOptions(options);
  validateNow(nowMs);
  rejectFuture(normalized, nowMs);
  const parts = partition(dedupe(normalized), nowMs, resolved.ttlMs);
  const counts = countBallots(parts.fresh);
  let verdict = UNKNOWN;
  let reason = REASON_INSUFFICIENT;
  if (normalized.length === 0) {
    reason = REASON_EMPTY;
  } else if (parts.fresh.length === 0) {
    reason = REASON_EXPIRED;
  } else {
    const decision = decide(counts, resolved.previous, resolved.quorum);
    verdict = decision.verdict;
    reason = decision.reason;
  }
  return Object.freeze({
    target: targetName,
    verdict,
    previous: resolved.previous,
    flipped: verdict !== resolved.previous,
    reason,
    quorum: resolved.quorum,
    flipQuorum: flipQuorumFor(resolved.quorum),
    ttlMs: resolved.ttlMs,
    counts: Object.freeze({
      up: counts.up,
      down: counts.down,
      unknown: counts.unknown,
    }),
    ballots: freezeBallots(parts.fresh),
    expired: freezeBallots(parts.stale),
  });
}
