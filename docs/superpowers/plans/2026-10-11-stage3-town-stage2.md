# 3面の町並み 段2（弾を止める・欠け・支え・落下・崩壊・瓦礫）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 段1で置いた町を壊せるようにする。厚い壁は弾・ミサイル・グレネードを止めて遮蔽になり、爆発と弾で欠け、支えを失った部分は落ちて砕け、4割を切った建物は崩壊して焦げた土台と瓦礫が残る。

**Architecture:** 建物の「かけらの表」（段1の `cells`）を唯一の状態として読み書きする。欠けたかけらは建物の canvas から `clearRect` で抜くだけで、建物全体は描き直さない。支えは純関数 `structure.js` が塗りつぶし探索で決め、つながらない塊は自分の canvas を持つ `FallingPiece` になる。弾と建物の当たりは `Town.sweepProjectile()` が前の位置から今の位置まで 4px 刻みで調べ、厚い壁に当たると弾の種類ごとのメソッド `onTownWall(x, y)` を呼ぶ（反応はそれぞれの弾が岩に当たったときと同じ）。粒・火花は `Town.effects` に注文として溜め、`Town.update(game)` で画面の中の分だけ出す。

**Tech Stack:** バニラ ES modules、canvas 2D（`fillRect` / `clearRect` / `drawImage`）、`node --test`。

**Spec:** `docs/superpowers/specs/2026-10-11-stage3-town-design.md`（2章「壊れ方」、テストの表、5章「描画の重さ」）

**範囲:** spec の「作る順番」の **段2だけ**。火（段3）・爆発物（段3b）・音（段4）は入れない。崩壊の演出は粒と閃光だけで、音は鳴らさない（段4）。

## Global Constraints

- `git add -A` / `git add .` は使わない。変更したファイルを明示して add する
- `src/js/main.js` にはユーザーの未コミットの `debugStartMission: 2` がある。**コミットに入れない・消さない。** `main.js` に対して `git checkout` / `git restore` / `git stash` / `git reset` を打たない（Task 6 にステージの手順）
- `src/js/utils/Constants.js` にはユーザーの IDE の自動整形（町と関係ない行の字下げ）が未コミットで残っている。**これもコミットに入れない・消さない。** Constants.js をコミットするときは Task 1 の「町の節だけステージする」手順を使う
- 一時的にわざと壊す確認（ミューテーション）は、**控えのファイルを作ってから**書き換え、控えから戻す。`git checkout` で戻さない（未コミットの新しいテストまで消える。実際に段1で消した）
- コメントは日本語で「なぜそうしたか」を書く。数値には根拠を残す
- 調整用の数値は `Constants.js` の `TOWN_*`。色（描画専用）だけは `world/town/palette.js`
- 町は `game.rng` を消費しない。壊れ方の揺らぎ（穴のぎざぎざ・落ちる向き）は**位置と建物の番号から決まる** `chunkHash()` で作る（`Math.random` にしない。同じ所に撃てば同じ穴）。見た目だけの粒は既存の爆発と同じく `Math.random` でよい
- **建物の崩壊・破片の砕ける演出は `game.spawnExplosion` を通さない**（`town.blast` に戻って連鎖が止まらなくなる）。粒は `createExplosion` / `Particle` を直接 `game.particles` に足す
- 敵の狙い（`Physics.hasLineOfSight`）とオートエイムは変えない
- 機体（自機・母艦・敵）は建物に当たらない。落ちる破片はダメージを持たない。スコアは付けない
- テストは `npm test`（`node --test`）。ソース文字列を grep するテストは書かない。テストを書いたら、わざと壊して赤くなることを確かめる
- 既知の失敗: `面7: 湧き位置は重複しない` が main の時点から落ちている。それ以外が全部通ること

## Review Focus

1. **発射したその tick に壁に入った弾**（`_prevX` がまだ無い）: 発射位置を `x - vx` で推定し、発射位置に重なる建物は無視する。目の前の壁で即消えないこと（Task 7 にテスト）
2. **支えの岩が全部壊れた建物**: 崩壊の「土台を残す」探索は支えが無いと何も残さない。建物が丸ごと1つの破片として落ちること（Task 4・Task 6 にテスト）
3. **一度に 24 個を超える破片**（大きな爆発で何棟も崩れる）: 古いものから土煙になって消え、`falling` の長さが上限を超えないこと。破片の更新中に破片が増えたり減ったりしても飛ばし・二重処理が無いこと（Task 5 にテスト）
4. **画面の外での破壊**: 粒は出さないが、かけら・支え・落下は画面の中と同じに進むこと（Task 5 にテスト）
5. **崩壊のあとにまた欠けた建物**: 崩壊は1棟1回だけ。焦げた土台がもう一度崩壊の粒を出さないこと（Task 4 にテスト）

---

## ファイル構成

| ファイル | 役割 | Task |
|---|---|---|
| `src/js/world/town/chunks.js` | 変更: 色のある画素は必ずかけらに入れる。`chunkHash()` を足す | 1 |
| `src/js/world/town/structure.js` | 新規: 支えの探索（純関数） | 2 |
| `src/js/world/town/Town.js` | 変更: 当たりのマス目・欠け・支え・崩壊・破片・瓦礫・粒の注文・弾の当たり | 3〜8 |
| `src/js/world/town/FallingPiece.js` | 新規: 落ちる破片 | 4, 5 |
| `src/js/world/town/palette.js` | 変更: 焦げの縁・焦げた土台・瓦礫の色 | 3〜5 |
| `src/js/utils/Constants.js` | 変更: `TOWN_*`（壊れ方・落下・弾の表） | 1〜7 |
| `src/js/systems/SpawnEffects.js` | 変更: `spawnExplosion` から `town.blast` | 6 |
| `src/js/world/Map.js` | 変更: `damageBlock` の「壊れた」分岐から `town.onBlockDestroyed` | 6 |
| `src/js/main.js` | 変更: `_simulationTick` で `town.update(this)`、補間に落ちる破片を足す | 6 |
| `src/js/systems/CollisionManager.js` | 変更: 敵弾の更新の直後に `town.sweepProjectile` | 7 |
| `src/js/entities/Bullet.js` / `Missile.js` / `EnemyHomingMissile.js` / `EnemyCruiseMissile.js` / `Grenade.js` / `ReflectBeam.js` | 変更: `townKind` と `onTownWall(x, y)` | 7, 8 |
| `tools/lib/pixel-canvas.mjs` / `tools/render-town-scene.mjs` | 変更: `drawImage` の9引数、`rotate`、`--blast` で壊した後を書き出す | 9 |

---

### Task 1: 色のある画素は必ずかけらに入れる・位置から決まる揺らぎ

段1のレビューの持ち越し。梁・梯子・ランタン・軒・橋の手すりの画素の 3% がどのかけらにも入っておらず、かけらを抜いても宙に残る。

**Files:**
- Modify: `src/js/world/town/chunks.js`
- Modify: `src/js/utils/Constants.js`（壊れ方の定数の節を足す）
- Test: `tests/town-coverage.test.js`（新規）

**Interfaces:**
- Produces: `rasterizeParts(parts, w, h)`（形は同じ。色のある部品が掛かる空のかけらを `p.mat || MAT_WOOD` の細い部品で埋める）、`chunkHash(id, i, j) → [0, 1)`、定数 `TOWN_BLAST_RADIUS_K` ほか（下の Step 3）

- [ ] **Step 1: 失敗するテストを書く**

`tests/town-coverage.test.js`:

```js
// 描いた画素は必ず値 0 でないかけらの中（段1レビューの持ち越し）。かけらを抜いて clearRect
// したときに、どのかけらにも入っていない画素が宙に残らないように
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { rasterizeParts, chunkHash, CHUNK, MAT_WOOD, MAT_ADOBE, SOLID } from '../src/js/world/town/chunks.js';

before(() => {
    const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

test('色のある部品の画素は、どれも値が 0 でないかけらの中にある（実際の3面の町で）', async () => {
    const { Map } = await import('../src/js/world/Map.js');
    for (const seed of [11, 22, 33]) {
        const map = new Map({ rng: new SeededRNG(seed) }, 2);
        let miss = 0, total = 0;
        for (const s of map._buildTownSpecs()) {
            const { cells, cw } = rasterizeParts(s.parts, s.w, s.h);
            for (const p of s.parts) {
                if (!p.color) continue;
                for (let y = Math.max(0, p.y); y < Math.min(s.h, p.y + p.h); y++) {
                    for (let x = Math.max(0, p.x); x < Math.min(s.w, p.x + p.w); x++) {
                        total++;
                        if (!cells[Math.floor(y / CHUNK) * cw + Math.floor(x / CHUNK)]) miss++;
                    }
                }
            }
        }
        assert.ok(total > 0);
        assert.equal(miss, 0, `seed ${seed}: ${miss}/${total} 画素がかけらの外`);
    }
});

test('描くだけの部品で埋めたかけらは細い木、材料のある部品なら細いその材料（厚い壁にはしない）', () => {
    // 2x2 の部品は 4px のかけらの中心 (2,2) に届かないので、中心の規則では埋まらない
    const paintOnly = rasterizeParts([{ x: 0, y: 0, w: 2, h: 2, color: '#000000', mat: 0, solid: false }], 4, 4);
    assert.equal(paintOnly.cells[0], MAT_WOOD);
    const adobe = rasterizeParts([{ x: 0, y: 0, w: 2, h: 2, color: '#000000', mat: MAT_ADOBE, solid: true }], 4, 4);
    assert.equal(adobe.cells[0], MAT_ADOBE);
    assert.equal(adobe.cells[0] & SOLID, 0);
});

test('中心の規則で埋まったかけらは上書きしない（厚い壁の印が残る）', () => {
    const { cells } = rasterizeParts([
        { x: 0, y: 0, w: 4, h: 4, color: '#000000', mat: MAT_ADOBE, solid: true },
        { x: 0, y: 0, w: 1, h: 1, color: '#111111', mat: 0, solid: false },
    ], 4, 4);
    assert.equal(cells[0], MAT_ADOBE | SOLID);
});

test('chunkHash: 同じ引数なら同じ値、0 以上 1 未満、引数ごとにばらける', () => {
    assert.equal(chunkHash(3, 4, 5), chunkHash(3, 4, 5));
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
        const v = chunkHash(7, i, 2);
        assert.ok(v >= 0 && v < 1);
        seen.add(Math.floor(v * 10));
    }
    assert.equal(seen.size, 10, '10 等分のどこにも値が出る');
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npm test -- tests/town-coverage.test.js`
Expected: FAIL（`chunkHash` が export されていない SyntaxError）

- [ ] **Step 3: 実装する**

`src/js/world/town/chunks.js` の `rasterizeParts` の `return` の直前に足す:

```js
    // 色のある部品が1画素でも掛かっているのに空のかけらは、その部品の材料の細い部品で埋める。
    // 中心の規則だけだと梁・梯子・ランタン・軒・橋の手すりの画素の 3% がどのかけらにも入らず、
    // かけらを抜いて clearRect しても宙に残った（段1のレビュー指摘）。厚い壁の印は付けない
    // （弾を止めるのは中心の規則で埋まった面だけ）。描くだけの部品（mat 0）は木にする
    for (const p of parts) {
        if (!p.color) continue;
        const v = p.mat || MAT_WOOD;
        const i0 = Math.max(0, Math.floor(p.x / CHUNK));
        const i1 = Math.min(cw, Math.ceil((p.x + p.w) / CHUNK));
        const j0 = Math.max(0, Math.floor(p.y / CHUNK));
        const j1 = Math.min(ch, Math.ceil((p.y + p.h) / CHUNK));
        for (let j = j0; j < j1; j++) {
            for (let i = i0; i < i1; i++) if (!cells[j * cw + i]) cells[j * cw + i] = v;
        }
    }
```

同じファイルの末尾に足す:

```js
/**
 * 建物の番号とかけらの位置から決まる 0〜1 の値。穴の縁のぎざぎざや、落ちる破片の向きに使う。
 * Math.random にしないのは、遮蔽の形が遊びに関わるため（同じ所に撃てば同じ穴が開く）。
 * game.rng も使わない（消費すると敵の構成が変わる）
 */
export function chunkHash(id, i, j) {
    let h = Math.imul(id + 1, 0x9E3779B1) ^ Math.imul(i + 1, 0x85EBCA77) ^ Math.imul(j + 1, 0xC2B2AE3D);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2C1B3C6D);
    h ^= h >>> 12;
    return (h >>> 0) / 4294967296;
}
```

`src/js/utils/Constants.js` の町の節の末尾（`TOWN_CEIL_KEEP_BELOW` の行のあと）に足す:

```js
// --- 3面の町並み 段2（壊れ方）---
// 爆発で欠ける半径 = K × √(粒の数)。マシンガンの着弾 4粒 → 約7px、ミサイル 36粒 → 約20px、
// グレネード 150粒 → 約40px（spec 2章）
export const TOWN_BLAST_RADIUS_K = 3.3;
// 穴の縁のぎざぎざの幅（px）。かけらごとに ±半分だけ半径を揺らす
export const TOWN_CHIP_JAGGED = 3;
// 残ったかけらがこの割合を下回ったら崩壊する
export const TOWN_COLLAPSE_FRACTION = 0.4;
// 崩壊で残す土台の深さ（支えのかけらから何かけら＝4px 何段ぶんまで）。3 で 12px ＝ A の1階ぶん。
// spec の「下の1〜2段」を、床・壁・天井のどれにも同じ規則で効くよう「支えからの距離」で言い直した
export const TOWN_RUIN_DEPTH = 3;
// 崩壊の粒の数（createExplosion の count。ミサイルの爆発 36 より小さく、着弾 4 より大きい）
export const TOWN_COLLAPSE_PARTICLES = 24;
```

**Constants.js だけはこの手順でステージする**（ユーザーの未コミットの自動整形を巻き込まないため）:

```bash
S=<scratchpad>   # セッションの scratchpad ディレクトリ
git show HEAD:src/js/utils/Constants.js > $S/const-head.js
python3 - $S/const-head.js <<'EOF'
import sys
head = open(sys.argv[1]).read(); work = open('src/js/utils/Constants.js').read()
def sect(s):
    # 町の節（段1・段2）の頭から、町でない次の「// ---」の節の頭まで。町の節はファイルの末尾にあるので、
    # 次の節が無ければファイルの終わりまで
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
git diff --cached src/js/utils/Constants.js   # 町の行だけが出ることを目で確かめる
```

（段2の節は `TOWN_CEIL_KEEP_BELOW` のすぐ後ろに `// --- 3面の町並み 段2` で始めること。`sect()` は町の節を飛ばして次の節を探すので、段2の節も一緒に差し替わる。`git diff --cached` に町と関係ない行が出たら、コミットせずに原因を調べる。）

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test -- tests/town-coverage.test.js tests/town-chunks.test.js tests/town-draw.test.js tests/MapDeterminism.test.js`
Expected: PASS（全部）

ミューテーション: 足した埋めるループの `if (!cells[...])` を外す（中心の規則の値を上書きする）→ 「上書きしない」テストが赤。ループ自体を消す → 「画素がかけらの外」テストが赤。控えから戻す。

- [ ] **Step 5: コミット**

```bash
git add src/js/world/town/chunks.js tests/town-coverage.test.js
# Constants.js は Step 3 の手順でステージ済み
git commit -m "feat: 町の描いた画素は必ずかけらに入れる・位置から決まる揺らぎ chunkHash

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 支えの探索（純関数）

**Files:**
- Create: `src/js/world/town/structure.js`
- Test: `tests/town-structure.test.js`

**Interfaces:**
- Produces:
  - `supportedMask(cells, cw, ch, anchorIdx, maxDepth = Infinity) → Uint8Array`（1 = 支えにつながって残る。`maxDepth` は支えのかけらから何歩まで。0 なら支えのかけらだけ）
  - `detachedGroups(cells, cw, ch, mask) → Array<number[]>`（`cells[k] && !mask[k]` のかけらを上下左右のつながりで塊に分ける。塊の中は番号の昇順、塊どうしは最小の番号の昇順）

- [ ] **Step 1: 失敗するテストを書く**

`tests/town-structure.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supportedMask, detachedGroups } from '../src/js/world/town/structure.js';

// 文字の絵から表を作る。'#' がかけら、'.' が空
function grid(rows) {
    const ch = rows.length, cw = rows[0].length;
    const cells = new Uint8Array(cw * ch);
    rows.forEach((row, j) => [...row].forEach((v, i) => { if (v === '#') cells[j * cw + i] = 1; }));
    return { cells, cw, ch };
}
const kept = (mask) => [...mask].map((v, k) => (v ? k : -1)).filter((k) => k >= 0);

test('支えにつながっていれば全部残り、落ちる塊は無い', () => {
    const { cells, cw, ch } = grid(['#', '#', '#', '#', '#']);
    const mask = supportedMask(cells, cw, ch, [4]);
    assert.deepEqual(kept(mask), [0, 1, 2, 3, 4]);
    assert.deepEqual(detachedGroups(cells, cw, ch, mask), []);
});

test('中ほどを抜くと、上だけが1つの塊として落ちる', () => {
    const { cells, cw, ch } = grid(['#', '#', '.', '#', '#']);
    const mask = supportedMask(cells, cw, ch, [4]);
    assert.deepEqual(kept(mask), [3, 4]);
    assert.deepEqual(detachedGroups(cells, cw, ch, mask), [[0, 1]]);
});

test('支えが無ければ全部が落ちる', () => {
    const { cells, cw, ch } = grid(['##', '##']);
    const mask = supportedMask(cells, cw, ch, []);
    assert.deepEqual(kept(mask), []);
    assert.deepEqual(detachedGroups(cells, cw, ch, mask), [[0, 1, 2, 3]]);
});

test('離れた2つの塊は別々に落ちる。斜めはつながりとみなさない', () => {
    const { cells, cw, ch } = grid([
        '#.#',
        '.#.',
        '...',
    ]);
    const mask = supportedMask(cells, cw, ch, []);
    assert.deepEqual(detachedGroups(cells, cw, ch, mask), [[0], [2], [4]]);
});

test('空のかけらや、もう無いかけらの支えは数えない', () => {
    const { cells, cw, ch } = grid(['#', '.']);
    const mask = supportedMask(cells, cw, ch, [1]);
    assert.deepEqual(kept(mask), []);
});

test('maxDepth: 支えから何歩までを残すか（崩壊で土台だけ残す）', () => {
    const { cells, cw, ch } = grid(['#', '#', '#', '#', '#', '#']);
    const mask = supportedMask(cells, cw, ch, [5], 2);
    assert.deepEqual(kept(mask), [3, 4, 5]);
    assert.deepEqual(detachedGroups(cells, cw, ch, mask), [[0, 1, 2]]);
    assert.deepEqual(kept(supportedMask(cells, cw, ch, [5], 0)), [5]);
});

test('横につながる L 字も1つの塊', () => {
    const { cells, cw, ch } = grid([
        '###',
        '#..',
        '...',
        '#..',
    ]);
    const mask = supportedMask(cells, cw, ch, [9]);
    assert.deepEqual(detachedGroups(cells, cw, ch, mask), [[0, 1, 2, 3]]);
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npm test -- tests/town-structure.test.js`
Expected: FAIL（`structure.js` が無い ERR_MODULE_NOT_FOUND）

- [ ] **Step 3: 実装する**

`src/js/world/town/structure.js`:

```js
// ============================================
// structure - 支えの探索（純関数）
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md（2章「支えの規則」）
// 支えのかけらから塗りつぶし探索して、つながっているかけらだけが残る。
// つながらない塊は、その形のまま落ちる破片になる。
// 1棟は多くても数百かけらなので、欠けるたびにその建物だけ探索し直す。
// つながりは上下左右だけ（斜めでつなぐと、角だけで触れている梁が宙に残る）。

/**
 * @param {Uint8Array} cells かけらの表（0 は空）
 * @param {number[]} anchorIdx 支えのかけらの番号（岩がまだあるもの）
 * @param {number} [maxDepth] 支えから何歩まで広げるか。崩壊で土台だけ残すときに使う
 * @returns {Uint8Array} 1 = 残る
 */
export function supportedMask(cells, cw, ch, anchorIdx, maxDepth = Infinity) {
    const mask = new Uint8Array(cells.length);
    let frontier = [];
    for (const k of anchorIdx) {
        if (cells[k] && !mask[k]) { mask[k] = 1; frontier.push(k); }
    }
    for (let d = 0; frontier.length > 0 && d < maxDepth; d++) {
        const next = [];
        const visit = (n) => { if (cells[n] && !mask[n]) { mask[n] = 1; next.push(n); } };
        for (const k of frontier) {
            const i = k % cw;
            if (i > 0) visit(k - 1);
            if (i < cw - 1) visit(k + 1);
            if (k >= cw) visit(k - cw);
            if (k + cw < cw * ch) visit(k + cw);
        }
        frontier = next;
    }
    return mask;
}

/**
 * 残らないかけらを、上下左右のつながりで塊に分ける。
 * @returns {number[][]} 塊ごとのかけらの番号（昇順）。塊どうしは先頭の番号の昇順
 */
export function detachedGroups(cells, cw, ch, mask) {
    const seen = new Uint8Array(cells.length);
    const groups = [];
    for (let s = 0; s < cells.length; s++) {
        if (!cells[s] || mask[s] || seen[s]) continue;
        const group = [];
        const stack = [s];
        seen[s] = 1;
        while (stack.length > 0) {
            const k = stack.pop();
            group.push(k);
            const i = k % cw;
            const nb = [];
            if (i > 0) nb.push(k - 1);
            if (i < cw - 1) nb.push(k + 1);
            if (k >= cw) nb.push(k - cw);
            if (k + cw < cw * ch) nb.push(k + cw);
            for (const n of nb) {
                if (cells[n] && !mask[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
            }
        }
        groups.push(group.sort((a, b) => a - b));
    }
    return groups;
}
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test -- tests/town-structure.test.js`
Expected: PASS 7/7

ミューテーション: `supportedMask` の左右の `visit` を2つとも消す → L 字のテストではなく「中ほどを抜く」は通るが「maxDepth」は通る…と予想に頼らず、実際に (a) `if (i > 0) visit(k - 1)` を消す、(b) `d < maxDepth` を `d <= maxDepth` にする、(c) `detachedGroups` で `!mask[n]` を外す、の3つを1つずつ試して赤くなることを確かめる。赤くならなければ fixture に差が出る状態があるかを先に疑う。控えから戻す。

- [ ] **Step 5: コミット**

```bash
git add src/js/world/town/structure.js tests/town-structure.test.js
git commit -m "feat: 町の支えの探索（支えにつながるかけらだけ残り、つながらない塊は落ちる）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 当たりのマス目と「欠ける」

**Files:**
- Modify: `src/js/world/town/Town.js`
- Modify: `src/js/world/town/palette.js`
- Create: `tests/helpers/town-fixtures.js`（町のテストの共有: 偽 canvas と四角い建物。テストのファイルどうしで import しない — 読んだ側でも相手のテストが登録されて二重に走るため）
- Test: `tests/town-chip.test.js`（新規）

**Interfaces:**
- Consumes: `rasterizeParts` / `computeAnchors` / `chunkHash` / `CHUNK`（Task 1）
- Produces（Town のメソッド）:
  - `buildingsAt(x, y) → building[]`（外接矩形が点を含む建物）
  - `buildingsInCircle(x, y, r) → building[]`（外接矩形が円に掛かる建物）
  - `cellAt(b, x, y) → number`（かけらの番号。建物の外なら -1。かけらが空かどうかは見ない）
  - `chip(b, x, y, radius) → number`（欠けたかけらの数）
  - 建物の記録に `ctx`・`total`（最初のかけらの数）・`remaining`・`collapsed` を足す
  - `_settle(b)` はこの Task では空。Task 4 で中身を書く

- [ ] **Step 1: 失敗するテストを書く**

`tests/helpers/town-fixtures.js`:

```js
// 町（world/town/）のテストの共有。偽の canvas（描いた呼び出しを記録する）と、四角い建物の設計図
import { makeFakeCtx } from './fake-ctx.js';
import { MAT_ADOBE } from '../../src/js/world/town/chunks.js';

export function fakeCanvas(w, h) {
    const cv = { width: w, height: h, ctx: makeFakeCtx() };
    cv.getContext = () => cv.ctx;
    return cv;
}

/** 土の塊（全部厚い壁）を (x, y) に1棟。既定は 32x32 */
export function block(x, y, w = 32, h = 32) {
    return {
        site: 'floor', style: 'A', kind: 'tower', x, y, w, h,
        parts: [{ x: 0, y: 0, w, h, color: '#7d5a2a', mat: MAT_ADOBE, solid: true }],
    };
}
```

`tests/town-chip.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Town } from '../src/js/world/town/Town.js';
import { SOLID } from '../src/js/world/town/chunks.js';
import { fakeCanvas, block } from './helpers/town-fixtures.js';

const count = (b) => b.cells.reduce((n, v) => n + (v ? 1 : 0), 0);

test('buildingsAt / buildingsInCircle は外接矩形で引く（64px のマス目をまたいでも）', () => {
    const town = new Town([block(0, 0), block(100, 0), block(60, 60, 16, 16)], { createCanvas: fakeCanvas });
    assert.deepEqual(town.buildingsAt(10, 10).map((b) => b.id), [0]);
    assert.deepEqual(town.buildingsAt(70, 70).map((b) => b.id), [2]);
    assert.deepEqual(town.buildingsAt(50, 50), []);
    assert.deepEqual(town.buildingsInCircle(50, 16, 52).map((b) => b.id).sort(), [0, 1, 2]);
    assert.deepEqual(town.buildingsInCircle(50, 16, 10).map((b) => b.id), []);
});

test('cellAt: 建物の中ならかけらの番号、外なら -1', () => {
    const town = new Town([block(100, 50)], { createCanvas: fakeCanvas });
    const b = town.buildings[0];
    assert.equal(town.cellAt(b, 100, 50), 0);
    assert.equal(town.cellAt(b, 105, 59), 2 * b.cw + 1);
    assert.equal(town.cellAt(b, 99, 50), -1);
    assert.equal(town.cellAt(b, 132, 50), -1);
});

test('chip: 半径の中のかけらが消え、canvas から 4px 角で抜かれる', () => {
    const town = new Town([block(0, 0)], { createCanvas: fakeCanvas });
    const b = town.buildings[0];
    assert.equal(b.total, 64);
    const n = town.chip(b, 16, 16, 6);
    assert.ok(n >= 4 && n <= 12, `${n}`);
    assert.equal(count(b), 64 - n);
    assert.equal(b.remaining, 64 - n);
    const clears = b.canvas.ctx.calls.filter((c) => c.name === 'clearRect');
    assert.equal(clears.length, n);
    assert.ok(clears.every((c) => c.args[2] === 4 && c.args[3] === 4));
});

test('chip: 半径が小さくても、当たった点のかけらは必ず欠ける', () => {
    const town = new Town([block(0, 0)], { createCanvas: fakeCanvas });
    const b = town.buildings[0];
    town.chip(b, 9, 9, 0.5);
    assert.equal(b.cells[town.cellAt(b, 9, 9)], 0);
});

test('chip: 同じ建物の同じ所に同じ半径で当てると、同じ穴になる（ぎざぎざは位置から決まる）', () => {
    const holes = [0, 1].map(() => {
        const town = new Town([block(0, 0, 64, 64)], { createCanvas: fakeCanvas });
        town.chip(town.buildings[0], 30, 30, 11);
        return [...town.buildings[0].cells].map((v) => (v ? 1 : 0)).join('');
    });
    assert.equal(holes[0], holes[1]);
});

