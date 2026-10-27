// 本物の5面の地図で、母艦と戦車が岩に詰まったままにならないことのテスト（段4の最終レビュー I1・I2）。
// 坂だけの地図では出ない形（面取りの下面、1タイルの張り出し、壊れて増えた岩）を本物の地図で踏む。
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { makeGame } from './helpers/enemy-world.js';
import { Carrier } from '../src/js/entities/Carrier.js';
import { EnemyTank } from '../src/js/entities/EnemyTank.js';
import { collidesWithTerrain } from '../src/js/utils/Physics.js';
import { TILE_SIZE as T, ICE_SLIDE, PLAYER_HEIGHT, CARRIER_HEIGHT } from '../src/js/utils/Constants.js';

before(() => {
    const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

const SNOW = { motionAt: () => ({ speed: 1, gravity: 1, slide: ICE_SLIDE }), sightScale: 1, kind: 'snow' };

async function snowMap(seed) {
    const { Map } = await import('../src/js/world/Map.js');
    return new Map({ rng: new SeededRNG(seed) }, 4);
}

function seeded(seed, fn) {
    const orig = Math.random;
    const rng = new SeededRNG(seed);
    Math.random = () => rng.next();
    try { return fn(); } finally { Math.random = orig; }
}

test('本物の5面の地図で母艦を左右にでたらめに走らせても、岩に詰まったまま終わらない', async () => {
    let runs = 0, stuckRuns = 0;
    const examples = [];
    for (let seed = 1; seed <= 8; seed++) {
        const map = await snowMap(seed);
        const rng = new SeededRNG(seed * 31);
        for (const sp of map.enemyAttackerSpawns.slice(0, 25)) {
            const game = makeGame(map);
            game.env = SNOW;
            const held = new Set();
            game.input = { isKeyDown: (k) => held.has(k) };
            game.player = { x: 0, y: 0, width: 16, height: 24, alive: true, docked: true, onGround: true };
            const c = new Carrier(game, sp.x - 24, sp.y + PLAYER_HEIGHT - CARRIER_HEIGHT - 4);
            const inRock = () => collidesWithTerrain(c, map, c._slopePoints(c));
            if (inRock()) continue;
            runs++;
            let streak = 0;
            for (let f = 0; f < 600; f++) {
                if (f % 60 === 0) {
                    held.clear();
                    const h = rng.next();
                    if (h < 0.45) held.add('KeyA'); else if (h < 0.9) held.add('KeyD');
                }
                c.update();
                streak = inRock() ? streak + 1 : 0;
            }
            if (streak >= 60) {
                stuckRuns++;
                if (examples.length < 5) examples.push({ seed, sx: sp.x, x: c.x, y: c.y });
            }
        }
    }
    assert.ok(runs > 150, `走らせた数が少ない: ${runs}`);
    assert.equal(stuckRuns, 0, `岩に詰まったまま終わった: ${stuckRuns}/${runs} ${JSON.stringify(examples)}`);
});

test('本物の5面の地図で戦車の足元の周りのブロックをでたらめに壊しても、戦車は岩に埋まったままにならない', async () => {
    let buried = 0, stillBuried = 0;
    const examples = [];
    // 戦車の AI は Math.random を使うので、テストの間だけ種つきの乱数に差し替える（戦車をまたいで1本）
    const orig = Math.random;
    const ai = new SeededRNG(9);
    Math.random = () => ai.next();
    try {
        for (const seed of [1, 2, 3, 4]) {
            const map = await snowMap(seed);
            const rng = new SeededRNG(seed * 17);
            for (const sp of map.enemyTankSpawns.slice(0, 10)) {
                const game = makeGame(map);
                game.env = SNOW;
                game.camera = { x: 0, y: 0, shake() {} };
                game.canvas = { width: 1024, height: 768 };
                game.spawnSnowKick = () => {};
                game.player = { x: sp.x + 200, y: sp.y - 100, width: 16, height: 24, vx: 0, vy: 0, alive: true, docked: false, takeDamage() {} };
                const t = new EnemyTank(game, sp.x, sp.y);
                game.enemies.push(t);
                const inRock = () => collidesWithTerrain(t, map, t._slopePoints(t));
                let since = -1;
                for (let f = 0; f < 900 && t.alive; f++) {
                    if (f % 15 === 7) {
                        const r = Math.floor((t.y + t.height) / T) + Math.floor(rng.next() * 3) - 1;
                        const c = Math.floor((t.x + t.width / 2) / T) + Math.floor(rng.next() * 3) - 1;
                        map.damageBlock(r, c, 99);
                        if (inRock()) buried++;
                    }
                    t.fireTimer = 1e9;
                    t.update();
                    // 岩の中に続けて 30 フレーム居たら1回と数える（壊れた直後でなく、その後の動きで入った分も）
                    since = inRock() ? since + 1 : -1;
                    if (since === 30) {
                        stillBuried++;
                        if (examples.length < 5) examples.push({ seed, sx: sp.x, f, x: t.x, y: t.y });
                    }
                }
            }
        }
    } finally {
        Math.random = orig;
    }
    assert.ok(buried > 20, `壊れて埋まった回数が少ない: ${buried}`);
    assert.equal(stillBuried, 0, `30 フレーム後も埋まったまま: ${stillBuried}/${buried} ${JSON.stringify(examples)}`);
});
