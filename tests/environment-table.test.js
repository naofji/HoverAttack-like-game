import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGE_ENVIRONMENTS, ENV_KINDS, ENV_BACKDROPS, STAGE_PALETTES,
} from '../src/js/utils/Constants.js';

// 面ごとの環境は表の1行。行数はパレットと同じ7、値は既知のものだけ。
test('STAGE_ENVIRONMENTS has one row per stage palette', () => {
  assert.equal(STAGE_ENVIRONMENTS.length, STAGE_PALETTES.length);
});

test('every row uses a known kind, backdrop and terrain', () => {
  for (const row of STAGE_ENVIRONMENTS) {
    assert.ok(ENV_KINDS.includes(row.kind), `unknown kind ${row.kind}`);
    assert.ok(ENV_BACKDROPS.includes(row.backdrop), `unknown backdrop ${row.backdrop}`);
    assert.equal(row.terrain, 'cave'); // 7面の要塞化は別設計。今は予約だけ
  }
});

// 設計で決めた割り当て。ここが動くと面別ランキングの条件が変わるので固定する。
test('stage assignment matches the design', () => {
  assert.deepEqual(STAGE_ENVIRONMENTS.map((r) => r.kind),
    ['none', 'none', 'none', 'water', 'snow', 'fog', 'none']);
  assert.deepEqual(STAGE_ENVIRONMENTS.map((r) => r.backdrop),
    ['cave', 'cave', 'cave', 'wet', 'snow', 'fog', 'machine']);
});
