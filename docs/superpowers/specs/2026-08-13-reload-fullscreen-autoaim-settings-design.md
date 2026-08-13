# リロード・全画面・Auto Aim の設定拡張 設計

2026-08-13

前提: [設定画面とポーズ 設計](2026-08-13-settings-screen-design.md)。この文書はその上に
4つの設定を足し、既存の1つを差し替える。

## 背景

設定画面を作った直後の実機フィードバックで、3つの項目が「ON/OFF では粗すぎる」と分かった。

**① MG オートリロード。** いまは真偽値で、ON なら残弾50%以下＋引き金を離すと自動装填、
OFF なら弾が尽きたときだけ装填する。だが実際に欲しかったのは**発動条件の指定**だった。
「ミサイルからマシンガンに持ち替えた瞬間だけ装填したい。それ以外は撃ち切りたい」という
遊び方が、いまの2択では表現できない。

**② 全画面。** 自動で全画面に入るのはゲーム開始の瞬間だけで、そこから外れると
手動（`M`）で戻すしかない。節目ごとに戻してほしい。ただし窓のまま遊びたい人もいるので
切れる必要がある。

**③ Auto Aim の解除しきい値。** `Constants.js` の `AUTO_AIM_CANCEL_THRESHOLD = 4` には
「表示倍率でマウスの体感が変わるので、実機で感触を見てから決める」というコメントが
残ったままになっている。スケール補正を入れるより、**設定で吸収するほうが正しい** —
どの倍率で遊ぶかは環境によって違い、正解が1つに決まらないため。

## 決めたこと

- **`mgAutoReload`（真偽値）を廃止し、`mgAutoReloadMode`（3択）と `mgReloadThreshold`（発数）に分ける**
- **`F` キーに二役を持たせる。** ミサイルが尽きて切り替えられないときだけ手動リロードになる
- **`autoFullscreen`（ON/OFF）を足す。** ON なら画面遷移の節目で全画面に戻す
- **`autoAimRelease`（数値）を足す**
- **既定値はすべて「今の挙動」**。設定を触らない人には何も変わらない

## 設定項目の最終形

```
MASTER VOLUME                     100%
BGM VOLUME                         60%
SE VOLUME                         100%
AUTO-SWITCH TO MISSILE ON DOCK     OFF
MG AUTO-RELOAD                  ALWAYS      ← 3段階に変更
RELOAD AT AMMO                8 ROUNDS      ← 新規
AUTO-AIM RELEASE                     4      ← 新規
FULLSCREEN
AUTO FULLSCREEN                     ON      ← 新規
QUIT MISSION                                ← プレイ中のみ
```

| キー | 型 | 値 | 既定 |
|---|---|---|---|
| `mgAutoReloadMode` | `choice` | `'off'` / `'onSwitch'` / `'always'` | `'always'` |
| `mgReloadThreshold` | `int` | 1〜15（発） | `8` |
| `autoAimRelease` | `int` | 1〜20 | `4` |
| `autoFullscreen` | `flag` | 真偽値 | `true` |

既定値は順に「残弾50%以下で自動装填」「16発×0.5＝8発」「`AUTO_AIM_CANCEL_THRESHOLD` の現行値」
「開始時に全画面へ入る現行の挙動」に対応する。

## 設計

### 1. 値の型を表で持つ（`utils/settings.js`）

いまの `KINDS` は `key → 'volume' | 'flag'` の文字列表だが、`choice` は選択肢の並びを、
`int` は上下限を持つ。**値を記述子オブジェクトに変えて、1設定＝1行を保つ。**

```js
const KINDS = {
    masterVolume:      { kind: 'volume' },
    bgmVolume:         { kind: 'volume' },
    seVolume:          { kind: 'volume' },
    autoSwitchMissile: { kind: 'flag' },
    autoFullscreen:    { kind: 'flag' },
    mgAutoReloadMode:  { kind: 'choice', values: ['off', 'onSwitch', 'always'] },
    mgReloadThreshold: { kind: 'int', min: MG_RELOAD_THRESHOLD_MIN, max: MG_RELOAD_THRESHOLD_MAX },
    autoAimRelease:    { kind: 'int', min: AUTO_AIM_RELEASE_MIN, max: AUTO_AIM_RELEASE_MAX },
};
```

`coerce()` と `stepSetting()` が `kind` で分岐する。

**`choice` は既存の ON/OFF と同じ「向きで決める」規則に揃える。** `A` で1つ左、`D` で1つ右、
**端で止まる（循環しない）**。循環させると連打したときにどこへ着くか画面を見ないと分からない
（設定画面の設計で ON/OFF について決めた理由と同じ）。

**`int` は `A` で -1、`D` で +1、`min`/`max` でクランプ。**

`coerce()` の追加規則:

