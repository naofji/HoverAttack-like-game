# 設定画面とポーズ 設計

2026-08-13

## 背景

設定を変える手段が、キーに散らばったまま増えてきた。

- モード（ノーマル/ニュータイプ）はタイトルの `A`/`D`
- BGM 音量は `-`/`+`（全画面共通）
- 全画面は `M`
- ミッションの中断は `Escape`（即座にタイトルへ戻る）

一方で「ドッキング時にミサイルへ持ち替える」「マシンガンのオートリロード」のように、
**プレイの好みを変えたいがキーを増やしたくない**項目が出てきた。キーを足し続けると
`HOW TO PLAY` の一覧が膨らむだけで、どれが設定でどれが操作なのかも分からなくなる。

さらに `Escape` は現在、確認なしでミッションを捨てる。押し間違えると進行が消える。

## 決めたこと

- **設定画面を1つ作り、入口を2つ用意する。** プレイ中（ポーズ）とタイトル
- **プレイ中は時間が止まる。** BGM は鳴り続ける
- **`-`/`+` は「全体音量」の操作に付け替える**（廃止しない）。ポーズを挟まず片手で音量を下げられる
  ほうが速いため。BGM と SE の内訳は設定画面でだけ触る
- **モード選択はタイトルの `A`/`D` のまま**据え置く（プレイ中に変えられては困る値なので、
  ポーズメニューに置くとかえって危ない）
- **既定値はすべて「今の挙動」**。設定を触らない人には何も変わらない

## 設計

### 画面と状態

`gameState` に `'settings'` を1つ足す。中身は入口によらず共通で、
**どこから来たかだけを覚えて戻る**。

| 入口 | 開くキー | 戻る先 | 「途中終了」項目 |
|---|---|---|---|
| プレイ中 | `Escape` または `P` | `'playing'` | あり |
| タイトル | `P` | `'title'` | なし |

`settingsReturnTo` に戻り先の状態名を持たせる。`Escape` / `P` のどちらでも閉じる。

**`Escape` と全画面の関係**: 全画面中に `Escape` を押すと、ブラウザが全画面解除に使う。
`main.js:277` の既存コメントのとおり、Chrome/Firefox は**そのときの keydown をページへ渡してこない**
と見られる（未確認）。つまり全画面中は「1回目の `Escape` で全画面解除、2回目でメニュー」に
なる可能性が高い。`P` は全画面を保ったまま開けるので、**`P` を主、`Escape` を従**として案内する。
どちらの挙動でも壊れないよう、両方のキーを受ける。

**描画**: 設定画面は背後をそのまま残してパネルを重ねる。プレイ中なら止まった戦場の上に、
タイトルならタイトル画面の上に出る。既存の `drawPanel` / `drawKeyCap`（`ui/theme.js`）を使う。

### 操作

| キー | 動作 |
|---|---|
| `W` / `S` | 項目を上下に移動（端で止める。巻き戻さない） |
| `A` / `D` | 値を増減、ON/OFF を切り替え |
| `Enter` | 実行（途中終了） |
| `Escape` / `P` | 閉じて戻る |

`A`/`D` を選んだのは、タイトルのモード選択が既に `A`/`D` で、手なりが揃うため。
ポーズ中は自機が止まっているので、移動キーと衝突しても誤作動しない。

### 設定項目

| 項目 | 型 | 既定 | 既定の根拠 |
|---|---|---|---|
| 全体音量 | 0〜100（設定画面は5刻み、`-`/`+` は10刻み） | 100 | 新設。既定 100 なら現行と同じ音量 |
| BGM 音量 | 0〜100（5刻み） | 既存の保存値 | 現行の `hoverAttack.bgmVolume` を引き継ぐ |
| SE 音量 | 0〜100（5刻み） | 100 | 今は調整手段が無く常に最大 |
| ドッキング時にミサイルへ持ち替え | ON/OFF | **OFF** | 今は持ち替えない（`respawn()` だけが `currentWeapon='missile'` にする） |
| MG オートリロード | ON/OFF | **ON** | 今は残弾50%以下＋引き金を離すと自動装填する |
| 途中終了 | 実行 | — | 現行の `Escape` の動作。**確認を1段挟む** |

