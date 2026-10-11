# 5面の天井のつらら（段 1）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5面の天井につららを吊るし、撃つと約 0.4 秒震えてから落ち、落ちたつららが自機・母艦・敵にダメージ（長さに比例 15〜35）を与える。

**Architecture:** つららを 3 面の町の仕組み（`Town`）の「天井に吊るした壊せる建物」にする。`brittle` の建物は当たっても欠けずに震え、震えが終わったら全体が 1 つの `IcicleFall`（`FallingPiece` の子）になって落ちる。`IcicleFall` は落下中に機体の矩形に掛かったら 1 機体 1 回 `takeDamage` する。`main.js` は触らない。

**Tech Stack:** バニラ ES modules ＋ canvas。テストは `node --test`。

**Spec:** `docs/superpowers/specs/2026-10-11-stage5-icicles-design.md`（読んでから始める。5面の木の設計 `2026-10-11-stage5-snowtrees-design.md` と、`Town.js` の `ToppleTree` まわりも参考になる）

## Global Constraints

- **CLAUDE.md を先に読む。** コメントは日本語で「なぜそうしたか」。調整用の数値は `Constants.js`（マジックナンバーを実装側に直書きしない。描画専用のパラメータだけは例外）
- 全テストのゲート: `npm test -- --test-skip-pattern=湧き位置は重複しない`（既知の週依存の失敗 1 件を除く）
- **`git add -A` / `git add .` は使わない。** 変更したファイルを明示して add する。`src/js/main.js`（`debugStartMission`）と `src/js/utils/Constants.js`（IDE の整形）には、ユーザーの未コミットの変更が**意図的に**ある。**`Constants.js` は丸ごと add しない**（下の「Constants.js のステージ手順」）。`git checkout` / `restore` / `stash` も使わない
- **`game.rng` を消費しない。** 生成は派生ストリーム `new SeededRNG((game.rng.state ^ 0x1C1CE5) >>> 0)` だけ（週次の決定性）。シミュレーション（震え・落下・ダメージ）に `Math.random` を使わない。見た目の粒だけ `Math.random` でよい（`_flushEffects` の中）
- `AudioManager` の `play*` / `start*` / `stop*` は引数なしで例外を投げないこと。**この段では音を足さない**（段 2）
- 新しいテストは「壊して赤くなること」を確認する（変異テスト。各 Task の最後に手順あり）。期待値を実装から導かない
- ソース文字列を grep するテストは書かない
- つららの定数の初案（spec の表）: `ICICLE_LENGTH [24,64]`・`ICICLE_WIDTH [8,12]`・`ICICLE_DAMAGE [15,35]`・`ICICLE_SHAKE_TICKS 24`・`ICICLE_SHAKE_AMPLITUDE 1`・`ICICLE_KNOCK_VY 2`・`ICICLE_FILL_SCALE 1`・`ICICLE_KEEP_BELOW 3`

### Constants.js のステージ手順

`Constants.js` の作業ツリーには、ユーザーの IDE 整形が未コミットで混ざっている。自分の変更だけをコミットに載せるには、「HEAD の内容 ＋ 自分の追加」の blob を作って index に入れる。つららの定数は**新しいまとまり 1 つ**と、`TOWN_MATERIALS` の 1 行、`STAGE_ENVIRONMENTS` の 1 行なので、次の手順で足りる（`<scratch>` は一時ディレクトリ、`MARK_START` / `MARK_END` は自分が足したまとまりの最初・最後の行の文字列）:

```bash
python3 - <<'PY'
import subprocess
head = subprocess.check_output(['git', 'show', 'HEAD:src/js/utils/Constants.js']).decode()
work = open('src/js/utils/Constants.js').read()
# 1) 新しいまとまり: 作業ツリーの MARK_START 行から MARK_END 行の末尾までを、HEAD の ANCHOR_LINE の直後に入れる
a = work.index(MARK_START); b = work.index('\n', work.index(MARK_END)) + 1
head = head.replace(ANCHOR_LINE, ANCHOR_LINE + work[a:b], 1)
# 2) 1 行の差し替えは HEAD の文字列を直接置き換える（IDE の整形が入っていない HEAD の行の形のまま）
open('<scratch>/Constants.staged.js', 'w').write(head)
PY
git add <自分のファイル> && git update-index --cacheinfo 100644,$(git hash-object -w <scratch>/Constants.staged.js),src/js/utils/Constants.js
git diff --cached --stat   # Constants.js の変更が自分の行数だけであることを確認
# index だけを書き出して全テストを通す（作業ツリーの IDE 整形に依存していないことの確認）
rm -rf <scratch>/idx && mkdir <scratch>/idx && git checkout-index -a --prefix=<scratch>/idx/ && (cd <scratch>/idx && npm test -- --test-skip-pattern=湧き位置は重複しない)
```

## Review Focus

spec が暗に求めているが、どの Task のテストにも自然には出てこない入力・条件。ユーザーが実際に遊んで踏みやすい順。各行のテストは、持ち主の Task に入れてある。

1. **真下に機体がいるまま震えが終わる / 落ちる瞬間にすでに重なっている**（敵が真下で止まっている、自機が真下でホバーしている）。→ 落ちた最初の tick で 1 回だけ当たり、以後は当てない（Task 4・5）
2. **死んでいる敵・ドッキング中の自機・母艦の中にいる自機**: ダメージを与えず、二重に当てない。→ 対象の一覧から外す（Task 4）
3. **グレネードの爆風が複数のつららを同時に震わせる**: どのつららも 1 回だけ震え、全部が落ちる。→（Task 5）
4. **震えている最中に、すでに空になった建物（支えの岩が壊れて落ちた後）が震えの時間切れを迎える**: 二重に落とさない・例外を出さない。→（Task 5）
5. **天井の低い所（空きが `ICICLE_KEEP_BELOW` 未満）・基地の部屋・開始の部屋**: つららを吊るさない。→（Task 3・6）
6. **`Town` を `game` なしで更新する道具・テスト（`_updateFalling()` が引数なし）**: 例外を出さない。→（Task 5）
7. **5面の木の設計図が、つららを足す前と同一**（木の本数・位置・乱数の流れが変わらない）。→（Task 6）

---

## File Structure

| ファイル | 責任 |
|---|---|
| `src/js/utils/Constants.js`（変更） | つららの定数、`TOWN_MATERIALS[6]`、5面の `props: 'snow'` |
| `src/js/world/town/chunks.js`（変更） | `MAT_ICE = 6` |
| `src/js/world/town/palette.js`（変更） | `ICICLE_COLORS`、`ICE_PARTICLE_COLORS` |
| `src/js/world/town/icicles.js`（新規） | つららの絵（`buildIcicle`）と、長さからのダメージ（`icicleDamage`） |
| `src/js/world/town/generateIcicles.js`（新規） | 天井へのつららの置き場所 |
| `src/js/utils/impactDamage.js`（新規） | 落ちるつららの当て先（`impactTargets`）と当て方（`applyImpact`） |
| `src/js/world/town/IcicleFall.js`（新規） | 落ちるつららの塊（`FallingPiece` の子。かけらが機体に掛かるかを見る） |
| `src/js/world/town/Town.js`（変更） | `brittle` の震え・解放、落下中のダメージ、氷の粒、描画の揺れ |
| `src/js/world/Map.js`（変更） | `props: 'snow'` で木とつららを 1 つの `Town` に載せる |
| `tools/render-town-scene.mjs`（変更） | 5面にもつららを描く |
| `CLAUDE.md`（変更） | 表に 1 行 |
| `tests/icicles-*.test.js`（新規）、`tests/MapDeterminism.test.js`（変更） | テスト |

---

### Task 1: 材料 MAT_ICE・氷の色・定数

**Files:**
- Modify: `src/js/world/town/chunks.js`（`MAT_ICE`）
- Modify: `src/js/world/town/palette.js`（末尾に追記）
- Modify: `src/js/utils/Constants.js`（`TOWN_MATERIALS[6]`、つららの定数のまとまり）
- Test: `tests/icicles-palette.test.js`（新規）

**Interfaces:**
- Produces: `MAT_ICE` (= 6)、`ICICLE_COLORS = { body, light, dark }`、`ICE_PARTICLE_COLORS: string[]`、`ICICLE_LENGTH` / `ICICLE_WIDTH` / `ICICLE_DAMAGE`（`[min, max]`）、`ICICLE_SHAKE_TICKS`、`ICICLE_SHAKE_AMPLITUDE`、`ICICLE_KNOCK_VY`、`ICICLE_FILL_SCALE`、`ICICLE_KEEP_BELOW`、`ICICLE_GAP`（`[min, max]`）、`ICICLE_DRIP_EVERY`、`ICICLE_SHARDS = { hit, land }`

- [ ] **Step 1: 失敗するテストを書く**

`tests/icicles-palette.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ICICLE_COLORS, ICE_PARTICLE_COLORS, SNOWTREE_COLORS } from '../src/js/world/town/palette.js';
import { MAT_ICE, MAT_MASK, MAT_PLANT, MAT_EXPLOSIVE } from '../src/js/world/town/chunks.js';
import { STAGE_PALETTES, SNOW_CAP_COLOR, TOWN_MATERIALS } from '../src/js/utils/Constants.js';
import { luminance } from '../src/js/utils/color.js';

// 5面のつららは「遠景より手前・地形より奥」の層に描く。岩（鋼青、輝度 118）より明るくないと氷に見えず、
// 足場の雪のふち（SNOW_CAP_COLOR、輝度 243）より白いと足場を読み違える。雪の木の白（色味がほぼ無い）とは、
// 青の強さ（最大チャンネルと最小チャンネルの差）で離す
const FILL = STAGE_PALETTES[4].fill;
const chroma = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return Math.max(r, g, b) - Math.min(r, g, b);
};

test('氷の色は、地形の岩より明るく、足場の雪のふちより暗い', () => {
    for (const hex of [...Object.values(ICICLE_COLORS), ...ICE_PARTICLE_COLORS]) {
        assert.ok(luminance(hex) > luminance(FILL), `${hex} が岩より暗く、氷に見えない`);
        assert.ok(luminance(hex) < luminance(SNOW_CAP_COLOR), `${hex} が足場の雪のふちより白い`);
    }
});

test('つららの本体の色は、雪の木の白より青が強い（雪の木と見分ける）', () => {
    const snowMax = Math.max(...SNOWTREE_COLORS.snow.map(chroma));
    for (const hex of Object.values(ICICLE_COLORS)) {
        assert.ok(chroma(hex) >= 45, `${hex} の青が弱い（${chroma(hex)}）`);
        assert.ok(chroma(hex) > snowMax + 15, `${hex} が雪の白に近い`);
    }
});

test('明るい面は本体より明るく、影は本体より暗い（描き順 body → light → dark の前提）', () => {
    assert.ok(luminance(ICICLE_COLORS.light) > luminance(ICICLE_COLORS.body));
    assert.ok(luminance(ICICLE_COLORS.dark) < luminance(ICICLE_COLORS.body));
});

test('MAT_ICE は材料の番号の範囲（下位 3 ビット）に収まり、他と重ならない。燃えず、延焼しない', () => {
    assert.ok(MAT_ICE >= 1 && MAT_ICE <= MAT_MASK);
    assert.notEqual(MAT_ICE, MAT_PLANT);
    assert.notEqual(MAT_ICE, MAT_EXPLOSIVE);
    const m = TOWN_MATERIALS[MAT_ICE];
    assert.ok(m, 'TOWN_MATERIALS に MAT_ICE の行が無い');
    assert.equal(m.burns, false);
    assert.equal(m.bulletIgnite, 0);
    assert.equal(m.spread, 0);
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `node --test tests/icicles-palette.test.js`
Expected: FAIL（`ICICLE_COLORS` / `MAT_ICE` が無い）

- [ ] **Step 3: 実装する**

`src/js/world/town/chunks.js` の `MAT_PLANT` の行の次に追加:

```js
export const MAT_ICE = 6;       // つらら（5面。燃えない・誘爆しない）
```

`src/js/world/town/palette.js` の末尾に追記:

```js

// 5面のつららの色。岩（鋼青、輝度 118）より明るく、足場の雪のふち（輝度 243）より暗い（輝度 140 / 173 / 208）。
// 雪の木の白（青の強さ 17〜27）より青を強く（53〜71）して見分ける。描き順は body → light → dark
// （light は左の明るい面、dark は右の影の筋）。tests/icicles-palette.test.js が縛る
export const ICICLE_COLORS = {
    body: '#8fb4d6',
    light: '#b9d6ee',
    dark: '#6f93b6',
};
// 砕けた氷の粒の色（明るい側。手前に出る粒なので本体より白くてよいが、雪のふちよりは暗い）
export const ICE_PARTICLE_COLORS = ['#b9d6ee', '#8fb4d6', '#e2eef8'];
```

`src/js/utils/Constants.js`:

1. `TOWN_MATERIALS` の `5:` の行の次に追加（`TOWN_MATERIALS` のオブジェクトの中）:

```js
    // つらら（5面）。燃えない・火を中継しない（植物と同じ行）
    6: { burns: false, bulletIgnite: 0, spread: 0, catch: 0, fuel: [0, 0], crumble: 0 },
