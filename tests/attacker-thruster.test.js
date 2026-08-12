import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyAttacker } from '../src/js/entities/EnemyAttacker.js';
import { makeFakeCtx, extractFillRectsWithColor } from './helpers/fake-ctx.js';
import { ENEMY_ATTACKER_TYPES } from '../src/js/utils/Constants.js';
import { attackerFlamePower, drawThrusterFlame } from '../src/js/entities/thrusterFlame.js';

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
 * 炎の段だけを取り出す。炎の段は必ず高さ 1px なので、そこで切り分ける
 * （機体側の部品と色が衝突しても混ざらないようにするため。実際 standard は
 * 胴体に exhaustColor のノズル (2, 12, 4, 2) を描く）。
 */
function flameRects(typeKey, overrides = {}) {
  const ctx = makeFakeCtx();
  makeAttacker(typeKey, overrides).draw(ctx);
  const color = ENEMY_ATTACKER_TYPES[typeKey].flameColor;
  return extractFillRectsWithColor(ctx.calls).filter((r) => r.color === color && r.h === 1);
}

test('4型それぞれの炎が型ごとの flameColor で描かれる', () => {
  for (const typeKey of ['standard', 'heavy', 'rival', 'artillery']) {
    const rects = flameRects(typeKey);
    assert.ok(rects.length > 0, `${typeKey} の炎が flameColor で描かれていない`);
  }
});

// 機体に溶けて見えたので炎の色を機体色から離した。うっかり cfg.exhaustColor へ
// 戻すと（元の実装がそうだった）機体側の部品と同じ色に戻ってしまう。
test('炎が機体側の部品の色（exhaustColor）で描かれていない', () => {
  for (const typeKey of ['standard', 'heavy', 'rival', 'artillery']) {
    const ctx = makeFakeCtx();
    makeAttacker(typeKey).draw(ctx);
    const exhaust = ENEMY_ATTACKER_TYPES[typeKey].exhaustColor;
    const asFlame = extractFillRectsWithColor(ctx.calls)
      .filter((r) => r.color === exhaust && r.h === 1);
    assert.equal(asFlame.length, 0, `${typeKey} の炎が exhaustColor のまま`);
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

test('climbThrust が大きい型ほど炎の power が大きい（4型の完全な順序）', () => {
  // draw() は flicker を渡さないため実際の描画は Math.random() を使う。standard
  // (power 1.0, outerLen 12..16) と heavy (power 0.6, outerLen 9..12) は 12 で
  // 範囲が重なるため、draw() 経由の長さ比較を assert すると約4%の確率で落ちる
  // （20,000回のモンテカルロで4.10%、実測でも40回中1回失敗した）。乱数を経由しない
  // 純関数 attackerFlamePower() の出力を直接比較して、4型の順序を決定的に検証する。
  // standard(0.75) > rival(0.65) > artillery(0.5) > heavy(0.45)
  const standard = attackerFlamePower(ENEMY_ATTACKER_TYPES.standard.climbThrust);
  const rival = attackerFlamePower(ENEMY_ATTACKER_TYPES.rival.climbThrust);
  const artillery = attackerFlamePower(ENEMY_ATTACKER_TYPES.artillery.climbThrust);
  const heavy = attackerFlamePower(ENEMY_ATTACKER_TYPES.heavy.climbThrust);
  assert.ok(standard > rival, `standard=${standard} rival=${rival}`);
  assert.ok(rival > artillery, `rival=${rival} artillery=${artillery}`);
  assert.ok(artillery > heavy, `artillery=${artillery} heavy=${heavy}`);
});

test('power の差は炎の実際の長さにも反映される（flicker を固定して決定的に検証）', () => {
  // 上のテストは power 自体の順序を見るだけなので、power が実際に描画へ効いている
  // ことも別途確かめる。draw() を経由せず drawThrusterFlame() を flicker 固定で
  // 直接呼び、standard と heavy の描画結果（外炎の最下段の y）を比較する。
  const bottom = (rects) => Math.max(...rects.map((r) => r.y + r.h));
  const drawFixed = (typeKey) => {
    const ctx = makeFakeCtx();
    const color = ENEMY_ATTACKER_TYPES[typeKey].flameColor;
    drawThrusterFlame(ctx, 4, 14, {
      color,
      power: attackerFlamePower(ENEMY_ATTACKER_TYPES[typeKey].climbThrust),
      // 伸び縮みも横揺れもゼロに固定して幾何だけを比較する
      flicker: 0.5,
      sway: 0.5,
    });
    return extractFillRectsWithColor(ctx.calls).filter((r) => r.color === color && r.h === 1);
  };
  const standard = bottom(drawFixed('standard'));
  const heavy = bottom(drawFixed('heavy'));
  assert.ok(standard > heavy, `standard=${standard} heavy=${heavy}`);
});

test('heavy でも炎が最低限の長さを保つ（power の下限 0.6）', () => {
  assert.ok(attackerFlamePower(ENEMY_ATTACKER_TYPES.heavy.climbThrust) >= 0.6);
  assert.ok(flameRects('heavy').length >= 6);
});
