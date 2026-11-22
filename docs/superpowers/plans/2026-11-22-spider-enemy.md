# 6面の新しい敵「スパイダー」 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 6面の後半（マップの右半分）に、床・壁・天井を這って小ジャンプし、自機の頭上で破裂して5発を降らせる弾を撃つクモ型の小型ロボ「スパイダー」を足す。

**Architecture:** 体は新しいクラス `EnemySpider`。面に沿って進む規則は `utils/surfaceCrawl.js` の純粋関数にして、格子の上で直接テストする。弾 `EnemyBurstShell` は `Bullet` を継承して重力と破裂を足し、`game.enemyBullets` に入れる（町の建物・Orb の既存の扱いに乗る）。撃ち落としは `CollisionManager._checkInterception` と `Grenade._explode` に1つずつ枝を足す。置き場所は `mapgen/spawns.js` が派生ストリームで選ぶ（`game.rng` を進めない）。

**Tech Stack:** バニラ ES modules、canvas 2D、Web Audio 手続き合成、`node --test`。

**Spec:** `docs/superpowers/specs/2026-11-22-spider-enemy-design.md`

## Global Constraints

- 出るのは **6面だけ**: `SPIDER_MISSION = 5` と `SPIDER_LAST_MISSION = 5` の両方を見る（missionsCompleted / missionLevel、0 = 1面）
- 数値はすべて `src/js/utils/Constants.js` の新しい「スパイダー」節に置く。実装側に数値を直書きしない（描画専用のパラメータだけはファイルのモジュールスコープに置いてよい）
- **`game.rng` を1回も余分に引かない。** 置き場所の乱数は `new SeededRNG((this.game.rng.state ^ SPIDER_SPAWN_SALT) >>> 0)`、個体の判断は `spawnStateRng(game, x, y)`。`SpawnManager.resolveOverlap`（`game.rng` を引く）は使わない
- `walkerBody.js` / `slopeBody.js` / `EnemyAttacker` / `Player` には触らない
- 新しい `AudioManager` の `play*` を足す場合は引数なしで落ちないこと。音は `WEAPON_SOUNDS` の行で足し、`renderWeaponSound()` と `tests/helpers/weapon-render.js` の対を両方通す
- ソース文字列を grep するテストは書かない。本物の関数を呼んで結果を見る
- コメントは日本語で「なぜ」を書く。決めた数値には根拠（初期値なら「実機で調整」）を書く
- `git add -A` / `git add .` 禁止。`src/js/main.js` には触らない（ユーザーの `debugStartMission` が未コミットで置いてある）。変更したファイルを明示して add する
- 各タスクの最後に `npm test` が全部通ること

### 定数の初期値（Task ごとに使うものを足す。名前は固定）

| 名前 | 値 | 意味 |
|---|---|---|
| `SPIDER_MISSION` / `SPIDER_LAST_MISSION` | 5 / 5 | 6面だけ |
| `SPIDER_COUNT` | 5 | 1面あたりの数（設計書の目安 4〜6） |
| `SPIDER_SPAWN_SALT` | 任意の32bit定数（既存の `ORB_SPAWN_SALT` 等と重ならない） | 置き場所の派生ストリーム |
| `SPIDER_SPAWN_MIN_COL_GAP` | 8 | スパイダーどうしの列の間隔（タイル） |
| `SPIDER_SIZE` | 14 | 当たり箱の一辺（px、タイル 16 より小さくして1タイルの隙間に入れる） |
| `SPIDER_HP` | 8 | ドローンと同じ |
| `SPIDER_SCORE` | 250 | ドローンと同じ |
| `SPIDER_CRAWL_SPEED` | 1.6 | 這う速さ（px/フレーム） |
| `SPIDER_RUN_FRAMES` | [40, 140] | 走る長さの範囲 |
| `SPIDER_PAUSE_FRAMES` | [15, 50] | 止まる長さの範囲 |
| `SPIDER_TURN_CHANCE` | 0.35 | 止まったあと向きを変える確率 |
| `SPIDER_HOP_CHANCE` | 0.3 | 走り終わりに小ジャンプする確率 |
| `SPIDER_HOP_SPEED` / `SPIDER_HOP_GRAVITY` | 2.4 / 0.18 | 面から離れる初速と面へ戻す重力（高さ ≈ 16px） |
| `SPIDER_THREAD_CHANCE` | 0.25 | 床・天井で走り終わりに糸で向かいの面へ移る確率（小ジャンプより先に引く） |
| `SPIDER_THREAD_MAX_TILES` | 10 | 糸が届く真上・真下の面までの距離 |
| `SPIDER_THREAD_SHOOT_FRAMES` | 8 | 糸が伸びて届くまで（この間は動かない） |
| `SPIDER_THREAD_CLIMB_SPEED` / `SPIDER_THREAD_DESCEND_SPEED` | 1.2 / 1.6 | 糸をたぐって登る／垂らして降りる速さ |
| `COLOR_SPIDER_THREAD` | 半透明の白 | 糸の色 |
| `SPIDER_LEAP_CHANCE` | 0.25 | 壁で走り終わりに向かいの壁へ跳び移る確率（小ジャンプより先に引く） |
| `SPIDER_LEAP_MAX_TILES` | 5 | 跳び移れる向かいの壁までの距離 |
| `SPIDER_LEAP_SPEED` | 4 | 跳び移りの速さ（直線） |
| `SPIDER_FALL_GRAVITY` / `SPIDER_FALL_MAX` | 0.25 / 6 | 足場を失ったときの落下 |
| `SPIDER_SIGHT_RANGE` | 500 | 撃つ距離（`sightScaleFor(game)` を掛ける） |
| `SPIDER_FIRE_INTERVAL` | 180 | 3秒 |
| `SPIDER_FIRE_RETRY` | 30 | 撃てなかったときの再試行 |
| `SPIDER_FIRE_WINDUP` | 20 | 撃つ前に止まる（予備動作） |
| `SPIDER_SHELL_SPEED` / `SPIDER_SHELL_GRAVITY` | 8 / 0.10 | 弾の初速と重力（グレネードは 5 / 0.20） |
| `SPIDER_SHELL_AIM_ABOVE` | 80 | 狙う点＝自機の中心から何 px 上 |
| `SPIDER_SHELL_BURST_DX` | 40 | 「自機より上で横が近い」の横の距離 |
| `SPIDER_SHELL_LIFETIME` | 240 | 寿命（切れたら破裂） |
| `SPIDER_SHELL_RADIUS` | 4 | 弾の半径（普通の敵弾は 2。霧の中で見えるよう大きめ） |
| `SPIDER_SHELL_FRAGMENTS` / `SPIDER_SHELL_SPREAD` | 5 / `Math.PI / 3` | 破裂の数と扇の全幅（60°） |
| `SPIDER_SHELL_INTERCEPT_RADIUS_SQ` | 100 | 自機の弾が弾に当たったとみなす距離² |
| `SPIDER_SHELL_SCORE` | 20 | 撃ち落とし（`HOMING_INTERCEPT_SCORE` と同じ） |
| `SPIDER_SHELL_BLINK_FRAMES` | 20 | 破裂の何フレーム前から点滅するか |
| `COLOR_SPIDER_SHELL` / `COLOR_SPIDER_SHELL_BLINK` | 光るシアン系 / 白 | 霧の中で見える色 |