```

2. `SNOWTREE_FLURRY_BIG_SHARE` の行（雪の木の舞う雪の定数のまとまりの最後）の次に、新しいまとまりを追加:

```js

// --- 5面のつらら ---
// 設計: docs/superpowers/specs/2026-10-11-stage5-icicles-design.md
// 3面の町の仕組み（world/town/）に、天井に吊るした「もろい」建物として載せる。絵は world/town/icicles.js、
// 置き場所は generateIcicles.js、落ちる塊は IcicleFall.js。STAGE_ENVIRONMENTS の props: 'snow' の面だけ。
// 数値は spec の初案で、実機で見て調整する前提の出発点（ユーザー決定: 震えて落ちる約 0.4 秒・ダメージは大きさに比例 15〜35・
// 開始の部屋と基地の部屋を避けて面全体の天井）。
// 見える長さ・根元の幅（px。長さは 4px 刻み）
export const ICICLE_LENGTH = [24, 64];
export const ICICLE_WIDTH = [8, 12];
// ダメージ [最短, 最長]。長さに比例（短い → 長い）。自機・母艦・敵に同じ数値。参考: 自機 HP 100、敵アタッカー 15〜45、地雷 25
export const ICICLE_DAMAGE = [15, 35];
// 当たってから落ちるまで（tick。0.4 秒）。震えている間の追加の当たりは時間を延ばさない。揺れる幅（px。描画だけ）
export const ICICLE_SHAKE_TICKS = 24;
export const ICICLE_SHAKE_AMPLITUDE = 1;
// 当たった機体の vy を、少なくともこの値（下向き）にする。vx は変えない（applyKnockback は vx を上書きするので使わない）
export const ICICLE_KNOCK_VY = 2;
// 村（villages.js）の濃さに掛ける。1 より大きくすると詰まる
export const ICICLE_FILL_SCALE = 1;
// 天井の空きから、床まで残す余白（タイル）。吊るす長さは (空き - この値) × タイルまで
export const ICICLE_KEEP_BELOW = 3;
// 隣のつららとの間隔（px、4px 刻みで引く）。つららの幅に足す
export const ICICLE_GAP = [4, 20];
// 震えているあいだ、先から水滴の粒を 1 つ落とす間隔（tick。予兆）
export const ICICLE_DRIP_EVERY = 6;
// 氷の粒の数。hit: 当たって震え始めるとき、land: 落ちて砕けるとき
export const ICICLE_SHARDS = { hit: 4, land: 14 };
```

- [ ] **Step 4: 通ることを確認する**

Run: `node --test tests/icicles-palette.test.js`
Expected: PASS（4 件）

- [ ] **Step 5: 変異テスト（壊して赤くなることを確認し、戻す）**

`palette.js` の `ICICLE_COLORS.body` を `'#c3d0de'`（雪の白）に変える → 「青が強い」テストが赤になる。`'#ffffff'` に変える → 「雪のふちより暗い」が赤になる。`TOWN_MATERIALS[6].burns` を `true` に変える → 「燃えず」が赤になる。確認したら元に戻す。

- [ ] **Step 6: コミット**

`Constants.js` の変更は「Constants.js のステージ手順」で、`TOWN_MATERIALS` の行は HEAD の `5:` の行の次への挿入として、つららのまとまりは `SNOWTREE_FLURRY_BIG_SHARE` の行（`ANCHOR_LINE`。末尾の改行まで）の直後への挿入として作る（`MARK_START` = `"\n// --- 5面のつらら ---"`、`MARK_END` = `"export const ICICLE_SHARDS = { hit: 4, land: 14 };"`）。

```bash
git add src/js/world/town/chunks.js src/js/world/town/palette.js tests/icicles-palette.test.js
# Constants.js は上の手順で blob を index へ
git commit -m "feat: つららの材料 MAT_ICE・氷の色・定数

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: つららの絵（buildIcicle）

**Files:**
- Create: `src/js/world/town/icicles.js`
- Test: `tests/icicles-build.test.js`（新規）

**Interfaces:**
- Consumes: `MAT_ICE`、`CHUNK`（`chunks.js`）、`ringPart`（`shapes.js`）、`ICICLE_COLORS`、`ICICLE_LENGTH` / `ICICLE_WIDTH` / `ICICLE_DAMAGE`、`rasterizeParts`
- Produces:
  - `icicleDamage(length: number): number` — 長さ（px）から四捨五入したダメージ。`ICICLE_LENGTH[0]` で `ICICLE_DAMAGE[0]`、`ICICLE_LENGTH[1]` で `ICICLE_DAMAGE[1]`
  - `buildIcicle(rng: SeededRNG, { maxLength: number }): { kind: 'icicle', parts, w: number, h: number, footX: number, length: number, damage: number } | null` — 天井向きで組む。原点は上端（y = 0。上の 4px は天井に埋まる）、`footX` は中心の x、`h = length + 4`（`length` が見える長さ）。`maxLength` が `ICICLE_LENGTH[0]` 未満なら `null`

- [ ] **Step 1: 失敗するテストを書く**

`tests/icicles-build.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { rasterizeParts, MAT_ICE, SOLID, CHUNK } from '../src/js/world/town/chunks.js';
import { buildIcicle, icicleDamage } from '../src/js/world/town/icicles.js';
import { ICICLE_COLORS } from '../src/js/world/town/palette.js';
import { ICICLE_LENGTH, ICICLE_WIDTH, ICICLE_DAMAGE } from '../src/js/utils/Constants.js';

const SEEDS = Array.from({ length: 80 }, (_, i) => i * 7919 + 1);
const each = (fn) => { for (const seed of SEEDS) fn(new SeededRNG(seed), seed); };
const BIG = { maxLength: 400 };

test('かけらは全部「氷の厚い壁」（弾が止まり、燃えず、爆発物でもない）', () => {
    each((rng) => {
        const b = buildIcicle(rng, BIG);
        assert.ok(b, '大きな余裕を渡せば必ず作れる');
        const { cells } = rasterizeParts(b.parts, b.w, b.h);
        assert.ok(cells.some((v) => v));
        for (const v of cells) if (v) assert.equal(v, MAT_ICE | SOLID);
    });
});

test('外接矩形は 4px の倍数で、根元の x が矩形の中にある。絵は外接矩形に収まる', () => {
    each((rng) => {
        const b = buildIcicle(rng, BIG);
        assert.equal(b.w % CHUNK, 0);
        assert.equal(b.h % CHUNK, 0);
        assert.ok(b.footX > 0 && b.footX < b.w);
        for (const p of b.parts) for (const r of p.rings) for (const [x, y] of r) {
            assert.ok(x >= -1e-9 && x <= b.w + 1e-9 && y >= -1e-9 && y <= b.h + 1e-9, `(${x}, ${y}) が ${b.w}x${b.h} の外`);
        }
    });
});

test('見える長さ（上の 4px は天井に埋まる）と根元の幅が、設定の範囲に収まる（数千通りの乱数）', () => {
    for (let i = 0; i < 3000; i++) {
        const b = buildIcicle(new SeededRNG(i * 31 + 7), BIG);
        assert.equal(b.length, b.h - CHUNK);
        assert.ok(b.length >= ICICLE_LENGTH[0] && b.length <= ICICLE_LENGTH[1], `seed ${i * 31 + 7}: 長さ ${b.length}`);
        assert.equal(b.length % CHUNK, 0);
        // 根元の段（一番上の行）に出る輪の幅 ≒ 根元の幅
        let x0 = Infinity, x1 = -Infinity;
        for (const p of b.parts) for (const r of p.rings) for (const [x, y] of r) if (y < 0.01) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
        assert.ok(x1 - x0 >= ICICLE_WIDTH[0] - 1 && x1 - x0 <= ICICLE_WIDTH[1] + 1, `seed ${i * 31 + 7}: 幅 ${x1 - x0}`);
    }
});

test('長さの範囲の端まで作り分ける（偏らない）', () => {
    const seen = new Set();
    for (let i = 0; i < 600; i++) seen.add(buildIcicle(new SeededRNG(i * 13 + 1), BIG).length);
    assert.ok(seen.has(ICICLE_LENGTH[0]) && seen.has(ICICLE_LENGTH[1]), `端が出ない: ${[...seen].sort((a, b) => a - b)}`);
    assert.ok(seen.size >= (ICICLE_LENGTH[1] - ICICLE_LENGTH[0]) / CHUNK, `${seen.size} 通りしか出ない`);
});

test('置ける長さ（maxLength）を超えない。下限（24px）に満たなければ作らない', () => {
    for (let i = 0; i < 300; i++) {
        const maxLength = ICICLE_LENGTH[0] + (i % 12) * 4;
        const b = buildIcicle(new SeededRNG(i + 1), { maxLength });
        assert.ok(b, `maxLength ${maxLength} で作れない`);
        assert.ok(b.length <= maxLength, `maxLength ${maxLength} に ${b.length}`);
    }
    assert.equal(buildIcicle(new SeededRNG(1), { maxLength: ICICLE_LENGTH[0] - 4 }), null);
});

test('先が尖る: 根元の段より先の段のほうが、かけらが少ない（細くなる）', () => {
    each((rng) => {
        const b = buildIcicle(rng, BIG);
        const { cells, cw, ch } = rasterizeParts(b.parts, b.w, b.h);
        const row = (j) => { let n = 0; for (let i = 0; i < cw; i++) if (cells[j * cw + i]) n++; return n; };
        assert.ok(row(0) >= 2, '根元の段が 1 かけら以下');
        assert.ok(row(ch - 1) < row(0), `先 ${row(ch - 1)} が根元 ${row(0)} より細くない`);
        assert.ok(row(ch - 1) >= 1, '先の段が空');
    });
});

test('根元の段（一番上の行）にかけらがあり、そこから先まで 1 本につながっている（途中で切れない）', () => {
    each((rng) => {
        const b = buildIcicle(rng, BIG);
        const { cells, cw, ch } = rasterizeParts(b.parts, b.w, b.h);
        for (let j = 0; j < ch; j++) {
            let any = false;
            for (let i = 0; i < cw; i++) if (cells[j * cw + i]) any = true;
            assert.ok(any, `${j} 段目が空（途中で切れている）`);
        }
    });
});

test('描き順は body → light → dark（明るい面と影の筋が本体の上に重なる）', () => {
    const b = buildIcicle(new SeededRNG(3), BIG);
    const order = b.parts.map((p) => p.color);
    assert.deepEqual(order, [ICICLE_COLORS.body, ICICLE_COLORS.light, ICICLE_COLORS.dark]);
});

test('同じ乱数なら同じ絵', () => {
    assert.deepEqual(buildIcicle(new SeededRNG(5), BIG), buildIcicle(new SeededRNG(5), BIG));
});

test('icicleDamage: 長さに比例（最短で ICICLE_DAMAGE[0]、最長で [1]、中間は線形で四捨五入）', () => {
    const [l0, l1] = ICICLE_LENGTH, [d0, d1] = ICICLE_DAMAGE;
    assert.equal(icicleDamage(l0), d0);
    assert.equal(icicleDamage(l1), d1);
    const mid = (l0 + l1) / 2;
    assert.equal(icicleDamage(mid), Math.round((d0 + d1) / 2));
    let prev = -Infinity;
    for (let len = l0; len <= l1; len += CHUNK) {
        const d = icicleDamage(len);
        assert.ok(d >= prev, '長いほうがダメージが小さい');
        prev = d;
    }
    const b = buildIcicle(new SeededRNG(9), BIG);
    assert.equal(b.damage, icicleDamage(b.length));
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `node --test tests/icicles-build.test.js`
Expected: FAIL（`icicles.js` が無い）

- [ ] **Step 3: 実装する**

`src/js/world/town/icicles.js`:

```js
// ============================================
// icicles - 5面の天井のつらら
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-11-stage5-icicles-design.md
// 絵は多角形（4面の植物・5面の木と同じ。plants.js の冒頭を参照）。当たり・支え・壊れ方は 4px のかけらの表のまま
// （chunks.js の rasterizeParts が、多角形が掛かるかけらを全部 MAT_ICE の厚い壁にする）。
//
// 座標は建物の canvas の px。天井向き: 上端 y = 0 で、上の 4px は天井の岩に埋まる（根元の段が支えのかけら）。
// 下へ y を正に。先は y = h（h = 見える長さ + 4）。中心は x = footX。
// 輪郭は、根元から先へ細くなる帯に、少しの揺れ（直線の三角形に見えないように）。先は少しだけ横へ曲がる。

import { CHUNK, MAT_ICE } from './chunks.js';
import { ringPart } from './shapes.js';
import { ICICLE_COLORS as COL } from './palette.js';
import { ICICLE_LENGTH, ICICLE_WIDTH, ICICLE_DAMAGE } from '../../utils/Constants.js';

const rand = (rng, lo, hi) => lo + rng.next() * (hi - lo);

/** 見える長さ（px）から、落ちたときのダメージ。長さに比例して四捨五入 */
export function icicleDamage(length) {
    const [l0, l1] = ICICLE_LENGTH;
    const [d0, d1] = ICICLE_DAMAGE;
    return Math.round(d0 + ((length - l0) / (l1 - l0)) * (d1 - d0));
}

