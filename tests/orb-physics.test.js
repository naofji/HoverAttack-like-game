// Orb（押せて転がる壊せない鉱物）の地形との物理（設計 2026-11-01-stage2-orb-design.md 4.3）。
// 真円ではないことを転がりの抵抗で表す: 45度の坂では転がり出し、平らな所では止まる。止まったら震えない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMap, makeGame } from './helpers/enemy-world.js';
import { Orb } from '../src/js/entities/Orb.js';
import { ORB_CONTACT_EPS } from '../src/js/utils/orbPhysics.js';
import { ORB_SIZES, TILE_SIZE as T } from '../src/js/utils/Constants.js';

/**
 * 左が高い 45度の坂（6段）と、その右に長い平らな床（床の上面は row 15 = y 240）。
 * caveSlope の規則で段がタイル1枚ぶんの斜めになる
 */
function slopeWorld() {
  const cols = 60, rows = [];
  for (let r = 0; r < 20; r++) {
    let s = '';
    for (let c = 0; c < cols; c++) {
      const k = 15 - r; // 床から何段上か
      s += (r >= 15 || (k >= 1 && k <= 6 && c <= 8 - k)) ? '#' : '.';
    }
    rows.push(s);
  }
  const game = makeGame(makeMap(rows, null, { tileShape: 'caveSlope' }));
  return game;
}

function flatWorld() {
  const rows = [];
  for (let r = 0; r < 20; r++) rows.push((r >= 15 ? '#' : '.').repeat(60));
  return makeGame(makeMap(rows));
}

const FLOOR_Y = 15 * T;

function settle(orb, frames) { for (let i = 0; i < frames; i++) orb.update(); }

// 接しているだけ（円周がちょうど床の上面）は入ったと数えない（orbPhysics の ORB_CONTACT_EPS と同じ）
function perimeterInRock(map, orb) {
  const rr = orb.r - ORB_CONTACT_EPS;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    if (map.isSolidPoint(orb.cx + Math.cos(a) * rr, orb.cy + Math.sin(a) * rr)) return true;
  }
  return false;
}

