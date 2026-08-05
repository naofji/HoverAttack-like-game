// パーツ定義 == draw() の fillRect であることを固定するテスト。
//
// これまで脚のポリライン照合(debris-player.test.js / debris-attacker.test.js)は
// あったが、drone 7個・tank 5個・carrier 7個・attacker 胴体4型ぶんの矩形パーツは
// 「機体枠から極端に外れていない」という緩い bbox テストしか無く、座標を丸ごと
// 壊しても検出できなかった。ここでは makeFakeCtx() に draw() を流し、
// extractFillRectsWithColor() で得た実際の fillRect と、パーツ定義の座標・色が
// 一致する（または carrier の左右分割船体のように定義側が実矩形の部分集合になっている）
// ことを確認する。装飾のみでパーツ化していない矩形（プロペラ・砲身の先端強調など）は
// 対応が無くてよい前提。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx, extractFillRectsWithColor } from './helpers/fake-ctx.js';
import { droneDebris } from '../src/js/entities/debris/droneParts.js';
import { tankDebris } from '../src/js/entities/debris/tankParts.js';
import { carrierDebris } from '../src/js/entities/debris/carrierParts.js';
import { attackerBodyParts } from '../src/js/entities/debris/attackerParts.js';
import { EnemyDrone } from '../src/js/entities/EnemyDrone.js';
import { EnemyTank } from '../src/js/entities/EnemyTank.js';
import { Carrier } from '../src/js/entities/Carrier.js';
import { makeMap, makeGame, makeAttacker, flatFloorRows } from './helpers/enemy-world.js';
import { ENEMY_ATTACKER_TYPES } from '../src/js/utils/Constants.js';

/** 負の w/h を持つ fillRect(x,y,w,h) を正規化する（canvas は負サイズも許す）。 */
function normalizeRect(rect) {
  const x = Math.min(rect.x, rect.x + rect.w);
  const w = Math.abs(rect.w);
  const y = Math.min(rect.y, rect.y + rect.h);
  const h = Math.abs(rect.h);
  return { x, y, w, h, color: rect.color };
}

/**
 * パーツ定義 part が、描画側の矩形 rect と一致するか判定する。
 * 完全一致（中心・幅・高さが同じ）なら真。
 * さらに、carrier の下部船体のように定義側が実矩形を左右に割った
 * 部分集合であるケースも許容するため、rect に完全に内包される場合も真とする。
 */
function partMatchesRect(part, rect, eps = 1e-6) {
  const r = normalizeRect(rect);
  if (part.color !== undefined && r.color !== part.color) return false;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  if (Math.abs(cx - part.x) < eps && Math.abs(cy - part.y) < eps &&
      Math.abs(r.w - part.w) < eps && Math.abs(r.h - part.h) < eps) {
    return true;
  }
  const partLeft = part.x - part.w / 2, partRight = part.x + part.w / 2;
  const partTop = part.y - part.h / 2, partBottom = part.y + part.h / 2;
  return partLeft >= r.x - eps && partRight <= r.x + r.w + eps &&
         partTop >= r.y - eps && partBottom <= r.y + r.h + eps;
}

function assertEachPartMatches(parts, rects, label) {
  for (const part of parts) {
    const found = rects.some((r) => partMatchesRect(part, r));
    assert.ok(found, `${label}: 描画に一致する矩形が無い part=${JSON.stringify(part)}`);
  }
}

test('EnemyDrone: droneDebris.parts は draw() の fillRect/arc と一致する（機体中心原点なので +12/+8 して比較）', () => {
  const drone = new EnemyDrone({}, 0, 0);
  drone.patrolDir = 1;     // mirror なし
  drone.tiltAngle = 0;     // rotation なし
  drone.state = 'patrol';  // アイの色を既定(#FFCC00)に固定
  drone.blinkTimer = 0;
  drone.propellerAngle = 0;

  const ctx = makeFakeCtx();
  drone.draw(ctx);
  const rawRects = extractFillRectsWithColor(ctx.calls);
  const shifted = rawRects.map((r) => ({ ...r, x: r.x + 12, y: r.y + 8 }));

  // アイ（円）以外の6パーツは fillRect 側に対応がある
  const fillRectParts = droneDebris.parts.filter((p) => p.color !== '#FFCC00');
  assertEachPartMatches(fillRectParts, shifted, 'drone');

  // アイは arc(4, 2, 2.5, ...) で描かれる。中心 (4,2) + (12,8) = (16,10) が
  // パーツ定義の (16, 10) と一致することを確認する。
  const eyePart = droneDebris.parts.find((p) => p.color === '#FFCC00');
  assert.ok(eyePart, 'drone: アイのパーツ定義が見つからない');
  const arcCall = ctx.calls.find((c) => c.name === 'arc');
  assert.ok(arcCall, 'drone: アイの arc 呼び出しが無い');
  assert.ok(Math.abs((arcCall.args[0] + 12) - eyePart.x) < 1e-6);
  assert.ok(Math.abs((arcCall.args[1] + 8) - eyePart.y) < 1e-6);
});

test('EnemyTank: tankDebris.parts は draw() の fillRect と一致する（左上原点なので変換不要）', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  const tank = new EnemyTank(game, 0, 0);
  tank.facingRight = true;
  tank.exhaustTimer = 0;

  const ctx = makeFakeCtx();
  tank.draw(ctx);
  const rects = extractFillRectsWithColor(ctx.calls);

  assertEachPartMatches(tankDebris.parts, rects, 'tank');
});

test('Carrier: carrierDebris.parts は draw() の fillRect と一致する（entity を原点に置いて比較）', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  game.player = null;
  const carrier = new Carrier(game, 0, 0);

  const ctx = makeFakeCtx();
  carrier.draw(ctx);
  const rects = extractFillRectsWithColor(ctx.calls);

  assertEachPartMatches(carrierDebris.parts, rects, 'carrier');
});

test('EnemyAttacker: attackerBodyParts() は型ごとに draw() の fillRect と一致する（crouchOffset ぶんYを補正）', () => {
  for (const typeKey of Object.keys(ENEMY_ATTACKER_TYPES)) {
    for (const crouching of [false, true]) {
      const game = makeGame(makeMap(flatFloorRows()));
      const e = makeAttacker(game, 40, 16, typeKey);
      e.facingRight = true;
      e.crouching = crouching;
      e.burstCount = 0;
      e.hovering = false; // ホバー排気の乱数矩形を混ぜない

      const ctx = makeFakeCtx();
      e.draw(ctx);
      const rawRects = extractFillRectsWithColor(ctx.calls);
      const crouchOffset = crouching ? 4 : 0;
      // draw() は translate(0, crouchOffset) してから描くので、fillRect の生の
      // 引数には crouchOffset が乗っていない。パーツ定義側は乗せてあるので、
      // 描画側に足してから比較する。
      const shifted = rawRects.map((r) => ({ ...r, y: r.y + crouchOffset }));

      // artillery のアンテナは segmentPart による近似で、実際に描かれる
      // 2区間のポリラインとは一致しない（意図的な簡略化）ので除外する。
      const parts = attackerBodyParts(e).filter((p) => p.angle === undefined);
      assertEachPartMatches(parts, shifted, `attacker/${typeKey}/crouching=${crouching}`);
    }
  }
});
