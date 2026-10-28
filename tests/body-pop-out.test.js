// 壊れて形が作り直され岩が増えても、自機・敵アタッカー・戦車が岩に埋まらないことのテスト（段4 Task 5）。
// 形の規則は岩を減らすだけではない: 坂の下の段 (17,12) が壊れると、その上の坂 (16,13) は小さい面取りに
// 戻り、削れていた所が岩になる（段3の最終レビュー I1。グレネード・反射ビームは Map.popOutOfRock で直した）。
// 壊れた後の地図に差し替えて再現する。坂の地図は tests/player-slope.test.js と同じ（上面 y = 30T − x）
// 2026-10-28 から壊した後の形は前の形より岩が増えない（設計 決定13）ので、壊れて埋まることは本物の地図では
// 起きない。岩の外へ出す仕組みは、ほかの経路で岩に入ったときの備えとして残し、ここでは差し替えた地図で縛る
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { EnemyTank } from '../src/js/entities/EnemyTank.js';
import { makeMap, makeGame, makeAttacker } from './helpers/enemy-world.js';
import { collidesWithTerrain } from '../src/js/utils/Physics.js';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { TILE_SIZE as T, ICE_SLIDE } from '../src/js/utils/Constants.js';

before(() => {
    const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

const SNOW = { motionAt: () => ({ speed: 1, gravity: 1, slide: ICE_SLIDE }), sightScale: 1, kind: 'snow' };

function rampRows(broken = false) {
    const rows = [];
    for (let r = 0; r < 24; r++) {
        let s = '';
        for (let c = 0; c < 40; c++) {
            let floor = 20;
            if (c >= 10 && c <= 19) floor = 29 - c;
            else if (c >= 20 && c <= 29) floor = 10;
            let solid = r >= floor;
            if (broken && r === 17 && c === 12) solid = false;
            s += solid ? '#' : '.';
        }
        rows.push(s);
    }
    return rows;
}

function world() {
    const game = makeGame(makeMap(rampRows(), null, { tileShape: 'snowSlope' }));
    game.env = SNOW;
    game.camera = { x: 0, y: 0, shake() {} };
    game.canvas = { width: 1024, height: 768 };
    game.spawnSnowKick = () => {};
    game.input = {
        keys: {}, isKeyDown: () => false, isKeyPressed: () => false, isCharPressed: () => false,
        mouse: { left: false, right: false }, isLeftClickPressed: () => false, isRightClickPressed: () => false,
        rightHoldFrames: 0, crosshairLocked: false, getMouseWorld: () => ({ x: 0, y: 0 }), getTargetWorld: () => ({ x: 0, y: 0 }),
    };
    return game;
}

/**
 * 坂の (16,13) の削れていた左下の象限の上に、足の一番高い列（右端の点）が斜辺に触れるように置く。
 * 右の足は (16,13) の lx = 6（斜辺は ly = 10）、足の下端の点は ly = 9 の行に入る
 */
function placeOnRamp(e, inset) {
    e.x = 12 * T + 8 + (2 - inset);
    e.y = 30 * T - (e.x + e.width - inset) - e.height - 0.01;
}

function breakAndStep(game, e, points) {
    assert.equal(collidesWithTerrain(e, game.map, points && points(e)), false, '前提: 壊れる前は岩の外');
    game.map = makeMap(rampRows(true), null, { tileShape: 'snowSlope' });
    assert.equal(collidesWithTerrain(e, game.map, points && points(e)), true, '前提: 壊れた後は岩の中');
    e.update();
    return collidesWithTerrain(e, game.map, points && points(e));
}

function seeded(fn) {
    const orig = Math.random;
    const rng = new SeededRNG(5);
    Math.random = () => rng.next();
    try { return fn(); } finally { Math.random = orig; }
}

test('立っている坂の下の段が壊れて足元が岩になっても、自機は次のフレームで岩の外に出る', () => {
    const game = world();
    const p = new Player(game, 0, 0);
    game.player = p;
    placeOnRamp(p, 2);
    assert.equal(breakAndStep(game, p), false, `岩の中に残った (${p.x}, ${p.y})`);
});

test('同じく、敵アタッカーも次のフレームで岩の外に出る', () => seeded(() => {
    const game = world();
    const e = makeAttacker(game, 0, 0, 'standard');
    game.player = { x: 30 * T, y: 9 * T, width: 16, height: 24, vx: 0, vy: 0, alive: true, docked: false, takeDamage() {} };
    placeOnRamp(e, 2);
    assert.equal(breakAndStep(game, e), false, `岩の中に残った (${e.x}, ${e.y})`);
}));

test('同じく、戦車も次のフレームで岩の外に出る', () => {
    const game = world();
    const t = new EnemyTank(game, 0, 0);
    t.fireTimer = 1e9;
    game.enemies.push(t);
    placeOnRamp(t, 1);
    assert.equal(breakAndStep(game, t, t._slopePoints), false, `岩の中に残った (${t.x}, ${t.y})`);
});

test('本物の5面の地図で、自機の足元の周りのブロックをでたらめに壊しながら飛び回っても、岩の中で終わるフレームが無い', async () => {
    const { Map } = await import('../src/js/world/Map.js');
    let frames = 0, stuck = 0, broke = 0, buried = 0;
    const examples = [];
    for (const seed of [1, 2, 3, 4]) {
        const map = new Map({ rng: new SeededRNG(seed) }, 4);
        const game = world();
        game.map = map;
        const held = new Set();
        game.input = { ...game.input, isKeyDown: (c) => held.has(c) };
        const rng = new SeededRNG(seed * 13);
        for (const sp of map.enemyAttackerSpawns.slice(0, 12)) {
            const p = new Player(game, sp.x, sp.y);
            game.player = p;
            for (let f = 0; f < 1200; f++) {
                if (f % 20 === 0) {
                    held.clear();
                    const h = rng.next();
                    if (h < 0.4) held.add('KeyA'); else if (h < 0.8) held.add('KeyD');
                    if (rng.next() < 0.35) held.add('KeyW');
                }
                if (f % 20 === 10) {
                    // 足元の周り（足のタイルの下の行を中心に 3×3）から1つ壊す
                    const r = Math.floor((p.y + p.height) / T) + Math.floor(rng.next() * 3) - 1;
                    const c = Math.floor((p.x + p.width / 2) / T) + Math.floor(rng.next() * 3) - 1;
                    if (map.damageBlock(r, c, 99)) broke++;
                    // 壊れた直後に体が岩の中になった（形の規則で岩が増えた）回数。壊した後の形は前の形より岩が
                    // 増えない（設計 決定13）ので 0。決定13 の前は 4 枚の地図で数十回あり、それを岩の外へ出していた
                    if (collidesWithTerrain(p, map)) buried++;
                }
                p.hoverFuel = Math.max(p.hoverFuel, 50);
                p.update();
                frames++;
                if (collidesWithTerrain(p, map)) {
                    stuck++;
                    if (examples.length < 5) examples.push({ seed, f, x: p.x, y: p.y });
                }
            }
        }
    }
    assert.ok(frames > 50000, `フレームが少ない: ${frames}`);
    assert.ok(broke > 500, `壊れたブロックが少ない: ${broke}`);
    assert.equal(buried, 0, `壊れて体が岩の中になった: ${buried}`);
    assert.equal(stuck, 0, `岩の中で終わったフレーム: ${stuck} ${JSON.stringify(examples)}`);
});
