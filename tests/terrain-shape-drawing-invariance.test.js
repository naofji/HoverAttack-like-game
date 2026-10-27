// 5面以外の地形の絵が段5（5面の描画を形に置き換える）の前後で変わらないことを縛る。
// 基準線は段5の計画のコミット（971c93d、描画の変更を入れる前）のコードで
// `node tools/record-terrain-baseline.mjs --drawing` を走らせて記録した。
// 実装から期待値を導かないため、段5の変更の後に記録し直さないこと。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digestDrawing } from '../tools/record-terrain-baseline.mjs';

const BASELINE = {
  cache: 'd04c001ced9dd4bdebd3e1e1ac3cbb941e028150fa130595877e139a9952a1da',
  damaged: '2343e0b894dbad0374ffeaa097df6bcf953295d39184916e547ea040d8f50207',
};

test('5面以外の面では、地形のキャッシュに焼く絵も、壊した後の焼き直しも段5の前と同じ', async () => {
  assert.deepEqual(await digestDrawing(), BASELINE);
});