| 型 | 受け付ける値 | 壊れていたとき |
|---|---|---|
| `choice` | `values` に含まれる文字列 | 既定値 |
| `int` | 整数（`Number.isInteger`）かつ `min`〜`max` | 既定値。範囲外はクランプではなく既定値に落とす |

範囲外を**クランプではなく既定値**にするのは、保存された値が範囲外になるのは
「範囲の定義を変えた」か「壊れた」かのどちらかで、どちらも近い値を推測するより
既定へ戻したほうが安全なため。

### 2. 旧設定からの移行（`loadSettings()`）

保存済みの JSON に `mgAutoReload`（真偽値）があり `mgAutoReloadMode` が無いときだけ、
`true → 'always'` / `false → 'off'` に読み替える。既に設定を触った人の選択を捨てないため。

`saveSettings()` は `DEFAULT_SETTINGS` のキーだけを書き出すので、**保存し直した時点で
旧キーは自然に消える**。明示的に削除する処理は要らない。

### 3. リロードの判断（`utils/mgReload.js`）

判断は引き続き1関数にまとめる。引数が増えるのでオプションオブジェクトにする。

```js
shouldStartMGReload(burstLeft, burstSize, fireHeld, {
    mode = 'always',
    threshold = MG_RELOAD_THRESHOLD_DEFAULT,
    switchedToMG = false,
    manual = false,
} = {})
```

上から順に判定する:

| # | 条件 | 結果 | 理由 |
|---|---|---|---|
| 1 | `burstLeft === 0` | 装填する | 弾切れは常に装填。撃てないまま詰まないため（現行どおり） |
| 2 | `manual` かつ `burstLeft < burstSize` | 装填する | `F` の手動。**しきい値もモードも無視する**。プレイヤーが決めたことなので |
| 3 | `mode === 'off'` | しない | |
| 4 | `burstLeft > threshold` | しない | しきい値は `onSwitch` / `always` の**両方**に効く |
| 5 | `mode === 'onSwitch'` | `switchedToMG` | 切り替えたフレームだけ |
| 6 | `mode === 'always'` | `!fireHeld` | 引き金を離すまで待つ（現行どおり） |

規則2を規則4より前に置くのが要点。手動リロードがしきい値に縛られると、
「オフ」を選んだ人が自分のタイミングで装填できなくなる。

**`onSwitch` で `fireHeld` を見ない**のは、切り替えた直後にその武器の引き金を握っている
状況が実質ないため。判定を増やしても振る舞いが変わらない。

`threshold` を**両モードに効かせる**のは、弾倉がほぼ満タンなのに切り替えのたびに
60フレームのリロードを背負う無駄を避けるため。

### 4. `F` キーの二役

規則を純関数に出して、`main.js` に分岐を増やさない。

```js
// mgReload.js
/**
 * `F` を押したときに何をするか。
 * ミサイルが尽きると武器を切り替えられなくなるので、そのときだけリロードにする。
 */
export function weaponKeyAction(missiles) {
    return Math.floor(missiles) <= 0 ? 'reload' : 'switch';
}
```

`Player` 側に `pressWeaponKey()` を足し、`main.js` の `switchWeapon()` 直呼びを置き換える。

- `'switch'` → 従来どおり `switchWeapon()`
- `'reload'` → `this.mgManualReload = true` を立てるだけ

ミサイルが0のとき `currentWeapon` は `_fireMissile()` が必ず `'mg'` に戻しているので、
武器の判定は要らない。

**`F` の読み取りは `_updatePlaying()` の内側に留める。** `update()` 直下（一見グローバルな
一回きりの入力を集めている場所）に上げたい誘惑があるが、`this.player` は `'settings'`
（ポーズ中）・`'mission_clear'`・`'ranking_entry'` の画面でも `alive` かつ未ドックのまま
残るため、`player.alive && !player.docked` だけでは「プレイ中限定」にならない。`update()`
直下に置くと、設定画面を開いたまま `F` を押しただけで裏で武器が切り替わる、説明のつかない
現象になる。対照的に `M`（全画面）は `update()` 直下でよい — 本当にどの画面でも意味を持つ
操作で、かつ `gameState !== 'ranking_entry'` という明示ガードを自前で持っているため。
「プレイ中だけの入力かどうか」は画面の中に置くか、自分でガードを書くかのどちらかで
確保するもので、`player` の生死だけでは代用できない、という線引きをここに残す。

**音。** いまはミサイル0で `F` を押すと（意味のない切り替えでも）`playSwitch()` が鳴っている。
無音になると「キーが死んだ」と感じるので、**手動リロードが受け付けられたときだけ
既存の `playSwitch()` を鳴らす**。満タン／リロード中は無音（＝受け付けなかったことが分かる）。
新しい音は作らない。