test('chip: 穴の縁はぎざぎざ（中心からの距離が同じかけらでも、欠けるものと残るものがある）', () => {
    const town = new Town([block(0, 0, 128, 128)], { createCanvas: fakeCanvas });
    const b = town.buildings[0];
    town.chip(b, 64, 64, 30);
    // 半径 30 ちょうど付近（28〜32px）の輪のかけらを見る
    let gone = 0, left = 0;
    for (let k = 0; k < b.cells.length; k++) {
        const i = k % b.cw, j = (k - i) / b.cw;
        const d = Math.hypot(i * 4 + 2 - 64, j * 4 + 2 - 64);
        if (d < 29 || d > 31) continue;
        if (b.cells[k]) left++; else gone++;
    }
    assert.ok(gone > 0 && left > 0, `欠け ${gone} / 残り ${left}`);
});

test('chip: 穴の縁に残ったかけらを焦げ色で塗る', () => {
    const town = new Town([block(0, 0)], { createCanvas: fakeCanvas });
    const b = town.buildings[0];
    const before = b.canvas.ctx.calls.length;
    town.chip(b, 16, 16, 4);
    const fills = b.canvas.ctx.calls.slice(before).filter((c) => c.name === 'fillRect');
    assert.ok(fills.length > 0);
});

test('chip: 建物に掛からない爆心でも、半径の中のかけらは欠ける。空振りなら 0', () => {
    const town = new Town([block(0, 0)], { createCanvas: fakeCanvas });
    const b = town.buildings[0];
    assert.ok(town.chip(b, -4, 16, 8) > 0);
    assert.equal(town.chip(b, -40, 16, 8), 0);
});