/**
 * つらら 1 本の絵。
 * @param {{maxLength:number}} o 吊るせる長さ（px。見える長さ。天井の空きから床までの余白を引いたもの）
 * @returns {{kind:'icicle', parts:Array, w:number, h:number, footX:number, length:number, damage:number}|null}
 *   maxLength が ICICLE_LENGTH の下限に満たなければ null
 */
export function buildIcicle(rng, { maxLength }) {
    const [l0, l1] = ICICLE_LENGTH;
    const hi = Math.min(l1, Math.floor(maxLength / CHUNK) * CHUNK);
    if (hi < l0) return null;
    // 4px 刻みで引く（かけらの大きさに揃える）
    const length = l0 + CHUNK * Math.floor(rng.next() * ((hi - l0) / CHUNK + 1));
    const width = Math.round(rand(rng, ICICLE_WIDTH[0], ICICLE_WIDTH[1]));
    const half = width / 2;
    // 輪郭の揺れの余白と、先の曲がりの分を、左右に 2px ずつ取る
    const w = Math.ceil(width / CHUNK) * CHUNK + CHUNK;
    const cx = w / 2;
    const h = length + CHUNK;

    // 輪郭: 4px おきの段。幅は先へ向かって (1 - t)^1.1 で細くなり、先の 0.3px まで
    const n = h / CHUNK;
    const bend = rand(rng, -1.2, 1.2);   // 先の横ずれ（t² で効く）
    const left = [], right = [], mid = [], lightEdge = [], darkEdge = [];
    for (let k = 0; k <= n; k++) {
        const t = k / n;
        const y = (h * k) / n;
        const hw = k === n ? 0.3 : Math.max(0.5, half * Math.pow(1 - t, 1.1) + (k === 0 ? 0 : rand(rng, -0.5, 0.5)));
        const c = cx + bend * t * t;
        left.push([c - hw, y]);
        right.push([c + hw, y]);
        mid.push([c, y]);
        lightEdge.push([c - hw * 0.15, y]);   // 左の明るい面は、中心線の少し左まで
        darkEdge.push([c + hw * 0.45, y]);    // 右の影の筋は、右の縁から 55% の所から
    }
    const parts = [];
    ringPart(parts, [[...left, ...right.slice().reverse()]], COL.body, MAT_ICE, true);
    ringPart(parts, [[...left, ...lightEdge.slice().reverse()]], COL.light, MAT_ICE, true);
    ringPart(parts, [[...darkEdge, ...right.slice().reverse()]], COL.dark, MAT_ICE, true);
    return { kind: 'icicle', parts, w, h, footX: cx, length, damage: icicleDamage(length) };
}
```

- [ ] **Step 4: 通ることを確認する**

Run: `node --test tests/icicles-build.test.js`
Expected: PASS（9 件）。落ちるテストがあれば、下の「想定される調整」を見る。

想定される調整（落ちたときだけ。根拠なしに数値を替えない）:
- 「幅」のテストが落ちる: 揺れ（±0.5）が根元の段にも掛かるので、根元（`k === 0`）は揺らさないようにしてある。それでも `ICICLE_WIDTH` と 1px を超えるなら、`width` の丸めを見直す
- 「先が根元より細い」が落ちる: 長さ 24px で根元 12px のとき、先の段が 3 かけらを超えることはないはずだが、落ちたら `Math.pow(1 - t, 1.1)` の指数を 1.3 に上げて再実行し、コメントに実測を残す
- 「途中で切れない」が落ちる: 細い所（半幅 0.5px）が 4px のかけらの境目に重なって、かけらが空になっていないか確認し、最小の半幅 `0.5` を `0.8` に上げる

- [ ] **Step 5: 変異テスト**

- `Math.pow(1 - t, 1.1)` を `1` に変える（先まで細くならない）→ 「先が尖る」が赤くなる
- `ringPart` の `MAT_ICE` を `MAT_NONE`（`0`）に変える → 「氷の厚い壁」が赤くなる
- `ringPart` の 3 行の順を入れ替える → 「描き順」が赤くなる
- `icicleDamage` の `Math.round` を外す → 中間の四捨五入のテストが赤くなる

確認したら元に戻す。

- [ ] **Step 6: コミット**

```bash
git add src/js/world/town/icicles.js tests/icicles-build.test.js
git commit -m "feat: つららの絵（天井から垂れる先の尖った多角形。長さ 24〜64px・幅 8〜12px）と、長さに比例するダメージ

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 置き場所（generateIcicles）

**Files:**
- Create: `src/js/world/town/generateIcicles.js`
- Test: `tests/icicles-generate.test.js`（新規）

**Interfaces:**
- Consumes: `findSites`（`placement.js`）、`placeVillages` / `villageFill`（`villages.js`）、`makePlacer`（`placer.js`。`{ specs, add(spec, overlapOk, wallCol), freeUp }`）、`step4`（`shapes.js`）、`buildIcicle`、`ICICLE_FILL_SCALE` / `ICICLE_KEEP_BELOW` / `ICICLE_GAP`
- Produces: `generateIcicles({ grid, rows, cols, excludeRects?, rng, villages? }): Array<spec>` — 設計図は `{ site: 'ceiling', style: 'P', soft: true, brittle: true, flora: 'ice', kind: 'icicle', footX, damage, length, x, y, w, h, parts }`。`Town` にそのまま渡せる

- [ ] **Step 1: 失敗するテストを書く**

`tests/icicles-generate.test.js`（雪の木の `tests/snowtrees-generate.test.js` と同じ空洞を使う）:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { generateIcicles } from '../src/js/world/town/generateIcicles.js';
import { rasterizeParts, computeAnchors, CHUNK } from '../src/js/world/town/chunks.js';
import { TILE_SIZE as T, BLOCK_EMPTY, ICICLE_LENGTH, ICICLE_KEEP_BELOW } from '../src/js/utils/Constants.js';
import { icicleDamage } from '../src/js/world/town/icicles.js';

// 岩に囲まれた 100x40 タイルの広い空洞（行 8〜31、列 6〜93）。床（行 32）・天井（行 7）・左右の壁がある。
// 左の列 6〜45 は天井が行 27 まで下がっていて、空きは 4 タイルしかない（床まで 3 タイル残すと吊るせない所）
const ROWS = 40, COLS = 100;
const SLAB_BOTTOM = 27, SLAB_COLS = [6, 45];
const FLOOR_TOP_Y = 32 * T;
const grid = Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => (
    r >= 8 && r <= 31 && c >= 6 && c <= 93
        && !(r <= SLAB_BOTTOM && c >= SLAB_COLS[0] && c <= SLAB_COLS[1]) ? BLOCK_EMPTY : 1)));
const isSolid = (r, c) => r < 0 || r >= ROWS || c < 0 || c >= COLS || grid[r][c] !== BLOCK_EMPTY;
const VILLAGES = [{ c: 50, r: 20, radius: 80, peak: 0.8 }];

const gen = (seed, extra = {}) => generateIcicles({
    grid, rows: ROWS, cols: COLS, rng: new SeededRNG(seed), villages: VILLAGES, ...extra,
});

test('天井にだけ、つららが並ぶ。設計図の印は soft・brittle・flora ice', () => {
    const specs = gen(11);
    assert.ok(specs.length > 20, `${specs.length} 本しか無い`);
    for (const s of specs) {
        assert.equal(s.site, 'ceiling');
        assert.equal(s.kind, 'icicle');
        assert.equal(s.soft, true);
        assert.equal(s.brittle, true);
        assert.equal(s.flora, 'ice');
        assert.equal(s.style, 'P');
    }
});

test('どのつららも天井の岩につながっている（支えのかけらが 1 つ以上）。上端の 4px が岩に埋まる', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
        for (const s of gen(seed)) {
            const { cells, cw, ch } = rasterizeParts(s.parts, s.w, s.h);
            const anchors = computeAnchors(cells, cw, ch, s.x, s.y, isSolid);
            assert.ok(anchors.length > 0, `(${s.x},${s.y}) が宙に浮いている`);
            // 上端の行だけが岩に入る（先は空洞の中）
            assert.ok(anchors.every((a) => a.i < cw), '上端の行以外のかけらが岩に入っている');
        }
    }
});

test('長さは設定の範囲。ダメージは長さに比例（icicleDamage と同じ）。footX は矩形の中', () => {
    const lengths = [];
    for (const seed of [1, 2, 3, 4, 5]) {
        for (const s of gen(seed)) {
            const len = s.h - CHUNK;
            lengths.push(len);
            assert.equal(s.length, len);
            assert.ok(len >= ICICLE_LENGTH[0] && len <= ICICLE_LENGTH[1], `長さ ${len}`);
            assert.equal(s.damage, icicleDamage(len));
            assert.ok(s.footX > 0 && s.footX < s.w);
        }
    }
    assert.ok(lengths.some((l) => l <= 32) && lengths.some((l) => l >= 56), '短いか長いつららが出ない');
});

/** 天井は行 20 まで、空洞は行 21 から emptyRows 行（列 6〜93）、その下が床。吊るせる長さが空きで決まる部屋 */
const lowRoom = (emptyRows) => Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => (
    r >= 21 && r < 21 + emptyRows && c >= 6 && c <= 93 ? BLOCK_EMPTY : 1)));

test('床まで ICICLE_KEEP_BELOW タイルの余白を残す（空き 5 タイルの部屋では、長さ 32px まで。先が床に近づかない）', () => {
    const grid5 = lowRoom(5);
    const floorTop = (21 + 5) * T;
    let longest = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
        const specs = generateIcicles({ grid: grid5, rows: ROWS, cols: COLS, rng: new SeededRNG(seed), villages: VILLAGES });
        for (const s of specs) {
            assert.ok(s.y + s.h <= floorTop - ICICLE_KEEP_BELOW * T, `(${s.x},${s.y}) の先 ${s.y + s.h} が床 ${floorTop} に近すぎる`);
            longest = Math.max(longest, s.length);
        }
        assert.ok(specs.length > 10, `${specs.length} 本しか無い（この検証が意味を失った）`);
    }
    assert.equal(longest, (5 - ICICLE_KEEP_BELOW) * T, '余白いっぱいの長さまで吊るしていない（余白を取りすぎている）');
});

test('空きが余白（ICICLE_KEEP_BELOW）＋最短の長さに足りない部屋には、1 本も吊るさない', () => {
    for (const emptyRows of [1, 2, 3, 4]) {
        const specs = generateIcicles({ grid: lowRoom(emptyRows), rows: ROWS, cols: COLS, rng: new SeededRNG(1), villages: VILLAGES });
        assert.equal(specs.length, 0, `空き ${emptyRows} タイルで ${specs.length} 本`);
    }
});

test('天井が低い所（空きが余白と最短の長さに足りない）には吊るさない', () => {
    let high = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
        for (const s of gen(seed)) {
            const mid = (s.x + s.w / 2) / T;
            assert.ok(!(mid >= SLAB_COLS[0] && mid <= SLAB_COLS[1] + 1 && s.y > 20 * T), `低い天井の下 (${s.x},${s.y}) にある`);
            high++;
        }
    }
    assert.ok(high > 30, '高い天井の下のつららが少なすぎる（この検証が意味を失った）');
});

test('隣のつららと重ならない', () => {
    for (const seed of [1, 2, 3]) {
        const specs = gen(seed);
        for (let i = 0; i < specs.length; i++) for (let j = i + 1; j < specs.length; j++) {
            const a = specs[i], b = specs[j];
            assert.ok(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h), `(${a.x},${a.y}) と (${b.x},${b.y}) が重なる`);
        }
    }
});

test('除外の矩形（開始の部屋・基地の部屋）には置かない。複数渡せる', () => {
    const rects = [{ r0: 8, r1: 31, c0: 6, c1: 30 }, { r0: 8, r1: 31, c0: 70, c1: 93 }];
    const specs = gen(7, { excludeRects: rects });
    assert.ok(specs.length > 0);
    for (const s of specs) {
        const c1 = Math.floor((s.x + s.w - 1) / T), r1 = Math.floor((s.y + s.h - 1) / T);
        for (const rc of rects) {
            assert.ok(!(s.x / T <= rc.c1 && c1 >= rc.c0 && s.y / T <= rc.r1 && r1 >= rc.r0), `(${s.x},${s.y}) が除外の矩形に掛かる`);
        }
    }
});

test('同じ乱数なら同じ設計図、違えば違う', () => {
    const sig = (specs) => JSON.stringify(specs.map((s) => [s.x, s.y, s.w, s.h]));
    assert.equal(sig(gen(3)), sig(gen(3)));
    assert.notEqual(sig(gen(3)), sig(gen(4)));
});

test('Math.random を使わない（週の決定性。渡した rng だけで決まる）', () => {
    const real = Math.random;
    Math.random = () => { throw new Error('Math.random は使わない'); };
    try { gen(3); } finally { Math.random = real; }
});

