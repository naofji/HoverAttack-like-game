# 反射ビームキャノン 実機フィードバック調整 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 実機で見えた4つの問題（速度・射撃条件・反射のがたつき/消え方・砲口の位置）を直す。

**Architecture:** ビームの見た目のモデルを「先端から一定長を切り出して等分」から「**節を積み上げ、節ごとに寿命で消える**」へ置き換える。反射の瞬間に節を閉じるので、節が折れ点をまたいで角をショートカットすることが無くなる。砲台側は1発を2本の扇型にし、視線が通らなくても撃つ。

**Tech Stack:** バニラ ES modules ＋ canvas 2D。ビルド工程なし。テストは `node --test`（DOM も AudioContext も無い）。

**Spec:** `docs/superpowers/specs/2026-08-15-reflect-beam-cannon-design.md`（Task 4 で今回の変更に追随させる）

## 何を直すか（実機フィードバック）

| # | 実機で見えたこと | 原因 | 直し方 |
|---|---|---|---|
| 1 | 遅い | `REFLECT_BEAM_SPEED = 4` | 5 にする |
| 2 | 遮蔽に隠れると撃ってこない | `_findTarget()` が `hasLineOfSight()` を要求する | beam 型だけ視線の条件を外す。壁越しに自機を狙って撃つ |
| 3 | **反射のたびに帯が角でがたつく** | `beamSegments()` は帯を等分するとき、**節が折れ点をまたぐと折れ点の手前から先へ一直線を引く**（角をショートカットする） | 節モデルに置き換え、**反射の瞬間に節を閉じる**。1節を10pxに短くする |
| 3b | 消え方が唐突（帯ごと一瞬で消える） | 上限に達した瞬間 `alive = false` | 節ごとに寿命を持たせ、古い節から薄れて消える。先端が止まっても節が残る間は生きている |
| 4 | **一方向だけだと緊張感がない** | 1発1本 | 1発を**2本×80px**にして、照準を中心に**扇型（±15°）**へ散らす |
| 5 | **砲口の放射光が全く目立たない。ビームが回転軸の中心から出ている** | 発射位置は中心から `12 - recoil`、砲身の先端と放射光は `4 + (14 - recoil) = 18 - recoil`。**ビームが放射光より6px手前＝砲身の中から湧いていた** | 砲口の位置を1つのメソッドに集約し、発射と放射光が必ず同じ点を使う。放射光の外周を透明にする |

## ユーザーの決定（実装中に迷ったらこの順で優先）

- 節ごとの寿命は**飛んでいる間の尾の形も決める**（固定長の切り出しは廃止。尾は常にぼやける）
- 遮蔽されているときは**壁越しに自機を狙う**（最後に見えた方向を覚える方式ではない）
- **2本×80px**、照準を中心とした**扇型**（毎回ランダムに散らすのではない）
- 1節は**10px 程度**

## Global Constraints

- **`git add -A` / `git add .` は使わない。** 変更したファイルを明示して add する。`src/js/main.js` にはユーザーがデバッグ用に置いた `debugStartMission: 6` が**意図的に未コミット**で残っている。**触らない・add しない。**
- **調整用の数値は `src/js/utils/Constants.js` に置く。** 実装側にマジックナンバーを直書きしない。ただし描画専用のパラメータは各ファイルのモジュールスコープに置いてよい（`EnemyAttacker.js` の `LEG_STYLES` が前例）
- **色は必ず hex 形式（`'#RRGGBB'`）。** `lerpColor()` が `parseInt` するので `rgba()` を定数に入れると `'#NaNNaNNaN'` になり実 canvas で無言に劣化する。**ただしグラデーションのストップに直接書く `rgba()` は別**（`BaseLaser.js` に前例がある）
- **コメントは日本語で「なぜそうしたか」を書く。** 既存ファイルは選んだ理由・試して駄目だった案・実測値を残している。その密度に合わせる
- **ソース文字列を grep するテストは書かない**
- 物理はフレーム単位（`x += vx`）で deltaTime に依存しない
- **`game.rng` を余分に消費しない**（週次の決定性。`tests/MapDeterminism.test.js`）。**扇型の散らしに乱数を使わない**のはこのため
- テスト実行: `npm test`（全部）/ `npm test -- tests/xxx.test.js`（1ファイル）

