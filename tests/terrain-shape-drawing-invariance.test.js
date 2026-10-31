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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digestDrawing } from '../tools/record-terrain-baseline.mjs';

const BASELINE = {
  cache: '3ae26e2255505a6e185505067e871d30a35ab251abb82e33dbf3c7264493f073',
  damaged: 'f362b81d67f83bfbf3fb3f71adfadc7cf72f55237c740c494b942047fc110d8c',
};

test('5面以外の面では、地形のキャッシュに焼く絵も、壊した後の焼き直しも段5の前と同じ', async () => {
  assert.deepEqual(await digestDrawing(), BASELINE);
});
