# 6面の壊せる工場・基地 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3面の壊せる町並みの仕組みに「絵柄の表」を通して、6面（霧）に工場・基地の建物を置き、金属は撃たれると縁が赤く焼けて欠けるようにする。

**Architecture:** `generateTown` の A/C の build 関数の直呼び4か所を「絵柄の表（theme）」の1行から引く形にし、3面の表 `TOWN_THEME` と6面の表 `FACTORY_THEME` を並べる。6面の絵は `factory.js`（工場 P）と `militaryBase.js`（基地 B）。壊れ方・火・誘爆・前景・薄くなるのは既存の `Town` のまま。赤熱だけ `Town` に `metalHeat` オプションで足す。

**Tech Stack:** バニラ ES modules、canvas 2D、`node --test`。依存なし。

**Spec:** `docs/superpowers/specs/2026-11-07-stage6-factory-design.md`

## Global Constraints

- 3面の町は1棟も変えない。`node tools/trace-map.mjs --compare` で6面以外の指紋が IDENTICAL
- 町の生成で `game.rng` を消費しない。6面の派生ストリームの定数は `0x70E4E5` / `0xB0A3B5` / `0x4F3A57` / `0x5E0A71` / `0x1C1CE5` / `0xFAC17E` / `0xFAC57A` / `0xF0A7E5` と重ねない（本計画では建物 `0xFAC70E`、爆発物 `0xFAC7B0`）
- 建物は四角だけ、4px 刻み（`shapes.js` の `rect` / `step4`）。形の数値は描画専用としてモジュールスコープ、調整の数値は `Constants.js`
- 6面の本体の色の輝度: 遠景 rockLight（`backdropColors('#4B3621','fog').rockLight`、24.0）以上、岩 `#4B3621` の 0.85 倍（49.2）以下。差し色は岩の輝度（57.9）以下
- 爆発物の色は弾 `#FFDD33` / `#FFCC00` から色の距離 150 超（既存テスト）
- 金属は燃えない・1発ごとに欠ける。赤熱は6面だけ（3〜5面の金属は今のまま）
- コメントは日本語で「なぜ」。`git add -A` / `git add .` 禁止（`main.js` の `debugStartMission` を巻き込む）。add はファイルを明示
- ソース文字列を grep するテストは書かない

## Review Focus

1. **3面の乱数の引き方が表への移し替えで変わる**（短絡評価の `&& rng.next()` の順序）→ Task 1 で trace-map の IDENTICAL と既存 town-* テストで縛る
2. **熱いかけらがあとで欠ける・崩れる・爆発で消える**と、穴の上に赤い四角が浮く → Task 6 のテスト「消えたかけらの熱は描かない・一覧から外れる」
3. **機体が重なって建物が薄い（alpha < 1）間も赤熱は不透明**だと赤い点だけ浮く → Task 6 のテスト「赤熱は建物の alpha で描く」
4. **赤熱が爆発物を起こす・火をつける**と金属が燃えない決定に反する → Task 6 のテスト「熱は火も誘爆も起こさない」
5. **6面の週の決定性**（同じシードで同じ工場・敵の構成不変）→ Task 5 のテスト

---

### Task 1: 絵柄の表（3面は1ビットも変えない）

**Files:**
- Create: `src/js/world/town/themes.js`
- Modify: `src/js/world/town/generate.js`（床 `buildAdobeTower`/`buildMiningShack`、壁、天井、`placeExplosives` の直呼び4か所）
- Test: `tests/town-themes.test.js`

**Interfaces:**
- Produces: theme の形
  ```js
  {
    wide: 'A', narrow: 'C',                          // adobeShare(headroom) の確率で wide を選ぶ
    floor(style, rng, { maxW, maxH }) → { kind, w, h, footX, footW, parts, insets? } | null,
    wall(style, rng, { maxReach }) → { kind, w, h, parts } | null,     // 壁の右側に張り付く向き
    ceiling(style, rng, { room, maxHang }) → { kind, w, h, parts } | null,  // 上端 4px が天井に埋まる
    explosive(style, rng) → { kind, w, h, parts },   // 下端 4px が床に埋まる
  }
  ```
  `TOWN_THEME`（`themes.js`）。`generateTown({..., theme = TOWN_THEME})`。

