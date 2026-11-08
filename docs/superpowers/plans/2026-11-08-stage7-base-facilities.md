# 7面の施設エリアに基地の建物を並べる Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 7面の施設エリアの中に、メタリックで少し硬い、爆発物の無い基地の建物（壊せる町並み）を並べる。

**Architecture:** 3面・6面の `generateTown` と `Town` をそのまま使い、`themes.js` に `BASE_THEME` を1行足す。`generateTown` に置ける範囲（`includeRects`）と足元の判定（`accept`）の2つの省略可能な引数を、`Town` に欠ける量の倍率（`chipScale`）を足す。建物の設計図は新しい `world/town/fortressBase.js`。

**Tech Stack:** バニラ ES modules、canvas 2D、`node --test`。

**Spec:** `docs/superpowers/specs/2026-11-08-stage7-base-facilities-design.md`

## Global Constraints

- 置くのは施設エリア（`map.facilityAreas`）の中だけ。要塞の区画・開始の部屋・敵基地の部屋には建てない
- 金属の斜面・階段の上には建てない（足元・支えのタイルの形が `SHAPE_FULL` の所だけ）
- 爆発物は無し（`explosiveRng` を渡さない、`BASE_THEME` に `explosive` 列を作らない）
- 材料はほぼ金属（`MAT_METAL`）。コンクリート（`MAT_CONCRETE`）・木は使わない。`metalHeat: true`
- 硬さ: 弾・ミサイル・ビームの欠ける半径に `BASE_TOWN_CHIP_SCALE = 0.75`（4px → 3px）
- 乱数は派生ストリーム。建物用の定数は `0xBA5E07`（既存の `0x70E4E5` / `0xB0A3B5` / `0x4F3A57` / `0x5E0A71` / `0x1C1CE5` / `0xFAC70E` / `0xFAC7B0` / `0xFAC17E` / `0xFAC57A` / `0xF0A7E5` と重ならない）。`game.rng` を消費しない
- 3〜6面の町並みは1棟も変わらない（`node tools/trace-map.mjs --compare` で7面以外 IDENTICAL）。**基準の指紋は Task 1 に入る前に取って、作業ディレクトリの外ではなく `.superpowers/` の下に置く**
- 数値は `Constants.js`、描画専用の形の数値は `fortressBase.js` のモジュールスコープ。コメントは日本語で「なぜ」
- `git add -A` / `git add .` 禁止。`src/js/main.js` の `debugStartMission` を巻き込まない
- ゲート: `npm test -- --test-skip-pattern=湧き位置は重複しない`

## Review Focus

1. 斜面の上に浮いた建物: 床の建物の足元の列すべて、壁の建物の支えの行すべて、天井の建物の吊り元の列すべてが四角いタイルか → Task 4 のテスト
2. 施設エリアの縁の金属の帯（HP6）を撃ち抜いたとき、支えを失った建物が崩れるか（3面と同じ支えの判定が7面でも効くか）→ Task 4 で1件
3. 3〜6面の町並みの乱数の引き方が変わっていないか（`includeRects` / `accept` を省略したとき）→ Task 1 と最後の trace-map
4. 欠ける量の倍率がグレネードの爆風・落下物にまで効いていないか（spec は弾・ミサイル・ビームだけ）→ Task 2
5. 施設エリアが少ない週でも例外にならない（エリア 0 個なら建物 0 棟）→ Task 4

---

### Task 1: generateTown に置ける範囲と足元の判定を足す

**Files:**
- Modify: `src/js/world/town/generate.js`（`generateTown` の引数と `fits` / `add`）
- Test: `tests/base-generate.test.js`（新規）

**Interfaces:**
- Produces: `generateTown({ ..., includeRects = null, accept = null })`。`includeRects` はタイルの矩形 `{r0, r1, c0, c1}` の配列（`excludeRects` と同じ形・同じ当たり方の逆）。`null` なら制限なし。`accept(spec) -> boolean` は置く直前に呼ぶ（`null` なら全部可）。どちらも乱数を引かない

