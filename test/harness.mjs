/*
 * The Foundry globals the pure logic touches, in one place, so no suite
 * stubs them itself and drifts.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const scripts = path.join(root, 'scripts');

/** Settings, in memory, keyed the way `game.settings` keys them. */
export const store = {};

/** Everything the code pushed at the user, so a test can assert on it. */
export const notes = [];

export function installGlobals() {
  Math.clamp = (v, min, max) => Math.min(Math.max(v, min), max);

  globalThis.foundry = {
    utils: {
      randomID: (() => {
        let counter = 0;
        return () => `id${(counter += 1)}`;
      })(),
    },
  };

  globalThis.game = {
    user: { id: 'gm1', isGM: true },
    settings: {
      get: (_module, key) => store[key],
      set: (_module, key, value) => {
        store[key] = structuredClone(value);
      },
    },
    i18n: {
      localize: (k) => k,
      format: (k, d) => `${k} ${JSON.stringify(d)}`,
      lang: 'en',
    },
  };

  const record = (kind) => (message) => notes.push(`${kind}:${message}`);
  globalThis.ui = {
    notifications: { info: record('info'), warn: record('warn'), error: record('error') },
  };
}

export function reset() {
  for (const key of Object.keys(store)) delete store[key];
  notes.length = 0;
}

/** A tiny assertion helper with the same shape the other suites use. */
export function makeCheck() {
  const state = { failed: 0, ran: 0 };
  const check = (label, actual, expected) => {
    state.ran += 1;
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) {
      state.failed = 1;
      console.error(
        `FAIL ${label}\n  got      ${JSON.stringify(actual)}\n  expected ${JSON.stringify(expected)}`,
      );
    } else console.log(`ok  ${label}`);
  };
  const done = (summary) => {
    if (state.failed) console.error('\nFAILED');
    else console.log(`\nok  ${summary} (${state.ran} checks)`);
    process.exit(state.failed);
  };
  return { check, done, state };
}

/** Import a module under `scripts/`, after the globals exist. */
export const load = (relative) => import(`file://${path.join(scripts, relative)}`);