## Review Focus

1. **地形の隙間・薄い柱・1タイルの段差で体が岩にめり込む／宙に浮いたまま止まる** — どんな格子でも、張り付いている間は箱が岩と重ならず、足元（`down` 側 1px）に岩がある。→ Task 1 の「乱数の格子で不変条件」テスト
2. **跳んでいる途中に斜め上の角に当たる・天井で小ジャンプ・糸の途中で支点が壊れる** — 空中で何かに触れたら、触れた側の面に張り付く（めり込まない）。支点が消えたら落ちる。→ Task 2 の「天井で小ジャンプして天井に戻る」「壁から向かいの壁へ跳び移る」「糸の支点が壊れると落ちる」
3. **自機が真下・真上・射程の外にいるとき** — 解が無い・軌道が岩に当たるなら撃たず `SPIDER_FIRE_RETRY` 後にやり直す。真下（dx≈0）でも角度が NaN にならない。→ Task 3 の「真下の狙い」「届かない」
4. **破裂した5発が同じフレームに自機に当たる／破裂が `enemyBullets` の走査を壊す** — 走査中に push された破片はそのフレームに処理されず、次のフレームから飛ぶ。直撃では破片を出さない。→ Task 4 の「直撃では破片を出さない」「走査中の破裂」
5. **グレネードの爆風が他の敵弾まで消す／敵のグレネードがスパイダーの弾を消す** — 消えるのは自機のグレネードの半径内のスパイダーの弾だけ。→ Task 5 の「グレネード」テスト

---

### Task 1: 面に沿って進む規則（純粋関数）

**Files:**
- Create: `src/js/utils/surfaceCrawl.js`
- Modify: `src/js/utils/Constants.js`（スパイダー節を新設。この Task では `SPIDER_SIZE` だけ）
- Test: `tests/spider-crawl.test.js`

**Interfaces:**
- Produces:
  - 面の名前 `'floor' | 'ceiling' | 'wallL' | 'wallR'`（`wallL` ＝ 岩が左にある）
  - `downOf(surface) -> {x, y}`（floor=(0,1), ceiling=(0,-1), wallL=(-1,0), wallR=(1,0)）
  - `stepCrawl(isSolid, body, dist) -> body`。`isSolid(r, c) -> boolean`（範囲外は呼んだ側が true を返す）、
    `body = { x, y, size, surface, fwd: {x, y} }`（`x, y` は箱の左上、`fwd` は面に沿った単位ベクトル）。
    `dist` px だけ進めた新しい body を返す（引数は書き換えない）。足場が無くなったら `surface: null` を返す（＝落ちる、呼んだ側が処理）
  - `hasSupport(isSolid, body) -> boolean`（`down` 側 1px に岩があるか）
  - `boxHitsSolid(isSolid, x, y, size) -> boolean`

