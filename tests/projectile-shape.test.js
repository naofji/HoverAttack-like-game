// 弾・ミサイル・追尾ミサイル・巡航ミサイル・ドローンが5面の形で地形に当たることのテスト（段3 Task 6）。
// 面取りの削れた空中は素通りし、岩に入ったフレームで消える・爆発する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlayerBullet } from '../src/js/entities/PlayerBullet.js';
import { EnemyBullet } from '../src/js/entities/EnemyBullet.js';
import { Missile } from '../src/js/entities/Missile.js';
import { EnemyHomingMissile } from '../src/js/entities/EnemyHomingMissile.js';
import { EnemyCruiseMissile } from '../src/js/entities/EnemyCruiseMissile.js';
import { EnemyDrone } from '../src/js/entities/EnemyDrone.js';
import { makeMap, makeGame } from './helpers/enemy-world.js';
import { TILE_SIZE as T, ENEMY_DRONE_WIDTH, ENEMY_DRONE_HEIGHT } from '../src/js/utils/Constants.js';

// 床（row 20）は列 19 で終わり、右は row 23 まで落ちる崖。床の縁 (20,19) の右上は 8px の面取り
// （斜辺 v = u、象限の右上の削れた所が空中）。row 12 の列 10〜13 に浮いた板「<==>」
function rows() {
    const out = [];
    for (let r = 0; r < 24; r++) {
        let s = '';
        for (let c = 0; c < 40; c++) {
            let solid = c < 20 ? r >= 20 : r >= 23;
            if (r === 12 && c >= 10 && c <= 13) solid = true;
            s += solid ? '#' : '.';
        }
        out.push(s);
    }
    return out;
}

function world() {
    const map = makeMap(rows(), null, { tileShape: 'snowSlope' });
    map.width = map.cols * T;
    map.height = map.rows * T;
    const damaged = [];
    map.damageBlock = (r, c) => { damaged.push([r, c]); return true; };
    map.destroyArea = (r, c) => { damaged.push([r, c]); return []; };
    const game = makeGame(map);
    game.spawnDebris = () => {};
    game.camera = { x: 0, y: 0, shake() {} };
    return { game, map, damaged };
}

// 床の縁の面取りを真下に通る列。(20,19) の右上の象限の u = 6 なので、岩は y = 20T + 6 から
const EDGE_X = 19 * T + 14;
const EDGE_ROCK_Y = 20 * T + 6;

function flyDown(make) {
    const { game, map, damaged } = world();
    assert.equal(map.isSolidPoint(EDGE_X, 20 * T + 3), false, '前提: 面取りの削れた空中');
    assert.equal(map.isSolidPoint(EDGE_X, EDGE_ROCK_Y), true, '前提: 斜辺の下は岩');
    const p = make(game);
    let sawAir = false;
    for (let f = 0; f < 60 && p.alive; f++) {
        p.update();
        if (p.alive && p.y >= 20 * T && p.y < EDGE_ROCK_Y) sawAir = true;
    }
    return { p, map, damaged, sawAir };
}

test('自機の弾は面取りの削れた空中を素通りし、斜辺の下の岩で消える', () => {
    const { p, sawAir } = flyDown((g) => new PlayerBullet(g, EDGE_X, 20 * T - 5, Math.PI / 2));
    assert.equal(p.alive, false);
    assert.ok(sawAir, '削れた空中を通っていない');
    assert.ok(p.y >= EDGE_ROCK_Y, `岩に入る前に消えた y=${p.y - 20 * T}`);
});

test('敵の弾も面取りの削れた空中を素通りし、斜辺の下の岩で消える', () => {
    const { p, sawAir } = flyDown((g) => new EnemyBullet(g, EDGE_X, 20 * T - 4, Math.PI / 2));
    assert.equal(p.alive, false);
    assert.ok(sawAir, '削れた空中を通っていない');
    assert.ok(p.y >= EDGE_ROCK_Y, `岩に入る前に消えた y=${p.y - 20 * T}`);
});