test('村の外より、密集した村の中のほうがつららが多い', () => {
    const count = (villages) => generateIcicles({ grid, rows: ROWS, cols: COLS, rng: new SeededRNG(9), villages }).length;
    assert.ok(count(VILLAGES) > count([]) * 2);
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `node --test tests/icicles-generate.test.js`
Expected: FAIL（`generateIcicles.js` が無い）

- [ ] **Step 3: 実装する**

`src/js/world/town/generateIcicles.js`:

```js
// ============================================
// generateIcicles - 5面の天井につららを並べる
// ============================================
//
// 置き場所探し（placement.js の findSites）、群生（villages.js）、「置けるか」の判定（placer.js）は
// 4面の植物・5面の木と同じ。乱数は呼び出し側が渡す派生ストリームだけを使う
// （game.rng を消費すると敵の構成が変わり、週の決定性が壊れる）。
// 返す設計図は Town にそのまま渡せる。soft: true は崩壊の演出を持たない印、brittle: true は当たると欠けずに
// 震えて全体が落ちる印、flora: 'ice' は砕けた粒の色を氷にする印。

import { TILE_SIZE as T, TOWN_CHUNK as CH, ICICLE_FILL_SCALE, ICICLE_KEEP_BELOW, ICICLE_GAP } from '../../utils/Constants.js';
import { findSites } from './placement.js';
import { placeVillages, villageFill } from './villages.js';
import { makePlacer } from './placer.js';
import { step4 } from './shapes.js';
import { buildIcicle } from './icicles.js';

export function generateIcicles({
    grid, rows, cols, excludeRects = [], rng, villages = placeVillages(rng, rows, cols),
}) {
    const sites = findSites(grid, rows, cols);
    const { specs, add } = makePlacer({ grid, rows, cols, excludeRects });
    const fillAt = (c, r) => Math.min(1, villageFill(villages, c, r) * ICICLE_FILL_SCALE);

    for (const run of sites.ceilings) {
        // 天井の空き（run.drop）から、床まで残す余白を引いた長さまで吊るせる。足りなければこの区間には置かない
        const maxLength = (run.drop - ICICLE_KEEP_BELOW) * T;
        if (maxLength <= 0) continue;
        const y = (run.r + 1) * T - CH;   // 上端の 1 段（4px）を天井の岩に埋める
        const xEnd = run.c1 * T;
        let x = run.c0 * T;               // 次のつららの左端
        while (xEnd - x >= 8) {
            if (rng.next() >= fillAt(x / T, run.r)) { x += step4(rng, 8, 24); continue; }
            const b = buildIcicle(rng, { maxLength });
            if (!b) { x += 8; continue; }
            // 根元（中心 ± 半幅）が天井の区間からはみ出すと、支えのかけらが岩に入らない・片側が宙に浮く
            if (x + b.w > xEnd) { x += 8; continue; }
            const placed = add({
                site: 'ceiling', style: 'P', soft: true, brittle: true, flora: 'ice', kind: b.kind,
                footX: b.footX, damage: b.damage, length: b.length,
                x, y, w: b.w, h: b.h, parts: b.parts,
            }, false);
            x += placed ? b.w + step4(rng, ICICLE_GAP[0], ICICLE_GAP[1]) : 8;
        }
    }
    return specs;
}
```

- [ ] **Step 4: 通ることを確認する**

Run: `node --test tests/icicles-generate.test.js`
Expected: PASS（10 件）

「床まで余白を残す」テストの式が環境で落ちるときは、テストの条件（`s.y < 7 * T`・`s.y < 28 * T` の分岐）が空洞の形に合っているかを見直す。**実装の `maxLength` の式を緩めない**（床に届かないことが目的）。

- [ ] **Step 5: 変異テスト**

- `maxLength` の式から `ICICLE_KEEP_BELOW` を外す（`run.drop * T`）→ 「床まで余白」が赤くなる
- `y` を `(run.r + 1) * T` に変える（埋めない）→ 「支えのかけら」が赤くなる
- `add(..., false)` を `add(..., true)`（重なりを許す）に変える → 「重ならない」が赤くなる
- `rng.next()` を `Math.random()` に変える → 「Math.random を使わない」が赤くなる
- `excludeRects` を `makePlacer` に渡さない → 「除外の矩形」が赤くなる

確認したら元に戻す。

- [ ] **Step 6: コミット**

```bash
git add src/js/world/town/generateIcicles.js tests/icicles-generate.test.js
git commit -m "feat: つららの置き場所（天井の空きから床まで 3 タイル残し、村の濃淡で並べる）

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 落ちるつららの塊（IcicleFall）と当て方（impactDamage）

**Files:**
- Create: `src/js/utils/impactDamage.js`
- Create: `src/js/world/town/IcicleFall.js`
- Test: `tests/icicles-fall.test.js`（新規）

**Interfaces:**
- Consumes: `FallingPiece`（`FallingPiece.js`。コンストラクタ引数 `{ canvas, cells, cw, ch, x, y, vx, vy, spin, sourceId, fireFuel }`、`step()`、`cx` / `cy` / `width` / `height` / `count` / `mainMaterial()`）、`recordHit`（`hitPoint.js`）、`CHUNK`、`ICICLE_KNOCK_VY`
- Produces:
  - `impactTargets(game): object[]` — `[game.player, game.carrier, ...game.enemies]` のうち、生きていて（`alive`）、ドッキング中でない（`!docked`）もの
  - `applyImpact(entity, x, y, damage, knockVy): void` — `recordHit(entity, x, y)` → `entity.takeDamage(damage)` → `entity.vy` が `knockVy` より小さければ `knockVy` にする（`vx` は変えない）。`takeDamage` が関数でない相手は何もしない
  - `class IcicleFall extends FallingPiece` — コンストラクタ `{ damage, ...pieceOpts }`、`icicle === true`、`damage`、`hit: Set`（当てた機体）、`touches(entity): boolean`（かけらの矩形が機体の矩形に掛かるか）

- [ ] **Step 1: 失敗するテストを書く**

`tests/icicles-fall.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IcicleFall } from '../src/js/world/town/IcicleFall.js';
import { FallingPiece } from '../src/js/world/town/FallingPiece.js';
import { impactTargets, applyImpact } from '../src/js/utils/impactDamage.js';
import { CHUNK, MAT_ICE, SOLID } from '../src/js/world/town/chunks.js';
import { fakeCanvas } from './helpers/town-fixtures.js';
import { ICICLE_KNOCK_VY, TOWN_FALL_GRAVITY } from '../src/js/utils/Constants.js';

const V = MAT_ICE | SOLID;

/** 3 かけら幅・3 段の、先の尖った塊（上の段が広く、下の段は真ん中の 1 かけらだけ）。左上が (x, y) */
function piece(x = 100, y = 100, damage = 20) {
    const cells = new Uint8Array([V, V, V, 0, V, 0, 0, V, 0]);
    return new IcicleFall({ canvas: fakeCanvas(12, 12), cells, cw: 3, ch: 3, x, y, damage });
}
const entity = (x, y, extra = {}) => ({ x, y, width: 10, height: 10, alive: true, hp: 100, vx: 1.5, vy: 0, takeDamage(n) { this.hp -= n; }, ...extra });

test('IcicleFall は FallingPiece の一種。回らず、横へ流れず、重力で落ちる', () => {
    const p = piece();
    assert.ok(p instanceof FallingPiece);
    assert.equal(p.icicle, true);
    assert.equal(p.damage, 20);
    const y0 = p.y;
    p.step();
    assert.equal(p.angle, 0);
    assert.equal(p.x, 100);
    assert.ok(p.y > y0 && Math.abs(p.vy - TOWN_FALL_GRAVITY) < 1e-9);
});

test('touches: かけらの矩形が機体の矩形に掛かれば true。外接矩形の中でも、空のかけらには当たらない', () => {
    const p = piece(100, 100);   // 外接矩形は x 100〜112、y 100〜112。先（下の段）は真ん中の列（x 104〜108）だけ
    assert.equal(p.touches(entity(102, 102)), true, '上の段に重なる');
    assert.equal(p.touches(entity(104, 108)), true, '先のかけらに重なる');
    // 外接矩形の中だが、先の段の左（空のかけら）にだけ重なる機体
    assert.equal(p.touches(entity(100, 108, { width: 3, height: 4 })), false, '空のかけらに当たった');
    assert.equal(p.touches(entity(200, 100)), false, '離れている');
    assert.equal(p.touches(entity(100, 112)), false, '真下に接しているだけ（重ならない）');
});

test('impactTargets: 自機・母艦・敵。死んでいるもの・ドッキング中の自機・無いものは除く', () => {
    const player = entity(0, 0), carrier = entity(0, 0), e1 = entity(0, 0), e2 = entity(0, 0, { alive: false });
    assert.deepEqual(impactTargets({ player, carrier, enemies: [e1, e2] }), [player, carrier, e1]);
    assert.deepEqual(impactTargets({ player: { ...player, docked: true }, carrier: null, enemies: [] }), []);
    assert.deepEqual(impactTargets({ player: null, carrier: null }), []);
    assert.deepEqual(impactTargets({ player: { ...player, alive: false }, enemies: undefined }), []);
});

test('applyImpact: ダメージを与え、当たった点を残し、下向きに押す（vx は変えない）。すでに速く落ちていれば押さない', () => {
    const e = entity(0, 0);
    applyImpact(e, 5, 6, 25, ICICLE_KNOCK_VY);
    assert.equal(e.hp, 75);
    assert.equal(e.lastHitX, 5);
    assert.equal(e.lastHitY, 6);
    assert.equal(e.vy, ICICLE_KNOCK_VY);
    assert.equal(e.vx, 1.5, 'vx が変わった');
    const fast = entity(0, 0, { vy: 5 });
    applyImpact(fast, 0, 0, 10, ICICLE_KNOCK_VY);
    assert.equal(fast.vy, 5, '速く落ちている機体を遅くした');
    const up = entity(0, 0, { vy: -6 });
    applyImpact(up, 0, 0, 10, ICICLE_KNOCK_VY);
    assert.equal(up.vy, ICICLE_KNOCK_VY, '上昇中の機体は下向きの押しに替わる');
});

test('applyImpact: takeDamage が無い相手・vy が無い相手でも例外を出さない', () => {
    applyImpact({ x: 0, y: 0 }, 0, 0, 10, 2);
    const noVy = { takeDamage() { this.called = true; } };
    applyImpact(noVy, 0, 0, 10, 2);
    assert.equal(noVy.called, true);
    assert.equal(noVy.vy, undefined);
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `node --test tests/icicles-fall.test.js`
Expected: FAIL（`IcicleFall.js` / `impactDamage.js` が無い）

- [ ] **Step 3: 実装する**

`src/js/utils/impactDamage.js`:

```js
// ============================================
// impactDamage - 落ちてきたものが機体に当たったときのダメージ
// ============================================
//
// 落ちるつらら（world/town/IcicleFall.js）が使う。範囲ダメージ（blastDamage.js）と違い、
// 当たった機体 1 つに、押しは下向きだけ（applyKnockback は vx を上書きするので使わない）。

import { recordHit } from './hitPoint.js';

/**
 * 当てる相手の一覧。自機・母艦・敵（blastDamage.applyBlastDamage と同じ顔ぶれ）。
 * 死んでいるものは除く。ドッキング中の自機も除く: 母艦の中にいて、母艦と二重に当たらないように
 */
export function impactTargets(game) {
    const list = [];
    const add = (e) => { if (e && e.alive && !e.docked) list.push(e); };
    add(game.player);
    add(game.carrier);
    for (const e of game.enemies || []) add(e);
    return list;
}

/**
 * @param {object} entity 当てる相手（takeDamage が無ければ何もしない）
 * @param {number} x 当たった点（破壊時の破片がここから散る。hitPoint.recordHit）
 * @param {number} y
 * @param {number} damage
 * @param {number} knockVy 少なくともこの vy（下向き）にする。すでに速く落ちていれば変えない
 */
export function applyImpact(entity, x, y, damage, knockVy) {
    if (!entity || typeof entity.takeDamage !== 'function') return;
    recordHit(entity, x, y);
    entity.takeDamage(damage);
    if (entity.vy !== undefined && entity.vy < knockVy) entity.vy = knockVy;
}
```

`src/js/world/town/IcicleFall.js`:

```js
// ============================================
// IcicleFall - 落ちるつらら
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-11-stage5-icicles-design.md
// FallingPiece（支えを失って落ちる塊）の一種。回らず、横へも流れず、重力で真下へ落ちる（先が真下を向いたまま）。
// 床・岩に触れたら砕ける処理（Town._shatter）と、下の建物を欠かす処理（Town._updateFalling）は
// ふつうの破片と同じ。違うのは、落下中に機体へダメージを与えること。
// ダメージは Town._icicleImpact が、この塊の touches() で機体に掛かったかを見て与える。
// 当てた機体は hit に覚える（1 本のつららが同じ機体を何度も当て続けないように）。

import { FallingPiece } from './FallingPiece.js';
import { CHUNK } from './chunks.js';

export class IcicleFall extends FallingPiece {
    /** @param {{damage:number}} opts damage: この 1 本が機体に与えるダメージ（建物の damage をそのまま持ってくる） */
    constructor({ damage, ...piece }) {
        super({ ...piece, vx: 0, spin: 0 });
        this.icicle = true;
        this.damage = damage;
        this.hit = new Set();
    }

    /**
     * かけらの矩形が機体の矩形に重なるか。外接矩形ではなく、残っているかけらごとに見る
     * （先の尖った形なので、外接矩形の端の空いた所には当たらない）。接しているだけ（面積が 0）は重ならない
     */
    touches(entity) {
        const ex1 = entity.x + entity.width, ey1 = entity.y + entity.height;
        for (let k = 0; k < this.cells.length; k++) {
            if (!this.cells[k]) continue;
            const i = k % this.cw, j = (k - i) / this.cw;
            const rx = this.x + i * CHUNK, ry = this.y + j * CHUNK;
            if (entity.x < rx + CHUNK && ex1 > rx && entity.y < ry + CHUNK && ey1 > ry) return true;
        }
        return false;
    }
}
```

- [ ] **Step 4: 通ることを確認する**

Run: `node --test tests/icicles-fall.test.js`
Expected: PASS（5 件）

- [ ] **Step 5: 変異テスト**

- `touches` を外接矩形（`this.x`〜`this.x + this.width`）で判定するように変える → 「空のかけらには当たらない」が赤くなる
- `touches` の `<` を `<=` に変える → 「接しているだけ」が赤くなる
- `impactTargets` の `!e.docked` を外す → 「ドッキング中」が赤くなる
- `applyImpact` の `entity.vy < knockVy` を `true` に変える → 「速く落ちている機体を遅くした」が赤くなる
- `applyImpact` で `entity.vx = 0` を足す → 「vx が変わった」が赤くなる
- `IcicleFall` の `spin: 0` を外す → `piece()` に spin が無ければ通ってしまうので、`new IcicleFall({ ..., spin: 0.05 })` で作ったときも `angle` が 0 のままであることを確かめるテストを 1 件足す（コンストラクタが `vx` と `spin` を上書きすることの確認）

確認したら元に戻す。

- [ ] **Step 6: コミット**

```bash
git add src/js/utils/impactDamage.js src/js/world/town/IcicleFall.js tests/icicles-fall.test.js
git commit -m "feat: 落ちるつらら（IcicleFall）と、機体への当て方（impactDamage）

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Town — 震える・落ちる・当てる・砕ける

**Files:**
- Modify: `src/js/world/town/Town.js`
- Test: `tests/icicles-town.test.js`（新規）

**Interfaces:**
- Consumes: Task 1〜4 の全部（`MAT_ICE`、`ICE_PARTICLE_COLORS`、`ICICLE_*`、`IcicleFall`、`impactTargets` / `applyImpact`）。`Town` の既存: `chip` / `_settle` / `_detach` / `_updateFalling` / `_shatter` / `_trimFalling` / `_flushEffects` / `draw` / `_floraOf` / `_emit`
- Produces（`Town` に足すもの）:
  - 建物の新しい項目: `b.brittle: boolean`、`b.damage: number`、`b.shakeLeft: number`、`b.shaken: boolean`。`this.shaking: Building[]`
  - `chip` の変更: `b.brittle` なら欠かさず `_shake` を呼ぶ（戻り値 1 = 震え始めた、0 = すでに震えた・空）
  - `_shake(b, x, y)`、`_updateShaking()`、`_releaseWhole(b)`、`_shakeOffset(b)`、`_icicleImpact(p, game)`、`_spawnIceShards(game, e)`
  - 効果の注文: `{ type: 'leaf', flora: 'ice', mode: 'hit' | 'land' | 'drip', count, spread }`
  - `_updateFalling(game)`（`game` は省略可。省略時は当てない）

- [ ] **Step 1: 失敗するテストを書く**

`tests/icicles-town.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { Town } from '../src/js/world/town/Town.js';
import { IcicleFall } from '../src/js/world/town/IcicleFall.js';
import { buildIcicle } from '../src/js/world/town/icicles.js';
import { MAT_ICE, SOLID, CHUNK } from '../src/js/world/town/chunks.js';
import { ICE_PARTICLE_COLORS } from '../src/js/world/town/palette.js';
import { fakeCanvas } from './helpers/town-fixtures.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import {
    ICICLE_SHAKE_TICKS, ICICLE_SHAKE_AMPLITUDE, ICICLE_KNOCK_VY, ICICLE_DRIP_EVERY, ICICLE_SHARDS,
    TOWN_FALLING_MAX, ICICLE_DAMAGE,
} from '../src/js/utils/Constants.js';

// 行 0〜9 が天井の岩、行 20 から下が床。つららは天井の下端（y 160）に上の 4px を埋めて吊るす
const CEIL_BOTTOM = 10 * 16;
const FLOOR_Y = 20 * 16;
const isSolidTile = (r) => r <= 9 || r >= 20;

function icicleSpec(seed = 3, x = 200, maxLength = 400) {
    const b = buildIcicle(new SeededRNG(seed), { maxLength });
    return {
        site: 'ceiling', style: 'P', soft: true, brittle: true, flora: 'ice', kind: b.kind,
        footX: b.footX, damage: b.damage, length: b.length,
        x: x - b.footX, y: CEIL_BOTTOM - CHUNK, w: b.w, h: b.h, parts: b.parts,
    };
}
const fakeGame = (extra = {}) => ({ particles: [], projectiles: [], enemies: [], camera: null, canvas: null, ...extra });
const makeTown = (specs = [icicleSpec()], solid = isSolidTile) => new Town(specs, { createCanvas: fakeCanvas, isSolidTile: solid });
const entity = (x, y, extra = {}) => ({ x, y, width: 10, height: 10, alive: true, hp: 100, vx: 1.5, vy: 0, takeDamage(n) { this.hp -= n; }, ...extra });
const tipOf = (b) => ({ x: b.x + b.footX, y: b.y + b.height - 2 });
const run = (town, game, ticks) => { for (let t = 0; t < ticks; t++) town.update(game); };

test('設計図の印が建物に載る（brittle・damage・flora ice）。ふつうの建物は brittle でない', () => {
    const town = makeTown();
    const b = town.buildings[0];
    assert.equal(b.brittle, true);
    assert.equal(b.damage, icicleSpec().damage);
    assert.equal(b.flora, 'ice');
    assert.equal(b.shakeLeft, 0);
    const plain = makeTown([{ ...icicleSpec(), brittle: undefined, damage: undefined }]);
    assert.equal(plain.buildings[0].brittle, false);
    assert.equal(plain.buildings[0].damage, 0);
});

test('当たっても欠けない: かけらは減らず、震え始める（ICICLE_SHAKE_TICKS）。最初の当たりだけ氷の粒の注文が出る', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const total = b.remaining;
    const tip = tipOf(b);
    assert.equal(town.chip(b, tip.x, tip.y, 6), 1);
    assert.equal(b.remaining, total, 'かけらが欠けた');
    assert.equal(b.shakeLeft, ICICLE_SHAKE_TICKS);
    assert.equal(town.shaking.length, 1);
    const hits = town.effects.filter((e) => e.flora === 'ice' && e.mode === 'hit');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].count, ICICLE_SHARDS.hit);
    assert.equal(town.falling.length, 0, '震えている間は落ちない');
});

