# 3面の町並み 段1（町を置いて描く）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3面の床・壁・天井に、日干し煉瓦の塔（A）と坑道の小屋（C）の町並みを生成して描く（まだ壊れない）。

**Architecture:** 建物は「部品（四角）の一覧」として組み立てる（`adobe.js` / `mining.js`）。そこから 4px 角のかけらの表と支えを導き（`chunks.js`）、1棟1枚の canvas に焼く（`Town.js`）。置き場所は地形の grid から純関数で探す（`placement.js`）。並べるのは `generate.js` で、派生乱数だけを使う。Map が `map.town` として持ち、`main._drawWorld` が遠景と地形のあいだに描く。

**Tech Stack:** バニラ ES modules、canvas 2D（`fillRect` だけ）、`node --test`。

**Spec:** `docs/superpowers/specs/2026-10-11-stage3-town-design.md`

**範囲:** spec の「作る順番」の **段1だけ**。欠け・支えの崩れ・火・爆発物・音（段2〜4）は、段1を実機で見てもらったあとに別の計画で書く。ただし段2以降が読むデータ（かけらの表の材料・厚い壁の印・焦げの印・支え）は、ここで形を決めて作る。

## Global Constraints

- `git add -A` / `git add .` は使わない。変更したファイルを明示して add する
- `src/js/main.js` にはユーザーの未コミットの `debugStartMission: 2` がある。**コミットに入れない・消さない。** `main.js` に対して `git checkout` / `git restore` / `git stash` / `git reset` を打たない（Task 8 にステージの手順を書いてある）
- コメントは日本語で「なぜそうしたか」を書く。数値には根拠を残す
- ゲームバランス・生成の数値は `Constants.js`（`TOWN_*`）。建物の形と色（描画専用のパラメータ）だけは各ファイルのモジュールスコープに置く
- 町の生成は `game.rng` を**消費しない**。乱数は `new SeededRNG((this.game.rng.state ^ 0x70E4E5) >>> 0)` の派生ストリームだけを使う
- 絵は `fillRect` だけで描く（細る塔も 4px の段）
- 建物の壁の色（`TOWN_BODY_COLORS`）の輝度は、遠景の rockLight（38.2）以上、地形の岩の 0.85 倍（114.7）以下。細かい描き込みの色（`TOWN_DETAIL_COLORS` と影色）は、遠景の空洞（13.1）以上、114.7 以下。輝度は `utils/color.js` の `luminance`
- 窓の灯りは、くすんだ琥珀色の四角にする（弾の `#FFDD33` / `#FFCC00` の丸と見分けるため）
- 基地の部屋（`_reservedRects()[1]`）には置かない。開始の部屋には置く
- 建物の一番上は、天井から 2 タイル（`TOWN_CEILING_CLEARANCE`）以上離す
- 天井までの空きが 12 タイル以上なら A が 8割、5 タイル以下なら A が 1割で、そのあいだは線形に補間する
- テストは `npm test`（`node --test`）。ソース文字列を grep するテストは書かない。テストを書いたら、わざと壊して赤くなることを確かめる

## Review Focus

1. **天井がぎりぎりの区間**（空きが `TOWN_MIN_HEADROOM` ちょうど、天井が途中で下がる区間）で、建物が天井から 2 タイルの空きを割らないこと。区間の空きは最小値で測る。Task 5 のテスト「床の建物の上 2 タイルは空いている」が、実マップ 5 週ぶんで縛る
2. **面の番号が7を超える**（`debugStartMission` で 9 など）とき。3面と同じく剰余で町が出て、1面には出ない。Task 7 のテストで縛る
3. **基地の部屋に一部だけ掛かる建物**も置かないこと。外接矩形のタイル範囲で判定する。Task 5 のテストで縛る
4. **画面の縁をまたぐ建物**が欠けて消えないこと（描画を間引く判定の境界のずれ）。Task 6 のテストで縛る
5. **町を作ったあとの `game.rng`**。このあと SpawnManager が同じ乱数を使うので、1つでも余分に消費すると敵の構成が変わる。Task 7 のテストで、町を無効化したビルドと乱数の状態を比べて縛る

---

## ファイル構成

| ファイル | 役割 | 作る Task |
|---|---|---|
| `src/js/utils/Constants.js` | `STAGE_ENVIRONMENTS` の3面に `props: 'town'`、`TOWN_*` の数値 | 1 |
| `src/js/world/town/chunks.js` | かけらの印（材料・厚い壁・焦げ）、部品→かけらの表、支え | 1 |
| `src/js/world/town/shapes.js` | 部品を積む小道具（`rect` / `step4` / `pick` / `mirrorParts` / `normalizeUp` / `paintParts`） | 1 |
| `src/js/world/town/palette.js` | 建物の色と影色 | 1 |
| `src/js/world/town/placement.js` | 床・壁・天井の候補を grid から探す | 2 |
| `src/js/world/town/adobe.js` | A: 塔・崖の家・吊り橋 | 3 |
| `src/js/world/town/mining.js` | C: 小屋（地面・高床・積み重ね）・足場の小屋・吊り小屋・ランタン | 4 |
| `src/js/world/town/generate.js` | 置き場所に建物を並べる。塔どうしの橋 | 5 |
| `src/js/world/town/Town.js` | 建物の canvas とかけらの表を持ち、画面内だけ描く | 6 |
| `src/js/world/Map.js` | `this.town` を作る | 7 |
| `src/js/main.js` | `_drawWorld` で遠景と地形のあいだに描く | 8 |
| `tools/lib/pixel-canvas.mjs` / `tools/render-town-scene.mjs` | 町を PNG に書き出す・数を数える | 9 |

---

### Task 1: かけらの表・部品の小道具・色・定数

**Files:**
- Modify: `src/js/utils/Constants.js`（`STAGE_ENVIRONMENTS` の3面の行。末尾に町の節）
- Create: `src/js/world/town/chunks.js`
- Create: `src/js/world/town/shapes.js`
- Create: `src/js/world/town/palette.js`
- Test: `tests/town-chunks.test.js`、`tests/town-palette.test.js`

**Interfaces:**
- Produces:
  - `chunks.js`: `CHUNK`(=4), `MAT_NONE`(0), `MAT_ADOBE`(1), `MAT_WOOD`(2), `MAT_METAL`(3), `MAT_EXPLOSIVE`(4), `MAT_MASK`(0x07), `SOLID`(0x10), `CHARRED`(0x20)
  - `rasterizeParts(parts, w, h) → { cells: Uint8Array, cw, ch }`
  - `computeAnchors(cells, cw, ch, x, y, isSolidTile(r, c) → bool) → Array<{ i, r, c }>`
  - 部品の形: `{ x, y, w, h, color: string|null, mat: number, solid: boolean }`（ローカル px。`mat` が 0 の部品は描くだけでかけらにならない）
  - `shapes.js`: `pick(rng, arr)`, `step4(rng, lo, hi) → 4の倍数`, `rect(parts, x, y, w, h, color, mat = MAT_NONE, solid = false)`, `mirrorParts(parts, w)`, `normalizeUp(parts) → { parts, h }`, `paintParts(ctx, parts)`
  - `palette.js`: `TOWN_BODY_COLORS = { adobe[], wash[], wood[], rust[], metal[] }`, `TOWN_DETAIL_COLORS = { beam, rope, winDark, winLit, lantern }`, `shade(hex)`

- [ ] **Step 1: 失敗するテストを書く（かけら）**

`tests/town-chunks.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    CHUNK, MAT_ADOBE, MAT_WOOD, SOLID, rasterizeParts, computeAnchors,
} from '../src/js/world/town/chunks.js';
import { normalizeUp, mirrorParts, step4 } from '../src/js/world/town/shapes.js';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';

test('かけらは 4px 角', () => {
    assert.equal(CHUNK, 4);
});

test('部品の中にかけらの中心が入ったかけらだけが埋まる。材料と厚い壁の印が付く', () => {
    const parts = [{ x: 0, y: 0, w: 8, h: 4, color: '#000000', mat: MAT_ADOBE, solid: true }];
    const { cells, cw, ch } = rasterizeParts(parts, 8, 8);
    assert.equal(cw, 2);
    assert.equal(ch, 2);
    assert.deepEqual(Array.from(cells), [MAT_ADOBE | SOLID, MAT_ADOBE | SOLID, 0, 0]);
});

test('後の部品が前の部品を上書きする', () => {
    const parts = [
        { x: 0, y: 0, w: 8, h: 4, color: '#000000', mat: MAT_ADOBE, solid: true },
        { x: 4, y: 0, w: 4, h: 4, color: null, mat: MAT_WOOD, solid: false },
    ];
    const { cells } = rasterizeParts(parts, 8, 4);
    assert.deepEqual(Array.from(cells), [MAT_ADOBE | SOLID, MAT_WOOD]);
});

test('材料の無い部品（描くだけ）はかけらにならない', () => {
    const parts = [{ x: 0, y: 0, w: 8, h: 8, color: '#000000', mat: 0, solid: false }];
    const { cells } = rasterizeParts(parts, 8, 8);
    assert.deepEqual(Array.from(cells), [0, 0, 0, 0]);
});

test('中心(2px)を含む細い部品は埋まり、含まない部品は埋まらない', () => {
    const hit = rasterizeParts([{ x: 1, y: 0, w: 2, h: 4, color: null, mat: MAT_WOOD, solid: false }], 8, 4);
    assert.equal(hit.cells[0], MAT_WOOD);
    const miss = rasterizeParts([{ x: 3, y: 0, w: 2, h: 4, color: null, mat: MAT_WOOD, solid: false }], 8, 4);
    assert.deepEqual(Array.from(miss.cells), [0, 0]);
});

test('支え: 中心が岩のタイルに入っているかけらが、そのタイルに支えられる', () => {
    // 建物は (0, 12) に 8x8。下の段のかけらの中心は y=18 → タイル行 1
    const parts = [{ x: 0, y: 0, w: 8, h: 8, color: null, mat: MAT_ADOBE, solid: true }];
    const { cells, cw, ch } = rasterizeParts(parts, 8, 8);
    const anchors = computeAnchors(cells, cw, ch, 0, 12, (r) => r === 1);
    assert.deepEqual(anchors, [{ i: 2, r: 1, c: 0 }, { i: 3, r: 1, c: 0 }]);
});

test('normalizeUp は上へ積んだ部品（y が負）を 0 から始まるように下げる', () => {
    const { parts, h } = normalizeUp([
        { x: 0, y: -12, w: 4, h: 12, color: null, mat: 0, solid: false },
        { x: 0, y: 0, w: 4, h: 2, color: null, mat: 0, solid: false },
    ]);
    assert.equal(h, 14);
    assert.equal(parts[0].y, 0);
    assert.equal(parts[1].y, 12);
});

test('mirrorParts は左右を反転する', () => {
    const [p] = mirrorParts([{ x: 2, y: 0, w: 4, h: 4, color: null, mat: 0, solid: false }], 20);
    assert.equal(p.x, 14);
});

test('step4 は両端を含む 4 の倍数を返す', () => {
    const rng = new SeededRNG(1);
    const seen = new Set();
    for (let i = 0; i < 200; i++) seen.add(step4(rng, 16, 28));
    assert.deepEqual([...seen].sort((a, b) => a - b), [16, 20, 24, 28]);
    assert.equal(step4(rng, 16, 10), 16, 'hi < lo なら lo');
});
```

- [ ] **Step 2: 失敗するテストを書く（色）**

`tests/town-palette.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOWN_BODY_COLORS, TOWN_DETAIL_COLORS, shade } from '../src/js/world/town/palette.js';
import { backdropColors } from '../src/js/world/CaveBackdrop.js';
import { STAGE_PALETTES } from '../src/js/utils/Constants.js';
import { luminance } from '../src/js/utils/color.js';

// 町は「遠景より手前・地形より奥」の層に描く。壁が遠景より暗いと穴に見え、
// 地形の岩より明るいと岩と競合して足場を読み違える（遠景の階調テストと同じ考え方）
const FILL = STAGE_PALETTES[2].fill;
const back = backdropColors(FILL, 'cave');
const MAX = luminance(FILL) * 0.85;

test('壁の色は遠景の rockLight 以上、地形の岩の 0.85 倍以下', () => {
    for (const [name, list] of Object.entries(TOWN_BODY_COLORS)) {
        for (const hex of list) {
            const l = luminance(hex);
            assert.ok(l >= luminance(back.rockLight), `${name} ${hex} が暗すぎる (${l.toFixed(1)})`);
            assert.ok(l <= MAX, `${name} ${hex} が明るすぎる (${l.toFixed(1)} > ${MAX.toFixed(1)})`);
        }
    }
});

test('細かい描き込みと影色は、遠景の空洞以上・地形の岩の 0.85 倍以下', () => {
    const all = [
        ...Object.values(TOWN_DETAIL_COLORS),
        ...Object.values(TOWN_BODY_COLORS).flat().map(shade),
    ];
    for (const hex of all) {
        const l = luminance(hex);
        assert.ok(l >= luminance(back.voidColor), `${hex} が空洞より暗い (${l.toFixed(1)})`);
        assert.ok(l <= MAX, `${hex} が明るすぎる (${l.toFixed(1)})`);
    }
});

test('窓の灯りは弾の黄色より十分暗い', () => {
    // 弾は #FFDD33 / #FFCC00。灯りは輝度の上限で暗い琥珀にしてあるので、
    // 同じ色相でも明るさで見分けられる。ここでは輝度の差を縛る
    assert.ok(luminance('#FFCC00') - luminance(TOWN_DETAIL_COLORS.winLit) > 60);
});
```

- [ ] **Step 3: テストが落ちることを確かめる**

Run: `npm test -- tests/town-chunks.test.js tests/town-palette.test.js`
Expected: FAIL（`Cannot find module '.../town/chunks.js'` など）

- [ ] **Step 4: 定数を足す**

`src/js/utils/Constants.js` の `STAGE_ENVIRONMENTS` の3面の行を次に変える:

```js
    { kind: 'none',  backdrop: 'cave',    terrain: 'cave', props: 'town' }, // 3: 洞窟の町（壊せる町並み）
```

その表のすぐ上のコメントに1行足す:

```js
// props = 地形の上に置く飾り（'town' は3面の壊せる町並み。設計:
//  docs/superpowers/specs/2026-10-11-stage3-town-design.md）。無ければ置かない。
```

ファイル末尾に足す:

```js
// --- 3面の町並み（props: 'town'）---
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md
// 段1（置いて描く）の数値。初期値で、実機で見て詰める。
// かけらの大きさは地形の一番細かい描き込み（4px）に揃える。
export const TOWN_CHUNK = 4;
// 床から天井までの空きがこれ未満の区間には建てない（タイル）。小屋の最小の高さ 24px に
// 天井との空き TOWN_CEILING_CLEARANCE を足すと 3.5 タイル要る
export const TOWN_MIN_HEADROOM = 4;
// 建物の一番上と天井のあいだに必ず空けるタイル数。天井にくっついて見えないように
export const TOWN_CEILING_CLEARANCE = 2;
// 土台を床の岩に埋める深さ（px）。町は地形の奥に描くので、埋めた分は岩の縁に隠れて
// 「建っている」に見える。浮いて見える隙間を作らないためのもの
export const TOWN_FOUNDATION_SINK = 4;
// 床の区間を左から歩くとき、そこに建てる確率。外れたら空き地にする。
// 面全体にまんべんなく、ただし詰まりすぎて1枚の壁に見えないように
export const TOWN_FLOOR_FILL = 0.75;
// 日干し煉瓦（A）の割合は、天井までの空きで決める（広い所は A、狭い所は坑道の小屋 C）
export const TOWN_ADOBE_HEADROOM_WIDE = 12;
export const TOWN_ADOBE_SHARE_WIDE = 0.8;
export const TOWN_ADOBE_HEADROOM_NARROW = 5;
export const TOWN_ADOBE_SHARE_NARROW = 0.1;
// 隣り合う塔の上の階を橋でつなぐ確率（シバームの塔は上の階どうしを橋や綱で結ぶ）
export const TOWN_TOWER_BRIDGE_CHANCE = 0.4;
// 壁に張り付く家。壁が縦にこれだけ続き、前にこれだけの空きがあるところに置く（タイル）
export const TOWN_WALL_MIN_RUN = 4;
export const TOWN_WALL_MIN_REACH = 4;
export const TOWN_WALL_SPACING = 8;        // 壁の長さこれごとに1軒の候補
export const TOWN_WALL_HOUSE_CHANCE = 0.5; // 候補ごとに建てる確率
// 天井から吊るもの。天井がこれだけ続き、下にこれだけの空きがあるところに吊る（タイル）
export const TOWN_CEIL_MIN_RUN = 6;
export const TOWN_CEIL_MIN_DROP = 8;
// 吊るしたものの下に残す空き（タイル）。自機（1.5タイル）が下をくぐれる高さ＋余裕
export const TOWN_CEIL_KEEP_BELOW = 4;
```

- [ ] **Step 5: `chunks.js` を書く**

`src/js/world/town/chunks.js`:

```js
// ============================================
// chunks - 建物を 4px 角の「かけら」の表として持つ
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md（2章）
// 建物の絵は部品（四角）の一覧から描き、壊れ方はこの表で扱う。
// 段2の欠け・支えの崩れ、段3の火はこの表だけを読み書きする。
// 1バイトに「材料（下位3ビット）」「厚い壁＝弾を止める」「焦げ」を詰める。

import { TOWN_CHUNK, TILE_SIZE } from '../../utils/Constants.js';

export const CHUNK = TOWN_CHUNK;
const HALF = CHUNK / 2;

export const MAT_NONE = 0;
export const MAT_ADOBE = 1;     // 日干し煉瓦の壁（燃えにくい）
export const MAT_WOOD = 2;      // 板・梁・綱（燃えやすい）
export const MAT_METAL = 3;     // トタン・配管・ランタンの枠（燃えない）
export const MAT_EXPLOSIVE = 4; // ドラム缶・ダイナマイト箱（段3b）
export const MAT_MASK = 0x07;
export const SOLID = 0x10;      // 厚い壁。段2で弾を止める（細い部品は止めない）
export const CHARRED = 0x20;    // 焦げ（段3）

/**
 * 部品の一覧からかけらの表を作る。かけらの中心が部品の中に入っていれば埋まる。
 * 後の部品が前の部品を上書きする（描く順と同じ）。材料の無い部品は描くだけ。
 * @param {Array<{x:number,y:number,w:number,h:number,mat:number,solid:boolean}>} parts
 * @param {number} w 建物の幅(px)
 * @param {number} h 建物の高さ(px)
 * @returns {{cells: Uint8Array, cw: number, ch: number}}
 */
export function rasterizeParts(parts, w, h) {
    const cw = Math.ceil(w / CHUNK);
    const ch = Math.ceil(h / CHUNK);
    const cells = new Uint8Array(cw * ch);
    for (const p of parts) {
        if (!p.mat) continue;
        const v = p.mat | (p.solid ? SOLID : 0);
        // 中心 i*4+2 が [p.x, p.x+p.w) に入る i の範囲
        const i0 = Math.max(0, Math.ceil((p.x - HALF) / CHUNK));
        const i1 = Math.min(cw, Math.ceil((p.x + p.w - HALF) / CHUNK));
        const j0 = Math.max(0, Math.ceil((p.y - HALF) / CHUNK));
        const j1 = Math.min(ch, Math.ceil((p.y + p.h - HALF) / CHUNK));
        for (let j = j0; j < j1; j++) {
            for (let i = i0; i < i1; i++) cells[j * cw + i] = v;
        }
    }
    return { cells, cw, ch };
}

/**
 * 支えのかけら。中心が岩のタイルに入っているかけらは、そのタイルに支えられている。
 * 床に埋めた土台・壁に打ち込んだ梁・天井に結んだ綱が、どれもこの1つの規則で拾える。
 * 段2はこのタイルが壊れたときに支えを外す。
 * @returns {Array<{i:number, r:number, c:number}>} i はかけらの番号（j*cw+i）
 */
export function computeAnchors(cells, cw, ch, x, y, isSolidTile) {
    const anchors = [];
    for (let j = 0; j < ch; j++) {
        for (let i = 0; i < cw; i++) {
            const k = j * cw + i;
            if (!cells[k]) continue;
            const r = Math.floor((y + j * CHUNK + HALF) / TILE_SIZE);
            const c = Math.floor((x + i * CHUNK + HALF) / TILE_SIZE);
            if (isSolidTile(r, c)) anchors.push({ i: k, r, c });
        }
    }
    return anchors;
}
```

- [ ] **Step 6: `shapes.js` を書く**

`src/js/world/town/shapes.js`:

```js
// ============================================
// shapes - 建物の部品（四角）を積む小道具
// ============================================
//
// 建物は fillRect で描ける四角だけで組む。地形の一番細かい描き込み（4px）と
// 揃うこと、node で PNG に書き出せること（tools/render-town-scene.mjs）が理由。

import { MAT_NONE } from './chunks.js';

export const pick = (rng, arr) => arr[Math.floor(rng.next() * arr.length)];

/** lo〜hi（両端を含む）の 4 の倍数。hi < lo なら lo。lo は 4 の倍数で渡す */
export function step4(rng, lo, hi) {
    if (hi < lo) return lo;
    return lo + 4 * Math.floor(rng.next() * (Math.floor((hi - lo) / 4) + 1));
}

/** 部品を1つ積む。color が null なら描かない（かけらだけ）。mat が 0 なら描くだけ */
export function rect(parts, x, y, w, h, color, mat = MAT_NONE, solid = false) {
    if (w > 0 && h > 0) parts.push({ x, y, w, h, color, mat, solid });
}

/** 左右反転。壁の右側に張り付く形で組んだ家を、左側の壁に付けるときに使う */
export function mirrorParts(parts, w) {
    return parts.map((p) => ({ ...p, x: w - p.x - p.w }));
}

/**
 * 下端を y=0 として上へ（y を負に）積んだ部品を、上端が 0 になるよう下げる。
 * 小屋は「地面から上へ」組むほうが素直に書けるため
 */
export function normalizeUp(parts) {
    let minY = 0;
    let maxY = 0;
    for (const p of parts) {
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y + p.h);
    }
    return { parts: parts.map((p) => ({ ...p, y: p.y - minY })), h: maxY - minY };
}

/** 部品を順に塗る */
export function paintParts(ctx, parts) {
    for (const p of parts) {
        if (!p.color) continue;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.w, p.h);
    }
}
```

- [ ] **Step 7: `palette.js` を書く**

`src/js/world/town/palette.js`:

```js
// ============================================
// palette - 3面の町の色
// ============================================
//
// 描画専用のパラメータなのでモジュールスコープに置く（LEG_STYLES と同じ例外）。
// 輝度の上下限は tests/town-palette.test.js が縛る:
//   壁: 遠景の rockLight(38.2) 以上、地形の岩 #B8860B(134.9) の 0.85 倍(114.7) 以下
//   描き込み・影: 遠景の空洞(13.1) 以上、114.7 以下
// 2026-10-11 のモックアップ（日干し煉瓦の塔・坑道の小屋）から取り、白壁だけ
// 上限に当たったので #b9a37a(165) → #7c6e54(111) へ落とした。白というより
// 「土より少し白っぽい」だが、隣の土色との差で白壁として読める。

import { lerpColor } from '../../utils/color.js';

export const TOWN_BODY_COLORS = {
    adobe: ['#7d5a2a', '#87622f', '#6f4f24', '#906a36', '#7a5f38'], // 95 / 103 / 84 / 111 / 99
    wash: ['#7c6e54', '#776a50'],                                   // 111 / 107（シバームの上階の白壁）
    wood: ['#5a3d1e', '#694624', '#4f3519'],                        // 66 / 77 / 58
    rust: ['#8a4a22', '#7a5530', '#9a5a2a'],                        // 89 / 92 / 104（錆びたトタン）
    metal: ['#5e5446', '#4f4a42'],                                  // 85 / 75
};

export const TOWN_DETAIL_COLORS = {
    beam: '#3d2a12',    // 45  梁の木口・手すり・柱
    rope: '#4a3418',    // 55  綱
    winDark: '#1c1206', // 20  灯りの無い窓・戸口
    // 114。光らせない。弾（#FFDD33 / #FFCC00、輝度 200 前後の丸）と見間違えないよう、
    // 輝度の上限いっぱいの暗い琥珀の四角にする
    winLit: '#a8652a',
    lantern: '#9a6a32', // 114
};

const SHADE_K = 0.25;

/** 影の側（右の 4px）の色。壁の色を黒へ 25% 寄せる */
export function shade(hex) {
    return lerpColor(hex, '#000000', SHADE_K);
}
```

- [ ] **Step 8: テストが通ることを確かめる**

Run: `npm test -- tests/town-chunks.test.js tests/town-palette.test.js`
Expected: PASS

- [ ] **Step 9: わざと壊して赤くなることを確かめる**

1つずつ壊し、Step 8 のコマンドで赤くなるのを見てから戻す。
- `rasterizeParts` の `i1` の `Math.ceil` を `Math.floor` にする → 「中心(2px)を含む細い部品」が赤
- `TOWN_BODY_COLORS.wash[0]` を `'#b9a37a'` にする → 「壁の色は…0.85 倍以下」が赤
- `computeAnchors` の `+ HALF` を消す → 「支え」が赤（中心ではなく角で判定され、行がずれる）

- [ ] **Step 10: 全テストを流す**

Run: `npm test`
Expected: すべて PASS。`STAGE_ENVIRONMENTS` の形を縛るテストが落ちたら、`props` を足した行に合わせてテストの期待値を直す。ただし、期待値を実装から写さないこと。

- [ ] **Step 11: コミット**

```bash
git add src/js/utils/Constants.js src/js/world/town/chunks.js src/js/world/town/shapes.js src/js/world/town/palette.js tests/town-chunks.test.js tests/town-palette.test.js
git commit -m "feat: 町の建物のかけらの表・部品の小道具・色を足す

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 置き場所を探す（`placement.js`）

**Files:**
- Create: `src/js/world/town/placement.js`
- Test: `tests/town-placement.test.js`

**Interfaces:**
- Consumes: `BLOCK_EMPTY`（Constants）
- Produces: `findSites(grid, rows, cols) → { floors: Array<{r, c0, c1, headroom}>, ceilings: Array<{r, c0, c1, drop}>, walls: Array<{c, r0, r1, side: 'right'|'left', reach}> }`
  - floors: `r` は床の岩の行、`[c0, c1)` は上が空いた連続区間、`headroom` は区間内で最小の「上の空きタイル数」
  - ceilings: `r` は天井の岩の行、`drop` は区間内で最小の「下の空きタイル数」
  - walls: `c` は壁の岩の列、`[r0, r1)` は横が空いた連続区間。`side: 'right'` は壁の右が空気。`reach` は区間内で最小の「横の空き」（32 で打ち切る）

- [ ] **Step 1: 失敗するテストを書く**

`tests/town-placement.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSites } from '../src/js/world/town/placement.js';

// 10行x12列。外周2行・左右1列が岩、中が空洞。(3,5) に柱を1本立てる
//   r0-1: 天井 / r8-9: 床 / c0, c11: 壁
function room() {
    const rows = 10, cols = 12;
    const grid = [];
    for (let r = 0; r < rows; r++) {
        grid[r] = [];
        for (let c = 0; c < cols; c++) {
            const rock = r <= 1 || r >= 8 || c === 0 || c === 11;
            grid[r][c] = rock ? 1 : 0;
        }
    }
    grid[3][5] = 1;
    return { grid, rows, cols };
}

test('床: 上が空いた区間を1本にまとめ、上の空きは区間内の最小で測る', () => {
    const { grid, rows, cols } = room();
    const { floors } = findSites(grid, rows, cols);
    // c5 は柱の下で空きが 4（行 7,6,5,4）。他の列は 6
    assert.deepEqual(floors.find((f) => f.r === 8), { r: 8, c0: 1, c1: 11, headroom: 4 });
    // 柱の上面も床（上は行2の1つだけ空き）
    assert.deepEqual(floors.find((f) => f.r === 3), { r: 3, c0: 5, c1: 6, headroom: 1 });
});

test('天井: 下が空いた区間。下の空きは区間内の最小', () => {
    const { grid, rows, cols } = room();
    const { ceilings } = findSites(grid, rows, cols);
    assert.deepEqual(ceilings.find((f) => f.r === 1), { r: 1, c0: 1, c1: 11, drop: 1 });
    assert.deepEqual(ceilings.find((f) => f.r === 3), { r: 3, c0: 5, c1: 6, drop: 4 });
});

test('壁: 横が空いた縦の区間。向きと横の空き', () => {
    const { grid, rows, cols } = room();
    const { walls } = findSites(grid, rows, cols);
    assert.deepEqual(walls.find((w) => w.c === 0), { c: 0, r0: 2, r1: 8, side: 'right', reach: 10 });
    assert.deepEqual(walls.find((w) => w.c === 11), { c: 11, r0: 2, r1: 8, side: 'left', reach: 10 });
    assert.deepEqual(walls.find((w) => w.c === 5 && w.side === 'right'), { c: 5, r0: 3, r1: 4, side: 'right', reach: 5 });
    assert.deepEqual(walls.find((w) => w.c === 5 && w.side === 'left'), { c: 5, r0: 3, r1: 4, side: 'left', reach: 4 });
});

