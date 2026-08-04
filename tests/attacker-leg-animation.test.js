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

// --- artillery（4脚クモ歩行） ---

function drawArtilleryAndExtract(a, crouchOffset = 0) {
  const ctx = makeFakeCtx();
  a._drawArtilleryLegs(ctx, crouchOffset);
  return extractPolylines(ctx.calls);
}

function makeArtillery(overrides = {}) {
  return makeAttacker({
    onGround: true, vx: 0.4,
    ...overrides,
    config: { name: 'artillery', speed: 0.4, bodyColor: '#DDAA00',
              headColor: '#AA7700', ...(overrides.config || {}) },
  });
}

test('artillery: 脚を4本描く', () => {
  const lines = drawArtilleryAndExtract(makeArtillery({ walkFrame: 0 }));
  assert.equal(lines.length, 4);
  for (const l of lines) assert.equal(l.length, 3);
});

test('artillery: 全脚の膝が股関節より上にある（クモ型の逆へ字）', () => {
  for (const frame of [0, 1, 2, 3]) {
    const lines = drawArtilleryAndExtract(makeArtillery({ walkFrame: frame }));
    for (const [hip, knee] of lines.map((l) => [l[0], l[1]])) {
      assert.ok(knee.y < hip.y, `frame ${frame}: 膝(${knee.y}) が股関節(${hip.y}) より上にあること`);
    }
  }
});

test('artillery: グループAとグループBの足先は常に逆位相', () => {
  // SPIDER_LEGS の並び順は [手前前脚, 奥前脚, 手前後脚, 奥後脚]。
  // グループA = index 0 と 3、グループB = index 1 と 2。
  // walkFrame 2 は両グループとも中立なので、これを基準に差分を取る。
  const baseline = drawArtilleryAndExtract(makeArtillery({ walkFrame: 2 }));
  const baseOffset = (i) => baseline[i][2].x - baseline[i][0].x;

  for (const frame of [0, 1, 2, 3]) {
    const lines = drawArtilleryAndExtract(makeArtillery({ walkFrame: frame }));
    const offset = (i) => lines[i][2].x - lines[i][0].x;

    // 同じグループの2本は同じスイープ量ぶん動く
    assert.equal(offset(0) - baseOffset(0), offset(3) - baseOffset(3),
                 `frame ${frame}: グループAの2本が同位相であること`);
    assert.equal(offset(1) - baseOffset(1), offset(2) - baseOffset(2),
                 `frame ${frame}: グループBの2本が同位相であること`);

    // A と B のスイープは互いに逆符号（中立フレームでは両方 0）。
    // 中立フレームでは両辺が数学的に 0 になるが、`-(0)` は IEEE754 上 -0 になり、
    // node:assert/strict の equal（Object.is 相当）は +0 と -0 を区別してしまうため、
    // `+ 0` で -0 を +0 に正規化してから比較する（符号を無視する意図は変えない）。
    assert.equal(offset(0) - baseOffset(0), -(offset(1) - baseOffset(1)) + 0,
                 `frame ${frame}: A と B のスイープが逆位相であること`);
  }
});

test('artillery: 接地脚が常に2本以上ある', () => {
  for (const frame of [0, 1, 2, 3]) {
    const lines = drawArtilleryAndExtract(makeArtillery({ walkFrame: frame }));
    const footYs = lines.map((l) => l[2].y);
    const lowest = Math.max(...footYs);
    const grounded = footYs.filter((y) => y === lowest).length;
    assert.ok(grounded >= 2, `frame ${frame}: 接地脚が ${grounded} 本（2本以上必要）`);
  }
});

test('artillery: 遊脚は接地脚より足先が高い位置にある', () => {
  const lines = drawArtilleryAndExtract(makeArtillery({ walkFrame: 1 }));
  const footYs = lines.map((l) => l[2].y);
  assert.ok(new Set(footYs).size > 1, 'frame 1 では脚の高さに差が出ること');
});

test('artillery: 停止時（walkFrame 2）は全脚が同じ高さで静止する', () => {
  const lines = drawArtilleryAndExtract(makeArtillery({ vx: 0, walkFrame: 2 }));
  const footYs = lines.map((l) => l[2].y);
  assert.equal(new Set(footYs).size, 1);
});

