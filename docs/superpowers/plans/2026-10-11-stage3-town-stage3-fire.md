# 3面の町並み 段3（火）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 町の建物に火がつき、材料に沿って燃え進み、焦げたかけらが崩れて家が自分から崩れ、隣の建物へ燃え移り、燃料が尽きると残り火と細い煙を残して消える。炎と煙は町の層（岩の縁より奥）に描く。

**Architecture:** 火の状態と進み方は新しい `world/town/fire.js` の `FireSystem` が持つ（spec の「fire.js — 火の進み」）。Town は `this.fire` を1つ持ち、かけらが消える・塊が切り離される・爆発・弾・落ちる破片のところで `FireSystem` に知らせるだけにする（`Town.js` は 534 行あるので、火の手順は書き足さない）。燃え進みは `TOWN_FIRE_TICK`（6 フレーム）に1回。炎・煙・残り火の粒も `FireSystem` が持ち、`Town.draw` が建物の直後（瓦礫・破片の前）に描く。乱数は Town に渡す `random`（既定 `Math.random`。spec 3章「乱数」）で、テストは種つきの乱数を渡して決める。

**Tech Stack:** バニラ ES modules、canvas 2D、`node --test`。

**Spec:** `docs/superpowers/specs/2026-10-11-stage3-town-design.md`（3章「火」、テストの表の「火」、5章「描画の重さ」）

**範囲:** spec の段3だけ。爆発物（段3b）・音（段4）は入れない。火のまわりを `lighter` 合成で明るくするかは spec のとおり重さを実測してから決めるので、この段では入れない（Task 5 で実測だけする）。

## Global Constraints

- `git add -A` / `git add .` は使わない。変更したファイルを明示して add する
- `src/js/main.js` の `debugStartMission: 2` と、`src/js/utils/Constants.js` のユーザーの IDE 自動整形（町と関係ない行）は**未コミットのまま残す**。`git checkout` / `restore` / `stash` / `reset` を打たない。Constants.js は「町の節だけを HEAD に差し込んでステージする」手順（下）でコミットする
- 一時的にわざと壊す確認は、控えのファイルを作ってから書き換え、控えから戻す
- コメントは日本語で「なぜそうしたか」。数値には根拠
- 調整用の数値は `Constants.js` の `TOWN_*`。色（描画専用）は `world/town/palette.js`
- 火のつき方・燃え広がりは Town の `random`（既定 `Math.random`）。`game.rng` は使わない（町を作ったあとの戦闘中の出来事なので週次の決定性の外。spec 3章）。テストは種つきの乱数を渡す
- 燃料・間隔は**シミュレーションのフレーム数**（60 フレーム＝1秒で換算）
- 炎・煙は町の層（遠景と地形のあいだ）に描く。`game.particles`（地形より手前）には足さない
- 粒は画面の中かそのすぐ外（`VIEW_CULL_MARGIN`）だけ出す。燃え進み・燃え移り・崩れは画面の外でも同じに進める
- テストは `npm test`。ソース文字列を grep するテストは書かない。テストを書いたら、わざと壊して赤くなることを確かめる
- 既知の失敗: `湧き位置は重複しない`（面7、週によって落ちる）。それ以外が全部通ること

**Constants.js のステージ手順**（町の節は `// --- 3面の町並み（props` から、町でない次の `// ---` の節の頭まで。町の節はファイルの末尾にある）:

```bash
S=<scratchpad>
git show HEAD:src/js/utils/Constants.js > $S/const-head.js
python3 - $S/const-head.js <<'EOF'
import sys
head = open(sys.argv[1]).read(); work = open('src/js/utils/Constants.js').read()
def sect(s):
    i = s.index('// --- 3面の町並み（props')
    j = s.index('export const TOWN_CEIL_KEEP_BELOW')
    while True:
        j = s.find('\n// ---', j + 1)
        if j < 0: return i, len(s)
        if not s.startswith('\n// --- 3面の町並み', j): return i, j
hi, hj = sect(head); wi, wj = sect(work)
open(sys.argv[1] + '.staged', 'w').write(head[:hi] + work[wi:wj] + head[hj:])
EOF
git update-index --cacheinfo 100644,$(git hash-object -w $S/const-head.js.staged),src/js/utils/Constants.js
git diff --cached src/js/utils/Constants.js   # 町の行だけが出ること
```

段3の定数の節は、段2の節の末尾（`TOWN_SWEEP_STEP` の行のあと）に `// --- 3面の町並み 段3（火）---` で始める。

## Review Focus

1. **燃えているかけらが消える**（欠け・崩れ・切り離し）: 消えたかけらの上に火が残らない（宙に浮いた火・数えられ続ける火が無い）。切り離された塊の火は破片が持っていく（Task 1・3 にテスト）
2. **上限に達したとき**（面全体 60・1棟 4）: 新しい火はつかないが、火が消えれば再びつく。上限を超えない（Task 1 にテスト）
3. **燃えている建物が崩壊する**: 崩壊で焦げた土台（段2の `CHARRED`）はもう燃えない。燃え尽きた土台は崩れ続けない（崩れは燃えているあいだだけ）（Task 2 にテスト）
4. **画面の外の火**: 燃え進み・燃え移り・崩れは進むが、粒は出さない（Task 4 にテスト）
5. **燃えている破片が落ちて砕ける**: 当たった建物に燃え移り、砕けた所の残り火は `TOWN_EMBER_FRAMES` で必ず消える（増え続けない）（Task 3・4 にテスト）

---

## ファイル構成

| ファイル | 役割 | Task |
|---|---|---|
| `src/js/world/town/fire.js` | 新規: `FireSystem`（火元・燃料・燃え進み・燃え移り・崩れ・残り火）と材料の引き方 | 1〜3 |
| `src/js/world/town/fireFx.js` | 新規: 炎の粒 `FlameParticle`・煙のパフ `SmokePuff` | 4 |
| `src/js/world/town/Town.js` | 変更: `random` と `fire` を持つ。かけらが消える・切り離し・爆発・弾・破片で `fire` に知らせる。`update` と `draw` から火を回す | 1〜4 |
| `src/js/world/town/FallingPiece.js` | 変更: `fireFuel`（燃えている破片） | 3 |
| `src/js/world/town/palette.js` | 変更: 炎の色 | 4 |
| `src/js/utils/Constants.js` | 変更: 段3の定数と `TOWN_MATERIALS`、`TOWN_PROJECTILE_IMPACT` に `ignite` | 1〜4 |
| `tools/render-town-scene.mjs` | 変更: `--fire`（燃やしてから書き出す）、`--stats` に火の重さ | 5 |

---

### Task 1: 火元・燃料・上限・自分のかけらを焦がす

**Files:**
- Create: `src/js/world/town/fire.js`
- Modify: `src/js/world/town/Town.js`
- Modify: `src/js/utils/Constants.js`
- Create: `tests/helpers/town-fire-fixtures.js`（火のテストの共有。テストのファイルどうしで import しない — 読んだ側でも相手のテストが登録されて二重に走るため）
- Test: `tests/town-fire.test.js`（新規）

**Interfaces:**
- Produces:
  - `TOWN_MATERIALS`（材料の番号 → `{ burns, bulletIgnite, spread, catch, fuel: [lo, hi], crumble }`）
  - `matOf(v)` / `burnable(v)`（`fire.js`。かけらの値から材料の行／燃えるか。焦げたかけらは燃えない）
  - `class FireSystem(town)`: `fires: Array<{b, k, fuel}>`、`ignite(b, k) → boolean`、`countIn(b)`、`isBurning(b, k)`、`onCellsRemoved(b, list)`、`update(view)`（毎フレーム。`TOWN_FIRE_TICK` ごとに `_tick()`）
  - Town: コンストラクタの `random`（既定 `Math.random`）、`this.fire`、建物の記録の `burnt: Set`（火が焦がしたかけら）、`removeAndSettle(b, list)`、`update(game)` から `this.fire.update(view)`

- [ ] **Step 1: 失敗するテストを書く**

`tests/helpers/town-fire-fixtures.js`:

```js
// 町の火のテストの共有: 材料を指定した四角い建物、岩に支えられた町（種つきの乱数）、n フレーム進める
import { SeededRNG } from '../../src/js/utils/SeededRNG.js';
import { Town } from '../../src/js/world/town/Town.js';
import { fakeCanvas } from './town-fixtures.js';

/** 材料 mat の四角い建物（全部厚い壁） */
export function made(x, y, w, h, mat, kind = 'shack') {
    return {
        site: 'floor', style: 'C', kind, x, y, w, h,
        parts: [{ x: 0, y: 0, w, h, color: '#5a3d1e', mat, solid: true }],
    };
}

/** どのかけらも岩に支えられた（崩れで落ちない）町。乱数は種つき */
export function townOf(specs, seed = 1, opts = {}) {
    const rng = new SeededRNG(seed);
    return new Town(specs, { createCanvas: fakeCanvas, isSolidTile: () => true, random: () => rng.next(), ...opts });
}

/** n フレーム進める（camera が無いので粒は全部「見えている」扱い） */
export function run(town, n) {
    const game = { particles: [], projectiles: [], camera: null, canvas: null };
    for (let i = 0; i < n; i++) town.update(game);
}
```

`tests/town-fire.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Town } from '../src/js/world/town/Town.js';
import { MAT_ADOBE, MAT_WOOD, MAT_METAL, CHARRED } from '../src/js/world/town/chunks.js';
import { TOWN_FIRE_TICK, TOWN_FIRES_MAX, TOWN_FIRES_PER_BUILDING, TOWN_MATERIALS } from '../src/js/utils/Constants.js';
import { fakeCanvas } from './helpers/town-fixtures.js';
import { made, townOf, run } from './helpers/town-fire-fixtures.js';

test('ignite: 燃える材料のかけらに火がつき、燃えない材料（金属）・空のかけら・焦げたかけらにはつかない', () => {
    const town = townOf([made(0, 0, 16, 16, MAT_WOOD), made(40, 0, 16, 16, MAT_METAL)]);
    const [wood, metal] = town.buildings;
    assert.equal(town.fire.ignite(wood, 0), true);
    assert.equal(town.fire.ignite(wood, 0), false, '同じかけらに2つ目はつかない');
    assert.equal(town.fire.ignite(metal, 0), false);
    wood.cells[1] |= CHARRED;
    assert.equal(town.fire.ignite(wood, 1), false);
    wood.cells[2] = 0;
    assert.equal(town.fire.ignite(wood, 2), false);
});

test('上限: 1棟 TOWN_FIRES_PER_BUILDING まで、面全体 TOWN_FIRES_MAX まで。消えれば再びつく', () => {
    const specs = [];
    for (let n = 0; n < 20; n++) specs.push(made(n * 40, 0, 32, 32, MAT_WOOD));
    const town = townOf(specs);
    const b0 = town.buildings[0];
    for (let k = 0; k < 10; k++) town.fire.ignite(b0, k);
    assert.equal(town.fire.countIn(b0), TOWN_FIRES_PER_BUILDING);
    for (const b of town.buildings) for (let k = 0; k < 10; k++) town.fire.ignite(b, k);
    assert.equal(town.fire.fires.length, Math.min(TOWN_FIRES_MAX, 20 * TOWN_FIRES_PER_BUILDING));
    if (town.fire.fires.length === TOWN_FIRES_MAX) {
        const last = town.buildings.find((b) => town.fire.countIn(b) === 0);
        assert.equal(town.fire.ignite(last, 0), false, '上限のあいだはつかない');
        town.fire.onCellsRemoved(b0, [...Array(b0.cells.length).keys()]);
        assert.equal(town.fire.ignite(last, 0), true, '火が減れば再びつく');
    }
});

test('燃え進みは TOWN_FIRE_TICK フレームに1回。燃えているかけらは焦げ（CHARRED）、焦げ色を1度塗る', () => {
    const town = townOf([made(0, 0, 16, 16, MAT_WOOD)]);
    const b = town.buildings[0];
    town.fire.ignite(b, 5);
    run(town, TOWN_FIRE_TICK - 1);
    assert.equal(b.cells[5] & CHARRED, 0, 'まだ焦げない');
    const before = b.canvas.ctx.calls.filter((c) => c.name === 'fillRect').length;
    run(town, 1);
    assert.equal(b.cells[5] & CHARRED, CHARRED);
    assert.ok(b.burnt.has(5));
    assert.equal(b.canvas.ctx.calls.filter((c) => c.name === 'fillRect').length, before + 1);
});

test('燃料が尽きると火は消える（土は木より早い）', () => {
    const life = (mat) => {
        const town = townOf([made(0, 0, 4, 4, mat)]);   // かけら1つ（燃え進む先が無い）
        town.fire.ignite(town.buildings[0], 0);
        let f = 0;
        while (town.fire.fires.length > 0 && f < 5000) { run(town, 1); f++; }
        return f;
    };
    const [woodLo, woodHi] = TOWN_MATERIALS[MAT_WOOD].fuel;
    const [adobeLo, adobeHi] = TOWN_MATERIALS[MAT_ADOBE].fuel;
    const w = life(MAT_WOOD), a = life(MAT_ADOBE);
    assert.ok(w >= woodLo && w <= woodHi + TOWN_FIRE_TICK, `木 ${w}`);
    assert.ok(a >= adobeLo && a <= adobeHi + TOWN_FIRE_TICK, `土 ${a}`);
});

test('燃えているかけらが欠けたら、その火は消える（宙に火が残らない）', () => {
    const town = townOf([made(0, 0, 16, 16, MAT_WOOD)]);
    const b = town.buildings[0];
    town.fire.ignite(b, 0);
    town.chip(b, 2, 2, 1);
    assert.equal(town.fire.fires.length, 0);
});

test('removeAndSettle: かけらを抜いて支えを確かめ直す（燃えて崩れたときの入口）', () => {
    // 支えは最下段だけ。中ほどの段を全部抜くと上が落ちる
    const town = new Town([made(0, 0, 8, 20, MAT_WOOD)], {
        createCanvas: fakeCanvas, isSolidTile: (r) => r === 1,   // 中心 y=18 の最下段（行 1）
    });
    const b = town.buildings[0];
    town.removeAndSettle(b, [4, 5]);   // 2段目（j=2）の2かけら
    assert.ok(town.falling.length >= 1);
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npm test -- tests/town-fire.test.js`
Expected: FAIL（`TOWN_FIRE_TICK` が export されていない SyntaxError）

- [ ] **Step 3: 実装する**

`Constants.js` の段2の節の末尾（`TOWN_SWEEP_STEP` の行のあと）に足す（上の手順でステージ）:

```js

// --- 3面の町並み 段3（火）---
// 燃え進みを計算する間隔（フレーム）。燃料・確率はこの1回ごとに数える（spec 3章）
export const TOWN_FIRE_TICK = 6;
// 面全体で同時に燃える火元の上限と、1棟あたりの上限。上限のあいだは新しく火がつかない
export const TOWN_FIRES_MAX = 60;
export const TOWN_FIRES_PER_BUILDING = 4;
// 材料ごとの燃え方（spec 3章の表）。キーはかけらの材料の番号（chunks.js の MAT_*）。
//   burns:        燃えるか（金属は燃えない。熱で焦げるだけで、燃え移りを中継しない）
//   bulletIgnite: マシンガンの弾が当たって火がつく確率（spec の初期値 木 15%・土 3%）
//   spread:       燃え進みの1回に、隣のかけらへ火が進む確率
//   catch:        別の建物の燃えているかけらから TOWN_FIRE_JUMP_RANGE 以内のとき、燃え進みの1回に燃え移る確率
//   fuel:         火元の燃料（フレーム）。spec の初期値 木 12〜20秒・土 5〜8秒
//   crumble:      燃えている建物の焦げたかけらが、燃え進みの1回に崩れて抜ける確率
// 爆発物（4）は段3b で爆発の規則を足すまで木と同じに燃やす
export const TOWN_MATERIALS = {
    1: { burns: true, bulletIgnite: 0.03, spread: 0.1, catch: 0.02, fuel: [300, 480], crumble: 0.004 },
    2: { burns: true, bulletIgnite: 0.15, spread: 0.5, catch: 0.25, fuel: [720, 1200], crumble: 0.02 },
    3: { burns: false, bulletIgnite: 0, spread: 0, catch: 0, fuel: [0, 0], crumble: 0 },
    4: { burns: true, bulletIgnite: 0.15, spread: 0.5, catch: 0.25, fuel: [720, 1200], crumble: 0.02 },
};
```

`src/js/world/town/fire.js`:

