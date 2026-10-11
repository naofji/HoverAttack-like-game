# 3面の町並み 段3b（爆発物と誘爆）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 町の床に、見て分かる爆発物（C: ドラム缶・ダイナマイトの木箱・ガスボンベ、A: 油壺の倉）を建物 8 棟に1つくらい置く。弾・爆発・落ちる破片で欠けたら爆発し、火が届いたら少し遅れて爆発し、落ちて地面に当たったら爆発する。爆発は地雷と同じ処理で敵・自機・母艦にダメージを与え、町を欠かせて火をつけ、爆風の中の別の爆発物を 8〜15 フレーム遅れで誘爆させる。岩は壊さない。1秒 6 回を超えた分は消さずに後ろへずらす。

**Architecture:** 爆発物は「材料が爆発物のかけらだけでできた建物」で、段2の支え・落下・欠けの仕組みにそのまま乗る（spec 3b章「爆発物は1棟の建物と同じ作り」）。誘爆の順番待ち・上限・爆発そのものは新しい `world/town/explosives.js` の `ExplosiveSystem` が持つ（spec のファイル構成）。Town は `this.explosives` を1つ持ち、欠け（`chip`）・火がつく（`FireSystem.ignite`）・破片が砕ける（`_shatter`）の3か所で `trigger` を呼ぶだけ。爆発は `Town.update(game)` の中で、画面の近くなら `playBlast(game, …, 'townExplosive')`（→ `spawnExplosion` → `town.blast`・地雷の誘爆・爆発音）、画面の外なら `town.blast` と地雷の誘爆だけを呼ぶ。機体へのダメージは `Landmine.detonate()` の範囲ダメージを `utils/blastDamage.js` に切り出して共有する。置き場所は `generateTown` の最後に、建物とは**別の派生乱数**で足す（今の町並みは1棟も変わらない）。

**Tech Stack:** バニラ ES modules、canvas 2D、`node --test`。

**Spec:** `docs/superpowers/specs/2026-10-11-stage3-town-design.md`（3b章「爆発物と誘爆」、1章「色」、テストの表の「爆発物」）

**範囲:** spec の段3bだけ。音（段4）は入れない。爆発物の爆発の音は今の `playExplosion` がそのまま鳴る（spec 4章「新しい音は作らない」）。

## Global Constraints

- `git add -A` / `git add .` は使わない。変更したファイルを明示して add する
- `src/js/main.js` の `debugStartMission: 2` と、`src/js/utils/Constants.js` のユーザーの IDE 自動整形（町と関係ない行）は**未コミットのまま残す**。`git checkout` / `restore` / `stash` / `reset` を打たない。Constants.js は「町の節だけを HEAD に差し込んでステージする」手順（下）でコミットする。**この段では main.js を触らない**
- 一時的にわざと壊す確認は、控えのファイルを作ってから書き換え、控えから戻す
- コメントは日本語で「なぜそうしたか」。数値には根拠
- 調整用の数値は `Constants.js` の `TOWN_*`。色（描画専用）は `world/town/palette.js`
- **生成中に `game.rng` を消費しない。** 爆発物の置き場所は、Map が作る派生ストリーム（`explosiveRng`）だけを使う。建物を並べる `rng` も使わない（使うと、ユーザーが実機で見て決めた町並みが週ごとに全部入れ替わる）
- 誘爆の遅れ（8〜15 フレーム）は Town の `random`（既定 `Math.random`）。戦闘中の出来事なので週次の決定性の外（spec 3章「乱数」と同じ）
- 時間は**シミュレーションのフレーム数**（60 フレーム＝1秒）
- **爆発物は岩を壊さない**（spec 3b章。`map.destroyArea` / `damageBlock` を呼ばない）
- 粒・閃光・爆発音は画面の中かそのすぐ外（`VIEW_CULL_MARGIN`）だけ。爆発・ダメージ・町の欠け・誘爆は画面の外でも同じに起きる
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

段3bの定数の節は、段3の節の末尾（`TOWN_EMBER_SMOKE_EVERY` の行のあと＝ファイルの末尾）に `// --- 3面の町並み 段3b（爆発物と誘爆）---` で始める。

## この計画で決めたこと（spec が決めていない所）

- **置くのは床の岩の上だけ。** spec の「足場の上・高床の下」のうち、足場の上には置かない。支えは岩だけという段2の規則のままだと、足場の上の爆発物は最初から支えが無く、面に入った瞬間に落ちる。高床の小屋の脇（柱のそば）には置ける
- **爆発物は1棟まるごと材料が爆発物。** 油壺の倉も、屋根と柱まで爆発物のかけらにする（倉の一部だけ爆発物にすると、建物単位の「爆発した」が決められない）
- **爆風から誘爆するときは、いつも 8〜15 フレーム遅れる。** 自機のグレネードの爆風で欠けたドラム缶も遅れて爆発する（spec の「爆風の中の別の爆発物」を、どの爆発の爆風でも同じに扱う）。弾と落ちる破片で欠けたときは、その tick のうちに爆発する
- **誘爆の届く範囲は、機体へのダメージと同じ半径（`TOWN_EXPLOSIVE_RADIUS` 50px）。** 町を欠かせる半径（粒 80 で約 30px）より広い。爆発物は建物 8 棟に1つしかないので、30px では隣の爆発物にほとんど届かない。自機に届く爆風が隣のドラム缶に届かないのも不自然
- **爆発した爆発物は、残ったかけらを全部消す（崩壊の粒は出さない）。** 爆発そのものが演出なので、崩壊の閃光を重ねない。瓦礫も残さない
- **落ちて砕けた爆発物は、砕けた場所で爆発する。** 元の建物の位置ではない。まだ落ちている途中に時間切れ（火が届いたあとの遅れ）になったら、落ちている破片の位置で爆発する

## Review Focus

1. **1つの爆発物に引き金が重なる**（弾で欠けて順番待ち中に火が届く・支えを失って落ちる・爆風を浴びる）: 爆発は必ず1回。前の位置に「幽霊の爆発」が起きない（Task 3・4 にテスト）
2. **2つの爆発物が互いの爆風の中**: A が B を誘爆し、B の爆風が A をもう一度爆発させない。大きな塊でも上限で爆発が消えない（全部いつかは爆発する）（Task 4 にテスト）
3. **画面の外の爆発**: ダメージ・町の欠け・誘爆は起き、粒・閃光・爆発音は出ない（`spawnExplosion` を呼ばない）（Task 4 にテスト）
4. **爆風で爆発物がまるごと消し飛ぶ**（グレネードの 40px の中にドラム缶が丸ごと入る）: かけらが1つも残らなくても、その位置で爆発する（Task 4 にテスト）
5. **爆発物を置いても今の町並みが変わらない**: 同じ週の建物（位置・形・かけら）は段3と同じで、爆発物はその後ろに足されるだけ。どの爆発物も床の岩に支えられている（Task 2 にテスト。支えは `MapDeterminism` の「every building in the town is held by rock」も見る）

---

## ファイル構成

| ファイル | 役割 | Task |
|---|---|---|
| `src/js/utils/blastDamage.js` | 新規: 爆心から半径の中の自機・母艦・敵にダメージとノックバック、地雷は誘爆（`Landmine.detonate()` から切り出し） | 1 |
| `src/js/entities/Landmine.js` | 変更: 範囲ダメージを `applyBlastDamage` で | 1 |
| `src/js/world/town/mining.js` | 変更: `buildMiningExplosive`（ドラム缶・木箱・ボンベ） | 2 |
| `src/js/world/town/adobe.js` | 変更: `buildOilJarStore`（油壺の倉） | 2 |
| `src/js/world/town/palette.js` | 変更: `TOWN_EXPLOSIVE_COLORS` | 2 |
| `src/js/world/town/generate.js` | 変更: `explosiveRng` を受け取り、床の建物の脇に爆発物を足す | 2 |
| `src/js/world/Map.js` | 変更: `_buildTownSpecs` が `explosiveRng` を渡す | 2 |
| `src/js/world/town/explosives.js` | 新規: `ExplosiveSystem`（順番待ち・遅れ・上限・爆発・誘爆・ダメージ） | 3・4 |
| `src/js/world/town/Town.js` | 変更: 建物の `explosive` / `exploded`、`this.explosives`、`chip` の `cause`、`consume`、`_shatter` と `update` から爆発物へ | 3・4 |
| `src/js/world/town/fire.js` | 変更: 爆発物に火がついたら遅れて爆発 | 4 |
| `src/js/entities/destruction.js` | 変更: `BLAST_PROFILES.townExplosive`、`detonateNearbyMines` を export | 3 |
| `src/js/utils/Constants.js` | 変更: 段3bの定数 | 2〜4 |
| `tools/render-town-scene.mjs` | 変更: 爆発物を数える・位置を出す・誘爆の重さを測る。爆発が `spawnExplosion` を通るように fakeGame に `SpawnEffects` を混ぜる | 5 |

---

### Task 1: 範囲ダメージを地雷から切り出す

**Files:**
- Create: `src/js/utils/blastDamage.js`
- Modify: `src/js/entities/Landmine.js:59-91`（`detonate()` の `applyAoE`）
- Test: `tests/blast-damage.test.js`（新規）

**Interfaces:**
- Produces: `applyBlastDamage(game, cx, cy, { radius, damage, knockVy, knockVx, source = null })` — `game.player`・`game.carrier`・`game.enemies`・`game.landmines` の順に、中心が `radius` 以内の相手へ。`takeDamage` を持つ相手は `recordHit` → `takeDamage(damage)` → `applyKnockback`。持たずに `detonate` を持つ相手（地雷）は `detonate()`。`source` 自身と `alive` でない相手は飛ばす。配列が無ければ飛ばす

- [ ] **Step 1: 失敗するテストを書く**

`tests/blast-damage.test.js`:

```js
// 爆心からの範囲ダメージ（utils/blastDamage.js）。地雷と町の爆発物が同じ処理を使う（spec 3b章）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyBlastDamage } from '../src/js/utils/blastDamage.js';

/** 中心が (cx, cy) の 16px 角の機体。受けたダメージを記録する */
function unit(cx, cy) {
    return {
        x: cx - 8, y: cy - 8, width: 16, height: 16, alive: true, vx: 0, vy: 0, hits: [],
        takeDamage(n) { this.hits.push(n); },
    };
}

const OPTS = { radius: 50, damage: 25, knockVy: -6, knockVx: 3 };

test('半径の中の自機・母艦・敵にダメージ、外には無し', () => {
    const game = { player: unit(30, 0), carrier: unit(80, 0), enemies: [unit(0, 40), unit(-60, 0)], landmines: [] };
    applyBlastDamage(game, 0, 0, OPTS);
    assert.deepEqual(game.player.hits, [25]);
    assert.deepEqual(game.carrier.hits, []);
    assert.deepEqual(game.enemies[0].hits, [25]);
    assert.deepEqual(game.enemies[1].hits, []);
});

test('当たった相手は爆心から離れる向きに飛ばされ、被弾位置が爆心になる', () => {
    const left = unit(-20, 0), right = unit(20, 0);
    applyBlastDamage({ enemies: [left, right] }, 0, 0, OPTS);
    assert.equal(left.vx, -3);
    assert.equal(right.vx, 3);
    assert.equal(right.vy, -6);
    assert.equal(right.lastHitX, 0);
    assert.equal(right.lastHitY, 0);
});

test('地雷は誘爆させる。source 自身と、倒れた相手は飛ばす', () => {
    const fired = [];
    const mine = { x: -6, y: -3, width: 12, height: 6, alive: true, detonate() { fired.push('mine'); } };
    const self = { ...mine, detonate() { fired.push('self'); } };
    const dead = unit(10, 0);
    dead.alive = false;
    applyBlastDamage({ player: dead, enemies: [], landmines: [mine, self] }, 0, 0, { ...OPTS, source: self });
    assert.deepEqual(fired, ['mine']);
    assert.deepEqual(dead.hits, []);
});

test('game に母艦・敵・地雷の配列が無くても落ちない', () => {
    applyBlastDamage({ player: null }, 0, 0, OPTS);
});
```

- [ ] **Step 2: 走らせて失敗を見る**

Run: `npm test -- tests/blast-damage.test.js`
Expected: FAIL（`Cannot find module .../blastDamage.js`）

- [ ] **Step 3: 実装する**

`src/js/utils/blastDamage.js`:

```js
// ============================================
// blastDamage - 爆心からの範囲ダメージ
// ============================================
//
// 地雷（Landmine.detonate）にあったものを切り出した。3面の町の爆発物も同じ処理で
// 敵・自機・母艦の全員にダメージを与える（spec 2026-10-11-stage3-town-design.md 3b章
// 「地雷と同じ扱い」）。当たる順・距離の測り方（相手の中心まで）・ノックバックは地雷のまま。

import { applyKnockback } from './Knockback.js';
import { recordHit } from './hitPoint.js';

/**
 * @param {object} game player / carrier / enemies / landmines を持つ（無いものは飛ばす）
 * @param {number} cx 爆心
 * @param {number} cy
 * @param {{radius:number, damage:number, knockVy:number, knockVx:number, source?:object}} opts
 *   source は爆発したもの自身（地雷が自分を誘爆させないように）
 */
export function applyBlastDamage(game, cx, cy, { radius, damage, knockVy, knockVx, source = null }) {
    const hit = (entity) => {
        if (!entity || !entity.alive || entity === source) return;
        const dx = entity.x + entity.width / 2 - cx;
        const dy = entity.y + entity.height / 2 - cy;
        if (Math.sqrt(dx * dx + dy * dy) > radius) return;
        if (typeof entity.takeDamage === 'function') {
            recordHit(entity, cx, cy);
            entity.takeDamage(damage);
            applyKnockback(entity, dx, knockVy, knockVx);
        } else if (typeof entity.detonate === 'function') {
            entity.detonate();   // 地雷の誘爆
        }
    };
    hit(game.player);
    hit(game.carrier);
    for (const e of game.enemies || []) hit(e);
    for (const m of game.landmines || []) hit(m);
}
```

`src/js/entities/Landmine.js` の `detonate()` の `applyAoE` の定義と4行の呼び出しを、次の1呼び出しに置き換える（`applyKnockback` と `recordHit` の import は使わなくなるので消し、`applyBlastDamage` を import する）:

```js
        applyBlastDamage(this.game, cx, cy, {
            radius: LANDMINE_BLAST_RADIUS, damage: LANDMINE_DAMAGE,
            knockVy: LANDMINE_KNOCKBACK_VY, knockVx: LANDMINE_KNOCKBACK_VX, source: this,
        });
```

- [ ] **Step 4: 走らせて通るのを見る（地雷の既存のテストも）**

Run: `npm test -- tests/blast-damage.test.js tests/landmine-trigger.test.js tests/explosion-knockback.test.js`
Expected: PASS（全部）

- [ ] **Step 5: わざと壊して赤くなるか確かめる**

控えを取ってから、`blastDamage.js` の `> radius` を `> radius * 2` に変える → 「半径の中の…外には無し」が赤くなる。控えから戻す。`entity === source` の判定を消す → 「地雷は誘爆させる」が赤くなる。控えから戻す。

- [ ] **Step 6: 全テストを走らせてコミット**

Run: `npm test > $S/t1.log 2>&1; tail -15 $S/t1.log`
Expected: 既知の `湧き位置は重複しない` 以外が全部通る

```bash
git add src/js/utils/blastDamage.js src/js/entities/Landmine.js tests/blast-damage.test.js
git commit -m "refactor: 地雷の範囲ダメージを utils/blastDamage.js に切り出す（町の爆発物と共有するため）"
```

---

### Task 2: 爆発物の絵と置き場所

**Files:**
- Modify: `src/js/world/town/palette.js`（末尾）
- Modify: `src/js/world/town/mining.js`（末尾に `buildMiningExplosive`）
- Modify: `src/js/world/town/adobe.js`（末尾に `buildOilJarStore`）
- Modify: `src/js/world/town/generate.js`（`generateTown` の引数と末尾、新しい `placeExplosives` / `onBareFloor`）
- Modify: `src/js/world/Map.js:341-353`（`_buildTownSpecs`）
- Modify: `src/js/utils/Constants.js`（段3bの節を新しく始める）
- Test: `tests/town-explosive-shapes.test.js`（新規）、`tests/town-explosive-placement.test.js`（新規）、`tests/town-palette.test.js`（追加）

**Interfaces:**
- Consumes: `MAT_EXPLOSIVE`（`chunks.js`、値 4。段1からある）、`rect` / `pick` / `step4`（`shapes.js`）
- Produces:
  - `TOWN_EXPLOSIVE_EVERY`（Constants）
  - `TOWN_EXPLOSIVE_COLORS`（palette）: `{ drum, drumBand, drumRim, crateMark, crateMarkInner, gas, gasBand, gasCap, jar, jarSeal }`
  - `buildMiningExplosive(rng) → {kind: 'drum'|'crate'|'gas', w, h, parts}`、`buildOilJarStore(rng) → {kind: 'oiljars', w, h, parts}`。どれも下端の 4px（`TOWN_FOUNDATION_SINK`）が床の岩に埋まる高さで返す。部品は全部 `MAT_EXPLOSIVE`・厚い壁
  - `generateTown({..., explosiveRng = null})`: `explosiveRng` があれば、建物の設計図の**後ろに**爆発物の設計図（`site: 'floor'`、`style` は脇の建物と同じ）を足す。無ければ今と同じ
  - Map: `explosiveRng: new SeededRNG((this.game.rng.state ^ 0xB0A3B5) >>> 0)`

- [ ] **Step 1: 失敗するテストを書く（絵）**

`tests/town-explosive-shapes.test.js`:

```js
// 爆発物の絵（mining.js / adobe.js）。見て爆発物と分かること、かけらが全部爆発物の厚い壁であること（spec 3b章）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { buildMiningExplosive } from '../src/js/world/town/mining.js';
import { buildOilJarStore } from '../src/js/world/town/adobe.js';
import { rasterizeParts, MAT_EXPLOSIVE, MAT_MASK, SOLID } from '../src/js/world/town/chunks.js';
import { TOWN_FOUNDATION_SINK } from '../src/js/utils/Constants.js';

function all() {
    const out = [];
    for (let seed = 1; seed <= 40; seed++) {
        out.push(buildMiningExplosive(new SeededRNG(seed)));
        out.push(buildOilJarStore(new SeededRNG(seed)));
    }
    return out;
}

test('3種の坑道の爆発物と油壺の倉が出る', () => {
    const kinds = new Set(all().map((b) => b.kind));
    assert.deepEqual([...kinds].sort(), ['crate', 'drum', 'gas', 'oiljars']);
});

test('どのかけらも材料は爆発物・厚い壁で、外接矩形は全部かけらで埋まる', () => {
    for (const b of all()) {
        assert.equal(b.w % 4, 0, `${b.kind} の幅 ${b.w}`);
        assert.equal(b.h % 4, 0, `${b.kind} の高さ ${b.h}`);
        const { cells } = rasterizeParts(b.parts, b.w, b.h);
        for (const v of cells) {
            assert.equal(v & MAT_MASK, MAT_EXPLOSIVE, `${b.kind}: 爆発物でないかけら ${v}`);
            assert.ok(v & SOLID, `${b.kind}: 細い部品のかけら`);
        }
    }
});

test('床の岩に埋まる 4px を除いても、自機の弾で狙える大きさが見えている', () => {
    for (const b of all()) {
        assert.ok(b.h - TOWN_FOUNDATION_SINK >= 8, `${b.kind} は ${b.h - TOWN_FOUNDATION_SINK}px しか見えない`);
        assert.ok(b.w >= 8, `${b.kind} の幅 ${b.w}`);
    }
});
```

`tests/town-palette.test.js` の末尾に追加（import に `TOWN_EXPLOSIVE_COLORS` を足す）:

