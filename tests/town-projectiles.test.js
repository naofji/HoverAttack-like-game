import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { Town } from '../src/js/world/town/Town.js';
import { MAT_WOOD, SOLID } from '../src/js/world/town/chunks.js';
import { PlayerBullet } from '../src/js/entities/PlayerBullet.js';
import { EnemyBullet } from '../src/js/entities/EnemyBullet.js';
import { Missile } from '../src/js/entities/Missile.js';
import { EnemyHomingMissile } from '../src/js/entities/EnemyHomingMissile.js';
import { EnemyCruiseMissile } from '../src/js/entities/EnemyCruiseMissile.js';
import { Grenade } from '../src/js/entities/Grenade.js';
import { hasLineOfSight } from '../src/js/utils/Physics.js';
import { fakeCanvas, block } from './helpers/town-fixtures.js';

before(() => {
    const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

/** 岩の無い広い空間と、弾が呼ぶ game の最小限 */
function world() {
    const game = {
        particles: [], landmines: [], enemies: [], projectiles: [], enemyBullets: [],
        sparks: [], blasts: [],
        spawnSparks(x, y) { this.sparks.push([x, y]); },
        spawnExplosion(x, y, size) { this.blasts.push([x, y, size]); },
        addScore() { throw new Error('建物で点は入らない'); },
        // 巡航ミサイルの _explode() が画面を揺らす
        camera: { x: 0, y: 0, shake() {} }, canvas: { width: 800, height: 600 },
        player: null, carrier: null,
    };
    game.map = {
        width: 4000, height: 4000, rows: 250, cols: 250,
        isSolid: () => false, isSolidAtPixel: () => false,
        pixelToTile: (x, y) => ({ r: Math.floor(y / 16), c: Math.floor(x / 16) }),
        damageBlock: () => { throw new Error('岩は壊さない'); },
        destroyArea: () => 0,
        isWaterAtPixel: () => false,
    };
    return game;
}

/** 土の壁（厚い）の塔 x=200〜232 と、木の手すり（細い）x=100〜104 */
function town() {
    const rail = {
        site: 'ceiling', style: 'C', kind: 'lantern', x: 100, y: 0, w: 4, h: 200,
        parts: [{ x: 0, y: 0, w: 4, h: 200, color: '#4a3418', mat: MAT_WOOD, solid: false }],
    };
    return new Town([block(200, 0, 32, 200), rail], { createCanvas: fakeCanvas });
}

/** 弾を1 tick 進めて、町の当たりを見る（_simulationTick と同じ順: 位置の記録 → 更新 → 町） */
function tick(t, p) {
    p._prevX = p.x; p._prevY = p.y;
    p.update();
    t.sweepProjectile(p);
}

test('マシンガンの弾は厚い壁で消え、火花が出て、当たった所が欠ける', () => {
    const game = world(); const t = town(); game.map.town = t;
    const b = new PlayerBullet(game, 150, 100, 0);
    for (let i = 0; i < 60 && b.alive; i++) tick(t, b);
    assert.equal(b.alive, false);
    assert.ok(b.x >= 200 && b.x < 208, `止まった位置 ${b.x}`);
    assert.equal(game.sparks.length, 1);
    assert.ok(t.buildings[0].remaining < t.buildings[0].total);
});

test('敵の弾も同じに止まる（敵弾も遮蔽に当たる）', () => {
    const game = world(); const t = town();
    const b = new EnemyBullet(game, 300, 100, Math.PI);
    for (let i = 0; i < 60 && b.alive; i++) tick(t, b);
    assert.equal(b.alive, false);
    assert.ok(b.x > 224 && b.x <= 232, `${b.x}`);
});

test('細い部品は1回だけ欠かせ、弾は飛び続ける', () => {
    const game = world(); const t = town();
    const b = new PlayerBullet(game, 60, 100, 0);
    const rail = t.buildings[1];
    // 手すり（x 100〜104）を抜けるまで進める（塔 x=200 の手前で止める）
    for (let i = 0; i < 60 && b.alive && b.x < 120; i++) tick(t, b);
    assert.ok(b.x > 104 && b.alive, `手すりを抜けた（x=${b.x}）`);
    assert.ok(rail.remaining < rail.total);
    assert.equal(game.sparks.length, 0);
});

test('速い弾でも薄い壁（4px）をすり抜けない（前の位置から今の位置まで 4px 刻み）', () => {
    const game = world();
    const wall = new Town([block(200, 0, 4, 200)], { createCanvas: fakeCanvas });
    const b = new PlayerBullet(game, 150, 100, 0);
    b.vx = 40;   // 1 tick に 40px（どの弾よりも速い）
    for (let i = 0; i < 10 && b.alive; i++) tick(wall, b);
    assert.equal(b.alive, false);
    assert.ok(b.x >= 200 && b.x < 204);
});

test('撃った位置に重なる建物は、その弾では無視する。その先の別の建物では止まる', () => {
    const game = world();
    const t = new Town([block(0, 0, 64, 200), block(200, 0, 32, 200)], { createCanvas: fakeCanvas });
    // 発射位置 (20, 100) は1棟目の厚い壁の中（機体が建物の手前で撃った）
    const b = new PlayerBullet(game, 20, 100, 0);
    for (let i = 0; i < 60 && b.alive; i++) tick(t, b);
    assert.equal(t.buildings[0].remaining, t.buildings[0].total, '1棟目は無傷');
    assert.ok(b.x >= 200 && b.x < 208, '2棟目で止まる');
});

test('発射したその tick（前の位置がまだ無い）でも、目の前の壁で消えない', () => {
    const game = world();
    const t = new Town([block(0, 0, 64, 200)], { createCanvas: fakeCanvas });
    const b = new PlayerBullet(game, 20, 100, 0);
    b.update();                 // 発射直後の tick: _prevX はまだ無い
    t.sweepProjectile(b);
    assert.equal(b.alive, true);
});

test('ミサイルは厚い壁で爆発する（岩は壊さず、点も入らない）', () => {
    for (const make of [
        (g) => new Missile(g, 150, 100, 0, true),
        (g) => new EnemyHomingMissile(g, 150, 100, 0),
    ]) {
        const game = world(); const t = town();
        const m = make(game);
        for (let i = 0; i < 80 && m.alive; i++) tick(t, m);
        assert.equal(m.alive, false);
        assert.equal(m.exploded, true);
        assert.ok(game.blasts.length >= 1);
        assert.ok(m.x >= 200 && m.x < 208);
    }
});

test('巡航ミサイルも厚い壁で爆発する', () => {
    const game = world(); const t = town();
    const m = new EnemyCruiseMissile(game, 150, 100, 0, []);
    for (let i = 0; i < 120 && m.alive; i++) tick(t, m);
    assert.equal(m.exploded, true);
    assert.ok(game.blasts.length >= 1);
});

test('グレネードは厚い壁に当たった所で爆発し、細い部品はすり抜ける（欠けもしない）', () => {
    const game = world(); const t = town();
    const g = new Grenade(game, 60, 100, 0, 12);
    g.lifetime = 9999;
    const rail = t.buildings[1];
    for (let i = 0; i < 80 && g.alive; i++) tick(t, g);
    assert.equal(rail.remaining, rail.total, '手すりは欠けない');
    assert.equal(g.alive, false);
    assert.ok(g.x >= 200 && g.x < 212, `${g.x}`);
    assert.ok(game.blasts.length >= 1);
});

test('town.update は自機側の弾（game.projectiles）を見る', () => {
    const game = world(); const t = town();
    const b = new PlayerBullet(game, 196, 100, 0);
    b._prevX = 196; b._prevY = 100;
    b.x = 204;
    game.projectiles.push(b);
    t.update(game);
    assert.equal(b.alive, false);
});

test('CollisionManager は敵の弾を更新した直後に町の当たりを見る（止まった弾は自機に当たらない）', async () => {
    const { CollisionManager } = await import('../src/js/systems/CollisionManager.js');
    const order = [];
    const bullet = { alive: true, x: 0, y: 0, update() { order.push('update'); } };
    const game = {
        enemyBullets: [bullet], projectiles: [], enemies: [], player: null, carrier: null,
        map: { town: { sweepProjectile: (p) => { order.push('town'); p.alive = false; } } },
    };
    const cm = new CollisionManager(game);
    cm._updateEnemyBullets();
    assert.deepEqual(order, ['update', 'town']);
    assert.equal(game.enemyBullets.length, 0);
});

test('敵の狙いは建物を見ない（建物越しでも見えている＝撃ってきて遮蔽を削る）', async () => {
    const { Map } = await import('../src/js/world/Map.js');
    const map = new Map({ rng: new SeededRNG(11) }, 2);
    let checked = 0;
    for (const b of map.town.buildings.filter((v) => v.site === 'floor')) {
        const y = b.y + b.height / 2;
        const x1 = b.x - 8, x2 = b.x + b.width + 8;
        // 岩をまたがない（タイルが全部空の）横線だけを使う
        let clear = true;
        for (let x = x1; x <= x2; x += 4) if (map.isSolidAtPixel(x, y)) { clear = false; break; }
        if (!clear) continue;
        // その線が建物の厚い壁を通ること（通らないなら確かめる意味が無い）
        let crosses = false;
        for (let x = x1; x <= x2; x += 4) {
            const k = map.town.cellAt(b, x, y);
            if (k >= 0 && (b.cells[k] & SOLID)) { crosses = true; break; }
        }
        if (!crosses) continue;
        assert.equal(hasLineOfSight(x1, y, x2, y, map), true);
        checked++;
    }
    assert.ok(checked > 0, '確かめられる建物が無い');
});

test('細い部品が厚くても（12px の足場）、1発で欠かせるのはその建物につき1回', () => {
    // 4px の手すりだと 4px/tick の弾は1回しか中を通らず、1回だけの規則が無くても1回になる
    const game = world();
    const scaffold = {
        site: 'wall', style: 'C', kind: 'scaffoldShack', x: 100, y: 0, w: 12, h: 200,
        parts: [{ x: 0, y: 0, w: 12, h: 200, color: '#4a3418', mat: MAT_WOOD, solid: false }],
    };
    const t = new Town([scaffold], { createCanvas: fakeCanvas, isSolidTile: () => true });
    let chips = 0;
    const realChip = t.chip.bind(t);
    t.chip = (...a) => { chips++; return realChip(...a); };
    const b = new PlayerBullet(game, 60, 100, 0);
    for (let i = 0; i < 60 && b.alive && b.x < 130; i++) tick(t, b);
    assert.ok(b.alive && b.x > 112, '足場を抜けた');
    assert.equal(chips, 1);
});

test('反射ビームは厚い壁も貫通し、通り道の建物を1棟1回ずつ欠かせる', async () => {
    const { ReflectBeam } = await import('../src/js/entities/ReflectBeam.js');
    const game = world();
    // 岩に支えられた建物にする（支えが無いと最初の1回で崩壊して丸ごと落ち、2回目を削る物が残らない）
    const t = new Town([block(200, 0, 32, 200), block(400, 0, 32, 200)], { createCanvas: fakeCanvas, isSolidTile: () => true });
    const beam = new ReflectBeam(game, 150, 100, 0);
    assert.equal(beam.townKind, 'beam');
    // 欠けた tick の数ではなく chip の呼び出しを数える。1回だけの規則が無いと、最初の tick に
    // 4px 刻みの点ごとに削ってトンネルを掘り切ってしまい、tick で数えると 1 のままになる
    const chips = [0, 0];
    const realChip = t.chip.bind(t);
    t.chip = (b, ...rest) => { chips[b.id]++; return realChip(b, ...rest); };
    for (let i = 0; i < 200 && beam.alive; i++) {
        beam.update();
        t.sweepProjectile(beam);
    }
    assert.deepEqual(chips, [1, 1], '2棟とも、欠かせたのは1回ずつ');
});