test('盤面の外は空気として数えない（外周の岩の外側に床や壁を作らない）', () => {
    const { grid, rows, cols } = room();
    const { floors, walls } = findSites(grid, rows, cols);
    assert.ok(!floors.some((f) => f.r === 0), '最上段は上が盤面の外');
    assert.ok(!walls.some((w) => w.c === 0 && w.side === 'left'));
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npm test -- tests/town-placement.test.js`
Expected: FAIL（モジュールが無い）

- [ ] **Step 3: `placement.js` を書く**

`src/js/world/town/placement.js`:

```js
// ============================================
// placement - 町を置ける場所を地形から探す
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md（1章）
// 床・壁・天井の3種類を、1タイル刻みの連続区間として返す純関数。
// 空きは区間内の**最小**で測る。天井が途中で下がる区間で、建物が天井から
// TOWN_CEILING_CLEARANCE を割らないようにするため（平均だと低い所で突き抜ける）。

import { BLOCK_EMPTY } from '../../utils/Constants.js';

// 壁の前の空きはこれ以上数えない。張り付く家は高々 6 タイルしか使わないので、
// 広い部屋の端から端まで数えても意味が無い
const REACH_CAP = 32;

export function findSites(grid, rows, cols) {
    const inside = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols;
    const empty = (r, c) => inside(r, c) && grid[r][c] === BLOCK_EMPTY;
    const solid = (r, c) => inside(r, c) && grid[r][c] !== BLOCK_EMPTY;
    const freeUp = (r, c) => { let n = 0; while (empty(r - 1 - n, c)) n++; return n; };
    const freeDown = (r, c) => { let n = 0; while (empty(r + 1 + n, c)) n++; return n; };
    const freeSide = (r, c, dc) => {
        let n = 0;
        while (n < REACH_CAP && empty(r, c + dc * (n + 1))) n++;
        return n;
    };

    // 横に続く区間（床と天井）を1行ずつ拾う
    const scanRows = (isEdge, measure) => {
        const runs = [];
        for (let r = 0; r < rows; r++) {
            let c = 0;
            while (c < cols) {
                if (!isEdge(r, c)) { c++; continue; }
                const c0 = c;
                let m = Infinity;
                while (c < cols && isEdge(r, c)) { m = Math.min(m, measure(r, c)); c++; }
                runs.push({ r, c0, c1: c, m });
            }
        }
        return runs;
    };

    const floors = scanRows((r, c) => solid(r, c) && empty(r - 1, c), freeUp)
        .map(({ r, c0, c1, m }) => ({ r, c0, c1, headroom: m }));
    const ceilings = scanRows((r, c) => solid(r, c) && empty(r + 1, c), freeDown)
        .map(({ r, c0, c1, m }) => ({ r, c0, c1, drop: m }));

    const walls = [];
    for (const [side, dc] of [['right', 1], ['left', -1]]) {
        for (let c = 0; c < cols; c++) {
            let r = 0;
            while (r < rows) {
                if (!(solid(r, c) && empty(r, c + dc))) { r++; continue; }
                const r0 = r;
                let reach = Infinity;
                while (r < rows && solid(r, c) && empty(r, c + dc)) {
                    reach = Math.min(reach, freeSide(r, c, dc));
                    r++;
                }
                walls.push({ c, r0, r1: r, side, reach });
            }
        }
    }
    return { floors, ceilings, walls };
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm test -- tests/town-placement.test.js`
Expected: PASS

- [ ] **Step 5: わざと壊して赤くなることを確かめる**

- `scanRows` の `Math.min` を `Math.max` にする → 床・天井のテストが赤（空きを最大で測る）
- `inside` で盤面の外を `true` にする（`empty` が盤面の外で真になる形）→「盤面の外は空気として数えない」が赤

- [ ] **Step 6: コミット**

```bash
git add src/js/world/town/placement.js tests/town-placement.test.js
git commit -m "feat: 町を置ける床・壁・天井を地形から探す

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: A（日干し煉瓦）の建物（`adobe.js`）

**Files:**
- Create: `src/js/world/town/adobe.js`
- Test: `tests/town-adobe.test.js`

**Interfaces:**
- Consumes: Task 1 の `rect` / `step4` / `pick` / `normalizeUp`、`MAT_*` / `SOLID`、`TOWN_BODY_COLORS` / `TOWN_DETAIL_COLORS` / `shade`
- Produces:
  - `buildAdobeTower(rng, { maxW, maxH }) → { kind: 'tower'|'roundTower', w, h, footX, footW, insets: number[], parts } | null`
    - `footX`, `footW` = 壁の足元の位置と幅（建物の左端から）。`footW ≤ maxW`、`h ≤ maxH`
    - `insets[k]` = 下から k 段目（4px）の片側の細り（px）。塔どうしの橋（Task 5）が使う
  - `buildAdobeWallHouse(rng, { maxReach }) → { kind: 'cliffHouse', w, h, parts } | null`（壁の右側に張り付く向きで組む。x 0〜4 が壁の岩に埋まる）
  - `buildHangingBridge(rng, { span, maxHang }) → { kind: 'bridge', w, h, parts } | null`（y 0〜4 が天井の岩に埋まる。`h ≤ maxHang`）

- [ ] **Step 1: 失敗するテストを書く**

`tests/town-adobe.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { buildAdobeTower, buildAdobeWallHouse, buildHangingBridge } from '../src/js/world/town/adobe.js';
import { rasterizeParts, SOLID } from '../src/js/world/town/chunks.js';
import { TOWN_DETAIL_COLORS } from '../src/js/world/town/palette.js';

function partsInside(b) {
    for (const p of b.parts) {
        assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= b.w && p.y + p.h <= b.h,
            `${b.kind} の部品 ${JSON.stringify(p)} が ${b.w}x${b.h} からはみ出す`);
    }
}

test('塔は幅と高さの上限を守り、部品は外接矩形の中に収まる', () => {
    const rng = new SeededRNG(7);
    for (let i = 0; i < 300; i++) {
        const maxW = 20 + Math.floor(rng.next() * 60);
        const maxH = 28 + Math.floor(rng.next() * 160);
        const b = buildAdobeTower(rng, { maxW, maxH });
        if (!b) continue;
        assert.ok(b.footW <= maxW, `足元 ${b.footW} > ${maxW}`);
        assert.ok(b.h <= maxH, `高さ ${b.h} > ${maxH}`);
        assert.ok(b.footX + b.footW <= b.w);
        partsInside(b);
    }
});

test('狭すぎる・低すぎるところには建てない', () => {
    const rng = new SeededRNG(1);
    assert.equal(buildAdobeTower(rng, { maxW: 12, maxH: 200 }), null);
    assert.equal(buildAdobeTower(rng, { maxW: 60, maxH: 20 }), null);
});

test('塔の一番下の段は足元の幅いっぱいに厚い壁がある（床に埋まって支えになる）', () => {
    const rng = new SeededRNG(3);
    for (let i = 0; i < 50; i++) {
        const b = buildAdobeTower(rng, { maxW: 56, maxH: 120 });
        const { cells, cw, ch } = rasterizeParts(b.parts, b.w, b.h);
        const j = ch - 1;
        for (let x = b.footX + 2; x < b.footX + b.footW; x += 4) {
            assert.ok(cells[j * cw + Math.floor(x / 4)] & SOLID, `${b.kind} の最下段 x=${x} が空`);
        }
    }
});

test('上の階ほど窓が多い（シバーム）', () => {
    const rng = new SeededRNG(11);
    let upper = 0, lower = 0;
    for (let i = 0; i < 300; i++) {
        const b = buildAdobeTower(rng, { maxW: 56, maxH: 140 });
        if (!b) continue;
        for (const p of b.parts) {
            const isWindow = p.w === 3 && p.h === 4
                && (p.color === TOWN_DETAIL_COLORS.winLit || p.color === TOWN_DETAIL_COLORS.winDark);
            if (!isWindow) continue;
            if (p.y < b.h / 2) upper++; else lower++;
        }
    }
    assert.ok(upper > lower * 1.2, `上 ${upper} / 下 ${lower}`);
});

test('同じ絵の塔はほとんど出ない（単純な繰り返しにしない）', () => {
    const rng = new SeededRNG(5);
    const seen = new Set();
    let n = 0;
    for (let i = 0; i < 100; i++) {
        const b = buildAdobeTower(rng, { maxW: 56, maxH: 140 });
        if (!b) continue;
        n++;
        seen.add(JSON.stringify(b.parts));
    }
    assert.ok(seen.size >= n - 3, `${n} 棟中 ${seen.size} 種類`);
});

test('同じ乱数なら同じ塔（週の決定性）', () => {
    const a = buildAdobeTower(new SeededRNG(9), { maxW: 56, maxH: 140 });
    const b = buildAdobeTower(new SeededRNG(9), { maxW: 56, maxH: 140 });
    assert.deepEqual(a, b);
});

test('崖の家は壁側の 4px が埋まり、厚い壁を持つ', () => {
    const rng = new SeededRNG(2);
    for (let i = 0; i < 50; i++) {
        const b = buildAdobeWallHouse(rng, { maxReach: 96 });
        partsInside(b);
        const { cells, cw, ch } = rasterizeParts(b.parts, b.w, b.h);
        let wallCol = 0;
        for (let j = 0; j < ch; j++) if (cells[j * cw]) wallCol++;
        assert.ok(wallCol > 0, '壁に埋まる列が空');
        assert.ok(cells.some((v) => v & SOLID), '厚い壁が無い');
    }
});

test('吊り橋は天井に結ばれ（上端の段が埋まる）、弾を止める部品を持たず、吊る高さを守る', () => {
    const rng = new SeededRNG(4);
    for (let i = 0; i < 50; i++) {
        const maxHang = 64 + Math.floor(rng.next() * 64);
        const b = buildHangingBridge(rng, { span: 64 + Math.floor(rng.next() * 96), maxHang });
        if (!b) continue;
        partsInside(b);
        assert.ok(b.h <= maxHang, `${b.h} > ${maxHang}`);
        const { cells, cw } = rasterizeParts(b.parts, b.w, b.h);
        assert.ok(cells[0] && cells[cw - 1], '両端の綱が天井の段に無い');
        assert.ok(!cells.some((v) => v & SOLID), '吊り橋は細い部品だけ');
    }
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npm test -- tests/town-adobe.test.js`
Expected: FAIL（モジュールが無い）

- [ ] **Step 3: `adobe.js` を書く**

`src/js/world/town/adobe.js`:

```js
// ============================================
// adobe - 日干し煉瓦の塔の町（A）
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md（1章）
// 参考: シバーム（下が太く上が細い、上の階ほど窓が多い、上の階を白く塗る、
// 上の階どうしを橋で結ぶ）、クリフ・パレス（崖のくぼみの家、壁から突き出た梁、丸い塔）。
// 形の数値は描画専用のパラメータなのでここに置く（Constants.js ではない）。

import { MAT_ADOBE, MAT_WOOD } from './chunks.js';
import { rect, step4, pick, normalizeUp } from './shapes.js';
import { TOWN_BODY_COLORS as BODY, TOWN_DETAIL_COLORS as DETAIL, shade } from './palette.js';

// 1階の高さ。自機（24px）の半分。これより低いと窓の段が詰まって縞に見える
const FLOOR_H = 12;
// 梁が壁から突き出す長さ。外接矩形の左右にこの余白を取っておく
const VIGA = 4;
const BALCONY_W = 8;
const ROOFS = ['crenel', 'crenel', 'flat', 'dome'];   // 胸壁を多めに（シバームの屋上）
const ROOF_H = { crenel: 4, flat: 0, dome: 8 };

export function buildAdobeTower(rng, { maxW, maxH }) {
    const round = rng.next() < 0.06;   // まれに丸い塔（クリフ・パレス）
    const wMin = round ? 16 : 20;
    const wMax = Math.min(round ? 24 : 56, maxW);
    if (wMax < wMin) return null;
    const roof = round ? 'dome' : pick(rng, ROOFS);
    const roofH = ROOF_H[roof];
    const floorsMax = Math.min(9, Math.floor((maxH - roofH) / FLOOR_H));
    if (floorsMax < 2) return null;
    const footW = step4(rng, wMin, wMax);
    const nFloors = 2 + Math.floor(rng.next() * (floorsMax - 1));
    const bodyH = nFloors * FLOOR_H;
    const H = roofH + bodyH;
    const balcony = (!round && nFloors >= 3 && rng.next() < 0.35) ? (rng.next() < 0.5 ? -1 : 1) : 0;
    const footX = VIGA + (balcony < 0 ? BALCONY_W : 0);
    const W = footW + VIGA * 2 + (balcony ? BALCONY_W : 0);

    const parts = [];
    const body = pick(rng, BODY.adobe);
    const wash = pick(rng, BODY.wash);
    const washRows = rng.next() < 0.6 ? 2 + Math.floor(rng.next() * 4) : 0;

    // 壁: 4px の段を下から積み、幅16pxごとに片側 4px まで細らせる（下が太く上が細い）
    const rows = bodyH / 4;
    const maxSteps = Math.floor(footW / 16);
    const rowsPerStep = Math.ceil(rows / (maxSteps + 1));
    const insets = [];
    for (let k = 0; k < rows; k++) {
        const inset = Math.min(maxSteps, Math.floor(k / rowsPerStep)) * 4;
        insets.push(inset);
        const y = H - (k + 1) * 4;
        const x0 = footX + inset;
        const ww = footW - inset * 2;
        const col = k >= rows - washRows ? wash : body;
        rect(parts, x0, y, ww, 4, col, MAT_ADOBE, true);
        rect(parts, x0 + ww - 4, y, 4, 4, shade(col));   // 影の側
    }
    const insetAt = (y) => insets[Math.min(rows - 1, Math.max(0, Math.floor((H - y - 1) / 4)))];

    // 屋上
    const topInset = insets[rows - 1];
    const tx0 = footX + topInset;
    const tw = footW - topInset * 2;
    const topCol = washRows > 0 ? wash : body;
    if (roof === 'crenel') {
        // 胸壁は細い部品（段2で弾を止めない）。4px おきの凹凸
        for (let px = tx0; px + 4 <= tx0 + tw; px += 8) rect(parts, px, 0, 4, 4, topCol, MAT_ADOBE, false);
    } else if (roof === 'dome') {
        rect(parts, tx0 + 4, 4, tw - 8, 4, topCol, MAT_ADOBE, true);
        rect(parts, tx0 + 8, 0, tw - 16, 4, topCol, MAT_ADOBE, true);
    }

    // 窓と梁。窓は上の階ほど多い（シバームは上の階に窓が集まる）
    const doorX = footX + footW / 2 - 2;
    for (let f = 0; f < nFloors; f++) {
        const wy = H - (f + 1) * FLOOR_H + 4;
        const ins = insetAt(wy);
        const p = 0.25 + 0.5 * (f / (nFloors - 1));
        for (let wx = footX + ins + 4; wx + 3 <= footX + footW - ins - 8; wx += 8) {
            if (f === 0 && Math.abs(wx - doorX) < 6) continue;
            if (rng.next() < p) rect(parts, wx, wy, 3, 4, rng.next() < 0.35 ? DETAIL.winLit : DETAIL.winDark);
        }
        if (f >= 1 && rng.next() < 0.35) {
            // 床の高さで壁から突き出た梁の木口（クリフ・パレスのヴィガ）
            const by = H - f * FLOOR_H - 2;
            const bi = insetAt(by);
            rect(parts, footX + bi - VIGA, by, VIGA, 2, DETAIL.beam);
            rect(parts, footX + footW - bi, by, VIGA, 2, DETAIL.beam);
        }
    }
    rect(parts, doorX, H - 8, 4, 8, DETAIL.winDark);

    // バルコニー（木の床板＝細い部品）
    if (balcony) {
        const f = 1 + Math.floor(rng.next() * (nFloors - 2));
        const dy = H - f * FLOOR_H;
        const ins = insetAt(dy - 1);
        const bx = balcony < 0 ? footX + ins - BALCONY_W : footX + footW - ins;
        rect(parts, bx, dy, BALCONY_W, 4, pick(rng, BODY.wood), MAT_WOOD, false);
        rect(parts, bx, dy - 5, BALCONY_W, 1, DETAIL.beam);
        rect(parts, balcony < 0 ? bx : bx + BALCONY_W - 1, dy - 5, 1, 5, DETAIL.beam);
        rect(parts, balcony < 0 ? footX + ins : footX + footW - ins - 4, dy - 8, 4, 8, DETAIL.winDark);
    }

    // 外壁に沿う階段（描くだけ）。1階ぶんを斜めに上る
    if (!round && nFloors >= 3 && rng.next() < 0.25) {
        const sx = footX + insets[0] + 4;
        for (let i = 0; i < FLOOR_H / 2; i++) rect(parts, sx + i * 2, H - 2 - i * 2, 4, 2, shade(body));
    }

    return { kind: round ? 'roundTower' : 'tower', w: W, h: H, footX, footW, insets, parts };
}

/**
 * 崖の家。壁の右側に張り付く向きで組む（左の壁には generate が反転して付ける）。
 * x 0〜4 は壁の岩に埋まり、そこが支えになる。下に岩棚の梁を張り出す。
 */
export function buildAdobeWallHouse(rng, { maxReach }) {
    const footW = step4(rng, 16, Math.min(28, maxReach - 8));
    if (footW < 16) return null;
    const parts = [];
    const body = pick(rng, BODY.adobe);
    const h1 = step4(rng, 16, 28);
    const w1 = 4 + footW;
    // 岩棚: 壁から張り出した梁の床（細い部品）と、その木口
    rect(parts, 0, 0, w1 + 4, 4, DETAIL.beam, MAT_WOOD, false);
    for (let bx = 6; bx + 2 <= w1 + 4; bx += 6) rect(parts, bx, 4, 2, 2, DETAIL.beam);
    // 家（厚い壁）
    rect(parts, 0, -h1, w1, h1, body, MAT_ADOBE, true);
    rect(parts, w1 - 4, -h1, 4, h1, shade(body));
    rect(parts, w1 - 8, -8, 4, 8, DETAIL.winDark);   // 岩棚へ出る戸口
    for (let wy = -h1 + 4; wy <= -12; wy += 8) {
        for (let wx = 6; wx + 3 <= w1 - 10; wx += 7) {
            if (rng.next() < 0.5) rect(parts, wx, wy, 3, 4, rng.next() < 0.35 ? DETAIL.winLit : DETAIL.winDark);
        }
    }
    // 崖の住居は積み重なる: 上にもう1つ小さな家
    if (footW >= 20 && rng.next() < 0.5) {
        const h2 = step4(rng, 12, 16);
        const w2 = w1 - 8;
        rect(parts, 0, -h1 - h2, w2, h2, body, MAT_ADOBE, true);
        rect(parts, w2 - 4, -h1 - h2, 4, h2, shade(body));
        if (rng.next() < 0.6) rect(parts, 6, -h1 - h2 + 4, 3, 4, DETAIL.winLit);
    }
    const n = normalizeUp(parts);
    return { kind: 'cliffHouse', w: w1 + 4, h: n.h, parts: n.parts };
}

/**
 * 天井から吊った渡り橋。両端の綱が y 0〜4（天井に埋まる段）に結ばれる。
 * 板と綱だけ＝細い部品なので、段2では弾がすり抜けて欠けるだけ。
 */
export function buildHangingBridge(rng, { span, maxHang }) {
    const n = Math.floor(span / 4);
    if (n < 8) return null;
    // たわみ(〜12) と下がるランタン(8) のぶんを引いておき、h ≤ maxHang を守る
    const dropMax = Math.min(40, maxHang - 20);
    if (dropMax < 16) return null;
    const drop = step4(rng, 16, dropMax);
    const sag = 4 + Math.floor(rng.next() * 9);
    const deck = pick(rng, BODY.wood);
    const parts = [];
    for (const rx of [0, n * 4 - 4]) {
        rect(parts, rx, 0, 4, drop + 4, null, MAT_WOOD, false);
        rect(parts, rx + 1, 0, 1, drop, DETAIL.rope);
    }
    for (let i = 0; i < n; i++) {
        const s = Math.round(Math.sin(Math.PI * (i + 0.5) / n) * sag);
        rect(parts, i * 4, drop + s, 4, 4, null, MAT_WOOD, false);
        rect(parts, i * 4, drop + s, 4, 2, i % 2 ? deck : shade(deck));
        rect(parts, i * 4, drop + s - 4, 4, 1, DETAIL.rope);   // 手すりの綱
    }
    let h = drop + sag + 4;
    if (rng.next() < 0.5) {
        const ly = drop + sag + 2;
        const lx = Math.floor(n / 2) * 4;
        rect(parts, lx + 1, ly, 1, 3, DETAIL.rope);
        rect(parts, lx, ly + 3, 3, 3, DETAIL.lantern);
        h = ly + 6;
    }
    return { kind: 'bridge', w: n * 4, h, parts };
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm test -- tests/town-adobe.test.js`
Expected: PASS。「上の階ほど窓が多い」が落ちたら、窓の確率の式（`0.25 + 0.5 * f/(nFloors-1)`）が意図どおりかを見る。閾値を緩めて通さないこと。

- [ ] **Step 5: わざと壊して赤くなることを確かめる**

- 窓の確率を `0.5` 一定にする → 「上の階ほど窓が多い」が赤
- `buildHangingBridge` の `maxHang - 20` を `maxHang` にする → 「吊る高さを守る」が赤（ならなければ、テストの `maxHang` の範囲が狭すぎないかを見る）
- 塔の壁の段の `MAT_ADOBE, true` を `MAT_ADOBE, false` にする → 「最下段は…厚い壁」が赤

- [ ] **Step 6: コミット**

```bash
git add src/js/world/town/adobe.js tests/town-adobe.test.js
git commit -m "feat: 日干し煉瓦の塔・崖の家・吊り橋を組み立てる

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: C（坑道）の建物（`mining.js`）

**Files:**
- Create: `src/js/world/town/mining.js`
- Test: `tests/town-mining.test.js`

**Interfaces:**
- Consumes: Task 1 の小道具・印・色
- Produces:
  - `buildMiningShack(rng, { maxW, maxH }) → { kind: 'shack'|'stiltShack'|'stackShack', w, h, footX, footW, parts } | null`（`footW ≤ maxW`、`h ≤ maxH`）
  - `buildScaffoldShack(rng, { maxReach }) → { kind: 'scaffoldShack', w, h, parts } | null`（壁の右側に張り付く向き。x 0〜4 が壁に埋まる）
  - `buildLantern(rng, { maxHang }) → { kind: 'lantern', w: 4, h, parts }`（y 0〜4 が天井に埋まる）
  - `buildHangingShack(rng, { maxHang }) → { kind: 'hangingShack', w, h, parts } | null`

- [ ] **Step 1: 失敗するテストを書く**

`tests/town-mining.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import {
    buildMiningShack, buildScaffoldShack, buildLantern, buildHangingShack,
} from '../src/js/world/town/mining.js';
import { rasterizeParts, SOLID, MAT_MASK, MAT_METAL } from '../src/js/world/town/chunks.js';

function partsInside(b) {
    for (const p of b.parts) {
        assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= b.w && p.y + p.h <= b.h,
            `${b.kind} の部品 ${JSON.stringify(p)} が ${b.w}x${b.h} からはみ出す`);
    }
}

test('小屋は幅と高さの上限を守り、部品は外接矩形の中に収まる', () => {
    const rng = new SeededRNG(7);
    const kinds = new Set();
    for (let i = 0; i < 400; i++) {
        const maxW = 16 + Math.floor(rng.next() * 40);
        const maxH = 24 + Math.floor(rng.next() * 100);
        const b = buildMiningShack(rng, { maxW, maxH });
        if (!b) continue;
        kinds.add(b.kind);
        assert.ok(b.footW <= maxW, `足元 ${b.footW} > ${maxW}`);
        assert.ok(b.h <= maxH, `${b.kind} 高さ ${b.h} > ${maxH}`);
        partsInside(b);
    }
    assert.deepEqual([...kinds].sort(), ['shack', 'stackShack', 'stiltShack'], '3種類とも出る');
});

test('狭すぎる・低すぎるところには建てない', () => {
    const rng = new SeededRNG(1);
    assert.equal(buildMiningShack(rng, { maxW: 12, maxH: 100 }), null);
    assert.equal(buildMiningShack(rng, { maxW: 40, maxH: 20 }), null);
});

test('小屋の一番下の段は床に埋まる（地面の小屋は壁、高床は柱が最下段にある）', () => {
    const rng = new SeededRNG(3);
    for (let i = 0; i < 80; i++) {
        const b = buildMiningShack(rng, { maxW: 36, maxH: 100 });
        const { cells, cw, ch } = rasterizeParts(b.parts, b.w, b.h);
        const bottom = Array.from(cells.slice((ch - 1) * cw, ch * cw));
        assert.ok(bottom.some((v) => v), `${b.kind} の最下段が空`);
    }
});

test('屋根はトタン（金属の厚い壁）', () => {
    const rng = new SeededRNG(8);
    for (let i = 0; i < 40; i++) {
        const b = buildMiningShack(rng, { maxW: 36, maxH: 40 });
        const { cells } = rasterizeParts(b.parts, b.w, b.h);
        assert.ok(cells.some((v) => (v & MAT_MASK) === MAT_METAL && (v & SOLID)), '金属の屋根が無い');
    }
});

test('同じ絵の小屋はほとんど出ない', () => {
    const rng = new SeededRNG(5);
    const seen = new Set();
    let n = 0;
    for (let i = 0; i < 100; i++) {
        const b = buildMiningShack(rng, { maxW: 36, maxH: 80 });
        if (!b) continue;
        n++;
        seen.add(JSON.stringify(b.parts));
    }
    assert.ok(seen.size >= n - 3, `${n} 棟中 ${seen.size} 種類`);
});

test('足場の小屋は壁側の 4px が埋まる', () => {
    const rng = new SeededRNG(2);
    for (let i = 0; i < 40; i++) {
        const b = buildScaffoldShack(rng, { maxReach: 96 });
        partsInside(b);
        const { cells, cw, ch } = rasterizeParts(b.parts, b.w, b.h);
        let wallCol = 0;
        for (let j = 0; j < ch; j++) if (cells[j * cw]) wallCol++;
        assert.ok(wallCol > 0);
    }
});

test('ランタンと吊り小屋は天井の段に結ばれ、吊る高さを守る。ランタンは弾を止めない', () => {
    const rng = new SeededRNG(4);
    for (let i = 0; i < 40; i++) {
        const maxHang = 64 + Math.floor(rng.next() * 64);
        const l = buildLantern(rng, { maxHang });
        partsInside(l);
        assert.ok(l.h <= maxHang);
        const lc = rasterizeParts(l.parts, l.w, l.h);
        assert.ok(lc.cells[0], 'ランタンの綱が天井の段に無い');
        assert.ok(!lc.cells.some((v) => v & SOLID));

        const s = buildHangingShack(rng, { maxHang });
        if (!s) continue;
        partsInside(s);
        assert.ok(s.h <= maxHang);
        const sc = rasterizeParts(s.parts, s.w, s.h);
        assert.ok(Array.from(sc.cells.slice(0, sc.cw)).some((v) => v), '吊り小屋の綱が天井の段に無い');
    }
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npm test -- tests/town-mining.test.js`
Expected: FAIL（モジュールが無い）

- [ ] **Step 3: `mining.js` を書く**

`src/js/world/town/mining.js`:

```js
// ============================================
// mining - 坑道の町（C）
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md（1章）
// 木の骨組みの小屋、錆びたトタン屋根、足場と梯子、配管、ランタン。
// 狭い通路・低い天井に多く置く（generate.js の adobeShare）。
// 小屋は「下端 = y 0、上へ y を負に」積んでから normalizeUp で下げる。

import { MAT_WOOD, MAT_METAL } from './chunks.js';
import { rect, step4, pick, normalizeUp } from './shapes.js';
import { TOWN_BODY_COLORS as BODY, TOWN_DETAIL_COLORS as DETAIL, shade } from './palette.js';

// 軒・看板・ランタンが壁の外へ出るぶんの余白（外接矩形の左右）
const EAVE = 4;
const ROOFS = ['gable', 'shed', 'tin'];

/**
 * 板壁の小屋を1つ積む。屋根は上に最大 8px 足す。
 * @returns {{wallTop:number, top:number}} 壁の上端と屋根の上端の y
 */
function shack(parts, rng, x, bottom, w, h) {
    const wall = pick(rng, BODY.wood);
    const wallTop = bottom - h;
    rect(parts, x, wallTop, w, h, wall, MAT_WOOD, true);
    for (let px = x + 3; px < x + w - 1; px += 4) rect(parts, px, wallTop, 1, h, shade(wall));   // 板の継ぎ目
    const doorX = x + 4 + 4 * Math.floor(rng.next() * Math.max(1, Math.floor((w - 12) / 4)));
    rect(parts, doorX, bottom - 8, 4, 8, DETAIL.winDark);
    if (h >= 16) {
        for (let wx = x + 4; wx + 4 <= x + w - 4; wx += 8) {
            if (Math.abs(wx - doorX) < 6) continue;
            if (rng.next() < 0.6) rect(parts, wx, wallTop + 3, 4, 3, rng.next() < 0.5 ? DETAIL.winLit : DETAIL.winDark);
        }
    }
    const roof = pick(rng, ROOFS);
    const col = roof === 'tin' ? BODY.metal[0] : pick(rng, BODY.rust);
    rect(parts, x - 2, wallTop - 4, w + 4, 4, col, MAT_METAL, true);
    if (roof === 'gable') {
        rect(parts, x + 4, wallTop - 8, w - 8, 4, col, MAT_METAL, true);
        return { wallTop, top: wallTop - 8 };
    }
    if (roof === 'shed') {   // 片流れ。段をずらして傾きに見せる
        rect(parts, x - 2, wallTop - 8, Math.floor(w / 8) * 4 + 2, 4, col, MAT_METAL, true);
        return { wallTop, top: wallTop - 8 };
    }
    for (let px = x; px < x + w; px += 3) rect(parts, px, wallTop - 4, 1, 4, shade(col));   // トタンの波
    return { wallTop, top: wallTop - 4 };
}

/** 高床の柱と筋交い（細い部品）。地面 y=0 から上へ sh */
function stilts(parts, rng, x, w, sh) {
    for (const px of [x, x + w - 4]) {
        rect(parts, px, -sh, 4, sh, null, MAT_WOOD, false);
        rect(parts, px + 1, -sh, 2, sh, DETAIL.beam);
    }
    const n = Math.max(1, Math.floor((w - 8) / 2));
    for (let i = 0; i < n; i++) {
        rect(parts, x + 4 + i * 2, -Math.round(sh * (i + 1) / (n + 1)) - 1, 2, 2, DETAIL.beam);
    }
    if (rng.next() < 0.4) {   // 梯子（描くだけ）
        const lx = x + 6;
        rect(parts, lx, -sh, 1, sh, DETAIL.beam);
        rect(parts, lx + 4, -sh, 1, sh, DETAIL.beam);
        for (let ly = -sh + 2; ly < 0; ly += 4) rect(parts, lx, ly, 5, 1, DETAIL.beam);
    }
}

/** 軒から下がるランタン（描くだけ）。x - 4 から描くので EAVE の余白に収まる */
function eaveLantern(parts, x, wallTop) {
    rect(parts, x - 3, wallTop, 1, 3, DETAIL.rope);
    rect(parts, x - 4, wallTop + 3, 3, 3, DETAIL.lantern);
}

export function buildMiningShack(rng, { maxW, maxH }) {
    const footMax = Math.min(36, maxW);
    if (footMax < 16 || maxH < 24) return null;
    const footW = step4(rng, 16, footMax);
    const parts = [];
    const x = EAVE;
    const h1 = step4(rng, 12, Math.min(20, maxH - 8));
    const roll = rng.next();
    let bottom = 0;
    let kind = 'shack';
    if (roll < 0.35 && maxH - h1 - 8 >= 16) {
        const sh = step4(rng, 16, Math.min(48, maxH - h1 - 8));
        stilts(parts, rng, x, footW, sh);
        bottom = -sh;
        kind = 'stiltShack';
    }
    const base = shack(parts, rng, x, bottom, footW, h1);
    let top = base;
    let topX = x;
    let topW = footW;
    if (kind === 'shack' && roll < 0.6 && footW >= 20) {
        const h2 = step4(rng, 12, 16);
        if (-base.top + h2 + 8 <= maxH) {
            top = shack(parts, rng, x + 4, base.top, footW - 8, h2);
            topX = x + 4;
            topW = footW - 8;
            kind = 'stackShack';
        }
    }
    if (rng.next() < 0.3 && -top.top + 8 <= maxH) {   // 煙突（金属の細い部品）
        const cx = topX + 4 + 4 * Math.floor(rng.next() * Math.max(1, Math.floor((topW - 12) / 4)));
        rect(parts, cx, top.top - 8, 4, 8, BODY.metal[1], MAT_METAL, false);
        rect(parts, cx + 3, top.top - 8, 1, 8, shade(BODY.metal[1]));
    }
    if (rng.next() < 0.25) {   // 看板（板壁に打ち付けた板）
        rect(parts, x + 2, base.wallTop + 1, 8, 4, pick(rng, BODY.rust), MAT_WOOD, false);
        rect(parts, x + 3, base.wallTop + 2, 6, 1, DETAIL.beam);
    }
    if (rng.next() < 0.3) eaveLantern(parts, x, base.wallTop);
    if (rng.next() < 0.2) {   // 配管（金属の細い部品）
        rect(parts, x - 4, bottom - 6, footW + 8, 4, null, MAT_METAL, false);
        rect(parts, x - 4, bottom - 5, footW + 8, 2, BODY.metal[0]);
    }
    const n = normalizeUp(parts);
    return { kind, w: footW + EAVE * 2, h: n.h, footX: EAVE, footW, parts: n.parts };
}

/**
 * 壁の足場に載った小屋。壁の右側に張り付く向き（左の壁には generate が反転して付ける）。
 * x 0〜4 は壁の岩に埋まり、4〜8 が壁際の柱。
 */
export function buildScaffoldShack(rng, { maxReach }) {
    const footW = step4(rng, 16, Math.min(28, maxReach - 12));
    if (footW < 16) return null;
    const parts = [];
    const x = 8;
    const legH = step4(rng, 12, 28);
    rect(parts, 0, -4, 8, legH + 8, null, MAT_WOOD, false);   // 壁に打ち込んだ梁と柱
    rect(parts, 5, 0, 2, legH, DETAIL.beam);
    rect(parts, 0, 0, x + footW + 2, 4, pick(rng, BODY.wood), MAT_WOOD, false);   // 床板
    const n = Math.max(1, Math.floor((x + footW - 8) / 2));
    for (let i = 0; i < n; i++) {   // 筋交い: 壁の下から床板の先へ
        rect(parts, 6 + i * 2, 4 + Math.round((legH - 4) * (1 - (i + 1) / (n + 1))), 2, 2, DETAIL.beam);
    }
    const s = shack(parts, rng, x, 0, footW, step4(rng, 12, 16));
    if (rng.next() < 0.3) eaveLantern(parts, x, s.wallTop);
    const nn = normalizeUp(parts);
    return { kind: 'scaffoldShack', w: x + footW + EAVE, h: nn.h, parts: nn.parts };
}

/** 天井から下がるランタン。綱（細い部品）の上端 y 0〜4 が天井に埋まる */
export function buildLantern(rng, { maxHang }) {
    const len = step4(rng, 8, Math.max(8, Math.min(40, maxHang - 8)));
    const parts = [];
    rect(parts, 0, 0, 4, len, null, MAT_WOOD, false);
    rect(parts, 1, 0, 1, len, DETAIL.rope);
    rect(parts, 0, len, 4, 5, DETAIL.beam, MAT_METAL, false);   // 枠
    rect(parts, 1, len + 1, 2, 3, DETAIL.lantern);              // 灯り
    return { kind: 'lantern', w: 4, h: len + 5, parts };
}

/** 天井から2本の綱で吊った小屋 */
export function buildHangingShack(rng, { maxHang }) {
    const footW = step4(rng, 16, 24);
    const rope = step4(rng, 8, 20);
    const h1 = step4(rng, 12, 16);
    const bottom = 4 + rope + 8 + h1;   // 天井の段 4 + 綱 + 屋根 8 + 壁
    if (bottom > maxHang) return null;
    const parts = [];
    const x = EAVE;
    for (const rx of [x, x + footW - 4]) {
        // 綱は屋根の下まで伸ばす（トタンの平屋根は 4px 低いので、届かず浮いて見えないように）
        rect(parts, rx, 0, 4, 4 + rope + 8, null, MAT_WOOD, false);
        rect(parts, rx + 1, 0, 1, 4 + rope + 8, DETAIL.rope);
    }
    shack(parts, rng, x, bottom, footW, h1);
    return { kind: 'hangingShack', w: footW + EAVE * 2, h: bottom, parts };
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm test -- tests/town-mining.test.js`
Expected: PASS

- [ ] **Step 5: わざと壊して赤くなることを確かめる**

- `buildMiningShack` の高床の条件 `maxH - h1 - 8 >= 16` を `true` にし、`sh` の上限を `48` 固定にする → 「高さの上限を守り」が赤
- `shack()` の屋根の `MAT_METAL, true` を `MAT_METAL, false` にする → 「屋根はトタン」が赤
- `buildLantern` の綱の `MAT_WOOD` を `0` にする → 「天井の段に結ばれ」が赤

- [ ] **Step 6: コミット**

```bash
git add src/js/world/town/mining.js tests/town-mining.test.js
git commit -m "feat: 坑道の小屋・足場の小屋・吊り小屋・ランタンを組み立てる

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 町を並べる（`generate.js`）

**Files:**
- Create: `src/js/world/town/generate.js`
- Test: `tests/town-generate.test.js`

**Interfaces:**
- Consumes: `findSites`（Task 2）、`buildAdobeTower` / `buildAdobeWallHouse` / `buildHangingBridge`（Task 3）、`buildMiningShack` / `buildScaffoldShack` / `buildLantern` / `buildHangingShack`（Task 4）、`mirrorParts` / `rect` / `pick` / `step4`、`TOWN_*`
- Produces:
  - `adobeShare(headroom) → number`（0〜1）
  - `generateTown({ grid, rows, cols, excludeRects, rng }) → Array<Spec>`
  - `Spec = { site: 'floor'|'wall'|'ceiling', style: 'A'|'C', kind, x, y, w, h, parts, footX?, footW?, insets?, headroom? }`（`x, y` はワールド px の左上。床の建物だけ `footX` / `footW` / `headroom` を持ち、A の塔は `insets` も持つ）

- [ ] **Step 1: 失敗するテストを書く**

`tests/town-generate.test.js`:

```js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import {
    TILE_SIZE as T, TOWN_CEILING_CLEARANCE, TOWN_MIN_HEADROOM,
} from '../src/js/utils/Constants.js';
import { findSites } from '../src/js/world/town/placement.js';

before(() => {
    const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

const SEEDS = [11, 22, 33, 44, 55];

/** 本物の3面の地形（missionLevel 2）と、そこに並べた町の設計図 */
async function stage3(seed) {
    const { Map } = await import('../src/js/world/Map.js');
    const { generateTown } = await import('../src/js/world/town/generate.js');
    const map = new Map({ rng: new SeededRNG(seed) }, 2);
    const base = map._reservedRects()[1];
    const specs = generateTown({
        grid: map.grid, rows: map.rows, cols: map.cols,
        excludeRects: [base], rng: new SeededRNG(seed * 7 + 1),
    });
    return { map, base, specs };
}

const tileRange = (s) => ({
    r0: Math.floor(s.y / T), r1: Math.floor((s.y + s.h - 1) / T),
    c0: Math.floor(s.x / T), c1: Math.floor((s.x + s.w - 1) / T),
});

test('adobeShare: 広い所は A が 8割、狭い所は 1割、あいだは線形', async () => {
    const { adobeShare } = await import('../src/js/world/town/generate.js');
    assert.equal(adobeShare(20), 0.8);
    assert.equal(adobeShare(12), 0.8);
    assert.equal(adobeShare(5), 0.1);
    assert.equal(adobeShare(3), 0.1);
    assert.ok(Math.abs(adobeShare(8.5) - 0.45) < 1e-9);
});

test('建物はすべて盤面の中', async () => {
    for (const seed of SEEDS) {
        const { map, specs } = await stage3(seed);
        for (const s of specs) {
            assert.ok(s.x >= 0 && s.y >= 0 && s.x + s.w <= map.width && s.y + s.h <= map.height,
                `seed ${seed}: ${s.kind} (${s.x},${s.y} ${s.w}x${s.h}) が盤面の外`);
        }
    }
});

test('基地の部屋に一部でも掛かる建物は無い', async () => {
    for (const seed of SEEDS) {
        const { base, specs } = await stage3(seed);
        for (const s of specs) {
            const t = tileRange(s);
            const overlap = t.r0 <= base.r1 && t.r1 >= base.r0 && t.c0 <= base.c1 && t.c1 >= base.c0;
            assert.ok(!overlap, `seed ${seed}: ${s.kind} が基地の部屋に掛かる`);
        }
    }
});

test('床の建物の上 2 タイルは空いている（天井にくっつかない）', async () => {
    for (const seed of SEEDS) {
        const { map, specs } = await stage3(seed);
        for (const s of specs.filter((v) => v.site === 'floor')) {
            const c0 = Math.floor((s.x + s.footX) / T);
            const c1 = Math.floor((s.x + s.footX + s.footW - 1) / T);
            const rTop = Math.floor((s.y - 1) / T);
            for (let r = rTop - TOWN_CEILING_CLEARANCE + 1; r <= rTop; r++) {
                for (let c = c0; c <= c1; c++) {
                    assert.ok(!map.isSolid(r, c),
                        `seed ${seed}: ${s.kind} (top ${s.y}) の上 r${r} c${c} が岩`);
                }
            }
        }
    }
});

test('天井までの空きで A と C の割合が変わる（広い所は A、狭い所は C）', async () => {
    let wideA = 0, wideN = 0, narrowA = 0, narrowN = 0;
    for (const seed of SEEDS) {
        const { specs } = await stage3(seed);
        for (const s of specs.filter((v) => v.site === 'floor')) {
            if (s.headroom >= 12) { wideN++; if (s.style === 'A') wideA++; }
            if (s.headroom <= 5) { narrowN++; if (s.style === 'A') narrowA++; }
        }
    }
    assert.ok(wideN >= 30 && narrowN >= 30, `標本が少ない（広い ${wideN} / 狭い ${narrowN}）`);
    assert.ok(wideA / wideN >= 0.65, `広い所の A ${wideA}/${wideN}`);
    assert.ok(narrowA / narrowN <= 0.25, `狭い所の A ${narrowA}/${narrowN}`);
});

test('面全体にまんべんなく: 建てられる床の半分以上に建物がある', async () => {
    for (const seed of SEEDS) {
        const { map, base, specs } = await stage3(seed);
        const covered = new Set();
        for (const s of specs.filter((v) => v.site === 'floor')) {
            const c0 = Math.floor((s.x + s.footX) / T);
            const c1 = Math.floor((s.x + s.footX + s.footW - 1) / T);
            const r = Math.floor((s.y + s.h - 1) / T);
            for (let c = c0; c <= c1; c++) covered.add(`${r},${c}`);
        }
        let total = 0, hit = 0;
        for (const f of findSites(map.grid, map.rows, map.cols).floors) {
            if (f.headroom < TOWN_MIN_HEADROOM || f.c1 - f.c0 < 2) continue;
            if (f.r >= base.r0 && f.r <= base.r1 && f.c1 > base.c0) continue;   // 基地の部屋の床は数えない
            for (let c = f.c0; c < f.c1; c++) { total++; if (covered.has(`${f.r},${c}`)) hit++; }
        }
        assert.ok(hit / total >= 0.5, `seed ${seed}: ${hit}/${total}`);
    }
});

test('床・壁・天井の3種類とも置かれ、壁と天井のものは他の建物と重ならない', async () => {
    for (const seed of SEEDS) {
        const { specs } = await stage3(seed);
        for (const site of ['floor', 'wall', 'ceiling']) {
            assert.ok(specs.some((s) => s.site === site), `seed ${seed}: ${site} が無い`);
        }
        const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        specs.forEach((a, i) => {
            if (a.site === 'floor') return;
            specs.forEach((b, j) => {
                if (i !== j) assert.ok(!hits(a, b), `seed ${seed}: ${a.kind} と ${b.kind} が重なる`);
            });
        });
    }
});

test('隣り合う塔を橋でつなぐことがある（シバーム）', async () => {
    let bridged = 0;
    for (const seed of SEEDS) {
        const { specs } = await stage3(seed);
        for (const s of specs.filter((v) => v.insets)) {
            // 橋は隣の塔まで（隙間 16px 以上）伸びる。バルコニー(8)と梁(4)はそこまで届かない
            if (s.parts.some((p) => p.x + p.w > s.footX + s.footW + 12)) bridged++;
        }
    }
    assert.ok(bridged > 0);
});

test('同じ乱数なら同じ町（週の決定性）', async () => {
    const a = await stage3(11);
    const b = await stage3(11);
    assert.deepEqual(a.specs, b.specs);
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npm test -- tests/town-generate.test.js`
Expected: FAIL（`generate.js` が無い）

- [ ] **Step 3: `generate.js` を書く**

`src/js/world/town/generate.js`:

```js
// ============================================
// generate - 置き場所に町を並べる
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md（1章）
// 床 → 壁 → 天井の順に並べる。乱数は呼び出し側が渡す派生ストリームだけを使う
// （Map の game.rng を消費すると敵の構成が変わり、週の決定性が壊れる）。
// 床の建物どうしは重なってよい（張り出したバルコニーや梁が隣に掛かるのは町らしい）。
// 壁と天井のものは、先に置いたものと重なるなら置かない（塔の上に吊るしものが刺さる）。

import {
    TILE_SIZE as T,
    TOWN_MIN_HEADROOM, TOWN_CEILING_CLEARANCE, TOWN_FOUNDATION_SINK, TOWN_FLOOR_FILL,
    TOWN_ADOBE_HEADROOM_WIDE, TOWN_ADOBE_SHARE_WIDE, TOWN_ADOBE_HEADROOM_NARROW, TOWN_ADOBE_SHARE_NARROW,
    TOWN_TOWER_BRIDGE_CHANCE,
    TOWN_WALL_MIN_RUN, TOWN_WALL_MIN_REACH, TOWN_WALL_SPACING, TOWN_WALL_HOUSE_CHANCE,
    TOWN_CEIL_MIN_RUN, TOWN_CEIL_MIN_DROP, TOWN_CEIL_KEEP_BELOW,
} from '../../utils/Constants.js';
import { findSites } from './placement.js';
import { buildAdobeTower, buildAdobeWallHouse, buildHangingBridge } from './adobe.js';
import { buildMiningShack, buildScaffoldShack, buildLantern, buildHangingShack } from './mining.js';
import { mirrorParts, rect, pick, step4 } from './shapes.js';
import { MAT_WOOD } from './chunks.js';
import { TOWN_BODY_COLORS, TOWN_DETAIL_COLORS } from './palette.js';

/** 天井までの空き（タイル）から、日干し煉瓦（A）を選ぶ確率 */
export function adobeShare(headroom) {
    const span = TOWN_ADOBE_HEADROOM_WIDE - TOWN_ADOBE_HEADROOM_NARROW;
    const t = Math.max(0, Math.min(1, (headroom - TOWN_ADOBE_HEADROOM_NARROW) / span));
    return TOWN_ADOBE_SHARE_NARROW + (TOWN_ADOBE_SHARE_WIDE - TOWN_ADOBE_SHARE_NARROW) * t;
}

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function touchesRect(s, rc) {
    const r0 = Math.floor(s.y / T), r1 = Math.floor((s.y + s.h - 1) / T);
    const c0 = Math.floor(s.x / T), c1 = Math.floor((s.x + s.w - 1) / T);
    return r0 <= rc.r1 && r1 >= rc.r0 && c0 <= rc.c1 && c1 >= rc.c0;
}

/**
 * 同じ床の区間で隣り合う塔の上の階を、木の橋でつなぐ（シバーム）。
 * 橋は左の塔の部品として足す。段2で左の塔が崩れれば橋も一緒に落ちる
 * （右の塔には支えられない。支えは岩だけ、という規則を崩さないため）。
 */
function bridgeTowers(runSpecs, rng) {
    const bodyTop = (s) => s.y + s.h - s.insets.length * 4;
    const rowAt = (s, y) => Math.min(s.insets.length - 1, Math.max(0, Math.floor((s.y + s.h - y - 1) / 4)));
    for (let i = 0; i + 1 < runSpecs.length; i++) {
        const a = runSpecs[i];
        const b = runSpecs[i + 1];
        if (!a.insets || !b.insets) continue;
        const gap = (b.x + b.footX) - (a.x + a.footX + a.footW);
        // 16px 未満の隙間に架けると、橋ではなく塔がくっついて見える
        if (gap < 16 || gap > 48) continue;
        if (rng.next() >= TOWN_TOWER_BRIDGE_CHANCE) continue;
        const by = Math.max(bodyTop(a), bodyTop(b)) + 12;   // 低いほうの塔の最上階の床
        if (a.y + a.h - by < 24) continue;                   // 2階より下には架けない
        const x0 = a.x + a.footX + a.footW - a.insets[rowAt(a, by)];
        const x1 = b.x + b.footX + b.insets[rowAt(b, by)];
        const lx = x0 - a.x;
        const ly = by - a.y;
        rect(a.parts, lx, ly, x1 - x0, 4, pick(rng, TOWN_BODY_COLORS.wood), MAT_WOOD, false);
        rect(a.parts, lx, ly - 5, x1 - x0, 1, TOWN_DETAIL_COLORS.rope);
        a.w = Math.max(a.w, lx + (x1 - x0));
    }
}

export function generateTown({ grid, rows, cols, excludeRects = [], rng }) {
    const sites = findSites(grid, rows, cols);
    const specs = [];
    const fits = (s) => s.x >= 0 && s.y >= 0 && s.x + s.w <= cols * T && s.y + s.h <= rows * T
        && !excludeRects.some((rc) => touchesRect(s, rc));
    const add = (s) => {
        if (!fits(s)) return false;
        if (s.site !== 'floor' && specs.some((o) => overlaps(o, s))) return false;
        specs.push(s);
        return true;
    };

    // --- 床 ---
    for (const run of sites.floors) {
        if (run.headroom < TOWN_MIN_HEADROOM) continue;
        // 土台は床の岩に埋める。高さの上限は「天井から CLEARANCE タイル下」まで
        const groundY = run.r * T + TOWN_FOUNDATION_SINK;
        const maxH = (run.headroom - TOWN_CEILING_CLEARANCE) * T + TOWN_FOUNDATION_SINK;
        const share = adobeShare(run.headroom);
        const runSpecs = [];
        const xEnd = run.c1 * T;
        let x = run.c0 * T;
        while (xEnd - x >= 16) {
            if (rng.next() > TOWN_FLOOR_FILL) { x += step4(rng, 8, 32); continue; }   // 空き地
            const style = rng.next() < share ? 'A' : 'C';
            const b = style === 'A'
                ? buildAdobeTower(rng, { maxW: xEnd - x, maxH })
                : buildMiningShack(rng, { maxW: xEnd - x, maxH });
            if (!b) { x += 8; continue; }
            const spec = {
                site: 'floor', style, kind: b.kind,
                x: x - b.footX, y: groundY - b.h, w: b.w, h: b.h, parts: b.parts,
                footX: b.footX, footW: b.footW, headroom: run.headroom,
            };
            if (b.insets) spec.insets = b.insets;
            if (add(spec)) runSpecs.push(spec);
            x += b.footW + step4(rng, 0, 8);
        }
        bridgeTowers(runSpecs, rng);
    }

    // --- 壁 ---
    for (const run of sites.walls) {
        const len = run.r1 - run.r0;
        if (len < TOWN_WALL_MIN_RUN || run.reach < TOWN_WALL_MIN_REACH) continue;
        const share = adobeShare(run.reach);
        const maxReach = Math.min(run.reach, 6) * T;
        const tries = Math.max(1, Math.floor(len / TOWN_WALL_SPACING));
        for (let k = 0; k < tries; k++) {
            if (rng.next() > TOWN_WALL_HOUSE_CHANCE) continue;
            const r = run.r0 + 1 + Math.floor(rng.next() * Math.max(1, len - 2));
            const style = rng.next() < share ? 'A' : 'C';
            const b = style === 'A' ? buildAdobeWallHouse(rng, { maxReach }) : buildScaffoldShack(rng, { maxReach });
            if (!b) continue;
            // 組み立ては「壁の右側に張り付く」向き。壁の左側（side: 'left'）なら反転する。
            // どちらも壁側の 4px が壁のタイルに入る位置に置く（そこが支え）
            const right = run.side === 'right';
            add({
                site: 'wall', style, kind: b.kind,
                x: right ? (run.c + 1) * T - 4 : run.c * T + 4 - b.w,
                y: r * T, w: b.w, h: b.h,
                parts: right ? b.parts : mirrorParts(b.parts, b.w),
            });
        }
    }

    // --- 天井 ---
    for (const run of sites.ceilings) {
        if (run.c1 - run.c0 < TOWN_CEIL_MIN_RUN || run.drop < TOWN_CEIL_MIN_DROP) continue;
        const maxHang = (run.drop - TOWN_CEIL_KEEP_BELOW) * T;
        const share = adobeShare(run.drop);
        const y = (run.r + 1) * T - 4;   // 綱の上端 4px を天井の岩に埋める
        let c = run.c0 + 1;
        while (c < run.c1 - 1) {
            const style = rng.next() < share ? 'A' : 'C';
            const room = (run.c1 - 1 - c) * T;
            let b;
            if (style === 'A' && room >= 64 && rng.next() < 0.5) {
                b = buildHangingBridge(rng, { span: step4(rng, 64, Math.min(160, room)), maxHang });
            } else if (style === 'C' && rng.next() < 0.4) {
                b = buildHangingShack(rng, { maxHang });
            } else {
                b = buildLantern(rng, { maxHang });
            }
            if (b) {
                add({ site: 'ceiling', style, kind: b.kind, x: c * T + step4(rng, 0, 8), y, w: b.w, h: b.h, parts: b.parts });
            }
            c += Math.max(3, Math.ceil((b ? b.w : 16) / T)) + Math.floor(rng.next() * 4);
        }
    }
    return specs;
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm test -- tests/town-generate.test.js`
Expected: PASS。落ちたら数値（`TOWN_*`）を動かす前に、何が起きているかを数える。たとえば「半分以上に建物がある」が落ちたら、区間の長さと棟数を seed ごとに出して、どこで建たずに抜けているか（`buildAdobeTower` が `null` を返しているのか、空き地の確率なのか）を見る。

- [ ] **Step 5: わざと壊して赤くなることを確かめる**

- `maxH` の `- TOWN_CEILING_CLEARANCE` を消す → 「上 2 タイルは空いている」が赤
- `fits` の `excludeRects` の判定を消す → 「基地の部屋に…掛かる建物は無い」が赤（ならなければ、基地の部屋に床の区間がある seed か確かめる）
- `adobeShare` の戻り値を `0.5` 固定にする → 「A と C の割合が変わる」が赤
- `add` の重なりの判定を消す → 「重ならない」が赤
- `bridgeTowers(runSpecs, rng);` の呼び出しを消す → 「橋でつなぐことがある」が赤

- [ ] **Step 6: コミット**

```bash
git add src/js/world/town/generate.js tests/town-generate.test.js
git commit -m "feat: 床・壁・天井に町を並べ、隣の塔を橋でつなぐ

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 町を持って描く（`Town.js`）

**Files:**
- Create: `src/js/world/town/Town.js`
- Test: `tests/town-draw.test.js`

**Interfaces:**
- Consumes: `rasterizeParts` / `computeAnchors`（Task 1）、`paintParts`（Task 1）、`Spec`（Task 5）
- Produces:
  - `new Town(specs, { isSolidTile = () => false, createCanvas = (w, h) => canvas })`
  - `town.buildings: Array<{ id, site, style, kind, x, y, width, height, cells, cw, ch, anchors, canvas }>`（段2以降はこれを読み書きする）
  - `town.draw(ctx, view: { x, y, w, h })` — 外接矩形が view に掛かる建物だけ `ctx.drawImage(canvas, x, y)`

- [ ] **Step 1: 失敗するテストを書く**

`tests/town-draw.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { Town } from '../src/js/world/town/Town.js';
import { MAT_ADOBE, SOLID } from '../src/js/world/town/chunks.js';

function fakeCanvasFactory() {
    const made = [];
    const create = (w, h) => {
        const cv = { width: w, height: h, ctx: makeFakeCtx() };
        cv.getContext = () => cv.ctx;
        made.push(cv);
        return cv;
    };
    return { made, create };
}

const spec = (x, y, extra = {}) => ({
    site: 'floor', style: 'A', kind: 'tower', x, y, w: 16, h: 16,
    parts: [
        { x: 0, y: 0, w: 16, h: 16, color: '#7d5a2a', mat: MAT_ADOBE, solid: true },
        { x: 0, y: 0, w: 4, h: 4, color: null, mat: MAT_ADOBE, solid: false },
    ],
    ...extra,
});

test('建物ごとに canvas を1枚作り、色のある部品だけを塗る', () => {
    const { made, create } = fakeCanvasFactory();
    new Town([spec(0, 0)], { createCanvas: create });
    assert.equal(made.length, 1);
    assert.equal(made[0].width, 16);
    const fills = made[0].ctx.calls.filter((c) => c.name === 'fillRect');
    assert.equal(fills.length, 1, 'color が null の部品は塗らない');
});

test('かけらの表と支えを持つ', () => {
    const { create } = fakeCanvasFactory();
    // (0, 12) に 16x16。下の段のかけら（中心 y=26）はタイル行1
    const town = new Town([spec(0, 12)], { createCanvas: create, isSolidTile: (r) => r === 1 });
    const b = town.buildings[0];
    assert.equal(b.cw, 4);
    assert.equal(b.cells[5], MAT_ADOBE | SOLID);
    assert.ok(b.anchors.length > 0);
    assert.ok(b.anchors.every((a) => a.r === 1));
});

test('画面に掛かる建物だけを、その位置に描く', () => {
    const { create } = fakeCanvasFactory();
    const town = new Town([
        spec(1100, 600),   // 中
        spec(4000, 600),   // 右の遠く
        spec(1100, 3000),  // 下の遠く
        spec(2020, 600),   // 右端をまたぐ（2020〜2036、画面は 〜2024）
        spec(990, 490),    // 左上の角をまたぐ（990〜1006 / 490〜506）
        spec(980, 600),    // 左の外にぴったり接する（980〜996 は 1000 に届かない）
    ], { createCanvas: create });
    const ctx = makeFakeCtx();
    town.draw(ctx, { x: 1000, y: 500, w: 1024, h: 768 });
    const drawn = ctx.calls.filter((c) => c.name === 'drawImage').map((c) => [c.args[1], c.args[2]]);
    assert.deepEqual(drawn, [[1100, 600], [2020, 600], [990, 490]]);
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npm test -- tests/town-draw.test.js`
Expected: FAIL（`Town.js` が無い）

- [ ] **Step 3: `Town.js` を書く**

`src/js/world/town/Town.js`:

```js
// ============================================
// Town - 3面の町並み
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md
// 建物1棟ごとに canvas を1枚焼き、毎フレームは画面に掛かる建物を drawImage で
// 貼るだけにする（案1。町全体を1枚に焼く案は、段2で崩れ落ちる部分を毎回
// 大きな絵から切り出すことになるので採らなかった）。
// 段1は置いて描くだけ。段2以降はこの buildings の cells / anchors を読み書きする。
//
// 描く場所は main._drawWorld の「遠景のあと・地形の前」。土台は岩の縁の奥に隠れ、
// 機体や弾は必ず建物より手前に出る。

import { rasterizeParts, computeAnchors } from './chunks.js';
import { paintParts } from './shapes.js';

function defaultCreateCanvas(w, h) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    return cv;
}

export class Town {
    /**
     * @param {Array<object>} specs generateTown() の設計図
     * @param {{isSolidTile?: (r:number, c:number) => boolean, createCanvas?: (w:number, h:number) => object}} [opts]
     */
    constructor(specs, { isSolidTile = () => false, createCanvas = defaultCreateCanvas } = {}) {
        this.buildings = specs.map((spec, id) => {
            const { cells, cw, ch } = rasterizeParts(spec.parts, spec.w, spec.h);
            const canvas = createCanvas(spec.w, spec.h);
            paintParts(canvas.getContext('2d'), spec.parts);
            return {
                id, site: spec.site, style: spec.style, kind: spec.kind,
                x: spec.x, y: spec.y, width: spec.w, height: spec.h,
                cells, cw, ch,
                anchors: computeAnchors(cells, cw, ch, spec.x, spec.y, isSolidTile),
                canvas,
            };
        });
    }

    /**
     * 画面に掛かる建物だけを描く。ctx はワールド座標に translate 済み。
     * 判定は外接矩形の重なり（utils/viewCull.js の isInView は外接円で取るので、
     * 縦長の塔では余分に描く。数百棟を毎フレーム見るので矩形で足りる）。
     * @param {{x:number, y:number, w:number, h:number}} view 画面のワールド矩形
     */
    draw(ctx, view) {
        const x1 = view.x + view.w;
        const y1 = view.y + view.h;
        for (const b of this.buildings) {
            if (b.x >= x1 || b.x + b.width <= view.x || b.y >= y1 || b.y + b.height <= view.y) continue;
            ctx.drawImage(b.canvas, b.x, b.y);
        }
    }
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm test -- tests/town-draw.test.js`
Expected: PASS

- [ ] **Step 5: わざと壊して赤くなることを確かめる**

- `b.x + b.width <= view.x` を `b.x <= view.x` にする → 「左上の角をまたぐ」が抜けて赤
- `b.x >= x1` を `b.x + b.width >= x1` にする → 「右端をまたぐ」が抜けて赤
- `paintParts` の `if (!p.color) continue;` を消す → 「色のある部品だけを塗る」が赤

- [ ] **Step 6: コミット**

```bash
git add src/js/world/town/Town.js tests/town-draw.test.js
git commit -m "feat: 町の建物を1棟1枚の canvas に焼き、画面内だけ描く

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Map が町を作る

**Files:**
- Modify: `src/js/world/Map.js`（import、`_generate()` の最後、新しいメソッド2つ）
- Test: `tests/MapDeterminism.test.js`（末尾に追加）

**Interfaces:**
- Consumes: `generateTown`（Task 5）、`Town`（Task 6）
- Produces:
  - `map.town: Town | null`（`STAGE_ENVIRONMENTS[...].props === 'town'` の面だけ）
  - `map._buildTownSpecs() → Spec[]`（`tools/render-town-scene.mjs` も同じ設計図を使う）

- [ ] **Step 1: 失敗するテストを書く**

`tests/MapDeterminism.test.js` の末尾に足す（ファイル冒頭の `before` が document を差し替えている。`buildMap` も同じファイルのものを使う）:

```js
// 3面の町（docs/superpowers/specs/2026-10-11-stage3-town-design.md）。
// 町は敵の湧き位置を決めたあとに作るので、「敵配置が変わらない」を比べても恒真になる。
// 見るべきは**このあと SpawnManager が使う game.rng の状態**。町を無効化したビルドと
// 状態が一致するのは、町が派生ストリームしか使っていないときだけ。
test('stage 3 builds a town; stage 1 has none; mission 10 (= stage 3 mod 7) has one too', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  assert.ok(buildMap(Map, 42, 2).town.buildings.length > 0);
  assert.equal(buildMap(Map, 42, 0).town, null);
  assert.ok(buildMap(Map, 42, 9).town.buildings.length > 0, 'debugStartMission で面数を超えても剰余で3面');
});

test('same seed produces the same town', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const summary = (m) => m.town.buildings.map((b) => [b.kind, b.x, b.y, b.width, b.height, Array.from(b.cells).join('')]);
  assert.deepEqual(summary(buildMap(Map, 42, 2)), summary(buildMap(Map, 42, 2)));
});

test('building the town does not consume game.rng (SpawnManager runs on it next)', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const withTown = { rng: new SeededRNG(42) };
  new Map(withTown, 2);

  const original = Map.prototype._generateTown;
  Map.prototype._generateTown = function () { /* no-op: 町を作らない */ };
  const withoutTown = { rng: new SeededRNG(42) };
  try {
    new Map(withoutTown, 2);
  } finally {
    Map.prototype._generateTown = original;
  }
  assert.equal(withTown.rng.state, withoutTown.rng.state);
});

test('every building in the town is held by rock (floor, wall or ceiling)', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  for (const seed of [1, 2, 3]) {
    const m = buildMap(Map, seed, 2);
    for (const b of m.town.buildings) {
      assert.ok(b.anchors.length > 0, `seed ${seed}: ${b.site} の ${b.kind} (${b.x},${b.y}) が浮いている`);
    }
  }
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npm test -- tests/MapDeterminism.test.js`
Expected: FAIL（`Cannot read properties of undefined (reading 'buildings')` など）

- [ ] **Step 3: Map に足す**

`src/js/world/Map.js` の import 群（`import { carveFortressZones } ...` の下）に足す:

```js
import { generateTown } from './town/generate.js';
import { Town } from './town/Town.js';
```

`_generate()` の最後、`this.backdrop = new CaveBackdrop(...)` の閉じ括弧のあとに足す:

```js

        // Step 13: 3面の町並み（設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md）。
        // 遠景と同じく派生ストリームで、game.rng は消費しない（このあと SpawnManager が使う）。
        // missionLevel はデバッグで面数を超えうるので、パレットと同じく剰余で丸める
        this.town = null;
        if (STAGE_ENVIRONMENTS[this.missionLevel % STAGE_ENVIRONMENTS.length].props === 'town') {
            this._generateTown();
        }
```

`_reservedRects()` の下にメソッドを2つ足す:

```js
    /**
     * 町の設計図。tools/render-town-scene.mjs も同じものを呼ぶ（乱数の作り方を
     * 2か所に書くと、道具の絵と実機の町が食い違うため）。町は生成の最後に作るので、
     * 生成後に呼んでも game.rng.state は生成中と同じ値で、同じ町になる。
     */
    _buildTownSpecs() {
        return generateTown({
            grid: this.grid, rows: this.rows, cols: this.cols,
            // 基地の部屋だけ避ける。開始の部屋には置く（面に入った瞬間に町だと分かるように）
            excludeRects: [this._reservedRects()[1]],
            rng: new SeededRNG((this.game.rng.state ^ 0x70E4E5) >>> 0),
        });
    }

    _generateTown() {
        this.town = new Town(this._buildTownSpecs(), { isSolidTile: (r, c) => this.isSolid(r, c) });
    }
```

`STAGE_ENVIRONMENTS` が Map.js の Constants の import に入っているか確かめる（`this.envKind = STAGE_ENVIRONMENTS[...]` で使っているので入っている）。

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm test -- tests/MapDeterminism.test.js`
Expected: PASS

- [ ] **Step 5: わざと壊して赤くなることを確かめる**

- `_buildTownSpecs()` の先頭に `this.game.rng.next();` を足す → 「does not consume game.rng」が赤
- `% STAGE_ENVIRONMENTS.length` を外す → 「mission 10」が赤（例外で落ちる）
- `computeAnchors` に渡す `isSolidTile` を `() => false` にする → 「held by rock」が赤

- [ ] **Step 6: 全テストを流す**

Run: `npm test`
Expected: すべて PASS。3面（missionLevel 2）の Map を作るテストは他にもあり、町のぶん少し遅くなる。`npm test` 全体が 1 秒弱から大きく延びたら（2 秒を超えたら）、どのテストかを `node --test --test-reporter=spec` で見て、遅いのが町の生成なら Task 9 で時間を測ってから対処する。

- [ ] **Step 7: コミット**

```bash
git add src/js/world/Map.js tests/MapDeterminism.test.js
git commit -m "feat: 3面の Map が町を作る（派生乱数で、敵の構成を変えない）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 遠景と地形のあいだに描く（`main.js`）

**Files:**
- Modify: `src/js/main.js`（`_drawWorld()` の `this.env.drawBehindTerrain(ctx, camX, camY);` の直後）
- Test: `tests/town-draw-wiring.test.js`

**Interfaces:**
- Consumes: `map.town.draw(ctx, view)`（Task 6）

- [ ] **Step 1: 失敗するテストを書く**

`tests/town-draw-wiring.test.js`:

```js
// 町を「遠景のあと・地形の前」に描く配線。Game._drawWorld() を本物のまま呼び、
// 呼ばれた順番を記録する（ソース文字列の grep にはしない。CLAUDE.md）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { Game } from '../src/js/main.js';

function makeWorld(order, town) {
    const noop = () => {};
    return {
        gameState: 'playing',
        simAlpha: 1,
        canvas: { width: 1024, height: 768 },
        camera: { x: 1000, y: 500, renderX: () => 1000, renderY: () => 500 },
        map: { backdrop: { draw: () => order.push('backdrop') }, draw: () => order.push('map'), town },
        env: { update: noop, drawBehindTerrain: () => order.push('behind'), drawOverWorld: noop, drawOverlay: noop },
        carrier: null, player: null, flag: null, grenadeTrajectory: null,
        enemies: [], landmines: [], barriers: [],
        projectiles: [], particles: [], repairKits: [], autoAimUnits: [],
        missileKits: [], enemyBullets: [], smokeScreens: [],
        _applyRenderInterpolation: noop,
        _restoreRenderInterpolation: noop,
        _drawHpBarIfDamaged: noop,
        _drawGrenadeTrajectory: noop,
    };
}

test('町は遠景と環境の奥の描画のあと、地形の前に、画面のワールド矩形で描く', () => {
    const order = [];
    let view = null;
    const town = { draw: (ctx, v) => { order.push('town'); view = v; } };
    Game._drawWorld.call(makeWorld(order, town), makeFakeCtx());
    assert.deepEqual(order, ['backdrop', 'behind', 'town', 'map']);
    assert.deepEqual(view, { x: 1000, y: 500, w: 1024, h: 768 });
});

test('町の無い面では何もしない', () => {
    const order = [];
    Game._drawWorld.call(makeWorld(order, null), makeFakeCtx());
    assert.deepEqual(order, ['backdrop', 'behind', 'map']);
});
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npm test -- tests/town-draw-wiring.test.js`
Expected: FAIL（1つ目: `order` に `'town'` が無い）

- [ ] **Step 3: `main.js` に描画を足す**

**この編集の前に** `grep -n "debugStartMission:" src/js/main.js` で、そのときのデバッグ値を控える（計画を書いた時点では 2）。

`src/js/main.js` の `_drawWorld()` で、`this.env.drawBehindTerrain(ctx, camX, camY);` の直後に足す:

```js

        // 3面の町並み。遠景より手前・地形より奥（土台は岩の縁に隠れ、機体は必ず手前に出る）
        if (this.map.town) {
            this.map.town.draw(ctx, { x: camX, y: camY, w: this.canvas.width, h: this.canvas.height });
        }
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm test -- tests/town-draw-wiring.test.js`
Expected: PASS

- [ ] **Step 5: わざと壊して赤くなることを確かめる**

足した3行を `this.map.draw(ctx);` の後ろへ移す → 1つ目のテストが赤（順番が `map, town`）。確かめたら元の位置に戻す。

- [ ] **Step 6: 全テストを流す**

Run: `npm test`
Expected: すべて PASS

- [ ] **Step 7: 自分の変更だけをステージしてコミット**

`main.js` には、ユーザーの `debugStartMission` の編集が未コミットで残っている。**`git add src/js/main.js` は使わない。** ステージには、デバッグ値だけを 0 に戻した写しを載せる。作業ツリーの `main.js` には触らない。

```bash
SCRATCH=/private/tmp/claude-501/-Users-nao-Library-CloudStorage-GoogleDrive-nfujii-npr-gmail-com--------Google-AI-Studio-proj-HoverAttack/25d870b8-7a10-4b06-9271-cb051695312a/scratchpad
sed -E 's/debugStartMission: [0-9]+,/debugStartMission: 0,/' src/js/main.js > "$SCRATCH/main.staged.js"
blob=$(git hash-object -w "$SCRATCH/main.staged.js")
git update-index --cacheinfo 100644,"$blob",src/js/main.js
git diff --cached src/js/main.js        # 町の描画の3行だけが出ること（debugStartMission が出ないこと）
git diff src/js/main.js                 # 作業ツリーとの差は debugStartMission の1行だけ
git add tests/town-draw-wiring.test.js
git commit -m "feat: 町を遠景と地形のあいだに描く

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
grep -n "debugStartMission:" src/js/main.js   # Step 3 で控えた値のままであること
git show HEAD:src/js/main.js | grep -n "debugStartMission:"   # コミットは 0 であること
```

---

### Task 9: PNG に書き出して見る・数と時間を測る

**Files:**
- Create: `tools/lib/pixel-canvas.mjs`
- Create: `tools/render-town-scene.mjs`

**Interfaces:**
- Consumes: `Map._buildTownSpecs()`（Task 7）、`Town`（Task 6）、`backdropColors`（CaveBackdrop）
- Produces: `PixelCanvas`（`width` / `height` の代入で画素を確保し、`getContext()` で `fillRect` / `clearRect` / `drawImage`（3引数と7引数）/ `translate` / `save` / `restore` を持つ ctx を返す）、`writePng(path, canvas, scale)`

- [ ] **Step 1: `tools/lib/pixel-canvas.mjs` を書く**

`tools/render-water-scene.mjs` の画素 canvas と PNG 書き出しから、町に要る分だけを抜き出したもの。水の道具は書き換えない（動いている道具を巻き込まないため）。

```js
// 画素を持つ最小の canvas と PNG 書き出し。tools/render-town-scene.mjs が使う。
// tools/render-water-scene.mjs の同じ部分から、町に要る fillRect / clearRect /
// drawImage だけを抜き出した（水の道具は折れ線も描くので、あちらはそのまま）。

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

function parseColor(s) {
    if (typeof s !== 'string') return [0, 0, 0, 0];
    let m = s.match(/rgba?\(([^)]+)\)/);
    if (m) {
        const p = m[1].split(',').map((v) => parseFloat(v));
        return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    }
    m = s.match(/^#([0-9a-f]{6})$/i);
    if (m) {
        const n = parseInt(m[1], 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
    }
    return [255, 0, 255, 1];   // 読めない色はマゼンタにして目立たせる
}

export class PixelCanvas {
    constructor(w = 0, h = 0) { this._w = w; this._h = h; this._alloc(); }
    _alloc() { this.px = new Float32Array(Math.max(0, this._w * this._h * 4)); }
    set width(v) { this._w = v; this._alloc(); }
    get width() { return this._w; }
    set height(v) { this._h = v; this._alloc(); }
    get height() { return this._h; }
    getContext() { return this.ctx || (this.ctx = new PixelCtx(this)); }
}

class PixelCtx {
    constructor(cv) {
        this.cv = cv; this.fillStyle = '#000'; this.globalAlpha = 1;
        this.tx = 0; this.ty = 0; this.stack = [];
    }
    save() { this.stack.push([this.tx, this.ty, this.globalAlpha, this.fillStyle]); }
    restore() { [this.tx, this.ty, this.globalAlpha, this.fillStyle] = this.stack.pop(); }
    translate(x, y) { this.tx += x; this.ty += y; }
    blend(x, y, [r, g, b, a]) {
        const { cv } = this;
        if (x < 0 || y < 0 || x >= cv._w || y >= cv._h) return;
        const i = (y * cv._w + x) * 4;
        const p = cv.px;
        const sa = a * this.globalAlpha;
        const da = p[i + 3];
        const oa = sa + da * (1 - sa);
        if (oa <= 0) return;
        p[i] = (r * sa + p[i] * da * (1 - sa)) / oa;
        p[i + 1] = (g * sa + p[i + 1] * da * (1 - sa)) / oa;
        p[i + 2] = (b * sa + p[i + 2] * da * (1 - sa)) / oa;
        p[i + 3] = oa;
    }
    fillRect(x, y, w, h) {
        const col = parseColor(this.fillStyle);
        const x0 = Math.floor(x + this.tx), y0 = Math.floor(y + this.ty);
        for (let py = y0; py < y0 + Math.ceil(h); py++) {
            for (let px = x0; px < x0 + Math.ceil(w); px++) this.blend(px, py, col);
        }
    }
    clearRect(x, y, w, h) {
        const { cv } = this;
        const x0 = Math.floor(x + this.tx), y0 = Math.floor(y + this.ty);
        for (let py = Math.max(0, y0); py < Math.min(cv._h, y0 + Math.ceil(h)); py++) {
            for (let px = Math.max(0, x0); px < Math.min(cv._w, x0 + Math.ceil(w)); px++) {
                cv.px.fill(0, (py * cv._w + px) * 4, (py * cv._w + px) * 4 + 4);
            }
        }
    }
    drawImage(src, ...a) {
        // 3引数 (dx, dy) と 7引数 (sx, sy, sw, sh, dx, dy) を受ける
        const [sx, sy, sw, sh, dx, dy] = a.length === 2 ? [0, 0, src._w, src._h, a[0], a[1]] : a;
        const s = src.px;
        for (let y = 0; y < sh; y++) {
            for (let x = 0; x < sw; x++) {
                const X = sx + x, Y = sy + y;
                if (X < 0 || Y < 0 || X >= src._w || Y >= src._h) continue;
                const i = (Y * src._w + X) * 4;
                if (s[i + 3] <= 0) continue;
                this.blend(Math.floor(dx + x + this.tx), Math.floor(dy + y + this.ty), [s[i], s[i + 1], s[i + 2], s[i + 3]]);
            }
        }
    }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
};

/** canvas を scale 倍（最近傍）にして PNG で書く */
export function writePng(path, cv, scale = 1) {
    const W = cv._w, H = cv._h, OW = W * scale, OH = H * scale;
    const raw = Buffer.alloc((OW * 3 + 1) * OH);
    for (let y = 0; y < OH; y++) {
        raw[y * (OW * 3 + 1)] = 0;
        for (let x = 0; x < OW; x++) {
            const i = (Math.floor(y / scale) * W + Math.floor(x / scale)) * 4;
            const o = y * (OW * 3 + 1) + 1 + x * 3;
            raw[o] = cv.px[i]; raw[o + 1] = cv.px[i + 1]; raw[o + 2] = cv.px[i + 2];
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(OW, 0); ihdr.writeUInt32BE(OH, 4); ihdr[8] = 8; ihdr[9] = 2;
    writeFileSync(path, Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
    ]));
}
```

- [ ] **Step 2: `tools/render-town-scene.mjs` を書く**

```js
// 3面の町を PNG に書き出す。町の絵柄・密度を調整するとき、実機を開かずに
// 前後を見比べるためのもので、ゲーム本体からは呼ばれない。
//
// 使い方:
//   node tools/render-town-scene.mjs --out town.png                       # 今週の3面、左上（開始の部屋）
//   node tools/render-town-scene.mjs --seed 3 --x 1200 --y 300 --w 1366 --h 768 --scale 1 --out a.png
//   node tools/render-town-scene.mjs --stats                              # 棟数・種類・生成時間
//
// 実物の Map を生成し、Map._buildTownSpecs() の設計図から画素を持つ canvas で町を作り直して描く。
// 地形はタイルを2色（縁と中）で塗るだけ（面取りは再現しない）。描く順はゲームと同じ
// （遠景の空洞の色 → 町 → 地形）。

import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { TILE_SIZE as T } from '../src/js/utils/Constants.js';
import { getCurrentWeek, stageSeed } from '../src/js/utils/WeekSeed.js';
import { PixelCanvas, writePng } from './lib/pixel-canvas.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
    return acc;
}, []));

// 地形キャッシュ・遠景・ミニマップの canvas は描かないので、何もしない ctx を渡す
const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };

const { Map: GameMap } = await import('../src/js/world/Map.js');
const { Town } = await import('../src/js/world/town/Town.js');
const { backdropColors } = await import('../src/js/world/CaveBackdrop.js');

const MISSION = 2;   // 3面
const seed = args.seed ? Number(args.seed) : stageSeed(getCurrentWeek().seed, MISSION);
const map = new GameMap({ rng: new SeededRNG(seed) }, MISSION);

const t0 = performance.now();
const specs = map._buildTownSpecs();
const t1 = performance.now();
// 画素を持たない canvas で作る時間 ＝ かけらの表と支えの計算（実機の canvas の確保・塗りは別）
new Town(specs, { isSolidTile: (r, c) => map.isSolid(r, c), createCanvas: () => ({ getContext: () => noopCtx }) });
const t2 = performance.now();

if (args.stats) {
    const by = {};
    for (const s of specs) by[`${s.site}/${s.style}/${s.kind}`] = (by[`${s.site}/${s.style}/${s.kind}`] || 0) + 1;
    const area = specs.reduce((sum, s) => sum + s.w * s.h, 0);
    console.log(JSON.stringify({
        seed, map: `${map.cols}x${map.rows}`, buildings: specs.length, byKind: by,
        spriteMB: +(area * 4 / 1e6).toFixed(2),
        specsMs: +(t1 - t0).toFixed(1), rasterizeMs: +(t2 - t1).toFixed(1),
    }, null, 2));
    process.exit(0);
}

const town = new Town(specs, {
    isSolidTile: (r, c) => map.isSolid(r, c),
    createCanvas: (w, h) => new PixelCanvas(w, h),
});

const X = Number(args.x ?? 0), Y = Number(args.y ?? 0);
const W = Number(args.w ?? 1366), H = Number(args.h ?? 768);
const scale = Number(args.scale ?? 1);
const screen = new PixelCanvas(W, H);
const ctx = screen.getContext();
const style = map.blockStyles[1];
ctx.fillStyle = backdropColors(style.fill, 'cave').voidColor;
ctx.fillRect(0, 0, W, H);
ctx.translate(-X, -Y);
town.draw(ctx, { x: X, y: Y, w: W, h: H });
for (let r = Math.floor(Y / T); r <= Math.floor((Y + H) / T); r++) {
    for (let c = Math.floor(X / T); c <= Math.floor((X + W) / T); c++) {
        if (r < 0 || c < 0 || r >= map.rows || c >= map.cols || map.grid[r][c] === 0) continue;
        const st = map.blockStyles[map.grid[r][c]] || style;
        ctx.fillStyle = st.border; ctx.fillRect(c * T, r * T, T, T);
        ctx.fillStyle = st.fill; ctx.fillRect(c * T + 1, r * T + 1, T - 2, T - 2);
    }
}
const out = args.out || 'town-scene.png';
writePng(out, screen, scale);
console.log(`seed ${seed} region (${X},${Y}) ${W}x${H} buildings ${specs.length} -> ${out}`);
```

- [ ] **Step 3: 数と時間を測る**

Run: `node tools/render-town-scene.mjs --stats`
Expected: JSON が出る。`buildings` が数百、`specsMs + rasterizeMs` が 100 未満であること。`spriteMB` が spec の見込み（約 4MB）から大きく外れていないこと。値を記録しておく（実機に渡すときに伝える）。100ms を超えたら、どちらが重いかを見てから対処する（手当てを先に決めない）。

- [ ] **Step 4: 絵を書き出して自分で見る**

```bash
SCRATCH=/private/tmp/claude-501/-Users-nao-Library-CloudStorage-GoogleDrive-nfujii-npr-gmail-com--------Google-AI-Studio-proj-HoverAttack/25d870b8-7a10-4b06-9271-cb051695312a/scratchpad
node tools/render-town-scene.mjs --out "$SCRATCH/town-start.png"
node tools/render-town-scene.mjs --x 1200 --y 500 --out "$SCRATCH/town-mid.png"
node tools/render-town-scene.mjs --x 400 --y 200 --w 480 --h 270 --scale 3 --out "$SCRATCH/town-zoom.png"
```

3枚を Read で開いて見る。見るところは次のとおり。
- A と C が混ざっているか。広い部屋では塔、狭い所では小屋が多いか
- 建物が床に建って見えるか（浮いていない、土台が岩に隠れている）。天井にくっついていないか
- 壁の家、天井のランタン・吊り橋・吊り小屋があるか
- 色が岩より暗く、遠景より明るいか。窓の灯りが弾に見えないか
- 同じ形が並んで見えないか

おかしいものがあれば、該当する Task のテストに「その状態にならない」ことを足してから直す。

- [ ] **Step 5: コミット**

```bash
git add tools/lib/pixel-canvas.mjs tools/render-town-scene.mjs
git commit -m "tools: 3面の町を PNG に書き出す・数と生成時間を測る

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: 実機の確認をお願いする**

`npm test` が全部 PASS であることを確かめてから、ユーザーに次を渡す。ハードリロード（Cmd+Shift+R）が要ることだけ伝える。

| 確認ポイント | 調整する定数 |
|---|---|
| 町の密度（空き地の多さ） | `TOWN_FLOOR_FILL`（0.75） |
| 広い所の塔・狭い所の小屋の割合 | `TOWN_ADOBE_SHARE_WIDE` / `_NARROW`、`TOWN_ADOBE_HEADROOM_WIDE` / `_NARROW` |
| 天井と建物の隙間 | `TOWN_CEILING_CLEARANCE`（2） |
| 低い天井の通路に建てるか | `TOWN_MIN_HEADROOM`（4） |
| 壁の家の数 | `TOWN_WALL_HOUSE_CHANCE`（0.5）、`TOWN_WALL_SPACING`（8） |
| 吊るしものの量・低さ | `TOWN_CEIL_MIN_DROP`（8）、`TOWN_CEIL_KEEP_BELOW`（4） |
| 塔どうしの橋 | `TOWN_TOWER_BRIDGE_CHANCE`（0.4） |
| 建物の色・明るさ | `src/js/world/town/palette.js`（輝度の上下限はテストが縛る） |
| 塔・小屋の形（階の高さ・窓の並び） | `adobe.js` の `FLOOR_H` など、`mining.js` の `EAVE` など |

あわせて、Step 3 で測った棟数と生成時間を伝える。面の読み込みが重く感じるかどうかも見てもらう。