規則（テストが縛る）:
- **へこんだ角**: 進んだ先で箱が岩に当たる → 岩に接する位置で止め、`surface` を前の壁に（`down = 旧 fwd`）、`fwd = -旧 down`
- **出っ張った角**: 進んだ結果、足元に岩が無くなった → 直前まで乗っていたタイルが残っていれば、その角を回る（`down = -旧 fwd`、`fwd = 旧 down`、箱をそのタイルの側面に沿わせ、角の位置に合わせる）。残っていなければ `surface: null`
- 1回の `dist` は `size` 未満の前提（呼ぶ側の速さは 1.6）。角を回った余りの距離は捨ててよい

- [ ] **Step 1: 失敗するテストを書く** — `tests/spider-crawl.test.js`。ASCII の格子（`'#'` = 岩）から `isSolid` を作る小さな関数をテスト内に置く（範囲外は岩）。テスト名と主張:
  - `床を右へ進み、前の壁で壁を登る向きに変わる` — 10×10 の部屋の床に置き、右へ数十回 `stepCrawl(…, 1.6)` → `surface === 'wallR'`、`fwd` が `{x:0, y:-1}`、箱の右端 == 壁の左面の x
  - `壁を登りきると天井に移り、壁から離れる向きに進む` — 続けて進めると `surface === 'ceiling'`、`fwd.x === -1`
  - `床の端で外の側面へ回り込み、下へ進む` — 宙に浮いた横長の台（3×8 タイル）の上面を右へ → `surface === 'wallL'`、`fwd` が `{x:0, y:1}`、箱の左端 == 台の右面の x
  - `天井の端で回り込んで上へ進む` — 天井から下がった板の下面を進む → 端で `wallL` か `wallR`、`fwd.y === -1`
  - `床に立つ1タイル幅の柱を乗り越えて床に戻る` — 柱（幅1・高さ3）の左から右へ。十分進めると柱の右側の床で `surface === 'floor'`、`fwd.x === 1`
  - `足場のタイルが消えたら surface が null` — 床のタイルを `isSolid` から消して1歩 → `surface === null`
  - `乱数の格子で、張り付いている間は岩にめり込まず足場がある` — `SeededRNG` で 40×30 の格子に岩をばらまいた 20 枚それぞれ、空いて足場のある位置から 3000 歩。`surface !== null` の間は毎歩 `boxHitsSolid === false` かつ `hasSupport === true`
- [ ] **Step 2: 走らせて落ちることを確かめる** — `npm test -- tests/spider-crawl.test.js` → import が無くて FAIL
- [ ] **Step 3: `surfaceCrawl.js` を実装する** — 上の Interfaces と規則のとおり。タイル境界への寄せは `TILE_SIZE` で計算する。冒頭コメントに「なぜ walkerBody を使わないか」（設計書の案2の理由）を書く
- [ ] **Step 4: 走らせて通ることを確かめる** — `npm test -- tests/spider-crawl.test.js` → PASS、続けて `npm test` → 全部 PASS
- [ ] **Step 5: わざと壊して赤くなるか確かめる** — 出っ張った角の `fwd = 旧 down` を `-旧 down` に変えて、「外の側面へ回り込み」と「乱数の格子」が落ちることを見てから戻す
- [ ] **Step 6: コミット**

```bash
git add src/js/utils/surfaceCrawl.js src/js/utils/Constants.js tests/spider-crawl.test.js
git commit -m "feat: スパイダーが面に沿って這う規則（surfaceCrawl）"
```

### Task 2: スパイダーの体（這う・止まる・小ジャンプ・糸で登る/降りる・跳び移り・落ちる・被弾・撃破）

**Files:**
- Create: `src/js/entities/EnemySpider.js`
- Create: `src/js/entities/debris/spiderParts.js`
- Modify: `src/js/entities/debris/index.js`（`DEBRIS_SPECS` に `spider: spiderDebris`）
- Modify: `src/js/entities/destruction.js`（`DESTRUCTION_PROFILES` に `spider` 行。ドローンの行と同じ中身）
- Modify: `src/js/utils/Constants.js`（表の移動まわりの定数、`SPIDER_HP`、`SPIDER_SCORE`）
- Test: `tests/enemy-spider.test.js`、`tests/debris-static-parts-match-draw.test.js`（スパイダーのケースを1つ足す）

**Interfaces:**
- Consumes: Task 1 の `stepCrawl` / `hasSupport` / `boxHitsSolid` / `downOf`
- Produces:
  - `new EnemySpider(game, x, y, surface)` — `width = height = SPIDER_SIZE`、`hp = maxHp = SPIDER_HP`、`alive`、`surface`（落下中・空中は `null`）、`fwd`、`mode: 'crawl' | 'pause' | 'hop' | 'thread' | 'leap' | 'fall' | 'windup'`、糸の支点 `threadAnchor: {x, y} | null`（`thread` の間だけ。描画と Task 3 が読む）
  - `this.rng = spawnStateRng(game, x, y)` を判断（走る長さ・止まる長さ・向き・跳ぶか）すべてに使う（`Math.random` は使わない）
  - `update()`、`takeDamage(amount)`（`applyDamage` に委ねる）、`die()`（`playDestruction(game, this, 'spider')` と `game.addScore(SPIDER_SCORE)`）、`draw(ctx)`
  - 撃つ処理は Task 3 で `update()` に足す。この Task では `_updateFire()` を呼ぶ場所だけ置かず、移動だけ作る
- `isSolid` は `(r, c) => game.map.isSolid(r, c)`。`mgDamageMult` と `recoilProfile` は持たない