for (const size of ['small', 'large']) {
  const r = ORB_SIZES[size].diameter / 2;

  test(`${size}: 45度の坂の途中に置くと転がり出し、平らな床で 600 フレーム以内に止まって動かなくなる`, () => {
    const game = slopeWorld();
    // 坂の途中（3段目の上あたり）。少し浮かせて置き、坂に落ちてから転がる
    const orb = new Orb(game, { cx: 5 * T, cy: 9 * T - r - 2, size });
    let rolled = false;
    for (let i = 0; i < 60; i++) { orb.update(); if (Math.abs(orb.vx) > 0.3) rolled = true; }
    assert.ok(rolled, '坂で転がり出さない');
    let stoppedAt = -1;
    for (let i = 60; i < 600; i++) {
      orb.update();
      if (orb.vx === 0 && orb.vy === 0 && stoppedAt < 0) stoppedAt = i;
    }
    assert.ok(stoppedAt > 0, '止まらない');
    assert.ok(orb.cx > 9 * T, '坂の下の平らな床まで来ていない');
    const x = orb.x, y = orb.y;
    settle(orb, 30);
    assert.equal(orb.x, x, '止まった後に x が動く');
    assert.equal(orb.y, y, '止まった後に y が動く（震え）');
    assert.ok(Math.abs(orb.cy + r - FLOOR_Y) < 1, `床の上に乗っていない: 下端 ${orb.cy + r}`);
  });

  test(`${size}: 平らな床に置いた Orb は 300 フレーム動かない`, () => {
    const game = flatWorld();
    const orb = new Orb(game, { cx: 20 * T, cy: FLOOR_Y - r, size });
    const x = orb.x, y = orb.y;
    settle(orb, 300);
    assert.equal(orb.vx, 0);
    assert.equal(orb.x, x);
    assert.equal(orb.y, y);
  });

  test(`${size}: 平らな床で vx=3 にした Orb は 50 タイル未満で止まる`, () => {
    const game = flatWorld();
    const orb = new Orb(game, { cx: 5 * T, cy: FLOOR_Y - r, size });
    orb.vx = 3;
    settle(orb, 400);
    assert.equal(orb.vx, 0);
    assert.ok(orb.cx - 5 * T < 50 * T);
    assert.ok(orb.cx - 5 * T > T, '少しは転がる');
  });

  test(`${size}: 坂・面取り・平地で 2000 フレーム動かしても円周の点が岩に入らない`, () => {
    const game = slopeWorld();
    const orb = new Orb(game, { cx: 1.5 * T, cy: 3 * T, size });
    let bad = 0;
    for (let i = 0; i < 2000; i++) {
      orb.update();
      if (perimeterInRock(game.map, orb)) bad++;
      if (i % 400 === 399) { orb.vx = -4; orb.vy = -3; } // 坂へ投げ返して何度も当てる
    }
    assert.equal(bad, 0);
  });

  test(`${size}: 高い所から落とすと一度弾み、弾む高さは落ちた高さより低い`, () => {
    const game = flatWorld();
    const startCy = 3 * T;
    const orb = new Orb(game, { cx: 20 * T, cy: startCy, size });
    let bounced = false, minCyAfter = Infinity, landed = false;
    for (let i = 0; i < 300; i++) {
      const vyBefore = orb.vy;
      orb.update();
      if (!landed && vyBefore > 0 && orb.vy < 0) { landed = true; bounced = true; continue; }
      if (landed) minCyAfter = Math.min(minCyAfter, orb.cy);
    }
    assert.ok(bounced, '弾まない');
    assert.ok(minCyAfter > startCy, '落ちた高さより高く弾む');
    assert.ok(minCyAfter < FLOOR_Y - r - 1, '目に見えて弾んでいない');
  });

  test(`${size}: 毎フレーム押すと平地では 0.875、上りの坂では 0.875 × uphillScale で進み、やめると転がり戻る`, () => {
    // 平地
    const flat = flatWorld();
    const a = new Orb(flat, { cx: 10 * T, cy: FLOOR_Y - r, size });
    for (let i = 0; i < 30; i++) { a.pushFrom(1, 0.875); a.update(); }
    assert.ok(Math.abs(a.vx - 0.875) < 0.01, `平地 vx ${a.vx}`);
    // 上りの坂（右から左へ押し上げる）
    const game = slopeWorld();
    const b = new Orb(game, { cx: 9 * T, cy: FLOOR_Y - r, size });
    for (let i = 0; i < 30; i++) { b.pushFrom(-1, 0.875); b.update(); } // 坂の麓まで寄せる
    const speeds = [];
    for (let i = 0; i < 40; i++) {
      const x0 = b.cx, y0 = b.cy;
      b.pushFrom(-1, 0.875); b.update();
      speeds.push({ s: Math.hypot(b.cx - x0, b.cy - y0), up: b.cy < y0 });
    }
    const uphill = speeds.filter((s) => s.up);
    assert.ok(uphill.length > 10, '坂を上っていない');
    const want = 0.875 * ORB_SIZES[size].uphillScale;
    const mean = uphill.reduce((t, s) => t + s.s, 0) / uphill.length;
    assert.ok(Math.abs(mean - want) < want * 0.25, `上りの速さ ${mean}（期待 ${want}）`);
    const cx = b.cx;
    settle(b, 60);
    assert.ok(b.cx > cx + 2, '押すのをやめても転がり戻らない');
  });
}

test('Orb の物理は Math.random を呼ばない', () => {
  const saved = Math.random;
  Math.random = () => { throw new Error('Math.random を呼んだ'); };
  try {
    const game = slopeWorld();
    const orb = new Orb(game, { cx: 3 * T, cy: 4 * T, size: 'large' });
    for (let i = 0; i < 600; i++) { if (i < 100) orb.pushFrom(1, 0.5); orb.update(); }
  } finally {
    Math.random = saved;
  }
});

// 最終レビュー Important 3: 狭いすき間に挟まった Orb が、押し出しの法線の向きがフレームごとに変わって
// 10〜14px の瞬間移動を延々と繰り返した（本物の2面 100週で 500個中 6個が止まらなかった）
test('斜めのすき間に落ちた Orb は 1000 フレーム後には止まり、1フレームに 2px より大きく跳ばない', () => {
  const rows = [];
  for (let r = 0; r < 20; r++) {
    let s = '';
    for (let c = 0; c < 30; c++) {
      if (r === 10) s += c <= 14 ? '#' : '.';
      else if (r === 11) s += c >= 16 ? '#' : '.';
      else s += r >= 16 ? '#' : '.';
    }
    rows.push(s);
  }
  for (const size of ['small', 'large']) {
    for (let x0 = 13 * T; x0 <= 17 * T; x0 += 2) {
      const game = makeGame(makeMap(rows, null, { tileShape: 'caveSlope' }));
      const o = new Orb(game, { cx: x0, cy: 6 * T, size });
      let moving = 0, worst = 0;
      for (let f = 0; f < 1500; f++) {
        const px = o.cx, py = o.cy;
        o.update();
        const j = Math.hypot(o.cx - px, o.cy - py);
        if (f > 1000) { worst = Math.max(worst, j); if (j > 0.01) moving++; }
      }
      assert.equal(moving, 0, `${size} x0=${x0}: 止まらない（最大 ${worst.toFixed(1)}px）`);
    }
  }
});
