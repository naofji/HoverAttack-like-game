import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { TILE_SIZE } from '../src/js/utils/Constants.js';

before(() => {
  const noopCtx = new Proxy({}, { get: () => () => {} });
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => noopCtx,
    }),
  };
});

function buildMap(MapClass, seed, missionLevel) {
  const game = { rng: new SeededRNG(seed) };
  return new MapClass(game, missionLevel);
}

test('Map creates a tileCacheCanvas sized to the full map', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const map = buildMap(Map, 42, 2);
  assert.ok(map.tileCacheCanvas, 'tileCacheCanvas should exist');
  assert.equal(map.tileCacheCanvas.width, map.width);
  assert.equal(map.tileCacheCanvas.height, map.height);
});

test('_renderAllToCache draws every non-empty block exactly once', async () => {
  const { Map, BLOCK_EMPTY, BLOCK_INDESTRUCTIBLE } = await import('../src/js/world/Map.js');
  const game = { rng: new SeededRNG(7) };

  const rockyCalls = [];
  const polishedCalls = [];
  const origRocky = Map.prototype._drawRockyBlock;
  const origPolished = Map.prototype._drawPolishedBlock;
  Map.prototype._drawRockyBlock = function (ctx, r, c, block) {
    rockyCalls.push(`${r},${c}`);
    return origRocky.call(this, ctx, r, c, block);
  };
  Map.prototype._drawPolishedBlock = function (ctx, x, y, S) {
    polishedCalls.push(`${x},${y}`);
    return origPolished.call(this, ctx, x, y, S);
  };

  try {
    const map = new Map(game, 1);

    let expectedRocky = 0;
    let expectedPolished = 0;
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        const block = map.grid[r][c];
        if (block === BLOCK_EMPTY) continue;
        if (block === BLOCK_INDESTRUCTIBLE) expectedPolished++;
        else expectedRocky++;
      }
    }

    assert.equal(rockyCalls.length, expectedRocky);
    assert.equal(polishedCalls.length, expectedPolished);
  } finally {
    Map.prototype._drawRockyBlock = origRocky;
    Map.prototype._drawPolishedBlock = origPolished;
  }
});

test('damageBlock invalidates the destroyed tile and its 8 neighbors in the cache', async () => {
  const { Map, BLOCK_EMPTY, BLOCK_INDESTRUCTIBLE } = await import('../src/js/world/Map.js');
  const game = { rng: new SeededRNG(3) };
  const map = new Map(game, 2);

  // 境界(BORDER_THICKNESS=2)や外周破壊済み領域を避け、内側の非空・非INDESTRUCTIBLEブロックを探す。
  let targetR = -1, targetC = -1;
  for (let r = 10; r < map.rows - 10 && targetR < 0; r++) {
    for (let c = 10; c < map.cols - 10; c++) {
      if (map.grid[r][c] !== BLOCK_EMPTY && map.grid[r][c] !== BLOCK_INDESTRUCTIBLE) {
        targetR = r;
        targetC = c;
        break;
      }
    }
  }
  assert.ok(targetR >= 0, 'test setup: no destructible block found in scan range');

  const rockyCalls = [];
  const polishedCalls = [];
  const origRocky = Map.prototype._drawRockyBlock;
  const origPolished = Map.prototype._drawPolishedBlock;
  Map.prototype._drawRockyBlock = function (ctx, r, c, block) {
    rockyCalls.push(`${r},${c}`);
    return origRocky.call(this, ctx, r, c, block);
  };
  Map.prototype._drawPolishedBlock = function (ctx, x, y, S) {
    polishedCalls.push(`${x},${y}`);
    return origPolished.call(this, ctx, x, y, S);
  };

  try {
    map.damageBlock(targetR, targetC, 9999);

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = targetR + dr;
        const c = targetC + dc;
        if (dr === 0 && dc === 0) continue; // 破壊された中心タイルは空洞になるため描画不要
        const block = map.grid[r][c];
        if (block === BLOCK_EMPTY) continue;
        if (block === BLOCK_INDESTRUCTIBLE) {
          assert.ok(
            polishedCalls.includes(`${c * TILE_SIZE},${r * TILE_SIZE}`),
            `expected _drawPolishedBlock to redraw neighbor (${r},${c})`
          );
        } else {
          assert.ok(
            rockyCalls.includes(`${r},${c}`),
            `expected _drawRockyBlock to redraw neighbor (${r},${c})`
          );
        }
      }
    }
  } finally {
    Map.prototype._drawRockyBlock = origRocky;
    Map.prototype._drawPolishedBlock = origPolished;
  }
});
