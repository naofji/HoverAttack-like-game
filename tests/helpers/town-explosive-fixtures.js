// 町の爆発物のテストの共有: 爆発物と木の建物の設計図、ダメージを記録する機体、本物の spawnExplosion を持つ game
// （テストのファイルどうしで import しない — 読んだ側でも相手のテストが登録されて二重に走るため）
import { SeededRNG } from '../../src/js/utils/SeededRNG.js';
import { Town } from '../../src/js/world/town/Town.js';
import { SpawnEffects } from '../../src/js/systems/SpawnEffects.js';
import { MAT_EXPLOSIVE, MAT_WOOD } from '../../src/js/world/town/chunks.js';
import { fakeCanvas } from './town-fixtures.js';

// 閃光・粒・煙の絵が document を引くことがあるので、何もしない canvas を返す
const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };

/** ドラム缶（全部爆発物の厚い壁）。既定 8x16 */
export function drum(x, y, w = 8, h = 16) {
    return {
        site: 'floor', style: 'C', kind: 'drum', x, y, w, h,
        parts: [{ x: 0, y: 0, w, h, color: '#b0301e', mat: MAT_EXPLOSIVE, solid: true }],
    };
}

/** 木の小屋（全部厚い壁）。既定 32x32 */
export function shed(x, y, w = 32, h = 32) {
    return {
        site: 'floor', style: 'C', kind: 'shack', x, y, w, h,
        parts: [{ x: 0, y: 0, w, h, color: '#5a3d1e', mat: MAT_WOOD, solid: true }],
    };
}

/** 中心が (cx, cy) の 16px 角の機体。受けたダメージを記録する */
export function unit(cx, cy) {
    return {
        x: cx - 8, y: cy - 8, width: 16, height: 16, alive: true, vx: 0, vy: 0, hits: [],
        takeDamage(n) { this.hits.push(n); },
    };
}

/**
 * 町と game。game は SpawnEffects を混ぜた本物の spawnExplosion を持つ（町の爆発 → town.blast・地雷の誘爆）。
 * booms は spawnExplosion の呼び出しを数える（画面の近くの爆発だけがここを通る）。
 * view を渡すと camera / canvas をその矩形にする（無ければ全部見えている扱い）。
 * map の destroyArea / damageBlock は呼ばれたら記録する（爆発物は岩を壊さない）
 */
export function world(specs, { seed = 1, isSolidTile = () => true, view = null } = {}) {
    const rng = new SeededRNG(seed);
    const town = new Town(specs, { createCanvas: fakeCanvas, isSolidTile, random: () => rng.next(), smokeSprites: () => null });
    const rockHits = [];
    const booms = [];
    const game = Object.assign({
        particles: [], projectiles: [], enemies: [], landmines: [], player: null, carrier: null,
        camera: view ? { x: view.x, y: view.y } : null, canvas: view ? { width: view.w, height: view.h } : null,
        map: {
            town,
            destroyArea: (...a) => rockHits.push(['destroyArea', ...a]),
            damageBlock: (...a) => rockHits.push(['damageBlock', ...a]),
        },
    }, SpawnEffects);
    const real = game.spawnExplosion;
    game.spawnExplosion = function (x, y, size, opts) {
        booms.push({ x, y, size, frame: town.explosives.frame });
        return real.call(this, x, y, size, opts);
    };
    return {
        town, game, booms, rockHits,
        step(n = 1) { for (let i = 0; i < n; i++) town.update(game); },
    };
}