**（注） FULLSCREEN 行について**: 初期設計に `全画面` という実行型の項目があったが、後続の設計（`2026-08-13-reload-fullscreen-autoaim-settings-design.md`）で AUTO FULLSCREEN トグル を追加した際に、この行は削除された。理由は、`M` キー と重複し、AUTO FULLSCREEN が ON の既定値では「FULLSCREEN 行で全画面を抜けても、設定画面を閉じると自動復帰する」という矛盾が生じるため。`M` キー でのトグルで十分に対応でき、設定画面からは不要と判定された。

**全体音量は「掛け算」で実装する。** BGM と効果音は別々の経路で出ている
（効果音は `seFade → seMaster → コンプレッサ`、BGM は `BGMManager` が自前の音量を持つ）ので、
両方の上に1つのノードを差し込む配線変更はせず、**適用時に掛ける**:

```
実際のBGM音量 = masterVolume × bgmVolume
実際のSE音量  = masterVolume × seVolume
```

`utils/settings.js` の純関数 `effectiveVolumes(settings)` にまとめる。音の配線に手を入れないので
既存の音量の実測値（母艦エンジンと回復ハムの帯域分離など）に影響しない。

**全体音量だけは `-`/`+` でも変えられる。** プレイ中にポーズを挟まず調整できるほうが速いので、
現行の `_updateVolumeControl()` を残し、**操作先を BGM 音量から全体音量へ付け替える**。
音量 HUD（`volumeHudTimer` で数フレーム出る表示）も全体音量を映すようにする。
`ranking_entry` を除外する現行の扱いはそのまま（`-` は名前に使える文字なので）。

**刻みは役割で分ける。** `-`/`+` は 10%（`VOLUME_STEP_COARSE`。素早く粗く下げる用）、
設定画面は 5%（`VOLUME_STEP_FINE`。数字を見ながら合わせる用）。
`Input.isCharPressed()` は押した瞬間しか拾わず**押しっぱなしで連射しない**ので、
`-`/`+` を 5% にすると最大から最小まで 20 回押すことになる。それを避けるための使い分け。

**PC 本体の音量は扱えない。** ブラウザから OS のマスターボリュームを読む／変える API は
存在しない（どのブラウザでも同じ）。この「全体音量」はこのページの出力だけを下げるもので、
他のタブや OS の音量には影響しない。**「PC の音量を取得したい」という要望が来ても実現できない**
ので、ここに書き残しておく。

**「MG オートリロード OFF」の意味**: 手動リロードのキーは作らない（`R` はミニマップで埋まっている）。
OFF は「**弾が尽きたときだけ装填する**」とする。`shouldStartMGReload()` の
「残弾がしきい値以下 かつ（撃ち切った または 引き金を離した）」のうち、
**引き金を離したときの装填を止める**だけの違いになる。残弾を撃ち切りたい人向け。

**「途中終了」の確認**: `Enter` で「本当に終了しますか？ YES / NO」に変わり、
もう一度選んで決める。現行の `Escape` 即離脱より安全側に倒す。
**確認ダイアログの既定は NO。** 押し間違いで進行を捨てないよう、`quitChoiceYes` が未指定
（undefined）のときは NO 扱いにして、常に安全側に倒す。

### ポーズの意味

| 対象 | ポーズ中 |
|---|---|
| 物理・敵AI・弾・パーティクル | 止まる（`_updatePlaying()` を呼ばない） |
| ミッションタイマー / 総時間 | **止まる**（`_updatePlaying()` の先頭で加算しているので、呼ばなければ止まる） |
| 固定タイムステップのアキュムレータ | 進まない（同上）。`deltaTime` は `main.js:1672` で 50ms に丸められているので、長時間ポーズしても復帰の1フレームで時間が飛ぶことはない |
| BGM | **鳴り続ける**（要望どおり） |
| ループする効果音（ホバー・母艦エンジン・回復ハム） | **止める**（`audioManager.stopLoopingSe()`）。自機が止まっているのに噴射音が鳴り続けるのは不自然なため |
| 単発の効果音 | 鳴り終わるまで自然に減衰（バスは引かない） |

タイマーが止まることはタイムボーナスに直結するので、**テストで縛る**。

### 描画の状態オブジェクト

`ScreenRenderer.drawSettings(ctx, state)` の `state` は以下の構造を持つ:

```js
{
    settings: {masterVolume, bgmVolume, seVolume, autoSwitchMissile, mgAutoReload, ...},
    index: number,           // 選択中の項目インデックス
    fromPlaying: boolean,    // プレイ中から開いたか（true ならタイトルからは false）
    confirmingQuit: boolean, // 途中終了確認画面を出しているか
    quitChoiceYes: undefined | boolean // 確認ダイアログの選択（undefined = NO 扱い）
}
```

