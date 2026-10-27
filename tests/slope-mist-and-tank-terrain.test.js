// 5面の坂の上で、ホバーの粉雪の地面探し（groundClearance）と戦車の onTerrain が、タイルの形の
// 斜辺を地面として見ることを縛る。タイル単位で見ると、坂の削れた空中を地面と取り違え、
// 粉雪が斜辺より高い所に出て、斜辺から浮いた戦車も「接地」になっていた。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMap, makeGame } from './helpers/enemy-world.js';
import { groundClearance } from '../src/js/utils/surface.js';
import { EnemyTank } from '../src/js/entities/EnemyTank.js';

// 右上がりの階段。形の規則で途切れのない 45度の坂になり、斜辺は y = 176 − x（列 4〜11）
const STAIRS = [
  '............',
  '............',
  '............',
  '.......#####',
  '......######',
  '.....#######',
  '....########',
  '############',
];

test('坂の斜辺の 10px 上でホバーする機体の、地面までの距離は斜辺までの距離（4px 刻み）', () => {
  const game = { map: makeMap(STAIRS, null, { tileShape: 'snowSlope' }) };
  // 中心の列 x = 88 の斜辺は y = 88。足元をその 10px 上に置く
  const e = { x: 80, y: 78 - 24, width: 16, height: 24 };
  const d = groundClearance(e, game, 32);
  assert.ok(d !== null && d >= 8 && d <= 12, `d = ${d}`);
});

test('四角い地形では、同じ階段の地面の距離はタイルの上端まで（5面以外は変わらない）', () => {
  const game = { map: makeMap(STAIRS) };
  const e = { x: 80, y: 78 - 24, width: 16, height: 24 };
  assert.equal(groundClearance(e, game, 32), 4);
});

function tankAt(map, x, feetY) {
  const game = makeGame(map);
  game.camera = { x: 0, y: 0, shake() {} };
  game.canvas = { width: 1024, height: 768 };
  game.spawnSnowKick = () => {};
  game.player = { x: 1000, y: 0, width: 16, height: 24, vx: 0, vy: 0, alive: true, docked: false, takeDamage() {} };
  const t = new EnemyTank(game, x, 0);
  t.y = feetY - t.height;
  return t;
}

test('坂の上で、足元の両端の列とも斜辺から浮いている戦車は onTerrain にならない', () => {
  const map = makeMap(STAIRS, null, { tileShape: 'snowSlope' });
  const t = tankAt(map, 82, 0);
  // 右端のプローブの列（x + w − 2）の斜辺の 6px 上に足元の 1px 下が来るように置く
  const rx = t.x + t.width - 2;
  t.y = (176 - rx) - 6 - 1 - t.height;
  t._moveAndCollide();
  assert.equal(t.onTerrain, false);
});

test('坂の斜辺に足元が触れている戦車は onTerrain になる', () => {
  const map = makeMap(STAIRS, null, { tileShape: 'snowSlope' });
  const t = tankAt(map, 82, 0);
  const rx = t.x + t.width - 2;
  t.y = (176 - rx) - 1 - t.height;
  t._moveAndCollide();
  assert.equal(t.onTerrain, true);
});