test('震えの間の追加の当たりは、時間を延ばさず、粒も出さない（1 本につき 1 回だけ震える）', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const tip = tipOf(b);
    town.chip(b, tip.x, tip.y, 6);
    town.effects.length = 0;
    const game = fakeGame();
    run(town, game, 10);
    const left = b.shakeLeft;
    assert.equal(town.chip(b, tip.x, tip.y, 6), 0);
    assert.equal(b.shakeLeft, left);
    assert.equal(town.shaking.length, 1);
    assert.equal(town.effects.filter((e) => e.mode === 'hit').length, 0);
});

test('ICICLE_SHAKE_TICKS tick 後に、全体が 1 つの IcicleFall になって落ちる。建物は空になる。ダメージは建物の damage', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const total = b.remaining;
    town.chip(b, tipOf(b).x, tipOf(b).y, 6);
    const game = fakeGame();
    run(town, game, ICICLE_SHAKE_TICKS - 1);
    assert.equal(town.falling.length, 0, '震えの途中で落ちた');
    run(town, game, 1);
    assert.equal(town.falling.length, 1);
    const p = town.falling[0];
    assert.ok(p instanceof IcicleFall);
    assert.equal(p.damage, b.damage);
    assert.equal(p.count, total, '全部のかけらが 1 つの塊になる');
    assert.equal(b.remaining, 0);
    assert.equal(town.shaking.length, 0);
    assert.equal(p.sourceId, b.id);
});

test('支えの岩が壊れたら、震えずにすぐ落ちる', () => {
    let ceiling = true;
    const town = makeTown([icicleSpec()], (r) => (ceiling ? r <= 9 : r <= 8) || r >= 20);
    const b = town.buildings[0];
    ceiling = false;   // 行 9（つららの根元を埋めていた岩）が壊れた
    for (const a of new Set(b.anchors.map((q) => `${q.r},${q.c}`))) town.onBlockDestroyed(...a.split(',').map(Number));
    assert.equal(town.falling.length, 1);
    assert.ok(town.falling[0] instanceof IcicleFall);
    assert.equal(b.shakeLeft, 0);
});

test('震えている最中に支えの岩が壊れて落ちたら、時間切れで二重に落とさない・例外を出さない', () => {
    let ceiling = true;
    const town = makeTown([icicleSpec()], (r) => (ceiling ? r <= 9 : r <= 8) || r >= 20);
    const b = town.buildings[0];
    town.chip(b, tipOf(b).x, tipOf(b).y, 6);
    ceiling = false;
    for (const a of new Set(b.anchors.map((q) => `${q.r},${q.c}`))) town.onBlockDestroyed(...a.split(',').map(Number));
    assert.equal(town.falling.length, 1);
    let releases = 0;
    const detach = town._detach.bind(town);
    town._detach = (...a) => { releases++; return detach(...a); };
    run(town, fakeGame(), ICICLE_SHAKE_TICKS + 5);
    assert.equal(releases, 0, '震えの時間切れで、空の建物からもう一度落とそうとした');
    assert.equal(town.shaking.length, 0);
    assert.equal(b.shakeLeft, 0);
});

test('爆風が範囲内の複数のつららを同時に震わせる。どれも 1 回だけ震え、全部が落ちる', () => {
    const specs = [icicleSpec(3, 200), icicleSpec(4, 216), icicleSpec(5, 232)];
    const town = makeTown(specs);
    const total = town.buildings.length;
    town.blast(216, CEIL_BOTTOM + 20, 150);
    assert.equal(town.shaking.length, total, `${town.shaking.length} / ${total} 本しか震えない`);
    for (const b of town.buildings) assert.equal(b.shakeLeft, ICICLE_SHAKE_TICKS);
    run(town, fakeGame(), ICICLE_SHAKE_TICKS);
    assert.equal(town.falling.filter((p) => p instanceof IcicleFall).length, total);
});

test('震えている間は、先から水滴の粒を ICICLE_DRIP_EVERY tick おきに 1 つ落とす（予兆）', () => {
    const town = makeTown();
    const b = town.buildings[0];
    town.chip(b, tipOf(b).x, tipOf(b).y, 6);
    town.effects.length = 0;
    let drips = 0;
    for (let t = 0; t < ICICLE_SHAKE_TICKS; t++) {
        town._updateShaking();
        drips += town.effects.filter((e) => e.mode === 'drip').length;
        town.effects.length = 0;
    }
    assert.equal(drips, Math.floor((ICICLE_SHAKE_TICKS - 1) / ICICLE_DRIP_EVERY));
});

test('描画: 震えている間だけ、±ICICLE_SHAKE_AMPLITUDE px 横に揺らす。当たり（建物の位置）は動かさない', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const view = { x: 0, y: 0, w: 1000, h: 400 };
    const drawX = () => {
        const ctx = makeFakeCtx();
        town.draw(ctx, view);
        return ctx.calls.find((c) => c.name === 'drawImage' && c.args[0] === b.canvas).args[1];
    };
    assert.equal(drawX(), b.x, '震えていないのに揺れた');
    town.chip(b, tipOf(b).x, tipOf(b).y, 6);
    const xs = new Set();
    for (let t = 0; t < 6; t++) { xs.add(drawX() - b.x); town._updateShaking(); }
    assert.deepEqual([...xs].sort(), [-ICICLE_SHAKE_AMPLITUDE, ICICLE_SHAKE_AMPLITUDE]);
    assert.equal(b.x, icicleSpec().x, '揺れで当たりの位置が動いた');
});

// --- 落下とダメージ ---

/** 震え始めてから、塊になって落ち始める直前まで進める。塊を返す */
function released(town, game, b) {
    town.chip(b, tipOf(b).x, tipOf(b).y, 6);
    run(town, game, ICICLE_SHAKE_TICKS);
    return town.falling.find((p) => p instanceof IcicleFall);
}

