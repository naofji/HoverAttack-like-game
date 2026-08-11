import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EnemyAttacker } from '../src/js/entities/EnemyAttacker.js';
import { Player } from '../src/js/entities/Player.js';
import { ENEMY_ATTACKER_TYPES } from '../src/js/utils/Constants.js';
import { makeMap, flatFloorRows } from './helpers/enemy-world.js';

/**
 * 脚の関節座標は _legJoints() だけが決める。
 *
 * 以前は描画（_drawLegs / _drawArtilleryLegs）と破片生成（_collectLegPoses）が
 * 同じ式をそれぞれ書いていて、片方だけ触ると「破片だけ別のポーズで飛び散る」
 * という形で壊れた。既存の debris-attacker / debris-player のテストは
 * 「描かれた線と一致するか」を見ているが、こちらは供給元が1本であること自体を
 * 押さえる（描画を経由せず、状態を変えたら関節も必ず追随することを見る）。
 */

function makeGame() {
    return {
        map: makeMap(flatFloorRows()),
        particles: [], enemies: [], projectiles: [], carrier: null, player: null,
        camera: { x: 0, y: 0 }, canvas: { width: 1024, height: 768 },
        input: {
            mouse: { x: 0, y: 0, left: false },
            isKeyDown: () => false, isKeyPressed: () => false,
            getTargetWorld: () => ({ x: 200, y: 100 }),
        },
        rng: { next: () => 0.5 },
        addScore() {}, spawnSparks() {}, spawnDebris() {},
        spawnExplosion() {}, spawnHeavyDamage() {}, spawnSmokeScreen() {},
    };
}

const JOINT_KEYS = ['hipX', 'hipY', 'kneeX', 'kneeY', 'footX', 'footY'];

function poseKey(poses) {
    return poses.map((p) => JOINT_KEYS.map((k) => p[k].toFixed(4)).join(',')).join('|');
}

test('敵アタッカー: _collectLegPoses は _legJoints をそのまま返す', () => {
    for (const type of Object.keys(ENEMY_ATTACKER_TYPES)) {
        for (const state of [
            { onGround: true, crouching: false, burstCount: 0 },
            { onGround: false, crouching: false, burstCount: 0 },
            { onGround: true, crouching: true, burstCount: 0 },
            { onGround: true, crouching: false, burstCount: 2 },  // バースト中もしゃがみ扱い
        ]) {
            const e = new EnemyAttacker(makeGame(), 100, 100, ENEMY_ATTACKER_TYPES[type]);
            Object.assign(e, state, { walkFrame: 1, vx: 1 });

            const isCrouching = e.crouching || e.burstCount > 0;
            const joints = e._legJoints(16, e._legStyle(), isCrouching);
            const poses = e._collectLegPoses();
            const label = `${type}/${JSON.stringify(state)}`;

            assert.equal(poses.length, joints.length, `${label}: 脚の本数が違う`);
            joints.forEach((j, i) => {
                assert.equal(poses[i].hipX, j.hipX, `${label}[${i}] hipX`);
                assert.equal(poses[i].hipY, j.hipY, `${label}[${i}] hipY`);
                assert.equal(poses[i].kneeX, j.kneeX, `${label}[${i}] kneeX`);
                assert.equal(poses[i].kneeY, j.kneeY, `${label}[${i}] kneeY`);
                assert.equal(poses[i].footX, j.footX, `${label}[${i}] footX`);
                assert.equal(poses[i].footY, j.footY, `${label}[${i}] footY`);
                assert.equal(poses[i].isNear, j.isNear, `${label}[${i}] isNear`);
            });
        }
    }
});

test('敵アタッカー: artillery は4脚、2足型は2脚', () => {
    const game = makeGame();
    const spider = new EnemyAttacker(game, 100, 100, ENEMY_ATTACKER_TYPES.artillery);
    const biped = new EnemyAttacker(game, 100, 100, ENEMY_ATTACKER_TYPES.standard);
    assert.equal(spider._collectLegPoses().length, 4);
    assert.equal(biped._collectLegPoses().length, 2);
});

test('自機: _collectLegPoses は _legJoints をそのまま返す', () => {
    for (const state of [
        { onGround: true, crouching: false, docked: false },
        { onGround: false, crouching: false, docked: false },
        { onGround: true, crouching: true, docked: false },
        { onGround: true, crouching: false, docked: true },   // ドッキング中もしゃがみ姿勢
    ]) {
        const p = new Player(makeGame(), 100, 100);
        Object.assign(p, state, { walkFrame: 1, vx: 1, facingRight: true });

        const joints = p._legJoints(p.crouching || p.docked);
        const poses = p._collectLegPoses();
        const label = JSON.stringify(state);

        assert.equal(poses.length, joints.length, `${label}: 脚の本数が違う`);
        joints.forEach((j, i) => {
            assert.equal(poses[i].hipX, j.hipX, `${label}[${i}] hipX`);
            assert.equal(poses[i].kneeX, j.kx, `${label}[${i}] kneeX`);
            assert.equal(poses[i].kneeY, j.ky, `${label}[${i}] kneeY`);
            assert.equal(poses[i].footX, j.fx, `${label}[${i}] footX`);
            assert.equal(poses[i].footY, j.fy, `${label}[${i}] footY`);
        });
    }
});

test('状態を変えると関節も変わる（供給元が固定値になっていない）', () => {
    const game = makeGame();
    const base = () => {
        const p = new Player(game, 100, 100);
        Object.assign(p, { onGround: true, crouching: false, docked: false,
            walkFrame: 0, vx: 0, facingRight: true });
        return p;
    };

    const walking = poseKey(base()._collectLegPoses());

    const airborne = base();
    airborne.onGround = false;
    airborne.vx = 1.5;

    const crouched = base();
    crouched.crouching = true;

    const otherFrame = base();
    otherFrame.walkFrame = 1;

    assert.notEqual(poseKey(airborne._collectLegPoses()), walking, '空中で変わること');
    assert.notEqual(poseKey(crouched._collectLegPoses()), walking, 'しゃがみで変わること');
    assert.notEqual(poseKey(otherFrame._collectLegPoses()), walking, '歩行フレームで変わること');
});

test('歩行フレームが範囲外でも描画・破片とも落ちない', () => {
    // walkFrame の範囲外は _drawWalkLegs だけが例外を投げる形になっていた
    // （破片側にはフォールバックがあった）。供給元を1本にした今は両方が耐える
    const game = makeGame();
    const p = new Player(game, 100, 100);
    Object.assign(p, { onGround: true, crouching: false, docked: false, walkFrame: 99 });
    assert.doesNotThrow(() => p._collectLegPoses());
    assert.doesNotThrow(() => p._legJoints(false));

    const e = new EnemyAttacker(game, 100, 100, ENEMY_ATTACKER_TYPES.standard);
    Object.assign(e, { onGround: true, crouching: false, burstCount: 0, walkFrame: 99 });
    assert.doesNotThrow(() => e._collectLegPoses());
});