test('chip: 厚い壁の印はかけらごと消える（残ったかけらの印は変わらない）', () => {
    const town = new Town([block(0, 0)], { createCanvas: fakeCanvas });
    const b = town.buildings[0];
    town.chip(b, 2, 2, 1);
    assert.equal(b.cells[0], 0);
    assert.equal(b.cells[b.cells.length - 1] & SOLID, SOLID);
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npm test -- tests/town-chip.test.js`
Expected: FAIL（`town.buildingsAt is not a function` など）

- [ ] **Step 3: 実装する**

`src/js/world/town/palette.js` の末尾に足す:

```js
// 段2: 穴の縁に残ったかけらに重ねる焦げ（半透明。何度も当たると重なって濃くなる）
export const TOWN_CHAR_EDGE = 'rgba(28, 18, 6, 0.55)';
// 崩壊で残った土台に重ねる焦げ（焦げた骨組み）
export const TOWN_RUIN_SHADE = 'rgba(20, 12, 4, 0.5)';
```

`src/js/world/town/Town.js` を次の形に書き換える（`draw` は今のまま。ヘッダーのコメントの「段1は置いて描くだけ」の行は「段2で欠け・支え・落下を足した」に直す）:

```js
import { rasterizeParts, computeAnchors, chunkHash, CHUNK } from './chunks.js';
import { paintParts } from './shapes.js';
import { TOWN_CHAR_EDGE } from './palette.js';
import { TOWN_CHIP_JAGGED } from '../../utils/Constants.js';

const HALF = CHUNK / 2;
// 弾・爆発と建物の当たりを引くマス目の大きさ（px）。総当たりにしない（spec 5章）
const HIT_GRID = 64;

// ...defaultCreateCanvas は今のまま...

export class Town {
    constructor(specs, { isSolidTile = () => false, createCanvas = defaultCreateCanvas } = {}) {
        this.isSolidTile = isSolidTile;
        this.createCanvas = createCanvas;
        this.buildings = specs.map((spec, id) => {
            const { cells, cw, ch } = rasterizeParts(spec.parts, spec.w, spec.h);
            const canvas = createCanvas(spec.w, spec.h);
            const ctx = canvas.getContext('2d');
            paintParts(ctx, spec.parts);
            const total = cells.reduce((n, v) => n + (v ? 1 : 0), 0);
            return {
                id, site: spec.site, style: spec.style, kind: spec.kind,
                x: spec.x, y: spec.y, width: spec.w, height: spec.h,
                cells, cw, ch,
                anchors: computeAnchors(cells, cw, ch, spec.x, spec.y, isSolidTile),
                canvas, ctx, total, remaining: total, collapsed: false,
            };
        });
        // 建物は動かないので、外接矩形が掛かるマス目に1度だけ登録する
        this._grid = new Map();
        for (const b of this.buildings) {
            for (const key of this._gridKeys(b.x, b.y, b.x + b.width, b.y + b.height)) {
                if (!this._grid.has(key)) this._grid.set(key, []);
                this._grid.get(key).push(b);
            }
        }
    }

    *_gridKeys(x0, y0, x1, y1) {
        for (let gy = Math.floor(y0 / HIT_GRID); gy <= Math.floor((y1 - 1) / HIT_GRID); gy++) {
            for (let gx = Math.floor(x0 / HIT_GRID); gx <= Math.floor((x1 - 1) / HIT_GRID); gx++) yield `${gx},${gy}`;
        }
    }

    /** 外接矩形が点 (x, y) を含む建物 */
    buildingsAt(x, y) {
        const list = this._grid.get(`${Math.floor(x / HIT_GRID)},${Math.floor(y / HIT_GRID)}`) || [];
        return list.filter((b) => x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height);
    }

    /** 外接矩形が円に掛かる建物（重複なし・番号順） */
    buildingsInCircle(x, y, r) {
        const found = new Set();
        for (const key of this._gridKeys(x - r, y - r, x + r + 1, y + r + 1)) {
            for (const b of this._grid.get(key) || []) {
                const nx = Math.max(b.x, Math.min(x, b.x + b.width));
                const ny = Math.max(b.y, Math.min(y, b.y + b.height));
                if (Math.hypot(nx - x, ny - y) <= r) found.add(b);
            }
        }
        return [...found].sort((a, b) => a.id - b.id);
    }

    /** ワールド座標のかけらの番号。建物の外は -1（空かどうかは見ない） */
    cellAt(b, x, y) {
        const i = Math.floor((x - b.x) / CHUNK);
        const j = Math.floor((y - b.y) / CHUNK);
        if (i < 0 || j < 0 || i >= b.cw || j >= b.ch) return -1;
        return j * b.cw + i;
    }

    /**
     * (x, y) を中心に半径 radius のかけらを欠かせる。縁はかけらごとに chunkHash で半径を揺らして
     * ぎざぎざにする（位置から決まるので、同じ所に撃てば同じ穴）。当たった点のかけらは必ず欠ける
     * （マシンガンの 4px でも何かが欠けないと、撃っても変わらない壁に見える）。
     * 描き直しは消えたかけらを clearRect で抜き、縁に焦げを重ねるだけ。建物全体は描き直さない
     * @returns {number} 欠けたかけらの数
     */
    chip(b, x, y, radius) {
        const lx = x - b.x;
        const ly = y - b.y;
        const reach = radius + TOWN_CHIP_JAGGED;
        const i0 = Math.max(0, Math.floor((lx - reach) / CHUNK));
        const i1 = Math.min(b.cw - 1, Math.floor((lx + reach) / CHUNK));
        const j0 = Math.max(0, Math.floor((ly - reach) / CHUNK));
        const j1 = Math.min(b.ch - 1, Math.floor((ly + reach) / CHUNK));
        const hit = this.cellAt(b, x, y);
        const removed = [];
        for (let j = j0; j <= j1; j++) {
            for (let i = i0; i <= i1; i++) {
                const k = j * b.cw + i;
                if (!b.cells[k]) continue;
                const d = Math.hypot(i * CHUNK + HALF - lx, j * CHUNK + HALF - ly);
                if (k === hit || d <= radius + (chunkHash(b.id, i, j) - 0.5) * TOWN_CHIP_JAGGED) removed.push(k);
            }
        }
        if (removed.length === 0) return 0;
        this._removeCells(b, removed);
        this._charEdges(b, removed);
        this._settle(b);
        return removed.length;
    }

    _removeCells(b, list) {
        for (const k of list) {
            const i = k % b.cw;
            b.cells[k] = 0;
            b.ctx.clearRect(i * CHUNK, ((k - i) / b.cw) * CHUNK, CHUNK, CHUNK);
        }
        b.remaining -= list.length;
    }

    /** 消えたかけらの上下左右に残ったかけらへ焦げを重ねる（1回の欠けで同じかけらは1度だけ） */
    _charEdges(b, removed) {
        const done = new Set();
        b.ctx.fillStyle = TOWN_CHAR_EDGE;
        for (const k of removed) {
            const i = k % b.cw;
            const nb = [];
            if (i > 0) nb.push(k - 1);
            if (i < b.cw - 1) nb.push(k + 1);
            if (k >= b.cw) nb.push(k - b.cw);
            if (k + b.cw < b.cells.length) nb.push(k + b.cw);
            for (const n of nb) {
                if (!b.cells[n] || done.has(n)) continue;
                done.add(n);
                const ni = n % b.cw;
                b.ctx.fillRect(ni * CHUNK, ((n - ni) / b.cw) * CHUNK, CHUNK, CHUNK);
            }
        }
    }

    /** 支えを確かめ直す（Task 4） */
    _settle(b) {}

    // draw(ctx, view) は今のまま
}
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test -- tests/town-chip.test.js tests/town-draw.test.js`
Expected: PASS

ミューテーション（1つずつ、控えから戻す）: `k === hit ||` を外す → 「当たった点は必ず欠ける」が赤。`(chunkHash(...) - 0.5) * TOWN_CHIP_JAGGED` を `0` にする → 「ぎざぎざ」が赤。`_charEdges` の呼び出しを消す → 「焦げ色」が赤。`buildingsInCircle` の `Math.hypot(...) <= r` を `true` にする → 「外接矩形で引く」が赤。

- [ ] **Step 5: コミット**

```bash
git add src/js/world/town/Town.js src/js/world/town/palette.js tests/helpers/town-fixtures.js tests/town-chip.test.js
git commit -m "feat: 町の建物を欠かせる（当たりのマス目・位置から決まるぎざぎざの穴・焦げの縁）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 支え・崩壊・落ちる破片を切り出す

**Files:**
- Create: `src/js/world/town/FallingPiece.js`
- Modify: `src/js/world/town/Town.js`
- Modify: `src/js/utils/Constants.js`（Task 1 の手順でステージ）
- Test: `tests/town-settle.test.js`（新規）

**Interfaces:**
- Consumes: `supportedMask` / `detachedGroups`（Task 2）、`chip` / `_removeCells`（Task 3）
- Produces:
  - `class FallingPiece({ canvas, cells, cw, ch, x, y, vx, vy, spin, sourceId })`。`x, y` は左上、`width = cw*4`、`height = ch*4`、`angle`、`alive`、`hitIds: Set`、`cx` / `cy`（中心）、`mainMaterial()`、`draw(ctx)`。動きは Task 5
  - Town: `falling: FallingPiece[]`、`effects: Array<{type, x, y, ...}>`、`_emit(type, x, y, extra)`、`_settle(b)`、`_detach(b, group)`、`_trimFalling()`
  - 注文の種類: `'collapse'`（崩壊。`{size}`）、`'dust'`（上限で消えた破片。`{mat}`）。Task 5 で `'shatter'` を足す

- [ ] **Step 1: 失敗するテストを書く**

`tests/town-settle.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Town } from '../src/js/world/town/Town.js';
import { MAT_ADOBE, MAT_WOOD, CHARRED } from '../src/js/world/town/chunks.js';
import { TOWN_FALLING_MAX } from '../src/js/utils/Constants.js';
import { fakeCanvas, block } from './helpers/town-fixtures.js';

// 32x68 の塔を (0, 0) に立て、下端の 4px（かけら1段、中心 y=66）がタイル行 r=4（y 64〜79）の岩に入るようにする
const tower = () => block(0, 0, 32, 68);
const onRock = (r) => r === 4;
// 高さ y のかけらの段を横一列に欠かせる。4px おきに当てるので、どのかけらの中心も当てた点から
// 2px 以内（ぎざぎざで半径が最小 r - 1.5 まで縮んでも欠ける）
const cutRow = (town, b, y, r = 4) => { for (let x = 2; x < b.width; x += 4) town.chip(b, b.x + x, y, r); };

test('中ほどを抜くと、上だけが1つの破片になって落ちる（土台は残る）', () => {
    const town = new Town([tower()], { createCanvas: fakeCanvas, isSolidTile: onRock });
    const b = town.buildings[0];
    cutRow(town, b, 30);
    assert.equal(town.falling.length, 1);
    const p = town.falling[0];
    assert.equal(p.y, 0);
    assert.ok(p.height <= 28, `${p.height}`);
    assert.ok(b.remaining > 0 && !b.collapsed);
    // 破片に行ったかけらは建物から消えている
    assert.equal(b.cells[0], 0);
});

test('破片は自分の canvas に元の絵を写し、形の外を抜く', () => {
    const town = new Town([tower()], { createCanvas: fakeCanvas, isSolidTile: onRock });
    const b = town.buildings[0];
    cutRow(town, b, 30);
    const p = town.falling[0];
    const draws = p.canvas.ctx.calls.filter((c) => c.name === 'drawImage');
    assert.equal(draws.length, 1);
    assert.equal(draws[0].args[0], b.canvas);
    assert.deepEqual(draws[0].args.slice(1), [0, 0, p.width, p.height, 0, 0, p.width, p.height]);
});

test('支えの岩が無い建物は丸ごと1つの破片として落ち、崩壊の土台も残らない', () => {
    const town = new Town([tower()], { createCanvas: fakeCanvas, isSolidTile: () => false });
    const b = town.buildings[0];
    town.chip(b, 16, 30, 1);
    assert.equal(town.falling.length, 1);
    assert.equal(b.remaining, 0);
});

test('残りが 4割を下回ると崩壊する: 支えの近くの土台だけ残り、焦げ、崩壊の注文が出る', () => {
    const town = new Town([tower()], { createCanvas: fakeCanvas, isSolidTile: onRock });
    const b = town.buildings[0];
    // y=58 の低い所（下から3段目）を横断すると、上の大部分（8割超）が支えを失う
    cutRow(town, b, 58, 2);
    assert.ok(b.collapsed);
    assert.equal(town.effects.filter((e) => e.type === 'collapse').length, 1);
    // 残ったかけらは支え（最下段）から TOWN_RUIN_DEPTH 段以内で、焦げの印が付いている
    for (let k = 0; k < b.cells.length; k++) {
        if (!b.cells[k]) continue;
        const j = Math.floor(k / b.cw);
        assert.ok(j >= b.ch - 1 - 3, `段 ${j} が残っている`);
        assert.equal(b.cells[k] & CHARRED, CHARRED);
    }
});

test('崩壊は1棟1回だけ（焦げた土台がまた欠けても、崩壊の注文は増えない）', () => {
    const town = new Town([tower()], { createCanvas: fakeCanvas, isSolidTile: onRock });
    const b = town.buildings[0];
    cutRow(town, b, 58, 2);
    town.chip(b, 16, 66, 2);
    assert.equal(town.effects.filter((e) => e.type === 'collapse').length, 1);
});

test('崩壊しないかぎり、残った部分は焦げない', () => {
    const town = new Town([tower()], { createCanvas: fakeCanvas, isSolidTile: onRock });
    const b = town.buildings[0];
    town.chip(b, 16, 10, 3);
    assert.ok(!b.collapsed);
    assert.ok([...b.cells].every((v) => !(v & CHARRED)));
});

test('落ちている破片は TOWN_FALLING_MAX まで。超えた分は古いものから土煙の注文になって消える', () => {
    const specs = [];
    for (let n = 0; n < TOWN_FALLING_MAX + 5; n++) specs.push(block(n * 40, 0, 16, 16));
    const town = new Town(specs, { createCanvas: fakeCanvas, isSolidTile: () => false });
    for (const b of town.buildings) town.chip(b, b.x + 8, 8, 1);
    assert.equal(town.falling.length, TOWN_FALLING_MAX);
    assert.equal(town.effects.filter((e) => e.type === 'dust').length, 5);
    // 残っているのは新しいほう
    assert.equal(town.falling[0].sourceId, 5);
});

test('破片の主な材料（瓦礫と粒の色に使う）', () => {
    const spec = {
        site: 'floor', style: 'C', kind: 'shack', x: 0, y: 0, w: 16, h: 8,
        parts: [
            { x: 0, y: 0, w: 16, h: 4, color: '#5a3d1e', mat: MAT_WOOD, solid: true },
            { x: 0, y: 4, w: 4, h: 4, color: '#7d5a2a', mat: MAT_ADOBE, solid: true },
        ],
    };
    const town = new Town([spec], { createCanvas: fakeCanvas, isSolidTile: () => false });
    // 土のかけら（左下）を欠かせると、支えの無い残り（木 4 かけら）が1つの破片になる
    town.chip(town.buildings[0], 2, 6, 0.5);
    assert.equal(town.falling[0].mainMaterial(), MAT_WOOD);
});

test('落ちる向きと回り方は建物と位置から決まる（同じ壊し方なら同じ）', () => {
    const run = () => {
        const town = new Town([tower()], { createCanvas: fakeCanvas, isSolidTile: onRock });
        cutRow(town, town.buildings[0], 30);
        const p = town.falling[0];
        return [p.vx, p.spin];
    };
    assert.deepEqual(run(), run());
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npm test -- tests/town-settle.test.js`
Expected: FAIL（`TOWN_FALLING_MAX` が無い SyntaxError）

- [ ] **Step 3: 実装する**

`Constants.js` の段2の節に足す（Task 1 の手順でステージ）:

```js
// 同時に落ちている破片の上限。超えたら古いものから土煙になって消える（spec 2章）
export const TOWN_FALLING_MAX = 24;
// 落ちる破片の動き。重力は Grenade（GRENADE_GRAVITY）と同じ桁。回りは 1 フレーム最大 0.05rad
export const TOWN_FALL_GRAVITY = 0.25;
export const TOWN_FALL_MAX_SPEED = 7;     // 1 tick に 7px。描画補間の瞬間移動の閾値 64px より十分小さい
export const TOWN_FALL_SPIN_MAX = 0.05;
export const TOWN_FALL_DRIFT_MAX = 0.3;   // 横へ流れる初速（±px/tick）
```

`src/js/world/town/FallingPiece.js`:

```js
// ============================================
// FallingPiece - 支えを失って落ちる建物のかけらの塊
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md（2章「落ちる破片」）
// 切り離したときの形のまま、自分の canvas を持って落ちる。当たりは回る前の外接矩形で見る
// （回転は見た目だけ。斜めの当たりを正確に取っても、遊びには関わらない）。
// x, y は左上。描画補間（utils/renderInterp.js）は x, y だけを動かすので、中心は毎回 x, y から求める。

import { CHUNK, MAT_MASK } from './chunks.js';

export class FallingPiece {
    constructor({ canvas, cells, cw, ch, x, y, vx = 0, vy = 0, spin = 0, sourceId = -1 }) {
        this.canvas = canvas;
        this.cells = cells;
        this.cw = cw;
        this.ch = ch;
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.spin = spin;
        this.sourceId = sourceId;
        this.width = cw * CHUNK;
        this.height = ch * CHUNK;
        this.angle = 0;
        this.alive = true;
        // 1棟1回だけ欠かせる（同じ建物を毎 tick 削り続けないように）
        this.hitIds = new Set();
    }

    get cx() { return this.x + this.width / 2; }
    get cy() { return this.y + this.height / 2; }
    get count() { return this.cells.reduce((n, v) => n + (v ? 1 : 0), 0); }

    /** 一番多い材料（瓦礫と破片の粒の色を決める） */
    mainMaterial() {
        const n = [0, 0, 0, 0, 0, 0, 0, 0];
        for (const v of this.cells) if (v) n[v & MAT_MASK]++;
        let best = 0;
        for (let m = 1; m < n.length; m++) if (n[m] > n[best]) best = m;
        return best;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.cx, this.cy);
        ctx.rotate(this.angle);
        ctx.drawImage(this.canvas, -this.width / 2, -this.height / 2);
        ctx.restore();
    }
}
```

`Town.js`: import に足す:

```js
import { supportedMask, detachedGroups } from './structure.js';
import { FallingPiece } from './FallingPiece.js';
import { CHARRED } from './chunks.js';                // 既存の chunks の import に足す
import { TOWN_RUIN_SHADE } from './palette.js';       // 既存の palette の import に足す
import {
    TOWN_CHIP_JAGGED, TOWN_COLLAPSE_FRACTION, TOWN_RUIN_DEPTH,
    TOWN_FALLING_MAX, TOWN_FALL_SPIN_MAX, TOWN_FALL_DRIFT_MAX,
} from '../../utils/Constants.js';
```

コンストラクタの先頭に足す:

```js
        this.falling = [];
        // 粒・土煙の注文。update() でまとめて、画面の中の分だけ出す（spec 2章「画面の外」）。
        // 壊れ方そのもの（かけら・支え・落下）は注文と関係なく、その場で進める
        this.effects = [];
```

`_settle(b) {}` を置き換え、メソッドを足す:

```js
    _emit(type, x, y, extra = {}) {
        this.effects.push({ type, x, y, ...extra });
    }

    /** 岩がまだある支えのかけら */
    _liveAnchors(b) {
        return b.anchors.filter((a) => b.cells[a.i] && this.isSolidTile(a.r, a.c)).map((a) => a.i);
    }

    /**
     * 支えにつながっていないかけらを破片にして落とす。残りが元の TOWN_COLLAPSE_FRACTION を
     * 下回るなら崩壊: 支えから TOWN_RUIN_DEPTH かけら以内の土台だけを残して焦がし、残りは全部落とす。
     * 崩壊は1棟1回（焦げた土台がまた欠けても、ふつうに支えを確かめるだけ）
     */
    _settle(b) {
        const anchors = this._liveAnchors(b);
        let mask = supportedMask(b.cells, b.cw, b.ch, anchors);
        const kept = mask.reduce((n, v) => n + v, 0);
        if (!b.collapsed && kept < b.total * TOWN_COLLAPSE_FRACTION) {
            b.collapsed = true;
            mask = supportedMask(b.cells, b.cw, b.ch, anchors, TOWN_RUIN_DEPTH);
            this._charRuins(b, mask);
            this._emit('collapse', b.x + b.width / 2, b.y + b.height / 2, { size: b.remaining });
        }
        for (const group of detachedGroups(b.cells, b.cw, b.ch, mask)) this._detach(b, group);
    }

    /** 崩壊で残った土台を焦がす（焦げた骨組み）。段3の火はこの印を見て、燃え尽きた所として扱う */
    _charRuins(b, mask) {
        b.ctx.fillStyle = TOWN_RUIN_SHADE;
        for (let k = 0; k < mask.length; k++) {
            if (!mask[k]) continue;
            b.cells[k] |= CHARRED;
            const i = k % b.cw;
            b.ctx.fillRect(i * CHUNK, ((k - i) / b.cw) * CHUNK, CHUNK, CHUNK);
        }
    }

    /** かけらの塊を建物から切り離して、自分の canvas を持つ破片にする */
    _detach(b, group) {
        let i0 = Infinity, i1 = -1, j0 = Infinity, j1 = -1;
        for (const k of group) {
            const i = k % b.cw, j = (k - i) / b.cw;
            i0 = Math.min(i0, i); i1 = Math.max(i1, i);
            j0 = Math.min(j0, j); j1 = Math.max(j1, j);
        }
        const pcw = i1 - i0 + 1, pch = j1 - j0 + 1;
        const pw = pcw * CHUNK, ph = pch * CHUNK;
        const canvas = this.createCanvas(pw, ph);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(b.canvas, i0 * CHUNK, j0 * CHUNK, pw, ph, 0, 0, pw, ph);
        const cells = new Uint8Array(pcw * pch);
        for (const k of group) {
            const i = k % b.cw, j = (k - i) / b.cw;
            cells[(j - j0) * pcw + (i - i0)] = b.cells[k];
        }
        // 外接矩形のうち塊に入らないかけら（隣の残る部分の絵）を抜く
        for (let q = 0; q < cells.length; q++) {
            if (!cells[q]) ctx.clearRect((q % pcw) * CHUNK, Math.floor(q / pcw) * CHUNK, CHUNK, CHUNK);
        }
        this._removeCells(b, group);
        this.falling.push(new FallingPiece({
            canvas, cells, cw: pcw, ch: pch,
            x: b.x + i0 * CHUNK, y: b.y + j0 * CHUNK,
            vx: (chunkHash(b.id, i0 + 101, j0 + 211) - 0.5) * 2 * TOWN_FALL_DRIFT_MAX,
            spin: (chunkHash(b.id, j0 + 307, i0 + 401) - 0.5) * 2 * TOWN_FALL_SPIN_MAX,
            sourceId: b.id,
        }));
        this._trimFalling();
    }

    /** 上限を超えた分を古いものから消す（土煙の注文を出す） */
    _trimFalling() {
        while (this.falling.length > TOWN_FALLING_MAX) {
            const old = this.falling.shift();
            old.alive = false;
            this._emit('dust', old.cx, old.cy, { mat: old.mainMaterial() });
        }
    }
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test -- tests/town-settle.test.js tests/town-chip.test.js tests/town-structure.test.js`
Expected: PASS

ミューテーション（1つずつ）: `!b.collapsed &&` を外す → 「崩壊は1回だけ」が赤。`_charRuins` を呼ばない → 「焦げの印」が赤。`_detach` の `clearRect` のループを消す → このテストでは差が出ないかもしれない（塔は四角なので外接矩形＝塊）。出なければ fixture を疑い、L 字の塊ができる壊し方のテストを足して赤くなるのを確かめる。`_trimFalling` の呼び出しを消す → 上限のテストが赤。

- [ ] **Step 5: コミット**

```bash
git add src/js/world/town/FallingPiece.js src/js/world/town/Town.js tests/town-settle.test.js
# Constants.js は Task 1 の手順でステージ
git commit -m "feat: 町の支え・崩壊・落ちる破片の切り出し（土台は焦げて残る）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 破片を落とす・砕ける・瓦礫・粒を画面の中だけ出す・描く

**Files:**
- Modify: `src/js/world/town/FallingPiece.js`（`step()`）
- Modify: `src/js/world/town/Town.js`（`update(game)` / `_updateFalling` / `_shatter` / `_addRubble` / `_flushEffects` / `draw`）
- Modify: `src/js/world/town/palette.js`（瓦礫の色）
- Modify: `src/js/utils/Constants.js`（Task 1 の手順でステージ）
- Test: `tests/town-falling.test.js`（新規）

**Interfaces:**
- Consumes: `FallingPiece`、`falling`、`effects`、`chip`（Task 3〜4）
- Produces:
  - `FallingPiece.step()`（重力・横流れ・回転）
  - Town: `update(game)`（この Task では破片と注文だけ。Task 7 で弾を足す）、`rubble: Array<{x, w, groundY, h, color}>`
  - 注文 `'shatter'`（`{mat, count}`）
  - `draw(ctx, view)` が建物 → 瓦礫 → 落ちる破片の順に描く

- [ ] **Step 1: 失敗するテストを書く**

`tests/town-falling.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { Town } from '../src/js/world/town/Town.js';
import { TILE_SIZE as T, TOWN_FALL_MAX_SPEED, VIEW_CULL_MARGIN } from '../src/js/utils/Constants.js';
import { fakeCanvas, block } from './helpers/town-fixtures.js';

// 行 10（y 160〜175）から下が岩。建物は (0, 0) に支え無しで浮かせ、落としてみる
const floorAt10 = (r) => r >= 10;
// projectiles は Task 7 で town.update が見るようになる（ここでは空）
const fakeGame = (cam = { x: 0, y: 0 }) => ({ particles: [], projectiles: [], camera: cam, canvas: { width: 800, height: 600 } });

function dropOne() {
    const town = new Town([block(0, 0, 16, 16)], { createCanvas: fakeCanvas, isSolidTile: floorAt10 });
    town.chip(town.buildings[0], 8, 8, 1);   // 支え無し → 丸ごと破片
    return town;
}

test('破片は重力で落ち、速さは上限で止まる', () => {
    const town = dropOne();
    const p = town.falling[0];
    const game = fakeGame();
    let lastY = p.y;
    for (let t = 0; t < 12 && p.alive; t++) {
        town.update(game);
        assert.ok(p.y > lastY);
        assert.ok(p.vy <= TOWN_FALL_MAX_SPEED);
        lastY = p.y;
    }
});

test('岩に着くと砕ける: 破片は消え、瓦礫が床に残り、砕けた注文の粒が出る', () => {
    const town = dropOne();
    const game = fakeGame();
    for (let t = 0; t < 200 && town.falling.length; t++) town.update(game);
    assert.equal(town.falling.length, 0);
    assert.equal(town.rubble.length, 1);
    assert.equal(town.rubble[0].groundY, 10 * T);
    assert.ok(game.particles.length > 0);
    assert.equal(town.effects.length, 0, '注文は update で出し切る');
});

test('重なる瓦礫は1つにまとめる', () => {
    const town = new Town([block(0, 0, 16, 16), block(8, -40, 16, 16)], { createCanvas: fakeCanvas, isSolidTile: floorAt10 });
    for (const b of town.buildings) town.chip(b, b.x + 8, b.y + 8, 1);
    const game = fakeGame();
    for (let t = 0; t < 300 && town.falling.length; t++) town.update(game);
    assert.equal(town.rubble.length, 1);
    assert.ok(town.rubble[0].w >= 24);
});

test('画面の外で砕けても粒は出さない（でも破片は同じに落ちて瓦礫が残る）', () => {
    const town = dropOne();
    const game = fakeGame({ x: 5000, y: 5000 });
    for (let t = 0; t < 200 && town.falling.length; t++) town.update(game);
    assert.equal(town.falling.length, 0);
    assert.equal(town.rubble.length, 1);
    assert.equal(game.particles.length, 0);
});

test('画面のすぐ外（VIEW_CULL_MARGIN 以内）なら粒を出す', () => {
    const town = dropOne();
    // 破片は x=8 で砕ける。画面の左端をそれより MARGIN の半分だけ右に置く＝画面の外だがマージンの中
    const offScreenButInMargin = { x: 8 + VIEW_CULL_MARGIN / 2, y: 0 };
    const game = fakeGame(offScreenButInMargin);
    for (let t = 0; t < 200 && town.falling.length; t++) town.update(game);
    assert.ok(game.particles.length > 0);
});

test('落ちる破片は下の建物を1棟1回だけ欠かせる（連鎖）', () => {
    // 上の小屋を落とし、真下の塔（岩の上に立つ）に当てる
    const lower = block(0, 96, 16, 68);          // 下端 y=164 が行 10 の岩に 4px 入る
    const town = new Town([block(0, 0, 16, 16), lower], { createCanvas: fakeCanvas, isSolidTile: floorAt10 });
    const below = town.buildings[1];
    const before = below.remaining;
    town.chip(town.buildings[0], 8, 8, 1);
    const game = fakeGame();
    for (let t = 0; t < 300 && town.falling.length; t++) town.update(game);
    assert.ok(below.remaining < before, '下の建物が欠けた');
    const p = town.falling.find((f) => f.sourceId === 0);
    assert.equal(p, undefined);
});

test('破片の更新中に破片が増えても、全部が1回ずつ進む（新しい破片は次の tick から）', () => {
    const lower = block(0, 96, 16, 68);
    const town = new Town([block(0, 0, 16, 16), lower], { createCanvas: fakeCanvas, isSolidTile: floorAt10 });
    town.chip(town.buildings[0], 8, 8, 1);
    const p = town.falling[0];
    const game = fakeGame();
    const ys = [];
    for (let t = 0; t < 300 && p.alive; t++) { const y = p.y; town.update(game); if (p.alive) ys.push(p.y - y); }
    assert.ok(ys.every((d) => d > 0), '毎 tick 必ず下へ進む（飛ばし・二重が無い）');
});

test('draw: 建物 → 瓦礫 → 落ちる破片の順に、画面に掛かるものだけ描く', () => {
    const town = dropOne();
    const game = fakeGame();
    for (let t = 0; t < 3; t++) town.update(game);
    town.rubble.push({ x: 100, w: 16, groundY: 160, h: 4, color: '#6f4f24' });
    const ctx = makeFakeCtx();
    town.draw(ctx, { x: 0, y: 0, w: 800, h: 600 });
    const names = ctx.calls.map((c) => c.name);
    assert.ok(names.includes('fillRect'), '瓦礫');
    assert.ok(names.includes('rotate'), '破片');
    const far = makeFakeCtx();
    town.draw(far, { x: 5000, y: 5000, w: 800, h: 600 });
    assert.equal(far.calls.filter((c) => c.name === 'rotate' || c.name === 'fillRect').length, 0);
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npm test -- tests/town-falling.test.js`
Expected: FAIL（`town.update is not a function`）

- [ ] **Step 3: 実装する**

`Constants.js` の段2の節に足す（Task 1 の手順でステージ）:

```js
// 落ちる破片が下の建物を欠かせる半径（px）。1棟1回
export const TOWN_FALL_CHIP_RADIUS = 6;
// 砕けたときの粒（破片の色の欠片＋土煙）の数
export const TOWN_SHATTER_PARTICLES = 10;
// 瓦礫の山の高さの上限（px）。重なるたびに 1px ずつ高くなる
export const TOWN_RUBBLE_MAX_H = 10;
```

`palette.js` の末尾に足す（材料の番号 → 瓦礫と破片の粒の色。輝度は TOWN_BODY_COLORS と同じ範囲の色から選んだ）:

```js
export const TOWN_RUBBLE_COLORS = {
    1: '#6f4f24',   // 土（adobe の暗いほう）
    2: '#4f3519',   // 木
    3: '#4f4a42',   // 金属
    4: '#4f3519',   // 爆発物（段3b。木箱と同じ色）
};
export const TOWN_DUST_COLOR = '#8a7a5a';
```

`FallingPiece.js` に足す（import に `TOWN_FALL_GRAVITY, TOWN_FALL_MAX_SPEED` を `../../utils/Constants.js` から）:

```js
    /** 1 tick 進める。回転は見た目だけ */
    step() {
        this.vy = Math.min(TOWN_FALL_MAX_SPEED, this.vy + TOWN_FALL_GRAVITY);
        this.x += this.vx;
        this.y += this.vy;
        this.angle += this.spin;
    }
```

`Town.js`: import に足す:

```js
import { createExplosion, Particle } from '../../entities/Particle.js';
import { TOWN_RUBBLE_COLORS, TOWN_DUST_COLOR } from './palette.js';   // 既存の palette の import に足す
import {
    TILE_SIZE, VIEW_CULL_MARGIN, TOWN_COLLAPSE_PARTICLES,
    TOWN_FALL_CHIP_RADIUS, TOWN_SHATTER_PARTICLES, TOWN_RUBBLE_MAX_H,
} from '../../utils/Constants.js';                                     // 既存の Constants の import に足す
```

コンストラクタに `this.rubble = [];` を足す。メソッドを足す:

```js
    /** 毎 tick。main._simulationTick が map.update() のあとに呼ぶ */
    update(game) {
        this._updateFalling();
        this._flushEffects(game);
    }

    _solidAtPixel(x, y) {
        return this.isSolidTile(Math.floor(y / TILE_SIZE), Math.floor(x / TILE_SIZE));
    }

    _updateFalling() {
        // 写しで回す: 欠けが新しい破片を足したり、上限で古い破片を消したりするため。
        // 新しく増えた破片は次の tick から動く
        for (const p of [...this.falling]) {
            if (!p.alive) continue;
            p.step();
            const by = p.y + p.height;
            for (const b of this.buildingsAt(p.cx, by)) {
                const k = this.cellAt(b, p.cx, by);
                if (p.hitIds.has(b.id) || k < 0 || !b.cells[k]) continue;
                p.hitIds.add(b.id);
                this.chip(b, p.cx, by, TOWN_FALL_CHIP_RADIUS);
            }
            // 下端の左・中・右のどれかが岩に入ったら砕ける。盤面の外は岩（Map.isSolid と同じ）なので
            // 盤面の下へ抜けることはない
            if ([p.x + 2, p.cx, p.x + p.width - 2].some((sx) => this._solidAtPixel(sx, by))) this._shatter(p, by);
        }
        this.falling = this.falling.filter((p) => p.alive);
    }

    _shatter(p, by) {
        p.alive = false;
        const groundY = Math.floor(by / TILE_SIZE) * TILE_SIZE;
        const mat = p.mainMaterial();
        this._addRubble(p.x, p.width, groundY, p.count, mat);
        this._emit('shatter', p.cx, groundY, { mat, count: TOWN_SHATTER_PARTICLES });
    }

    /** 床に瓦礫の山を足す。同じ床で横に重なる山は1つにまとめる（数が増え続けないように） */
    _addRubble(x, w, groundY, cellCount, mat) {
        const h = Math.max(2, Math.min(TOWN_RUBBLE_MAX_H, Math.round(Math.sqrt(cellCount))));
        for (const r of this.rubble) {
            if (r.groundY !== groundY || x >= r.x + r.w || r.x >= x + w) continue;
            const x0 = Math.min(r.x, x);
            r.w = Math.max(r.x + r.w, x + w) - x0;
            r.x = x0;
            r.h = Math.min(TOWN_RUBBLE_MAX_H, Math.max(r.h, h) + 1);
            return;
        }
        this.rubble.push({ x, w, groundY, h, color: TOWN_RUBBLE_COLORS[mat] || TOWN_RUBBLE_COLORS[1] });
    }

    /**
     * 溜めた注文を出す。画面の中かそのすぐ外（VIEW_CULL_MARGIN）だけ。
     * 崩壊は createExplosion を直接足す（spawnExplosion を通すと town.blast に戻って
     * 崩壊が隣を崩す連鎖が止まらなくなる。spec 2章）。音は段4
     */
    _flushEffects(game) {
        const cam = game.camera;
        const cv = game.canvas;
        const m = VIEW_CULL_MARGIN;
        for (const e of this.effects) {
            if (cam && cv && (e.x < cam.x - m || e.x > cam.x + cv.width + m
                || e.y < cam.y - m || e.y > cam.y + cv.height + m)) continue;
            if (e.type === 'collapse') {
                game.particles.push(...createExplosion(e.x, e.y, TOWN_COLLAPSE_PARTICLES));
            } else {
                const color = TOWN_RUBBLE_COLORS[e.mat] || TOWN_RUBBLE_COLORS[1];
                const n = e.count || TOWN_SHATTER_PARTICLES;
                for (let i = 0; i < n; i++) {
                    // 見た目だけの粒なので Math.random でよい（既存の createExplosion と同じ）
                    const a = -Math.PI * Math.random();
                    const s = 0.5 + Math.random() * 2;
                    const dust = e.type === 'dust' || i % 3 === 0;
                    game.particles.push(new Particle(e.x, e.y, Math.cos(a) * s, Math.sin(a) * s,
                        dust ? TOWN_DUST_COLOR : color, dust ? 2 + Math.random() * 3 : 1 + Math.random() * 2,
                        20 + Math.floor(Math.random() * 20)));
                }
            }
        }
        this.effects.length = 0;
    }
```

`draw(ctx, view)` の建物のループのあとに足す:

```js
        // 瓦礫の山: 下に広い段、上に狭い段の2つの四角（fillRect だけで描く決まり）
        for (const r of this.rubble) {
            if (r.x >= x1 || r.x + r.w <= view.x || r.groundY - r.h >= y1 || r.groundY <= view.y) continue;
            ctx.fillStyle = r.color;
            const low = Math.ceil(r.h / 2);
            ctx.fillRect(r.x, r.groundY - low, r.w, low);
            ctx.fillRect(r.x + r.w / 4, r.groundY - r.h, r.w / 2, r.h - low);
        }
        // 落ちる破片。回るので長辺の正方形で見る
        for (const p of this.falling) {
            const s = Math.max(p.width, p.height);
            if (p.cx - s >= x1 || p.cx + s <= view.x || p.cy - s >= y1 || p.cy + s <= view.y) continue;
            p.draw(ctx);
        }
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test -- tests/town-falling.test.js tests/town-settle.test.js tests/town-chip.test.js tests/town-draw.test.js`
Expected: PASS

ミューテーション（1つずつ）: `[...this.falling]` を `this.falling` にする → 「1回ずつ進む」が赤になるか確かめる（ならなければ、上限で消える破片が出る fixture で別のテストを足す）。`_flushEffects` の画面判定を `false` にする → 「画面の外」が赤。`p.hitIds.has(b.id) ||` を外す → 「1回だけ」…このテストは欠けたかどうかしか見ていないので赤にならないはず。そのときは「下の建物の欠けたかけらの数が TOWN_FALL_CHIP_RADIUS 1回ぶん以下」を足して赤くなるのを確かめる。瓦礫のまとめの `return` を消す → 「1つにまとめる」が赤。

- [ ] **Step 5: コミット**

```bash
git add src/js/world/town/FallingPiece.js src/js/world/town/Town.js src/js/world/town/palette.js tests/town-falling.test.js
# Constants.js は Task 1 の手順でステージ
git commit -m "feat: 町の破片が落ちて砕け、瓦礫が残る（粒は画面の中だけ）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 爆発・岩の破壊とつなぐ、ゲームの tick と描画補間に載せる

**Files:**
- Modify: `src/js/world/town/Town.js`（`blast` / `onBlockDestroyed` / 支えの索引）
- Modify: `src/js/systems/SpawnEffects.js`
- Modify: `src/js/world/Map.js`
- Modify: `src/js/main.js`（**下のステージ手順で**）
- Test: `tests/town-wiring.test.js`（新規）

**Interfaces:**
- Produces:
  - `Town.blast(x, y, size)`（半径 `TOWN_BLAST_RADIUS_K × √size`）
  - `Town.onBlockDestroyed(r, c)`
  - `SpawnEffects.spawnExplosion` の最後で `this.map.town.blast(x, y, size)`
  - `Map.damageBlock` の「壊れた」分岐で `this.town.onBlockDestroyed(r, c)`
  - `Game._simulationTick` が `this.map.update()` の直後に `this.map.town.update(this)`
  - `Game._forEachMovingEntity` が `this.map.town.falling` の各破片にも `fn` を呼ぶ

- [ ] **Step 1: 失敗するテストを書く**

`tests/town-wiring.test.js`:

```js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { TOWN_BLAST_RADIUS_K, BLOCK_EMPTY, BLOCK_INDESTRUCTIBLE } from '../src/js/utils/Constants.js';
import { Town } from '../src/js/world/town/Town.js';
import { SpawnEffects } from '../src/js/systems/SpawnEffects.js';
import { fakeCanvas, block } from './helpers/town-fixtures.js';

before(() => {
    const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

test('blast: 半径 K×√size の中の建物を欠かせる。届かない建物は欠けない', () => {
    const town = new Town([block(0, 0, 64, 64), block(300, 0, 32, 32)], { createCanvas: fakeCanvas });
    const [near, far] = town.buildings;
    town.blast(80, 32, 150);                 // 半径 ≒ 40 → 塔の右端から 16px 内側まで
    assert.ok(near.remaining < near.total);
    assert.equal(far.remaining, far.total);
    const r = TOWN_BLAST_RADIUS_K * Math.sqrt(150);
    assert.ok(Math.abs(r - 40.4) < 0.1);
});

test('onBlockDestroyed: その岩に支えられていた建物は、支えを失って丸ごと落ちる', () => {
    let rock = true;
    const town = new Town([block(0, 0, 16, 68)], { createCanvas: fakeCanvas, isSolidTile: (r) => r === 4 && rock });
    rock = false;
    town.onBlockDestroyed(4, 0);
    assert.equal(town.falling.length, 1);
    assert.equal(town.buildings[0].remaining, 0);
});

test('onBlockDestroyed: 支えに関係ない岩なら何も起きない', () => {
    const town = new Town([block(0, 0, 16, 68)], { createCanvas: fakeCanvas, isSolidTile: (r) => r === 4 });
    town.onBlockDestroyed(20, 20);
    assert.equal(town.falling.length, 0);
});

test('spawnExplosion を通った爆発は町に届く（粒の数をそのまま size として渡す）', () => {
    const calls = [];
    const game = {
        particles: [], landmines: [],
        map: { town: { blast: (...a) => calls.push(a) } },
    };
    SpawnEffects.spawnExplosion.call(game, 10, 20, 36);
    assert.deepEqual(calls, [[10, 20, 36]]);
});

test('町の無い面の spawnExplosion は何もしない（map も town も無くてよい）', () => {
    SpawnEffects.spawnExplosion.call({ particles: [], landmines: [], map: { town: null } }, 0, 0, 4);
    SpawnEffects.spawnExplosion.call({ particles: [], landmines: [] }, 0, 0, 4);
});

test('崩壊と砕けた破片の粒は spawnExplosion を通らない（town.blast に戻って連鎖しない）', () => {
    const town = new Town([block(0, 0, 32, 68)], { createCanvas: fakeCanvas, isSolidTile: (r) => r >= 4 });
    let blasts = 0;
    const realBlast = town.blast.bind(town);
    town.blast = (...a) => { blasts++; realBlast(...a); };
    const game = { particles: [], projectiles: [], camera: { x: 0, y: 0 }, canvas: { width: 800, height: 600 },
        spawnExplosion: () => { throw new Error('spawnExplosion を呼んだ'); } };
    // ミサイル1発（半径約20px）を中ほどに: 上が落ち、残りが4割を切って崩壊する
    town.blast(16, 40, 36);
    for (let t = 0; t < 200; t++) town.update(game);
    assert.equal(blasts, 1);
    assert.ok(town.buildings[0].collapsed);
    assert.equal(town.falling.length, 0, '落ちた破片は砕け終わっている');
    assert.ok(game.particles.length > 0);
});

test('Map.damageBlock で岩が壊れると、町に知らせる（壊れなかったときは知らせない）', async () => {
    const { Map } = await import('../src/js/world/Map.js');
    const map = new Map({ rng: new SeededRNG(11) }, 2);
    const seen = [];
    map.town = { onBlockDestroyed: (r, c) => seen.push([r, c]) };
    // 壊せる岩を1つ探す
    let target = null;
    for (let r = 1; r < map.rows - 1 && !target; r++) {
        for (let c = 1; c < map.cols - 1 && !target; c++) {
            const v = map.grid[r][c];
            if (v !== BLOCK_EMPTY && v !== BLOCK_INDESTRUCTIBLE) target = [r, c];
        }
    }
    assert.ok(target);
    const [r, c] = target;
    const hp = map.blockHP[r][c];
    if (hp > 1) { map.damageBlock(r, c, 1); assert.deepEqual(seen, []); }
    map.damageBlock(r, c, 999);
    assert.deepEqual(seen, [[r, c]]);
});

test('3面の Map の町は、岩が壊れたときに本物の支えで落ちる（Map の isSolid を見ている）', async () => {
    const { Map } = await import('../src/js/world/Map.js');
    const map = new Map({ rng: new SeededRNG(11) }, 2);
    // 支えの岩が全部壊せる岩の、床の建物を選び、支えの岩を全部壊す
    const tilesOf = (v) => [...new Set(v.anchors.map((a) => `${a.r},${a.c}`))].map((k) => k.split(',').map(Number));
    const b = map.town.buildings.find((v) => v.site === 'floor' && v.anchors.length > 0
        && tilesOf(v).every(([r, c]) => map.grid[r][c] !== BLOCK_INDESTRUCTIBLE));
    assert.ok(b, '支えを全部壊せる建物が無い');
    for (const [r, c] of tilesOf(b)) map.damageBlock(r, c, 9999);
    assert.ok(tilesOf(b).every(([r, c]) => !map.isSolid(r, c)));
    assert.equal(b.remaining, 0, '支えを全部失った建物は丸ごと落ちる');
    assert.ok(map.town.falling.some((p) => p.sourceId === b.id));
});
```

`tests/town-draw-wiring.test.js` に足す（`Game._simulationTick` と `_forEachMovingEntity` を本物のまま呼ぶ）:

```js
test('町は map.update() の直後に、Game を渡して更新する', () => {
    const order = [];
    const noop = () => {};
    const g = Object.create(Game);
    Object.assign(g, {
        _snapshotPrevPositions: noop, _updateCarrier: noop, _updatePlayer: noop, _updateDeathHold: noop,
        _updateCamera: noop, _updateAndPrune: (list) => { if (list === g.enemies) order.push('enemies'); },
        _updateLandmines: noop, barriers: [], _updateBarrierSound: noop, _updateAutoAim: noop,
        _updateOverdrive: noop, env: { update: noop }, _updateEnemyHoverSound: noop,
        _checkMissionClear: noop, collisionManager: { update: noop }, _updateProximityAlert: noop,
        projectiles: [], particles: [], smokeScreens: [], repairKits: [], autoAimUnits: [], missileKits: [], enemies: [],
        map: { update: () => order.push('map'), town: { update: (game) => order.push(game === g ? 'town' : 'town(違う game)') } },
    });
    Game._simulationTick.call(g);
    assert.deepEqual(order, ['map', 'town', 'enemies']);
});

test('落ちる破片も描画補間に載る', () => {
    const piece = { x: 1, y: 2 };
    const seen = [];
    const g = {
        player: null, carrier: null, enemies: [], projectiles: [], enemyBullets: [],
        repairKits: [], autoAimUnits: [], missileKits: [],
        map: { town: { falling: [piece] } },
    };
    Game._forEachMovingEntity.call(g, (e) => seen.push(e));
    assert.deepEqual(seen, [piece]);
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npm test -- tests/town-wiring.test.js tests/town-draw-wiring.test.js`
Expected: FAIL（`town.blast is not a function`、`order` に `town` が無い、`seen` が空）

- [ ] **Step 3: 実装する**

`Town.js`: import の Constants に `TOWN_BLAST_RADIUS_K` を足す。コンストラクタの最後に支えの索引を作る:

```js
        // 岩のタイル → それに支えられている建物（岩が壊れたときに引く）
        this._anchorIndex = new Map();
        for (const b of this.buildings) {
            for (const a of b.anchors) {
                const key = `${a.r},${a.c}`;
                if (!this._anchorIndex.has(key)) this._anchorIndex.set(key, new Set());
                this._anchorIndex.get(key).add(b);
            }
        }
```

メソッドを足す:

```js
    /**
     * 爆発（spawnExplosion がすべての爆発で呼ぶ）。半径は粒の数から決める: K × √size
     * （マシンガンの着弾 4粒 → 約7px、ミサイル 36粒 → 約20px、グレネード 150粒 → 約40px）
     */
    blast(x, y, size) {
        const radius = TOWN_BLAST_RADIUS_K * Math.sqrt(size);
        for (const b of this.buildingsInCircle(x, y, radius)) this.chip(b, x, y, radius);
    }

    /** 岩のタイルが壊れた（Map.damageBlock の「壊れた」分岐から）。支えていた建物を確かめ直す */
    onBlockDestroyed(r, c) {
        const set = this._anchorIndex.get(`${r},${c}`);
        if (!set) return;
        for (const b of set) this._settle(b);
    }
```

`src/js/systems/SpawnEffects.js` の `spawnExplosion` の最後（地雷のループのあと）に足す:

```js
        // 3面の町（map.town）。ミサイル・グレネード・機体の破壊・地雷・基地の爆発が全部ここを通る。
        // 町自身の崩壊の粒はここを通さない（通すと崩壊が隣を崩す連鎖が止まらなくなる）
        const town = this.map && this.map.town;
        if (town) town.blast(x, y, size);
```

`src/js/world/Map.js` の `damageBlock` の「壊れた」分岐で、`env.renderer.onBlockDestroyed` の呼び出しの直後に足す:

```js
            // 3面の町。支えの岩が壊れた建物は、支えを失った部分が落ちる
            if (this.town) this.town.onBlockDestroyed(r, c);
```

`src/js/main.js`: `_simulationTick` の `this.map.update();` の直後に:

```js
        // 3面の町（弾の当たり・落ちる破片・粒）。地形の更新のあと、敵の更新の前
        if (this.map.town) this.map.town.update(this);
```

`_forEachMovingEntity` の最後に:

```js
        // 3面の町の落ちる破片。補間しないと、カメラに対してかくついて落ちる
        if (this.map && this.map.town) for (const p of this.map.town.falling) fn(p);
```

**main.js のステージ手順**（作業ツリーの `debugStartMission: 2` をコミットに入れない）:

```bash
S=<scratchpad>
git show HEAD:src/js/main.js > $S/main-head.js
python3 - $S/main-head.js <<'EOF'
import sys
p = sys.argv[1]; s = open(p).read()
a = "        this.map.update();\n"
assert s.count(a) == 1
s = s.replace(a, a + "        // 3面の町（弾の当たり・落ちる破片・粒）。地形の更新のあと、敵の更新の前\n        if (this.map.town) this.map.town.update(this);\n")
b = "        for (const k of this.missileKits) fn(k);\n    },\n"
assert s.count(b) == 1
s = s.replace(b, "        for (const k of this.missileKits) fn(k);\n        // 3面の町の落ちる破片。補間しないと、カメラに対してかくついて落ちる\n        if (this.map && this.map.town) for (const p of this.map.town.falling) fn(p);\n    },\n")
open(p, 'w').write(s)
EOF
git update-index --cacheinfo 100644,$(git hash-object -w $S/main-head.js),src/js/main.js
git diff --cached src/js/main.js            # 足した4行だけが出ること
grep -n "debugStartMission:" src/js/main.js # 作業ツリーは 2 のまま
```

作業ツリーの `main.js` にも同じ2か所を Edit で入れる（ステージした内容と作業ツリーで、足した行が一致すること）。

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test -- tests/town-wiring.test.js tests/town-draw-wiring.test.js tests/MapDeterminism.test.js`
Expected: PASS

続けて全体: `npm test` → 既知の `面7` 1件以外が通ること。

ミューテーション（1つずつ）: SpawnEffects の `town.blast` の行を消す → 「spawnExplosion を通った爆発」が赤。Map の `onBlockDestroyed` の行を消す → 「damageBlock で岩が壊れると」が赤。`_flushEffects` の崩壊を `game.spawnExplosion(...)` に変える → 「spawnExplosion を通らない」が赤。

- [ ] **Step 5: コミット**

```bash
git add src/js/world/town/Town.js src/js/systems/SpawnEffects.js src/js/world/Map.js tests/town-wiring.test.js tests/town-draw-wiring.test.js
# main.js は Step 3 の手順でステージ済み
git commit -m "feat: 爆発と岩の破壊で町が壊れる（spawnExplosion・damageBlock・tick・描画補間につなぐ）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
grep -n "debugStartMission:" src/js/main.js   # 2 のまま
```

---

### Task 7: 厚い壁は弾・ミサイル・グレネードを止める（遮蔽）

**Files:**
- Modify: `src/js/utils/Constants.js`（`TOWN_PROJECTILE_IMPACT`。Task 1 の手順でステージ）
- Modify: `src/js/world/town/Town.js`（`sweepProjectile`、`update` で `game.projectiles` を見る）
- Modify: `src/js/systems/CollisionManager.js`
- Modify: `src/js/entities/Bullet.js` / `Missile.js` / `EnemyHomingMissile.js` / `EnemyCruiseMissile.js` / `Grenade.js`
- Test: `tests/town-projectiles.test.js`（新規）

**Interfaces:**
- Produces:
  - 定数 `TOWN_PROJECTILE_IMPACT = { bullet, missile, grenade, beam }`（各 `{ chip, thin, pierce? }`）
  - 弾のクラスの `townKind`（`'bullet' | 'missile' | 'grenade' | 'beam'`）と `onTownWall(x, y)`（厚い壁に当たったときの反応。岩に当たったときと同じ。ただし岩は壊さず、点も入れない）
  - `Town.sweepProjectile(p)`
  - Task 8 が `_sweepBeam(p, spec)` を足す（この Task の `sweepProjectile` は `spec.pierce` なら `_sweepBeam` に任せる。それまでは何もしない）

- [ ] **Step 1: 失敗するテストを書く**

`tests/town-projectiles.test.js`:

```js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { Town } from '../src/js/world/town/Town.js';
import { MAT_WOOD, SOLID } from '../src/js/world/town/chunks.js';
import { PlayerBullet } from '../src/js/entities/PlayerBullet.js';
import { EnemyBullet } from '../src/js/entities/EnemyBullet.js';
import { Missile } from '../src/js/entities/Missile.js';
import { EnemyHomingMissile } from '../src/js/entities/EnemyHomingMissile.js';
import { EnemyCruiseMissile } from '../src/js/entities/EnemyCruiseMissile.js';
import { Grenade } from '../src/js/entities/Grenade.js';
import { hasLineOfSight } from '../src/js/utils/Physics.js';
import { fakeCanvas, block } from './helpers/town-fixtures.js';

before(() => {
    const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

/** 岩の無い広い空間と、弾が呼ぶ game の最小限 */
function world() {
    const game = {
        particles: [], landmines: [], enemies: [], projectiles: [], enemyBullets: [],
        sparks: [], blasts: [],
        spawnSparks(x, y) { this.sparks.push([x, y]); },
        spawnExplosion(x, y, size) { this.blasts.push([x, y, size]); },
        addScore() { throw new Error('建物で点は入らない'); },
        camera: { x: 0, y: 0 }, canvas: { width: 800, height: 600 },
        player: null, carrier: null,
    };
    game.map = {
        width: 4000, height: 4000, rows: 250, cols: 250,
        isSolid: () => false, isSolidAtPixel: () => false,
        pixelToTile: (x, y) => ({ r: Math.floor(y / 16), c: Math.floor(x / 16) }),
        damageBlock: () => { throw new Error('岩は壊さない'); },
        destroyArea: () => 0,
        isWaterAtPixel: () => false,
    };
    return game;
}

/** 土の壁（厚い）の塔 x=200〜232 と、木の手すり（細い）x=100〜104 */
function town() {
    const rail = {
        site: 'ceiling', style: 'C', kind: 'lantern', x: 100, y: 0, w: 4, h: 200,
        parts: [{ x: 0, y: 0, w: 4, h: 200, color: '#4a3418', mat: MAT_WOOD, solid: false }],
    };
    return new Town([block(200, 0, 32, 200), rail], { createCanvas: fakeCanvas });
}

/** 弾を1 tick 進めて、町の当たりを見る（_simulationTick と同じ順: 位置の記録 → 更新 → 町） */
function tick(t, p) {
    p._prevX = p.x; p._prevY = p.y;
    p.update();
    t.sweepProjectile(p);
}

test('マシンガンの弾は厚い壁で消え、火花が出て、当たった所が欠ける', () => {
    const game = world(); const t = town(); game.map.town = t;
    const b = new PlayerBullet(game, 150, 100, 0);
    for (let i = 0; i < 60 && b.alive; i++) tick(t, b);
    assert.equal(b.alive, false);
    assert.ok(b.x >= 200 && b.x < 208, `止まった位置 ${b.x}`);
    assert.equal(game.sparks.length, 1);
    assert.ok(t.buildings[0].remaining < t.buildings[0].total);
});

test('敵の弾も同じに止まる（敵弾も遮蔽に当たる）', () => {
    const game = world(); const t = town();
    const b = new EnemyBullet(game, 300, 100, Math.PI);
    for (let i = 0; i < 60 && b.alive; i++) tick(t, b);
    assert.equal(b.alive, false);
    assert.ok(b.x > 224 && b.x <= 232, `${b.x}`);
});

test('細い部品は1回だけ欠かせ、弾は飛び続ける', () => {
    const game = world(); const t = town();
    const b = new PlayerBullet(game, 60, 100, 0);
    const rail = t.buildings[1];
    for (let i = 0; i < 6; i++) tick(t, b);
    assert.ok(b.x > 104 && b.alive, '手すりを抜けた');
    assert.ok(rail.remaining < rail.total);
    assert.equal(game.sparks.length, 0);
});

test('速い弾でも薄い壁（4px）をすり抜けない（前の位置から今の位置まで 4px 刻み）', () => {
    const game = world();
    const wall = new Town([block(200, 0, 4, 200)], { createCanvas: fakeCanvas });
    const b = new PlayerBullet(game, 150, 100, 0);
    b.vx = 40;   // 1 tick に 40px（どの弾よりも速い）
    for (let i = 0; i < 10 && b.alive; i++) tick(wall, b);
    assert.equal(b.alive, false);
    assert.ok(b.x >= 200 && b.x < 204);
});

test('撃った位置に重なる建物は、その弾では無視する。その先の別の建物では止まる', () => {
    const game = world();
    const t = new Town([block(0, 0, 64, 200), block(200, 0, 32, 200)], { createCanvas: fakeCanvas });
    // 発射位置 (20, 100) は1棟目の厚い壁の中（機体が建物の手前で撃った）
    const b = new PlayerBullet(game, 20, 100, 0);
    for (let i = 0; i < 60 && b.alive; i++) tick(t, b);
    assert.equal(t.buildings[0].remaining, t.buildings[0].total, '1棟目は無傷');
    assert.ok(b.x >= 200 && b.x < 208, '2棟目で止まる');
});

test('発射したその tick（前の位置がまだ無い）でも、目の前の壁で消えない', () => {
    const game = world();
    const t = new Town([block(0, 0, 64, 200)], { createCanvas: fakeCanvas });
    const b = new PlayerBullet(game, 20, 100, 0);
    b.update();                 // 発射直後の tick: _prevX はまだ無い
    t.sweepProjectile(b);
    assert.equal(b.alive, true);
});

test('ミサイルは厚い壁で爆発する（岩は壊さず、点も入らない）', () => {
    for (const make of [
        (g) => new Missile(g, 150, 100, 0, true),
        (g) => new EnemyHomingMissile(g, 150, 100, 0),
    ]) {
        const game = world(); const t = town();
        const m = make(game);
        for (let i = 0; i < 80 && m.alive; i++) tick(t, m);
        assert.equal(m.alive, false);
        assert.equal(m.exploded, true);
        assert.ok(game.blasts.length >= 1);
        assert.ok(m.x >= 200 && m.x < 208);
    }
});

test('巡航ミサイルも厚い壁で爆発する', () => {
    const game = world(); const t = town();
    const m = new EnemyCruiseMissile(game, 150, 100, 0, []);
    for (let i = 0; i < 120 && m.alive; i++) tick(t, m);
    assert.equal(m.exploded, true);
    assert.ok(game.blasts.length >= 1);
});

test('グレネードは厚い壁に当たった所で爆発し、細い部品はすり抜ける（欠けもしない）', () => {
    const game = world(); const t = town();
    const g = new Grenade(game, 60, 100, 0, 12);
    g.lifetime = 9999;
    const rail = t.buildings[1];
    for (let i = 0; i < 80 && g.alive; i++) tick(t, g);
    assert.equal(rail.remaining, rail.total, '手すりは欠けない');
    assert.equal(g.alive, false);
    assert.ok(g.x >= 200 && g.x < 212, `${g.x}`);
    assert.ok(game.blasts.length >= 1);
});

test('town.update は自機側の弾（game.projectiles）を見る', () => {
    const game = world(); const t = town();
    const b = new PlayerBullet(game, 196, 100, 0);
    b._prevX = 196; b._prevY = 100;
    b.x = 204;
    game.projectiles.push(b);
    t.update(game);
    assert.equal(b.alive, false);
});

test('CollisionManager は敵の弾を更新した直後に町の当たりを見る（止まった弾は自機に当たらない）', async () => {
    const { CollisionManager } = await import('../src/js/systems/CollisionManager.js');
    const order = [];
    const bullet = { alive: true, x: 0, y: 0, update() { order.push('update'); } };
    const game = {
        enemyBullets: [bullet], projectiles: [], enemies: [], player: null, carrier: null,
        map: { town: { sweepProjectile: (p) => { order.push('town'); p.alive = false; } } },
    };
    const cm = new CollisionManager(game);
    cm._updateEnemyBullets();
    assert.deepEqual(order, ['update', 'town']);
    assert.equal(game.enemyBullets.length, 0);
});

test('敵の狙いは建物を見ない（建物越しでも見えている＝撃ってきて遮蔽を削る）', async () => {
    const { Map } = await import('../src/js/world/Map.js');
    const map = new Map({ rng: new SeededRNG(11) }, 2);
    let checked = 0;
    for (const b of map.town.buildings.filter((v) => v.site === 'floor')) {
        const y = b.y + b.height / 2;
        const x1 = b.x - 8, x2 = b.x + b.width + 8;
        // 岩をまたがない（タイルが全部空の）横線だけを使う
        let clear = true;
        for (let x = x1; x <= x2; x += 4) if (map.isSolidAtPixel(x, y)) { clear = false; break; }
        if (!clear) continue;
        // その線が建物の厚い壁を通ること（通らないなら確かめる意味が無い）
        let crosses = false;
        for (let x = x1; x <= x2; x += 4) {
            const k = map.town.cellAt(b, x, y);
            if (k >= 0 && (b.cells[k] & SOLID)) { crosses = true; break; }
        }
        if (!crosses) continue;
        assert.equal(hasLineOfSight(x1, y, x2, y, map), true);
        checked++;
    }
    assert.ok(checked > 0, '確かめられる建物が無い');
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npm test -- tests/town-projectiles.test.js`
Expected: FAIL（`t.sweepProjectile is not a function`）

- [ ] **Step 3: 実装する**

`Constants.js` の段2の節に足す（Task 1 の手順でステージ）:

```js
// 弾の種類ごとの、建物への当たり方（spec 2章の表）。弾のクラスが townKind でここの行を選ぶ。
//   chip:   当たった所を欠かせる半径（px）。ミサイル・グレネードの欠けは、爆発（blast）の側で大きく開く
//   thin:   細い部品（厚い壁の印の無いかけら）に当たったら 'chip'＝1棟1回欠かせて飛び続ける / 'pass'＝すり抜ける
//   pierce: 厚い壁も貫通する（反射ビーム。Task 8）
// 厚い壁で止まったときの反応は、弾ごとの onTownWall(x, y)（岩に当たったときと同じ。岩は壊さない）
export const TOWN_PROJECTILE_IMPACT = {
    bullet: { chip: 4, thin: 'chip' },
    missile: { chip: 4, thin: 'chip' },
    grenade: { chip: 0, thin: 'pass' },
    beam: { chip: 6, thin: 'chip', pierce: true },
};
// 弾の通り道を調べる刻み（px）。かけら 4px と同じにして、速い弾が薄い壁をすり抜けないように
export const TOWN_SWEEP_STEP = 4;
```

`Town.js`: Constants の import に `TOWN_PROJECTILE_IMPACT, TOWN_SWEEP_STEP` を、chunks の import に `SOLID` を足す。コンストラクタに:

```js
        // 弾ごとの覚え書き（発射位置で無視する建物・細い部品を欠かせた建物）。弾が消えれば一緒に消える
        this._projState = new WeakMap();
```

`update(game)` の先頭に:

```js
        // 自機側の弾（ミサイル・グレネード・マシンガン）。敵弾は CollisionManager が更新の直後に見る
        for (const p of game.projectiles) this.sweepProjectile(p);
```

メソッドを足す:

```js
    /**
     * 弾と建物の当たり。前の位置（tick の頭に記録した _prevX）から今の位置まで TOWN_SWEEP_STEP 刻みで
     * 調べる。厚い壁に当たったら当たった所を欠かせて p.onTownWall(x, y)。細い部品は 1棟1回欠かせて
     * 飛び続ける（表の thin）。
     * 撃った位置に重なる建物は、その弾では無視する。機体は建物の手前に重なって描かれるので、
     * 建物の前で撃つと撃った瞬間に目の前の壁で消えてしまう（遮蔽になるのは撃った者と的のあいだの建物）
     */
    sweepProjectile(p) {
        const spec = TOWN_PROJECTILE_IMPACT[p.townKind];
        if (!spec || !p.alive || p.exploded) return;
        if (spec.pierce) {
            if (this._sweepBeam) this._sweepBeam(p, spec);
            return;
        }
        // 発射したその tick は tick の頭の位置の記録が無い。1 tick 前の位置は x - vx で見積もる
        const x0 = p._prevX !== undefined ? p._prevX : p.x - (p.vx || 0);
        const y0 = p._prevY !== undefined ? p._prevY : p.y - (p.vy || 0);
        let st = this._projState.get(p);
        if (!st) {
            st = { ignore: new Set(this.buildingsAt(x0, y0).map((b) => b.id)), thin: new Set() };
            this._projState.set(p, st);
        }
        const n = Math.max(1, Math.ceil(Math.hypot(p.x - x0, p.y - y0) / TOWN_SWEEP_STEP));
        for (let s = 1; s <= n; s++) {
            const px = x0 + ((p.x - x0) * s) / n;
            const py = y0 + ((p.y - y0) * s) / n;
            for (const b of this.buildingsAt(px, py)) {
                if (st.ignore.has(b.id)) continue;
                const k = this.cellAt(b, px, py);
                if (k < 0 || !b.cells[k]) continue;
                if (b.cells[k] & SOLID) {
                    if (spec.chip > 0) this.chip(b, px, py, spec.chip);
                    p.onTownWall(px, py);
                    return;
                }
                if (spec.thin === 'chip' && !st.thin.has(b.id)) {
                    st.thin.add(b.id);
                    this.chip(b, px, py, spec.chip);
                }
            }
        }
    }
```

`src/js/systems/CollisionManager.js` の `_updateEnemyBullets` で `bullet.update();` の直後に:

```js
            // 3面の町の厚い壁（遮蔽）。自機・母艦との当たりより先に見る（壁で止まった弾は当たらない）
            const town = game.map && game.map.town;
            if (town && bullet.alive) town.sweepProjectile(bullet);
```

弾のクラス（各ファイルの `constructor` の最後に `townKind`、クラスの中に `onTownWall`）:

`Bullet.js`（自機・敵のマシンガン弾の共通）:

```js
        // 3面の町の当たり方（Constants の TOWN_PROJECTILE_IMPACT の行）
        this.townKind = 'bullet';
```

```js
    /** 町の厚い壁に当たった（Town.sweepProjectile）。消えるだけだとバグに見えるので必ず火花を出す */
    onTownWall(x, y) {
        this.x = x;
        this.y = y;
        this.alive = false;
        this.game.spawnSparks(x, y);
    }
```

`Missile.js` と `EnemyHomingMissile.js`（同じ形。どちらも岩に当たったときの分岐から `damageBlock` と加点を除いたもの）:

```js
        this.townKind = 'missile';
```

```js
    /** 町の厚い壁に当たった。岩に当たったときと同じく爆発する（岩は壊さず、点も入れない） */
    onTownWall(x, y) {
        this.x = x;
        this.y = y;
        playBlast(this.game, x, y, 'missileTerrain');
        this.exploded = true;
        this.alive = false;
    }
```

`EnemyCruiseMissile.js`:

```js
        this.townKind = 'missile';
```

```js
    /** 町の厚い壁に当たった。岩に当たったときと同じ _explode() */
    onTownWall(x, y) {
        this.x = x;
        this.y = y;
        this._explode();
    }
```

`Grenade.js`:

```js
        this.townKind = 'grenade';
```

```js
    /** 町の厚い壁に当たった。跳ね返らず、その場で爆発する（spec 2章） */
    onTownWall(x, y) {
        this.x = x;
        this.y = y;
        this._explode();
    }
```

（`Grenade` の `townKind` は `constructor` の `this.alive = true;` の近くに置く。巡航ミサイルの `_explode()` が `x, y` 以外を見ているなら、その値も壁の位置で正しいか読んで確かめる。）

（`EnemyHomingMissile` は `vx / vy` を持たず `angle / speed` で進む。発射した tick の見積もり `x - (vx || 0)` は今の位置になり、その tick の通り道は調べない（次の tick から調べる）。弾より遅いので 1 tick ぶんの抜けは壁の厚さ 4px を超えない。`_updateHoming` / `_avoidObstacles` が `game.player` などを読むなら、テストの `world()` に読まれるものを足す。）

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test -- tests/town-projectiles.test.js`
Expected: PASS 13/13

続けて全体: `npm test` → 既知の `面7` 1件以外が通ること（弾のクラスを触ったので、弾のテストが全部通ることを特に見る）。

ミューテーション（1つずつ）: `st.ignore.has(b.id)` の行を消す → 「撃った位置の建物」が赤。`Math.ceil(... / TOWN_SWEEP_STEP)` を `1` にする → 「速い弾」が赤。`!st.thin.has(b.id) &&` を外す → 「1回だけ」…テストは欠けたことしか見ていないので赤にならないはず。手すりの欠けたかけらの数が `chip 4px` 1回ぶん（多くても 4 かけら）以下であることを足して、赤くなるのを確かめる。CollisionManager の `sweepProjectile` の行を消す → 「更新した直後」が赤。`Bullet.onTownWall` の `spawnSparks` を消す → 火花のテストが赤。

- [ ] **Step 5: コミット**

```bash
git add src/js/world/town/Town.js src/js/systems/CollisionManager.js src/js/entities/Bullet.js src/js/entities/Missile.js src/js/entities/EnemyHomingMissile.js src/js/entities/EnemyCruiseMissile.js src/js/entities/Grenade.js tests/town-projectiles.test.js
# Constants.js は Task 1 の手順でステージ
git commit -m "feat: 町の厚い壁が弾・ミサイル・グレネードを止める（遮蔽。撃った位置の建物は無視）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 反射ビームは全部貫通し、通り道の建物を1棟1回ずつ欠かせる

**Files:**
- Modify: `src/js/entities/ReflectBeam.js`（`townKind = 'beam'`）
- Modify: `src/js/world/town/Town.js`（`_sweepBeam`）
- Test: `tests/town-projectiles.test.js`（足す）

**Interfaces:**
- Consumes: `TOWN_PROJECTILE_IMPACT.beam`、`sweepProjectile` の `pierce` の分岐（Task 7）、`ReflectBeam.segments()`
- Produces: `Town._sweepBeam(p, spec)`

- [ ] **Step 1: 失敗するテストを書く**

`tests/town-projectiles.test.js` に足す:

```js
test('反射ビームは厚い壁も貫通し、通り道の建物を1棟1回ずつ欠かせる', async () => {
    const { ReflectBeam } = await import('../src/js/entities/ReflectBeam.js');
    const game = world();
    const t = new Town([block(200, 0, 32, 200), block(400, 0, 32, 200)], { createCanvas: fakeCanvas });
    const beam = new ReflectBeam(game, 150, 100, 0);
    assert.equal(beam.townKind, 'beam');
    const lost = [0, 0];
    for (let i = 0; i < 200 && beam.alive; i++) {
        beam.update();
        const before = t.buildings.map((b) => b.remaining);
        t.sweepProjectile(beam);
        t.buildings.forEach((b, n) => { if (b.remaining < before[n]) lost[n]++; });
    }
    assert.deepEqual(lost, [1, 1], '2棟とも、欠けたのは1回ずつ');
});
```

（`world()` の `map` は岩が無く、ビームは盤面の外か寿命で止まる。`ReflectBeam` の `update()` が `game.map` の他のメソッドを呼ぶなら、`world()` にそのメソッドを足す。ビームが右へ 400px より先まで届く寿命があることを確かめ、届かないなら2棟目の位置を寿命の内側へ寄せる。）

- [ ] **Step 2: 失敗を確かめる**

Run: `npm test -- tests/town-projectiles.test.js`
Expected: FAIL（`beam.townKind` が undefined）

- [ ] **Step 3: 実装する**

`ReflectBeam.js` の `constructor` の `this.isReflectBeam = true;` の下に:

```js
        // 3面の町では全部貫通して、通り道の建物を1棟1回ずつ欠かせる（TOWN_PROJECTILE_IMPACT.beam）
        this.townKind = 'beam';
```

`Town.js` にメソッドを足す（Task 7 の `if (this._sweepBeam)` の確かめは、これで常に真になるので外して直接呼ぶ）:

```js
    /**
     * 反射ビーム。帯全体（描画・CollisionManager と同じ segments()）を TOWN_SWEEP_STEP 刻みで調べ、
     * かけらに触れた建物を1発につき1棟1回欠かせる。止まらない
     */
    _sweepBeam(p, spec) {
        let st = this._projState.get(p);
        if (!st) { st = { chipped: new Set() }; this._projState.set(p, st); }
        for (const sg of p.segments()) {
            const n = Math.max(1, Math.ceil(Math.hypot(sg.x2 - sg.x1, sg.y2 - sg.y1) / TOWN_SWEEP_STEP));
            for (let s = 0; s <= n; s++) {
                const px = sg.x1 + ((sg.x2 - sg.x1) * s) / n;
                const py = sg.y1 + ((sg.y2 - sg.y1) * s) / n;
                for (const b of this.buildingsAt(px, py)) {
                    if (st.chipped.has(b.id)) continue;
                    const k = this.cellAt(b, px, py);
                    if (k < 0 || !b.cells[k]) continue;
                    st.chipped.add(b.id);
                    this.chip(b, px, py, spec.chip);
                }
            }
        }
    }
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npm test -- tests/town-projectiles.test.js`
Expected: PASS 14/14

ミューテーション: `st.chipped.has(b.id)` の行を消す → `[1, 1]` が赤。`townKind` を消す → 赤。

- [ ] **Step 5: コミット**

```bash
git add src/js/entities/ReflectBeam.js src/js/world/town/Town.js tests/town-projectiles.test.js
git commit -m "feat: 反射ビームは町を貫通し、通り道の建物を1棟1回ずつ欠かせる

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 書き出しの道具で壊した後を見る・重さを測る・引き渡し

**Files:**
- Modify: `tools/lib/pixel-canvas.mjs`（`drawImage` の9引数、`rotate`）
- Modify: `tools/render-town-scene.mjs`（`--blast`、`--ticks`、`--stats` に壊す時間）

**Interfaces:**
- Consumes: `Town.blast` / `Town.update` / `Town.draw`

- [ ] **Step 1: PixelCanvas を本物の canvas の引数に合わせる**

`tools/lib/pixel-canvas.mjs` の `drawImage` を、本物の canvas と同じ3引数 `(img, dx, dy)` と9引数 `(img, sx, sy, sw, sh, dx, dy, dw, dh)` を受ける形にする（`dw, dh` は `sw, sh` と同じときだけ受け、違えば例外を投げる。町は拡大縮小して貼らないので、黙って誤った絵を作らないように）。今の独自の7引数の形は町の道具しか使っていないので置き換えてよい（`grep -rn "drawImage" tools/` で確かめる）。`rotate(a)` を足す: 落ちる破片だけが使う。道具の絵では回さずに貼る（`rotate` は何もしない）とコメントに書く。

- [ ] **Step 2: 壊した後を書き出せるようにする**

`tools/render-town-scene.mjs` に:
- `--blast x,y,size;x,y,size;...`（`;` 区切りで何発でも）: 町を作ったあとに `town.blast()` を順に呼ぶ
- `--ticks N`（既定 0）: そのあと `town.update(fakeGame)` を N 回（`fakeGame = { particles: [], projectiles: [], camera: null, canvas: null }`）。破片が落ちて瓦礫になるまで進められる
- `--stats` に `blastMs` を足す: 今週の3面で、床の建物の中心 50 か所にグレネード（size 150）を1発ずつ当て、`town.update` を 120 回回すまでの時間と、1発あたりの時間、`falling` の最大数

使い方の例をファイル冒頭のコメントに足す。

- [ ] **Step 3: 動かして目で見る**

```bash
node tools/render-town-scene.mjs --stats
node tools/render-town-scene.mjs --x <町の多い所> --y <> --w 800 --h 500 --scale 2 --out $S/before.png
node tools/render-town-scene.mjs --x <同じ> --y <> --w 800 --h 500 --scale 2 --blast "<塔の中ほど>,150" --ticks 0 --out $S/after0.png
node tools/render-town-scene.mjs --x <同じ> --y <> --w 800 --h 500 --scale 2 --blast "<塔の中ほど>,150" --ticks 120 --out $S/after120.png
```

Expected（Read で PNG を見る）: after0 で塔の中ほどに丸いぎざぎざの穴と焦げの縁。after120 で穴より上が消え（落ちた）、床に瓦礫の山。宙に浮いた画素が無い。数値は `blastMs` を記録する（1発あたり 1ms を超えるなら、どこが重いかを測ってから引き渡しの説明に書く。直すのは実機の数字を見てから）。

- [ ] **Step 4: 全体のテストと決定性**

Run: `npm test`
Expected: 既知の `面7` 1件以外が通る。`tests/MapDeterminism.test.js` が通る（町は `game.rng` を消費しない）。

- [ ] **Step 5: コミット**

```bash
git add tools/lib/pixel-canvas.mjs tools/render-town-scene.mjs
git commit -m "tools: 町を壊した後を PNG に書き出す・壊す時間を測る

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
grep -n "debugStartMission:" src/js/main.js   # 2 のまま
```

- [ ] **Step 6: 引き渡し（実機の確認はユーザー）**

確認ポイントと定数の対応表を渡す。ハードリロード（Cmd+Shift+R）が要ることだけ伝える。

| 確認ポイント | 調整する定数（`Constants.js`） |
|---|---|
| 爆発で開く穴の大きさ | `TOWN_BLAST_RADIUS_K`（3.3） |
| マシンガン・ミサイルの弾痕の大きさ | `TOWN_PROJECTILE_IMPACT` の `chip` |
| 穴の縁のぎざぎざ | `TOWN_CHIP_JAGGED`（3） |
| どれくらい壊すと崩壊するか | `TOWN_COLLAPSE_FRACTION`（0.4） |
| 崩壊で残る土台の高さ | `TOWN_RUIN_DEPTH`（3 ＝ 12px） |
| 落ちる速さ・回り方・横流れ | `TOWN_FALL_GRAVITY` / `_MAX_SPEED` / `_SPIN_MAX` / `_DRIFT_MAX` |
| 落ちた破片が下の建物を削る量 | `TOWN_FALL_CHIP_RADIUS`（6） |
| 同時に落ちる破片の数 | `TOWN_FALLING_MAX`（24） |
| 崩壊・砕けたときの粒の量 | `TOWN_COLLAPSE_PARTICLES` / `TOWN_SHATTER_PARTICLES` |
| 瓦礫の山の高さ | `TOWN_RUBBLE_MAX_H`（10） |
| 焦げの濃さ | `palette.js` の `TOWN_CHAR_EDGE` / `TOWN_RUIN_SHADE` |
| 細い部品で弾が止まらない・止まる | `TOWN_PROJECTILE_IMPACT` の `thin` |

見てほしい遊び心地: 建物の陰に隠れたとき敵弾が止まるか、隠れているあいだに遮蔽が削れていく速さ、建物の前で撃った弾が目の前で消えないか、重く感じないか（大きな爆発で何棟も崩れたとき）。
