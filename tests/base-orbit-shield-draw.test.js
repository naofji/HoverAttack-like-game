// 周回シールドの描画。立体に見えるかどうかは**描画順**で決まるので、
// 奥の羽根がコアより先に、手前の羽根がコアより後に出ることを縛る。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { EnemyBase } from '../src/js/entities/EnemyBase.js';
import {
  ENEMY_BASE_WIDTH, ENEMY_BASE_HEIGHT,
  BASE_ORBIT_SHIELD_MISSION, BASE_ORBIT_SHIELD_RADIUS, BASE_ORBIT_SHIELD_DEPLOY,
} from '../src/js/utils/Constants.js';

function makeGame() {
  return {
    missionsCompleted: BASE_ORBIT_SHIELD_MISSION,
    score: 0, enemies: [], particles: [],
    spawnSparks: () => { },
    triggerBaseEmergencyAlert: () => { },
  };
}

function exposedBase(phase) {
  const base = new EnemyBase(makeGame(), 100, 100);
  base.shields = 0;
  base.startOrbitShield();
  base.orbitDeployTimer = BASE_ORBIT_SHIELD_DEPLOY;
  base.orbitPhase = phase;
  return base;
}

const CX = ENEMY_BASE_WIDTH / 2;   // draw() は基地の左上へ translate 済み
const CY = ENEMY_BASE_HEIGHT / 2;

/** 羽根の本体は fillRect で描く。その中心Xを取り出す。 */
function panelCenterXs(ctx) {
  return ctx.calls
    .filter((c) => c.name === 'fillRect')
    .map((c) => c.args[0] + c.args[2] / 2);
}

test('展開していない基地は羽根を描かない', () => {
  const base = new EnemyBase(makeGame(), 100, 100);
  const ctx = makeFakeCtx();
  base._drawOrbitPanels(ctx, true);
  base._drawOrbitPanels(ctx, false);
  assert.equal(ctx.calls.length, 0, '展開していないのに何か描いている');
});

test('位相0では手前と奥に1枚ずつ出る', () => {
  const base = exposedBase(0);
  const front = makeFakeCtx();
  const back = makeFakeCtx();
  base._drawOrbitPanels(front, false);
  base._drawOrbitPanels(back, true);
  assert.equal(panelCenterXs(front).length, 1, '手前の羽根が1枚でない');
  assert.equal(panelCenterXs(back).length, 1, '奥の羽根が1枚でない');
});

test('羽根の横位置は軌道の投影と一致する', () => {
  const base = exposedBase(Math.PI / 2); // 右端と左端
  const ctx = makeFakeCtx();
  base._drawOrbitPanels(ctx, false);
  base._drawOrbitPanels(ctx, true);
  const xs = panelCenterXs(ctx).sort((a, b) => a - b);
  assert.equal(xs.length, 2);
  assert.ok(Math.abs(xs[0] - (CX - BASE_ORBIT_SHIELD_RADIUS)) < 0.001, `左端がずれている: ${xs[0]}`);
  assert.ok(Math.abs(xs[1] - (CX + BASE_ORBIT_SHIELD_RADIUS)) < 0.001, `右端がずれている: ${xs[1]}`);
});

test('展開の途中では羽根がコアの中心寄りにいる', () => {
  const base = exposedBase(Math.PI / 2);
  base.orbitDeployTimer = 1; // せり出し始めたところ
  const ctx = makeFakeCtx();
  base._drawOrbitPanels(ctx, false);
  base._drawOrbitPanels(ctx, true);
  for (const x of panelCenterXs(ctx)) {
    assert.ok(Math.abs(x - CX) < BASE_ORBIT_SHIELD_RADIUS,
      `出きった半径まで飛んでいる: ${x}`);
  }
});

test('羽根はコアの高さをまたぐ縦の板として描かれる', () => {
  const base = exposedBase(0);
  const ctx = makeFakeCtx();
  base._drawOrbitPanels(ctx, false);
  const rect = ctx.calls.find((c) => c.name === 'fillRect').args;
  const [, y, w, h] = rect;
  assert.ok(h > w, `縦長になっていない: ${w}x${h}`);
  assert.ok(y < CY && y + h > CY, '羽根がコアの高さをまたいでいない');
});

test('ガード中の羽根はコア色で光る', () => {
  const guarding = exposedBase(Math.PI / 2);
  const open = exposedBase(0);
  const coreColor = guarding._getCoreColors().main;

  const g = makeFakeCtx();
  guarding._drawOrbitPanels(g, false);
  const o = makeFakeCtx();
  open._drawOrbitPanels(o, false);

  const used = (ctx) => ctx.calls
    .filter((c) => c.name === 'set:strokeStyle' || c.name === 'set:fillStyle')
    .some((c) => c.args[0] === coreColor);

  assert.equal(used(g), true, 'ガード中なのにコア色で光っていない');
  assert.equal(used(o), false, '開いているのに光ってしまっている');
});

test('draw() は 奥の羽根 → コア → 手前の羽根 の順に描く', () => {
  const base = exposedBase(0);
  const order = [];
  const origPanels = base._drawOrbitPanels.bind(base);
  base._drawOrbitPanels = (ctx, behind) => {
    order.push(behind ? 'back' : 'front');
    origPanels(ctx, behind);
  };
  const origCore = base._drawCore.bind(base);
  base._drawCore = (ctx) => { order.push('core'); origCore(ctx); };

  base.draw(makeFakeCtx());

  assert.deepEqual(order, ['back', 'core', 'front']);
});

test('リングが残っている基地は羽根を描かない（展開前は姿を見せない）', () => {
  const base = new EnemyBase(makeGame(), 100, 100);
  const ctx = makeFakeCtx();
  base.draw(ctx);
  // 展開していないので orbitShieldActive は false のまま
  assert.equal(base.orbitShieldActive, false);
});