```js
test('爆発物の色: 本体と印は赤く、どの色も弾の黄色から遠い', () => {
    const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const C = TOWN_EXPLOSIVE_COLORS;
    for (const name of ['drum', 'crateMark', 'gas', 'jarSeal']) {
        const [r, g, b] = rgb(C[name]);
        assert.ok(r > g * 1.6 && r > b * 1.6, `${name} ${C[name]} が赤く見えない`);
    }
    // 弾は #FFDD33 / #FFCC00 の丸。色の距離で離す（形は四角なので形でも見分けられる）
    for (const [name, hex] of Object.entries(C)) {
        for (const bullet of ['#FFDD33', '#FFCC00']) {
            const d = Math.hypot(...rgb(hex).map((v, i) => v - rgb(bullet)[i]));
            assert.ok(d > 150, `${name} ${hex} が弾 ${bullet} に近い (${d.toFixed(0)})`);
        }
    }
});
```

- [ ] **Step 2: 走らせて失敗を見る**

Run: `npm test -- tests/town-explosive-shapes.test.js tests/town-palette.test.js`
Expected: FAIL（`buildMiningExplosive` / `TOWN_EXPLOSIVE_COLORS` が export されていない）

- [ ] **Step 3: 絵を実装する**

`src/js/world/town/palette.js` の末尾:

```js
// 段3b: 爆発物の色。狙って撃てるよう「見て爆発物と分かる」赤にする（spec 3b章）。
// 建物の輝度の上限（地形の岩の 0.85 倍）からは外す。弾（明るい黄色の丸）とは色の距離で離し
// （tests/town-palette.test.js）、形も四角にする
export const TOWN_EXPLOSIVE_COLORS = {
    drum: '#b0301e',            // 燃料のドラム缶
    drumBand: '#5a1a10',        // ドラム缶のたが
    drumRim: '#d0503a',         // ドラム缶の縁（上の 1px）
    crateMark: '#c8281a',       // ダイナマイトの木箱の赤い印
    crateMarkInner: '#e8e0d0',  // 印の中の白
    gas: '#a82a22',             // ガスボンベ
    gasBand: '#e0d8c8',         // ボンベの白い帯
    gasCap: '#4f4a42',          // ボンベの口金
    jar: '#5a3a20',             // 油壺
    jarSeal: '#c8281a',         // 油壺の赤い封
};
```

`src/js/world/town/mining.js` の末尾（import に `MAT_EXPLOSIVE` と `TOWN_EXPLOSIVE_COLORS` を足す）:

```js
// 段3b: 坑道の町の爆発物（spec 3b章）。どの部品も材料は爆発物・厚い壁（1棟まるごと爆発物。
// 建物単位で「爆発した」を決めるため）。下の 4px は床の岩に埋まる（TOWN_FOUNDATION_SINK。支えのかけら）
const EXPLOSIVE_KINDS = ['drum', 'crate', 'gas'];

export function buildMiningExplosive(rng) {
    const C = TOWN_EXPLOSIVE_COLORS;
    const kind = pick(rng, EXPLOSIVE_KINDS);
    const parts = [];
    if (kind === 'drum') {   // 燃料のドラム缶 8x16（見えるのは 8x12）
        rect(parts, 0, 0, 8, 16, C.drum, MAT_EXPLOSIVE, true);
        rect(parts, 0, 0, 8, 1, C.drumRim);
        rect(parts, 0, 4, 8, 1, C.drumBand);
        rect(parts, 0, 9, 8, 1, C.drumBand);
        rect(parts, 6, 1, 2, 11, shade(C.drum));
        return { kind, w: 8, h: 16, parts };
    }
    if (kind === 'crate') {   // ダイナマイトの木箱 12x12（見えるのは 12x8）。赤い印に白
        const wood = pick(rng, BODY.wood);
        rect(parts, 0, 0, 12, 12, wood, MAT_EXPLOSIVE, true);
        rect(parts, 0, 0, 12, 1, DETAIL.beam);
        rect(parts, 0, 7, 12, 1, DETAIL.beam);
        rect(parts, 3, 2, 6, 4, C.crateMark);
        rect(parts, 5, 3, 2, 2, C.crateMarkInner);
        return { kind, w: 12, h: 12, parts };
    }
    // ガスボンベ2本 8x16（見えるのは 8x12）。肩を 1px 細くして丸く見せる
    rect(parts, 0, 0, 8, 16, null, MAT_EXPLOSIVE, true);
    for (const x of [0, 5]) {
        rect(parts, x + 1, 0, 1, 2, C.gasCap);
        rect(parts, x, 2, 3, 14, C.gas);
        rect(parts, x, 6, 3, 1, C.gasBand);
    }
    return { kind, w: 8, h: 16, parts };
}
```

`src/js/world/town/adobe.js` の末尾（import に `MAT_EXPLOSIVE` と `TOWN_EXPLOSIVE_COLORS` を足す）:

```js
/**
 * 段3b: 油壺の倉（spec 3b章）。土の平屋根を柱で支えた小さな倉に、赤い封の壺を並べる。
 * 屋根と柱まで全部爆発物のかけら（1棟まるごと爆発物）。20x20、下の 4px は床の岩に埋まる
 */
export function buildOilJarStore(rng) {
    const C = TOWN_EXPLOSIVE_COLORS;
    const parts = [];
    rect(parts, 0, 0, 20, 20, DETAIL.winDark, MAT_EXPLOSIVE, true);   // 倉の奥（暗い）
    rect(parts, 0, 0, 20, 4, pick(rng, BODY.adobe));                  // 平屋根
    rect(parts, 0, 4, 2, 16, DETAIL.beam);                            // 柱
    rect(parts, 18, 4, 2, 16, DETAIL.beam);
    for (const x of [3, 8, 13]) {
        rect(parts, x, 9, 4, 11, C.jar);
        rect(parts, x + 1, 8, 2, 1, C.jarSeal);
        rect(parts, x, 10, 4, 1, C.jarSeal);
    }
    return { kind: 'oiljars', w: 20, h: 20, parts };
}
```

- [ ] **Step 4: 走らせて通るのを見る**

Run: `npm test -- tests/town-explosive-shapes.test.js tests/town-palette.test.js`
Expected: PASS

- [ ] **Step 5: 失敗するテストを書く（置き場所）**

`tests/town-explosive-placement.test.js`:

```js
// 爆発物の置き場所（generate.js の explosiveRng）。spec 3b章「建物 8 棟に1つくらい」
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { TILE_SIZE as T, TOWN_FOUNDATION_SINK } from '../src/js/utils/Constants.js';
import { generateTown } from '../src/js/world/town/generate.js';

let GameMap;
before(async () => {
    const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
    ({ Map: GameMap } = await import('../src/js/world/Map.js'));
});

const EXPLOSIVE = new Set(['drum', 'crate', 'gas', 'oiljars']);
const maps = () => [1, 2, 3, 4, 5, 6].map((seed) => new GameMap({ rng: new SeededRNG(seed) }, 2));

test('explosiveRng を渡しても、建物の設計図は渡さないときと同じで、爆発物は後ろに足されるだけ', () => {
    for (const m of maps()) {
        const base = { grid: m.grid, rows: m.rows, cols: m.cols };
        const plain = generateTown({ ...base, rng: new SeededRNG(7) });
        const withX = generateTown({ ...base, rng: new SeededRNG(7), explosiveRng: new SeededRNG(9) });
        assert.deepEqual(withX.slice(0, plain.length), plain);
        assert.ok(withX.slice(plain.length).every((s) => EXPLOSIVE.has(s.kind)));
        assert.ok(plain.every((s) => !EXPLOSIVE.has(s.kind)), 'explosiveRng が無ければ爆発物は無い');
    }
});

test('床の建物 TOWN_EXPLOSIVE_EVERY 棟に1つくらい（6週の合計で 1/14〜1/5）', () => {
    let floors = 0, explosives = 0;
    for (const m of maps()) {
        const specs = m._buildTownSpecs();
        explosives += specs.filter((s) => EXPLOSIVE.has(s.kind)).length;
        floors += specs.filter((s) => s.site === 'floor' && !EXPLOSIVE.has(s.kind)).length;
    }
    const ratio = explosives / floors;
    assert.ok(ratio > 1 / 14 && ratio < 1 / 5, `${explosives} / ${floors} = ${ratio.toFixed(3)}`);
});

test('爆発物は床の岩の上: 下端の 4px が岩に入り、その上は空いている。爆発物どうしは重ならない', () => {
    for (const m of maps()) {
        const xs = m._buildTownSpecs().filter((s) => EXPLOSIVE.has(s.kind));
        for (const s of xs) {
            const ground = (s.y + s.h - TOWN_FOUNDATION_SINK) / T;
            assert.ok(Number.isInteger(ground), `${s.kind} の下端 ${s.y + s.h}`);
            for (let c = Math.floor(s.x / T); c <= Math.floor((s.x + s.w - 1) / T); c++) {
                assert.ok(m.isSolid(ground, c), `${s.kind} (${s.x},${s.y}) の下 r${ground} c${c} が空洞`);
                for (let r = Math.floor(s.y / T); r < ground; r++) {
                    assert.ok(!m.isSolid(r, c), `${s.kind} (${s.x},${s.y}) が岩 r${r} c${c} に埋もれる`);
                }
            }
        }
        for (let i = 0; i < xs.length; i++) {
            for (let j = i + 1; j < xs.length; j++) {
                const a = xs[i], b = xs[j];
                assert.ok(!(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h),
                    `${a.kind} と ${b.kind} が重なる`);
            }
        }
    }
});

test('Map の町には爆発物があり、建物として支えを持つ（作った町に explosive の印）', () => {
    const m = maps()[0];
    const xs = m.town.buildings.filter((b) => b.explosive);
    assert.ok(xs.length > 0);
    for (const b of xs) assert.ok(b.anchors.length > 0, `${b.kind} に支えが無い`);
});
```