- [ ] **Step 1: 変更前の指紋を取る** — `node tools/trace-map.mjs > $CLAUDE_JOB_DIR/tmp/before.json`
- [ ] **Step 2: 失敗するテスト** `tests/town-themes.test.js`:
  - `TOWN_THEME を渡しても省略しても同じ設計図`: 3面の Map（seed 11, missionLevel 2）で `generateTown({... rng: new SeededRNG(77), explosiveRng: new SeededRNG(78)})` と `theme: TOWN_THEME` 付きの結果が `deepEqual`
  - `theme を差し替えると床の建物がその関数から出る`: `floor` が常に `{kind:'probe', w:16, h:20, footX:0, footW:16, parts:[{x:0,y:0,w:16,h:20,color:'#333333',mat:3,solid:true}]}` を返す偽 theme で、`site==='floor'` の spec の kind がすべて `'probe'`（1つ以上ある）
- [ ] **Step 3: 実行して落ちることを確認** — `npm test -- tests/town-themes.test.js` → `themes.js` が無くて FAIL
- [ ] **Step 4: 実装** — `TOWN_THEME.ceiling` は今の天井の分岐（`style==='A' && room >= 64 && rng.next() < 0.5` → 吊り橋 `span: step4(rng, 64, Math.min(160, room))`、`style==='C' && rng.next() < 0.4` → 吊り小屋、他はランタン）を**同じ順で**移す。`explosive` は `style==='A' ? buildOilJarStore : buildMiningExplosive`。`generate.js` の `'A'`/`'C'` の直書きは `theme.wide`/`theme.narrow` に
- [ ] **Step 5: 通す** — `npm test` 全体 PASS
- [ ] **Step 6: 3面の不変** — `node tools/trace-map.mjs > $CLAUDE_JOB_DIR/tmp/after1.json && node tools/trace-map.mjs --compare $CLAUDE_JOB_DIR/tmp/before.json $CLAUDE_JOB_DIR/tmp/after1.json` → 全面 IDENTICAL。わざと天井の `0.5` を `0.51` にして DIFFER が出ることを確かめてから戻す
- [ ] **Step 7: Commit** — `git add src/js/world/town/themes.js src/js/world/town/generate.js tests/town-themes.test.js && git commit -m "refactor: 町の絵柄を表（theme）から引く。3面は不変"`

### Task 2: コンクリートの材料と6面の色

**Files:**
- Modify: `src/js/world/town/chunks.js`（`MAT_CONCRETE = 7`）、`src/js/utils/Constants.js`（`TOWN_MATERIALS[7]` = `TOWN_MATERIALS[1]` と同じ値、`FACTORY_HEAT_COOL`）、`src/js/world/town/palette.js`（`FACTORY_COLORS`・`FACTORY_DETAIL_COLORS`・`FACTORY_HEAT_COLORS`・`TOWN_RUBBLE_COLORS[7]`）
- Test: `tests/factory-palette.test.js`

**Interfaces:**
- Produces:
  - `MAT_CONCRETE`（chunks.js）
  - `FACTORY_COLORS = { steel: [...], blueSteel: [...], paint: [...], concrete: [...] }`（本体。各2〜3色）
  - `FACTORY_DETAIL_COLORS = { dark, rail, glass, lamp, hazard, gauge }`（差し色）
  - `FACTORY_HEAT_COLORS = { hot, burnt }`（赤熱の始まりと冷めきった色）
  - `FACTORY_HEAT_COOL`（Constants.js、フレーム。初期値 90 ＝ 実時間でおよそ1.5秒。根拠をコメントに）

- [ ] **Step 1: 失敗するテスト** `tests/factory-palette.test.js`（`FILL = STAGE_PALETTES[5].fill`、`back = backdropColors(FILL, 'fog')`）:
  - `本体は rockLight 以上、岩の 0.85 倍以下`: `FACTORY_COLORS` の全色と `shade()` が `luminance(back.rockLight) <= l <= luminance(FILL)*0.85`（影は下限を `back.voidColor` に）
  - `差し色は空洞以上、岩の輝度以下`: `FACTORY_DETAIL_COLORS` の全色
  - `赤熱は赤く、弾の黄色から離れている`: `hot` が r > g*1.6 && r > b*1.6、弾2色との色の距離 > 150
  - `コンクリートは日干し煉瓦と同じ燃え方、瓦礫は灰色`: `TOWN_MATERIALS[7]` deepEqual `TOWN_MATERIALS[1]`、`TOWN_RUBBLE_COLORS[7]` の r,g,b の最大と最小の差 ≤ 16
  - `MAT_CONCRETE は MAT_MASK に収まる`: `(MAT_CONCRETE & MAT_MASK) === MAT_CONCRETE` かつ 0〜6 と異なる