```js
// ============================================
// fire - 町の火（火元・燃料・燃え進み・燃え移り・崩れ・残り火）
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md（3章）
// 火元はかけら1つ。燃え進みの1回（TOWN_FIRE_TICK フレームごと）に、自分のかけらを焦がし、
// 燃料を減らし、材料に沿って隣のかけらへ進み、近くの別の建物へ燃え移る。
// 焦げたかけらは燃えているあいだだけ確率で崩れて抜け、支えが切れれば上が落ちる
// （燃えた家がやがて自分から崩れる）。
// 町の状態（かけら・支え・破片）を変えるのは Town のメソッド経由だけにする。ここは火のことだけを持つ。
// 乱数は town.random（既定 Math.random。spec 3章「乱数」）。

import { CHUNK, MAT_MASK, CHARRED } from './chunks.js';
import { TOWN_RUIN_SHADE } from './palette.js';
import {
    TOWN_MATERIALS, TOWN_FIRE_TICK, TOWN_FIRES_MAX, TOWN_FIRES_PER_BUILDING,
} from '../../utils/Constants.js';

const HALF = CHUNK / 2;

/** かけらの値から材料の行（空なら undefined） */
export const matOf = (v) => (v ? TOWN_MATERIALS[v & MAT_MASK] : undefined);

/** 燃えるかけらか。焦げたかけら（燃え尽きた所・崩壊の土台）はもう燃えない */
export const burnable = (v) => !!v && !(v & CHARRED) && !!(matOf(v) && matOf(v).burns);

export class FireSystem {
    constructor(town) {
        this.town = town;
        this.fires = [];
        this.frame = 0;
    }

    countIn(b) {
        let n = 0;
        for (const f of this.fires) if (f.b === b) n++;
        return n;
    }

    isBurning(b, k) {
        return this.fires.some((f) => f.b === b && f.k === k);
    }

    /** かけら k に火をつける。燃えない・もう燃えている・上限なら false */
    ignite(b, k) {
        if (this.fires.length >= TOWN_FIRES_MAX) return false;
        const v = b.cells[k];
        if (!burnable(v) || this.isBurning(b, k) || this.countIn(b) >= TOWN_FIRES_PER_BUILDING) return false;
        const [lo, hi] = matOf(v).fuel;
        this.fires.push({ b, k, fuel: lo + Math.floor(this.town.random() * (hi - lo + 1)) });
        return true;
    }

    /** かけらが消えた（欠け・崩れ・切り離し）。その上の火も消す */
    onCellsRemoved(b, list) {
        if (this.fires.length === 0) return;
        const gone = new Set(list);
        this.fires = this.fires.filter((f) => !(f.b === b && gone.has(f.k)));
    }

    /** 毎フレーム。燃え進みは TOWN_FIRE_TICK フレームに1回 */
    update() {
        this.frame++;
        if (this.frame % TOWN_FIRE_TICK === 0) this._tick();
    }

    _tick() {
        for (const f of [...this.fires]) {
            if (!this.fires.includes(f)) continue;
            const { b } = f;
            if (!b.cells[f.k]) { this._remove(f); continue; }
            this._char(b, f.k);
            f.fuel -= TOWN_FIRE_TICK;
            if (f.fuel <= 0) this._remove(f);
        }
    }

    _remove(f) {
        const i = this.fires.indexOf(f);
        if (i >= 0) this.fires.splice(i, 1);
    }

    /** かけらを焦がす（1度だけ焦げ色を重ねる）。燃えているあいだの崩れの対象に入れる */
    _char(b, k) {
        if (b.cells[k] & CHARRED) return;
        b.cells[k] |= CHARRED;
        b.burnt.add(k);
        const i = k % b.cw;
        b.ctx.fillStyle = TOWN_RUIN_SHADE;
        b.ctx.fillRect(i * CHUNK, ((k - i) / b.cw) * CHUNK, CHUNK, CHUNK);
    }

    /** かけらの中心のワールド座標 */
    static center(b, k) {
        const i = k % b.cw;
        return { x: b.x + i * CHUNK + HALF, y: b.y + ((k - i) / b.cw) * CHUNK + HALF };
    }
}
```

`Town.js`:
- import に `import { FireSystem } from './fire.js';`
- コンストラクタの引数に `random = Math.random` を足し、`this.random = random;` と `this.fire = new FireSystem(this);`（`this.falling = [];` の前）
- 建物の記録に `burnt: new Set(),`（`collapsed: false` の隣）
- `_removeCells(b, list)` の最後に `this.fire.onCellsRemoved(b, list);`
- メソッドを足す:

```js
    /** かけらを抜いて支えを確かめ直す（燃えて崩れたかけら。fire.js から） */
    removeAndSettle(b, list) {
        if (list.length === 0) return;
        this._removeCells(b, list);
        this._charEdges(b, list);
        this._settle(b);
    }
```

- `update(game)` の `this._updateFalling();` のあとに `this.fire.update();`

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test -- tests/town-fire.test.js tests/town-chip.test.js tests/town-settle.test.js tests/town-falling.test.js`
Expected: PASS

ミューテーション（控えから戻す）: `this.countIn(b) >= TOWN_FIRES_PER_BUILDING` を外す → 上限のテストが赤。`_removeCells` の `onCellsRemoved` を消す → 「欠けたら火は消える」が赤。`_tick` の `f.fuel -= TOWN_FIRE_TICK` を `f.fuel -= 1` にする → 燃料のテストが赤。

- [ ] **Step 5: コミット**

```bash
git add src/js/world/town/fire.js src/js/world/town/Town.js tests/town-fire.test.js tests/helpers/town-fire-fixtures.js
# Constants.js は上の手順でステージ
git commit -m "feat: 町の火元（燃料・上限・自分のかけらを焦がす）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 燃え進む・燃え移る・焦げたかけらが崩れる

**Files:**
- Modify: `src/js/world/town/fire.js`
- Modify: `src/js/utils/Constants.js`
- Test: `tests/town-fire-spread.test.js`（新規）

**Interfaces:**
- Consumes: `FireSystem`、`matOf` / `burnable`、`Town.removeAndSettle`、`Town.buildingsInCircle`（Task 1・段2）
- Produces: `_tick()` が燃え進み（`_spreadWithin`）・燃え移り（`_jumpAcross`）・崩れ（`_crumble`）を行う。定数 `TOWN_FIRE_BRANCH` / `TOWN_FIRE_JUMP_RANGE` / `TOWN_METAL_SCORCH`

- [ ] **Step 1: 失敗するテストを書く**