最後のテストの `b.explosive` は Task 3 で Town が付ける印。**Task 2 では最後のテストだけ `test.todo` にしておき、Task 3 の Step 3 で `test` に戻す**（Task 2 のコミットを緑のまま保つため）。

- [ ] **Step 6: 走らせて失敗を見る**

Run: `npm test -- tests/town-explosive-placement.test.js`
Expected: 2つ目が FAIL（`0 / N = 0.000`）。1つ目と3つ目は爆発物が1つも無くても通ってしまう（空の一覧は何でも満たす）ので、実装の後に Step 9 の壊しで赤くなることを確かめる

- [ ] **Step 7: 置き場所を実装する**

`src/js/utils/Constants.js` の末尾:

```js
// --- 3面の町並み 段3b（爆発物と誘爆）---
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md（3b章）
export const TOWN_EXPLOSIVE_EVERY = 8;   // 床の建物何棟に1つ、脇に爆発物を置くか（spec の初期値）
```

`src/js/world/town/generate.js`: import に `TOWN_EXPLOSIVE_EVERY` と `buildOilJarStore`（adobe.js）・`buildMiningExplosive`（mining.js）を足す。`standsWell` の後ろに次の2つを足す:

```js
/** 下端の 4px（TOWN_FOUNDATION_SINK）が床の岩に入り、その上は全部空いている（段の岩に埋もれない・宙に浮かない） */
function onBareFloor(e, solid) {
    const ground = (e.y + e.h - TOWN_FOUNDATION_SINK) / T;
    for (let c = Math.floor(e.x / T); c <= Math.floor((e.x + e.w - 1) / T); c++) {
        if (!solid(ground, c)) return false;
        for (let r = Math.floor(e.y / T); r < ground; r++) if (solid(r, c)) return false;
    }
    return true;
}

/**
 * 段3b: 床の建物の脇に爆発物を置く（建物 TOWN_EXPLOSIVE_EVERY 棟に1つくらい。spec 3b章）。
 * 乱数は建物と別の派生ストリーム。建物を並べる rng を使うと、実機で見て決めた町並みが
 * 週ごとに全部入れ替わる（村の比率をユーザーが手で詰めた直後）。
 * 支えは岩だけなので、床の岩の上にしか置かない（足場の上の爆発物は、面に入った瞬間に落ちる）
 */
function placeExplosives(specs, rng, { solid, fits }) {
    const placed = [];
    for (const s of specs) {
        if (s.site !== 'floor' || rng.next() >= 1 / TOWN_EXPLOSIVE_EVERY) continue;
        const b = s.style === 'A' ? buildOilJarStore(rng) : buildMiningExplosive(rng);
        const right = rng.next() < 0.5;
        const gap = step4(rng, 0, 4);
        const foot0 = s.x + s.footX;
        const foot1 = foot0 + s.footW;
        const e = {
            site: 'floor', style: s.style, kind: b.kind,
            x: right ? foot1 + gap : foot0 - gap - b.w, y: s.y + s.h - b.h, w: b.w, h: b.h, parts: b.parts,
        };
        if (!fits(e) || placed.some((o) => overlaps(o, e)) || !onBareFloor(e, solid)) continue;
        placed.push(e);
    }
    return placed;
}
```

`generateTown` の引数に `explosiveRng = null` を足し（`quietZones = []` の後ろ）、JSDoc に「explosiveRng を渡せば、床の建物の脇に爆発物を足す（設計図の後ろに。前の建物は変わらない）」と書く。`return specs;` の直前に:

```js
    // --- 爆発物（段3b）。建物の後ろに足すので、描く順でも建物より手前に出る（狙って撃てるように）
    if (explosiveRng) specs.push(...placeExplosives(specs, explosiveRng, { solid, fits }));
```

`src/js/world/Map.js` の `_buildTownSpecs` の `rng:` の行の下に:

```js
            // 爆発物の置き場所（段3b）は別の派生ストリーム。建物の rng に混ぜると町並みが変わる
            explosiveRng: new SeededRNG((this.game.rng.state ^ 0xB0A3B5) >>> 0),
```

- [ ] **Step 8: 走らせて通るのを見る**

Run: `npm test -- tests/town-explosive-placement.test.js tests/town-generate.test.js tests/MapDeterminism.test.js`
Expected: PASS（最後のテストは todo）。比率が範囲を外れたら、まず数を出して見る（`node -e` で6週の `explosives / floors` を出す）。範囲から外れる原因が `onBareFloor` で弾かれる数なら、`TOWN_EXPLOSIVE_EVERY` ではなく脇の置き方（反対側も試すなど）を直して、Ruling を台帳に書く

- [ ] **Step 9: わざと壊して赤くなるか確かめる**

控えを取ってから:
- `placeExplosives` に `rng` ではなく建物の `rng` を渡すよう `generateTown` を書き換える（`explosiveRng` → `rng`）→ 1つ目のテストが赤くなる（建物の並びが変わる）。戻す
- `onBareFloor` の `if (solid(r, c)) return false;` を消す → 3つ目が赤くなるか見る。赤くならなければ、6週に段の岩へ埋もれる候補が無い fixture なので、そう台帳に書く（壊し方が差を出せない）。戻す
- `y: s.y + s.h - b.h` を `y: s.y + s.h - b.h - 4` にする → 3つ目が赤くなる（下端が岩に入らない）。戻す

- [ ] **Step 10: 全テストを走らせてコミット**

Run: `npm test > $S/t2.log 2>&1; tail -15 $S/t2.log`
Expected: 既知の1件以外が全部通る

```bash
git add src/js/world/town/palette.js src/js/world/town/mining.js src/js/world/town/adobe.js \
    src/js/world/town/generate.js src/js/world/Map.js \
    tests/town-explosive-shapes.test.js tests/town-explosive-placement.test.js tests/town-palette.test.js
# Constants.js は上の「ステージ手順」で町の節だけ
git commit -m "feat: 町の床に爆発物（ドラム缶・木箱・ボンベ・油壺の倉）を建物8棟に1つ置く（別の派生乱数で、町並みは変えない）"
```

---

### Task 3: 欠けたら爆発する（ExplosiveSystem の芯）

**Files:**
- Create: `src/js/world/town/explosives.js`
- Modify: `src/js/world/town/Town.js`（コンストラクタ・`chip`・`blast`・`update`、新しい `consume`）
- Modify: `src/js/entities/destruction.js`（`BLAST_PROFILES` に `townExplosive`、`detonateNearbyMines` に `export`）
- Modify: `src/js/utils/Constants.js`（段3bの節に追加）
- Create: `tests/helpers/town-explosive-fixtures.js`
- Test: `tests/town-explosives.test.js`（新規）、`tests/town-explosive-placement.test.js`（todo を戻す）

**Interfaces:**
- Consumes: `applyBlastDamage`（Task 1）、`MAT_EXPLOSIVE`、`playBlast(game, x, y, kind)`（destruction.js）、`Town.blast(x, y, size)`
- Produces:
  - Constants: `TOWN_EXPLOSIVE_DAMAGE`(25)、`TOWN_EXPLOSIVE_RADIUS`(50)、`TOWN_EXPLOSIVE_BLAST_COUNT`(80)
  - 建物の記録: `explosive: boolean`（かけらに爆発物の材料がある）、`exploded: boolean`
  - `Town.chip(b, x, y, radius, cause = 'hit')`（`'blast'` は Task 4 で遅れに使う。この Task では受け取るだけ）
  - `Town.consume(b)`: 残ったかけらを全部抜く（崩壊の粒は出さない）
  - `class ExplosiveSystem(town)`: `frame`、`queue: Map<building, {due, x, y, landed}>`、`trigger(b, delay, x?, y?)`、`update(game, view)`、`_explode(b, e, game)`、`_where(b, e)`
  - Town: `this.explosives`。`update(game)` が火のあとに `this.explosives.update(game, view)`

`trigger` の決まり: `due = frame + delay`。`update` は頭で `frame++` してから `due <= frame` のものを爆発させる。したがって `delay` 0 は**その tick の update のうち**（`trigger` を呼んだのが同じ tick の update の前なら）に爆発する。同じ建物に何度 `trigger` しても、早いほうの `due` を残す。`exploded` の建物と、爆発物でない建物は無視する。

- [ ] **Step 1: 失敗するテストを書く**

`tests/helpers/town-explosive-fixtures.js`:

```js
// 町の爆発物のテストの共有: 爆発物と木の建物の設計図、ダメージを記録する機体、本物の spawnExplosion を持つ game
// （テストのファイルどうしで import しない — 読んだ側でも相手のテストが登録されて二重に走るため）
import { SeededRNG } from '../../src/js/utils/SeededRNG.js';
import { Town } from '../../src/js/world/town/Town.js';
import { SpawnEffects } from '../../src/js/systems/SpawnEffects.js';
import { MAT_EXPLOSIVE, MAT_WOOD } from '../../src/js/world/town/chunks.js';
import { fakeCanvas } from './town-fixtures.js';

// 閃光・粒・煙の絵が document を引くことがあるので、何もしない canvas を返す
const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };

/** ドラム缶（全部爆発物の厚い壁）。既定 8x16 */
export function drum(x, y, w = 8, h = 16) {
    return {
        site: 'floor', style: 'C', kind: 'drum', x, y, w, h,
        parts: [{ x: 0, y: 0, w, h, color: '#b0301e', mat: MAT_EXPLOSIVE, solid: true }],
    };
}

/** 木の小屋（全部厚い壁）。既定 32x32 */
export function shed(x, y, w = 32, h = 32) {
    return {
        site: 'floor', style: 'C', kind: 'shack', x, y, w, h,
        parts: [{ x: 0, y: 0, w, h, color: '#5a3d1e', mat: MAT_WOOD, solid: true }],
    };
}

/** 中心が (cx, cy) の 16px 角の機体。受けたダメージを記録する */
export function unit(cx, cy) {
    return {
        x: cx - 8, y: cy - 8, width: 16, height: 16, alive: true, vx: 0, vy: 0, hits: [],
        takeDamage(n) { this.hits.push(n); },
    };
}

/**
 * 町と game。game は SpawnEffects を混ぜた本物の spawnExplosion を持つ（町の爆発 → town.blast・地雷の誘爆）。
 * booms は spawnExplosion の呼び出しを数える（画面の近くの爆発だけがここを通る）。
 * view を渡すと camera / canvas をその矩形にする（無ければ全部見えている扱い）。
 * map の destroyArea / damageBlock は呼ばれたら記録する（爆発物は岩を壊さない）
 */
export function world(specs, { seed = 1, isSolidTile = () => true, view = null } = {}) {
    const rng = new SeededRNG(seed);
    const town = new Town(specs, { createCanvas: fakeCanvas, isSolidTile, random: () => rng.next(), smokeSprites: () => null });
    const rockHits = [];
    const booms = [];
    const game = Object.assign({
        particles: [], projectiles: [], enemies: [], landmines: [], player: null, carrier: null,
        camera: view ? { x: view.x, y: view.y } : null, canvas: view ? { width: view.w, height: view.h } : null,
        map: {
            town,
            destroyArea: (...a) => rockHits.push(['destroyArea', ...a]),
            damageBlock: (...a) => rockHits.push(['damageBlock', ...a]),
        },
    }, SpawnEffects);
    const real = game.spawnExplosion;
    game.spawnExplosion = function (x, y, size, opts) {
        booms.push({ x, y, size, frame: town.explosives.frame });
        return real.call(this, x, y, size, opts);
    };
    return {
        town, game, booms, rockHits,
        step(n = 1) { for (let i = 0; i < n; i++) town.update(game); },
    };
}
```