test('落ちたつららが機体に掛かると、その機体にだけダメージ（長さに比例）。自機・母艦・敵のすべてが対象', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const under = (extra) => entity(b.x + b.footX - 5, CEIL_BOTTOM + b.length + 20, extra);   // 先の落ちる先（少し下）の機体
    const player = under(), carrier = under(), enemy = under(), far = entity(b.x + 400, 300);
    const game = fakeGame({ player, carrier, enemies: [enemy, far] });
    const p = released(town, game, b);
    assert.ok(p);
    const dmg = p.damage;
    assert.ok(dmg >= ICICLE_DAMAGE[0] && dmg <= ICICLE_DAMAGE[1]);
    for (let t = 0; t < 120 && p.alive; t++) town.update(game);
    for (const [name, e] of [['自機', player], ['母艦', carrier], ['敵', enemy]]) assert.equal(e.hp, 100 - dmg, `${name}`);
    assert.equal(far.hp, 100, '離れた機体に当たった');
});

test('1 本につき 1 機体 1 回だけ。落ちている間ずっと当て続けない。当たった機体は下へ押され、vx は変わらない', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const e = entity(b.x + b.footX - 5, CEIL_BOTTOM + b.length + 20);
    const game = fakeGame({ enemies: [e] });
    const p = released(town, game, b);
    let calls = 0;
    const orig = e.takeDamage;
    e.takeDamage = function (n) { calls++; return orig.call(this, n); };
    for (let t = 0; t < 120 && p.alive; t++) town.update(game);
    assert.equal(calls, 1);
    assert.ok(e.vy >= ICICLE_KNOCK_VY);
    assert.equal(e.vx, 1.5);
    assert.ok(e.lastHitX !== undefined);
});

test('震えが終わる tick にすでに先と重なっている機体には、その tick で 1 回だけ当たる（落ち始めて 0.25px 動いた直後に判定する）', () => {
    const town = makeTown();
    const b = town.buildings[0];
    // 先の行（一番下のかけら）に重なる位置に居座る機体
    const e = entity(b.x + b.footX - 5, CEIL_BOTTOM + b.length - 4);
    const game = fakeGame({ enemies: [e] });
    const p = released(town, game, b);
    assert.ok(p);
    assert.ok(e.hp < 100, '震えが終わった tick で当たらなかった');
    const once = e.hp;
    assert.equal(once, 100 - p.damage);
    run(town, game, 30);
    assert.equal(e.hp, once, '2 回目が当たった');
});

test('死んでいる敵・ドッキング中の自機には当たらない', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const at = () => ({ x: b.x + b.footX - 5, y: CEIL_BOTTOM + b.length + 20 });
    const dead = entity(at().x, at().y, { alive: false });
    const docked = entity(at().x, at().y, { docked: true });
    const game = fakeGame({ player: docked, enemies: [dead] });
    released(town, game, b);
    run(town, game, 120);
    assert.equal(dead.hp, 100);
    assert.equal(docked.hp, 100);
});

test('画面外の機体にも当たる（カメラが無い・遠くを向いていても、シミュレーションは進む）', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const e = entity(b.x + b.footX - 5, CEIL_BOTTOM + b.length + 20);
    const game = fakeGame({ enemies: [e], camera: { x: 9000, y: 0 }, canvas: { width: 800, height: 600 } });
    released(town, game, b);
    run(town, game, 120);
    assert.ok(e.hp < 100);
});

test('game を渡さない更新（道具・テスト）でも例外を出さず、機体には当てない', () => {
    const town = makeTown();
    const b = town.buildings[0];
    town.chip(b, tipOf(b).x, tipOf(b).y, 6);
    for (let t = 0; t < ICICLE_SHAKE_TICKS; t++) town._updateShaking();
    assert.equal(town.falling.length, 1);
    for (let t = 0; t < 200; t++) town._updateFalling();
    assert.equal(town.falling.length, 0);
});

// --- 着地 ---

test('床で砕けて氷の粒（land）を出す。瓦礫は残さない。落ちた先は床の上', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const game = fakeGame();
    const p = released(town, game, b);
    town.effects.length = 0;
    const seen = [];
    for (let t = 0; t < 200 && p.alive; t++) {
        town._updateFalling(game);
        seen.push(...town.effects.filter((e) => e.flora === 'ice' && e.mode === 'land'));
        town.effects.length = 0;
    }
    assert.equal(p.alive, false);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].count, ICICLE_SHARDS.land);
    assert.ok(Math.abs(seen[0].y - FLOOR_Y) <= 16, `y ${seen[0].y} が床から遠い`);
    assert.equal(town.rubble.length, 0);
});

test('落ちた先の建物を 1 棟 1 回だけ欠かす（下の雪の木・植物など、brittle でない建物）', () => {
    const target = { site: 'floor', style: 'P', soft: true, kind: 'moss', x: 190, y: FLOOR_Y - 40, w: 24, h: 44,
        parts: [{ x: 0, y: 0, w: 24, h: 44, color: '#fff', mat: MAT_ICE, solid: true }] };
    const town = makeTown([icicleSpec(), target]);
    const b = town.buildings[0], t = town.buildings[1];
    const before = t.remaining;
    const game = fakeGame();
    const p = released(town, game, b);
    for (let i = 0; i < 200 && p.alive; i++) town.update(game);
    assert.ok(t.remaining < before, '下の建物が欠けなかった');
    // 半径 TOWN_FALL_CHIP_RADIUS（6px）＋ぎざぎざ（3px）の円は、4px のかけらで最大 16 個ほど。1 回しか欠かさないので、それを大きく超えない
    assert.ok(t.remaining >= before - 30, `${before - t.remaining} かけらも欠けた（1 回より多く欠かした）`);
});

test('落ちる破片の上限（TOWN_FALLING_MAX）で追い出されたつららは、氷の粒を出して消える', () => {
    const town = makeTown();
    const b = town.buildings[0];
    const p = released(town, fakeGame(), b);
    assert.ok(p);
    const filler = () => new IcicleFall({ canvas: fakeCanvas(4, 4), cells: new Uint8Array([MAT_ICE | SOLID]), cw: 1, ch: 1, x: 0, y: 0, damage: 1 });
    for (let i = 0; i < TOWN_FALLING_MAX + 2; i++) town.falling.push(filler());
    town.effects.length = 0;
    town._trimFalling();
    assert.equal(p.alive, false);
    assert.ok(town.effects.some((e) => e.flora === 'ice'));
    assert.equal(town.falling.length, TOWN_FALLING_MAX);
});

// --- 見た目の粒（_flushEffects）---

test('氷の粒の注文は、氷の色の粒になる（hit: 少なく控えめ、land: 多く上へ散る、drip: 1 粒がほぼ真下へ）', () => {
    const town = makeTown();
    const game = fakeGame();
    const spawn = (mode, count) => {
        game.particles.length = 0;
        town._spawnIceShards(game, { x: 100, y: 100, count, flora: 'ice', mode, spread: 3 });
        return game.particles.slice();
    };
    for (const [mode, count] of [['hit', 80], ['land', 80]]) {
        const ps = spawn(mode, count);
        assert.equal(ps.length, count);
        for (const p of ps) assert.ok(ICE_PARTICLE_COLORS.includes(p.color), `${mode}: ${p.color}`);
    }
    const mean = (ps) => ps.reduce((s, p) => s + Math.hypot(p.vx, p.vy), 0) / ps.length;
    assert.ok(mean(spawn('hit', 200)) < mean(spawn('land', 200)), 'hit が land より勢いがある');
    for (const p of spawn('land', 200)) assert.ok(p.vy <= 1e-9, '着地の粒が下へ飛んだ');
    const drip = spawn('drip', 1);
    assert.equal(drip.length, 1);
    assert.equal(drip[0].vx, 0);
    assert.ok(drip[0].vy > 0 && drip[0].vy <= 0.5);
});