- [ ] **Step 2: 落ちることを確認** — `npm test -- tests/factory-palette.test.js`
- [ ] **Step 3: 実装** — 色は輝度を計算して範囲に入れ、括弧で輝度をコメントに残す（palette.js の流儀）。くすんだ黄（機械の塗装）・灰・青灰、白い工場棟は concrete の明るい灰
- [ ] **Step 4: 通す** — `npm test` 全体 PASS
- [ ] **Step 5: Commit** — 変更した4ファイル＋テストを明示して add、`feat: 6面の工場の材料（コンクリート）と色`

### Task 3: 基地 B の絵（militaryBase.js）

**Files:**
- Create: `src/js/world/town/militaryBase.js`
- Test: `tests/factory-base-build.test.js`

**Interfaces:**
- Consumes: `FACTORY_COLORS` / `FACTORY_DETAIL_COLORS`、`MAT_METAL` / `MAT_CONCRETE`、`shapes.js`
- Produces:
  - `buildBaseBuilding(rng, { maxW, maxH })` → kind ∈ `warehouse` / `hangar` / `watchtower` / `radar` / `factoryHall`（足元の幅 16〜64、`footX`/`footW` 付き）| null
  - `buildControlRoom(rng, { maxReach })` → kind `controlRoom`（壁の右側に張り付く。x 0〜4 が壁に埋まる）| null
  - `buildCrane(rng, { span, maxHang })` → kind `crane`（天井のレール幅 = span、上端 4px が天井）| null
  - `buildFactoryLamp(rng, { maxHang })` → kind `lamp`

- [ ] **Step 1: 失敗するテスト**（`tests/town-mining.test.js` と同じ観点）:
  - `床の建物は上限を守り、部品は外接矩形に収まる`: 400回、`footW <= maxW`、`h <= maxH`、部品が `[0,w)×[0,h)` に収まる、kind が5種とも出る
  - `狭い・低い所には建てない`: `maxW: 12` / `maxH: 20` で null、`buildControlRoom(rng,{maxReach:24})` が null
  - `最下段が床に埋まる`: `rasterizeParts` の最下段に空でないかけら
  - `倉庫・工場棟の壁はコンクリートの厚い壁、監視塔の脚とレーダーの骨は細い金属`: kind 別に `(v & MAT_MASK)` と `SOLID` を確認
  - `クレーンは天井に埋まり、幅は span、高さは maxHang 以下`: 最上段（y 0〜4）にかけら、`w === span`、`h <= maxHang`
  - `同じ絵はほとんど出ない`: 200回で parts の JSON の種類 ≥ 150
- [ ] **Step 2: 落ちることを確認**
- [ ] **Step 3: 実装** — 形はスペック1章「床の建物／基地 B」「壁」「天井」。格納庫のかまぼこ屋根・レーダーの皿は 4px の段で
- [ ] **Step 4: 通す** — `npm test` 全体
- [ ] **Step 5: Commit** — `feat: 6面の基地の建物（倉庫・格納庫・監視塔・レーダー・工場棟・制御室・クレーン）`

### Task 4: 工場 P の絵と爆発物（factory.js）

**Files:**
- Create: `src/js/world/town/factory.js`
- Modify: `src/js/world/town/palette.js`（`TOWN_EXPLOSIVE_COLORS` に `chemTank` / `chemBand` を足す。既存の色距離テストに自動で入る）
- Test: `tests/factory-plant-build.test.js`

**Interfaces:**
- Produces:
  - `buildMachine(rng, { maxW, maxH })` → kind ∈ `robotArm` / `press` / `drillPress` / `conveyor` / `compressor` / `chemTank` | null（金属。本体は厚い壁、腕・脚・配管は細い部品）
  - `buildWallPipes(rng, { maxReach })` → kind `wallPipes`（壁の右側。x 0〜4 が壁に埋まる。全部細い部品）| null
  - `buildPipeBundle(rng, { room, maxHang })` → kind `pipeBundle`（天井の横配管の束。上端 4px が天井）| null
  - `buildFactoryExplosive(rng)` → kind ∈ `chemTank` / `gasRack` / `drum`（全部品 `MAT_EXPLOSIVE`・厚い壁、下端 4px が床）

