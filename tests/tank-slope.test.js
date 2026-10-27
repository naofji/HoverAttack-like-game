// 戦車も坂を形どおりに上り下りすることのテスト（段2 Task 6）。
// 戦車は前のタイルが1段高いと 16px 持ち上げて進む作りなので、坂ではそれが瞬間移動に見える。
// 形のあるタイルの近くでは持ち上げずに斜辺を上る。坂の地図は tests/player-slope.test.js と同じ
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyTank } from '../src/js/entities/EnemyTank.js';
import { makeMap, makeGame } from './helpers/enemy-world.js';
import { collidesWithTerrain } from '../src/js/utils/Physics.js';
import { TILE_SIZE as T, ICE_SLIDE, SLOPE_CLIMB_MARGIN } from '../src/js/utils/Constants.js';

const SNOW = { motionAt: () => ({ speed: 1, gravity: 1, slide: ICE_SLIDE }), sightScale: 1, kind: 'snow' };

function rampRows() {
    const rows = [];
    for (let r = 0; r < 24; r++) {
        let s = '';
        for (let c = 0; c < 40; c++) {
            let floor = 20;
            if (c >= 10 && c <= 19) floor = 29 - c;
            else if (c >= 20 && c <= 29) floor = 10;
            s += r >= floor ? '#' : '.';
        }
        rows.push(s);
    }
    return rows;
}

function world(rows) {
    const game = makeGame(makeMap(rows, null, { tileShape: 'snowSlope' }));
    game.env = SNOW;
    game.camera = { x: 0, y: 0 };
    game.canvas = { width: 1024, height: 768 };
    game.spawnSnowKick = () => {};
    return game;
}

function tank(game, x, y, dir) {
    const t = new EnemyTank(game, x, y);
    t.patrolDir = dir;
    t.facingRight = dir > 0;
    t.fireTimer = 1e9;
    game.enemies.push(t);
    return t;
}

// 戦車は床の 0.3〜0.9px 上を上下する（ホバー。陸上の基準線でも同じ）ので、1px の揺れを許す
const BOB = 1;

test('戦車は坂を、1フレームで 16px 持ち上がることなく斜辺に沿って上り、台地まで着く', () => {
    const game = world(rampRows());
    const t = tank(game, 5 * T, 20 * T - 12, 1);
    let worst = 0;
    for (let i = 0; i < 2000 && t.x < 21 * T; i++) {
        const x0 = t.x, y0 = t.y;
        t.update();
        if (t.patrolDir < 0) t.patrolDir = 1; // 端で折り返しても上りへ向け直す
        worst = Math.max(worst, Math.abs(t.y - y0) - Math.abs(t.x - x0));
    }
    assert.ok(worst <= SLOPE_CLIMB_MARGIN + BOB + 1e-9, `1フレームの上下が横の移動量を大きく超えた: ${worst}`);
    assert.ok(t.x >= 21 * T, `台地まで上れていない x=${t.x}`);
});

test('戦車は坂を、斜辺に沿って下る（段を跳ねない）', () => {
    const game = world(rampRows());
    const t = tank(game, 22 * T, 10 * T - 12, -1);
    let worst = 0;
    for (let i = 0; i < 2000 && t.x > 8 * T; i++) {
        const x0 = t.x, y0 = t.y;
        t.update();
        if (t.patrolDir > 0) t.patrolDir = -1;
        worst = Math.max(worst, Math.abs(t.y - y0) - Math.abs(t.x - x0));
    }
    assert.ok(worst <= SLOPE_CLIMB_MARGIN + BOB + 1e-9, `1フレームの上下が横の移動量を大きく超えた: ${worst}`);
    assert.ok(t.x <= 8 * T, `坂の下まで下りていない x=${t.x}`);
});

test('5面でも、坂の隣の四角い高さ2の壁では今までどおり引き返す', () => {
    const rows = [];
    for (let r = 0; r < 24; r++) {
        let s = '';
        for (let c = 0; c < 30; c++) s += r >= 20 || ((c === 15 || c === 16) && r >= 18) ? '#' : '.';
        rows.push(s);
    }
    const game = world(rows);
    const t = tank(game, 8 * T, 20 * T - 12, 1);
    let turned = false;
    for (let i = 0; i < 600; i++) {
        t.update();
        assert.ok(t.x + t.width <= 15 * T, `壁を越えた x=${t.x}`);
        if (t.patrolDir < 0) turned = true;
    }
    assert.ok(turned, '壁の手前で引き返していない');
});

// 巡回の速さ（0.41px/フレーム）では、足は毎フレーム 1px 以内しか坂にめり込まず、着地の持ち上げだけで
// 斜辺に沿う。横の持ち上げと下りの吸着が要るのは、爆風などで速く押されたとき
const rampSurface = (x) => 30 * T - x;

test('速く押されて坂へ横から当たっても、引き返さずに斜辺の上へ持ち上がる', () => {
    const game = world(rampRows());
    // 坂の下端の手前の平らな床（床 row 20）。右へ 3px 動くと右足の列が坂に入る
    const x0 = 10 * T - 16, y0 = 20 * T - 12 - 0.01;
    const t = tank(game, x0, y0, 1);
    t.motion = SNOW.motionAt();
    t.vx = 3; t.vy = 0;
    t._moveAndCollide();
    assert.equal(t.x, x0 + 3, '押し戻された');
    assert.ok(t.y < y0, `持ち上がっていない y=${t.y}`);
    assert.equal(collidesWithTerrain(t, game.map, t._slopePoints(t)), false);
});

test('速く押されて坂を下っても、宙に浮かず斜辺へ下りる', () => {
    const game = world(rampRows());
    const x0 = 15 * T;
    const surface = rampSurface(x0 + 15); // 足の列で一番高い面（右端の列 x+15）
    const t = tank(game, x0, surface - 12 + 0.5, -1); // 0.5px 沈めて接地させる
    t.motion = SNOW.motionAt();
    t.vx = -3; t.vy = 0;
    t._moveAndCollide();
    assert.equal(t.x, x0 - 3);
    const surface2 = rampSurface(t.x + 15);
    assert.ok(Math.abs(t.y + t.height - surface2) < 0.02, `斜辺から離れた: 下端 ${t.y + t.height} 斜辺 ${surface2}`);
    assert.equal(t.vy, 0);
});
