import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digestGrounded } from '../tools/record-terrain-baseline.mjs';

// タイル形状つき当たり判定（段4）を入れても、四角い地形（5面以外）での湧き位置・地図を作った後の
// 乱数の状態・落ちてくるアイテム・母艦の軌跡は変わらない。BASELINE は段4を入れる前のコード
// （計画のコミット 7e4ddba）で `node tools/record-terrain-baseline.mjs --grounded` を走らせた出力を
// そのまま貼ったもの。実装から導かないこと。段4の変更を入れた後に貼り直してはいけない。
const BASELINE = {
    spawns: { frames: 1788, sha256: 'efc01efb6e47e1a439ac381b41d958c9b1df1bae93f5c0d58ae46aa3ac310e35' },
    item: { frames: 141, sha256: 'b3397706cbb87c65fa6f953e12d20a77a856977a73cdd25f189d21539dcc5731' },
    carrier: { frames: 600, sha256: '84100745b7d44bb6c04a825414ff02a39b470c0effa2b79fe17d1014845335fc' },
};

test('四角い地形での湧き位置・アイテム・母艦は、段4の前と同じ', async () => {
    assert.deepEqual(await digestGrounded(), BASELINE);
});
