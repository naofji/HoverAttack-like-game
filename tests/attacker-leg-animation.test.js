import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyAttacker } from '../src/js/entities/EnemyAttacker.js';
import { makeFakeCtx, extractPolylines, extractFillRects } from './helpers/fake-ctx.js';

const AIR_MAP = { isSolidAtPixel: () => false, cols: 1000, rows: 1000 };

function makeConfig(overrides = {}) {
  return {
    hp: 30, speed: 1.0, jumpForce: -8, score: 100,
    fireInterval: 30, sightRange: 100,
    movementType: 'stop_and_shoot', name: 'standard',
    climbStyle: 'hover', aimAccuracy: 1.0,
    bodyColor: '#55CCDD', headColor: '#338899',
    visorColor: '#FF0000', backpackColor: '#888888', exhaustColor: '#00FFFF',
    ...overrides
  };
}

/** コンストラクタのスポーン処理を通さずに描画可能な最小インスタンスを作る。 */
function makeAttacker(overrides = {}) {
  const { config: configOverrides, ...state } = overrides;
  const config = makeConfig(configOverrides);
  const a = Object.create(EnemyAttacker.prototype);
  a.game = { map: AIR_MAP, enemies: [], player: null, carrier: null,
             projectiles: [], enemyBullets: [] };
  a.x = 0; a.y = 0; a.width = 16; a.height = 24;
  a.vx = 0; a.vy = 0;
  a.alive = true;
  a.onGround = true;
  a.config = config;
  a.hp = config.hp; a.maxHp = config.hp;
  a.maxSpeed = config.speed;
  a.jumpForce = config.jumpForce;
  a.facingRight = true;
  a.walkFrame = 2;
  a.walkTimer = 0;
  a.hovering = false;
  a.crouching = false;
  a.burstCount = 0;
  a.frameCounter = 0;
  Object.assign(a, state);
  return a;
}

test('_legStyle: 既知の型はそれぞれ専用スタイルを返す', () => {
  assert.equal(makeAttacker({ config: { name: 'heavy' } })._legStyle().lineWidth, 4);
  assert.equal(makeAttacker({ config: { name: 'standard' } })._legStyle().lineWidth, 3);
});

test('_legStyle: rival は standard と同一のスタイル（プレイヤー同等）', () => {
  const rival = makeAttacker({ config: { name: 'rival' } })._legStyle();
  const standard = makeAttacker({ config: { name: 'standard' } })._legStyle();
  assert.deepEqual(rival, standard);
});

test('_legStyle: 未知の型は standard にフォールバックする', () => {
  const unknown = makeAttacker({ config: { name: 'nonexistent-type' } })._legStyle();
  const standard = makeAttacker({ config: { name: 'standard' } })._legStyle();
  assert.deepEqual(unknown, standard);
});

test('_hoverSwing: maxSpeed で正規化され -1..+1 に収まる', () => {
  const a = makeAttacker({ vx: 0.5, config: { speed: 1.0 } });
  assert.equal(a._hoverSwing(), 0.5);

  a.vx = 5.0; // maxSpeed を大きく超える
  assert.equal(a._hoverSwing(), 1);

  a.vx = -5.0;
  assert.equal(a._hoverSwing(), -1);
});

test('_hoverSwing: 左向きのときは進行方向ローカルに反転する', () => {
  const right = makeAttacker({ vx: 0.5, facingRight: true, config: { speed: 1.0 } });
  const left = makeAttacker({ vx: 0.5, facingRight: false, config: { speed: 1.0 } });
  assert.equal(left._hoverSwing(), -right._hoverSwing());
});

test('_hoverSwing: 型ごとの maxSpeed で正規化される（rival が振り切れない）', () => {
  const rival = makeAttacker({ vx: 1.2, config: { name: 'rival', speed: 1.2 } });
  const heavy = makeAttacker({ vx: 0.5, config: { name: 'heavy', speed: 0.5 } });
  assert.equal(rival._hoverSwing(), 1);
  assert.equal(heavy._hoverSwing(), 1);
});

