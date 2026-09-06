import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import {
  BLOCK_NORMAL, BLOCK_HARD,
  HARD_BLOCK_CHANCE_BY_STAGE,
} from '../src/js/utils/Constants.js';

// Map._generateMiniMap() が canvas を触るので最小限の DOM スタブ。
before(() => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }),
  };
});

/** 破壊可能タイル（normal + hard）のうち hard が占める割合。seed を複数本ならして返す。 */
function hardRatio(MapClass, missionLevel, seeds = [1, 2, 3, 4, 5]) {
  let normal = 0, hard = 0;
  for (const seed of seeds) {
    const map = new MapClass({ rng: new SeededRNG(seed) }, missionLevel);
    for (const row of map.grid) {
      for (const b of row) {
        if (b === BLOCK_NORMAL) normal++;
        else if (b === BLOCK_HARD) hard++;
      }
    }
  }
  return hard / (normal + hard);
}

/** 行が [左, 右] の対なら、マップ全体で均すと中点になる。 */
function meanChance(row) {
  return Array.isArray(row) ? (row[0] + row[1]) / 2 : row;
}

test('硬い岩の割合は面ごとの表のとおりになる', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  for (let lv = 0; lv < HARD_BLOCK_CHANCE_BY_STAGE.length; lv++) {
    const want = meanChance(HARD_BLOCK_CHANCE_BY_STAGE[lv]);
    const got = hardRatio(Map, lv);
    // 数万タイルを引くので実測は表の値にほぼ一致する。±0.03 は seed 5本ぶんの揺れの上限
    assert.ok(Math.abs(got - want) < 0.03,
      `面${lv + 1}: 表は ${want} だが実測 ${got.toFixed(3)}`);
  }
});

test('5面だけ特別に8割、それ以外は面が進むほど増える', () => {
  const t = HARD_BLOCK_CHANCE_BY_STAGE.map(meanChance);
  assert.equal(t.length, 7, '面は7つ');
  assert.equal(t[4], 0.8, '5面は岩8割');
  // 5面を除いた並びが単調非減少であること（5面は表から外して見る）
  const others = t.filter((_, i) => i !== 4);
  for (let i = 1; i < others.length; i++) {
    assert.ok(others[i] >= others[i - 1],
      `5面を除くと単調非減少のはずが ${others[i - 1]} → ${others[i]}`);
  }
  assert.ok(t[6] > t[0], '7面は1面より硬い岩が多い');
});

test('硬い岩の割合を変えても乱数の消費数は変わらない（週次の決定性を壊さない）', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  // 本物の _placeHardBlocks() を、同じ盤面・違う面で呼んで rng を引いた回数を数える。
  // 確率に関係なく破壊可能タイル1つにつき必ず1回引く形でなければ、後続のスポーン決定が
  // ずれて「同じ週なら同じ配置」が壊れる。実際に if の書き方ひとつで壊れる箇所なので縛る。
  function countDraws(missionLevel) {
    const rows = 40, cols = 40;
    const grid = Array.from({ length: rows }, () => new Array(cols).fill(BLOCK_NORMAL));
    const blockHP = Array.from({ length: rows }, () => new Array(cols).fill(1));
    let draws = 0;
    const inner = new SeededRNG(3);
    const self = {
      rows, cols, grid, blockHP, missionLevel,
      game: { rng: { next: () => { draws++; return inner.next(); } } },
    };
    Map.prototype._placeHardBlocks.call(self);
    let hard = 0;
    for (const row of grid) for (const b of row) if (b === BLOCK_HARD) hard++;
    return { draws, hard };
  }
  const low = countDraws(0);   // 0.06
  const high = countDraws(4);  // 0.80
  assert.equal(low.draws, high.draws, '引いた回数は割合によらず同じでなければならない');
  assert.ok(high.hard > low.hard * 5, `5面のほうが硬い岩が多いはず (${low.hard} → ${high.hard})`);
});

test('missionLevel が表の長さを超えても剰余で丸める', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  // debugStartMission で面数を超えた値が来ることがある（パレット・環境と同じ扱い）
  const got = hardRatio(Map, HARD_BLOCK_CHANCE_BY_STAGE.length + 4, [11, 12, 13]);
  assert.ok(Math.abs(got - HARD_BLOCK_CHANCE_BY_STAGE[4]) < 0.03,
    `剰余で5面ぶん(${HARD_BLOCK_CHANCE_BY_STAGE[4]})になるはずが ${got.toFixed(3)}`);
});

test('7面は右へ進むほど硬い岩が増える', async () => {
  const { Map } = await import('../src/js/world/Map.js');
  const row = HARD_BLOCK_CHANCE_BY_STAGE[6];
  assert.ok(Array.isArray(row), '7面の行が [左, 右] の対になっていない');
  const [left, right] = row;
  assert.ok(right > left, `右が左より大きくない: ${left} → ${right}`);

  // 実測。区画を5等分して、左から右へ単調に増えることを見る。
  // 要塞区画は自分の矩形を書き潰すので、その中は数えない
  const bands = [0, 0, 0, 0, 0];
  const totals = [0, 0, 0, 0, 0];
  for (const seed of [1, 2, 3]) {
    const map = new Map({ rng: new SeededRNG(seed) }, 6);
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        if (map.fortress[r * map.cols + c] === 1) continue;
        const b = Math.min(4, Math.floor((c / map.cols) * 5));
        const v = map.grid[r][c];
        if (v === BLOCK_NORMAL) totals[b]++;
        else if (v === BLOCK_HARD) { totals[b]++; bands[b]++; }
      }
    }
  }
  const ratios = bands.map((h, i) => h / totals[i]);
  for (let i = 1; i < ratios.length; i++) {
    assert.ok(ratios[i] > ratios[i - 1],
      `帯 ${i} で増えていない: ${ratios.map((v) => v.toFixed(2)).join(' ')}`);
  }
  assert.ok(Math.abs(ratios[0] - left) < 0.08, `左端が表と合わない: ${ratios[0].toFixed(2)} vs ${left}`);
  assert.ok(Math.abs(ratios[4] - right) < 0.08, `右端が表と合わない: ${ratios[4].toFixed(2)} vs ${right}`);
});

test('7面以外は今までどおり面ごとに一律', () => {
  for (let lv = 0; lv < 6; lv++) {
    assert.equal(typeof HARD_BLOCK_CHANCE_BY_STAGE[lv], 'number',
      `面${lv + 1} が対になっている（一律のはず）`);
  }
});
