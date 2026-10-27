// 本物の5面の地図で、自機をでたらめに飛び回らせても地形に埋まらない・弾き飛ばされないことのテスト。
// 段2の最終レビューで見つかった3件（壁際の坂での離陸の繰り返し、面取りの細い先へ四角いタイルの
// スナップで入り込む、天井の斜面の横の逸らしが積み上がる）を縛る。比べる相手は同じ地図を四角に
// 焼き直したもの（どれも 0、横の速さは歩きの最高速まで）。
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { makeGame, makeMap } from './helpers/enemy-world.js';
import { Player } from '../src/js/entities/Player.js';
import { collidesWithTerrain } from '../src/js/utils/Physics.js';
import { TILE_SIZE as T, ICE_SLIDE, ICE_MAX_SLIDE_SPEED } from '../src/js/utils/Constants.js';

before(() => {
    const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

const SNOW = { motionAt: () => ({ speed: 1, gravity: 1, slide: ICE_SLIDE }), sightScale: 1, kind: 'snow' };

function inputFor(held) {
    return {
        keys: {}, isKeyDown: (c) => held.has(c), isKeyPressed: () => false, isCharPressed: () => false,
        mouse: { left: false, right: false }, isLeftClickPressed: () => false, isRightClickPressed: () => false,
        rightHoldFrames: 0, crosshairLocked: false, getMouseWorld: () => ({ x: 0, y: 0 }), getTargetWorld: () => ({ x: 0, y: 0 }),
    };
}

test('本物の5面の地図をでたらめに飛び回っても、体は地形に入らず、横の速さは滑りの最高速を超えない', async () => {
    const { Map } = await import('../src/js/world/Map.js');
    let frames = 0, stuck = 0, overlap = 0, maxVx = 0;
    const examples = [];
    for (const seed of [1, 2, 3, 4]) {
        const map = new Map({ rng: new SeededRNG(seed) }, 4);
        const game = makeGame(map);
        game.env = SNOW;
        game.camera = { x: 0, y: 0, shake() {} };
        game.canvas = { width: 1024, height: 768 };
        game.spawnSnowKick = () => {};
        const held = new Set();
        game.input = inputFor(held);
        const rng = new SeededRNG(seed * 7);
        for (const sp of map.enemyAttackerSpawns.slice(0, 20)) {
            const p = new Player(game, sp.x, sp.y);
            game.player = p;
            for (let f = 0; f < 1500; f++) {
                // 20フレームごとに左右とホバーをでたらめに変える。燃料は切らさない（天井にも当てたい）
                if (f % 20 === 0) {
                    held.clear();
                    const h = rng.next();
                    if (h < 0.4) held.add('KeyA'); else if (h < 0.8) held.add('KeyD');
                    if (rng.next() < 0.45) held.add('KeyW');
                }
                p.hoverFuel = Math.max(p.hoverFuel, 50);
                p.update();
                frames++;
                maxVx = Math.max(maxVx, Math.abs(p.vx));
                if (collidesWithTerrain(p, map)) {
                    stuck++;
                    if (examples.length < 5) examples.push({ seed, f, x: p.x, y: p.y });
                }
                // 体の 2px 内側（点判定の点の内側）が岩に重なっていないか
                if (map.rectHitsTerrain(p.x + 2.01, p.y + 2.01, p.width - 4.02, p.height - 3.02)) overlap++;
            }
        }
    }
    assert.ok(frames >= 100000, `フレームが少ない: ${frames}`);
    assert.equal(stuck, 0, `点判定の点が岩の中のまま終わったフレーム: ${stuck} ${JSON.stringify(examples)}`);
    assert.equal(overlap, 0, `体が岩に重なったフレーム: ${overlap}`);
    assert.ok(maxVx <= ICE_MAX_SLIDE_SPEED + 1e-9, `横の速さが滑りの最高速を超えた: ${maxVx}`);
});

test('坂を上った先の壁を押し続けても、離陸と着地を繰り返さない', () => {
    // tests/player-slope.test.js と同じ坂（列 10〜19、上面 y = 30T − x）。列 15 だけ天井近くまでの壁
    const rows = [];
    for (let r = 0; r < 24; r++) {
        let s = '';
        for (let c = 0; c < 40; c++) {
            let floor = 20;
            if (c >= 10 && c <= 19) floor = 29 - c;
            else if (c >= 20 && c <= 29) floor = 10;
            if (c === 15) floor = 2;
            s += r >= floor ? '#' : '.';
        }
        rows.push(s);
    }
    const game = makeGame(makeMap(rows, null, { tileShape: 'snowSlope' }));
    game.env = SNOW;
    game.camera = { x: 0, y: 0, shake() {} };
    game.canvas = { width: 1024, height: 768 };
    game.spawnSnowKick = () => {};
    game.input = inputFor(new Set(['KeyD']));
    const p = new Player(game, 5 * T, 20 * T - 24);
    game.player = p;
    for (let f = 0; f < 200; f++) p.update(); // 壁まで歩く
    assert.ok(p.x + p.width > 15 * T - 2, `前提: 壁まで着いていない x=${p.x}`);
    let toggles = 0, prev = p.onGround;
    for (let f = 0; f < 400; f++) {
        p.update();
        if (p.onGround !== prev) toggles++;
        prev = p.onGround;
    }
    assert.equal(toggles, 0, `壁際で接地が ${toggles} 回切り替わった`);
});