`tests/town-explosives.test.js`:

```js
// 町の爆発物が欠けたら爆発する（explosives.js）。spec 3b章「爆発する条件」「機体へのダメージ」「岩は壊さない」
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    TOWN_EXPLOSIVE_DAMAGE, TOWN_EXPLOSIVE_RADIUS, TOWN_EXPLOSIVE_BLAST_COUNT,
} from '../src/js/utils/Constants.js';
import { Landmine } from '../src/js/entities/Landmine.js';
import { drum, shed, unit, world } from './helpers/town-explosive-fixtures.js';

test('爆発物の建物には explosive の印、ふつうの建物には無い', () => {
    const { town } = world([drum(100, 100), shed(200, 100)]);
    assert.equal(town.buildings[0].explosive, true);
    assert.equal(town.buildings[1].explosive, false);
});

test('弾で欠けた爆発物は、その tick の update で爆発する（spawnExplosion を粒 BLAST_COUNT で通る）', () => {
    // 縦長にして、自分の爆風（約 30px）の外にもかけらが残る形にする。8x16 のドラム缶だと
    // 爆風が丸ごと欠かせるので、consume が無くても remaining が 0 になってしまう
    const w = world([drum(100, 100, 16, 68)]);
    const b = w.town.buildings[0];
    w.town.chip(b, 108, 104, 4);
    assert.equal(w.booms.length, 0, 'chip の中では爆発しない（update で）');
    w.step(1);
    assert.equal(w.booms.length, 1);
    assert.equal(w.booms[0].size, TOWN_EXPLOSIVE_BLAST_COUNT);
    assert.equal(b.exploded, true);
    assert.equal(b.remaining, 0, '爆発した爆発物は残らない');
});

test('爆発は1回だけ: 爆発の前に何度欠けても、爆発のあとに引き金を引かれても', () => {
    const w = world([drum(100, 100, 16, 16)]);
    const b = w.town.buildings[0];
    w.town.chip(b, 102, 102, 2);
    w.town.chip(b, 110, 110, 2);
    w.step(30);
    // 爆発のあとはかけらが残らないので、欠けからは引き金が来ない。火・着地・誘爆から来た場合を直接
    w.town.explosives.trigger(b, 0);
    w.step(30);
    assert.equal(w.booms.length, 1);
});

test('ふつうの建物は欠けても爆発しない', () => {
    const w = world([shed(100, 100)]);
    w.town.chip(w.town.buildings[0], 110, 110, 6);
    w.step(30);
    assert.equal(w.booms.length, 0);
});

test('ダメージ: 半径の中の自機・母艦・敵に TOWN_EXPLOSIVE_DAMAGE、外には無し', () => {
    const w = world([drum(100, 100)]);   // 中心 (104, 108)
    w.game.player = unit(104 + 30, 108);
    w.game.carrier = unit(104 + TOWN_EXPLOSIVE_RADIUS + 20, 108);
    w.game.enemies.push(unit(104, 108 - 40), unit(104 - 90, 108));
    w.town.chip(w.town.buildings[0], 104, 108, 4);
    w.step(1);
    assert.deepEqual(w.game.player.hits, [TOWN_EXPLOSIVE_DAMAGE]);
    assert.deepEqual(w.game.carrier.hits, []);
    assert.deepEqual(w.game.enemies[0].hits, [TOWN_EXPLOSIVE_DAMAGE]);
    assert.deepEqual(w.game.enemies[1].hits, []);
});

test('爆発は町を欠かせて火をつける（spawnExplosion → town.blast）。岩は壊さない', () => {
    const w = world([drum(100, 100), shed(110, 92)]);
    const hut = w.town.buildings[1];
    w.town.chip(w.town.buildings[0], 104, 108, 4);
    w.step(1);
    assert.ok(hut.remaining < hut.total, '隣の小屋が欠けていない');
    assert.ok(w.town.fire.countIn(hut) > 0, '隣の小屋に火がつかない');
    assert.deepEqual(w.rockHits, []);
});

test('爆風は近くの地雷も誘爆する', () => {
    const w = world([drum(100, 100)]);
    const mine = new Landmine(w.game, 120, 110);
    w.game.landmines.push(mine);
    w.town.chip(w.town.buildings[0], 104, 108, 4);
    w.step(1);
    assert.equal(mine.alive, false);
});
```

`tests/town-explosive-placement.test.js` の最後のテストを `test.todo` から `test` に戻す。

- [ ] **Step 2: 走らせて失敗を見る**

Run: `npm test -- tests/town-explosives.test.js tests/town-explosive-placement.test.js`
Expected: FAIL（`TOWN_EXPLOSIVE_DAMAGE` が無い import のエラー。定数だけ先に足せば、`explosive` が undefined・`town.explosives` が undefined で落ちる）

- [ ] **Step 3: 実装する**

`src/js/utils/Constants.js` の段3bの節に追加:

```js
// 機体へのダメージは地雷（LANDMINE_DAMAGE / LANDMINE_BLAST_RADIUS）と同じから始める。
// グレネード（80）より弱い。別に持つのは、実機で町の爆発物だけを詰められるように（spec 3b章）
export const TOWN_EXPLOSIVE_DAMAGE = 25;
export const TOWN_EXPLOSIVE_RADIUS = 50;   // 機体へのダメージと誘爆の届く半径（px）
// 爆発の粒の数。町を欠かせる半径は K×√80 ≒ 30px（ミサイル 36粒の 20px とグレネード 150粒の 40px のあいだ）
export const TOWN_EXPLOSIVE_BLAST_COUNT = 80;
```

`src/js/entities/destruction.js`: Constants の import に `TOWN_EXPLOSIVE_BLAST_COUNT` を足し、`BLAST_PROFILES` の `landmine` の行の後ろに:

```js
    townExplosive: {   // 3面の町の爆発物（ドラム缶・木箱・ボンベ・油壺の倉）。地雷より少し大きい閃光
        flash: { count: 2, radius: IMPACT_FLASH_RADIUS * 1.3, spread: 12 },
        blast: { count: TOWN_EXPLOSIVE_BLAST_COUNT },
    },
```

`function detonateNearbyMines` を `export function detonateNearbyMines` にする（画面の外の町の爆発が、粒を出さずに地雷だけ誘爆させるため。コメントに1行足す）。

`src/js/world/town/explosives.js`:

```js
// ============================================
// explosives - 町の爆発物の誘爆
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md（3b章）
// 爆発物は「材料が爆発物のかけらだけでできた建物」（Town の b.explosive）。欠け・火・落下は
// Town と FireSystem が trigger() で知らせ、ここは順番待ちと爆発そのものだけを持つ。
// 爆発は画面の近くなら playBlast（→ spawnExplosion → town.blast・地雷の誘爆・爆発音）、
// 画面の外なら town.blast と地雷の誘爆だけ（粒と音は出さない。spec 2章「画面の外」）。
// どちらも岩は壊さない（spawnExplosion は地形に触らない）。

import { MAT_MASK, MAT_EXPLOSIVE, CHUNK } from './chunks.js';
import { playBlast, detonateNearbyMines } from '../../entities/destruction.js';
import { applyBlastDamage } from '../../utils/blastDamage.js';
import {
    TOWN_EXPLOSIVE_DAMAGE, TOWN_EXPLOSIVE_RADIUS, TOWN_EXPLOSIVE_BLAST_COUNT,
    LANDMINE_KNOCKBACK_VY, LANDMINE_KNOCKBACK_VX, VIEW_CULL_MARGIN,
} from '../../utils/Constants.js';

const HALF = CHUNK / 2;

export class ExplosiveSystem {
    constructor(town) {
        this.town = town;
        this.frame = 0;
        // 建物 → { due, x, y, landed }。x, y は爆発する場所の控え（かけらも破片も残っていないとき使う）
        this.queue = new Map();
    }

    /**
     * 爆発物 b を delay フレーム後に爆発させる。同じ建物には早いほうを残す。
     * x, y を渡すのは落ちて砕けたとき（その場所で爆発する。landed）
     */
    trigger(b, delay, x, y) {
        if (!b.explosive || b.exploded) return;
        const due = this.frame + delay;
        const landed = x !== undefined;
        const e = this.queue.get(b);
        if (!e) {
            this.queue.set(b, {
                due, landed,
                x: landed ? x : b.x + b.width / 2, y: landed ? y : b.y + b.height / 2,
            });
            return;
        }
        if (due < e.due) e.due = due;
        if (landed) Object.assign(e, { x, y, landed });
    }

    /** 毎 tick（Town.update から）。期限の来たものを早い順に爆発させる */
    update(game, view) {
        this.frame++;
        if (this.queue.size === 0) return;
        const ready = [...this.queue].filter(([, e]) => e.due <= this.frame).sort((p, q) => p[1].due - q[1].due);
        for (const [b, e] of ready) this._explode(b, e, game, view);
    }

    _near(view, x, y) {
        if (!view) return true;
        const m = VIEW_CULL_MARGIN;
        return x >= view.x - m && x <= view.x + view.w + m && y >= view.y - m && y <= view.y + view.h + m;
    }

    /**
     * 爆発する場所。落ちて砕けた所 → まだ落ちている破片 → 残ったかけらの真ん中 → 控え の順。
     * 爆風で丸ごと消し飛んだ爆発物は、控え（引き金のときの建物の真ん中）で爆発する
     */
    _where(b, e) {
        if (e.landed) return { x: e.x, y: e.y };
        const piece = this.town.falling.find((p) => p.alive && p.sourceId === b.id);
        if (piece) return { x: piece.cx, y: piece.cy };
        let n = 0, sx = 0, sy = 0;
        for (let k = 0; k < b.cells.length; k++) {
            if ((b.cells[k] & MAT_MASK) !== MAT_EXPLOSIVE) continue;
            const i = k % b.cw;
            sx += b.x + i * CHUNK + HALF;
            sy += b.y + ((k - i) / b.cw) * CHUNK + HALF;
            n++;
        }
        return n > 0 ? { x: sx / n, y: sy / n } : { x: e.x, y: e.y };
    }

    _explode(b, e, game, view) {
        const town = this.town;
        this.queue.delete(b);
        b.exploded = true;
        const { x, y } = this._where(b, e);
        // 爆発した爆発物は残さない。まだ落ちている破片も一緒に消す（破片が後で着地して2度目の爆発をしないように）
        for (const p of town.falling) if (p.sourceId === b.id) p.alive = false;
        town.falling = town.falling.filter((p) => p.alive);
        town.consume(b);
        if (this._near(view, x, y)) {
            playBlast(game, x, y, 'townExplosive');
        } else {
            town.blast(x, y, TOWN_EXPLOSIVE_BLAST_COUNT);
            detonateNearbyMines(game, x, y);
        }
        applyBlastDamage(game, x, y, {
            radius: TOWN_EXPLOSIVE_RADIUS, damage: TOWN_EXPLOSIVE_DAMAGE,
            knockVy: LANDMINE_KNOCKBACK_VY, knockVx: LANDMINE_KNOCKBACK_VX,
        });
    }
}
```

`src/js/world/town/Town.js`:
- import に `MAT_MASK, MAT_EXPLOSIVE`（chunks.js）と `ExplosiveSystem`（`./explosives.js`）を足す
- コンストラクタの `this.fire = new FireSystem(this);` の下に `this.explosives = new ExplosiveSystem(this);`
- 建物の記録の `burnt: new Set(),` の下に:

```js
                // 段3b: 爆発物（かけらに爆発物の材料がある建物）。爆発したら exploded
                explosive: cells.some((v) => (v & MAT_MASK) === MAT_EXPLOSIVE), exploded: false,
```

- `chip(b, x, y, radius)` を `chip(b, x, y, radius, cause = 'hit')` にし、JSDoc に `@param {'hit'|'blast'} [cause] 爆風（blast）か、弾・破片（hit）か。爆発物の誘爆の遅れに使う（段3b）` を足す。`this._settle(b);` の後ろ（`return` の前）に:

```js
        // 欠けた爆発物は爆発する（spec 3b章）。弾・破片ならすぐ（その tick の update で）
        if (b.explosive) this.explosives.trigger(b, 0);
```

- `blast` の `this.chip(b, x, y, radius);` を `this.chip(b, x, y, radius, 'blast');` にする
- `removeAndSettle` の後ろに:

```js
    /** 爆発した爆発物の残りのかけらを全部抜く。崩壊の閃光と粒は出さない（爆発そのものが演出） */
    consume(b) {
        const left = [];
        for (let k = 0; k < b.cells.length; k++) if (b.cells[k]) left.push(k);
        if (left.length > 0) this._removeCells(b, left);
        b.collapsed = true;
    }
```

- `update` の `this.fire.update(...)` の行を次にする:

```js
        const view = cam && cv ? { x: cam.x, y: cam.y, w: cv.width, h: cv.height } : null;
        this.fire.update(view);
        this.explosives.update(game, view);
```

- [ ] **Step 4: 走らせて通るのを見る**

Run: `npm test -- tests/town-explosives.test.js tests/town-explosive-placement.test.js`
Expected: PASS

- [ ] **Step 5: わざと壊して赤くなるか確かめる**

控えを取ってから、1つずつ:
- `trigger` の `if (!b.explosive || b.exploded) return;` から `|| b.exploded` を消す → 「爆発は1回だけ」が赤くなる。戻す
- `_explode` の `town.consume(b);` を消す → 「弾で欠けた爆発物は…」の `remaining` が赤くなる。戻す
- `applyBlastDamage(...)` の呼び出しを消す → 「ダメージ」が赤くなる。戻す
- `chip` の `if (b.explosive) this.explosives.trigger(b, 0);` を消す → 「弾で欠けた」が赤くなる。戻す

- [ ] **Step 6: 全テストを走らせてコミット**

Run: `npm test > $S/t3.log 2>&1; tail -15 $S/t3.log`
Expected: 既知の1件以外が全部通る

```bash
git add src/js/world/town/explosives.js src/js/world/town/Town.js src/js/entities/destruction.js \
    tests/helpers/town-explosive-fixtures.js tests/town-explosives.test.js tests/town-explosive-placement.test.js
# Constants.js は「ステージ手順」で町の節だけ
git commit -m "feat: 町の爆発物は欠けたら爆発する（地雷と同じ範囲ダメージ・町を欠かせて火をつける・岩は壊さない）"
```

---

### Task 4: 誘爆の遅れ・火・落下・上限・画面の外

**Files:**
- Modify: `src/js/world/town/explosives.js`
- Modify: `src/js/world/town/Town.js`（`chip` の `cause`、`_shatter`）
- Modify: `src/js/world/town/fire.js`（`ignite`）
- Modify: `src/js/utils/Constants.js`（段3bの節に追加）
- Test: `tests/town-explosives-chain.test.js`（新規）

**Interfaces:**
- Consumes: Task 3 の `ExplosiveSystem` / `trigger` / `_explode` / `world()` fixture
- Produces:
  - Constants: `TOWN_EXPLOSIVE_COOKOFF`(45)、`TOWN_CHAIN_DELAY_MIN`(8)、`TOWN_CHAIN_DELAY_RANGE`(7)、`TOWN_EXPLOSIONS_PER_SECOND`(6)
  - `ExplosiveSystem.chainDelay() → number`（8〜15、town.random）、`recent: number[]`（爆発したフレーム）
  - `chip(..., 'blast')` は `chainDelay()` 遅れ。爆発のたびに `TOWN_EXPLOSIVE_RADIUS` の中の別の爆発物にも `chainDelay()` で `trigger`
  - `FireSystem.ignite` が爆発物のかけらに火をつけたら `trigger(b, TOWN_EXPLOSIVE_COOKOFF)`
  - `Town._shatter` は爆発物の破片なら `trigger(src, 0, p.cx, groundY)` して瓦礫を残さない

- [ ] **Step 1: 失敗するテストを書く**

`tests/town-explosives-chain.test.js`:

```js
// 誘爆の遅れ・火・落下・上限・画面の外（explosives.js）。spec 3b章「誘爆の仕方」「暴走の歯止め」
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    TOWN_EXPLOSIVE_COOKOFF, TOWN_CHAIN_DELAY_MIN, TOWN_CHAIN_DELAY_RANGE,
    TOWN_EXPLOSIONS_PER_SECOND, TOWN_EXPLOSIVE_RADIUS, TOWN_EXPLOSIVE_DAMAGE,
} from '../src/js/utils/Constants.js';
import { drum, shed, unit, world } from './helpers/town-explosive-fixtures.js';

const MAX_DELAY = TOWN_CHAIN_DELAY_MIN + TOWN_CHAIN_DELAY_RANGE;

test('爆風の中の別の爆発物は 8〜15 フレーム遅れて爆発する（いろいろな種で）', () => {
    const gaps = new Set();
    for (let seed = 1; seed <= 20; seed++) {
        const w = world([drum(100, 100), drum(130, 100)], { seed });   // 中心どうし 30px
        w.town.chip(w.town.buildings[0], 104, 108, 4);
        w.step(40);
        assert.equal(w.booms.length, 2, `seed ${seed}`);
        const gap = w.booms[1].frame - w.booms[0].frame;
        assert.ok(gap >= TOWN_CHAIN_DELAY_MIN && gap <= MAX_DELAY, `seed ${seed}: ${gap}`);
        gaps.add(gap);
    }
    assert.ok(gaps.size >= 3, `遅れがばらつかない: ${[...gaps]}`);
});

test('町を欠かせる半径の外でも、TOWN_EXPLOSIVE_RADIUS の中の爆発物は誘爆する。外は誘爆しない', () => {
    const d = TOWN_EXPLOSIVE_RADIUS - 6;   // 町の欠け（約 30px）は届かない
    const w = world([drum(100, 100), drum(100 + d, 100), drum(100 + TOWN_EXPLOSIVE_RADIUS + 40, 100)]);
    const [a, b, c] = w.town.buildings;
    w.town.chip(a, 104, 108, 4);
    w.step(1);
    assert.equal(b.remaining, b.total, '前提: 2つ目は町の欠けでは欠けていない');
    w.step(40);
    assert.equal(b.exploded, true);
    assert.equal(c.exploded, false);
});

test('2つの爆発物が互いの爆風の中でも、どちらも1回ずつ', () => {
    const w = world([drum(100, 100), drum(120, 100)]);
    w.town.chip(w.town.buildings[0], 104, 108, 4);
    w.step(80);
    assert.equal(w.booms.length, 2);
});

test('火が届いた爆発物は TOWN_EXPLOSIVE_COOKOFF フレーム後に爆発する（それより前には爆発しない）', () => {
    const w = world([drum(100, 100)]);
    const b = w.town.buildings[0];
    assert.ok(w.town.fire.ignite(b, 0));
    w.step(TOWN_EXPLOSIVE_COOKOFF - 1);
    assert.equal(w.booms.length, 0);
    w.step(1);
    assert.equal(w.booms.length, 1);
});

test('燃えている小屋から火が燃え移った爆発物も、やがて爆発する', () => {
    const w = world([shed(100, 100), drum(132, 116)]);   // 小屋の右の壁に接する
    const hut = w.town.buildings[0];
    for (let k = 0; k < hut.cells.length; k += hut.cw) w.town.fire.ignite(hut, k + hut.cw - 1);   // 右端の列
    w.step(1200);
    assert.equal(w.town.buildings[1].exploded, true);
});

test('支えを失って落ちた爆発物は、砕けた所で1回だけ爆発し、瓦礫を残さない', () => {
    let rock = true;
    const w = world([drum(0, 0, 16, 68)], { isSolidTile: (r) => (r === 4 && rock) || r === 30 });
    rock = false;
    w.town.onBlockDestroyed(4, 0);
    assert.equal(w.town.falling.length, 1, '前提: 落ちる');
    w.step(200);
    assert.equal(w.booms.length, 1);
    assert.ok(Math.abs(w.booms[0].y - 30 * 16) <= 16, `爆発した高さ ${w.booms[0].y}`);
    assert.equal(w.town.rubble.length, 0);
});

test('火が届いて待っているあいだに落ち始めても、爆発は1回（落ちている破片か砕けた所で）', () => {
    let rock = true;
    const w = world([drum(0, 0, 16, 68)], { isSolidTile: (r) => (r === 4 && rock) || r === 30 });
    w.town.fire.ignite(w.town.buildings[0], 0);
    rock = false;
    w.town.onBlockDestroyed(4, 0);
    w.step(200);
    assert.equal(w.booms.length, 1);
    assert.ok(w.booms[0].y > 68, `元の位置（${w.booms[0].y}）で爆発した`);
});

test('グレネードの爆風で丸ごと消し飛んだ爆発物も、その位置で爆発する', () => {
    const w = world([drum(100, 100)]);
    w.town.blast(104, 108, 150);   // 半径約 40px。ドラム缶は丸ごと消える
    assert.equal(w.town.buildings[0].remaining, 0, '前提: 丸ごと消えた');
    w.step(MAX_DELAY);
    assert.equal(w.booms.length, 1);
    assert.ok(Math.abs(w.booms[0].x - 104) <= 4 && Math.abs(w.booms[0].y - 108) <= 4);
});

test('60 フレームあたり TOWN_EXPLOSIONS_PER_SECOND 回まで。超えた分は消えずに後ろへずれる', () => {
    // 互いの爆風が届かないよう 120px ずつ離した 10 個に、同じ tick で火をつける
    const w = world(Array.from({ length: 10 }, (_, i) => drum(100 + i * 120, 100)));
    for (const b of w.town.buildings) w.town.explosives.trigger(b, 0);
    w.step(300);
    assert.equal(w.booms.length, 10, '全部いつかは爆発する');
    for (const b of w.booms) {
        const inWindow = w.booms.filter((o) => o.frame > b.frame - 60 && o.frame <= b.frame).length;
        assert.ok(inWindow <= TOWN_EXPLOSIONS_PER_SECOND, `frame ${b.frame}: ${inWindow}`);
    }
});

test('画面の外の爆発: ダメージ・町の欠け・誘爆は起き、粒・閃光・爆発音（spawnExplosion）は出ない', () => {
    const w = world([drum(2000, 2000), shed(2010, 1992), drum(2030, 2000)], { view: { x: 0, y: 0, w: 640, h: 360 } });
    const [a, hut, b] = w.town.buildings;
    w.game.player = unit(2004 + 20, 2008);
    w.town.chip(a, 2004, 2008, 4);
    w.step(40);
    assert.equal(a.exploded, true);
    assert.equal(b.exploded, true, '画面の外でも誘爆する');
    assert.ok(hut.remaining < hut.total);
    assert.deepEqual(w.game.player.hits.slice(0, 1), [TOWN_EXPLOSIVE_DAMAGE]);
    assert.equal(w.booms.length, 0);
    assert.equal(w.game.particles.length, 0);
});
```

- [ ] **Step 2: 走らせて失敗を見る**

Run: `npm test -- tests/town-explosives-chain.test.js`
Expected: FAIL（定数の import のエラー。定数だけ先に足せば、遅れのテストは gap 0 か 1・火のテストは爆発しない・落下は瓦礫が残る・上限は1フレームに10回で落ちる）

- [ ] **Step 3: 実装する**

`src/js/utils/Constants.js` の段3bの節に追加:

```js
// 火が届いてから爆発するまで（フレーム）。燃えているのが見えてから爆発する（spec 3b章）。0.75秒
export const TOWN_EXPLOSIVE_COOKOFF = 45;
// 爆風の中の別の爆発物が爆発するまで 8〜15 フレーム。一斉に爆発させず、連鎖が見えるように
export const TOWN_CHAIN_DELAY_MIN = 8;
export const TOWN_CHAIN_DELAY_RANGE = 7;
// 60 フレームあたりの爆発物の爆発の上限。超えた分は消さずに後ろへずらす
// （消すと「撃ったのに爆発しない」に見える）
export const TOWN_EXPLOSIONS_PER_SECOND = 6;
```

`src/js/world/town/explosives.js`:
- import に `TOWN_CHAIN_DELAY_MIN, TOWN_CHAIN_DELAY_RANGE, TOWN_EXPLOSIONS_PER_SECOND` を足す
- コンストラクタに `this.recent = [];   // 爆発したフレーム（直近 60 フレームの数で上限を見る）`
- `trigger` の後ろに:

```js
    /** 爆風から誘爆するまでの遅れ（8〜15 フレーム）。火のつき方と同じ town.random */
    chainDelay() {
        return TOWN_CHAIN_DELAY_MIN + Math.floor(this.town.random() * (TOWN_CHAIN_DELAY_RANGE + 1));
    }
```

- `update` を次にする:

```js
    /**
     * 毎 tick（Town.update から）。期限の来たものを早い順に、60 フレームに TOWN_EXPLOSIONS_PER_SECOND 回まで
     * 爆発させる。上限に掛かった分は順番待ちに残り、次の tick 以降に爆発する
     */
    update(game, view) {
        this.frame++;
        this.recent = this.recent.filter((f) => f > this.frame - 60);
        if (this.queue.size === 0) return;
        const ready = [...this.queue].filter(([, e]) => e.due <= this.frame).sort((p, q) => p[1].due - q[1].due);
        for (const [b, e] of ready) {
            if (this.recent.length >= TOWN_EXPLOSIONS_PER_SECOND) break;
            if (b.exploded) continue;
            this._explode(b, e, game, view);
        }
    }
```

- `_explode` の `town.consume(b);` の後ろに `this.recent.push(this.frame);`、`applyBlastDamage(...)` の前に:

```js
        // 爆風（機体へのダメージと同じ半径）の中の別の爆発物は、少し遅れて誘爆する。町を欠かせる半径
        // （約 30px）だけだと、建物 8 棟に1つの爆発物どうしにはほとんど届かない
        for (const o of town.buildingsInCircle(x, y, TOWN_EXPLOSIVE_RADIUS)) {
            if (o.explosive) this.trigger(o, this.chainDelay());
        }
```

`src/js/world/town/Town.js`:
- `chip` の `if (b.explosive) this.explosives.trigger(b, 0);` を次にする（コメントも）:

```js
        // 欠けた爆発物は爆発する（spec 3b章）。弾・破片ならすぐ（その tick の update で）、
        // 爆風なら 8〜15 フレーム遅れて（一斉に爆発させず連鎖を見せる）
        if (b.explosive) this.explosives.trigger(b, cause === 'blast' ? this.explosives.chainDelay() : 0);
```

- `_shatter` の `p.alive = false;` と `const groundY = …;` の後ろ（瓦礫を足す前）に:

```js
        // 爆発物の破片は、砕けた所で爆発する。瓦礫は残さない（爆発が吹き飛ばす）
        const src = p.sourceId >= 0 ? this.buildings[p.sourceId] : null;
        if (src && src.explosive && !src.exploded && p.cells.some((v) => (v & MAT_MASK) === MAT_EXPLOSIVE)) {
            this.explosives.trigger(src, 0, p.cx, groundY);
            return;
        }
```

`src/js/world/town/fire.js`:
- import に `MAT_EXPLOSIVE` を足し、Constants の import に `TOWN_EXPLOSIVE_COOKOFF` を足す
- `ignite` の `this.fires.push(...)` の後ろ（`return true` の前）に:

```js
        // 爆発物に火が届いたら、燃えているのが見えてから爆発する（spec 3b章）
        if ((v & MAT_MASK) === MAT_EXPLOSIVE) this.town.explosives.trigger(b, TOWN_EXPLOSIVE_COOKOFF);
```

- [ ] **Step 4: 走らせて通るのを見る**

Run: `npm test -- tests/town-explosives-chain.test.js tests/town-explosives.test.js tests/town-fire.test.js tests/town-fire-ignite.test.js tests/town-fire-spread.test.js tests/town-falling.test.js`
Expected: PASS（全部）。「燃えている小屋から燃え移った」が 1200 フレームで爆発しないときは、まず火が届いたかを数える（`town.fire.countIn(drum)` を毎 tick 見る）。届いていれば遅れの実装、届いていなければ fixture（小屋とドラム缶の距離・燃料）を疑う

- [ ] **Step 5: わざと壊して赤くなるか確かめる**

