import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { Player } from '../src/js/entities/Player.js';
import { RepairKit } from '../src/js/entities/RepairKit.js';
import { PLAYER_STUN_FALL_SPEED, TILE_SIZE } from '../src/js/utils/Constants.js';
import { makeMap, flatFloorRows } from './helpers/enemy-world.js';

const FLOOR_TOP = 20 * TILE_SIZE;   // flatFloorRows() の床の上端

/** audioManager のメソッド呼び出しを記録する。音は鳴らせないので呼び出しで確かめる。 */
function spyAudio(names) {
    const calls = [];
    const originals = {};
    for (const n of names) {
        originals[n] = audioManager[n];
        audioManager[n] = (...args) => calls.push({ name: n, args });
    }
    return {
        calls,
        restore() { for (const n of names) audioManager[n] = originals[n]; },
        count(n) { return calls.filter((c) => c.name === n).length; },
    };
}

function makeGame() {
    return {
        map: { isSolidAtPixel: () => false, pixelToTile: () => ({ r: 0, c: 0 }) },
        camera: { x: 0, y: 0 }, canvas: { width: 1024, height: 768 },
        input: {
            mouse: { x: 0, y: 0, left: false },
            isKeyDown: () => false, isKeyPressed: () => false,
            getTargetWorld: () => ({ x: 0, y: 0 }),
        },
        particles: [], projectiles: [], enemies: [], carrier: null,
        spawnExplosion() {}, spawnHeavyDamage() {}, spawnSparks() {},
        spawnDebris() {}, addScore() {},
    };
}

test('自機の破壊で専用の破壊音が鳴る', () => {
    const spy = spyAudio(['playPlayerDestroyed']);
    try {
        const p = new Player(makeGame(), 100, 100);
        p.die();
        assert.equal(spy.count('playPlayerDestroyed'), 1);
    } finally { spy.restore(); }
});

/** 床のあるマップに、空中から落下する自機を置く。 */
function fallingPlayer(startY, vy) {
    const game = makeGame();
    game.map = makeMap(flatFloorRows());
    const p = new Player(game, 100, startY);
    p.docked = false;
    p.onGround = false;
    p.wasOnGround = false;
    p.vy = vy;
    return p;
}

test('着地音は空中から接地した瞬間に1回だけ鳴る', () => {
    const spy = spyAudio(['playLanding']);
    try {
        const p = fallingPlayer(FLOOR_TOP - 100, 1);
        for (let i = 0; i < 60; i++) p.update();
        assert.ok(p.onGround, '着地していない（前提が崩れている）');
        assert.equal(spy.count('playLanding'), 1,
            `接地の瞬間に1回だけ鳴らない: ${spy.count('playLanding')}回`);
    } finally { spy.restore(); }
});

test('強い落下では着地音が hard になる', () => {
    const spy = spyAudio(['playLanding']);
    try {
        const p = fallingPlayer(FLOOR_TOP - 300, PLAYER_STUN_FALL_SPEED + 1);
        for (let i = 0; i < 60 && spy.count('playLanding') === 0; i++) p.update();
        assert.ok(spy.calls.length > 0, '着地音が鳴っていない');
        assert.equal(spy.calls[0].args[0], true, 'hard 指定になっていない');
    } finally { spy.restore(); }
});

test('穏やかな落下では着地音が hard にならない', () => {
    const spy = spyAudio(['playLanding']);
    try {
        const p = fallingPlayer(FLOOR_TOP - 30, 0.5);
        for (let i = 0; i < 60 && spy.count('playLanding') === 0; i++) p.update();
        assert.ok(spy.calls.length > 0, '着地音が鳴っていない');
        assert.equal(spy.calls[0].args[0], false, '穏やかな落下が hard 扱い');
    } finally { spy.restore(); }
});

test('マシンガンのリロード完了で音が鳴る', () => {
    const spy = spyAudio(['playWeapon']);
    const reloads = () => spy.calls.filter((c) => c.args[0] === 'reload').length;
    try {
        const p = new Player(makeGame(), 100, 100);
        p.docked = false;
        p.mgReloadTimer = 2;
        p.update();
        assert.equal(reloads(), 0, '完了前に鳴っている');
        p.update();
        assert.equal(reloads(), 1, '完了時に鳴らない');
        p.update();
        assert.equal(reloads(), 1, '完了後も鳴り続けている');
    } finally { spy.restore(); }
});

test('アイテム取得で音が鳴る', () => {
    const spy = spyAudio(['playPickup']);
    try {
        const game = makeGame();
        game.player = {
            x: 100, y: 100, width: 16, height: 24, alive: true,
            repairKits: 0, hp: 50,
        };
        const kit = new RepairKit(game, 100, 100);
        for (let i = 0; i < 5 && kit.alive; i++) kit.update();
        assert.equal(spy.count('playPickup'), 1, `取得音が鳴らない/重複: ${spy.count('playPickup')}`);
    } finally { spy.restore(); }
});