test('_drawJointedLeg: 股関節→膝→足首の3点ポリラインを1本描く', () => {
  const a = makeAttacker();
  const ctx = makeFakeCtx();
  a._drawJointedLeg(ctx, {
    hipX: 10, hipY: 16, kneeX: 12, kneeY: 19, footX: 14, footY: 22,
    legColor: '#111111', footColor: '#222222',
    lineWidth: 3, footW: 5, footH: 2,
  });

  const lines = extractPolylines(ctx.calls);
  assert.equal(lines.length, 1);
  assert.deepEqual(lines[0], [
    { x: 10, y: 16 },
    { x: 12, y: 19 },
    { x: 14, y: 22 },
  ]);
});

test('_drawJointedLeg: 足裏は足首を原点に translate して描かれる', () => {
  const a = makeAttacker();
  const ctx = makeFakeCtx();
  a._drawJointedLeg(ctx, {
    hipX: 10, hipY: 16, kneeX: 12, kneeY: 19, footX: 14, footY: 22,
    legColor: '#111111', footColor: '#222222',
    lineWidth: 3, footW: 5, footH: 2,
  });

  const translates = ctx.calls.filter((c) => c.name === 'translate');
  assert.deepEqual(translates.at(-1).args, [14, 22]);

  const rects = extractFillRects(ctx.calls);
  const foot = rects.at(-1);
  assert.equal(foot.w, 5);
  assert.equal(foot.h, 2);
});

test('_drawJointedLeg: footRotation が 0 のときは rotate しない', () => {
  const a = makeAttacker();
  const ctx = makeFakeCtx();
  a._drawJointedLeg(ctx, {
    hipX: 10, hipY: 16, kneeX: 12, kneeY: 19, footX: 14, footY: 22,
    legColor: '#111111', footColor: '#222222',
    lineWidth: 3, footW: 5, footH: 2, footRotation: 0,
  });
  assert.equal(ctx.calls.filter((c) => c.name === 'rotate').length, 0);
});

test('_drawJointedLeg: footRotation が非0なら足裏を回転する', () => {
  const a = makeAttacker();
  const ctx = makeFakeCtx();
  a._drawJointedLeg(ctx, {
    hipX: 10, hipY: 16, kneeX: 12, kneeY: 19, footX: 14, footY: 22,
    legColor: '#111111', footColor: '#222222',
    lineWidth: 3, footW: 5, footH: 2, footRotation: 0.5,
  });
  const rotates = ctx.calls.filter((c) => c.name === 'rotate');
  assert.equal(rotates.length, 1);
  assert.equal(rotates[0].args[0], 0.5);
});

test('_drawJointedLeg: thighPlate 指定時は腿の装甲板が1枚増える', () => {
  const a = makeAttacker();
  const base = makeFakeCtx();
  const plated = makeFakeCtx();
  const opts = {
    hipX: 10, hipY: 16, kneeX: 12, kneeY: 19, footX: 14, footY: 22,
    legColor: '#111111', footColor: '#222222',
    lineWidth: 4, footW: 6, footH: 3,
  };
  a._drawJointedLeg(base, { ...opts, thighPlate: false });
  a._drawJointedLeg(plated, { ...opts, thighPlate: true });

  assert.equal(extractFillRects(plated.calls).length,
               extractFillRects(base.calls).length + 1);
});

test('_drawJointedLeg: save/restore が対で呼ばれる', () => {
  const a = makeAttacker();
  const ctx = makeFakeCtx();
  a._drawJointedLeg(ctx, {
    hipX: 10, hipY: 16, kneeX: 12, kneeY: 19, footX: 14, footY: 22,
    legColor: '#111111', footColor: '#222222',
    lineWidth: 3, footW: 5, footH: 2,
  });
  assert.equal(ctx.calls.filter((c) => c.name === 'save').length,
               ctx.calls.filter((c) => c.name === 'restore').length);
});

// --- 2足型（standard / rival / heavy） ---

/** 脚2本ぶんのポリラインを取り出す。[0] が奥脚、[1] が手前脚。 */
function drawLegsAndExtract(a, crouchOffset = 0) {
  const ctx = makeFakeCtx();
  a._drawLegs(ctx, crouchOffset);
  return { lines: extractPolylines(ctx.calls), rects: extractFillRects(ctx.calls), ctx };
}