test('シミュレーション（当たる・震える・落ちる・当てる）は Math.random を使わない。使ってよいのは見た目の粒を作る _flushEffects だけ', () => {
    const real = Math.random;
    Math.random = () => { throw new Error('シミュレーションで Math.random は使わない'); };
    try {
        const town = makeTown();
        const b = town.buildings[0];
        const e = entity(b.x + b.footX - 5, CEIL_BOTTOM + b.length + 20);
        const game = fakeGame({ enemies: [e] });
        town.chip(b, tipOf(b).x, tipOf(b).y, 6);
        for (let t = 0; t < ICICLE_SHAKE_TICKS + 120; t++) { town._updateShaking(); town._updateFalling(game); }
        assert.ok(e.hp < 100, '当たっていない（この検証が意味を失った）');
        assert.ok(town.effects.length > 0);
    } finally { Math.random = real; }
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `node --test tests/icicles-town.test.js`
Expected: FAIL（`Town` が `brittle` を知らない。`b.brittle` が `undefined` など）

- [ ] **Step 3: `Town.js` を変更する**

**3-1. import を足す。**

`import { rasterizeParts, ... MAT_PLANT } from './chunks.js';` の行を、`MAT_ICE` も取る形に:

```js
import { rasterizeParts, computeAnchors, chunkHash, CHUNK, CHARRED, SOLID, MAT_MASK, MAT_EXPLOSIVE, MAT_PLANT, MAT_ICE } from './chunks.js';
```

palette の import に `ICE_PARTICLE_COLORS` を足す（`SNOWTREE_CHAR_EDGE, SNOWTREE_PARTICLE_COLORS, SNOWTREE_FLURRY_COLORS,` の行）:

```js
    SNOWTREE_CHAR_EDGE, SNOWTREE_PARTICLE_COLORS, SNOWTREE_FLURRY_COLORS, ICE_PARTICLE_COLORS,
```

`import { ToppleTree } from './ToppleTree.js';` の次の行に:

```js
import { IcicleFall } from './IcicleFall.js';
import { impactTargets, applyImpact } from '../../utils/impactDamage.js';
```

Constants の import（`SNOWTREE_FLURRY_START_HEIGHT, SNOWTREE_FLURRY_TRICKLE_STEP, SNOWTREE_FLURRY_BIG_SHARE,` の行）の次に:

```js
    ICICLE_SHAKE_TICKS, ICICLE_SHAKE_AMPLITUDE, ICICLE_KNOCK_VY, ICICLE_DRIP_EVERY, ICICLE_SHARDS,
```

**3-2. コンストラクタ。** `this.rubble = [];` の次の行に:

```js
        // 震えているつらら（brittle の建物。当たってから ICICLE_SHAKE_TICKS 数える。_shake / _updateShaking）
        this.shaking = [];
```

建物オブジェクトの `footX: spec.footX,` の次の行に:

```js
                // 5面のつらら。当たっても欠けずに震え、震えが終わったら全体が 1 つの塊（IcicleFall）になって落ちる。
                // damage: 落ちたときに機体へ与える値。shakeLeft: 震えの残り tick（0 は震えていない）。shaken: 一度震えたら二度と震えない
                brittle: spec.brittle === true,
                damage: spec.damage || 0,
                shakeLeft: 0,
                shaken: false,
```

**3-3. `chip`。** 関数の最初（`const lx = x - b.x;` の前）に:

```js
        // もろい建物（つらら）は、欠けずに震える。弾・爆風・敵の弾・落ちる破片のどれでも同じ
        if (b.brittle) return this._shake(b, x, y);
```

**3-4. `update(game)`。** `this._updateFalling();` の行を:

```js
        this._updateShaking();
        this._updateFalling(game);
```

**3-5. `_updateFalling`。** シグネチャを `_updateFalling(game) {` にし、`p.step();` の次の行に追加:

```js
            if (p.icicle) this._icicleImpact(p, game);   // 落ちるつららが機体に当たる。着地する tick にも当てる（この後で砕ける）
```

**3-6. `_shatter`。** `const mat = p.mainMaterial();` の次の行（`if (mat === MAT_PLANT) {` の前）に:

```js
        if (mat === MAT_ICE) {   // つららは山にならない。氷の粒になって砕ける（音はこの段では鳴らさない）
            this._emit('leaf', p.cx, groundY, { count: ICICLE_SHARDS.land, flora: this._floraOf(p), mode: 'land', spread: p.width / 2 });
            return;
        }
```

**3-7. `_trimFalling`。** `if (mat === MAT_PLANT) this._emit(...)` の行の前に:

```js
            if (mat === MAT_ICE) { this._emit('leaf', old.cx, old.cy, { count: ICICLE_SHARDS.land, flora: this._floraOf(old), mode: 'land', spread: old.width / 2 }); continue; }
```

**3-8. `_detach`。** `if (b.flora === 'snow' && group.length >= SNOWTREE_TOPPLE_MIN_CELLS) {` を:

```js
        if (b.brittle) {
            // つららは全体が 1 つの IcicleFall。震えが終わったとき（_releaseWhole）も、支えの岩が壊れたとき（_settle）も同じ
            this.falling.push(new IcicleFall({ ...piece, damage: b.damage }));
        } else if (b.flora === 'snow' && group.length >= SNOWTREE_TOPPLE_MIN_CELLS) {
```

**3-9. `_flushEffects`。** `if (e.type === 'leaf' && e.flora === 'snow') {` を:

```js
            if (e.type === 'leaf' && e.flora === 'ice') {
                this._spawnIceShards(game, e);
            } else if (e.type === 'leaf' && e.flora === 'snow') {
```

**3-10. `draw`。** `ctx.drawImage(b.canvas, b.x, b.y);` を:

```js
            ctx.drawImage(b.canvas, b.x + this._shakeOffset(b), b.y);
```

**3-11. 新しいメソッド。** `_floraOf` の直前（`/** 落ちる破片の元の建物の flora ...` のコメントの前）に追加:

```js
    /**
     * もろい建物（つらら）が当たった。欠かさずに震え始める。一度震えたら、追加の当たりは時間を延ばさず、粒も出さない
     * @returns {number} 震え始めたら 1、すでに震えた・空なら 0（chip の戻り値「欠けたかけらの数」に合わせた）
     */
    _shake(b, x, y) {
        if (b.shaken || b.remaining === 0) return 0;
        b.shaken = true;
        b.shakeLeft = ICICLE_SHAKE_TICKS;
        this.shaking.push(b);
        this._emit('leaf', x, y, { count: ICICLE_SHARDS.hit, flora: b.flora, mode: 'hit', spread: 3 });
        return 1;
    }

    /**
     * 震えているつららを 1 tick 進める。震えが終わったら全体を落とす。先から水滴の粒を ICICLE_DRIP_EVERY tick おきに落とす（予兆）。
     * 震えている間に支えの岩が壊れて、すでに落ちた（remaining 0）つららは、時間切れで二重に落とさない
     */
    _updateShaking() {
        for (const b of this.shaking) {
            if (b.remaining === 0) { b.shakeLeft = 0; continue; }
            b.shakeLeft--;
            if (b.shakeLeft > 0 && b.shakeLeft % ICICLE_DRIP_EVERY === 0) {
                this._emit('leaf', b.x + b.footX, b.y + b.height, { count: 1, flora: b.flora, mode: 'drip', spread: 1 });
            }
            if (b.shakeLeft <= 0) this._releaseWhole(b);
        }
        this.shaking = this.shaking.filter((b) => b.shakeLeft > 0);
    }

    /** 建物の残りのかけら全部を 1 つの塊にして切り離す（つららが落ち始める） */
    _releaseWhole(b) {
        const group = [];
        for (let k = 0; k < b.cells.length; k++) if (b.cells[k]) group.push(k);
        if (group.length > 0) this._detach(b, group);
    }

    /** 震えている間の描画の横ずれ（px）。偶数・奇数 tick で左右。描画だけで、当たりと支えは動かさない */
    _shakeOffset(b) {
        if (b.shakeLeft <= 0) return 0;
        return (b.shakeLeft % 2 === 0 ? 1 : -1) * ICICLE_SHAKE_AMPLITUDE;
    }

    /**
     * 落ちるつららが機体に当たる。かけらが機体の矩形に掛かったら、1 本につき 1 機体 1 回だけ。
     * game が無い（道具・テストの引数なしの更新）ときは何もしない
     */
    _icicleImpact(p, game) {
        if (!game) return;
        for (const e of impactTargets(game)) {
            if (p.hit.has(e) || !p.touches(e)) continue;
            p.hit.add(e);
            applyImpact(e, e.x + e.width / 2, p.y + p.height, p.damage, ICICLE_KNOCK_VY);
        }
    }

    /**
     * 氷の粒（当たって震え始めた hit・落ちて砕けた land・震えの予兆の drip）。見た目だけなので Math.random でよい。
     * hit は少なく控えめ、land は上へ多く散る、drip は 1 粒がほぼ真下へ。上へだけ散らす（床の線の点から下へ散ると岩の中で生まれる）
     */
    _spawnIceShards(game, e) {
        const spread = e.spread ?? 3;
        for (let i = 0; i < e.count; i++) {
            const x = e.x + (Math.random() - 0.5) * 2 * spread, y = e.y - Math.random() * spread;
            let vx = 0, vy = 0.2, life = 40, size = 1;
            if (e.mode !== 'drip') {
                const a = -Math.PI * Math.random();
                const sp = e.mode === 'land' ? 0.6 + Math.random() * 1.6 : 0.2 + Math.random() * 0.8;
                vx = Math.cos(a) * sp; vy = Math.sin(a) * sp;
                life = 18 + Math.floor(Math.random() * 20);
                size = 1 + Math.floor(Math.random() * 3);
            }
            game.particles.push(new Particle(x, y, vx, vy, ICE_PARTICLE_COLORS[i % ICE_PARTICLE_COLORS.length], size, life));
        }
    }

```

- [ ] **Step 4: 通ることを確認する**

Run: `node --test tests/icicles-town.test.js`
Expected: PASS（全件）。続けて既存の Town のテストが壊れていないことを確認:

Run: `node --test tests/plants-town.test.js tests/snowtrees-town.test.js tests/snowtrees-topple.test.js tests/town-*.test.js`
Expected: PASS

想定される失敗と対処（根拠のない数値の調整はしない）:
- 「落ちたつららが機体に掛かる」系で当たらない: 機体の置き位置（`under`）が先の真下に来ているか確認する。つららの先は `y = CEIL_BOTTOM + length`、`x = b.x + b.footX`。機体の矩形は先の通り道（x 幅は先端で 4px 程度）に重なるようにする。テストの置き方を直す（実装を緩めない）
- 「爆風が複数を震わせる」で本数が足りない: 爆風の半径は `TOWN_BLAST_RADIUS_K × √150 ≒ 40px`。つららを置く間隔（16px）を確かめる

- [ ] **Step 5: 変異テスト**

- `chip` の `if (b.brittle) return this._shake(...)` を外す → 「当たっても欠けない」が赤くなる
- `_shake` の `if (b.shaken ...) return 0;` を外す → 「追加の当たりは時間を延ばさない」が赤くなる
- `_updateShaking` の `if (b.remaining === 0) {...}` を外す → 「二重に落とさない」が赤くなる（落ちた建物から空の塊を落とそうとして例外・二重）
- `_detach` の `b.brittle` の分岐を外す → 「1 つの IcicleFall になって落ちる」が赤くなる
- `_icicleImpact` の `p.hit.has(e)` を外す → 「1 機体 1 回」が赤くなる
- `impactTargets` を使わず `game.enemies` だけに当てる → 「自機・母艦・敵のすべて」が赤くなる
- `_icicleImpact(p, game)` の呼び出しを外す → ダメージのテストが赤くなる
- `_shakeOffset` を常に 0 にする → 「描画は揺れる」が赤くなる
- `_spawnIceShards` の `Math.random() * spread` を `(Math.random() - 0.5) * 2 * spread`（下へも散らす）に変える → 着地の粒の「下へ飛んだ」ではなく位置のテストになるので、**位置が床の線より下にならない**ことを確かめるテストを 1 件足す（`land` の `y` の最大が `e.y` 以下）
- `_flushEffects` の氷の分岐を外す → 氷の粒のテストは `_spawnIceShards` を直接呼ぶので通ってしまう。**`_flushEffects` を通して粒が出ること**を確かめるテストを 1 件足す（`town.effects.push({ type:'leaf', x, y, count:5, flora:'ice', mode:'hit' }); town._flushEffects(game);` → `game.particles.length === 5`）

確認したら元に戻す。

- [ ] **Step 6: コミット**

```bash
git add src/js/world/town/Town.js tests/icicles-town.test.js
git commit -m "feat: つららが震えて落ち、落下中に機体へダメージを与える（Town の brittle。氷の粒・描画の揺れ）

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 5面に載せる（props: 'snow'）・道具・ドキュメント

**Files:**
- Modify: `src/js/utils/Constants.js`（`STAGE_ENVIRONMENTS` の 5 面と、`props` のコメント）
- Modify: `src/js/world/Map.js`
- Modify: `tools/render-town-scene.mjs`
- Modify: `tests/MapDeterminism.test.js`
- Modify: `CLAUDE.md`、`docs/superpowers/specs/2026-10-11-stage5-icicles-design.md`（実測を書く）
- Test: `tests/icicles-map.test.js`（新規）

**Interfaces:**
- Consumes: `generateIcicles`、`Map._reservedRects()`（`[開始の部屋, 基地の部屋]`）、`Map._buildSnowTreeSpecs()`（既存。木の設計図）
- Produces: `Map._buildIcicleSpecs()`、`Map._generateSnow()`（`props: 'snow'` の面で `this.town` に「木 ＋ つらら」を載せる）。`_generateSnowTrees` は無くなる（`_generateSnow` に置き換え）

- [ ] **Step 1: 失敗するテストを書く**

`tests/icicles-map.test.js`（`MapDeterminism.test.js` の `buildMap` ヘルパーの作り方を確認し、同じ作りにする。同ファイルの先頭にある定義を見て、必要なら `buildMap` を `import` ではなくこのファイルにも書く）:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { STAGE_ENVIRONMENTS } from '../src/js/utils/Constants.js';

// document が無い環境で Map を作る（MapDeterminism.test.js と同じ）
const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };

const SNOW_STAGE = 4;   // missionLevel（0 始まり）。5面
const buildMap = async (seed, mission = SNOW_STAGE) => {
    const { Map } = await import('../src/js/world/Map.js');
    return new Map({ rng: new SeededRNG(seed) }, mission);
};
const hash = (x) => crypto.createHash('md5').update(JSON.stringify(x)).digest('hex');

test('5面は props: snow。4面は ferns、3面は town のまま', () => {
    assert.equal(STAGE_ENVIRONMENTS[4].props, 'snow');
    assert.equal(STAGE_ENVIRONMENTS[3].props, 'ferns');
    assert.equal(STAGE_ENVIRONMENTS[2].props, 'town');
});

test('5面の Town に、雪の木とつららが両方載る。つららは brittle で flora ice、木は soft で flora snow', async () => {
    const m = await buildMap(42);
    const trees = m.town.buildings.filter((b) => b.flora === 'snow');
    const icicles = m.town.buildings.filter((b) => b.brittle);
    assert.ok(trees.length > 50, `木 ${trees.length}`);
    assert.ok(icicles.length > 30, `つらら ${icicles.length}`);
    assert.equal(trees.length + icicles.length, m.town.buildings.length);
    for (const b of icicles) { assert.equal(b.flora, 'ice'); assert.equal(b.site, 'ceiling'); }
});

test('木の設計図は、つららを足す前と同一（木の本数・位置・乱数の流れが変わらない）。建物の番号も木が先で変わらない', async () => {
    const m = await buildMap(42);
    const treeSpecs = m._buildSnowTreeSpecs();
    const trees = m.town.buildings.filter((b) => b.flora === 'snow');
    assert.equal(trees.length, treeSpecs.length);
    assert.deepEqual(trees.map((b) => [b.kind, b.x, b.y, b.width, b.height]), treeSpecs.map((s) => [s.kind, s.x, s.y, s.w, s.h]));
    assert.deepEqual(trees.map((b) => b.id), treeSpecs.map((_, i) => i), '木の建物の番号が変わった（かけらの欠け方の乱数が変わる）');
});

test('つららは、開始の部屋と基地の部屋に掛からない。木は基地の部屋だけを避けたまま（開始の部屋には置く）', async () => {
    const m = await buildMap(42);
    const [start, base] = m._reservedRects();
    const hits = (b, rc) => b.x / 16 <= rc.c1 && (b.x + b.width - 1) / 16 >= rc.c0 && b.y / 16 <= rc.r1 && (b.y + b.height - 1) / 16 >= rc.r0;
    for (const b of m.town.buildings.filter((q) => q.brittle)) {
        assert.ok(!hits(b, start), `つらら (${b.x},${b.y}) が開始の部屋に掛かる`);
        assert.ok(!hits(b, base), `つらら (${b.x},${b.y}) が基地の部屋に掛かる`);
    }
    for (const b of m.town.buildings.filter((q) => q.flora === 'snow')) assert.ok(!hits(b, base), `木 (${b.x},${b.y}) が基地の部屋に掛かる`);
    assert.ok(m.town.buildings.some((b) => b.flora === 'snow' && hits(b, start)), '開始の部屋に木が 1 本も無い（木の除外の矩形が変わった）');
});

test('同じ乱数なら同じ 5 面（つららを含む）。違う seed なら違う', async () => {
    const sig = (m) => hash(m.town.buildings.map((b) => [b.kind, b.x, b.y, b.width, b.height, b.damage]));
    assert.equal(sig(await buildMap(42)), sig(await buildMap(42)));
    assert.notEqual(sig(await buildMap(42)), sig(await buildMap(43)));
});

test('つららの設計図は game.rng を消費しない（このあと SpawnManager が使う）', async () => {
    const { Map } = await import('../src/js/world/Map.js');
    const withIcicles = { rng: new SeededRNG(42) };
    new Map(withIcicles, SNOW_STAGE);
    const original = Map.prototype._buildIcicleSpecs;
    Map.prototype._buildIcicleSpecs = function () { return []; };
    const without = { rng: new SeededRNG(42) };
    try { new Map(without, SNOW_STAGE); } finally { Map.prototype._buildIcicleSpecs = original; }
    assert.equal(withIcicles.rng.state, without.rng.state);
});

test('つららは 5 面にだけ。4 面・6 面・3 面にはつららが無い。debugStartMission で面数を超えても剰余で 5 面', async () => {
    for (const mission of [2, 3, 5]) {
        const m = await buildMap(42, mission);
        assert.ok(!m.town || m.town.buildings.every((b) => !b.brittle), `${mission + 1}面につららがある`);
    }
    const wrapped = await buildMap(42, 4 + 7);
    assert.ok(wrapped.town.buildings.some((b) => b.brittle));
});
```

`MapDeterminism.test.js` の変更（`_generateSnowTrees` を `_generateSnow` に。5面のテストの「木だけ」の前提を「木とつらら」に）:

- `test('building the snow trees does not consume game.rng ...` の中の `Map.prototype._generateSnowTrees` を `Map.prototype._generateSnow` に置き換える（2 か所）。テスト名の「snow trees」はそのままでよい（木の設計図は消費しないことを確かめている）
- `test('stage 4 builds plants ...` の中の 5 面の行 `assert.ok(buildMap(Map, 42, 4).town.buildings.every((b) => b.soft && b.flora === 'snow'), '5面は雪の木');` を、次に置き換える:

```js
  assert.ok(buildMap(Map, 42, 4).town.buildings.every((b) => b.soft && (b.flora === 'snow' || b.flora === 'ice')), '5面は雪の木とつらら');
```

- `test('same seed produces the same snow trees' ...` の `summary` は 5 面の `town.buildings` 全部を見るので、そのまま通る（つららも含めた決定性になる）

- [ ] **Step 2: 失敗を確認する**

Run: `node --test tests/icicles-map.test.js tests/MapDeterminism.test.js`
Expected: FAIL（`props` がまだ `'snowtrees'`。`_buildIcicleSpecs` が無い）

- [ ] **Step 3: 実装する**

`src/js/utils/Constants.js`:

1. `STAGE_ENVIRONMENTS` の 5 面の行を `props: 'snow'` に（HEAD の行の形のまま。桁そろえの空白を壊さない）:

HEAD の行: `    { kind: 'snow',  backdrop: 'snow',    terrain: 'cave', props: 'snowtrees' }, // 5: 雪と氷（雪をかぶった木）`
→ `    { kind: 'snow',  backdrop: 'snow',    terrain: 'cave', props: 'snow' }, // 5: 雪と氷（雪をかぶった木・天井のつらら）`

2. `props` のコメント（`ENV_KINDS` の直前）の `'snowtrees' は5面の\n//  雪をかぶった木。設計: docs/superpowers/specs/2026-10-11-stage5-snowtrees-design.md）` を、`'snow' は5面の雪をかぶった木と天井のつらら。設計: docs/superpowers/specs/2026-10-11-stage5-snowtrees-design.md ・ 2026-10-11-stage5-icicles-design.md` に直す（HEAD の文面に合わせて 1 か所だけ置き換える）

`src/js/world/Map.js`:

import に追加（`import { generateSnowTrees } from './town/generateSnowTrees.js';` の次の行）:

```js
import { generateIcicles } from './town/generateIcicles.js';
```

`else if (props === 'snowtrees') this._generateSnowTrees();` を:

```js
        else if (props === 'snow') this._generateSnow();
```

コメント `// 4面は苔とシダ（props: 'ferns'）、5面は雪をかぶった木（props: 'snowtrees'）。...` の `'snowtrees'` を `'snow'` に直し、「5面は木とつらら」と分かる 1 行を足す。

`_generateSnowTrees() {...}` を次の 2 つのメソッドに置き換える:

```js
    /**
     * つららの設計図。tools/render-town-scene.mjs も同じものを呼ぶ（町・植物・木と同じ理由）。
     * 木・植物とは別の派生ストリーム。除外の矩形は開始の部屋と基地の部屋の**両方**（ユーザー決定: 面に入った直後に
     * 事故らないよう開始の部屋は避ける。木は開始の部屋にも置く）
     */
    _buildIcicleSpecs() {
        return generateIcicles({
            grid: this.grid, rows: this.rows, cols: this.cols,
            excludeRects: this._reservedRects(),
            rng: new SeededRNG((this.game.rng.state ^ 0x1C1CE5) >>> 0),
        });
    }

    /** 5面: 雪の木 ＋ 天井のつらら を 1 つの Town に載せる。木が先（建物の番号が変わらず、木の欠け方の乱数が変わらない） */
    _generateSnow() {
        this.town = new Town([...this._buildSnowTreeSpecs(), ...this._buildIcicleSpecs()], { isSolidTile: (r, c) => this.isSolid(r, c) });
    }
```

`tools/render-town-scene.mjs`:

- 冒頭の使い方の 5 面の行 `//   node tools/render-town-scene.mjs --stage 5 --out snowtrees.png ...` の説明を「5面の雪の木と天井のつらら」に直す
- `const specs = PROPS === 'ferns' ? ... : PROPS === 'snowtrees' ? map._buildSnowTreeSpecs() : map._buildTownSpecs();` を:

```js
const specs = PROPS === 'ferns' ? map._buildPlantSpecs()
    : PROPS === 'snow' ? [...map._buildSnowTreeSpecs(), ...map._buildIcicleSpecs()]
        : map._buildTownSpecs();
```

- `PROPS === 'ferns' || PROPS === 'snowtrees'` を `PROPS === 'ferns' || PROPS === 'snow'` に、雪のふちの行の `PROPS === 'snowtrees'` を `PROPS === 'snow'` に直す

`CLAUDE.md` の表の「壊せる背景の木の種類（5面の雪の木）」の行の次に追加:

```
| 壊せる背景の「もろい」建物（5面のつらら） | `src/js/world/town/icicles.js` に build 関数 ＋ `generateIcicles.js` の置き方、色は `palette.js` の `ICICLE_COLORS`（`brittle: true` の設計図は当たると欠けずに震え、全体が `IcicleFall` になって落ちて機体にダメージ） | `Town.js`（`_shake` / `_updateShaking` / `_icicleImpact`） |
```

- [ ] **Step 4: 通ることを確認する**

Run: `node --test tests/icicles-map.test.js tests/MapDeterminism.test.js`
Expected: PASS

続けて全体:

Run: `npm test -- --test-skip-pattern=湧き位置は重複しない`
Expected: 全件 PASS（除外 1 件）

- [ ] **Step 5: 見た目と実測（PNG・数値）**

Run: `node tools/render-town-scene.mjs --stage 5 --stats`
Expected: JSON が出る。`byKind` に `ceiling/P/icicle` と `floor/P/fir` / `floor/P/bareTree` が出る。つらら・全体の本数、`specsMs`、`rasterizeMs`、`spriteMB` を控える

Run: `node tools/render-town-scene.mjs --stage 5 --x 1600 --y 600 --out <scratch>/icicles1.png` と、つららが多い所（`--x 800 --y 300` など）で数枚。Read ツールで PNG を見て確認する:
- つららが天井から垂れ、先が尖り、青白く、雪の木の白と見分けられる
- 開始の部屋（左上）につららが無い

つららの本数が spec の狙い（面全体で 150〜250 本）から大きく外れるときは、`ICICLE_FILL_SCALE` を調整して実測を `Constants.js` のコメントに残す（「初案 1 で N 本 → X にして M 本」）。spec の「実測」節に今週の 5 面の数値（本数・生成時間・絵の大きさ）を書き足す。

- [ ] **Step 5b: spec の古くなった 1 行を直す**

`docs/superpowers/specs/2026-10-11-stage5-icicles-design.md` の「見た目の細部」の「穴の縁の暗い色は青灰色」は、つららが欠けない（`chip` が `_shake` で返り、`_charEdges` を通らない）ので不要。その文を削除し、「欠け・砕けの粒は氷の欠片（白〜水色、`flora: 'ice'`）」だけを残す。

- [ ] **Step 6: 連続写真で震え・落下を確かめる**

つららを 1 本撃って、震え → 落下 → 着地の様子を連続写真にする（`tools/render-town-scene.mjs` の `--blast` と `--ticks` の組み合わせで足りる。例: つららの先に `--blast "x,y,36" --ticks 12` と `--ticks 40` の 2 枚）。落ちる途中の絵が崩れていないこと、着地で消えることを PNG で確かめ、気づいたことをコミットメッセージか spec に残す。

- [ ] **Step 7: 変異テスト**

- `_generateSnow` の `[...trees, ...icicles]` を `[...icicles, ...trees]` に変える → 「木の建物の番号が変わらない」が赤くなる
- `_buildIcicleSpecs` の `excludeRects` を `[this._reservedRects()[1]]`（基地だけ）に変える → 「開始の部屋に掛からない」が赤くなる
- `_buildIcicleSpecs` の乱数の元を `this.game.rng.next()` にする（`game.rng` を消費する）→ 「game.rng を消費しない」が赤くなる
- `STAGE_ENVIRONMENTS[3].props` を `'snow'` にする → 「4面にはつららが無い」が赤くなる

確認したら元に戻す。

- [ ] **Step 8: コミット**

`Constants.js` は「Constants.js のステージ手順」で: `STAGE_ENVIRONMENTS` の 5 面の行と `props` のコメントは、HEAD の該当の文字列を直接置き換える（IDE の整形が入っていない HEAD の形のまま）。`ICICLE_FILL_SCALE` を調整したときはその行も HEAD の行を置き換える。

```bash
git add src/js/world/Map.js tools/render-town-scene.mjs tests/icicles-map.test.js tests/MapDeterminism.test.js CLAUDE.md docs/superpowers/specs/2026-10-11-stage5-icicles-design.md
# Constants.js は上の手順で blob を index へ
git commit -m "feat: 5面の天井につららを吊るす（props: 'snow' で雪の木と 1 つの Town に載せる。開始の部屋と基地の部屋を避ける）

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review（計画の自己点検）

**1. Spec の網羅:**

| spec の項目 | 持ち主の Task |
|---|---|
| 作り方（`Town` に載せる、`props: 'snow'`、`map.town` の名前そのまま） | 5・6 |
| つららの絵（多角形・長さ 24〜64・幅 8〜12・上端 4px 埋まる・`MAT_ICE`・氷の色・輝度の縛り） | 1・2 |
| 置き場所（天井・開始と基地の部屋を避ける・村の濃淡・派生乱数・空き − 余白） | 3・6 |
| 震えて落ちる 1〜4（当たると震える・追加の当たりは無視・全体が 1 つの塊・支えの岩が壊れたらすぐ落ちる） | 5 |
| 震えて落ちる 5（つらら同士の連鎖は無い・爆風が複数を同時に震わせる） | 5（爆風のテスト） |
| 震えて落ちる 6（上限で追い出されたら粒を出して消える） | 5 |
| 落下とダメージ（重力・長さに比例・自機/母艦/敵・1 機体 1 回・下へ押す・`vx` 不変・`recordHit`・貫通・着地で砕ける・下の建物を欠かす・画面外でも進める） | 4・5 |
| 見た目の細部（氷の粒・予兆の水滴・穴の縁の色） | 5（穴の縁の色は、つららが欠けない（`_charEdges` を通らない）ので不要。spec の記述は `hit` の粒の色で足りる） |
| 設計図の印と定数 | 1・3 |
| テスト（絵・置き場所・震えて落ちる・ダメージ・着地・5面の組み込み） | 1〜6 |
| 触るファイル（`main.js` は触らない） | 全 Task（`main.js` は変更なし） |

穴の縁の焦げ（`_charEdges`）は、`brittle` の建物では `chip` が `_shake` で返るので通らない。spec の「穴の縁の暗い色は青灰色」は、つららには穴が開かないので不要になった（実装の結果として spec が古くなる。Task 6 の Step 5 で spec の該当の 1 行を削除する）。

**2. プレースホルダーの点検:** 「TBD」「あとで」「適切なエラー処理」の類は無い。想定される失敗の対処は、落ちたときの具体的な見方を書いてある。

**3. 型・名前の一貫性:** `ICICLE_SHARDS = { hit, land }`（Task 1 で定義、Task 5 で使用）、`ICICLE_DRIP_EVERY`、`brittle` / `damage` / `shakeLeft` / `shaken` / `shaking`、`IcicleFall({ damage, ...piece })` と `touches` / `hit` / `icicle`、`impactTargets` / `applyImpact(entity, x, y, damage, knockVy)`、`_shake` / `_updateShaking` / `_releaseWhole` / `_shakeOffset` / `_icicleImpact` / `_spawnIceShards`、`_buildIcicleSpecs` / `_generateSnow`。どの Task でも同じ綴り。

**4. Review Focus:** 1〜7 の各行に、持ち主の Task のテストがある（1: Task 5「落ちる瞬間にすでに真下に重なっている」、2: Task 4・5「死んでいる敵・ドッキング中」、3: Task 5「爆風が複数」、4: Task 5「二重に落とさない」、5: Task 3・6、6: Task 5「game を渡さない更新」、7: Task 6「木の設計図は同一」）。

---

## 実行後（この計画の外）

- 最終レビュー（別エージェント）→ 実機確認（ユーザー。ハードリロード Cmd+Shift+R が要る。調整用の定数は `Constants.js` の `ICICLE_*`）
- 段 2（音）は別の spec / plan
