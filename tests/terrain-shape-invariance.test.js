import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digest } from '../tools/record-terrain-baseline.mjs';

// タイル形状つき当たり判定（段2）を入れても、四角い地形（5面以外）での自機・敵アタッカー・
// 戦車の軌跡は1フレームも変わらない。BASELINE は段2を入れる前のコード（cbd8dcb）で
// tools/record-terrain-baseline.mjs を走らせた出力をそのまま貼ったもの。
// 実装から導かないこと。段2の変更を入れた後に道具を走らせて貼り直してはいけない。
const BASELINE = {
    player: { frames: 900, sha256: '797a2354c2630798bbff5e43f75806f5b018ec858d731320ff37fd1e65910289' },
    attacker: { frames: 900, sha256: '9f1ab0c1f38fa5f747fd91b09ee3589b4e922e7c312c2a0f24f8699a7d679088' },
    tank: { frames: 600, sha256: '9a0fc1f341ac3e647f547e1157c67711cb44bf38855271a33ca605534c159202' },
};

test('四角い地形での自機・敵アタッカー・戦車の全フレームの軌跡は、段2の前と同じ', () => {
    assert.deepEqual(digest(), BASELINE);
});