test('2足型: 接地時は脚を2本描く', () => {
  const a = makeAttacker({ onGround: true, vx: 0.9, walkFrame: 0 });
  const { lines } = drawLegsAndExtract(a);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].length, 3); // hip, knee, foot
});

test('2足型: walkFrame 0..3 でそれぞれ異なる足先座標になる', () => {
  const seen = new Set();
  for (const frame of [0, 1, 2, 3]) {
    const a = makeAttacker({ onGround: true, vx: 0.9, walkFrame: frame });
    const { lines } = drawLegsAndExtract(a);
    const key = lines.map((l) => `${l[2].x},${l[2].y}`).join('|');
    seen.add(key);
  }
  assert.equal(seen.size, 4, 'walkFrame ごとに異なるポーズになること');
});

test('2足型: 空中で vx の符号を反転すると足先が股関節の前後に振れる', () => {
  const fwd = makeAttacker({ onGround: false, vx: 0.9 });
  const back = makeAttacker({ onGround: false, vx: -0.9 });

  const fwdLines = drawLegsAndExtract(fwd).lines;
  const backLines = drawLegsAndExtract(back).lines;

  // 手前脚（2本目）の足先の、股関節からの水平オフセット
  const fwdOffset = fwdLines[1][2].x - fwdLines[1][0].x;
  const backOffset = backLines[1][2].x - backLines[1][0].x;

  assert.ok(fwdOffset * backOffset < 0, '前進時と後退時で足先が逆側に流れること');
});

test('2足型: 空中で vx=0 でも位相ずれにより左右の脚が揃わない', () => {
  const a = makeAttacker({ onGround: false, vx: 0 });
  const { lines } = drawLegsAndExtract(a);
  const farOffset = lines[0][2].x - lines[0][0].x;
  const nearOffset = lines[1][2].x - lines[1][0].x;
  assert.notEqual(farOffset, nearOffset);
});

test('2足型: rival の脚の頂点は standard と完全に一致する（プレイヤー同等）', () => {
  const mk = (name) => makeAttacker({
    onGround: true, vx: 0.9, walkFrame: 1, config: { name, speed: 1.0 },
  });
  const rival = drawLegsAndExtract(mk('rival')).lines;
  const standard = drawLegsAndExtract(mk('standard')).lines;
  assert.deepEqual(rival, standard);
});

test('2足型: heavy は足裏が大きく歩幅が狭い', () => {
  const mk = (name) => makeAttacker({
    onGround: true, vx: 0.9, walkFrame: 0, config: { name, speed: 1.0 },
  });

  const heavy = drawLegsAndExtract(mk('heavy'));
  const standard = drawLegsAndExtract(mk('standard'));

  // 足裏サイズ（装甲板を除く最後の fillRect が足裏）
  assert.ok(heavy.rects.at(-1).w > standard.rects.at(-1).w, 'heavy の足裏が大きいこと');

  // 歩幅: 手前脚の足先の股関節からの水平オフセットの大きさ
  const stride = (r) => Math.abs(r.lines[1][2].x - r.lines[1][0].x);
  assert.ok(stride(heavy) < stride(standard), 'heavy の歩幅が狭いこと');
});

test('2足型: しゃがみ時は膝が股関節より外側に開く', () => {
  const a = makeAttacker({ onGround: true, vx: 0, crouching: true });
  const { lines } = drawLegsAndExtract(a, 4);
  assert.equal(lines.length, 2);

  const [far, near] = lines;
  assert.ok(far[1].x < far[0].x, '奥脚の膝が外(左)に開くこと');
  assert.ok(near[1].x > near[0].x, '手前脚の膝が外(右)に開くこと');
});

test('2足型: しゃがみ時は crouchOffset ぶん股関節が上に寄る（足は接地位置を保つ）', () => {
  const a = makeAttacker({ onGround: true, vx: 0, crouching: true });
  const standing = drawLegsAndExtract(makeAttacker({ onGround: true, vx: 0 }), 0).lines;
  const crouched = drawLegsAndExtract(a, 4).lines;
  assert.equal(crouched[0][0].y, standing[0][0].y - 4);
});
