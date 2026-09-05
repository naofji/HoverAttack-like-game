import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';

before(() => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }),
  };
});

test('Map は面ごとの terrain を持つ', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const cave = new Map({ rng: new SeededRNG(1) }, 0);
  const fort = new Map({ rng: new SeededRNG(1) }, 6);
  assert.equal(cave.envTerrain, 'cave');
  assert.equal(fort.envTerrain, 'fortress');
  // debugStartMission で面数を超えた値が来るので剰余で丸める（envKind と同じ）
  const wrapped = new Map({ rng: new SeededRNG(1) }, 13);
  assert.equal(wrapped.envTerrain, 'fortress');
});
