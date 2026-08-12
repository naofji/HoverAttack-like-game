import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyAttacker } from '../src/js/entities/EnemyAttacker.js';
import { makeFakeCtx, extractFillRectsWithColor } from './helpers/fake-ctx.js';
import { ENEMY_ATTACKER_TYPES, ATTACKER_FLAME_POWER_MIN } from '../src/js/utils/Constants.js';
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

// climbThrust を 0〜1 へ素直に正規化すると heavy（最小）の炎がほぼ消えるので、
// power に下限を設けてある。下限の値そのものは実機の見え方で動かすため、
// 定数を参照して「下限が効いていること」だけを縛る。
test('heavy でも炎が最低限の長さを保つ（power の下限が効いている）', () => {
  assert.equal(attackerFlamePower(ENEMY_ATTACKER_TYPES.heavy.climbThrust),
    ATTACKER_FLAME_POWER_MIN);
  assert.ok(flameRects('heavy').length >= 6);
});

// 長さは flicker（±35%）に埋もれて型を見分けられないので、太さで見分けさせている。
// flameWidth を全型そろえてしまうと、その手掛かりが消える。
test('炎の太さが型ごとに違う（長さの差は揺らぎに埋もれるので太さが識別を担う）', () => {
  const widths = Object.values(ENEMY_ATTACKER_TYPES).map((cfg) => cfg.flameWidth);
  assert.ok(new Set(widths).size >= 3, `太さが揃いすぎている: ${widths.join(', ')}`);
  // heavy=ずんぐり, rival=鋭い、という機体シルエットとの対応
  assert.ok(ENEMY_ATTACKER_TYPES.heavy.flameWidth > ENEMY_ATTACKER_TYPES.rival.flameWidth);
});

test('指定した太さが炎の根元の幅になる（型ごとの flameWidth が効いている）', () => {
  for (const typeKey of ['standard', 'heavy', 'rival', 'artillery']) {
    const rects = flameRects(typeKey);
    const root = rects.reduce((a, b) => (b.w > a.w ? b : a));
    assert.equal(root.w, ENEMY_ATTACKER_TYPES[typeKey].flameWidth, typeKey);
  }
});

// artillery は4脚で背中という概念が薄いので、胴体 fillRect(5, 5, 11, 11) の真下
// （中心 x=10.5、下端 y=16）から炎を出す。2足の3型は背中のバックパック直下のまま。
test('artillery の炎は胴体の真下から出る（他の3型は背中側）', () => {
  const rootCenter = (typeKey) => {
    const rects = flameRects(typeKey);
    const root = rects.reduce((a, b) => (b.w > a.w ? b : a));
    return root.x + root.w / 2;
  };
  const artillery = rootCenter('artillery');
  assert.ok(artillery >= 9 && artillery <= 12,
    `artillery の炎の中心 ${artillery} が胴体 (5〜16) の中央から外れている`);
  for (const typeKey of ['standard', 'heavy', 'rival']) {
    assert.ok(rootCenter(typeKey) < artillery, `${typeKey} が背中側にない`);
  }
});

// 置き換え前は crouchOffset を引いて炎のワールド上の高さを固定していたため、
// しゃがむ機体（artillery のバースト射撃）で炎が胴体から 4px 離れて浮いた。
// 今は引いていないので、draw() が積む translate(0, crouchOffset) にそのまま乗る。
//
// fake-ctx は transform を適用しない（fillRect の引数はローカル座標のまま記録される）
// ので、「炎の y が変わらないこと」＋「しゃがみぶんの translate が積まれていること」を
// 見る。この2つが揃えば、実際の canvas では炎が機体と一緒に下がる。
test('しゃがんでも炎が機体から離れない（artillery のバースト中）', () => {
  const topOf = (overrides) => Math.min(...flameRects('artillery', overrides).map((r) => r.y));
  assert.equal(topOf({ burstCount: 3 }), topOf({}),
    '炎の位置を自前で補正している（translate と二重に効く）');

  const translatesOf = (overrides) => {
    const ctx = makeFakeCtx();
    makeAttacker('artillery', overrides).draw(ctx);
    return ctx.calls.filter((c) => c.name === 'translate').map((c) => c.args);
  };
  const crouchShift = translatesOf({ burstCount: 3 })
    .filter(([dx, dy]) => dx === 0 && dy === 4);
  assert.equal(crouchShift.length, 1, 'しゃがみぶんの translate(0, 4) が積まれていない');
  assert.equal(translatesOf({}).filter(([dx, dy]) => dx === 0 && dy === 4).length, 0,
    '立っているのにしゃがみぶんの translate が積まれている');
});
