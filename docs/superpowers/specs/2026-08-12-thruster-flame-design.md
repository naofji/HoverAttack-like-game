# スラスター炎の表現強化 設計

2026-08-12

## 背景

自機と敵アタッカーの噴射表現が地味で、飛んでいることが画面から伝わらない。

現状はどちらも **1〜4px の四角を毎フレーム 3 個ランダムに置くだけ**で、以下の 7 行が
`Player._drawHoverExhaust()` と `EnemyAttacker.draw()` にほぼ二重に書かれている。

```js
for (let i = 0; i < 3; i++) {
    const px = backpackX + Math.random() * 4;
    const py = this.y + 12 + Math.random() * 5;
    const size = 1 + Math.random() * 4;
    ctx.fillStyle = COLOR_HOVER_EXHAUST;
    ctx.globalAlpha = 0.3 + Math.random() * 0.6;
    ctx.fillRect(px, py, size, size);
}
```

地味に見える原因は「小さい」ことよりも、**毎フレーム完全ランダムで形が定まらないこと**にある。
芯がないので、動いていても機体の一部として認識されず、目が滑る。

また敵側は `'#00FFFF'` が直書きされていて、型ごとに定義済みの `config.exhaustColor`
（heavy=緑 `#66FF66` / rival=橙 `#FF6644` / artillery=黄 `#FFEE44`）が使われていない。

## 決めたこと

- **炎そのものを強くする**。噴射痕を空中に残す案・加算合成のグローを足す案は採らない
  （前者は画面が煙で混む、後者はドット絵の質感から離れる）
- 形は **2 層の台形＋先端のゆらぎ**。外炎（機体色）の中に白い芯を重ねる
- 炎の長さは **推力に連動**させる
- 敵の炎は **型ごとの `exhaustColor`** にする

## 設計

### 共有モジュール `src/js/entities/thrusterFlame.js`

自機と敵で同じ 7 行が二重化している現状に、さらに形のコードを足すと悪化する。
先に 1 本にまとめてから太らせる。`smokeSprites.js` と同じ立ち位置（entities/ 直下の描画ヘルパ）。

```js
drawThrusterFlame(ctx, nozzleX, nozzleY, { color, power, flicker = Math.random() });
```

| 引数 | 意味 |
|---|---|
| `nozzleX` / `nozzleY` | ノズルの**中心**座標。呼び出し側の座標系のまま渡す |
| `color` | 外炎の色（`#rrggbb`） |
| `power` | 0〜1。炎の長さ |
| `flicker` | 0〜1。先端の伸び縮み。既定は `Math.random()` |

炎はノズル中心に左右対称なので、自機のワールド座標でも、敵の `scale(-1, 1)` 済みの
ローカル座標でも、そのまま呼べる（呼び出し側で向きを場合分けしなくていい）。

`flicker` を引数にしたのは**テストのため**。既定値を `Math.random()` にしてあるので
実装側は何も渡さず、テストだけが固定値を渡して幾何を決定的に検証できる。

### 形

1px 高の矩形を縦に積んで台形にする。`fillRect` だけで済み、パスで塗るより既存の
ドット絵の質感に合う。段ごとの幅をテストで検証できるという利点もある。

```
       ■■■■■        ← ノズル（幅 THRUSTER_FLAME_WIDTH = 5）
       ████         外炎 = color
        ███         内炎 = lerpColor(color, '#FFFFFF', 0.7)
        ██
         █          ← 先端。flicker で ±15% 伸び縮み
```

- 外炎: 長さ `lerp(LEN_MIN, LEN_MAX, power) * (1 ± FLICKER)`。幅は `WIDTH` から 1 へ線形に絞る
- 内炎: 外炎の `CORE_RATIO` 倍の長さ。幅は `WIDTH - 2` から 1 へ絞る
- 段の座標は整数に丸める（ピクセルのにじみを避ける）

揺らぎを ±15% に抑えるのは、現状の完全ランダムが「形が定まらないから逆に目に入らない」
状態だったため。芯を固定して先端だけ動かすほうが、動いて見えてかつ機体の一部として読める。

### 定数（`Constants.js`）

| 定数 | 値 | 意味 |
|---|---|---|
| `THRUSTER_FLAME_WIDTH` | 5 | ノズル直下の幅 |
| `THRUSTER_FLAME_LEN_MIN` | 6 | `power = 0` のときの長さ |
| `THRUSTER_FLAME_LEN_MAX` | 14 | `power = 1` のときの長さ（現状の実質 5px の約 3 倍） |
| `THRUSTER_FLAME_CORE_RATIO` | 0.55 | 芯の長さ比 |
| `THRUSTER_FLAME_CORE_WHITE` | 0.7 | 芯を白へ寄せる量 |
| `THRUSTER_FLAME_FLICKER` | 0.15 | 先端の伸び縮み幅 |
| `THRUSTER_FLAME_ALPHA` | 0.75 | 外炎の不透明度 |
| `THRUSTER_FLAME_CORE_ALPHA` | 0.9 | 芯の不透明度。外炎より濃くして芯を立てる |

