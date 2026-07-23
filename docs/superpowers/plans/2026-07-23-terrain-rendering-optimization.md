# 地形描画高速化（タイルキャッシュ） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Map.draw()` が毎フレーム行っている全ブロックのベクター描画（`clip()`/`fill()`/`stroke()`多数）を、マップ全体サイズのキャッシュ用 `<canvas>` への1回限りの事前描画＋差分更新に置き換え、毎フレームは可視範囲の `drawImage()` 転送のみにする。

**Architecture:** `Map` にプレーンな `<canvas>`（`document.createElement('canvas')`、DOM未追加、`_generateMiniMap()`と同じパターン）を `tileCacheCanvas` として持たせ、マップ生成完了時に全ブロックを1回だけ現行の `_drawRockyBlock`/`_drawPolishedBlock` で描き込む。破壊は `damageBlock()` 一本に集約されているため、そこにフックして破壊タイル＋周囲8マスだけをキャッシュ上で再描画する。`draw(ctx)` は可視矩形ぶんの `drawImage` 転送のみに置き換える。

**Tech Stack:** Vanilla JS (ES Modules), HTML5 Canvas 2D, `node --test` + `node:assert/strict`

## Global Constraints

- ランダム性の完全保持: タイル固有のシード計算 (`seed = (r * 7919 + c * 104729) | 0`、`_drawRockyBlock`内) を変更しないこと。既存の `_drawRockyBlock`/`_drawPolishedBlock` の描画ロジック自体には手を入れず、呼び出し先を変えるだけにする。
- `OffscreenCanvas` の機能検出・フォールバック分岐は使わない。既存の `_generateMiniMap()` と同様、常に `document.createElement('canvas')` を使う。
- 既存テストはすべてグリーンのまま維持する (`npm test`)。
- 破壊時の見た目・60fps維持の実機確認はユーザーが行う。エージェントはブラウザ自動化を起動しない。

---

### Task 1: `tileCacheCanvas` の追加とマップ生成時の全ブロック事前描画

**Files:**
- Modify: `src/js/world/Map.js`
- Test: `tests/map-render-cache.test.js` (新規作成)

**Interfaces:**
- Produces: `this.tileCacheCanvas`, `this.tileCacheCtx`, `_initTileCache()`, `_renderAllToCache()`

- [ ] **Step 1: 失敗するテストを書く**

`tests/map-render-cache.test.js` を新規作成する。`tests/MapDeterminism.test.js` と同じ DOM スタブパターンを使う:

```js
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
```

`BLOCK_EMPTY` と `BLOCK_INDESTRUCTIBLE` は `src/js/world/Map.js` からは現状 export されていない（`Constants.js` からの再エクスポートもされていない）。このテストのために `Map.js` の import 文にある `BLOCK_EMPTY, BLOCK_INDESTRUCTIBLE` を、ファイル末尾で re-export する:

```js
export { BLOCK_EMPTY, BLOCK_INDESTRUCTIBLE } from '../utils/Constants.js';
```

これを `src/js/world/Map.js` の末尾（`export class Map { ... }` の外）に追加する。

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/map-render-cache.test.js`
Expected: FAIL（`tileCacheCanvas` が undefined、または `BLOCK_EMPTY`/`BLOCK_INDESTRUCTIBLE` の re-export がなく import エラー）

- [ ] **Step 3: `tileCacheCanvas` 初期化と全ブロック事前描画を実装**

`src/js/world/Map.js` の末尾の `export class Map { ... }` に、`export { BLOCK_EMPTY, BLOCK_INDESTRUCTIBLE } from '../utils/Constants.js';` を追加する（ファイル最終行）。

`_generate()` メソッド内、`this._generateMiniMap();` の直後（184行目付近、`_generate()` メソッドの末尾）に以下を追加する:

```js
        // Step 11: Generate off-screen mini-map
        this._generateMiniMap();
        this._initTileCache();
    }
```

`_generateMiniMap()` メソッドの直前（805行目あたり）に、新規メソッドを2つ追加する:

```js
    // ------------------------------------------
    // Tile Render Cache
    // ------------------------------------------

    _initTileCache() {
        this.tileCacheCanvas = document.createElement('canvas');
        this.tileCacheCanvas.width = this.width;
        this.tileCacheCanvas.height = this.height;
        this.tileCacheCtx = this.tileCacheCanvas.getContext('2d');
        this._renderAllToCache();
    }

    _renderAllToCache() {
        const S = TILE_SIZE;
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const block = this.grid[r][c];
                if (block === BLOCK_EMPTY) continue;
                if (block === BLOCK_INDESTRUCTIBLE) {
                    this._drawPolishedBlock(this.tileCacheCtx, c * S, r * S, S);
                } else {
                    this._drawRockyBlock(this.tileCacheCtx, r, c, block);
                }
            }
        }
    }