test('artillery: 空中では脚が丸まり、接地時より足先が股関節に近づく', () => {
  const ground = drawArtilleryAndExtract(makeArtillery({ onGround: true, vx: 0, walkFrame: 2 }));
  const air = drawArtilleryAndExtract(makeArtillery({ onGround: false, vx: 0 }));

  const reach = (lines, i) => Math.abs(lines[i][2].x - lines[i][0].x);
  assert.ok(reach(air, 0) < reach(ground, 0), '空中では脚が縮むこと');
});

test('artillery: 空中で vx の符号を反転すると足先が逆側に流れる', () => {
  const fwd = drawArtilleryAndExtract(makeArtillery({ onGround: false, vx: 0.4 }));
  const back = drawArtilleryAndExtract(makeArtillery({ onGround: false, vx: -0.4 }));
  assert.notDeepEqual(fwd, back);
  // 前脚(index 0)の足先の高さが振り子で変わる
  assert.notEqual(fwd[0][2].y, back[0][2].y);
});

test('artillery: しゃがみ時は接地時より足が左右に広く張り出す', () => {
  const stand = drawArtilleryAndExtract(makeArtillery({ vx: 0, walkFrame: 2 }), 0);
  const crouch = drawArtilleryAndExtract(makeArtillery({ vx: 0, walkFrame: 2 }), 4);

  const width = (lines) => {
    const xs = lines.map((l) => l[2].x);
    return Math.max(...xs) - Math.min(...xs);
  };
  assert.ok(width(crouch) > width(stand), 'しゃがみで脚が広がること');
});

// --- 回帰 ---

test('回帰: 4型 × 3状態で draw() が例外を投げない', () => {
  const types = ['standard', 'heavy', 'rival', 'artillery'];
  const states = [
    { name: '接地', patch: { onGround: true, vx: 0.5, walkFrame: 1 } },
    { name: '空中', patch: { onGround: false, vx: 0.5, hovering: true } },
    { name: 'しゃがみ', patch: { onGround: true, vx: 0, crouching: true } },
  ];

  for (const name of types) {
    for (const state of states) {
      const a = makeAttacker({ ...state.patch, config: { name } });
      const ctx = makeFakeCtx();
      assert.doesNotThrow(() => a.draw(ctx), `${name} / ${state.name}`);
      assert.ok(ctx.calls.length > 0, `${name} / ${state.name}: 何か描画されること`);
    }
  }
});

test('回帰: 未知の型でも draw() が通り standard 相当の脚になる', () => {
  const unknown = makeAttacker({ onGround: true, vx: 0.5, walkFrame: 1,
                                 config: { name: 'nonexistent-type' } });
  const standard = makeAttacker({ onGround: true, vx: 0.5, walkFrame: 1,
                                  config: { name: 'standard' } });

  const ctxU = makeFakeCtx();
  const ctxS = makeFakeCtx();
  assert.doesNotThrow(() => unknown._drawLegs(ctxU, 0));
  standard._drawLegs(ctxS, 0);
  assert.deepEqual(extractPolylines(ctxU.calls), extractPolylines(ctxS.calls));
});

test('回帰: alive=false の間は draw() が何も描かない', () => {
  const a = makeAttacker({ alive: false });
  const ctx = makeFakeCtx();
  a.draw(ctx);
  assert.equal(ctx.calls.length, 0);
});

test('回帰: 左向きでも脚が2本（artillery は4本）描かれる', () => {
  const left = makeAttacker({ facingRight: false, onGround: false, vx: -0.5 });
  const ctx = makeFakeCtx();
  left._drawLegs(ctx, 0);
  assert.equal(extractPolylines(ctx.calls).length, 2);

  const art = makeAttacker({ facingRight: false, onGround: false, vx: -0.4,
                             config: { name: 'artillery', speed: 0.4 } });
  const ctxA = makeFakeCtx();
  art._drawArtilleryLegs(ctxA, 0);
  assert.equal(extractPolylines(ctxA.calls).length, 4);
});
