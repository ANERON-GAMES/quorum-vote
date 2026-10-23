import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { UP, UNKNOWN, foldQuorum } from '../src/index.js';

const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');

test('the implementation has no imports, comments, clock, timer, or host binding', () => {
  const banned = [
    /\bDate\b/,
    /\bsetTimeout\b/,
    /\bsetInterval\b/,
    /\bsetImmediate\b/,
    /\bprocess\b/,
    /\bfetch\b/,
    /\bconsole\b/,
    /\brequire\b/,
    /\bglobalThis\b/,
    /\bXMLHttpRequest\b/,
    /\bqueueMicrotask\b/,
    /\beval\b/,
    /\bFunction\b/,
    /:\/\//,
    /\/\//,
    /\/\*/,
  ];
  for (const pattern of banned) {
    assert.equal(pattern.test(source), false, pattern.source);
  }
  assert.equal(/^\s*import\s/m.test(source), false);
  assert.equal(/require\s*\(/.test(source), false);
});

test('a throwing clock and timer stay unused', () => {
  const now = Date.now;
  const timer = globalThis.setTimeout;
  Date.now = () => {
    throw new Error('clock');
  };
  globalThis.setTimeout = () => {
    throw new Error('timer');
  };
  try {
    const result = foldQuorum(
      'primary',
      [
        { observer: 'east', value: UP, atMs: 1 },
        { observer: 'west', value: UP, atMs: 1 },
      ],
      { quorum: 2, ttlMs: 5, previous: UNKNOWN },
      1,
    );
    assert.equal(result.verdict, UP);
  } finally {
    Date.now = now;
    globalThis.setTimeout = timer;
  }
});

test('package metadata, license, and readme stay free of endpoints', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const license = readFileSync(new URL('../LICENSE', import.meta.url), 'utf8');
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

  assert.equal(packageJson.name, '@aneron/quorum-vote');
  assert.equal(packageJson.license, 'MIT');
  assert.equal(packageJson.author, 'Vadim Gubin');
  assert.equal(packageJson.type, 'module');
  assert.equal(packageJson.sideEffects, false);
  assert.equal(packageJson.engines.node, '>=20');
  assert.equal(packageJson.repository, undefined);
  assert.equal(packageJson.dependencies, undefined);
  assert.equal(license.startsWith('MIT License\n\nCopyright (c) 2026 Vadim Gubin\n'), true);

  for (const heading of [
    '## Purpose',
    '## Install',
    '## Usage',
    '## API',
    '## Design',
    '## License',
  ]) {
    assert.equal(readme.includes(heading), true, heading);
  }
  assert.equal(readme.includes('://'), false);
  assert.equal(/\b\d{1,3}(?:\.\d{1,3}){3}\b/.test(readme), false);
  assert.equal(/\b\d{1,3}(?:\.\d{1,3}){3}\b/.test(source), false);

  assert.match(workflow, /node-version:/);
  assert.match(workflow, /['"]20['"]/);
  assert.match(workflow, /['"]22['"]/);
  assert.match(workflow, /npm run lint/);
  assert.match(workflow, /npm run format:check/);
  assert.match(workflow, /npm test/);
});