## このプランで必ず守ってほしい手順（過去の失敗から）

前のプラン（9タスク）で「**テストの名前と、実際に検証している内容が食い違っている**」欠陥が4回出ました。うち2回は**計画書に書かれたテストコード自体の誤り**でした。

**各タスクで、主要なテストを書いたら、それが縛っているはずの実装の行を一時的に潰して、そのテストが落ちることを確認してから元に戻してください。** 落ちなければそのテストは何も縛れていません。確認の結果を報告に書いてください。

## ファイル構成

| ファイル | 役割 |
|---|---|
| `src/js/utils/Constants.js`（変更） | 定数の入れ替え |
| `src/js/utils/beamPath.js`（変更） | `beamSegments()` を削除し、節の加齢 `ageSegments()` を追加。`stepBeam()` は据え置き |
| `src/js/entities/ReflectBeam.js`（変更） | 節モデルへ。寿命・フェード・反射で節を閉じる・先端停止後も残る |
| `src/js/entities/EnemyTurret.js`（変更） | 視線無視・2本扇型・砲口位置の一元化・放射光 |
| `tests/beam-path.test.js`（変更） | `beamSegments` のテストを削除し、`ageSegments` のテストを追加 |
| `tests/reflect-beam.test.js`（変更） | 節モデルに合わせて書き直し |
| `tests/beam-cannon.test.js`（変更） | 視線無視・2本扇型・砲口位置のテストを追加 |
| `tests/reflect-beam-collision.test.js`（変更の可能性） | 帯の作り方が変わるので座標の見直しが要るかもしれない |

**`CollisionManager.js` は変更しません。** `_bulletTouches()` は `isReflectBeam` と `segments()` を見ているだけで、`segments()` の中身の作り方が変わっても影響しません。

---

### Task 1: 定数の入れ替えと `ageSegments()`

**Files:**
- Modify: `src/js/utils/Constants.js`
- Modify: `src/js/utils/beamPath.js`
- Test: `tests/beam-path.test.js`

**Interfaces:**
- Consumes: なし
- Produces:
  - `ageSegments(segments) -> Array` — 各節の `life` を1減らし、0以下になった節を落とした**新しい配列**を返す（引数は書き換えない）
  - 定数: `REFLECT_BEAM_SPEED`(5) / `REFLECT_BEAM_SEGMENT_FRAMES`(2) / `REFLECT_BEAM_SEGMENT_LIFE`(16) / `REFLECT_BEAM_SHOT_COUNT`(2) / `REFLECT_BEAM_SPREAD`(15度をラジアンで) / `REFLECT_BEAM_MUZZLE_FLASH_RADIUS`(18)
  - **削除**: `REFLECT_BEAM_TAIL_SEGMENTS` / `REFLECT_BEAM_TAIL_LENGTH` / `beamSegments()`

- [ ] **Step 1: 定数を入れ替える**

`src/js/utils/Constants.js` の反射ビームの節を、次の形に置き換える（`REFLECT_BEAM_TAIL_SEGMENTS` と `REFLECT_BEAM_TAIL_LENGTH` の2行は**削除**する）:

```js
// 実機で「遅い」と言われて 4 → 5。タイル16px に対して3.2倍の余裕があるので
// 1フレームで壁を飛び越すことはない
export const REFLECT_BEAM_SPEED = 5;

// 帯は「節を積み上げ、節ごとに寿命で消える」形にしてある。固定長で切り出す
// 方式だと、節が反射の折れ点をまたいだときに角をショートカットする直線になり、
// 反射のたびに帯が角でがたついて見えた（実機で指摘された）
export const REFLECT_BEAM_SEGMENT_FRAMES = 2;  // 1節を閉じるまでのフレーム数。速度5なので1節=10px
export const REFLECT_BEAM_SEGMENT_LIFE = 16;   // 1節の寿命。80px(8節)ぶん生きる

// 1発を扇型に分ける。一方向だけだと動いている自機には当たらず緊張感が無い、
// という実機の指摘。総量は変えていない（80px × 2本 = 従来の160px 1本ぶん）
export const REFLECT_BEAM_SHOT_COUNT = 2;
export const REFLECT_BEAM_SPREAD = 15 * Math.PI / 180;  // 照準を中心に左右へ開く角度（±15度）

export const REFLECT_BEAM_WIDTH = 5;            // 母艦レーザーは6
export const REFLECT_BEAM_MAX_BOUNCES = 4;
export const REFLECT_BEAM_MAX_DISTANCE = 1200;  // 速度5で240フレーム=4秒
export const REFLECT_BEAM_DAMAGE = 20;          // 敵弾10・ホーミング20。自機HP100で5発
export const REFLECT_BEAM_MUZZLE_FLASH_FRAMES = 12; // 0.2秒
// 砲身の先端から広がる光の半径。ビームの根元に隠れない大きさが要る
export const REFLECT_BEAM_MUZZLE_FLASH_RADIUS = 18;
```

