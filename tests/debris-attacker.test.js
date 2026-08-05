import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMap, makeGame, makeAttacker } from './helpers/enemy-world.js';
import { DEBRIS_SPECS, buildDebris } from '../src/js/entities/debris/index.js';
import { ENEMY_ATTACKER_TYPES, PLAYER_WIDTH, PLAYER_HEIGHT } from '../src/js/utils/Constants.js';
import { makeFakeCtx, extractPolylines } from './helpers/fake-ctx.js';

const FLAT = [
  '................',
  '................',
  '################',
];

function attackerOf(typeKey) {
  const game = makeGame(makeMap(FLAT));
  game.spawnDebris = () => {};
  game.addScore = () => {};
  return makeAttacker(game, 40, 16, typeKey);
}

test('attackerDebris スペックが登録されている', () => {
  assert.ok(DEBRIS_SPECS.attacker);
  assert.ok(DEBRIS_SPECS.attacker.holdFrames >= 3);
});

test('全機種でパーツが生成され、機体枠から極端に外れない', () => {
  for (const typeKey of Object.keys(ENEMY_ATTACKER_TYPES)) {
    const e = attackerOf(typeKey);
    const parts = e.getDebrisParts();
    assert.ok(parts.length >= 6, `${typeKey}: パーツが少なすぎる (${parts.length})`);
    for (const p of parts) {
      assert.ok(typeof p.color === 'string' && p.color.length > 0, `${typeKey}: 色が無い`);
      assert.ok(p.w > 0 && p.h > 0, `${typeKey}: サイズ不正 ${JSON.stringify(p)}`);
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `${typeKey}: 座標不正`);
      assert.ok(p.x >= -PLAYER_WIDTH * 2 && p.x <= PLAYER_WIDTH * 3, `${typeKey}: x=${p.x}`);
      assert.ok(p.y >= -PLAYER_HEIGHT && p.y <= PLAYER_HEIGHT * 2, `${typeKey}: y=${p.y}`);
    }
  }
});

test('機種ごとに配色が異なる', () => {
  const heavy = attackerOf('heavy').getDebrisParts().map((p) => p.color).join(',');
  const rival = attackerOf('rival').getDebrisParts().map((p) => p.color).join(',');
  assert.notEqual(heavy, rival);
});

test('artillery は 4 脚ぶんのパーツを持つ', () => {
  const artillery = attackerOf('artillery');
  const standard = attackerOf('standard');
  assert.ok(
    artillery.getDebrisParts().length > standard.getDebrisParts().length,
    '4脚機のパーツが2脚機より多くない',
  );
});

test('接地と空中でポーズが変わる', () => {
  const ground = attackerOf('standard');
  ground.onGround = true;
  ground.crouching = false;
  ground.burstCount = 0;
  const a = ground.getDebrisParts().map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('|');
  ground.onGround = false;
  ground.vx = ground.maxSpeed;
  const b = ground.getDebrisParts().map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('|');
  assert.notEqual(a, b);
});

test('buildDebris で破片オブジェクトになる', () => {
  const e = attackerOf('heavy');
  const debris = buildDebris(e, 'attacker');
  assert.ok(debris.length >= 6);
  assert.ok(debris.every((d) => d.alive));
});

// これが描画と破片のポーズ一致を守る要のテスト。
// _collectLegPoses() が _drawLegs / _drawArtilleryLegs と別のポーズを返すように
// なったら、ここで落ちる。
// 股関節・膝・足首の3点すべてを照合する。_drawJointedLeg は artillery 系(腿と脛を
// 別ストロークで描く)だと2本のポリライン(hip→knee, knee→foot)に、それ以外は
// 1本のポリライン(hip→knee→foot)に分かれるので、どちらの形でも hip→knee と
// knee→foot の両方の隣接区間が描画中に現れることを確認する。
test('_collectLegPoses が実際に描かれた脚のポリラインと一致する', () => {
  for (const typeKey of Object.keys(ENEMY_ATTACKER_TYPES)) {
    for (const state of [{ onGround: true, crouching: false }, { onGround: false, crouching: false }, { onGround: true, crouching: true }]) {
      const e = attackerOf(typeKey);
      Object.assign(e, state);
      e.burstCount = 0;
      e.facingRight = true;

      const ctx = makeFakeCtx();
      e.draw(ctx);
      const drawn = extractPolylines(ctx.calls);
      const poses = e._collectLegPoses();
      const label = `${typeKey}/${JSON.stringify(state)}`;

      // 描画された脚のポリラインの中に、各ポーズの股関節→膝、膝→足首の
      // 両方の区間が(連続する2点として)存在すること。
      // draw() は crouchOffset ぶん translate してから描くので、Y はその分だけずれる。
      const crouchOffset = state.crouching ? 4 : 0;
      const near = (a, b) => Math.abs(a - b) < 1e-6;
      for (const pose of poses) {
        const wantHip = { x: pose.hipX, y: pose.hipY - crouchOffset };
        const wantKnee = { x: pose.kneeX, y: pose.kneeY - crouchOffset };
        const wantFoot = { x: pose.footX, y: pose.footY - crouchOffset };

        const segmentFound = (a, b) => drawn.some((line) =>
          line.some((_, i) =>
            i + 1 < line.length &&
            near(line[i].x, a.x) && near(line[i].y, a.y) &&
            near(line[i + 1].x, b.x) && near(line[i + 1].y, b.y)));

        const hipToKnee = segmentFound(wantHip, wantKnee);
        const kneeToFoot = segmentFound(wantKnee, wantFoot);

        assert.ok(hipToKnee, `${label}: 股関節→膝が描画に無い hip=${JSON.stringify(wantHip)} knee=${JSON.stringify(wantKnee)}`);
        assert.ok(kneeToFoot, `${label}: 膝→足首が描画に無い knee=${JSON.stringify(wantKnee)} foot=${JSON.stringify(wantFoot)}`);
      }
    }
  }
});
