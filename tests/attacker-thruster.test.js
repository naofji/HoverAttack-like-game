import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyAttacker } from '../src/js/entities/EnemyAttacker.js';
import { makeFakeCtx, extractFillRectsWithColor } from './helpers/fake-ctx.js';
import { ENEMY_ATTACKER_TYPES } from '../src/js/utils/Constants.js';
import { attackerFlamePower } from '../src/js/entities/thrusterFlame.js';

const AIR_MAP = { isSolidAtPixel: () => false, cols: 1000, rows: 1000 };

/** コンストラクタのスポーン処理を通さずに draw() できる最小インスタンス。 */
function makeAttacker(typeKey, overrides = {}) {
  const config = ENEMY_ATTACKER_TYPES[typeKey];
  const a = Object.create(EnemyAttacker.prototype);
  a.game = { map: AIR_MAP, enemies: [], player: null, carrier: null,
             projectiles: [], enemyBullets: [] };
  a.x = 0; a.y = 0; a.width = 16; a.height = 24;
  a.vx = 0; a.vy = 0;
  a.alive = true;
  a.onGround = false;
  a.config = config;
  a.hp = config.hp; a.maxHp = config.hp;
  a.maxSpeed = config.speed;
  a.jumpForce = config.jumpForce;
  a.facingRight = true;
  a.walkFrame = 2;
  a.walkTimer = 0;
  a.hovering = true;
  a.crouching = false;
  a.burstCount = 0;
  a.recoil = 0;
  a.smokeTimer = 0;
  return Object.assign(a, overrides);
}

/**
 * 炎の段だけを取り出す。artillery は胴体にも exhaustColor のノズル
 * (2, 12, 4, 2) を描くので、色だけでは分けられない。炎の段は必ず
 * 高さ 1px なので、そこで切り分ける。
 */
function flameRects(typeKey, overrides = {}) {
  const ctx = makeFakeCtx();
  makeAttacker(typeKey, overrides).draw(ctx);
  const color = ENEMY_ATTACKER_TYPES[typeKey].exhaustColor;
  return extractFillRectsWithColor(ctx.calls).filter((r) => r.color === color && r.h === 1);
}

test('4型それぞれの炎が型ごとの exhaustColor で描かれる', () => {
  for (const typeKey of ['standard', 'heavy', 'rival', 'artillery']) {
    const rects = flameRects(typeKey);
    assert.ok(rects.length > 0, `${typeKey} の炎が exhaustColor で描かれていない`);
  }
});

test('水色の直書きが残っていない（artillery は水色を使わない型）', () => {
  const ctx = makeFakeCtx();
  makeAttacker('artillery').draw(ctx);
  const cyan = extractFillRectsWithColor(ctx.calls).filter((r) => r.color === '#00FFFF');
  assert.equal(cyan.length, 0);
});

test('ホバーしていなければ炎を描かない', () => {
  assert.equal(flameRects('rival', { hovering: false }).length, 0);
});

test('climbThrust が大きい型ほど炎が長い', () => {
  const bottom = (rects) => Math.max(...rects.map((r) => r.y + r.h));
  // standard(0.75) > rival(0.65) > artillery(0.5) > heavy(0.45)
  const standard = bottom(flameRects('standard'));
  const heavy = bottom(flameRects('heavy'));
  assert.ok(standard > heavy, `standard=${standard} heavy=${heavy}`);
});

test('heavy でも炎が最低限の長さを保つ（power の下限 0.6）', () => {
  assert.ok(attackerFlamePower(ENEMY_ATTACKER_TYPES.heavy.climbThrust) >= 0.6);
  assert.ok(flameRects('heavy').length >= 6);
});
