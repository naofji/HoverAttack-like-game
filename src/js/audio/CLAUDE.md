# audio/ の作業メモ

ルートの `CLAUDE.md`「音を足すとき」から、この階層を触るときだけ要る部分を移したもの。
「`renderWeaponSound()` と `renderWeaponProfile()` は対」「音作りを変えたら A特性で実測」の
2つはテスト側（`tests/helpers/`）だけを触るときにも要るので、ルートに残してある。

- `WEAPON_SOUNDS` の部品は `hiss` / `tone` / `puffs` / `clicks` / `voice` の5つ。発射音だけでなく、リロードの「ガチャリ」も装填クリックも「レディ」の声もこの表にある。
- 試聴用の書き出し: `node tools/render-weapon-sounds.mjs`（表の全項目）、`node tools/render-repair-hum.mjs`（ループ音）。出力は `audio-preview/`（git 管理外）。
- **`AudioManager` は系統ごとに分かれている。** 本体（`audio/AudioManager.js`、約200行）に残っているのは AudioContext の生死と音量設定の入口だけで、音そのものは `audio/sounds/`（hover / enemySounds / loopSounds / playerSounds / stings）と `audio/engine/`（seBus / output）にある。`Object.assign(AudioManager.prototype, ...)` で混ぜているので `this` の意味は変わらない。**新しい音は系統のファイルへ足す。**
- **音を「移動しただけ」のときは、鳴らして確かめるより WebAudio グラフを比べるほうが確実。** `tests/helpers/fake-audio-ctx.js` はノード種別・パラメータの予約イベント・接続・start/stop をすべて記録するので、各 `play*` を呼んでグラフを直列化し、変更の前後で diff を取れば「1サンプルも変わっていない」ことを示せる（分割のときに実際に使い、834ノードの一致を毎コミットで確認した）。
- **効果音が出力へ直結していないかの見張り（`tests/se-bus.test.js`）は `audio/sounds/` と `audio/engine/` も読む。** BGM の2ファイルはわざと対象外（あちらはバスを通さず直結するのが正しい）。