- [ ] **Step 1: 失敗するテスト**:
  - Task 3 と同じ「上限・収まる・最下段・同じ絵は少ない」を `buildMachine` に（6種とも出る）
  - `機械は燃えない（金属だけ）`: `buildMachine` のどのかけらも `MAT_METAL`（`MAT_WOOD` を含まない）
  - `壁の配管は細い部品だけ`: `buildWallPipes` のかけらに `SOLID` が無い、x 0〜4 のかけらがある
  - `配管の束は天井に埋まる`: y 0〜4 にかけら、`h <= maxHang`
  - `爆発物は全部爆発物の厚い壁で、赤く見える`: `buildFactoryExplosive` 60回、かけらは全部 `MAT_EXPLOSIVE|SOLID`、色 `chemTank` が r > g*1.6 && r > b*1.6、3種とも出る
- [ ] **Step 2: 落ちることを確認**
- [ ] **Step 3: 実装**
- [ ] **Step 4: 通す** — `npm test` 全体（`tests/town-palette.test.js` の距離テストに新しい色が入る）
- [ ] **Step 5: Commit** — `feat: 6面の工場の機械・配管・爆発物`

### Task 5: FACTORY_THEME と6面への配線

**Files:**
- Modify: `src/js/world/town/themes.js`（`FACTORY_THEME`）、`src/js/utils/Constants.js`（`STAGE_ENVIRONMENTS[5]` に `props: 'factory'`、行のコメント）、`src/js/world/Map.js:329-331`（`props === 'factory'` → `_generateFactory()`）、`src/js/world/mapgen/features.js`（`_buildFactorySpecs()` / `_generateFactory()`）、`tools/render-town-scene.mjs`（`PROPS === 'factory'` で `_buildFactorySpecs()`）
- Test: `tests/factory-generate.test.js`、`tests/MapDeterminism.test.js`（既存。通ることだけ）

**Interfaces:**
- Consumes: Task 1 の theme の形、Task 3・4 の build 関数
- Produces: `FACTORY_THEME = { wide: 'B', narrow: 'P', floor, wall, ceiling, explosive }`
  - floor: B → `buildBaseBuilding`、P → `buildMachine`
  - wall: B → `buildControlRoom`、P → `buildWallPipes`
  - ceiling: B かつ `room >= 64` かつ `rng.next() < 0.5` → `buildCrane({ span: step4(rng, 64, Math.min(160, room)), maxHang })`、P かつ `rng.next() < 0.5` → `buildPipeBundle`、他は `buildFactoryLamp`
  - explosive: style によらず `buildFactoryExplosive`
- `map._buildFactorySpecs()`: `_buildTownSpecs()` と同じ引数で `theme: FACTORY_THEME`、rng `0xFAC70E`、explosiveRng `0xFAC7B0`
- `_generateFactory()`: `new Town(this._buildFactorySpecs(), { isSolidTile, metalHeat: true })`（`metalHeat` は Task 6 で効く。ここでは渡すだけ）

- [ ] **Step 1: 失敗するテスト** `tests/factory-generate.test.js`（6面 = missionLevel 5、seeds `[11,22,33]`。`tests/town-generate.test.js` の `before` と同じ偽 document）:
  - `6面に工場が建ち、3面以外の面には無い`: missionLevel 5 の `map.town` が非 null で建物 ≥ 20、kind に B と P の両方の種類が入る、`map.town.buildings` の style が `'B'`/`'P'` だけ。missionLevel 0,1,6 は `map.town === null`
  - `基地の部屋と基地の周りには建てない`: `_reservedRects()[1]` に掛かる spec が0、基地の中心から `TOWN_BASE_QUIET_INNER` タイル以内に掛かる spec が0
  - `爆発物は床の岩の上だけ`: kind が爆発物の spec の下端 4px の行が岩
  - `同じシードなら同じ工場`: 同じシードで2回作った `_buildFactorySpecs()` が deepEqual、作る前後で `game.rng.state` が同じ
- [ ] **Step 2: 落ちることを確認**
- [ ] **Step 3: 実装**
- [ ] **Step 4: 通す** — `npm test` 全体
- [ ] **Step 5: 6面以外の不変** — `trace-map` を取り直して `before.json` と比べ、6面（3シードとも）だけ DIFFER、他は IDENTICAL
- [ ] **Step 6: 絵を見る** — `node tools/render-town-scene.mjs --stage 6` の PNG を Read で見て、置き方（埋まり・浮き・天井の空き）と色を確かめる。直したら同じテストを流し直す
- [ ] **Step 7: Commit** — `feat: 6面に工場・基地を置く`

### Task 6: 金属の赤熱（6面だけ）

**Files:**
- Modify: `src/js/world/town/Town.js`（constructor の `metalHeat` オプション、`_charEdges`、`update`、`draw`）
- Test: `tests/factory-heat.test.js`

