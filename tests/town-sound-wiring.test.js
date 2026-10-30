// 町から音を鳴らす（Town._flushEffects / Town.update / FireSystem.soundLevel）。spec 4章「鳴るとき」
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { TOWN_FIRE_SOUND_FULL } from '../src/js/utils/Constants.js';
import { block } from './helpers/town-fixtures.js';
import { made, townOf } from './helpers/town-fire-fixtures.js';
import { MAT_WOOD } from '../src/js/world/town/chunks.js';

/** audioManager の呼び出しを記録する（tests/audio-wiring.test.js の spyAudio と同じ流儀） */
function spyAudio(names) {
    const calls = [];
    const originals = {};
    for (const n of names) {
        originals[n] = audioManager[n];
        audioManager[n] = (...args) => calls.push({ name: n, args });
    }
    return {
        calls,
        of(n) { return calls.filter((c) => c.name === n); },
        restore() { for (const n of names) audioManager[n] = originals[n]; },
    };
}
const NAMES = ['playTownCollapse', 'startTownFire', 'stopTownFire'];
const gameAt = (view) => ({
    particles: [], projectiles: [], enemies: [],
    camera: view ? { x: view.x, y: view.y } : null, canvas: view ? { width: view.w, height: view.h } : null,
});

// 床は row 8（y 128〜143）だけ。建物の下端 4px が床に入る。根元を帯状に欠かせると上が支えを失って
// 崩壊し、崩壊の時点で残っているかけら（＝崩れる音の大きさ）が多く残る。真ん中を丸ごと吹き飛ばすと
// 崩壊の時点で何も残らず、崩れる音の大きさが 0 になる（爆発音のほうが鳴るので、それでよい）
const FLOOR = { isSolidTile: (r) => r === 8 };
const standing = (x, w, h) => block(x, 132 - h, w, h);
const cutRoot = (town, b) => town.chip(b, b.x + b.width / 2, 120, b.width / 2 + 2);

test('建物が1棟崩壊すると、崩れる音が1回、崩れたかけらの数と建物の位置で鳴る', () => {
    const spy = spyAudio(NAMES);
    try {
        const town = townOf([standing(100, 32, 64)], 1, FLOOR);
        const b = town.buildings[0];
        cutRoot(town, b);
        assert.equal(b.collapsed, true, '前提: 崩壊した');
        town.update(gameAt(null));
        const calls = spy.of('playTownCollapse');
        assert.equal(calls.length, 1);
        const [size, x] = calls[0].args;
        assert.ok(size > 0);
        assert.ok(Math.abs(x - 116) <= 16);
    } finally { spy.restore(); }
});

test('1 tick に何棟も崩れても、崩れる音は1回（一番大きいもの）', () => {
    const spy = spyAudio(NAMES);
    try {
        const town = townOf([standing(0, 32, 64), standing(100, 48, 128), standing(200, 32, 64)], 1, FLOOR);
        for (const b of town.buildings) cutRoot(town, b);
        assert.ok(town.buildings.every((b) => b.collapsed), '前提: 3棟とも崩壊した');
        town.update(gameAt(null));
        const calls = spy.of('playTownCollapse');
        assert.equal(calls.length, 1);
        assert.ok(Math.abs(calls[0].args[1] - 124) <= 24, `一番大きい塔の位置で鳴っていない: ${calls[0].args[1]}`);
    } finally { spy.restore(); }
});

test('画面の外の崩壊は鳴らない', () => {
    const spy = spyAudio(NAMES);
    try {
        const town = townOf([standing(5000, 32, 64)], 1, FLOOR);
        cutRoot(town, town.buildings[0]);
        town.update(gameAt({ x: 0, y: 0, w: 640, h: 360 }));
        assert.equal(spy.of('playTownCollapse').length, 0);
    } finally { spy.restore(); }
});

test('落ちた破片が砕けると、破片のかけらの数で崩れる音が鳴る', () => {
    const spy = spyAudio(NAMES);
    try {
        // 中ほどを抜いて上だけ落とす（下の土台は岩に支えられ、上の塊が 1 つ落ちて row 10 の床で砕ける）
        const town = townOf([block(0, 0, 16, 64)], 1, { isSolidTile: (r) => r === 3 || r >= 10 });
        town.chip(town.buildings[0], 8, 34, 9);   // 幅 16px を横に切る
        assert.ok(town.falling.length >= 1, '前提: 落ちる破片がある');
        // 最初の update で欠け・崩壊の注文が出る。砕けた音だけを数えるため、そのあとから数える
        town.update(gameAt(null));
        assert.ok(town.falling.length >= 1, '前提: まだ落ちている');
        spy.calls.length = 0;
        for (let i = 0; i < 200 && town.falling.length; i++) town.update(gameAt(null));
        const sizes = spy.of('playTownCollapse').map((c) => c.args[0]);
        assert.ok(sizes.length >= 1, '砕けた音が鳴らない');
        assert.ok(sizes.every((s) => s > 0 && s < 64), `破片のかけらの数ではない: ${sizes}`);
    } finally { spy.restore(); }
});

