import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Town } from '../src/js/world/town/Town.js';
import { MAT_ADOBE, MAT_WOOD, CHARRED } from '../src/js/world/town/chunks.js';
import { TOWN_FALLING_MAX } from '../src/js/utils/Constants.js';
import { fakeCanvas, block } from './helpers/town-fixtures.js';

// 32x68 の塔を (0, 0) に立て、下端の 4px（かけら1段、中心 y=66）がタイル行 r=4（y 64〜79）の岩に入るようにする
const tower = () => block(0, 0, 32, 68);
const onRock = (r) => r === 4;
// 高さ y のかけらの段を横一列に欠かせる。4px おきに当てるので、どのかけらの中心も当てた点から
// 2px 以内（ぎざぎざで半径が最小 r - 1.5 まで縮んでも欠ける）
const cutRow = (town, b, y, r = 4) => { for (let x = 2; x < b.width; x += 4) town.chip(b, b.x + x, y, r); };

test('中ほどを抜くと、上だけが1つの破片になって落ちる（土台は残る）', () => {
    const town = new Town([tower()], { createCanvas: fakeCanvas, isSolidTile: onRock });
    const b = town.buildings[0];
    cutRow(town, b, 30);
    assert.equal(town.falling.length, 1);
    const p = town.falling[0];
    assert.equal(p.y, 0);
    assert.ok(p.height <= 28, `${p.height}`);
    assert.ok(b.remaining > 0 && !b.collapsed);
    // 破片に行ったかけらは建物から消えている
    assert.equal(b.cells[0], 0);
});

test('破片は自分の canvas に元の絵を写し、形の外を抜く', () => {
    const town = new Town([tower()], { createCanvas: fakeCanvas, isSolidTile: onRock });
    const b = town.buildings[0];
    cutRow(town, b, 30);
    const p = town.falling[0];
    const draws = p.canvas.ctx.calls.filter((c) => c.name === 'drawImage');
    assert.equal(draws.length, 1);
    assert.equal(draws[0].args[0], b.canvas);
    assert.deepEqual(draws[0].args.slice(1), [0, 0, p.width, p.height, 0, 0, p.width, p.height]);
});

test('支えの岩が無い建物は丸ごと1つの破片として落ち、崩壊の土台も残らない', () => {
    const town = new Town([tower()], { createCanvas: fakeCanvas, isSolidTile: () => false });
    const b = town.buildings[0];
    town.chip(b, 16, 30, 1);
    assert.equal(town.falling.length, 1);
    assert.equal(b.remaining, 0);
});

test('残りが 4割を下回ると崩壊する: 支えの近くの土台だけ残り、焦げ、崩壊の注文が出る', () => {
    const town = new Town([tower()], { createCanvas: fakeCanvas, isSolidTile: onRock });
    const b = town.buildings[0];
    // y=58 の低い所（下から3段目）を横断すると、上の大部分（8割超）が支えを失う
    cutRow(town, b, 58, 2);
    assert.ok(b.collapsed);
    assert.equal(town.effects.filter((e) => e.type === 'collapse').length, 1);
    // 残ったかけらは支え（最下段）から TOWN_RUIN_DEPTH 段以内で、焦げの印が付いている
    for (let k = 0; k < b.cells.length; k++) {
        if (!b.cells[k]) continue;
        const j = Math.floor(k / b.cw);
        assert.ok(j >= b.ch - 1 - 3, `段 ${j} が残っている`);
        assert.equal(b.cells[k] & CHARRED, CHARRED);
    }
});

test('崩壊は1棟1回だけ（焦げた土台がまた欠けても、崩壊の注文は増えない）', () => {
    const town = new Town([tower()], { createCanvas: fakeCanvas, isSolidTile: onRock });
    const b = town.buildings[0];
    cutRow(town, b, 58, 2);
    town.chip(b, 16, 66, 2);
    assert.equal(town.effects.filter((e) => e.type === 'collapse').length, 1);
});

test('崩壊しないかぎり、残った部分は焦げない', () => {
    const town = new Town([tower()], { createCanvas: fakeCanvas, isSolidTile: onRock });
    const b = town.buildings[0];
    town.chip(b, 16, 10, 3);
    assert.ok(!b.collapsed);
    assert.ok([...b.cells].every((v) => !(v & CHARRED)));
});

test('落ちている破片は TOWN_FALLING_MAX まで。超えた分は古いものから土煙の注文になって消える', () => {
    const specs = [];
    for (let n = 0; n < TOWN_FALLING_MAX + 5; n++) specs.push(block(n * 40, 0, 16, 16));
    const town = new Town(specs, { createCanvas: fakeCanvas, isSolidTile: () => false });
    for (const b of town.buildings) town.chip(b, b.x + 8, 8, 1);
    assert.equal(town.falling.length, TOWN_FALLING_MAX);
    assert.equal(town.effects.filter((e) => e.type === 'dust').length, 5);
    // 残っているのは新しいほう
    assert.equal(town.falling[0].sourceId, 5);
});

test('破片の主な材料（瓦礫と粒の色に使う）', () => {
    const spec = {
        site: 'floor', style: 'C', kind: 'shack', x: 0, y: 0, w: 16, h: 8,
        parts: [
            { x: 0, y: 0, w: 16, h: 4, color: '#5a3d1e', mat: MAT_WOOD, solid: true },
            { x: 0, y: 4, w: 4, h: 4, color: '#7d5a2a', mat: MAT_ADOBE, solid: true },
        ],
    };
    const town = new Town([spec], { createCanvas: fakeCanvas, isSolidTile: () => false });
    // 土のかけら（左下）を欠かせると、支えの無い残り（木 4 かけら）が1つの破片になる
    town.chip(town.buildings[0], 2, 6, 0.5);
    assert.equal(town.falling[0].mainMaterial(), MAT_WOOD);
});

test('落ちる向きと回り方は建物と位置から決まる（同じ壊し方なら同じ）', () => {
    const run = () => {
        const town = new Town([tower()], { createCanvas: fakeCanvas, isSolidTile: onRock });
        cutRow(town, town.buildings[0], 30);
        const p = town.falling[0];
        return [p.vx, p.spin];
    };
    assert.deepEqual(run(), run());
});

test('L 字の破片は、外接矩形のうち塊に入らないかけらを自分の canvas から抜く（隣の絵を連れて落ちない）', () => {
    // 上の横棒（4 かけら）と左の縦棒（3 かけら）で L 字。右下に離れた 1 かけらを置き、それを欠かせる
    const spec = {
        site: 'floor', style: 'C', kind: 'shack', x: 0, y: 0, w: 16, h: 16,
        parts: [
            { x: 0, y: 0, w: 16, h: 4, color: '#5a3d1e', mat: MAT_WOOD, solid: true },
            { x: 0, y: 4, w: 4, h: 12, color: '#5a3d1e', mat: MAT_WOOD, solid: true },
            { x: 12, y: 12, w: 4, h: 4, color: '#5a3d1e', mat: MAT_WOOD, solid: true },
        ],
    };
    const town = new Town([spec], { createCanvas: fakeCanvas, isSolidTile: () => false });
    town.chip(town.buildings[0], 14, 14, 0.5);
    assert.equal(town.falling.length, 1);
    const p = town.falling[0];
    assert.equal(p.width, 16);
    assert.equal(p.height, 16);
    const clears = p.canvas.ctx.calls.filter((c) => c.name === 'clearRect');
    assert.equal(clears.length, 16 - 7, 'L 字の外の 9 かけら');
});
