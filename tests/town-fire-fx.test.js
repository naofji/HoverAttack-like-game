import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { MAT_WOOD } from '../src/js/world/town/chunks.js';
import { TOWN_FLAMES_MAX, TOWN_FIRE_TICK, VIEW_CULL_MARGIN } from '../src/js/utils/Constants.js';
import { TOWN_FLAME_COLORS } from '../src/js/world/town/palette.js';
import { FlameParticle } from '../src/js/world/town/fireFx.js';
import { made, townOf } from './helpers/town-fire-fixtures.js';

const at = (cam) => ({ particles: [], projectiles: [], camera: cam, canvas: { width: 800, height: 600 } });

test('炎の粒は昇りながら黄 → 橙 → 赤へ冷え、寿命で消える', () => {
    const f = new FlameParticle(0, 0, 0, -1, 3, 30);
    const seen = [];
    while (f.alive) { seen.push(f.colorIndex); f.update(); }
    assert.equal(seen[0], 0);
    assert.equal(seen[seen.length - 1], TOWN_FLAME_COLORS.length - 1);
    assert.ok(seen.every((c, i) => i === 0 || c >= seen[i - 1]), '色は戻らない');
    assert.ok(f.y < 0, '昇る');
});

test('燃えている火元から炎と煙が出る（町の層に。game.particles には足さない）', () => {
    const town = townOf([made(100, 100, 16, 16, MAT_WOOD)]);
    town.fire.ignite(town.buildings[0], 0);
    const game = at({ x: 0, y: 0 });
    for (let i = 0; i < TOWN_FIRE_TICK * 4; i++) town.update(game);
    assert.ok(town.fire.flames.length > 0);
    assert.ok(town.fire.smoke.length > 0);
    assert.equal(game.particles.length, 0);
});

test('画面の外の火は粒を出さない（でも燃え進む）', () => {
    const town = townOf([made(100, 100, 64, 4, MAT_WOOD)]);
    town.fire.ignite(town.buildings[0], 0);
    const game = at({ x: 100 + 800 + VIEW_CULL_MARGIN + 100, y: 0 });
    for (let i = 0; i < 300; i++) town.update(game);
    assert.equal(town.fire.flames.length, 0);
    assert.equal(town.fire.smoke.length, 0);
    assert.ok(town.buildings[0].burnt.size > 1, '燃え進んでいる');
});

test('炎の粒は TOWN_FLAMES_MAX を超えない', () => {
    const specs = [];
    for (let n = 0; n < 15; n++) specs.push(made(n * 20, 100, 16, 16, MAT_WOOD));
    const town = townOf(specs);
    for (const b of town.buildings) town.fire.igniteNear(b, b.x + 8, b.y + 8, 20);
    const game = at({ x: 0, y: 0 });
    for (let i = 0; i < 600; i++) {
        town.update(game);
        assert.ok(town.fire.flames.length <= TOWN_FLAMES_MAX);
    }
});

test('燃えている破片からも炎が出る', () => {
    const town = townOf([made(100, 100, 16, 16, MAT_WOOD)], 1, { isSolidTile: () => false });
    town.fire.ignite(town.buildings[0], 0);
    town.chip(town.buildings[0], 114, 114, 0.5);   // 支え無し → 燃えたまま落ちる
    assert.ok(town.falling[0].fireFuel > 0);
    const game = at({ x: 0, y: 0 });
    for (let i = 0; i < TOWN_FIRE_TICK * 2; i++) town.update(game);
    assert.ok(town.fire.flames.length > 0);
});

test('draw: 建物 → 火 → 瓦礫 → 破片の順。火は画面に掛かる粒だけ描く', () => {
    const town = townOf([made(100, 100, 16, 16, MAT_WOOD)], 1, { smokeSprites: () => null });
    town.fire.ignite(town.buildings[0], 0);
    const game = at({ x: 0, y: 0 });
    for (let i = 0; i < TOWN_FIRE_TICK * 3; i++) town.update(game);
    town.rubble.push({ x: 300, w: 16, groundY: 300, h: 4, color: '#6f4f24' });
    const ctx = makeFakeCtx();
    town.draw(ctx, { x: 0, y: 0, w: 800, h: 600 });
    const order = ctx.calls.filter((c) => c.name === 'drawImage' || (c.name === 'set:fillStyle'))
        .map((c) => (c.name === 'drawImage' ? 'building'
            : TOWN_FLAME_COLORS.includes(c.args[0]) ? 'flame'
            : c.args[0] === '#6f4f24' ? 'rubble' : 'other'));
    const firstFlame = order.indexOf('flame');
    assert.ok(order.indexOf('building') < firstFlame && firstFlame < order.indexOf('rubble'), order.join(','));
    const far = makeFakeCtx();
    town.draw(far, { x: 5000, y: 5000, w: 800, h: 600 });
    assert.equal(far.calls.filter((c) => c.name === 'set:fillStyle' && TOWN_FLAME_COLORS.includes(c.args[0])).length, 0);
});