振る舞い（テストが縛る）:
- crawl: `SPIDER_CRAWL_SPEED` で `stepCrawl`。長さ `SPIDER_RUN_FRAMES` の範囲で引く。走り終わったら順に、床・天井なら `SPIDER_THREAD_CHANCE`（真上・真下の面が `SPIDER_THREAD_MAX_TILES` 以内で、箱の幅の通り道が空いているときだけ）、壁なら `SPIDER_LEAP_CHANCE`（向かいの壁が `SPIDER_LEAP_MAX_TILES` 以内のときだけ）→ `SPIDER_HOP_CHANCE` → それ以外は pause
- thread: 床からは支点＝真上の天井の下面、天井からは支点＝今の天井の下面。`SPIDER_THREAD_SHOOT_FRAMES` は止まって糸が伸びる（描画は支点まで伸びていく線）。その後、床からは `SPIDER_THREAD_CLIMB_SPEED` で真上へ、天井からは `SPIDER_THREAD_DESCEND_SPEED` で真下へ動き、着いた面に張り付いて `threadAnchor = null`。途中で支点のタイルが壊れたら（`isSolid` が false）fall。糸は当たり判定を持たない
- pause: `SPIDER_PAUSE_FRAMES` 止まる。明けに `SPIDER_TURN_CHANCE` で `fwd` を反転
- hop: 速度 `-down × SPIDER_HOP_SPEED`、毎フレーム `down × SPIDER_HOP_GRAVITY` を足す。箱が岩に当たる手前で止めて、当たった側の面に張り付く（元の面に戻るのがふつう）
- leap: `-down` 方向へ `SPIDER_LEAP_SPEED` で直進し、当たった面に張り付く（`down` が反転）
- fall: `stepCrawl` が `surface: null` を返した／張り付いている面の足場が消えた（`hasSupport` が false）とき。世界の下向きに `SPIDER_FALL_GRAVITY`、最大 `SPIDER_FALL_MAX`。何かに当たったらその側の面に張り付く
- 絵: 張り付く面に合わせて回す（floor 0、wallR −90°、ceiling 180°、wallL 90°）。胴は雲形ではなくクモ型の丸い胴に4本の脚（脚は歩きの位相で動かす）。破片パーツと一致させるため、胴と目は `fillRect` で描く

- [ ] **Step 1: 失敗するテストを書く** — `tests/enemy-spider.test.js`。`makeMap` / `makeGame`（`tests/helpers/enemy-world.js`）を使い、`game.weekSeed` と `game.missionsCompleted = 5` を入れる。主張:
  - `床に置くと動き出し、2000フレームのあいだ岩にめり込まない` — 毎フレーム `boxHitsSolid(…) === false`、少なくとも1回は x が初期値から 32px 以上動く
  - `部屋の中で十分動かすと床以外の面にも張り付く` — 閉じた部屋で 6000 フレーム。見た `surface` の集合に `'floor'` 以外が1つ以上
  - `天井で小ジャンプしても天井に戻る` — 天井に置き、`mode` を強制的に hop にして 120 フレーム → `surface === 'ceiling'`、途中で y が初期値より大きくなった（下へ跳んだ）
  - `床から糸で天井へ登る` — 高さ 8 タイルの通路の床に置き、thread を強制 → 途中は `surface === null` で y が単調に減り、`threadAnchor.y` が天井の下面。最後は `surface === 'ceiling'`、`threadAnchor === null`
  - `天井から糸で床へ降りる` — 同じ通路の天井に置き、thread を強制 → y が単調に増え、`surface === 'floor'`
  - `糸の支点が壊れると落ちる` — 登っている途中で支点のタイルを格子から消す → `mode === 'fall'`、その後 `surface === 'floor'`
  - `真上が遠すぎる・塞がっていれば糸を使わない` — 天井が 12 タイル上の床で 3000 フレーム → `mode` が一度も `'thread'` にならない
  - `壁から向かいの壁へ跳び移る` — 幅 4 タイルの縦穴の壁に置き、leap を強制 → 反対側の壁に張り付く（`wallL` ⇄ `wallR`）
  - `足場を壊すと落ちて床に張り付く` — 宙の台の上に置き、台のタイルを格子から消す → 数十フレームで下の床に `surface === 'floor'`
  - `同じ場所に置いた2体は同じ動きをする` — 同じ `weekSeed`・同じ位置で2体作り、300 フレーム後の `x, y, surface` が一致（決定性）
  - `HP 8 で、MG 相当のダメージで壊れ、点が入り alive が落ちる` — `takeDamage` を `SPIDER_HP` ぶん → `alive === false`、`addScore` に `SPIDER_SCORE`
  - 破片: `tests/debris-static-parts-match-draw.test.js` にスパイダーを1件足す（`spiderDebris.parts` が `draw()` の `fillRect` と一致）
- [ ] **Step 2: 走らせて落ちることを確かめる** — `npm test -- tests/enemy-spider.test.js` → FAIL
- [ ] **Step 3: `EnemySpider.js` と `spiderParts.js`、`destruction.js` / `debris/index.js` の1行を実装する**
- [ ] **Step 4: 走らせて通ることを確かめる** — 2ファイル → PASS、`npm test` → 全部 PASS
- [ ] **Step 5: わざと壊して赤くなるか確かめる** — hop の重力の符号を逆にして「天井で小ジャンプ」が落ちることを見てから戻す
- [ ] **Step 6: コミット**