（`COLOR_REFLECT_BEAM_*` と `REFLECT_BEAM_CANNON_*` の行はそのまま）

- [ ] **Step 2: 失敗するテストを書く**

`tests/beam-path.test.js` から **`beamSegments` に関するテストを全部削除**し（`import` からも外す）、末尾に次を足す:

```js
import { stepBeam, ageSegments } from '../src/js/utils/beamPath.js';

// 節は寿命で消える。古い節（life が小さい）ほど先に消えるので、
// 帯は後ろから順に短くなっていく
test('全部の節の寿命が1ずつ減る', () => {
  const segs = [
    { x1: 0, y1: 0, x2: 10, y2: 0, life: 3 },
    { x1: 10, y1: 0, x2: 20, y2: 0, life: 5 },
  ];
  const out = ageSegments(segs);
  assert.deepEqual(out.map((s) => s.life), [2, 4]);
});

test('寿命が尽きた節は落ちる', () => {
  const segs = [
    { x1: 0, y1: 0, x2: 10, y2: 0, life: 1 },
    { x1: 10, y1: 0, x2: 20, y2: 0, life: 4 },
  ];
  const out = ageSegments(segs);
  assert.equal(out.length, 1, '寿命が尽きた節が残っている');
  assert.equal(out[0].life, 3);
  assert.equal(out[0].x1, 10, '残ったのが違う節');
});

// 呼び出し側が「前のフレームの節」を持ち続けられるよう、元の配列も
// 中の節も書き換えない
test('引数の配列も中の節も書き換えない', () => {
  const segs = [{ x1: 0, y1: 0, x2: 10, y2: 0, life: 3 }];
  ageSegments(segs);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].life, 3);
});

test('空の配列は空のまま', () => {
  assert.deepEqual(ageSegments([]), []);
});
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `npm test -- tests/beam-path.test.js`
Expected: FAIL（`ageSegments is not a function`）

- [ ] **Step 4: `beamPath.js` を書き換える**

`beamSegments()` を**削除**し（ファイル冒頭の説明コメントも節モデルの説明に書き直す）、末尾に足す:

```js
/**
 * 節を1フレームぶん歳を取らせる。寿命が尽きた節は落とす。
 *
 * 帯の長さは「節の寿命 × 速度」で決まる。固定の長さで切り出していた頃は、
 * 節が反射の折れ点をまたぐと角をショートカットする直線になり、反射のたびに
 * 帯が角でがたついて見えた。節を積み上げる形にして、反射の瞬間に節を閉じれば
 * その問題が消える。
 *
 * 引数は書き換えない（呼び出し側が前のフレームの節を持ち続けられるように）。
 *
 * @param {Array<{life:number}>} segments
 * @returns {Array} 新しい配列。中の節も新しいオブジェクト
 */