### 5. 切り替えフラグ（`Player`）

`switchWeapon()` が `missile → mg` の向きに変わったときだけ `this.mgSwitchedToMG = true` を立て、
`_updateMGReload()` が読んだら消す。

**フラグを立てっぱなしにせず、読んだ側が消すのが要点。** `switchWeapon()` は `main.js` の
毎フレームの入力処理から呼ばれるが、`_updateMGReload()` は `update()` の中＝シミュレーション
ティックごとに走る。`gameSpeed` 0.8 では1フレームに0ティックのことがあるので、
**ティックが消費するまでフラグを残す**必要がある。

`_fireMissile()` がミサイル切れで自動的に `currentWeapon = 'mg'` に戻す経路（2箇所）では
**立てない**。「武器切り替え時」は**プレイヤーが `F` を押した切り替え**を指す。
ゲーム側が勝手に戻したのは切り替えではない、という線引き。

`mgManualReload` も同じく、`_updateMGReload()` が読んだら消す。

`_resetMGState()`（工場出荷状態へ戻す処理）で両方のフラグも落とす。

**`_updateMGReload()` はフラグを、武器判定・装填中判定より前——メソッドに入った直後に
読んで即クリアする。** 「武器が mg 以外」「装填中」で早期 return する経路も含めて、
呼ばれた時点で必ず両方 false に戻す。ここを早期 return の**後**に置くと、ミサイルを
握っている間や別のリロードが進行中に立ったフラグが生き残り、次に mg へ戻った瞬間に
古い「切り替えた」「手動リロード要求」が誤発火する。位置を後の実装が動かしても検出できる
よう、早期 return する2経路それぞれを直接縛る回帰テストを置いてある。

### 6. Auto Aim 解除しきい値の配線

`main.js` の `_updateAutoAim()` の比較を設定から取る。

```js
const threshold = this.settings?.autoAimRelease ?? AUTO_AIM_CANCEL_THRESHOLD_DEFAULT;
if (dx + dy > threshold) { ... }
```

`Constants.js` の `AUTO_AIM_CANCEL_THRESHOLD` を `AUTO_AIM_CANCEL_THRESHOLD_DEFAULT` に改名し、
`AUTO_AIM_RELEASE_MIN = 1` / `AUTO_AIM_RELEASE_MAX = 20` を添える。
**「表示倍率で体感が変わる」旨の既存コメントは残す** — スケール補正を入れずに設定で
吸収するという判断の記録なので。

### 7. 全画面の自動復帰

規則を1メソッドに集約する。`main.js` に `enterFullscreen()` を散らすと後で追えなくなる。

```js
/** 節目で全画面へ戻す。設定が OFF なら何もしない。 */
_restoreFullscreen() {
    if (this.settings?.autoFullscreen) enterFullscreen();
}
```

**`requestFullscreen()` はユーザー操作の直後（transient activation が生きている間）でないと
ブラウザに拒否される。** 呼べる場所はこの制約で決まる。

| 場所 | 拾う入力 | 備考 |
|---|---|---|
| `_startGameIfRequested()` | 任意キー／クリック | 既存の `enterFullscreen()` をこれに置き換え |
| `_updateMissionClear()` の次面へ進むところ | `W`／クリック／文字キー | 新規 |
| `_updateRankingEntry()` の `Enter` 確定 | `Enter` | 新規 |
| `_closeSettings()` | `Escape`／`P` | 新規。設定画面で ON にしてそのまま閉じれば即座に効く |

**入れない場所:**

- `_updateGameOver()` → `_tryGoToRanking()`（4秒経過で自動遷移）
- `_updateGameClear()` → `_tryGoToRanking()`（7秒経過で自動遷移）

どちらもユーザー入力を伴わないので呼んでも拒否されるだけ。この場合は次の入力を伴う節目で戻る。
**理由をコメントに残す** — 一見すると拾い漏らしに見えるため。

`M` の手動トグルは従来どおり。**その画面にいる間は窓のままでいられる**（次の節目まで戻されない）。
ON にした人が一時的に窓にしたいときの逃げ道になる。これは `enterFullscreen()` 自体が
**冪等**（既に全画面なら何もしない）だから成り立つ。`_restoreFullscreen()` を4箇所に
埋め込んだことで、この事実がどこにも書かれていないと「なぜ M で入れた全画面を
壊さないのか」が読み取れなくなるため、`_restoreFullscreen()` の docblock に明記する。

### 8. 設定画面の描画

`ui/settingsItems.js` の表に行を足す。`type` は2つ増える。

