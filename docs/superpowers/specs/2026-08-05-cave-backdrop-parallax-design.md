# 洞窟遠景の二重スクロール (Cave Backdrop Parallax) 設計

日付: 2026-08-05

## 目的

現在、地形の空洞部分は `COLOR_CAVE_BG`(#1a0a00) のベタ塗り1色で表示されている。
ここに「ほぼ黒に近い暗いトーンで描かれた洞窟の遠景」を敷き、前景(岩場)と遠景の
二重スクロールにして奥行きを出す。

- 前景(岩場) = 現行の `Map.tileCacheCanvas`。カメラと等速でスクロール。
- 遠景(洞窟) = 新規のオフスクリーンcanvas。カメラの15%の速度でしかスクロールしない。

前景の空タイルはすでに透明として描かれているため、遠景はそのまま透過して見える。

## スコープ外

- 当たり判定、エンティティ描画、ミニマップ、タイトル/デモ画面には一切変更を加えない。
- 鍾乳石・岩柱などの構造物シルエットは描かない(前景のシルエット視認性を優先)。

## アーキテクチャ

### 新規ファイル `src/js/world/CaveBackdrop.js`

`Map.js` は既に1184行あるため、遠景の生成ロジックは同居させない。

```
class CaveBackdrop {
  constructor(mapWidth, mapHeight, paletteFill, rng)
  canvas               // 生成済みオフスクリーンcanvas
  width, height        // canvas寸法
  sourceX(camX) -> int // カメラX → 転送元X (純関数)
  sourceY(camY) -> int // カメラY → 転送元Y (純関数)
  draw(ctx, camX, camY) // drawImage 1回
}
```

依存: `SeededRNG`(既存、`game.rng` を受け取る)、`lerpColor`(既存 `utils/color.js`)、
`Constants` の `CANVAS_WIDTH` / `CANVAS_HEIGHT` / `HUD_TOP_HEIGHT` / `HUD_BOTTOM_HEIGHT` /
`FAR_BG_PARALLAX`。

ビューポート寸法は `game.canvas` からではなく `CANVAS_WIDTH` / `CANVAS_HEIGHT` 定数から取る
(`main.js:145-146` で canvas 実寸をこの定数に設定しているため常に一致する)。
これにより `game` に canvas を持たないテストからも `CaveBackdrop` を単体で構築できる。

### 既存ファイルの変更

| ファイル | 変更 |
|---|---|
| `src/js/utils/Constants.js` | `FAR_BG_PARALLAX = 0.15` を追加 |
| `src/js/world/Map.js` | constructor で `this.backdrop = new CaveBackdrop(...)` を生成 |

| `src/js/main.js` | `_drawWorld()` 内の `fillStyle`/`fillRect` 2行 (現 1057-1058行) を遠景転送に置換 |

`Map` は既に `Map.js:32-33` で `palIdx = missionLevel % STAGE_PALETTES.length` を算出して
ブロック色に使っている。遠景にも同じ `palettes[palIdx].fill` を渡すことで、前景と遠景の
色調が必ず一致する。

`main.js` の置換後:

```js
if (this.map.backdrop) {
    this.map.backdrop.draw(ctx, camX, camY);
} else {
    ctx.fillStyle = COLOR_CAVE_BG;
    ctx.fillRect(camX, camY, this.canvas.width, this.canvas.height);
}
```

`COLOR_CAVE_BG` はミニマップ生成でも使われているため定数は残す。

## サイズ計算と転送

視差係数 `P = FAR_BG_PARALLAX = 0.15`。

カメラ可動範囲は `Camera._clamp()` と同一の定義を使う:

```
camXmin = 0
camXmax = mapW - viewW
camYmin = -HUD_TOP_HEIGHT
camYmax = mapH - viewH + HUD_BOTTOM_HEIGHT
```

遠景canvasの寸法:

```
backdropW = ceil((camXmax - camXmin) * P) + viewW
backdropH = ceil((camYmax - camYmin) * P) + viewH
```

最大マップ(300×150タイル = 4800×2400px)で約 1590×1023px ≒ 6.5MB。
前景tileCache(4800×2400 ≒ 44MB)より十分小さい。
マップは最小でも 150×75タイル = 2400×1200px であり、常に viewport(1024×768) より大きい。

転送(毎フレーム `drawImage` 1回):

```js
sx = clamp(floor((camX - camXmin) * P), 0, backdropW - viewW)
sy = clamp(floor((camY - camYmin) * P), 0, backdropH - viewH)
ctx.drawImage(canvas, sx, sy, viewW, viewH, camX, camY, viewW, viewH)
```

- `floor` する理由: サブピクセル座標での `drawImage` は補間が走って遅く、暗い点描が
  滲んでチラつく。整数化により遠景はカメラが約7px動くごとに1px動く階段状になるが、
  ドット絵の遠景としてはむしろ自然。
- `clamp` はカメラ側のクランプ式と二重管理になるための保険。片方がズレても破綻しない。
- `ctx` は呼び出し時点で `translate(-camX, -camY)` 済みのため、描画先はワールド座標
  `(camX, camY)` を指定する(現行の `fillRect` と同じ)。

### 画面シェイクの扱い

シェイクのオフセットは `camera.x` / `camera.y` に直接加算されているため、遠景の
シェイク量も自動的に15%になる。遠くの物ほど揺れないという挙動は物理的に正しく、
意図的にこのまま残す。

## 遠景の生成内容

### 色の導出

`STAGE_PALETTES[stage].fill` を `lerpColor(fill, '#000000', t)` で黒に寄せて導出する。
新規の色定数は追加しない。

| 用途 | t | 説明 |
|---|---|---|
| 地色 | 0.92 | canvas全面の基準色 |
| 暗ブロブ | 0.95 | 地色よりさらに沈む |
| 明ブロブ | 0.86 | わずかに浮く |
| 点描 | 0.78 | 粒として認識できる最低限の明度 |

ステージごとに背景の色調が変わる(ステージ4=暗緑、ステージ5=暗青 など)。

### 描画手順

すべて `game.rng` (`SeededRNG`) から乱数を取るため、同一シードで同一の絵になる。

1. **地色**: 地色でcanvas全面を `fillRect`。
2. **ブロブ**: 個数 = `floor(backdropW * backdropH / 40000)` (最大マップで約40個)。
   各ブロブは中心をcanvas内ランダム、半径120〜320pxの `createRadialGradient` を
   明/暗交互に選び、`globalAlpha = 0.5` で重ねる。大きな洞窟空間のうねりを表現。
3. **点描**: 個数 = `floor(backdropW * backdropH / 350)` (約4600個)。
   1〜2pxの矩形を点描色・`alpha 0.3〜0.8` のランダムでcanvas内に散らす。

生成はマップ読み込み時の1回のみ。矩形約5000個 + グラデーション40個で、前景tileCacheが
数万ブロックを描くコストに比べれば誤差。

## テスト

新規 `tests/cave-backdrop.test.js`。既存の fake `document` / `tests/helpers/fake-ctx.js`
方式(`tests/map-render-cache.test.js` と同様)を用いる。

1. canvasサイズが式通りであること — 最小マップ(150×75タイル)と最大マップ(300×150タイル)の両方で検証。
2. `sourceX(camXmin) === 0` かつ `sourceX(camXmax) === backdropW - viewW`。
   `sourceY` も同様に `camYmin` / `camYmax` で検証。遠景が可動域の端で過不足なく収まることの保証。
3. 可動域外のカメラ座標を渡した場合に `[0, backdropW - viewW]` / `[0, backdropH - viewH]` へクランプされること。
4. 決定性 — 同一シードの `SeededRNG` から生成した2つの `CaveBackdrop` の描画コール列が完全一致すること。
5. `draw()` が `drawImage` をちょうど1回、期待した9引数で呼ぶこと。

## 手動確認 (ユーザー実施)

以下は実際に動かさないと判断できないため、実機確認を依頼する:

- 視差0.15が弱すぎ/強すぎないか → `FAR_BG_PARALLAX` 1つで調整可能。
- 点描密度(350px²/個)が濃すぎ/薄すぎないか → 生成側の除数1つで調整可能。
- 遠景のコントラストが前景のシルエット視認性を損なっていないか → `lerpColor` の t 値で調整可能。

いずれも定数1箇所の変更で済む形にしておく。