- [ ] **Step 1: 失敗するテストを書く**（人工の地図: 床の長い部屋を2つ、片方だけ矩形に入れる）
  - `includeRects を渡すと、建物の外接矩形はどれかの矩形に収まる`
  - `includeRects も accept も省略したとき、同じ地図・同じ種の結果は今と同じ`（省略時と `includeRects: null, accept: null` を明示したときの設計図が `deepEqual`。さらに既存の `tests/factory-generate.test.js` などが通ること）
  - `accept が false を返した建物は置かれない`（例: `accept: (s) => s.site !== 'wall'` で壁の建物が 0）
- [ ] **Step 2:** FAIL を確認
- [ ] **Step 3:** 実装。`fits` に「`includeRects` があれば外接矩形（px）がどれかの矩形（タイル→px）に完全に収まる」と「`accept` があれば真」を足す
- [ ] **Step 4:** PASS、全テストのゲート PASS
- [ ] **Step 5: Commit** `feat: 町の置き方に置ける範囲と足元の判定を足す（7面の基地用）`

### Task 2: Town に欠ける量の倍率を足す

**Files:**
- Modify: `src/js/world/town/Town.js`（constructor の `chipScale = 1`、弾・ミサイルの `_sweep` の `spec.chip` 2か所とビームの `_sweepBeam` の1か所に掛ける）
- Modify: `src/js/utils/Constants.js`（`BASE_TOWN_CHIP_SCALE = 0.75`。根拠: 半径 4px → 3px、欠ける面積およそ半分強。ユーザー「若干硬め」）
- Test: `tests/base-generate.test.js`

**Interfaces:**
- Produces: `new Town(specs, { ..., chipScale })`

- [ ] **Step 1: 失敗するテストを書く**
  - `chipScale 0.75 の町は、同じ位置に弾を1発当てたとき欠けるかけらの数が倍率 1 より少ない`（同じ設計図の厚い壁の建物を2つの Town に作り、同じ弾を当てて抜けたかけらの数を比べる。6面の factory-heat などのテストの弾の当て方に合わせる）
  - `chipScale は爆風（chip(…, 'blast')）と落下物の欠け方には掛からない`（爆風で抜ける数が倍率によらず同じ）
- [ ] **Step 2:** FAIL を確認
- [ ] **Step 3:** 実装
- [ ] **Step 4:** PASS
- [ ] **Step 5: Commit** `feat: 町の欠ける量に倍率を足す（7面の基地は若干硬く）`

### Task 3: 7面の基地の建物と色と表の行

**Files:**
- Create: `src/js/world/town/fortressBase.js`
- Modify: `src/js/world/town/palette.js`（7面の色の表 `FORTRESS_BASE_COLORS` / `FORTRESS_BASE_DETAIL_COLORS`。灰青の金属系、研究室の白っぽい金属。6面の `FACTORY_COLORS` と別）
- Modify: `src/js/world/town/themes.js`（`BASE_THEME`）
- Test: `tests/base-build.test.js`（新規。`tests/factory-base-build.test.js` の形に合わせる）

**Interfaces:**
- Produces（`fortressBase.js`）:
  - `buildFortressBuilding(rng, { maxW, maxH })` … 広い所。kind は `'hangar' | 'commandTower' | 'radarDish' | 'lab'`
  - `buildFortressHut(rng, { maxW, maxH })` … 狭い所。kind は `'barracks' | 'commTower' | 'generator' | 'fence'`
  - `buildFortressWall(style, rng, { maxReach })` … wide: `'watchPost'`、narrow: `'wallPipes'`（壁の右に張り付く向き、x 0〜4 が壁に埋まる）
  - `buildFortressCeiling(style, rng, { room, maxHang })` … `'lamp' | 'camera' | 'duct'`（上端 4px が天井に埋まる）
  - 床の戻り値は `{ kind, w, h, footX, footW, parts }`（`buildBaseBuilding` と同じ形）。満たせないときは `null`
- Produces（`themes.js`）: `BASE_THEME = { wide: 'K', narrow: 'H', floor, wall, ceiling }`（`explosive` 列なし。'K' = keep、'H' = hut。3面 A/C・4面 P・6面 B/F と重ならない文字）

- [ ] **Step 1: 失敗するテストを書く**
  - `どの床の建物も maxW / maxH を超えない`（多数の種で）
  - `かけらになる部品はすべて金属（MAT_METAL）。コンクリート・木・爆発物が無い`（全 build 関数×多数の種）
  - `フェンスは低く横に長い`（h ≤ 32px、w ≥ 2×h）、`研究室は 7面の色の表で一番明るい色を使う`
  - `広い所・狭い所それぞれで4種類とも出る`（種を回して kind の集合）
  - `BASE_THEME に explosive 列が無い`