export function ageSegments(segments) {
    const out = [];
    for (const s of segments) {
        const life = s.life - 1;
        if (life > 0) out.push({ ...s, life });
    }
    return out;
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npm test -- tests/beam-path.test.js`
Expected: PASS

**この時点で `ReflectBeam.js` が `beamSegments` を import しているので、`npm test` の他のファイルは落ちます。** それは Task 2 で直します。Task 1 のコミットは「このファイルだけ緑」で構いません。

- [ ] **Step 6: コミット**

```bash
git add src/js/utils/Constants.js src/js/utils/beamPath.js tests/beam-path.test.js
git commit -m "refactor: ビームの帯を節の寿命で決める形に変える（純ロジック）"
```

---

### Task 2: `ReflectBeam` を節モデルへ

**Files:**
- Modify: `src/js/entities/ReflectBeam.js`
- Test: `tests/reflect-beam.test.js`
- Test（座標の見直しが要れば）: `tests/reflect-beam-collision.test.js`

**Interfaces:**
- Consumes: `stepBeam()` / `ageSegments()`（Task 1）、Task 1 の定数
- Produces:
  - `beam.segments() -> Array<{x1,y1,x2,y2,life}>` — 生きている節。**描画と当たり判定が同じものを使う**
  - `beam.spent`（boolean）— 先端が止まったか。`alive` は節が残っている間 true のまま
  - `beam.alive` / `beam.bounces` / `beam.distance` / `beam.isReflectBeam` は据え置き

- [ ] **Step 1: 失敗するテストを書く**

`tests/reflect-beam.test.js` を次の方針で書き直す。**既存のテストのうち「まっすぐ飛ぶ」「壁で跳ね返る」「地形にダメージを与えない」「死んだら描かない」は残し**、帯に関するものを差し替える:

```js
// 1節は SEGMENT_FRAMES フレームぶん。速度5・2フレームなので10px
test('節は SEGMENT_FRAMES ごとに増える', () => {
  const { beam } = makeBeam();
  for (let i = 0; i < REFLECT_BEAM_SEGMENT_FRAMES * 3; i++) beam.update();
  assert.equal(beam.segments().length, 3, '3節ぶん進んだのに節が3つない');
});

// 反射で節を閉じないと、節が折れ点をまたいで角をショートカットする直線になり、
// 反射のたびに帯が角でがたついて見える（実機で指摘された）
test('反射した瞬間に節が閉じる', () => {
  const { beam } = makeBeam({ x: 140, y: 40, angle: 0 });
  let bouncedAt = -1;
  for (let i = 0; i < 40; i++) {
    const before = beam.bounces;
    beam.update();
    if (beam.bounces > before) { bouncedAt = i; break; }
  }
  assert.ok(bouncedAt >= 0, '反射していない');

  // 反射の直後、どの節も「折れ点をまたいでいない」＝各節は水平か垂直のまま
  // （この部屋では反射は縦の壁なので、向きは左右のどちらか）
  for (const s of beam.segments()) {
    assert.ok(Math.abs(s.y2 - s.y1) < 1e-6, `節が斜めになっている（角をまたいだ）: ${JSON.stringify(s)}`);
  }
});

test('古い節から順に消える', () => {
  const { beam } = makeBeam();
  // 帯がいっぱいになるまで進める
  for (let i = 0; i < REFLECT_BEAM_SEGMENT_LIFE * 2; i++) beam.update();
  const full = beam.segments().length;
  assert.ok(full > 1, '節が増えていない');
  // 帯の長さは寿命で決まるので、これ以上は増えない
  for (let i = 0; i < REFLECT_BEAM_SEGMENT_FRAMES * 3; i++) beam.update();
  assert.equal(beam.segments().length, full, '節が寿命を超えて増えている');
});

test('新しい節ほど寿命が残っている', () => {
  const { beam } = makeBeam();
  for (let i = 0; i < REFLECT_BEAM_SEGMENT_LIFE; i++) beam.update();
  const lives = beam.segments().map((s) => s.life);
  // segments() は先端が先（[0] が新しい）
  for (let i = 1; i < lives.length; i++) {
    assert.ok(lives[i] < lives[i - 1], `寿命の並びが古い順になっていない: ${lives}`);
  }
});

// 上限に達した瞬間に帯ごと消えると唐突に見える。先端だけ止めて、
// 残った節が後ろから薄れて消えていく
test('上限に達しても節が残る間は生きている', () => {
  const { beam } = makeBeam();
  let steps = 0;
  while (!beam.spent && steps < 5000) { beam.update(); steps++; }
  assert.ok(beam.spent, '先端が止まっていない');
  assert.equal(beam.alive, true, '節が残っているのに消えている');
  assert.ok(beam.segments().length > 0, '節が残っていない');

  const headX = beam.x;
  const headY = beam.y;
  beam.update();
  assert.equal(beam.x, headX, '先端が止まっていない');
  assert.equal(beam.y, headY, '先端が止まっていない');

  // 節が全部消えたら初めて alive が false になる
  for (let i = 0; i < REFLECT_BEAM_SEGMENT_LIFE + 2; i++) beam.update();
  assert.equal(beam.segments().length, 0);
  assert.equal(beam.alive, false, '節が尽きたのに消えていない');
});

// 古い節ほど薄く描く（ぼやけながら消える）
test('古い節ほど薄く描かれる', () => {
  const { beam } = makeBeam();
  for (let i = 0; i < REFLECT_BEAM_SEGMENT_LIFE; i++) beam.update();
  const ctx = makeFakeCtx();
  beam.draw(ctx);
  const alphas = ctx.calls.filter((c) => c.name === 'set:globalAlpha').map((c) => c.args[0]);
  assert.ok(alphas.length > 1, '節ごとに濃さを変えていない');
  assert.ok(Math.max(...alphas) > Math.min(...alphas), '全部同じ濃さで描いている');
});
```

**注意**: `makeBeam()` のヘルパーと `ROOM` は既存のものを使う。`REFLECT_BEAM_SEGMENT_FRAMES` / `REFLECT_BEAM_SEGMENT_LIFE` を import に足すこと。「反射した瞬間に節が閉じる」テストの開始座標（`x: 140`）は、**この部屋で本当に縦の壁に当たるか自分で確かめてから使うこと**（部屋の右壁は列 c=19 なので x=304 付近。140 から右へ進めば届く）。

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm test -- tests/reflect-beam.test.js`
Expected: FAIL

- [ ] **Step 3: `ReflectBeam` を書き換える**

考え方:
- `this.segs = []`（生きている節。**[0] が先端側**）と `this.head = { x, y }`（伸びている途中の節の先端）を持つ
- 毎フレーム `stepBeam()` で進み、**開いている節の終点を伸ばす**
- `REFLECT_BEAM_SEGMENT_FRAMES` フレームごと、**および反射した瞬間**に節を閉じて新しい節を始める
- 毎フレーム `ageSegments()` で歳を取らせる
- 上限（反射回数・距離・マップ外）に達したら `this.spent = true`。以降は進まず、節を閉じず、歳だけ取る
- `this.alive` は `this.segs.length > 0 || !this.spent`

```js
    segments() {
        // 伸びている途中の節も含める（先端が見えないと不自然）
        return this.open ? [this.open, ...this.segs] : [...this.segs];
    }
```

描画は節ごとに `globalAlpha = life / REFLECT_BEAM_SEGMENT_LIFE` を設定してから3パス（外周・中間・芯）を描く。**`globalAlpha` は最後に必ず 1 に戻す**（戻さないと以降の描画が全部薄くなる）。

`draw()` の頭の `if (!this.alive) return;` は残す。

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- tests/reflect-beam.test.js`
Expected: PASS

- [ ] **Step 5: 「行を潰すと落ちる」ことを確認する**

次の2つをそれぞれ一時的に潰して、対応するテストが落ちることを確認してから元に戻す:
- 反射で節を閉じる処理 → 「反射した瞬間に節が閉じる」が落ちるか
- `spent` になっても `alive` を保つ処理 → 「上限に達しても節が残る間は生きている」が落ちるか

結果を報告に書く。

- [ ] **Step 6: 全テストを走らせる**

Run: `npm test`
Expected: 失敗ゼロ。`tests/reflect-beam-collision.test.js` が落ちる場合は、帯の作り方が変わって当たる座標がずれたということなので、**そのテストの座標を直す**（実装ではなく）。直したら「線分の枝を潰すと落ちる」ことを再確認すること

- [ ] **Step 7: コミット**

```bash
git add src/js/entities/ReflectBeam.js tests/reflect-beam.test.js
git commit -m "feat: ビームを節ごとの寿命で消し、反射のがたつきを無くす"
```

---

### Task 3: 砲台 — 視線無視・2本扇型・砲口の位置

**Files:**
- Modify: `src/js/entities/EnemyTurret.js`
- Test: `tests/beam-cannon.test.js`

**Interfaces:**
- Consumes: `REFLECT_BEAM_SHOT_COUNT` / `REFLECT_BEAM_SPREAD` / `REFLECT_BEAM_MUZZLE_FLASH_RADIUS`（Task 1）、`ReflectBeam`（Task 2）
- Produces: `turret._muzzleOffset() -> number` — 砲台の中心から砲口までの距離

- [ ] **Step 1: 失敗するテストを書く**

`tests/beam-cannon.test.js` に足す（既存のテストは残す。ただし「beam 型は1回の攻撃で1発だけ撃つ」は**2本になる**ので期待値を直すこと）:

```js
// 遮蔽に隠れても撃ってこないと、隠れているだけで安全になってしまう。
// 反射する武器なので、壁越しに撃って跳ね返らせるのがこの砲台の見せ場
test('beam 型は視線が通らなくても撃つ', () => {
  const game = makeGame();
  // 自機との間を壁で塞ぐ（この部屋の作りに合わせて自分で座標を決めること）
  game.map.isSolidAtPixel = (x, y) => x > 60 && x < 80;
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  for (let i = 0; i < 600 && game.enemyBullets.length === 0; i++) t.update();
  assert.ok(game.enemyBullets.length > 0, '遮蔽があると撃たない');
});

test('gun 型は視線が通らないと撃たない', () => {
  const game = makeGame();
  game.map.isSolidAtPixel = (x, y) => x > 60 && x < 80;
  const t = new EnemyTurret(game, 32, 40, false, 'gun');
  for (let i = 0; i < 600; i++) t.update();
  assert.equal(game.enemyBullets.length, 0, '遮蔽があるのに撃っている');
});

// 一方向だけだと動いている自機には当たらず緊張感が無い、という実機の指摘
test('beam 型は1回の攻撃で扇型に複数本撃つ', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  for (let i = 0; i < 600 && game.enemyBullets.length === 0; i++) t.update();
  assert.equal(game.enemyBullets.length, REFLECT_BEAM_SHOT_COUNT);

  // 照準を中心に左右へ均等に開いている
  const angles = game.enemyBullets.map((b) => Math.atan2(b.vy, b.vx));
  const mid = angles.reduce((a, b) => a + b, 0) / angles.length;
  assert.ok(Math.abs(mid - t.currentAngle) < 1e-6, '扇の中心が照準からずれている');
  const spread = Math.max(...angles) - Math.min(...angles);
  assert.ok(spread > 0, '全部同じ向きに撃っている');
});