```

- [ ] **Step 4: テスト実行とパス確認**

Run: `node --test tests/map-render-cache.test.js`
Expected: PASS

- [ ] **Step 5: 全テスト実行**

Run: `npm test`
Expected: 全テスト PASS（`MapDeterminism.test.js` を含む既存テストが引き続きグリーン）

- [ ] **Step 6: コミット**

```bash
git add src/js/world/Map.js tests/map-render-cache.test.js
git commit -m "feat: Mapにタイル描画キャッシュcanvasと全ブロック事前描画を追加"
```

---

### Task 2: `damageBlock` での差分キャッシュ無効化 (`invalidateTileRegion`)

**Files:**
- Modify: `src/js/world/Map.js`
- Test: `tests/map-render-cache.test.js`

**Interfaces:**
- Consumes: Task 1 の `this.tileCacheCtx`, `_drawRockyBlock`, `_drawPolishedBlock`
- Produces: `invalidateTileRegion(centerR, centerC)`

- [ ] **Step 1: 差分更新のテストを追加**

`tests/map-render-cache.test.js` に追記する:

```js
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
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/map-render-cache.test.js`
Expected: FAIL（`invalidateTileRegion` 未実装のため `damageBlock` はキャッシュを更新せず、再描画呼び出しが発生しない）

- [ ] **Step 3: `invalidateTileRegion` を実装し `damageBlock` から呼び出す**

`src/js/world/Map.js` の `damageBlock` (771行目付近) を次のように変更する:

```js
    /** Damage a single block. Returns true if destroyed. */
    damageBlock(r, c, damage = 1) {
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
        const block = this.grid[r][c];
        if (block === BLOCK_EMPTY || block === BLOCK_INDESTRUCTIBLE) return false;

        this.blockHP[r][c] -= damage;
        if (this.blockHP[r][c] <= 0) {
            this.grid[r][c] = BLOCK_EMPTY;
            this.blockHP[r][c] = 0;
            this.invalidateTileRegion(r, c);
            return true;
        }
        return false;
    }
```

`invalidateTileRegion` を `damageBlock` の直後に追加する:

```js
    /** Redraw the destroyed tile and its 8 neighbors in the tile cache
     *  (neighbors' exposure flags/notches depend on this tile's state). */
    invalidateTileRegion(centerR, centerC) {
        const S = TILE_SIZE;
        const startR = Math.max(0, centerR - 1);
        const endR = Math.min(this.rows - 1, centerR + 1);
        const startC = Math.max(0, centerC - 1);
        const endC = Math.min(this.cols - 1, centerC + 1);

        for (let r = startR; r <= endR; r++) {
            for (let c = startC; c <= endC; c++) {
                this.tileCacheCtx.clearRect(c * S, r * S, S, S);
                const block = this.grid[r][c];
                if (block === BLOCK_EMPTY) continue;
                if (block === BLOCK_INDESTRUCTIBLE) {
                    this._drawPolishedBlock(this.tileCacheCtx, c * S, r * S, S);
                } else {
                    this._drawRockyBlock(this.tileCacheCtx, r, c, block);
                }
            }
        }
    }
```

- [ ] **Step 4: テスト実行とパス確認**

Run: `node --test tests/map-render-cache.test.js`
Expected: PASS

- [ ] **Step 5: 全テスト実行**

Run: `npm test`
Expected: 全テスト PASS

- [ ] **Step 6: コミット**

```bash
git add src/js/world/Map.js tests/map-render-cache.test.js
git commit -m "feat: damageBlock時にタイルキャッシュの周囲9マスを差分再描画"
```

---

### Task 3: `draw(ctx)` をキャッシュからの `drawImage` 転送に切り替え

**Files:**
- Modify: `src/js/world/Map.js`
- Test: `npm test`（既存の全ユニットテスト）+ ユーザーによる実機確認

**Interfaces:**
- Consumes: Task 1/2 の `this.tileCacheCanvas`

- [ ] **Step 1: `draw(ctx)` を書き換える**

`src/js/world/Map.js` の `draw(ctx)` (858行目付近) を次のように変更する。可視範囲の計算はそのまま維持し、ループでの個別ブロック描画を `drawImage` 1回に置き換える:

```js
    draw(ctx) {
        const cam = this.game.camera;
        const startCol = Math.max(0, Math.floor(cam.x / TILE_SIZE));
        const endCol = Math.min(this.cols, Math.ceil((cam.x + this.game.canvas.width) / TILE_SIZE));
        const startRow = Math.max(0, Math.floor(cam.y / TILE_SIZE));
        const endRow = Math.min(this.rows, Math.ceil((cam.y + this.game.canvas.height) / TILE_SIZE));

        const S = TILE_SIZE;
        const sx = startCol * S;
        const sy = startRow * S;
        const sWidth = (endCol - startCol) * S;
        const sHeight = (endRow - startRow) * S;
        if (sWidth <= 0 || sHeight <= 0) return;

        ctx.drawImage(
            this.tileCacheCanvas,
            sx, sy, sWidth, sHeight,
            sx, sy, sWidth, sHeight
        );
    }
```

`_drawRockyBlock` と `_drawPolishedBlock` 自体はそのまま残す（`_renderAllToCache` と `invalidateTileRegion` が引き続き使用するため、削除しないこと）。

- [ ] **Step 2: 全テスト実行**

Run: `npm test`
Expected: 全ユニットテスト PASS（`tests/map-render-cache.test.js` を含む）

- [ ] **Step 3: コミット**

```bash
git add src/js/world/Map.js
git commit -m "feat: Map.drawをタイルキャッシュからのdrawImage転送に切り替え"
```

- [ ] **Step 4: 動作・パフォーマンス手動確認（ユーザー実施）**

ゲームを起動し、以下をユーザーが確認する:
- ブロックの見た目（岩肌・ひび割れ・面取り・indestructibleの磨かれた見た目）が変更前と変わっていないこと。
- ブロックを破壊した際、破壊箇所とその周囲の見た目が正しく更新され、崩れやジッターが出ないこと。
- 非力なPC環境等で 60fps 付近を維持できること。