- [ ] **Step 2:** FAIL を確認
- [ ] **Step 3:** 実装。部品の積み方は `militaryBase.js` に合わせる（`rectWithLoose(MAT_METAL)`、`normalizeUp`、`step4` / `pick`）。窓・金網などは描くだけの細部
- [ ] **Step 4:** PASS
- [ ] **Step 5: Commit** `feat: 7面の基地の建物（格納庫・司令塔・レーダー・研究室・兵舎・鉄塔・発電設備・フェンスほか）`

### Task 4: 7面に組み込む

**Files:**
- Modify: `src/js/utils/Constants.js`（`STAGE_ENVIRONMENTS[6]` に `props: 'base'`、`BASE_TOWN_VILLAGE_PEAK` など施設エリアから村を作るときの値）
- Modify: `src/js/world/mapgen/features.js`（`_buildBaseSpecs()` と `_generateBase()`。`villages` は施設エリアの中心に1つずつ、半径はエリアの対角の半分、濃さは密）
- Modify: `src/js/world/Map.js`（`props === 'base'` → `_generateBase()`。施設エリアと金属の階段・斜面の**後**）
- Modify: `tools/render-town-scene.mjs`、`tools/trace-map.mjs`（`props === 'base'` を `factory` と同じ扱いで描く・指紋に含める）
- Test: `tests/base-generate.test.js`

**Interfaces:**
- Consumes: Task 1〜3 のすべて
- Produces: `map._buildBaseSpecs()`（道具からも呼ぶ）、7面の `map.town`

`accept` は次を満たすときだけ真: 床は足元の行 `run.r` の、建物の足（`x + footX` から `footW`）が掛かる列がすべて `tileShapeAt === SHAPE_FULL`。壁は支えの列の、建物の高さが掛かる行がすべて `SHAPE_FULL`。天井は吊り元の行の、幅が掛かる列がすべて `SHAPE_FULL`。（`generateTown` の spec には `site` / `x` / `y` / `w` / `h` / `footX` / `footW` があるので、行・列はそこから求める。床の行は `Math.floor((spec.y + spec.h) / T)`、天井は `Math.floor(spec.y / T)`、壁は左右どちらに張り付いているかを外接矩形の端のタイルが固いかで見る）

- [ ] **Step 1: 失敗するテストを書く**（実際の7面、8シード）
  - `建物はすべて施設エリアの中`（外接矩形がどれかの `facilityAreas` に収まる）、`区画・開始の部屋・敵基地の部屋に掛からない`
  - `床の建物の足元は四角いタイル`・`壁の支え・天井の吊り元も四角いタイル`
  - `建物は 0 棟ではない`（各シードで 1 棟以上、8シードの合計が施設エリアの数以上）
  - `爆発物が無い`（`town.buildings` に爆発物の印が無い）・`Town は metalHeat と chipScale 0.75 で作られる`
  - `8シードのどこかでフェンスと研究室が出る`
  - `施設エリアが 0 個の地図では建物も 0 棟`（`facilityAreas = []` にした Map で `_buildBaseSpecs()`）
  - `縁の帯（金属）を壊して支えを失った建物は崩れる`（壁の建物を1つ選び、支えのタイルを `damageBlock` で壊して `town.update` を回し、建物が落ちる／消えることを見る。3面の支えのテストの形に合わせる）
  - `週次の決定性`（`MapDeterminism` が通る）・`生成の前後で game.rng.state が同じ`
- [ ] **Step 2:** FAIL を確認
- [ ] **Step 3:** 実装
- [ ] **Step 4:** PASS、ゲート PASS。`node tools/trace-map.mjs` を変更前（main）と変更後で取り、`--compare` で7面以外 IDENTICAL。`node tools/render-town-scene.mjs` で7面の施設エリアを PNG にして見る（斜面の上に浮いた建物・エリアの外の建物が無いか、メタリックに見えるか）
- [ ] **Step 5: Commit**（main.js を触った場合は自分の hunk だけ）`feat: 7面の施設エリアに基地の建物を並べる`