// 発射位置が砲身の中だと、放射光がビームの根元に隠れて見えない（実機で指摘）
test('ビームは砲口（砲身の先端）から出る', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  for (let i = 0; i < 600 && game.enemyBullets.length === 0; i++) t.update();

  const cx = t.x + t.width / 2;
  const cy = t.y + t.height / 2;
  const off = t._muzzleOffset();
  for (const b of game.enemyBullets) {
    const d = Math.hypot(b.x - cx, b.y - cy);
    assert.ok(Math.abs(d - off) < 1e-6, `砲口(${off})から出ていない: ${d}`);
  }
});
```

**注意**: 遮蔽のテストで `isSolidAtPixel` を差し替える座標は、**砲台と自機の間を実際に塞げているか自分で確かめてから使うこと**。`makeGame()` の自機は `x: 100, y: 40`、砲台は `x: 32` に置いている。

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npm test -- tests/beam-cannon.test.js`
Expected: FAIL

- [ ] **Step 3: `EnemyTurret` を直す**

⑴ 型の表の beam の行に足す:

```js
        // 遮蔽に隠れても撃つ。反射する武器なので、壁越しに撃って跳ね返らせるのが
        // この砲台の見せ場になる。隠れているだけで安全だと緊張感が出ない
        ignoresLineOfSight: true,
        burst: 1,  // 1回の攻撃。ただし1回で SHOT_COUNT 本を扇型に撃つ
```

