import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digestGrounded } from '../tools/record-terrain-baseline.mjs';

// タイル形状つき当たり判定（段4）を入れても、四角い地形（5面以外）での湧き位置・地図を作った後の
// 乱数の状態・落ちてくるアイテム・母艦の軌跡は変わらない。BASELINE は段4を入れる前のコード
// （計画のコミット 7e4ddba）で `node tools/record-terrain-baseline.mjs --grounded` を走らせた出力を
// そのまま貼ったもの。実装から導かないこと。段4の変更を入れた後に貼り直してはいけない。
//
// **7面（level 6）の湧き位置は含めない**（2026-10-29）。要塞の区画の作り（室・廊下・守備隊の置き方）を
// 意図して変えたため。spawns の値だけ、その変更の前のコード（c5a9509）に「levels を引数に取る版の
// recordGrounded」を重ねて記録し直した。item と carrier は元の値のまま。記録し直した値は変更の後の
// コードでも一致している（面1〜4・6 の湧き位置はこの変更で動いていない）。7面の要塞は tests/fortress*.test.js が縛る
const BASELINE = {
    spawns: { frames: 1278, sha256: '4594c96aadc4a1f56ef182870bc858856a23de2fbc1097f67e26a5b64a340572' },
    item: { frames: 141, sha256: 'b3397706cbb87c65fa6f953e12d20a77a856977a73cdd25f189d21539dcc5731' },
    carrier: { frames: 600, sha256: '84100745b7d44bb6c04a825414ff02a39b470c0effa2b79fe17d1014845335fc' },
};

test('四角い地形での湧き位置・アイテム・母艦は、段4の前と同じ', async () => {
    assert.deepEqual(await digestGrounded(), BASELINE);
});