控えを取ってから、1つずつ:
- `chip` の `cause === 'blast' ? … : 0` を `0` にする → 「8〜15 フレーム遅れて」が赤くなる…はずだが、2つ目は `_explode` の半径の誘爆（遅れつき）でも爆発する（**別の経路が同じ結果を出す**）。赤くならなければ、そう台帳に書き、`_explode` の半径の誘爆も一緒に消して、2つ目が爆発しなくなる（赤くなる）ことを確かめる。戻す
- `_explode` の半径の誘爆の `for` を消す → 「町を欠かせる半径の外でも…」が赤くなる。戻す
- `update` の `if (this.recent.length >= …) break;` を消す → 上限のテストが赤くなる。戻す
- `fire.js` の `trigger(b, TOWN_EXPLOSIVE_COOKOFF)` を `trigger(b, 0)` にする → 「火が届いた爆発物は COOKOFF 後」が赤くなる。戻す
- `_shatter` の `return;` を消す → 「砕けた所で…瓦礫を残さない」が赤くなる。戻す
- `_explode` の `for (const p of town.falling) if (p.sourceId === b.id) p.alive = false;` を消す → 「落ち始めても1回」が赤くなるか見る。赤くならなければ、着地の `trigger` が `exploded` で弾かれている（`!src.exploded`）ので、その二重の守りを台帳に書く。戻す
- `_near` が常に `true` を返すようにする → 「画面の外」が赤くなる。戻す

- [ ] **Step 6: 全テストを走らせてコミット**

Run: `npm test > $S/t4.log 2>&1; tail -15 $S/t4.log`
Expected: 既知の1件以外が全部通る

```bash
git add src/js/world/town/explosives.js src/js/world/town/Town.js src/js/world/town/fire.js \
    tests/town-explosives-chain.test.js
# Constants.js は「ステージ手順」で町の節だけ
git commit -m "feat: 町の爆発物の誘爆（爆風から8〜15フレーム遅れ・火が届くと遅れて・落ちて砕けると）と1秒6回の上限"
```

---

### Task 5: 書き出しの道具で見る・重さを測る

**Files:**
- Modify: `tools/render-town-scene.mjs`

**Interfaces:**
- Consumes: `SpawnEffects`（本物の `spawnExplosion` で、爆発が `town.blast` に届くように）、`town.explosives`
- Produces: `--stats` に `explosives`（数と種類）と `chain`（全部の爆発物に同時に引き金を引いて 600 フレーム回したときの1フレームの平均・最大 ms、爆発の数、60 フレームあたりの最大）、`--list-explosives`（爆発物の位置を JSON で）、`--boom "x,y;…"`（その点に一番近い爆発物を欠かせる）

- [ ] **Step 1: fakeGame に本物の spawnExplosion を混ぜる**

`tools/render-town-scene.mjs`:
- `const { backdropColors } = …` の下に `const { SpawnEffects } = await import('../src/js/systems/SpawnEffects.js');`
- `fakeGame` を、町を受け取って本物の `spawnExplosion` を持つ形にする（町の爆発物の爆発が `town.blast` に届き、誘爆が回るように）:

```js
// 粒は出さない（camera が無いので注文は画面の中扱いで particles に積まれるだけ）。
// 町の爆発物（段3b）の爆発は spawnExplosion → town.blast を通るので、本物を混ぜる
const fakeGame = (town) => Object.assign({
    particles: [], projectiles: [], enemies: [], landmines: [], player: null, carrier: null,
    camera: null, canvas: null, map: { town },
}, SpawnEffects);
```

- `applyBlasts` と `fireStats` の `fakeGame()` を `fakeGame(town)` に直す（`applyBlasts` は引数の `town`）

- [ ] **Step 2: 爆発物の数・位置・誘爆の重さを足す**

`fireStats` の後ろに:

```js
/**
 * 段3b: 全部の爆発物に同じ tick で引き金を引いて 600 フレーム回す（一番重い側。上限で後ろへずれる）。
 * 1フレームの town.update の平均と最大、爆発の数、60 フレームあたりの最大
 */
function chainStats() {
    const town = new Town(specs, { isSolidTile: (r, c) => map.isSolid(r, c), createCanvas: noPixels, smokeSprites: noSmoke });
    const game = fakeGame(town);
    const xs = town.buildings.filter((b) => b.explosive);
    for (const b of xs) town.explosives.trigger(b, 0);
    const frames = [];
    let maxMs = 0, sum = 0;
    for (let f = 0; f < 600; f++) {
        const before = xs.filter((b) => b.exploded).length;
        const t = performance.now();
        town.update(game);
        const ms = performance.now() - t;
        sum += ms; maxMs = Math.max(maxMs, ms);
        for (let i = before; i < xs.filter((b) => b.exploded).length; i++) frames.push(f);
    }
    const perWindow = Math.max(0, ...frames.map((f) => frames.filter((g) => g > f - 60 && g <= f).length));
    return {
        explosives: xs.length, exploded: xs.filter((b) => b.exploded).length,
        avgMs: +(sum / 600).toFixed(3), maxMs: +maxMs.toFixed(2), maxPer60Frames: perWindow,
    };
}
```

`--stats` の出力に `chain: chainStats(),` を足す（`...blastStats(),` の後ろ）。`byKind` には爆発物の種類も出る（設計図の `kind`）。

`if (args.stats) { … }` の後ろに:

```js
if (args['list-explosives']) {
    const xs = specs.filter((s) => ['drum', 'crate', 'gas', 'oiljars'].includes(s.kind))
        .map((s) => ({ kind: s.kind, x: s.x, y: s.y, w: s.w, h: s.h }));
    console.log(JSON.stringify(xs));
    process.exit(0);
}
```

`town` を作った後の `if (args.fire) … else if (args.blast) …` の前に:

```js
if (args.boom) {
    // その点に一番近い爆発物を弾1発ぶん欠かせる（爆発 → 誘爆）。--ticks で進める
    for (const t of String(args.boom).split(';').filter(Boolean)) {
        const [x, y] = t.split(',').map(Number);
        const b = town.buildings.filter((o) => o.explosive)
            .sort((p, q) => Math.hypot(p.x - x, p.y - y) - Math.hypot(q.x - x, q.y - y))[0];
        if (b) town.chip(b, b.x + b.width / 2, b.y + b.height / 2, 4);
    }
    applyBlasts(town, [], Number(args.ticks ?? 0));
}
```

ファイル冒頭の使い方のコメントに足す:

```js
//   node tools/render-town-scene.mjs --list-explosives                    # 爆発物の位置（段3b）
//   node tools/render-town-scene.mjs --x 1200 --y 300 --boom "1300,420" --ticks 120 --out c.png
//       # 誘爆の後（段3b）。--boom の点に一番近い爆発物を欠かせて爆発させ、--ticks 進める
```

- [ ] **Step 3: 走らせて数を読む**

Run: `node tools/render-town-scene.mjs --stats > $S/stats.json; cat $S/stats.json`
Expected: `byKind` に `floor/C/drum` などが出る。`chain.exploded === chain.explosives`（600 フレームで全部爆発する。爆発物が 60 個なら上限 6 回/秒で 10 秒＝600 フレームちょうどなので、足りなければ 900 にして直す）。`chain.maxPer60Frames <= 6`。`chain.maxMs` を控える（実機に渡すときに書く）

Run: `node tools/render-town-scene.mjs --list-explosives > $S/xs.json; head -c 400 $S/xs.json`
Expected: 爆発物の位置の JSON

- [ ] **Step 4: PNG で見る**

`$S/xs.json` の先頭の C と A の爆発物それぞれの周り（x−200, y−150 から 683x384）を、そのままと、`--boom` で爆発させて 120 tick 進めたものの2枚ずつ書き出し、Read で見る:

```bash
node tools/render-town-scene.mjs --x <X> --y <Y> --w 683 --h 384 --scale 2 --out $S/x-before.png
node tools/render-town-scene.mjs --x <X> --y <Y> --w 683 --h 384 --scale 2 --boom "<bx>,<by>" --ticks 120 --out $S/x-after.png
```

Expected: 爆発物が赤くて建物から見分けられる（ドラム缶のたが・木箱の赤い印・ボンベの白い帯・壺の赤い封）。爆発の後は周りの建物が欠け、火がついている。見分けられないときは palette の色を直し、Task 2 の色のテストが通ることを確かめる

- [ ] **Step 5: 全テストを走らせてコミット**

Run: `npm test > $S/t5.log 2>&1; tail -15 $S/t5.log`
Expected: 既知の1件以外が全部通る

```bash
git add tools/render-town-scene.mjs
git commit -m "tools: 町の爆発物を数える・位置を出す・誘爆させて PNG に書き出す・誘爆の重さを測る"
```

---

## 実機に渡すときの対応表（最後の報告に貼る）

| 確認ポイント | 調整する定数 |
|---|---|
| 爆発物の数 | `TOWN_EXPLOSIVE_EVERY`（8） |
| 爆発物だと見て分かるか・弾と見間違えないか | `palette.js` の `TOWN_EXPLOSIVE_COLORS` |
| 爆発の大きさ（町がどこまで欠けるか） | `TOWN_EXPLOSIVE_BLAST_COUNT`（80 → 約 30px） |
| 機体へのダメージ・届く距離・誘爆の届く距離 | `TOWN_EXPLOSIVE_DAMAGE`（25）、`TOWN_EXPLOSIVE_RADIUS`（50px） |
| 連鎖の間（パパパッと続くか） | `TOWN_CHAIN_DELAY_MIN`（8）、`TOWN_CHAIN_DELAY_RANGE`（7） |
| 火が届いてから爆発するまで | `TOWN_EXPLOSIVE_COOKOFF`（45 フレーム） |
| 大きな連鎖で爆発が詰まりすぎないか | `TOWN_EXPLOSIONS_PER_SECOND`（6） |
| 閃光の大きさ | `destruction.js` の `BLAST_PROFILES.townExplosive` |

確認のときはハードリロード（Cmd+Shift+R）が要る。