`fromPlaying` が false ならば「途中終了」項目は出ない。`confirmingQuit` が true なら
確認パネルを重ねる（`_drawQuitConfirm()`）。

### デモループに含めない

`DEMO_SCREEN_DRAWERS` に `'settings'` は **入れてはいけない**。設定画面はデモループの一員ではなく、
遊びの途中またはタイトルから開く個別の手段なので、表の全キーが `DEMO_CYCLE_STATES` に
揃っていなければ例外になる（`tests/demo-screens.test.js` が監視している）。
デモループを抜けると、自動的に設定画面も消える。

### 保存

`localStorage` のキー `hoverattack.settings` に JSON 1つ。**値を変えた瞬間に保存**する
（決定ボタンは置かない）。

新規 `src/js/utils/settings.js` に純関数として置く。DOM もオーディオも要らないので
`node --test` で直接テストできる（既存の `utils/bgmVolume.js` と同じ作り）。

```js
loadSettings(storage) -> {masterVolume, bgmVolume, seVolume, autoSwitchMissile, mgAutoReload}
saveSettings(settings, storage) -> void
effectiveVolumes(settings) -> {bgm, se}      // マスターを掛けた実効値
stepSetting(settings, key, direction) -> settings   // A/D 用。純関数
```

- 壊れた値・未知のキー・`localStorage` が使えない環境（プライベートブラウジングは
  `getItem` が例外を投げる）では**黙って既定値**にフォールバックする
- **既存の `hoverAttack.bgmVolume` からの移行**: 新キーが無く旧キーがあれば、その値を
  BGM 音量の初期値として取り込む。旧キーは消さない（書き戻しもしない）ので、
  この変更を戻しても以前の音量が残る
- `utils/bgmVolume.js` の `clampVolume` / `stepVolume` / `volumePercent` は再利用する
  （`stepVolume` は刻みを引数で受けるようにする。今は `BGM_VOLUME_STEP` を直接読んでいる）
- **定数名を実態に合わせる**: `BGM_VOLUME_STEP`(0.1) は付け替え後「全体音量を `-`/`+` で動かす刻み」に
  なり、名前が指すものとずれる。`VOLUME_STEP_COARSE = 0.1`（`-`/`+` 用）と
  `VOLUME_STEP_FINE = 0.05`（設定画面用）に改名する。`BGM_VOLUME_DEFAULT` /
  `BGM_VOLUME_STORAGE_KEY` は BGM のままなので触らない

### 項目を足しやすくする

設定項目は**表の1行**で表す（CLAUDE.md の共通機構の方針）。

```js
// ui/settingsItems.js
{ key: 'masterVolume', label: 'MASTER VOLUME', type: 'volume' }
{ key: 'bgmVolume', label: 'BGM VOLUME', type: 'volume' }
{ key: 'mgAutoReload', label: 'MG AUTO-RELOAD', type: 'toggle' }
```

`type` は `volume` / `toggle` / `action` の3つ。描画も入力処理も `type` で分岐するので、
**項目を足すのは表に1行足すだけ**になる。フェーズBの追加もここに乗る。

### 呼び出し側の変更

- `main.js` — `gameState` に `'settings'` を追加。`update()` の `Escape` 分岐を書き換える
  （`'playing'` からは設定画面へ、それ以外は従来どおりタイトルへ）。`P` の処理を足す。
  `_updateVolumeControl()` は**残し、操作先を BGM 音量から全体音量へ付け替える**
  （`audioManager.adjustBgmVolume()` を呼ぶのをやめ、設定の `masterVolume` を動かして保存する）
- `Player.js` — ドッキング処理で `autoSwitchMissile` を見る。`shouldStartMGReload()` に
  `mgAutoReload` を渡す
- `utils/mgReload.js` — 引数を1つ増やす（`autoReload`）。OFF なら `burstLeft === 0` のときだけ true
- `AudioManager.js` — SE 音量用のゲイン段を1つ足す。既存の `seFade`（ゲームオーバーで引く段）
  とは別に、`seMaster` の手前に**ユーザー音量の段**を置く。2つを分けるのは、
  ゲームオーバーのフェードとユーザー設定が互いを上書きしないようにするため
- `ui/ScreenRenderer.js` — `drawSettings(ctx, state)` を追加。`drawVolumeIndicator()` メソッドも
  追加し、音量 HUD（`-`/`+` で調整したときに数フレーム出る）を**全体音量**に付け替える