test('soundLevel: 火元が多いほど強く（√ で FULL で 1）、火が無ければ 0', () => {
    const specs = Array.from({ length: 12 }, (_, i) => made(i * 40, 0, 32, 32, MAT_WOOD));
    const town = townOf(specs);
    assert.deepEqual(town.fire.soundLevel(null), { intensity: 0, x: null });
    town.fire.ignite(town.buildings[0], 0);
    const one = town.fire.soundLevel(null).intensity;
    assert.ok(Math.abs(one - Math.sqrt(1 / TOWN_FIRE_SOUND_FULL)) < 1e-9, `${one}`);
    for (const b of town.buildings) town.fire.ignite(b, 5);
    assert.equal(town.fire.soundLevel(null).intensity, 1);
});

test('soundLevel: 画面から遠い火元は弱く、左右は火元の位置', () => {
    const town = townOf([made(100, 100, 32, 32, MAT_WOOD), made(8000, 100, 32, 32, MAT_WOOD)]);
    const view = { x: 0, y: 0, w: 640, h: 360 };
    town.fire.ignite(town.buildings[0], 0);
    const near = town.fire.soundLevel(view);
    town.fire.fires.length = 0;
    town.fire.ignite(town.buildings[1], 0);
    const far = town.fire.soundLevel(view);
    assert.ok(near.intensity > 0 && Math.abs(near.x - 102) < 4);
    assert.equal(far.intensity, 0, '画面から 1画面以上離れた火が聞こえる');
});

test('update: 火があれば startTownFire、無くなれば stopTownFire', () => {
    const spy = spyAudio(NAMES);
    try {
        const town = townOf([made(100, 100, 32, 32, MAT_WOOD)]);
        town.update(gameAt(null));
        assert.equal(spy.of('startTownFire').length, 0);
        assert.equal(spy.of('stopTownFire').length, 1);
        town.fire.ignite(town.buildings[0], 0);
        spy.calls.length = 0;
        town.update(gameAt(null));
        const [intensity, x] = spy.of('startTownFire')[0].args;
        assert.ok(intensity > 0 && Math.abs(x - 102) < 4);
        assert.equal(spy.of('stopTownFire').length, 0);
    } finally { spy.restore(); }
});

test('遊んでいる最中でなければ（ゲームオーバー・クリアの後）、燃えていても炎のループを始めず止める', () => {
    // 最終レビュー指摘: 最後の自機を失った tick の後半で Town.update がループを作り直し、
    // CONTINUE で町の無い面へ移っても鳴り続けた（同じ tick の中で stopLoopingSe より後に start が来る）
    const spy = spyAudio(NAMES);
    try {
        const town = townOf([made(100, 100, 32, 32, MAT_WOOD)]);
        town.fire.ignite(town.buildings[0], 0);
        for (const gameState of ['gameover', 'mission_clear', 'game_clear']) {
            spy.calls.length = 0;
            town.update({ ...gameAt(null), gameState });
            assert.equal(spy.of('startTownFire').length, 0, `${gameState} で始めた`);
            assert.equal(spy.of('stopTownFire').length, 1, `${gameState} で止めない`);
        }
        spy.calls.length = 0;
        town.update({ ...gameAt(null), gameState: 'playing' });
        assert.equal(spy.of('startTownFire').length, 1, 'playing で始めない');
    } finally { spy.restore(); }
});

test('面を作り直すとき（resetLevel）は炎のループを止める。町の無い面では誰も止めないため', async () => {
    const { GameStateManager } = await import('../src/js/systems/GameStateManager.js');
    const stubCtx = new Proxy({}, {
        get: (t, prop) => (prop in t ? t[prop] : (typeof prop === 'string' ? () => ({ addColorStop() {} }) : undefined)),
        set: () => true,
    });
    const originalDocument = globalThis.document;
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => stubCtx }) };
    const spy = spyAudio(NAMES);
    try {
        const game = {
            score: 0, missionsCompleted: 1, debugStartMission: 0, totalTime: 0, stageResults: [], weekSeed: 1,
            spawnManager: { findSpawnPosition: () => ({ x: 0, y: 0 }), spawnLandmines() {}, spawnStorageTowers() {}, spawnBarriers() {}, spawnElectricFloors() {}, spawnEnemies() {} },
            camera: { follow() {}, snapToTarget() {} },
        };
        new GameStateManager(game).resetLevel(false);
        assert.ok(spy.of('stopTownFire').length >= 1);
    } finally {
        spy.restore();
        globalThis.document = originalDocument;
    }
});