```bash
git add src/js/entities/EnemySpider.js src/js/entities/debris/spiderParts.js src/js/entities/debris/index.js \
  src/js/entities/destruction.js src/js/utils/Constants.js tests/enemy-spider.test.js tests/debris-static-parts-match-draw.test.js
git commit -m "feat: スパイダーの体（這う・小ジャンプ・糸で登る/降りる・跳び移り・落下・撃破）"
```

### Task 3: 弾の軌道の逆算と、スパイダーが撃つ処理

**Files:**
- Create: `src/js/utils/shellBallistics.js`
- Create: `src/js/entities/EnemyBurstShell.js`（この Task では飛ぶだけ。破裂は Task 4）
- Modify: `src/js/entities/Bullet.js`（`spec.sound` が無ければ鳴らさない。1行）
- Modify: `src/js/entities/EnemySpider.js`（撃つ処理）
- Modify: `src/js/audio/weaponSounds.js`（`spiderLaunch` の行）
- Modify: `src/js/utils/Constants.js`
- Test: `tests/spider-shell-ballistics.test.js`、`tests/enemy-spider.test.js`（撃つケースを足す）

**Interfaces:**
- Produces:
  - `solveLaunch(dx, dy, speed, gravity) -> { angle, frames } | null` — 発射点から見た狙いの点 `(dx, dy)`（y は下が正）へ、初速 `speed`・重力 `gravity`（毎フレーム `vy += gravity`）で届く**低い方の弧**。`frames` は狙いの点に着くまでのフレーム数（整数に丸める）。届かなければ `null`。`dx ≈ 0` でも NaN を返さない
  - `simulateShell(x, y, angle, speed, gravity, frames) -> Array<{x, y}>` — 弾の `update()` と同じ順（`vy += g` → `x += vx; y += vy`）で位置を並べる。軌道の事前確認とテストが使う
  - `new EnemyBurstShell(game, x, y, angle, target)` — `Bullet` を継承（`speed: SPIDER_SHELL_SPEED`、`radius: SPIDER_SHELL_RADIUS`、`lifetime: SPIDER_SHELL_LIFETIME`、`sound: 'spiderLaunch'`）、`isPlayerOwned = false`、`isBurstShell = true`、`target = { x, y, frames }`、`age = 0`。`update()` を上書きして重力を足す（水の抗力は 6面に水が無いので扱わない）
- Consumes: Task 2 の `EnemySpider`

撃つ処理（テストが縛る）:
- `fireTimer` が 0 で、自機が生きていてドック中でなく、`withinSight(dx, dy, SPIDER_SIGHT_RANGE * sightScaleFor(game))` かつ `hasLineOfSight(スパイダーの中心, 自機の中心)` のとき
- 狙いの点 = `(自機の中心x, 自機の中心y − SPIDER_SHELL_AIM_ABOVE)`。発射点 = スパイダーの中心から `-down × 6`
- `solveLaunch` が `null`、または `simulateShell` の点のどれかが `game.map.isSolidAtPixel` → 撃たずに `fireTimer = SPIDER_FIRE_RETRY`
- `mode` が `thread` / `hop` / `leap` / `fall` の間は撃たない（タイマーは 0 で待つ）
- 撃てるなら `mode = 'windup'` で `SPIDER_FIRE_WINDUP` フレーム止まってから、`game.enemyBullets.push(new EnemyBurstShell(...))`、`fireTimer = SPIDER_FIRE_INTERVAL`。windup が明けた時点で狙いは計算し直す
- 初回の `fireTimer` は `this.rng` から `[0, SPIDER_FIRE_INTERVAL)` で引く

- [ ] **Step 1: 失敗するテストを書く**
  - `tests/spider-shell-ballistics.test.js`:
    - `横 300・上 80 の点を低い弧で通る` — `solveLaunch(300, -80, 8, 0.1)` の `angle, frames` を `simulateShell` で回し、`frames` 番目の点が狙いから 6px 以内。もう一方の解（高い弧）より最高点が低い（＝角度が小さい）
    - `下にある点にも届く（天井から撃つ）` — `solveLaunch(120, 200, 8, 0.1)` が null でなく、同じく 6px 以内
    - `真下の狙いでも NaN にならない` — `solveLaunch(0, 150, 8, 0.1)` の `angle` が有限
    - `届かない点は null` — `solveLaunch(900, 0, 8, 0.1) === null`（平地の最大到達距離は v²/g = 640）
  - `tests/enemy-spider.test.js` に追加:
    - `見通しのよい自機には撃ち、弾が狙いの点へ向かう` — 床のスパイダー、横 250px の自機、`fireTimer = 0` → `SPIDER_FIRE_WINDUP` 後に `enemyBullets` に `isBurstShell` が1つ、その `target` が自機の中心の 80px 上
    - `軌道が岩に当たるなら撃たない` — 間に低い天井を置く → 撃たれず、`fireTimer === SPIDER_FIRE_RETRY`
    - `射程の外・ドック中には撃たない`
    - `糸にぶら下がっている間は撃たず、張り付いたら撃つ` — thread の途中で `fireTimer = 0`・自機が見える → 弾は出ない。張り付いた後の windup を経て1発