`tests/town-fire-spread.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAT_ADOBE, MAT_WOOD, MAT_METAL, CHARRED } from '../src/js/world/town/chunks.js';
import { Town } from '../src/js/world/town/Town.js';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { fakeCanvas } from './helpers/town-fixtures.js';
import { made, townOf, run } from './helpers/town-fire-fixtures.js';

const charredCount = (b) => [...b.cells].filter((v) => v & CHARRED).length;

test('火は材料に沿って隣のかけらへ燃え進む（木は土より速く広がる）', () => {
    const spreadOf = (mat) => {
        let total = 0;
        for (let seed = 1; seed <= 20; seed++) {
            const town = townOf([made(0, 0, 64, 4, mat)], seed);   // 横一列 16 かけら
            town.fire.ignite(town.buildings[0], 0);
            run(town, 120);                                          // 2秒
            total += charredCount(town.buildings[0]);
        }
        return total / 20;
    };
    const wood = spreadOf(MAT_WOOD), adobe = spreadOf(MAT_ADOBE);
    assert.ok(wood >= 4, `木 ${wood}`);
    assert.ok(wood > adobe * 2, `木 ${wood} / 土 ${adobe}`);
});

test('金属は燃えず、燃え移りを中継しない（金属の向こうの木は燃えない）', () => {
    // 木(1) | 金属(2) | 木(1) を横に並べた1棟。左の木に火をつける
    const spec = {
        site: 'floor', style: 'C', kind: 'shack', x: 0, y: 0, w: 16, h: 4,
        parts: [
            { x: 0, y: 0, w: 4, h: 4, color: '#5a3d1e', mat: MAT_WOOD, solid: true },
            { x: 4, y: 0, w: 8, h: 4, color: '#4f4a42', mat: MAT_METAL, solid: true },
            { x: 12, y: 0, w: 4, h: 4, color: '#5a3d1e', mat: MAT_WOOD, solid: true },
        ],
    };
    for (let seed = 1; seed <= 10; seed++) {
        const town = townOf([spec], seed);
        const b = town.buildings[0];
        town.fire.ignite(b, 0);
        run(town, 1500);
        assert.equal(b.cells[3] & CHARRED, 0, `seed ${seed}: 右の木が焦げた`);
        assert.ok(!town.fire.fires.some((f) => f.k === 1 || f.k === 2), '金属の上に火元がある');
    }
});

test('燃え移り: 8px 以内の別の建物へ、相手の材料の燃え移りやすさで（木は土より移りやすい）', () => {
    const catchRate = (mat) => {
        let caught = 0;
        for (let seed = 1; seed <= 40; seed++) {
            // 左は燃え広がらないかけら1つの木、右は 4px あけて相手の材料
            const town = townOf([made(0, 0, 4, 4, MAT_WOOD), made(8, 0, 16, 16, mat)], seed);
            town.fire.ignite(town.buildings[0], 0);
            // 1秒（燃え進み 10 回）。長く待つと土でも何度も試すうちに移ってしまい差が見えない
            // （catch 0.02 で 50 回なら 64%）
            run(town, 60);
            if (charredCount(town.buildings[1]) > 0) caught++;
        }
        return caught;
    };
    const wood = catchRate(MAT_WOOD), adobe = catchRate(MAT_ADOBE);
    assert.ok(wood >= 25, `木 ${wood}/40`);
    assert.ok(wood > adobe * 2, `木 ${wood} / 土 ${adobe}`);
});

test('8px より離れた建物には燃え移らない', () => {
    for (let seed = 1; seed <= 10; seed++) {
        const town = townOf([made(0, 0, 4, 4, MAT_WOOD), made(16, 0, 16, 16, MAT_WOOD)], seed);
        town.fire.ignite(town.buildings[0], 0);
        run(town, 600);
        assert.equal(charredCount(town.buildings[1]), 0);
    }
});

test('燃えた家はやがて自分から崩れる（焦げたかけらが抜けて、支えが切れた上が落ちる）', () => {
    let fell = 0;
    for (let seed = 1; seed <= 10; seed++) {
        const rng = new SeededRNG(seed);
        // 細い木の柱（幅 4px）。支えは最下段だけ
        const town = new Town([made(0, 0, 4, 40, MAT_WOOD)], {
            createCanvas: fakeCanvas, isSolidTile: (r) => r === 2, random: () => rng.next(),
        });
        const b = town.buildings[0];
        town.fire.ignite(b, 5);
        run(town, 1200);
        if (town.falling.length > 0 || b.remaining < b.total) fell++;
    }
    assert.ok(fell >= 5, `${fell}/10`);
});

test('崩れは燃えているあいだだけ。火が消えた建物の焦げたかけらは残り続ける', () => {
    const town = townOf([made(0, 0, 16, 16, MAT_WOOD)], 3);
    const b = town.buildings[0];
    town.fire.ignite(b, 0);
    let f = 0;
    while (town.fire.fires.length > 0 && f < 10000) { run(town, 1); f++; }
    const left = b.remaining;
    run(town, 3000);
    assert.equal(b.remaining, left);
});

test('崩壊で焦げた土台（CHARRED）はもう燃えない', () => {
    const town = townOf([made(0, 0, 16, 16, MAT_WOOD)]);
    const b = town.buildings[0];
    for (let k = 0; k < b.cells.length; k++) b.cells[k] |= CHARRED;
    assert.equal(town.fire.ignite(b, 0), false);
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npm test -- tests/town-fire-spread.test.js`
Expected: FAIL（燃え進まない・燃え移らない・崩れない。金属・8px・崩壊の土台のテストは通ってよい — 燃え広がりが無ければ当然通るので、Step 4 のミューテーションで確かめる）

- [ ] **Step 3: 実装する**

`Constants.js` の段3の節に足す:

```js
// 火が隣へ進むとき、元の火元を残したまま新しい火元を増やす確率（それ以外は火元が移る）。
// 増やしすぎると 1棟の上限 4 にすぐ届く
export const TOWN_FIRE_BRANCH = 0.15;
// 別の建物へ燃え移る距離（px。spec 3章）
export const TOWN_FIRE_JUMP_RANGE = 8;
// 燃えている火元の隣の金属が熱で焦げる確率（燃え進みの1回）。焦げるだけで火元にはならない
export const TOWN_METAL_SCORCH = 0.2;
```

`fire.js`: import に `TOWN_FIRE_BRANCH, TOWN_FIRE_JUMP_RANGE, TOWN_METAL_SCORCH` を足す。`_tick()` を置き換え、メソッドを足す:

```js
    _tick() {
        for (const f of [...this.fires]) {
            if (!this.fires.includes(f)) continue;
            const { b } = f;
            if (!b.cells[f.k]) { this._remove(f); continue; }
            this._char(b, f.k);
            f.fuel -= TOWN_FIRE_TICK;
            if (f.fuel <= 0) { this._remove(f); continue; }
            this._spreadWithin(f);
            this._jumpAcross(f);
        }
        this._crumble();
    }

    _neighbors(b, k) {
        const i = k % b.cw;
        const nb = [];
        if (i > 0) nb.push(k - 1);
        if (i < b.cw - 1) nb.push(k + 1);
        if (k >= b.cw) nb.push(k - b.cw);
        if (k + b.cw < b.cells.length) nb.push(k + b.cw);
        return nb;
    }

    /**
     * 材料に沿って隣のかけらへ進む。燃える隣から1つ選び、その材料の spread の確率で火が進む
     * （たいていは火元が移る。TOWN_FIRE_BRANCH の確率で元を残して増える）。
     * 隣の金属は熱で焦げるだけで、火は金属の上に乗らない＝燃え移りを中継しない
     */
    _spreadWithin(f) {
        const { b } = f;
        const fuelable = [];
        for (const n of this._neighbors(b, f.k)) {
            const v = b.cells[n];
            if (!v || this.isBurning(b, n)) continue;
            if (burnable(v)) fuelable.push(n);
            else if (!(v & CHARRED) && !matOf(v).burns && this.town.random() < TOWN_METAL_SCORCH) this._char(b, n);
        }
        if (fuelable.length === 0) return;
        const n = fuelable[Math.floor(this.town.random() * fuelable.length)];
        if (this.town.random() >= matOf(b.cells[n]).spread) return;
        if (this.town.random() < TOWN_FIRE_BRANCH && this.ignite(b, n)) return;
        f.k = n;
    }

    /** 別の建物の、TOWN_FIRE_JUMP_RANGE 以内で一番近い燃えるかけらへ、その材料の catch の確率で燃え移る */
    _jumpAcross(f) {
        const { x, y } = FireSystem.center(f.b, f.k);
        for (const b2 of this.town.buildingsInCircle(x, y, TOWN_FIRE_JUMP_RANGE)) {
            if (b2 === f.b) continue;
            let best = -1, bestD = Infinity;
            for (let k = 0; k < b2.cells.length; k++) {
                if (!burnable(b2.cells[k])) continue;
                const c = FireSystem.center(b2, k);
                const d = Math.hypot(c.x - x, c.y - y);
                if (d <= TOWN_FIRE_JUMP_RANGE && d < bestD) { best = k; bestD = d; }
            }
            if (best >= 0 && this.town.random() < matOf(b2.cells[best]).catch) this.ignite(b2, best);
        }
    }

    /** 燃えている建物の、火が焦がしたかけら（今燃えていないもの）が crumble の確率で崩れて抜ける */
    _crumble() {
        for (const b of new Set(this.fires.map((f) => f.b))) {
            const list = [];
            for (const k of b.burnt) {
                if (!b.cells[k] || this.isBurning(b, k)) continue;
                if (this.town.random() < matOf(b.cells[k]).crumble) list.push(k);
            }
            for (const k of list) b.burnt.delete(k);
            this.town.removeAndSettle(b, list);
        }
    }
```

（`_jumpAcross` は相手の建物のかけらを全部なめる。相手は多くても数百かけらで、火元は 60 まで、6 フレームに1回なので足りる。Task 5 で実測する。）

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test -- tests/town-fire-spread.test.js tests/town-fire.test.js`
Expected: PASS

ミューテーション（1つずつ）: `_spreadWithin` の金属の分岐で `burnable` を `!!v` にする（金属にも火が乗る）→ 金属のテストが赤。`_jumpAcross` の `d <= TOWN_FIRE_JUMP_RANGE &&` を外し、`buildingsInCircle` の半径を 64 にする → 「8px より離れた」が赤。`_crumble` を `_tick` の外（毎フレーム、燃えていない建物も）で呼ぶ形にする → 「燃えているあいだだけ」が赤。`spread` を材料に関係なく 0.5 にする → 「木は土より速く」が赤。赤くならないものがあれば、fixture に差が出る状態があるかを先に疑う。

- [ ] **Step 5: コミット**

```bash
git add src/js/world/town/fire.js tests/town-fire-spread.test.js
# Constants.js は手順でステージ
git commit -m "feat: 町の火が燃え進み・燃え移り、焦げたかけらが崩れて家が自分から崩れる

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 火がつく所（爆発・弾・燃えている破片）

