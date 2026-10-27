import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digestProjectiles } from '../tools/record-terrain-baseline.mjs';

// タイル形状つき当たり判定（段3）を入れても、四角い地形（5面以外）での飛び道具の軌跡は
// 1フレームも変わらない。BASELINE は段3を入れる前のコード（f51744e。計画は 319cdc7）で
// `node tools/record-terrain-baseline.mjs --projectiles` を走らせた出力をそのまま貼ったもの。
// 実装から導かないこと。段3の変更を入れた後に道具を走らせて貼り直してはいけない。
const BASELINE = {
    grenade: { frames: 1456, sha256: 'b015428ddde76ddabc5fd422d10207d48bb04cbb1210c4b3b4b99e5997099091' },
    beam: { frames: 3208, sha256: 'c8d29b02a7e063b7f7e235194e20ec6ca80628ed208dd5c10d843b497190b62c' },
    bullet: { frames: 1076, sha256: '24ac88f6fcb4052a1c0bb21aa2405cd2afb68f84b615153a81729fb0d9e5fdc0' },
    missile: { frames: 311, sha256: 'f3cc6bf21553872d7f5a3fd7c3af2566ee3fa67265747785d4084a235153863f' },
    homing: { frames: 694, sha256: '74e8f53bbf3ddc3daadd0f6b09fdc8cb6756b828c1f2d3ebe288a3355fa40d63' },
    cruise: { frames: 772, sha256: 'fce45d79dccba9cfce8cd271e3c0d5f627263e7a158afce3adc1ad05839279d4' },
    drone: { frames: 642, sha256: '7f52b17aaa50d8fb96d4da58a07e3024dc8d8b61f64d132e6a84f600105707bf' },
};

test('四角い地形での飛び道具の全フレームの軌跡は、段3の前と同じ', () => {
    assert.deepEqual(digestProjectiles(), BASELINE);
});