- [ ] **Step 2: 走らせて落ちることを確かめる**
- [ ] **Step 3: 実装する** — `solveLaunch` は連続の式（`tanθ = (v² − √(v⁴ − g(g·dx² + 2·dy·v²))) / (g·dx)`。y 下向きなので符号に注意し、`dx < 0` は左右反転で扱う）で角度を出し、`frames = |dx| / (v·cosθ)`。離散の誤差はテストの 6px で受ける。`spiderLaunch` の音は軽い「ポン」（`grenade` の行より短く高め）。重さは `weapon-sounds.test.js` の基準比 −14〜+3dB の枠に入れる
- [ ] **Step 4: 走らせて通ることを確かめる** — 3ファイル → PASS、`npm test` → 全部 PASS（`weapon-sounds.test.js` が新しい行を自動で測る）
- [ ] **Step 5: コミット**

```bash
git add src/js/utils/shellBallistics.js src/js/entities/EnemyBurstShell.js src/js/entities/Bullet.js \
  src/js/entities/EnemySpider.js src/js/audio/weaponSounds.js src/js/utils/Constants.js \
  tests/spider-shell-ballistics.test.js tests/enemy-spider.test.js
git commit -m "feat: スパイダーが自機の頭上へ緩い弧で弾を撃つ"
```

### Task 4: 弾の破裂（狙いの点・自機の上・地形・建物・寿命・直撃）

**Files:**
- Modify: `src/js/entities/EnemyBurstShell.js`
- Modify: `src/js/systems/CollisionManager.js`（`_applyBulletHit` に直撃の枝）
- Modify: `src/js/audio/weaponSounds.js`（`spiderBurst` の行）
- Modify: `src/js/utils/Constants.js`
- Test: `tests/spider-shell.test.js`

**Interfaces:**
- Consumes: Task 3 の `EnemyBurstShell`
- Produces:
  - `shell.burst({ fragments = true } = {})` — `alive = false`、破裂の小さな爆発と `audioManager.playWeapon('spiderBurst', x, y)`。`fragments` が true なら、その場から**自機の中心へ向けて** `SPIDER_SHELL_FRAGMENTS` 発を全幅 `SPIDER_SHELL_SPREAD` で等間隔に、`ShellFragment` として `game.enemyBullets` に push。自機がいなければ真下へ向けた扇
  - `ShellFragment`（同じファイルで export）— `Bullet` を継承、速さ `ENEMY_BULLET_SPEED`・半径 `ENEMY_BULLET_RADIUS`・寿命 `ENEMY_BULLET_LIFETIME`・音なし（5発同時に `enemyMg` を鳴らすと重なって大きくなるため。破裂音1つで代える）、`isPlayerOwned = false`、色は弾と同じ。ダメージは `_applyBulletHit` の既定（`ENEMY_BULLET_DAMAGE`）
  - `onTownWall(x, y)` を上書き: 位置を合わせて `burst()`（建物に当たっても破裂。設計書の決定）

破裂の条件（`update()` の中、移動のあと。テストが縛る）:
1. `age >= target.frames`（狙いの点に着いた）
2. 自機が生きていて、`shell.y < player.y`（自機の上端より上）かつ `|shell.x − 自機の中心x| <= SPIDER_SHELL_BURST_DX`
3. `game.map.isSolidPoint(x, y)`（地形）
4. 寿命切れ
- 直撃（`CollisionManager._applyBulletHit` で `bullet.isBurstShell`）: ダメージは既定のまま、`bullet.burst({ fragments: false })`
- 破裂が近い（条件1まで `SPIDER_SHELL_BLINK_FRAMES` 以内）ときは `COLOR_SPIDER_SHELL_BLINK` と交互に点滅して描く

- [ ] **Step 1: 失敗するテストを書く** — `tests/spider-shell.test.js`（`makeGame` に `player` を置く。`audioManager` は `tests/audio-wiring.test.js` の `spyAudio` の作りで差し替えて記録）:
  - `狙いの点に着くと破裂して5発が自機へ向かう` — 撃たせて `target.frames` フレーム回す → 弾は `alive === false`、`ShellFragment` が5つ、5発の向きの平均が自機の中心の方向（±3°）、両端の角度差が 60°（±0.5°）、全部が自機より上から下向き（`vy > 0`）
  - `自機が弾の下に動いてくると、狙いの点より手前で破裂する` — 途中で自機を弾の真下へ移す → `age < target.frames` で破裂
  - `自機と同じ高さで横を通る弾は横では破裂しない` — 自機を弾の進路の真横（同じ y）に置き続ける → 条件2で破裂しない（`shell.y < player.y` を満たさない）
  - `地形に当たると破裂する` / `寿命で破裂する`
  - `建物に当たると破裂する` — `onTownWall(x, y)` を呼ぶ → 破片5つ
  - `直撃では破片を出さない` — `CollisionManager` を本物で作り、弾を自機の箱の中に置いて `update()` → 自機の HP が `ENEMY_BULLET_DAMAGE` だけ減り、`ShellFragment` は0
  - `走査中の破裂は同じフレームに破片を進めない` — `CollisionManager.update()` 1回で破裂させ、直後の破片の位置が破裂点と一致
  - `破裂音は1回、破片の発射音は鳴らない` — 記録した `playWeapon` の呼び出しに `'spiderBurst'` が1回、`'enemyMg'` は0回