test('自機のミサイルは面取りの空中では爆発せず、岩に入ったフレームで爆発してそのタイルを壊す', () => {
    const { p, map, damaged, sawAir } = flyDown((g) => new Missile(g, EDGE_X, 20 * T - 4, Math.PI / 2));
    assert.equal(p.alive, false);
    assert.ok(sawAir, '削れた空中を通っていない');
    assert.equal(map.isSolidPoint(p.x, p.y), true, `岩の外で爆発した y=${p.y - 20 * T}`);
    assert.deepEqual(damaged, [[20, 19]]);
});

test('追尾ミサイルも面取りの空中では爆発せず、岩に入ったフレームで爆発してそのタイルを壊す', () => {
    const { p, map, damaged, sawAir } = flyDown((g) => {
        const m = new EnemyHomingMissile(g, EDGE_X, 20 * T - 12, Math.PI / 2);
        m.speed = 3;
        m.homingDelay = 1e9; // 標的へ曲がらず、まっすぐ落とす
        // 前方の岩を避けて曲がる（obstacleAvoidance）と崖の下へ逸れて面取りを通らないので、ここでは切る
        m._avoidObstacles = () => {};
        return m;
    });
    assert.equal(p.alive, false);
    assert.ok(sawAir, '削れた空中を通っていない');
    assert.equal(map.isSolidPoint(p.x, p.y), true, `岩の外で爆発した (${p.x}, ${p.y})`);
    assert.deepEqual(damaged, [[20, 19]]);
});

test('巡航ミサイルは板の先の削れた空中をかすめても爆発せず、岩に掛かると爆発する', () => {
    // 板の右の先 (12,13) の右上は削れている（斜辺 v = u）。当たりの矩形は中心から横 ±8・縦 ±1
    const make = (x, y) => {
        const { game, map } = world();
        const m = new EnemyCruiseMissile(game, x, y, 0);
        m.armingTimer = 0;
        m.homingDelay = 1e9;
        return { m, map };
    };
    const graze = make(13 * T + 22, 12 * T + 1);
    assert.equal(graze.map.isSolid(12, 13), true, '前提: タイル単位では岩');
    graze.m.update();
    assert.equal(graze.m.alive, true, '削れた空中をかすめただけで爆発した');
    const hit = make(13 * T + 10, 12 * T + 4);
    hit.m.update();
    assert.equal(hit.m.alive, false, '岩に掛かったのに爆発しない');
});

test('体当たりのドローンは面取りの空中では落ちず、岩に当たると落ちる', () => {
    const make = (x, y, vx) => {
        const { game } = world();
        const d = new EnemyDrone(game, x, y);
        d.state = 'kamikaze';
        d.vx = vx;
        d.vy = 0;
        return d;
    };
    // 板の右の先 (12,13) の右下の象限は削れている（原点 (13T+8, 12T+8)、u + v > 8 が空中）。
    // 左へ 2px 動いて、左上の点 (x + 2, y + 2) がそこへ入る。ほかの3点は空中
    const air = make(13 * T + 14, 12 * T + 12, -2);
    assert.equal(air.game.map.isSolidPoint(13 * T + 14, 12 * T + 14), false, '前提: 削れた空中');
    assert.equal(air.game.map.isSolid(12, 13), true, '前提: タイル単位では岩');
    air._moveAndCollide();
    assert.equal(air.alive, true, '面取りの空中で落ちた');
    // 左上の点が斜辺の内側の岩（u = 2, v = 2）に入る
    const rock = make(13 * T + 10, 12 * T + 8, -2);
    assert.equal(rock.game.map.isSolidPoint(13 * T + 10, 12 * T + 10), true, '前提');
    rock._moveAndCollide();
    assert.equal(rock.alive, false, '岩に当たったのに落ちない');
});