⑵ `_findTarget()` の視線の条件を型で分ける:

```js
            if (dist < ENEMY_TURRET_SIGHT_RANGE
                && (this.spec.ignoresLineOfSight || this._hasLineOfSight(target))) {
                return target;
            }
```

⑶ 砲身の長さをモジュールスコープの定数にして、砲口の位置を1つのメソッドに集約する（**発射位置と放射光が必ず同じ点を使う**ようにするのが目的）:

```js
// 砲身の見た目。描画専用のパラメータなので Constants ではなくここに置く
// （EnemyAttacker.js の LEG_STYLES と同じ扱い）
const BARREL_BASE = 4;    // 砲身が始まる位置（中心から）
const BARREL_LENGTH = 14; // 砲身の長さ
```

```js
    /**
     * 砲口（砲身の先端）の中心からの距離。
     *
     * **発射位置と砲口の放射光は必ずこれを使う。** 以前は発射が `12 - recoil`、
     * 放射光が `4 + (14 - recoil)` と食い違っていて、ビームが放射光より6px手前
     * ＝砲身の中から湧いていた。そのせいで光がビームの根元に隠れ、実機で
     * 「放射光が全く目立たない・ビームが回転軸の中心から出ている」と指摘された
     */
    _muzzleOffset() {
        return BARREL_BASE + BARREL_LENGTH - this.recoil;
    }
```