- [ ] **Step 2: 走らせて落ちることを確かめる**
- [ ] **Step 3: 実装する** — `spiderBurst` は短い「パン」（`puffs` 1つ＋短い `hiss`）。基準比 −14〜+3dB の枠
- [ ] **Step 4: 走らせて通ることを確かめる** — `npm test` → 全部 PASS
- [ ] **Step 5: わざと壊して赤くなるか確かめる** — 条件2の `shell.y < player.y` を外して「同じ高さで横を通る弾」が落ちることを見てから戻す
- [ ] **Step 6: コミット**

```bash
git add src/js/entities/EnemyBurstShell.js src/js/systems/CollisionManager.js src/js/audio/weaponSounds.js \
  src/js/utils/Constants.js tests/spider-shell.test.js
git commit -m "feat: スパイダーの弾が自機の頭上で破裂して5発を降らせる"
```

### Task 5: 撃ち落とし（MG は跳弾、ミサイルとグレネードで壊れる）

**Files:**
- Modify: `src/js/systems/CollisionManager.js`（`_checkInterception` に `bullet.isBurstShell` の枝）
- Modify: `src/js/entities/EnemyBurstShell.js`（`destroyShellsInRadius` を export）
- Modify: `src/js/entities/Grenade.js`（自機のグレネードの枝で `destroyShellsInRadius` を呼ぶ）
- Modify: `src/js/utils/Constants.js`
- Test: `tests/spider-shell.test.js`（追記）

**Interfaces:**
- Consumes: Task 3・4 の `EnemyBurstShell`、既存の `playRicochet(game, x, y, vx, vy)`、`playBlast`
- Produces:
  - `shell.destroyByPlayer()` — 破裂させずに消す（`alive = false`、小さな爆発 `playBlast(game, x, y, 'homingHit')`、`game.addScore(SPIDER_SHELL_SCORE)`）
  - `destroyShellsInRadius(game, x, y, radius) -> number` — `game.enemyBullets` のうち `isBurstShell` で生きていて中心が半径内のものを `destroyByPlayer()`。壊した数を返す

規則:
- `_checkInterception`: 距離² < `SPIDER_SHELL_INTERCEPT_RADIUS_SQ` のとき、自機のミサイルなら `destroyByPlayer()` してミサイルを消費（`exploded = true`）。MG（`PlayerBullet`）なら `playRicochet(game, proj.x, proj.y, proj.vx, proj.vy)` して MG の弾だけを消す（弾は無傷のまま飛び続ける）。どちらも `true` を返す
- `Grenade._explode` の自機の枝で `destroyShellsInRadius(this.game, this.x, this.y, GRENADE_DAMAGE_RADIUS)`。敵の枝では呼ばない

- [ ] **Step 1: 失敗するテストを書く** — 追記:
  - `MG の弾は跳ね返され、弾は飛び続ける` — 本物の `CollisionManager`、弾の位置に `PlayerBullet` → 弾は `alive === true`、MG の弾は `alive === false`、`playWeapon('armorRicochet')` が呼ばれた
  - `ミサイルで壊れ、破片を出さず、点が入る` — `Missile`（`isPlayerOwned = true`）→ 弾 `alive === false`、`ShellFragment` 0、`addScore(SPIDER_SHELL_SCORE)`
  - `自機のグレネードの爆風で壊れる` — 半径内に弾を置いて自機の `Grenade._explode()` → `alive === false`
  - `グレネードは普通の敵弾を消さない` — 同じ爆風の中の `EnemyBullet` は `alive === true`
  - `敵のグレネードではスパイダーの弾は消えない` — `isPlayerOwned = false` のグレネード → 弾は生きている
- [ ] **Step 2: 走らせて落ちることを確かめる**
- [ ] **Step 3: 実装する** — 判別子は `isBurstShell` フラグ（`constructor.name` は使わない。`isBaseLaser` と同じ作法）
- [ ] **Step 4: 走らせて通ることを確かめる** — `npm test` → 全部 PASS
- [ ] **Step 5: コミット**

```bash
git add src/js/systems/CollisionManager.js src/js/entities/EnemyBurstShell.js src/js/entities/Grenade.js \
  src/js/utils/Constants.js tests/spider-shell.test.js
git commit -m "feat: スパイダーの弾は MG で跳弾、ミサイル・グレネードで撃ち落とせる"
```

### Task 6: 6面の右半分に置く

**Files:**
- Modify: `src/js/world/mapgen/spawns.js`（`_findSpiderPositions()`）
- Modify: `src/js/world/Map.js`（`constructor` で `this.spiderSpawns = []`、`_generate()` の `this.orbSpawns = this._findOrbPositions();` の直後に `this.spiderSpawns = this._findSpiderPositions();`）
- Modify: `src/js/systems/SpawnManager.js`（ドローンの直後に生成）
- Modify: `src/js/utils/Constants.js`（`SPIDER_MISSION` / `SPIDER_LAST_MISSION` / `SPIDER_COUNT` / `SPIDER_SPAWN_SALT` / `SPIDER_SPAWN_MIN_COL_GAP`）
- Test: `tests/spider-spawns.test.js`