既存の `COLOR_HOVER_EXHAUST` は `'rgba(0, 255, 255, 0.6)'` で `lerpColor()` が解釈できない。
**`'#00FFFF'` に変える**（薄さは `globalAlpha` で出す）。参照は `Player.js` の 1 箇所のみ。

### `power` の決め方

**自機** — `hoverFuel / HOVER_MAX_FUEL` をそのまま使う。このゲームでは残燃料で推力が変わる
（`Player.js:210-212`、満タン `HOVER_THRUST` = -0.50 → 空に近いと `HOVER_THRUST_MIN` = -0.30、
0 でホバー自体が止まる）。ホバー音も既に `audioManager.playHover(fuelRatio)` で同じ値を
受けているので、**炎・音・実際の推力が同じ 1 つの値を指す**ことになる。
燃料切れが近いことが HUD を見ずに炎の長さで分かる。

**敵** — `config.climbThrust`（`ATTACKER_CLIMB_THRUST_MIN` 0.45 〜 `ATTACKER_CLIMB_THRUST_MAX` 0.75）を **`ATTACKER_FLAME_POWER_MIN` 0.6 〜 1.0 に写す**。

```js
power = ATTACKER_FLAME_POWER_MIN + 0.4 * (climbThrust - ATTACKER_CLIMB_THRUST_MIN) / (ATTACKER_CLIMB_THRUST_MAX - ATTACKER_CLIMB_THRUST_MIN);
```

0〜1 に正規化すると heavy（`ATTACKER_CLIMB_THRUST_MIN`）の炎がほぼ消えてしまうため、下限を上げている。
型ごとの差は残しつつ、どの型でも噴射が見える。

### 呼び出し側の変更

- `Player._drawHoverExhaust()` — ループを消し、`drawThrusterFlame()` の 1 回呼び出しに置換。
  ノズル中心はバックパックのノズル（ローカル x:2〜6, y:12〜14）の中心。向きで x を場合分けする
  現状の計算はそのまま使う
- `EnemyAttacker.draw()` の `--- Hover Exhaust (Common) ---` ブロック — 同じく 1 回呼び出しに置換。
  色は `cfg.exhaustColor`、ノズル中心はローカル (4, 14 - crouchOffset)

## テスト

`tests/thruster-flame.test.js` を新設。`tests/helpers/fake-ctx.js` で記録した呼び出しを見る。
CLAUDE.md の方針どおり、ソース文字列の grep はしない（実際に `draw()` を呼ぶ）。

1. `power` が大きいほど炎が長い（最下段の y を比較）
2. 段が下へ行くほど狭い＝台形になっている
3. 芯が外炎より短く、色が白寄り（`lerpColor` の結果と一致）
4. `flicker` を固定すれば描画が決定的（同じ入力 → 同じ `fillRect` 列）
5. 自機: `hovering = false` なら炎を描かない／左右どちら向きでもノズル中心が機体のノズル位置に一致
6. 敵: 4 型それぞれの外炎の `fillStyle` が `config.exhaustColor` になっている
   （`'#00FFFF'` 直書きへの回帰防止）

## 実機確認（ユーザー）

ハードリロード（Cmd+Shift+R）が必要。確認ポイントと調整用の定数:

| 見るところ | 調整する定数 |
|---|---|
| 炎が長すぎる／短すぎる | `THRUSTER_FLAME_LEN_MAX` |
| 燃料が減ったときに炎が寂しい | `THRUSTER_FLAME_LEN_MIN` |
| 炎が太すぎる／細すぎる | `THRUSTER_FLAME_WIDTH` |
| 芯の白さ | `THRUSTER_FLAME_CORE_WHITE` / `THRUSTER_FLAME_CORE_RATIO` |
| 先端の揺れがうるさい／足りない | `THRUSTER_FLAME_FLICKER` |
| 敵 heavy の炎が弱い | `power` の下限 0.6 |

## やらないこと

- 噴射痕を空中に残す（画面が混む）
- 加算合成のグローや地面への照り返し（ドット絵の質感から離れる）
- バースト時だけ大きく吹く演出（連打でチラつきやすい。必要なら実機確認のあとで追加検討）
- 敵タンク（`EnemyTank`）の噴射グロー。作りが別物（脈動するグロー）で、今回の対象外
