// 5面以外の地形の絵が段5（5面の描画を形に置き換える）の前後で変わらないことを縛る。
// 基準線は段5の計画のコミット（971c93d、描画の変更を入れる前）のコードで
// `node tools/record-terrain-baseline.mjs --drawing` を走らせて記録した。
// 実装から期待値を導かないため、段5の変更の後に記録し直さないこと。
//
// **7面（level 6）は含めない**（2026-10-29）。要塞のパネルの絵（world/panelBlocks.js）を意図して変えたため。
// 面1〜4・6 の基準線は、その変更の前のコード（32af1c7）に「levels を引数に取る版の digestDrawing」を
// 重ねて記録し直した。段5の前の基準線と違うのは7面を外したことだけで、記録し直した値は
// 変更の後のコードでも一致している（面1〜4・6 の絵はパネルの変更で動いていない）。
// 7面の絵の振り分けは tests/panel-blocks.test.js が縛る
//
// **cache は 2026-10-31 に記録し直した**（砲台が壁に埋まる修正で、基地の砲台の箱に掛かる岩を空けるように
// したため。基地の部屋の浮き足場が欠けたマップの絵が変わる）。damaged は元の値のまま一致している
//
// **2面（level 1）は 2026-11-01 に外した**（2面の縁を坂・面取りにし、長い坂を盛ったため。設計 2026-11-01-stage2-orb-design.md）。
// cache と damaged は、その変更の前のコード（9b60939）で levels = [0, 2, 3, 5] を記録したもの。2面の絵は tests/stage2-slopes.test.js が縛る
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digestDrawing } from '../tools/record-terrain-baseline.mjs';

const BASELINE = {
  cache: '2ae684dc2d5ace0d1da70f9c9036a3afa1f6db2fe261614c2d68298dd046ce24',
  damaged: 'c32ab5bd504092eca1130408a25f66e15b471ee254ed17a6442f27b5814a7878',
};

test('5面以外の面では、地形のキャッシュに焼く絵も、壊した後の焼き直しも段5の前と同じ', async () => {
  assert.deepEqual(await digestDrawing(), BASELINE);
});