- `main.js` の `loop()` — `draw()` が画面ごとに早期 return するため、その外側で音量 HUD を描く。
  `screenRenderer.drawVolumeIndicator()` を呼ぶ

## フェーズ

**フェーズA（この spec の範囲）**: 上記すべて。これで出荷できる。

**フェーズB（別 spec）**:
- **軽量描画モード** — 走査線・発光・洞窟遠景・パーティクル・破片の各所に分岐が要り、
  本体より実装量が大きい。実機で重さを感じてから作るほうが、どこを削るべきか根拠を持って決められる
- **キーコンフィグの一覧表示** — `HOW TO PLAY` の CONTROLS 表を使い回すだけなので軽い。
  表に `type: 'action'` の1行を足し、押すと操作一覧のパネルを重ねる

## テスト

`node --test`。DOM も AudioContext も無い前提。

1. **`utils/settings.js` の純ロジック** — 既定値、保存と読み込みの往復、壊れた JSON、
   未知のキー、範囲外の値、`localStorage` が例外を投げる環境、旧 `hoverAttack.bgmVolume` からの移行
2. **`effectiveVolumes()`** — マスター 100 なら BGM/SE がそのまま出ること（＝現行と同じ音量）、
   マスター 0 で両方 0 になること、掛け算の丸めで 0.30000000000000004 が出ないこと
3. **`stepSetting()`** — 音量が 0〜100 で止まる（巻き戻らない）、ON/OFF が反転する。
   刻みが `-`/`+`（10%）と設定画面（5%）で違っても、どちらも 0〜100 の範囲を外れない
4. **ポーズ中に時間が進まない** — `gameState='settings'` で `update()` を実時間10秒ぶん回しても
   `missionTimer` / `totalTime` / `simAccumulator` が変わらない
5. **ポーズ中に敵が動かない** — 同じ条件で敵の座標が変わらない
6. **ポーズでループ効果音が止まる** — `audioManager` のメソッドを差し替えて記録する
   （`tests/audio-wiring.test.js` の `spyAudio` が原型）
7. **設定が実際に効く** — `autoSwitchMissile` ON でドッキングするとミサイルになる／
   OFF では変わらない。`mgAutoReload` OFF では残弾が 0 になるまで装填しない
8. **描画** — `fake-ctx` で、全項目が描かれること、選択中の項目が強調されること、
   タイトルから開いたときは「途中終了」が出ないこと
9. **表と実装の対応** — 表の全 `key` が `loadSettings()` の返り値に存在すること
   （項目を足して保存を忘れる事故を防ぐ）
10. **`-`/`+` が全体音量を動かす** — BGM 音量ではなく `masterVolume` が変わり、保存されること。
   `ranking_entry` では効かないこと（現行の扱いの回帰防止）

CLAUDE.md の方針どおり、ソース文字列を grep するテストは書かない。

## 実機確認（ユーザー）

ハードリロード（Cmd+Shift+R）が必要。確認ポイント:

| 見るところ | 調整先 |
|---|---|
| `P` でポーズが開く／`Escape` は全画面を挟む挙動になるか | — |
| ポーズ中に BGM が続き、ホバー音が止まるか | — |
| ポーズしてもミッションタイムが増えていないか | — |
| 設定画面の音量の刻みが細かすぎ／粗すぎ | `VOLUME_STEP_FINE`（5%） |
| `-`/`+` の刻みが細かすぎ／粗すぎ | `VOLUME_STEP_COARSE`（10%） |
| `-`/`+` で全体音量（MASTER）が動き、HUD に出るか | — |
| SE 音量 100 が今までと同じ大きさか | — |
| 全体音量 100 が今までと同じ大きさか（掛け算で目減りしていないか） | — |
| 項目の並び順・文言 | `ui/settingsItems.js` の表 |

## やらないこと

- モード選択をポーズメニューに入れる（プレイ中に変えられると進行中のスコアの前提が壊れる）
- 手動リロードのキーを新設する（`R` が埋まっている。OFF は「空になったら装填」で代替）
- 設定のクラウド同期・プロファイル複数持ち（ローカル1つで足りる）
- **PC 本体（OS）の音量の取得・変更** — ブラウザに API が無く、実現できない
- キーコンフィグの**変更**（フェーズBは一覧の表示のみ。変更まで作ると入力系の作りに手が入る）