**Interfaces:**
- Consumes: `FACTORY_HEAT_COLORS`、`FACTORY_HEAT_COOL`、`MAT_METAL`
- Produces: `town.metalHeat`（bool）、`town.hot`（`[{ b, k, age }]`）

挙動:
- `metalHeat` の Town で `_charEdges` が縁のかけらを塗るとき、`(v & MAT_MASK) === MAT_METAL` なら茶色の焦げを塗らずに `hot` に積む（同じ `b, k` が既にあれば `age = 0` に戻す）。金属以外は今どおり
- `update` の毎 tick: `age++`。`b.cells[k] === 0` になったものは捨てる。`age >= FACTORY_HEAT_COOL` で `burnt` を `b.ctx` に焼き込んで捨てる
- `draw`: 画面に掛かる建物の描画のあと、`hot` を `lerpColor(hot, burnt, age / FACTORY_HEAT_COOL)` で `b.alpha` を掛けて fillRect（4px のかけら）。`_shakeOffset` は不要（つららは金属でない）
- `metalHeat` の無い Town（3〜5面）は何も変わらない

- [ ] **Step 1: 失敗するテスト** `tests/factory-heat.test.js`（`tests/town-chip.test.js` の偽 canvas の作り方を流用。建物は手で組んだ金属の 32x32 の厚い壁とコンクリートの 32x32 の2棟、床の岩で支える）:
  - `金属の穴の縁は熱くなり、冷めると焼け色が焼き込まれる`: chip 後 `town.hot.length > 0`、`FACTORY_HEAT_COOL` tick 後に 0、その間に `b.ctx` へ `FACTORY_HEAT_COLORS.burnt` の fillRect がある
  - `コンクリートの縁は茶色の焦げのまま`: コンクリート棟の chip で `hot` が増えず、`TOWN_CHAR_EDGE` の fillRect
  - `metalHeat の無い町では金属も焦げのまま`: 同じ金属棟を `metalHeat` 無しで作ると `hot` は空、`TOWN_CHAR_EDGE`
  - `消えたかけらの熱は描かない・一覧から外れる`: chip で熱くしたかけらをもう一度 chip で欠かすと、次の update で `hot` から消え、draw の fillRect にその位置が無い
  - `赤熱は建物の alpha で描く`: `b.alpha = 0.8` で draw したとき、熱の fillRect の直前の `globalAlpha` が 0.8
  - `熱は火も誘爆も起こさない`: 金属棟の隣に `MAT_EXPLOSIVE` の棟。金属棟を chip して `FACTORY_HEAT_COOL` tick 進めても、爆発物の `exploded === false`、`town.fire` の火元が0
  - 各テストは、該当の行をわざと壊して（`metalHeat` の分岐を外す、`cells[k] === 0` の掃除を外す、alpha を掛けない）赤くなることを確かめる
- [ ] **Step 2: 落ちることを確認**
- [ ] **Step 3: 実装**
- [ ] **Step 4: 通す** — `npm test` 全体、`trace-map --compare` で6面以外 IDENTICAL（Town の変更が他の面に漏れていない）
- [ ] **Step 5: Commit** — `feat: 6面の金属は撃たれると縁が赤く焼ける`

### Task 7: 案内の更新と引き渡し

**Files:**
- Modify: `CLAUDE.md`（「追加する前に」の表に「壊せる背景の工場・基地（6面）」の行: `themes.js` の `FACTORY_THEME` ＋ `factory.js` / `militaryBase.js`、赤熱は `Town` の `metalHeat`）、Constants.js の `STAGE_ENVIRONMENTS` の上の props のコメント

- [ ] **Step 1: 書く**
- [ ] **Step 2: `npm test` 全体 PASS**
- [ ] **Step 3: Commit** — `docs: 6面の工場を CLAUDE.md の表に`
- [ ] **Step 4: 最終レビューを別エージェントに依頼**（ブランチ全体。Review Focus の5点を渡す）
- [ ] **Step 5: ユーザーに実機の確認点と調整用の定数の対応表を渡す**（ハードリロード Cmd+Shift+R）:
  - 色の暗さ（霧の中で読めるか）→ `palette.js` の `FACTORY_COLORS`
  - 赤熱の冷める速さ → `FACTORY_HEAT_COOL`
  - 建物の密度 → `TOWN_VILLAGE_*`（3面と共用。6面だけ変えるなら表に列を足す）
  - 爆発物の数 → `TOWN_EXPLOSIVE_EVERY`（共用）
