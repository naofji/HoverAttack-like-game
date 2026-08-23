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

/** 羽根本体の fillRect を [x,y,w,h] で取り出す。 */
function panelRects(ctx) {
  return ctx.calls.filter((c) => c.name === 'fillRect').map((c) => c.args);
}

test('手前の羽根は奥の羽根より大きく描かれる', () => {
  const base = exposedBase(0); // 一方が真正面(手前)、もう一方が真後ろ
  const front = makeFakeCtx();
  const back = makeFakeCtx();
  base._drawOrbitPanels(front, false);
  base._drawOrbitPanels(back, true);

  const [, , fw, fh] = panelRects(front)[0];
  const [, , bw, bh] = panelRects(back)[0];
  assert.ok(fw > bw, `手前の幅が奥より大きくない: ${fw} vs ${bw}`);
  assert.ok(fh > bh, `手前の高さが奥より大きくない: ${fh} vs ${bh}`);
});

const PHASES = [0, 0.4, Math.PI / 2, 2.2, Math.PI, 4.0, 5.5];

/** 全位相・手前奥それぞれの羽根の矩形をまとめて集める。 */
function allPanelRects() {
  const out = [];
  for (const phase of PHASES) {
    const base = exposedBase(phase);
    const ctx = makeFakeCtx();
    base._drawOrbitPanels(ctx, false);
    base._drawOrbitPanels(ctx, true);
    for (const r of panelRects(ctx)) out.push({ phase, rect: r });
  }
  return out;
}

test('羽根の縦の中心は奥行きによらず一定', () => {
  // 手前ほど大きくするぶん、上下へ均等に伸ばす。中心がずれると板の端が
  // ふらついて、回転ではなく上下動に見えてしまう
  const center = ({ rect }) => rect[1] + rect[3] / 2;
  const all = allPanelRects();
  const first = center(all[0]);
  for (const p of all) {
    assert.ok(Math.abs(center(p) - first) < 0.001,
      `位相 ${p.phase} で中心がずれている: ${center(p)} vs ${first}`);
  }
});

test('一番大きい羽根でも基地の下端（床の表面）を越えない', () => {
  // 基地は下端が床タイルにぴったり乗っている。ここを越えると基地ごと
  // ブロックにめり込んで見える（実際にそう見えた）
  for (const { phase, rect } of allPanelRects()) {
    const bottom = rect[1] + rect[3];
    assert.ok(bottom <= ENEMY_BASE_HEIGHT + 0.001,
      `位相 ${phase} で羽根が床にめり込んでいる: 下端 ${bottom} > ${ENEMY_BASE_HEIGHT}`);
  }
});

test('羽根はコアの高さをまたいでいる（中心を上げても守りの絵になる）', () => {
  for (const { phase, rect } of allPanelRects()) {
    const [, y, , h] = rect;
    assert.ok(y < CY && y + h > CY, `位相 ${phase} でコアの高さをまたいでいない`);
  }
});

test('軌道の楕円は手前半分と奥半分に分けて描かれる', () => {
  const base = exposedBase(0);
  const front = makeFakeCtx();
  const back = makeFakeCtx();
  base._drawOrbitPanels(front, false);
  base._drawOrbitPanels(back, true);

  const arc = (ctx) => ctx.calls.find((c) => c.name === 'ellipse');
  assert.ok(arc(front), '手前側に軌道が描かれていない');
  assert.ok(arc(back), '奥側に軌道が描かれていない');
  // 楕円の媒介変数は y = cy + ry*sin t。手前(下)は 0..π、奥(上)は π..2π
  assert.deepEqual(arc(front).args.slice(5), [0, Math.PI]);
  assert.deepEqual(arc(back).args.slice(5), [Math.PI, Math.PI * 2]);
  // rx は周回半径、ry は見下ろしぶん。潰れた楕円になっていること
  const [, , rx, ry] = arc(front).args;
  assert.ok(Math.abs(rx - BASE_ORBIT_SHIELD_RADIUS) < 0.001, `rx が周回半径でない: ${rx}`);
  assert.ok(ry > 0 && ry < rx / 2, `ry が見下ろしぶんの潰れ方でない: ${ry}`);
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