⑷ `_executeAttack()` で `_muzzleOffset()` を使い、beam 型は扇型に複数本撃つ:

```js
        const off = this._muzzleOffset();
        const muzzleX = cx + Math.cos(this.currentAngle) * off;
        const muzzleY = cy + Math.sin(this.currentAngle) * off;

        if (this.type === 'beam') {
            // 照準を中心に左右へ均等に開く。**乱数は使わない**（週次の決定性を
            // 壊さないため。スポーンと違い発射は rng を引かない作りを保つ）
            for (let i = 0; i < REFLECT_BEAM_SHOT_COUNT; i++) {
                const t = REFLECT_BEAM_SHOT_COUNT === 1
                    ? 0
                    : (i / (REFLECT_BEAM_SHOT_COUNT - 1)) * 2 - 1;  // -1..+1
                const angle = this.currentAngle + t * REFLECT_BEAM_SPREAD;
                this.game.enemyBullets.push(
                    new ReflectBeam(this.game, muzzleX, muzzleY, angle),
                );
            }
            this.muzzleFlash = REFLECT_BEAM_MUZZLE_FLASH_FRAMES;
        } else {
            ...
        }
```

⑸ `draw()` の砲身と放射光を、同じ定数・同じメソッドから引く:

```js
        const barrelLength = BARREL_LENGTH - this.recoil;
        ctx.fillRect(BARREL_BASE, -2, barrelLength, 4);
        ctx.strokeRect(BARREL_BASE, -2, barrelLength, 4);
```

放射光は `gx = this._muzzleOffset()` にし、**外周を透明にする**:

```js
            const r = REFLECT_BEAM_MUZZLE_FLASH_RADIUS * t;
            const gx = this._muzzleOffset();
            const grad = ctx.createRadialGradient(gx, 0, 0, gx, 0, Math.max(0.1, r));
            grad.addColorStop(0, COLOR_REFLECT_BEAM_CORE);
            // 外周は透明。不透明な暗紫のままだと「暗い円板の縁」に見えてしまう。
            // グラデーションのストップに rgba を直接書くのは BaseLaser に前例がある
            grad.addColorStop(1, 'rgba(59, 15, 107, 0)');
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- tests/beam-cannon.test.js`
Expected: PASS

- [ ] **Step 5: 「行を潰すと落ちる」ことを確認する**

- `ignoresLineOfSight` を見る条件 → 「beam 型は視線が通らなくても撃つ」が落ちるか
- 扇型のループ → 「1回の攻撃で扇型に複数本撃つ」が落ちるか
- `_muzzleOffset()` を使う発射位置 → 「ビームは砲口から出る」が落ちるか（元の `12 - this.recoil` に戻して確かめる）

結果を報告に書く。

- [ ] **Step 6: 全テストを走らせる**

Run: `npm test`
Expected: 失敗ゼロ。既存のタレット（gun 型）のテストが通ったままであること

- [ ] **Step 7: コミット**

```bash
git add src/js/entities/EnemyTurret.js tests/beam-cannon.test.js
git commit -m "feat: 反射ビームを砲口から扇型に2本撃ち、遮蔽越しでも撃つ"
```