**Files:**
- Modify: `src/js/world/town/fire.js`（`igniteNear` / `igniteByBullet` / `takeFires`）
- Modify: `src/js/world/town/Town.js`（`blast`・`sweepProjectile`・`_detach`・`_updateFalling`・`_shatter` から）
- Modify: `src/js/world/town/FallingPiece.js`（`fireFuel`）
- Modify: `src/js/utils/Constants.js`（`TOWN_PROJECTILE_IMPACT` に `ignite`）
- Test: `tests/town-fire-ignite.test.js`（新規）

**Interfaces:**
- Produces:
  - `FireSystem.igniteNear(b, x, y, r) → number`（半径の中の燃えるかけらに近い順に。1棟の上限まで）
  - `FireSystem.igniteByBullet(b, x, y) → boolean`（当たった点から 8px 以内で一番近い燃えるかけらに、その材料の `bulletIgnite` の確率で）
  - `FireSystem.takeFires(b, group) → number`（塊の上の火を外して、一番多い残り燃料を返す）
  - `FallingPiece.fireFuel`（0 なら燃えていない。毎フレーム 1 ずつ減る）
  - `TOWN_PROJECTILE_IMPACT.<kind>.ignite`（弾が火をつけるか。bullet・missile は true）
  - 残り火: `FireSystem.embers: Array<{x, y, frames}>` と `addEmber(x, y)`（見た目は Task 4。ここでは数と寿命だけ）。定数 `TOWN_EMBER_FRAMES` / `TOWN_EMBERS_MAX`

- [ ] **Step 1: 失敗するテストを書く**

`tests/town-fire-ignite.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAT_ADOBE, MAT_WOOD, MAT_METAL } from '../src/js/world/town/chunks.js';
import { TOWN_FIRES_PER_BUILDING, TOWN_EMBER_FRAMES, TOWN_EMBERS_MAX } from '../src/js/utils/Constants.js';
import { Town } from '../src/js/world/town/Town.js';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { fakeCanvas } from './helpers/town-fixtures.js';
import { made, townOf, run } from './helpers/town-fire-fixtures.js';
import { PlayerBullet } from '../src/js/entities/PlayerBullet.js';

test('爆発: 半径の中の燃える材料には必ず火がつく（1棟の上限まで）。金属にはつかない', () => {
    const town = townOf([made(0, 0, 64, 64, MAT_WOOD), made(100, 0, 64, 64, MAT_METAL)]);
    town.blast(32, 32, 36);
    assert.equal(town.fire.countIn(town.buildings[0]), TOWN_FIRES_PER_BUILDING);
    town.blast(132, 32, 36);
    assert.equal(town.fire.countIn(town.buildings[1]), 0);
});

test('弾: 当たった所に、材料の確率で火がつく（木は土より多い）', () => {
    const rate = (mat) => {
        let lit = 0;
        for (let seed = 1; seed <= 200; seed++) {
            const town = townOf([made(200, 0, 32, 200, mat)], seed);
            const game = { spawnSparks() {}, map: { isSolidAtPixel: () => false } };
            const b = new PlayerBullet(game, 196, 100, 0);
            b._prevX = 196; b._prevY = 100; b.x = 204;
            town.sweepProjectile(b);
            if (town.fire.fires.length > 0) lit++;
        }
        return lit / 200;
    };
    const wood = rate(MAT_WOOD), adobe = rate(MAT_ADOBE);
    assert.ok(wood > 0.07 && wood < 0.25, `木 ${wood}`);
    assert.ok(adobe < 0.08, `土 ${adobe}`);
});

test('燃えている塊が切り離されると、火は破片が持っていく（建物の火の数は減る）', () => {
    // 支えは最下段だけの木の柱。上のほうを燃やしてから、中ほどを横断して欠かせる
    const rng = new SeededRNG(1);
    const town = new Town([made(0, 0, 4, 40, MAT_WOOD)], {
        createCanvas: fakeCanvas, isSolidTile: (r) => r === 2, random: () => rng.next(),
    });
    const b = town.buildings[0];
    town.fire.ignite(b, 0);
    town.chip(b, 2, 20, 1);
    assert.equal(town.fire.countIn(b), 0);
    const p = town.falling.find((q) => q.y === 0);
    assert.ok(p && p.fireFuel > 0, '上の破片が燃えている');
});

test('燃えている破片は、当たった下の建物に燃え移る', () => {
    const rng = new SeededRNG(2);
    const floor10 = (r) => r >= 10;
    const town = new Town([made(0, 0, 16, 16, MAT_WOOD), made(0, 96, 16, 68, MAT_WOOD)], {
        createCanvas: fakeCanvas, isSolidTile: floor10, random: () => rng.next(),
    });
    town.fire.ignite(town.buildings[0], 0);
    town.chip(town.buildings[0], 14, 14, 0.5);    // 支えの無い上の小屋が丸ごと落ちる
    const p = town.falling[0];
    assert.ok(p.fireFuel > 0);
    p.vx = 0;
    const game = { particles: [], projectiles: [], camera: null, canvas: null };
    for (let t = 0; t < 60 && town.falling.length; t++) town.update(game);
    assert.ok(town.fire.countIn(town.buildings[1]) > 0);
});

test('燃えている破片が砕けた所に残り火が残り、TOWN_EMBER_FRAMES で消える', () => {
    const rng = new SeededRNG(3);
    const town = new Town([made(0, 0, 16, 16, MAT_WOOD)], {
        createCanvas: fakeCanvas, isSolidTile: (r) => r >= 10, random: () => rng.next(),
    });
    town.fire.ignite(town.buildings[0], 0);
    town.chip(town.buildings[0], 14, 14, 0.5);
    run(town, 80);
    assert.equal(town.falling.length, 0);
    assert.equal(town.fire.embers.length >= 1, true);
    run(town, TOWN_EMBER_FRAMES);
    assert.equal(town.fire.embers.length, 0);
});

test('燃料が尽きて消えた火元も残り火を残す。残り火は TOWN_EMBERS_MAX まで', () => {
    const specs = [];
    for (let n = 0; n < TOWN_EMBERS_MAX + 10; n++) specs.push(made(n * 40, 0, 4, 4, MAT_ADOBE));
    const town = townOf(specs);
    for (const b of town.buildings) town.fire.ignite(b, 0);
    run(town, 600);
    assert.equal(town.fire.fires.length, 0);
    assert.ok(town.fire.embers.length > 0);
    assert.ok(town.fire.embers.length <= TOWN_EMBERS_MAX);
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npm test -- tests/town-fire-ignite.test.js`
Expected: FAIL（`TOWN_EMBER_FRAMES` が無い SyntaxError）

- [ ] **Step 3: 実装する**

`Constants.js` の段3の節に足し、`TOWN_PROJECTILE_IMPACT` の `bullet` と `missile` の行に `ignite: true` を足す（`grenade` と `beam` は爆発・貫通の側で決まるので足さない。グレネードの火は爆発で必ずつく）:

```js
// 残り火（燃え尽きた所・燃えて砕けた破片の所）が細い煙と火の粉を出し続けるフレーム数と、同時の上限
export const TOWN_EMBER_FRAMES = 480;   // 8秒
export const TOWN_EMBERS_MAX = 40;
```

```js
export const TOWN_PROJECTILE_IMPACT = {
    bullet: { chip: 4, thin: 'chip', ignite: true },
    missile: { chip: 4, thin: 'chip', ignite: true },
    grenade: { chip: 0, thin: 'pass' },
    beam: { chip: 6, thin: 'chip', pierce: true },
};
```

（表の上のコメントに `ignite: 当たった所に、かけらの材料の bulletIgnite の確率で火をつける` を1行足す。）

`fire.js`: import に `TOWN_EMBER_FRAMES, TOWN_EMBERS_MAX` を足す。コンストラクタに `this.embers = [];`。メソッドを足す:

```js
    /** (x, y) から半径 r 以内の燃えるかけらに、近い順に火をつける（1棟の上限まで）。爆発から */
    igniteNear(b, x, y, r) {
        const cand = [];
        for (let k = 0; k < b.cells.length; k++) {
            if (!burnable(b.cells[k])) continue;
            const c = FireSystem.center(b, k);
            const d = Math.hypot(c.x - x, c.y - y);
            if (d <= r) cand.push([d, k]);
        }
        cand.sort((p, q) => p[0] - q[0]);
        let lit = 0;
        for (const [, k] of cand) {
            if (this.countIn(b) >= TOWN_FIRES_PER_BUILDING || this.fires.length >= TOWN_FIRES_MAX) break;
            if (this.ignite(b, k)) lit++;
        }
        return lit;
    }

    /**
     * 弾が当たった点から CHUNK*2（8px）以内で一番近い燃えるかけらに、その材料の bulletIgnite の確率で。
     * 当たった所は弾の欠け（半径 4px＋ぎざぎざ）で先に抜けているので、6px では候補が残らないことがある
     */
    igniteByBullet(b, x, y) {
        let best = -1, bestD = Infinity;
        for (let k = 0; k < b.cells.length; k++) {
            if (!burnable(b.cells[k])) continue;
            const c = FireSystem.center(b, k);
            const d = Math.hypot(c.x - x, c.y - y);
            if (d <= CHUNK * 2 && d < bestD) { best = k; bestD = d; }
        }
        if (best < 0 || this.town.random() >= matOf(b.cells[best]).bulletIgnite) return false;
        return this.ignite(b, best);
    }

    /** 切り離される塊の上の火を外し、破片に持たせる燃料（いちばん多い残り）を返す */
    takeFires(b, group) {
        const set = new Set(group);
        let fuel = 0;
        this.fires = this.fires.filter((f) => {
            if (f.b !== b || !set.has(f.k)) return true;
            fuel = Math.max(fuel, f.fuel);
            return false;
        });
        return fuel;
    }

    /** 残り火を置く。上限を超えたら古いものから消す */
    addEmber(x, y) {
        this.embers.push({ x, y, frames: TOWN_EMBER_FRAMES });
        while (this.embers.length > TOWN_EMBERS_MAX) this.embers.shift();
    }
```

`update()` を次にする（燃えている破片の燃料と残り火は毎フレーム減る）:

```js
    update() {
        this.frame++;
        for (const p of this.town.falling) if (p.fireFuel > 0) p.fireFuel--;
        for (const e of this.embers) e.frames--;
        this.embers = this.embers.filter((e) => e.frames > 0);
        if (this.frame % TOWN_FIRE_TICK === 0) this._tick();
    }
```

`_tick()` の燃料切れで `this._remove(f); continue;` の前に、残り火を置く:

```js
            if (f.fuel <= 0) {
                const c = FireSystem.center(b, f.k);
                this.addEmber(c.x, c.y);
                this._remove(f);
                continue;
            }
```

`FallingPiece.js`: コンストラクタの引数に `fireFuel = 0` を足し `this.fireFuel = fireFuel;`（コメント: 燃えている破片。毎フレーム fire.js が 1 ずつ減らす。0 で燃えていない）。

`Town.js`:
- `blast(x, y, size)` のループを:

```js
        for (const b of this.buildingsInCircle(x, y, radius)) {
            this.chip(b, x, y, radius);
            // 爆風の中の燃える材料には必ず火がつく（spec 3章）。半径の中は欠けて無くなるので、
            // 穴の縁（かけら2つぶん外まで）に残ったかけらにつける
            this.fire.igniteNear(b, x, y, radius + CHUNK * 2);
        }
```

- `sweepProjectile` の厚い壁の分岐と細い部品の分岐で、`this.chip(...)` のあとに `if (spec.ignite) this.fire.igniteByBullet(b, px, py);`
- `_detach(b, group)`: `this._removeCells(b, group);` の**前**に `const fireFuel = this.fire.takeFires(b, group);`、`new FallingPiece({ ... , fireFuel })`
- `_updateFalling()`: 下の建物を欠かせたあと（`this.chip(b, p.cx, by, TOWN_FALL_CHIP_RADIUS);` の次）に `if (p.fireFuel > 0) this.fire.igniteNear(b, p.cx, by, TOWN_FALL_CHIP_RADIUS + CHUNK);`
- `_shatter(p, by)` の最後に `if (p.fireFuel > 0) this.fire.addEmber(p.cx, groundY);`

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test -- tests/town-fire-ignite.test.js tests/town-fire.test.js tests/town-fire-spread.test.js tests/town-projectiles.test.js tests/town-wiring.test.js tests/town-falling.test.js`
Expected: PASS

ミューテーション（1つずつ）: `blast` の `igniteNear` を消す → 爆発のテストが赤。`takeFires` を呼ばない（`fireFuel` を 0 のまま）→ 「火は破片が持っていく」が赤。`_updateFalling` の燃え移りを消す → 「下の建物に燃え移る」が赤。`addEmber` の上限の `while` を消す → 上限のテストが赤。

- [ ] **Step 5: コミット**

```bash
git add src/js/world/town/fire.js src/js/world/town/Town.js src/js/world/town/FallingPiece.js tests/town-fire-ignite.test.js
# Constants.js は手順でステージ
git commit -m "feat: 町に火がつく（爆発は必ず・弾は材料の確率・燃えている破片は落ちた先へ）と残り火

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 炎・煙・残り火の見た目（町の層に、画面の中だけ）

**Files:**
- Create: `src/js/world/town/fireFx.js`
- Modify: `src/js/world/town/fire.js`（粒を出す・動かす・描く）
- Modify: `src/js/world/town/Town.js`（`update` から見えている範囲を渡す、`draw` で火を描く、`smokeSprites` の引数）
- Modify: `src/js/world/town/palette.js`（炎の色）
- Modify: `src/js/utils/Constants.js`
- Test: `tests/town-fire-fx.test.js`（新規）

**Interfaces:**
- Produces:
  - `class FlameParticle(x, y, vx, vy, size, life)`: `update()`、`alive`、`colorIndex`（0=黄 → 1=橙 → 2=赤。生まれたては熱く、昇りながら冷える）、`draw(ctx, flicker)`
  - `class SmokePuff(x, y, size, life, shape)`: `update()`、`alive`、`draw(ctx, sprites)`（`sprites` が無ければ描かない）
  - `FireSystem.update(view)`（view は `{x, y, w, h}` か null。null なら全部「見えている」扱い）、`FireSystem.draw(ctx, view)`、`flames` / `smoke`
  - Town コンストラクタの `smokeSprites`（既定 `getSmokeSprites`。道具は `() => null`）
  - `Town.draw` の順: 建物 → 火（煙 → 炎）→ 瓦礫 → 落ちる破片

- [ ] **Step 1: 失敗するテストを書く**

