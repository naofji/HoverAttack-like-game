import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { ENEMY_TURRET_WIDTH as W, ENEMY_TURRET_HEIGHT as H } from '../src/js/utils/Constants.js';

// 砲台（反射ビーム砲も同じ EnemyTurret）は 24px 角で、16px のタイルより大きい。
// 置き場所を1タイルだけ見て決めると、はみ出した 8px が岩に刺さって「壁に埋まった」砲台になる
// （実機の指摘）。修正前は 7面×30シードで、基地の床の砲台が毎回・要塞の守備隊の床の砲台が全部
// 8px 沈み、面全体の砲台と基地の天井の砲台がまれに隣の岩に掛かっていた。

before(() => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

// 1面あたり 6 シード（計 42 マップ、約 2.5 秒）。まれな方の埋まり（面全体の砲台・基地の天井）も
// 修正前はこの範囲で拾えることを確かめてある
const SEEDS = 6;
let maps = null;

async function eachTurret(fn) {
  if (!maps) {
    const { Map } = await import('../src/js/world/Map.js');
    maps = [];
    for (let lvl = 0; lvl <= 6; lvl++) {
      for (let seed = 1; seed <= SEEDS; seed++) {
        maps.push({ lvl, seed, map: new Map({ rng: new SeededRNG(seed), missionsCompleted: lvl }, lvl) });
      }
    }
  }
  for (const { lvl, seed, map } of maps) {
    for (const p of map.enemyTurretSpawns) fn(map, p, `${lvl + 1}面 seed${seed} (${p.x},${p.y}) ${p.isCeiling ? '天井' : '床'}`);
  }
}

test('どの面の砲台も、箱の中に岩が無い', async () => {
  const bad = [];
  await eachTurret((map, p, label) => {
    // 縁の 1px は接している岩なので見ない
    for (let y = p.y + 1; y < p.y + H - 1; y++) {
      for (let x = p.x + 1; x < p.x + W - 1; x++) {
        if (map.isSolidPoint(x, y)) { bad.push(label); return; }
      }
    }
  });
  assert.deepEqual(bad, []);
});

test('どの面の砲台も、付け根（床置きは下・天井付けは上）が岩に接している', async () => {
  const bad = [];
  await eachTurret((map, p, label) => {
    // 坂の上では3列（両端から 2px 内側と中央）の一番高い床で支える（Map.floorUnder と同じ）ので、
    // どれか1列が接していればよい
    const y = p.isCeiling ? p.y - 1 : p.y + H;
    if (![p.x + 2, p.x + W / 2, p.x + W - 2].some((x) => map.isSolidPoint(x, y))) bad.push(label);
  });
  assert.deepEqual(bad, []);
});
