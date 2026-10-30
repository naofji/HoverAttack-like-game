# 7面の要塞: 残機アイテム（お宝）

2026-10-31。親: `2026-09-06-stage7-fortress-design.md`。ユーザー提案「要塞のお宝に自機残機 1 機追加を加えたい。取った瞬間に効力発揮」。

## 決めたこと（ユーザーの判断）

| 論点 | 決定 |
|---|---|
| 効果 | 拾った瞬間に残機 +1（キットのように手元に残らない） |
| 数 | **ステージ全体で 1 個**（全区画に置くと最大 +4 機で、初期 3 機の倍以上になる） |
| 置き換え | **区画のお宝 [オーバードライブ, リペア, リペア] の 2 番目のリペア**と入れ替える。オーバードライブは動かさない |
| 見た目 | 自機ロボットを思わせる形と色、ただし光り輝く感じ（マゼンタは目立つが自機を連想しないので不採用） |

## 私の判断（未承認）

1. **置く区画 = スタートの部屋（`rooms[0]`）から区画の中心までの距離が最大のもの。** 乱数を使わないので週次の決定性は変わらない（同じ距離なら区画の並び順が先）。お宝の列が短くて 2 番目が無い区画は飛ばして、次に遠い区画へ回す
2. **色は自機のバイザーの青を本体の地にする。** 緑＝リペア、赤＝ミサイル、橙＝Auto Aim、金＝オーバードライブで埋まっているため。自機の配色（銀の体と頭、青いバイザー、橙のバックパック）を 16px に縮めて載せ、2 つの角で星を交互に瞬かせて「光る」ことを足した
3. **拾った合図を 3 つ付けた**: 頭の上の「1UP」（上へ昇って後半で薄れる）、HUD の残機の数字の金色の点滅、専用の効果音。HUD の数字は小さく、拾ったのに気づけない恐れがあるため
4. **効果音は専用の 6 音（E5 G5 E6 C6 D6 G6）で、共通の拾得音は鳴らさない**（重ねると濁る）。1 音の頂点は共通の拾得音と同じ 0.07。`PickupItem.playPickupSound()` を差し替え口にした
5. **残機の上限は設けない。** ステージ全体で 1 個なので届かない
6. **専用の配列 `game.lifeKits` を持つ**（敵・他のアイテムに混ぜない）。更新・描画・補間・面の作り直しでのリセットを `main.js` と `GameStateManager` に足した

## 作り

- `entities/ExtraLifeKit.js`（`PickupItem` 派生。`onPickup` は `player.gainLife()`）
- `Player.gainLife()` / `lifeUpTimer`（`EXTRA_LIFE_FLASH_FRAMES`）と、頭の上の「1UP」（`_drawLifeUp`）
- `world/fortress.js` の `assignExtraLives()`。`carveFortressZones` の末尾で呼ぶ
- `SpawnManager.spawnTreasures()` が `kind === 'life'` を `ExtraLifeKit` にする
- 音 `playExtraLife`（`audio/sounds/playerSounds.js`）
- テスト `tests/extra-life.test.js`（25 件。24 通りの壊し方で全部赤）

## 実機で見るところ

| 見るところ | 調整用の定数 |
|---|---|
| 置き場所（スタートから最も遠い区画の奥・オーバードライブの隣）で見つけやすいか | `FORTRESS_EXTRA_LIFE_SLOT` / `FORTRESS_EXTRA_LIFE_COUNT` |
| 「1UP」の表示の長さ・HUD の点滅の長さ | `EXTRA_LIFE_FLASH_FRAMES` |
| 色（青の地に銀のロボット）が他のアイテムと見分けられるか、光って見えるか | `ExtraLifeKit.js` の `bodyColor` / `glowColor` / 星 |
| 効果音の音量・長さ | `playerSounds.js` の `playExtraLife`（頂点 0.07） |
