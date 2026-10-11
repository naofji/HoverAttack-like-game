// 町の火のテストの共有: 材料を指定した四角い建物、岩に支えられた町（種つきの乱数）、n フレーム進める
import { SeededRNG } from '../../src/js/utils/SeededRNG.js';
import { Town } from '../../src/js/world/town/Town.js';
import { fakeCanvas } from './town-fixtures.js';

/** 材料 mat の四角い建物（全部厚い壁） */
export function made(x, y, w, h, mat, kind = 'shack') {
    return {
        site: 'floor', style: 'C', kind, x, y, w, h,
        parts: [{ x: 0, y: 0, w, h, color: '#5a3d1e', mat, solid: true }],
    };
}

/** どのかけらも岩に支えられた（崩れで落ちない）町。乱数は種つき */
export function townOf(specs, seed = 1, opts = {}) {
    const rng = new SeededRNG(seed);
    return new Town(specs, { createCanvas: fakeCanvas, isSolidTile: () => true, random: () => rng.next(), ...opts });
}

/** n フレーム進める（camera が無いので粒は全部「見えている」扱い） */
export function run(town, n) {
    const game = { particles: [], projectiles: [], camera: null, canvas: null };
    for (let i = 0; i < n; i++) town.update(game);
}
