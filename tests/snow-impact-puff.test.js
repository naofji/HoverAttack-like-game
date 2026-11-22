// 5面: 弾が雪の積もった上面に当たると雪が舞う（自機の弾も敵の弾も）。
// 判定は Map.snowSurfaceY（tests/snow-surface-query.test.js）。ここは「本物の弾を飛ばして、
// 本物の SpawnEffects が SnowFlurryParticle を撒くか」を見る（呼び出しを差し替えると到達しない経路を見逃す）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMap, makeGame } from './helpers/enemy-world.js';
import { SpawnEffects } from '../src/js/systems/SpawnEffects.js';
import { PlayerBullet } from '../src/js/entities/PlayerBullet.js';
import { EnemyBullet } from '../src/js/entities/EnemyBullet.js';
import { SnowFlurryParticle } from '../src/js/entities/Particle.js';
import {
    TILE_SIZE, SNOW_BULLET_PUFF_COUNT, SNOW_BLAST_MIN_SIZE, SNOW_BLAST_PER_SIZE, SNOW_BLAST_MAX, SNOW_BLAST_REACH,
} from '../src/js/utils/Constants.js';

const T = TILE_SIZE;
const FLOOR_Y = 20 * T;

/** row 20 から下が床、列 10〜11 は row 12 から下の壁 */
function worldRows() {
    const rows = [];
    for (let r = 0; r < 24; r++) {
        let s = '';
        for (let c = 0; c < 24; c++) s += (r >= 20 || ((c === 10 || c === 11) && r >= 12)) ? '#' : '.';
        rows.push(s);
    }
    return rows;
}

function world(envKind = 'snow') {
    const game = makeGame(makeMap(worldRows(), null, { envKind, snowCaps: true }));
    Object.assign(game, SpawnEffects);
    return game;
}

const flurries = (game) => game.particles.filter((p) => p instanceof SnowFlurryParticle);

/** 弾が消えるまで進める（寿命より十分長く） */
function fly(b) {
    for (let i = 0; i < 400 && b.alive; i++) b.update();
    assert.equal(b.alive, false, '弾が消えなかった');
}

for (const [name, Cls] of [['自機の弾', PlayerBullet], ['敵の弾', EnemyBullet]]) {
    test(`${name}が雪の上面に当たると雪が舞う`, () => {
        const game = world();
        fly(new Cls(game, 5 * T + 4, FLOOR_Y - 30, Math.PI / 2));
        const f = flurries(game);
        assert.equal(f.length, SNOW_BULLET_PUFF_COUNT);
        for (const p of f) assert.ok(p.y <= FLOOR_Y, `雪が岩の中で生まれた: y=${p.y}`);
    });
}

test('壁に横から当たった弾は雪を出さない', () => {
    const game = world();
    // 壁の一番上のマス（row 12。積雪ビットあり）の側面へ水平に撃つ
    fly(new PlayerBullet(game, 6 * T, 12 * T + 6, 0));
    assert.equal(flurries(game).length, 0);
});

test('雪の面でない地図では弾が床に当たっても雪を出さない', () => {
    const game = world('cave');
    fly(new PlayerBullet(game, 5 * T + 4, FLOOR_Y - 30, Math.PI / 2));
    assert.equal(flurries(game).length, 0);
});

test('寿命が尽きて消えた弾は雪を出さない', () => {
    const game = world();
    // 床の真上を水平に、壁と反対の左へ…ではなく、何にも当たらない空中で寿命を迎えさせる
    const b = new PlayerBullet(game, 5 * T, 3 * T, 0);
    b.lifetime = 2;
    fly(b);
    assert.equal(flurries(game).length, 0);
});

// --- 爆発（spawnExplosion を通るもの全部） ---
// spawnExplosion は爆発の粒（Particle）と地雷・Orb・町も触るので、偽 game に無い配列を足しておく

function blastWorld(envKind = 'snow') {
    const game = world(envKind);
    game.landmines = [];
    game.orbs = [];
    return game;
}

test('雪面の近くの爆発は雪を舞わせる（数は大きさに比例）', () => {
    const game = blastWorld();
    game.spawnExplosion(5 * T + 8, FLOOR_Y - 10, 36);
    assert.equal(flurries(game).length, Math.min(SNOW_BLAST_MAX, Math.round(36 * SNOW_BLAST_PER_SIZE)));
    for (const p of flurries(game)) assert.ok(p.y <= FLOOR_Y, `雪が岩の中で生まれた: y=${p.y}`);
});

test('大きな爆発でも雪は上限まで', () => {
    const game = blastWorld();
    game.spawnExplosion(5 * T + 8, FLOOR_Y - 10, 200);
    assert.equal(flurries(game).length, SNOW_BLAST_MAX);
});

test('小さな爆発（MG が敵に当たった mgHit の 4）は雪を出さない', () => {
    assert.ok(4 < SNOW_BLAST_MIN_SIZE, 'mgHit が閾値を超えている（定数を見直す）');
    const game = blastWorld();
    game.spawnExplosion(5 * T + 8, FLOOR_Y - 10, 4);
    assert.equal(flurries(game).length, 0);
});

test('雪面から REACH より高い空中の爆発は雪を出さない', () => {
    const game = blastWorld();
    game.spawnExplosion(5 * T + 8, FLOOR_Y - SNOW_BLAST_REACH - 4, 36);
    assert.equal(flurries(game).length, 0);
});

test('雪の面でない地図の爆発は雪を出さない', () => {
    const game = blastWorld('cave');
    game.spawnExplosion(5 * T + 8, FLOOR_Y - 10, 36);
    assert.equal(flurries(game).length, 0);
});

// --- 坂（5面の階段は snowSlope で坂になる） ---
// 坂のマスはタイル単位では岩なので、粒の当たりがタイル単位だと、坂の雪の線で生まれた粒は最初の更新で消えた
// （最終レビューの指摘: 坂の 3 粒のうち 0〜2 粒しか残らない）。粒の当たりは形（isSolidPoint）で見る

/** row 20 から下が床、列 8〜11 は 1 段ずつ上がる階段 */
function stairRows() {
    const rows = [];
    for (let r = 0; r < 24; r++) {
        let s = '';
        for (let c = 0; c < 24; c++) s += (r >= 20 || (c >= 8 && c <= 11 && r >= 19 - (c - 8))) ? '#' : '.';
        rows.push(s);
    }
    return rows;
}

test('坂の雪面に当たった弾の雪は、最初の更新で消えずに舞う', (t) => {
    // 乱数を真ん中に固定: 散らばり無し・真上へ飛ぶ。坂の線の真上で生まれ、上へ離れるので岩に触れないはず
    t.mock.method(Math, 'random', () => 0.5);
    const game = makeGame(makeMap(stairRows(), null, { envKind: 'snow', snowCaps: true, tileShape: 'snowSlope' }));
    Object.assign(game, SpawnEffects);
    const x = 9 * T + 5;
    const top = game.map.terrainTopY(x, 10 * T, 22 * T);
    assert.notEqual(top % T, 0, '坂ではなく平らな面を拾っている（fixture を見直す）');
    fly(new PlayerBullet(game, x, top - 20, Math.PI / 2));
    const f = flurries(game);
    assert.equal(f.length, SNOW_BULLET_PUFF_COUNT);
    for (const p of f) p.update();
    assert.equal(f.filter((p) => p.alive).length, SNOW_BULLET_PUFF_COUNT);
});