`tests/town-fire-fx.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { MAT_WOOD } from '../src/js/world/town/chunks.js';
import { TOWN_FLAMES_MAX, TOWN_FIRE_TICK, VIEW_CULL_MARGIN } from '../src/js/utils/Constants.js';
import { TOWN_FLAME_COLORS } from '../src/js/world/town/palette.js';
import { FlameParticle } from '../src/js/world/town/fireFx.js';
import { made, townOf } from './helpers/town-fire-fixtures.js';

const at = (cam) => ({ particles: [], projectiles: [], camera: cam, canvas: { width: 800, height: 600 } });

test('炎の粒は昇りながら黄 → 橙 → 赤へ冷え、寿命で消える', () => {
    const f = new FlameParticle(0, 0, 0, -1, 3, 30);
    const seen = [];
    while (f.alive) { seen.push(f.colorIndex); f.update(); }
    assert.equal(seen[0], 0);
    assert.equal(seen[seen.length - 1], TOWN_FLAME_COLORS.length - 1);
    assert.ok(seen.every((c, i) => i === 0 || c >= seen[i - 1]), '色は戻らない');
    assert.ok(f.y < 0, '昇る');
});

test('燃えている火元から炎と煙が出る（町の層に。game.particles には足さない）', () => {
    const town = townOf([made(100, 100, 16, 16, MAT_WOOD)]);
    town.fire.ignite(town.buildings[0], 0);
    const game = at({ x: 0, y: 0 });
    for (let i = 0; i < TOWN_FIRE_TICK * 4; i++) town.update(game);
    assert.ok(town.fire.flames.length > 0);
    assert.ok(town.fire.smoke.length > 0);
    assert.equal(game.particles.length, 0);
});

test('画面の外の火は粒を出さない（でも燃え進む）', () => {
    const town = townOf([made(100, 100, 64, 4, MAT_WOOD)]);
    town.fire.ignite(town.buildings[0], 0);
    const game = at({ x: 100 + 800 + VIEW_CULL_MARGIN + 100, y: 0 });
    for (let i = 0; i < 300; i++) town.update(game);
    assert.equal(town.fire.flames.length, 0);
    assert.equal(town.fire.smoke.length, 0);
    assert.ok(town.buildings[0].burnt.size > 1, '燃え進んでいる');
});

test('炎の粒は TOWN_FLAMES_MAX を超えない', () => {
    const specs = [];
    for (let n = 0; n < 15; n++) specs.push(made(n * 20, 100, 16, 16, MAT_WOOD));
    const town = townOf(specs);
    for (const b of town.buildings) town.fire.igniteNear(b, b.x + 8, b.y + 8, 20);
    const game = at({ x: 0, y: 0 });
    for (let i = 0; i < 600; i++) {
        town.update(game);
        assert.ok(town.fire.flames.length <= TOWN_FLAMES_MAX);
    }
});

test('燃えている破片からも炎が出る', () => {
    const town = townOf([made(100, 100, 16, 16, MAT_WOOD)], 1, { isSolidTile: () => false });
    town.fire.ignite(town.buildings[0], 0);
    town.chip(town.buildings[0], 114, 114, 0.5);   // 支え無し → 燃えたまま落ちる
    assert.ok(town.falling[0].fireFuel > 0);
    const game = at({ x: 0, y: 0 });
    for (let i = 0; i < TOWN_FIRE_TICK * 2; i++) town.update(game);
    assert.ok(town.fire.flames.length > 0);
});

test('draw: 建物 → 火 → 瓦礫 → 破片の順。火は画面に掛かる粒だけ描く', () => {
    const town = townOf([made(100, 100, 16, 16, MAT_WOOD)], 1, { smokeSprites: () => null });
    town.fire.ignite(town.buildings[0], 0);
    const game = at({ x: 0, y: 0 });
    for (let i = 0; i < TOWN_FIRE_TICK * 3; i++) town.update(game);
    town.rubble.push({ x: 300, w: 16, groundY: 300, h: 4, color: '#6f4f24' });
    const ctx = makeFakeCtx();
    town.draw(ctx, { x: 0, y: 0, w: 800, h: 600 });
    const order = ctx.calls.filter((c) => c.name === 'drawImage' || (c.name === 'set:fillStyle'))
        .map((c) => (c.name === 'drawImage' ? 'building'
            : TOWN_FLAME_COLORS.includes(c.args[0]) ? 'flame'
            : c.args[0] === '#6f4f24' ? 'rubble' : 'other'));
    const firstFlame = order.indexOf('flame');
    assert.ok(order.indexOf('building') < firstFlame && firstFlame < order.indexOf('rubble'), order.join(','));
    const far = makeFakeCtx();
    town.draw(far, { x: 5000, y: 5000, w: 800, h: 600 });
    assert.equal(far.calls.filter((c) => c.name === 'set:fillStyle' && TOWN_FLAME_COLORS.includes(c.args[0])).length, 0);
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npm test -- tests/town-fire-fx.test.js`
Expected: FAIL（`TOWN_FLAMES_MAX` が無い・`fireFx.js` が無い）

- [ ] **Step 3: 実装する**

`palette.js` の末尾に:

```js
// 段3: 炎の粒の色。生まれたて（熱い）→ 昇って冷える の順。角ばった四角で描く（spec 3章「見た目」）。
// 町の層（岩の縁より奥）に描くので、地形の黄色い岩より明るい黄でも岩に被って見えることはない
export const TOWN_FLAME_COLORS = ['#ffd860', '#ff9a2a', '#d8401a'];
// 残り火の火の粉
export const TOWN_EMBER_COLOR = '#ff7a1a';
```

`Constants.js` の段3の節に:

```js
// 炎・煙の粒。燃え進みの1回に火元1つから出す数と、同時の上限（画面の中の火だけが出す）
export const TOWN_FLAMES_PER_FIRE = 2;
export const TOWN_FLAMES_MAX = 360;
export const TOWN_SMOKE_EVERY = 3;      // 燃え進み何回に1回、火元から煙を1つ出すか
export const TOWN_SMOKE_MAX = 60;
export const TOWN_SMOKE_ALPHA = 0.35;   // 煙幕（SmokeScreen）より薄く。町の煙は見通しを遮らない
export const TOWN_EMBER_SMOKE_EVERY = 40; // 残り火が細い煙を出す間隔（フレーム）
```

`src/js/world/town/fireFx.js`:

```js
// ============================================
// fireFx - 町の炎・煙の粒（町の層＝岩の縁より奥に描く）
// ============================================
//
// game.particles（地形より手前）には足さない。spec 2章「炎と煙も同じ層に描き、岩の縁より手前に出さない」。
// 炎は角ばった四角（fillRect）で、生まれたての黄から昇りながら橙・赤へ冷える。ちらつきは描くときの大きさの揺れ。
// 煙は smokeSprites（SmokeScreen と同じ焼いたパフ）を小さく薄くして使う。

import { TOWN_FLAME_COLORS } from './palette.js';
import { TOWN_SMOKE_ALPHA } from '../../utils/Constants.js';

export class FlameParticle {
    constructor(x, y, vx, vy, size, life) {
        this.x = x; this.y = y; this.vx = vx; this.vy = vy;
        this.size = size; this.life = life; this.maxLife = life;
        this.alive = true;
    }

    /** 0=黄（生まれたて）→ 最後の色（冷えた赤）。寿命の割合で決める */
    get colorIndex() {
        const t = 1 - this.life / this.maxLife;
        return Math.min(TOWN_FLAME_COLORS.length - 1, Math.floor(t * TOWN_FLAME_COLORS.length));
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.92;          // 横の揺れは収まり、まっすぐ昇る
        this.life--;
        if (this.life <= 0) this.alive = false;
    }

    /** flicker は 0〜1。大きさを揺らしてちらつかせる（描くたびに呼び手が乱数を渡す） */
    draw(ctx, flicker) {
        const s = Math.max(1, Math.round(this.size * (0.6 + 0.4 * flicker) * (this.life / this.maxLife + 0.3)));
        ctx.fillStyle = TOWN_FLAME_COLORS[this.colorIndex];
        ctx.fillRect(Math.round(this.x - s / 2), Math.round(this.y - s / 2), s, s);
    }
}

export class SmokePuff {
    constructor(x, y, size, life, shape) {
        this.x = x; this.y = y; this.size = size; this.life = life; this.maxLife = life;
        this.shape = shape; this.alive = true;
    }

    update() {
        this.y -= 0.35;
        this.size += 0.08;
        this.life--;
        if (this.life <= 0) this.alive = false;
    }

    /** sprites は getSmokeSprites() の [形][色段]。無ければ（node の道具）描かない */
    draw(ctx, sprites) {
        if (!sprites) return;
        const t = 1 - this.life / this.maxLife;
        const tints = sprites[this.shape % sprites.length];
        const img = tints[Math.min(tints.length - 1, Math.floor(t * tints.length))];
        ctx.globalAlpha = TOWN_SMOKE_ALPHA * (this.life / this.maxLife);
        ctx.drawImage(img, this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
        ctx.globalAlpha = 1;
    }
}
```

`fire.js`: import に `FlameParticle, SmokePuff`（`./fireFx.js`）と `TOWN_FLAMES_PER_FIRE, TOWN_FLAMES_MAX, TOWN_SMOKE_EVERY, TOWN_SMOKE_MAX, TOWN_EMBER_SMOKE_EVERY, VIEW_CULL_MARGIN` と `TOWN_EMBER_COLOR`（palette）を足す。コンストラクタに `this.flames = []; this.smoke = []; this.view = null;`。`update()` を `update(view = null)` にして、先頭で `this.view = view;`、最後に `this._updateFx();` を足す。メソッドを足す:

```js
    /** 画面の中かそのすぐ外か。view が無い（道具・テスト）なら全部見えている扱い */
    _visible(x, y) {
        const v = this.view;
        if (!v) return true;
        const m = VIEW_CULL_MARGIN;
        return x >= v.x - m && x <= v.x + v.w + m && y >= v.y - m && y <= v.y + v.h + m;
    }

    _flame(x, y) {
        if (this.flames.length >= TOWN_FLAMES_MAX || !this._visible(x, y)) return;
        const r = this.town.random;
        this.flames.push(new FlameParticle(x + (r() - 0.5) * 4, y, (r() - 0.5) * 0.6, -0.5 - r() * 0.7,
            2 + r() * 2, 16 + Math.floor(r() * 14)));
    }

    _puff(x, y, size) {
        if (this.smoke.length >= TOWN_SMOKE_MAX || !this._visible(x, y)) return;
        const r = this.town.random;
        this.smoke.push(new SmokePuff(x, y - 4, size, 60 + Math.floor(r() * 30), Math.floor(r() * 4)));
    }

    /** 粒を出す（燃え進みの1回ごと）と、毎フレーム動かす */
    _updateFx() {
        if (this.frame % TOWN_FIRE_TICK === 0) {
            const tick = this.frame / TOWN_FIRE_TICK;
            for (const f of this.fires) {
                const c = FireSystem.center(f.b, f.k);
                for (let i = 0; i < TOWN_FLAMES_PER_FIRE; i++) this._flame(c.x, c.y);
                if (tick % TOWN_SMOKE_EVERY === 0) this._puff(c.x, c.y, 10);
            }
            for (const p of this.town.falling) {
                if (p.fireFuel > 0) for (let i = 0; i < TOWN_FLAMES_PER_FIRE; i++) this._flame(p.cx, p.y);
            }
        }
        for (const e of this.embers) {
            if (e.frames % TOWN_EMBER_SMOKE_EVERY === 0) this._puff(e.x, e.y, 6);
        }
        for (const q of this.flames) q.update();
        for (const q of this.smoke) q.update();
        this.flames = this.flames.filter((q) => q.alive);
        this.smoke = this.smoke.filter((q) => q.alive);
    }

    /** 町の層に描く（Town.draw が建物の直後に呼ぶ）。煙を先に、炎を手前に */
    draw(ctx, view, sprites) {
        const inView = (x, y, m) => x >= view.x - m && x <= view.x + view.w + m && y >= view.y - m && y <= view.y + view.h + m;
        for (const q of this.smoke) if (inView(q.x, q.y, q.size)) q.draw(ctx, sprites);
        for (const q of this.flames) if (inView(q.x, q.y, 8)) q.draw(ctx, this.town.random());
        // 残り火: 小さな火の粉が明滅する（細い煙は _updateFx が出す）
        ctx.fillStyle = TOWN_EMBER_COLOR;
        for (const e of this.embers) {
            if (inView(e.x, e.y, 4) && this.town.random() < 0.5) ctx.fillRect(Math.round(e.x), Math.round(e.y) - 1, 1, 1);
        }
    }
```

`Town.js`:
- import に `import { getSmokeSprites } from '../../entities/smokeSprites.js';`
- コンストラクタの引数に `smokeSprites = getSmokeSprites` を足し `this.smokeSprites = smokeSprites;`
- `update(game)` の `this.fire.update();` を次にする:

```js
        const cam = game.camera, cv = game.canvas;
        this.fire.update(cam && cv ? { x: cam.x, y: cam.y, w: cv.width, h: cv.height } : null);
```

- `draw(ctx, view)` の建物のループの直後に `this.fire.draw(ctx, view, this.fire.smoke.length > 0 ? this.smokeSprites() : null);`（煙が無いときは焼かない。`getSmokeSprites` は最初の呼び出しで canvas を焼くので、node の描画テストで `document` が無くても落ちないように）

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test -- tests/town-fire-fx.test.js tests/town-fire.test.js tests/town-fire-spread.test.js tests/town-fire-ignite.test.js tests/town-falling.test.js tests/town-draw.test.js tests/town-draw-wiring.test.js`
Expected: PASS

ミューテーション（1つずつ）: `_flame` の `!this._visible(x, y)` を外す → 「画面の外」が赤。`this.flames.length >= TOWN_FLAMES_MAX ||` を外す → 上限が赤。`colorIndex` の `1 -` を外す（赤から黄へ）→ 色のテストが赤。`Town.draw` の `fire.draw` を瓦礫のあとへ移す → 順のテストが赤。

- [ ] **Step 5: コミット**

```bash
git add src/js/world/town/fireFx.js src/js/world/town/fire.js src/js/world/town/Town.js src/js/world/town/palette.js tests/town-fire-fx.test.js
# Constants.js は手順でステージ
git commit -m "feat: 町の炎・煙・残り火を町の層に描く（画面の中だけ粒を出す）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 書き出しの道具で燃えた後を見る・重さを測る・引き渡し

**Files:**
- Modify: `tools/render-town-scene.mjs`

- [ ] **Step 1: 道具を足す**

- 町を作るとき `smokeSprites: () => null`（PixelCanvas は放射グラデーションを焼けない）
- `--fire "x,y;x,y"`: その点を中心に `town.blast(x, y, 36)` してから（爆発は火をつける）`--ticks` 回 `town.update(fakeGame)`。燃えて焦げた跡・崩れ・瓦礫・炎の粒（四角）が絵に出る
- `--stats` に `fire` を足す: 今週の3面で、床の建物の中ほど 30 か所に `blast(…, 36)` を当てて火をつけ、1800 フレーム（30秒）回す。`fires` の最大、1フレームあたりの平均と最大（ms）、燃え尽きて崩れた建物の数、`falling` の最大
- 使い方をファイル冒頭のコメントに足す

- [ ] **Step 2: 動かして目で見る**

```bash
node tools/render-town-scene.mjs --stats
node tools/render-town-scene.mjs --x 1380 --y 660 --w 300 --h 240 --scale 3 --fire "1502,810" --ticks 60 --out $S/fire60.png
node tools/render-town-scene.mjs --x 1380 --y 660 --w 300 --h 240 --scale 3 --fire "1502,810" --ticks 900 --out $S/fire900.png
```

（座標は今週の3面の高い塔の例。週が変わっていれば `--stats` を見て、塔のある所に読み替える。）

Expected（Read で PNG を見る）: fire60 で穴の縁から炎の四角が昇り、周りが焦げ色。fire900 で焦げが広がり、崩れて上が落ち、瓦礫。宙に浮いた画素が無い。`--stats` の1フレームあたりの最大が 1ms を超えるなら、どこが重いか（`_jumpAcross` の全かけらなめなど）を測って引き渡しに書く。直すのは実機の数字を見てから。

- [ ] **Step 3: 全体のテスト**

Run: `npm test`
Expected: 既知の1件以外が通る

- [ ] **Step 4: コミット**

```bash
git add tools/render-town-scene.mjs
git commit -m "tools: 町を燃やした後を PNG に書き出す・火の重さを測る

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
grep -n "debugStartMission:" src/js/main.js   # 2 のまま
```

- [ ] **Step 5: 引き渡し（実機の確認はユーザー）**

| 確認ポイント | 調整する定数（`Constants.js`） |
|---|---|
| 弾で火がつく頻度 | `TOWN_MATERIALS` の `bulletIgnite`（木 0.15・土 0.03） |
| 燃え広がる速さ | `TOWN_MATERIALS` の `spread`、`TOWN_FIRE_BRANCH`（0.15） |
| 隣の建物へ燃え移る頻度・距離 | `TOWN_MATERIALS` の `catch`、`TOWN_FIRE_JUMP_RANGE`（8px） |
| 燃えている時間 | `TOWN_MATERIALS` の `fuel`（木 12〜20秒・土 5〜8秒） |
| 燃えた家が崩れる速さ | `TOWN_MATERIALS` の `crumble` |
| 一度に燃える量の上限 | `TOWN_FIRES_MAX`（60）、`TOWN_FIRES_PER_BUILDING`（4） |
| 炎の量 | `TOWN_FLAMES_PER_FIRE`（2）、`TOWN_FLAMES_MAX`（360） |
| 煙の量・濃さ | `TOWN_SMOKE_EVERY`（3）、`TOWN_SMOKE_MAX`（60）、`TOWN_SMOKE_ALPHA`（0.35） |
| 残り火の長さ | `TOWN_EMBER_FRAMES`（8秒）、`TOWN_EMBER_SMOKE_EVERY` |
| 炎の色 | `palette.js` の `TOWN_FLAME_COLORS` |

見てほしいこと: グレネード1発で町がどこまで燃えるか（燃えすぎ・燃えなさすぎ）、燃えた家が崩れるまでの間、炎と煙が岩の縁より奥に見えるか、重く感じないか。火のまわりを明るくする（`lighter`）は、この段の重さの数字を見てから相談する。