---

### Task 4: 設計書の追随

**Files:**
- Modify: `docs/superpowers/specs/2026-08-15-reflect-beam-cannon-design.md`

- [ ] **Step 1: 設計書を実装に合わせる**

**コードは変更しないこと。** 設計書に反映するのは次の5点:

1. **「ビームの形」の節を丸ごと書き直す。** 固定長の切り出し（`beamSegments()`）は廃止。節を積み上げ、節ごとの寿命で消える形になった。**なぜ変えたか**を残すこと: 固定長で等分すると、節が反射の折れ点をまたいだときに角をショートカットする直線になり、反射のたびに帯が角でがたついて見えた（実機で指摘）。反射の瞬間に節を閉じることで消える
2. **消え方**: 上限に達したら先端が止まるだけで、残った節が後ろから薄れて消える。`alive` は節が尽きてから false になる
3. **1発は2本の扇型**（`REFLECT_BEAM_SHOT_COUNT` / `REFLECT_BEAM_SPREAD`）。理由は「一方向だけだと動いている自機には当たらず緊張感が無い」（実機）。**乱数は使わない**（決定性）
4. **beam 型は視線が通らなくても撃つ**（`ignoresLineOfSight`）。理由は「隠れているだけで安全だと緊張感が出ない」。反射する武器なので壁越しに撃って跳ね返らせるのが見せ場
5. **砲口の位置**: 発射位置と放射光は `_muzzleOffset()` の1箇所から引く。以前は発射が中心から12px、放射光が18pxで食い違い、**ビームが砲身の中から湧いて光を隠していた**（実機で「放射光が全く目立たない」と指摘）
6. 定数の表を新しい値に更新（速度5、`SEGMENT_FRAMES`/`SEGMENT_LIFE`/`SHOT_COUNT`/`SPREAD`/`MUZZLE_FLASH_RADIUS` を追加、`TAIL_LENGTH`/`TAIL_SEGMENTS` を削除）。**「帯が通路を塞ぐ時間を下げる値」は `REFLECT_BEAM_SEGMENT_LIFE` になった**ことを明記

- [ ] **Step 2: コミット**

```bash
git add docs/superpowers/specs/2026-08-15-reflect-beam-cannon-design.md
git commit -m "docs: 反射ビームの設計書を実機フィードバックの調整に合わせる"
```

- [ ] **Step 3: ユーザーに引き渡す**

**実機での見た目・音の確認は必ずユーザーが行う。** ローカルサーバーはユーザーが IDE 側で常時立てているので、こちらでは起動しない。

伝えること:
- **ハードリロード（Cmd+Shift+R）が要る**
- 7面（`debugStartMission: 6` が入ったまま）
- **2本×80px の扇型・遮蔽無視の2つで、7面の被弾圧は確実に上がる。** 辛ければ `REFLECT_BEAM_CANNON_COOLDOWN`(180) を伸ばす、`REFLECT_BEAM_SPREAD`(±15度) を狭める、`REFLECT_BEAM_DAMAGE`(20) を下げる、の順に効く。**2本とも当たると40ダメージ**（自機HP100）になる点は要注意
- 調整用の値の対応表:

| 見てほしいこと | 調整する定数 |
|---|---|
| 反射のがたつきが消えたか | （直っていなければ `REFLECT_BEAM_SEGMENT_FRAMES` をさらに下げる） |
| 帯が通路を塞ぐ時間 | `REFLECT_BEAM_SEGMENT_LIFE`（16）**最初に下げる値** |
| 1節の長さ | `REFLECT_BEAM_SEGMENT_FRAMES`（2＝10px） |
| 扇の開き | `REFLECT_BEAM_SPREAD`（±15度）/ `REFLECT_BEAM_SHOT_COUNT`（2） |
| 撃つ間隔 | `REFLECT_BEAM_CANNON_COOLDOWN`（180） |
| 速さ | `REFLECT_BEAM_SPEED`（5） |
| 砲口の光の大きさ・長さ | `REFLECT_BEAM_MUZZLE_FLASH_RADIUS`（18）/ `_FRAMES`（12） |
| 一撃の重さ | `REFLECT_BEAM_DAMAGE`（20） |