```js
{ key: 'mgAutoReloadMode', label: 'MG AUTO-RELOAD', type: 'choice',
  labels: { off: 'OFF', onSwitch: 'ON WEAPON SWITCH', always: 'ALWAYS' } },
{ key: 'mgReloadThreshold', label: 'RELOAD AT AMMO', type: 'int', suffix: ' ROUNDS',
  dimWhen: (s) => s.mgAutoReloadMode === 'off' },
{ key: 'autoAimRelease', label: 'AUTO-AIM RELEASE', type: 'int' },
{ key: 'autoFullscreen', label: 'AUTO FULLSCREEN', type: 'toggle' },
```

`FULLSCREEN`（その場で切り替える `action`）と `AUTO FULLSCREEN`（`toggle`）は役割が違うので
**2行に分ける**。並びは隣同士に置く。

値を文字列にする処理は `settingValueText(item, settings)` として `ui/settingsItems.js` 側に
切り出し、`ScreenRenderer.drawSettings()` はそれを呼ぶだけにする。**描画（ctx）と値の
組み立てを分ける** — こうすると `choice` / `int` の文字列が正しいかを、canvas の ctx を
一切作らずに素の関数呼び出しで検証できる。

- `choice` … `labels[value]` を描く（無ければ `String(value)` に落とす）
- `int` … `String(value) + (suffix ?? '')` を描く

**`dimWhen` が真の行は淡色で描く。** `MG AUTO-RELOAD` が `OFF` のとき `RELOAD AT AMMO` は
効かないが、**行を消さない** — 消すと下の項目の位置が動いてカーソルが飛ぶ。
選択も移動もできるままにして、色だけで「効いていない」ことを伝える。淡色は新しい色を
足さず、既存の `ui/theme.js` の `UI.faint`（「補助・非選択」用に既にあった色）をそのまま使う。
**選択色（カーソルが乗っている行の色）は淡色より優先する** — 効いていない行でも、
カーソル自体が見えなければ動かせないため。

### 9. HOW TO PLAY

`F` の説明を `SWITCH WEAPON` → `SWITCH WEAPON / RELOAD (MISSILE ↔ M-GUN)` に変える。
パネル幅に収まったので、当初考えていた `SWITCH WEAPON / RELOAD` への短縮は不要だった —
どちらの武器に切り替わるかまで書けたほうが、二役になったキーの説明として親切なため。

## テスト

| 対象 | 見るもの |
|---|---|
| `settings.js` | `choice` / `int` の検証、範囲外は既定値に落ちること、`stepSetting` が端で止まること |
| `settings.js` | 旧 `mgAutoReload: true/false` が `'always'/'off'` に移行すること、新キーがあれば旧キーを見ないこと |
| `mgReload.js` | 6規則の真理値表。特に**手動がしきい値とモードを無視する**こと、**弾切れは `off` でも装填する**こと |
| `mgReload.js` | `weaponKeyAction()` が 0 発と端数（0.5 発）で `'reload'` を返すこと |
| `Player` | `mgSwitchedToMG` が `F` の missile→mg でだけ立ち、1ティックで消えること |
| `Player` | ミサイル切れの自動復帰では立たないこと |
| `Player` | 手動リロードが満タン／リロード中は受け付けられず、音も鳴らないこと |
| `main.js` 配線 | ミサイル0で `F` がリロード要求になり、武器が切り替わらないこと |
| `main.js` 配線 | `autoAimRelease` を上げるとマウスを振ってもロックが外れないこと |
| ↑同上・注記 | ロック維持パスは `_lockOnEnemy()` → `_leadPointFor()` を経て `aimLead.measure()` を読むため、`aimLead` はスタブでなく本物の `AimLeadTracker`（単体テスト済みの純粋ユーティリティ）を使う。モックにする理由が無いので実物のほうが正直 |
| `main.js` 配線 | `_restoreFullscreen()` が設定 ON/OFF で `enterFullscreen` を呼ぶ／呼ばないこと |
| `main.js` 配線 | 4つの節目で呼ばれ、時間駆動の2つでは呼ばれないこと |
| 描画 | `choice` / `int` の値の文字列、`OFF` のときの淡色 |
| `demo-screens` | `F` の説明が `SWITCH WEAPON / RELOAD` であること |

全画面まわりは `fullscreen.js` が `doc` を引数で受けられるので、偽 `document` で確認できる。
`main.js` 側は `enterFullscreen` を直接 import しているため、**`_restoreFullscreen()` を
差し替え可能なメソッドとして持つことがテスト可能性の要**になる。

## やらないこと

- **専用のリロードキーを足さない。** ミサイルを持っている間は手動リロードできないままにする。
  覚えるキーを増やさない判断（`HOW TO PLAY` の一覧を膨らませない）
- **`AUTO_AIM_CANCEL_THRESHOLD` の表示倍率スケール補正。** 設定で吸収する
- **リロード開始の新しい効果音。** 既存の `playSwitch()` を手応えとして流用する