**Interfaces:**
- Produces: `map.spiderSpawns: Array<{ x, y, surface }>`（`x, y` は箱の左上。箱は張り付く面に接し、もう一方の軸はタイルの中央）
- `SpawnManager.spawnEnemies()` で `for (const p of game.map.spiderSpawns) game.enemies.push(new EnemySpider(game, p.x, p.y, p.surface));`（`resolveOverlap` は通さない）

置き方:
- `missionLevel` が `SPIDER_MISSION`〜`SPIDER_LAST_MISSION` の外なら `[]` を返し、**乱数を作りもしない**
- 候補: 列 `c >= floor(cols / 2)`、空のタイルで上下左右のどれかが岩、`_reservedRects()` の外、Orb と同じ `keepOut`（地雷・敵・基地の湧き位置の箱の周り1タイル）に掛からない
- 張り付く面は、隣の岩のうち **天井 → 壁 → 床** の順で選ぶ（頭上からの攻撃を増やすため。私の判断。設計書に追記する）
- 派生ストリームで混ぜて、先頭から `SPIDER_COUNT` 体。選んだものどうしの列を `SPIDER_SPAWN_MIN_COL_GAP` 以上離す

- [ ] **Step 1: ベースラインの指紋を取る** — `node tools/trace-map.mjs > "$SCRATCH/map-before.json"`（`$SCRATCH` はセッションのスクラッチパッド）
- [ ] **Step 2: 失敗するテストを書く** — `tests/spider-spawns.test.js`（`MapDeterminism.test.js` と同じ DOM の stub と `buildMap`）:
  - `6面（missionLevel 5）では数体が右半分に置かれ、面に接している` — シード 3つ。`spiderSpawns.length` が 1〜`SPIDER_COUNT`、すべて `x >= map.width / 2`、`boxHitsSolid === false`、`hasSupport === true`（Task 1 の関数で）
  - `6面以外では置かれない` — missionLevel 0〜4・6 で `spiderSpawns` が空
  - `置いても game.rng の進み方は変わらない` — missionLevel 5 で、`_findSpiderPositions` を空を返すものに差し替えた Map と本物で、生成後の `game.rng.state` と他の湧き位置が一致
  - `同じシードなら同じ場所` — 2回作って `deepEqual`
  - `SpawnManager が EnemySpider を作る` — 本物の Map（missionLevel 5）で `spawnEnemies()` → `game.enemies` に `EnemySpider` が `spiderSpawns.length` 体
- [ ] **Step 3: 走らせて落ちることを確かめる**
- [ ] **Step 4: 実装する**
- [ ] **Step 5: 走らせて通ることを確かめる** — `npm test` → 全部 PASS
- [ ] **Step 6: 指紋を比べる** — `node tools/trace-map.mjs > "$SCRATCH/map-after.json" && node tools/trace-map.mjs --compare "$SCRATCH/map-before.json" "$SCRATCH/map-after.json"`。期待: **`rng` / `canvas` / `query` / `draw` / `after` の canvas・query はすべての面で一致**。`state` は新しいフィールド `spiderSpawns` のぶんだけ変わる（全面で変わるのは空配列のフィールドが増えたため）。それ以外の差があれば止まって調べる。続けて `node tools/trace-walkers.mjs` の指紋も前後で一致すること（自機・アタッカーに触れていない確認。手順はツール冒頭のコメント）
- [ ] **Step 7: 設計書に「張り付く面は天井→壁→床の順で選ぶ（私の判断）」を1行足す**
- [ ] **Step 8: コミット**

```bash
git add src/js/world/mapgen/spawns.js src/js/world/Map.js src/js/systems/SpawnManager.js src/js/utils/Constants.js \
  tests/spider-spawns.test.js docs/superpowers/specs/2026-11-22-spider-enemy-design.md
git commit -m "feat: 6面の右半分にスパイダーを置く"
```

### Task 7: 引き渡し

- [ ] **Step 1: `npm test` 全部 PASS を確かめる**
- [ ] **Step 2: ブランチ全体をレビューに出す**（別のエージェント。設計書と計画を渡す）
- [ ] **Step 3: ユーザーに引き渡す** — 確認ポイントと定数の対応表（弾の弧＝`SPIDER_SHELL_SPEED`/`GRAVITY`、狙う高さ＝`SPIDER_SHELL_AIM_ABOVE`、破裂の横の距離＝`SPIDER_SHELL_BURST_DX`、扇＝`SPIDER_SHELL_SPREAD`、霧の中の見え方＝`COLOR_SPIDER_SHELL`/`SPIDER_SHELL_RADIUS`、這う速さ・止まる・跳ぶ・糸＝`SPIDER_CRAWL_SPEED`/`RUN_FRAMES`/`PAUSE_FRAMES`/`HOP_*`/`THREAD_*`/`LEAP_*`、数＝`SPIDER_COUNT`、撃つ間隔＝`SPIDER_FIRE_INTERVAL`）と、**ハードリロード（Cmd+Shift+R）が要ること**を伝える。6面へは `debugStartMission` で行ける
- [ ] **Step 4: memory の phase plan の「現在地」を更新する**
