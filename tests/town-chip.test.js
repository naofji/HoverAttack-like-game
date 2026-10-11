import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Town } from '../src/js/world/town/Town.js';
import { SOLID } from '../src/js/world/town/chunks.js';
import { fakeCanvas, block } from './helpers/town-fixtures.js';

// 欠け方だけを見るため、どのかけらも岩に支えられている（中心が岩）扱いにする。支えが無いと
// 欠けた瞬間に建物が丸ごと落ちて（Task 4 の支えの規則）、穴の形が見られない
const ANCHORED = { createCanvas: fakeCanvas, isSolidTile: () => true };

const count = (b) => b.cells.reduce((n, v) => n + (v ? 1 : 0), 0);

test('buildingsAt / buildingsInCircle は外接矩形で引く（64px のマス目をまたいでも）', () => {
    const town = new Town([block(0, 0), block(100, 0), block(60, 60, 16, 16)], ANCHORED);
    assert.deepEqual(town.buildingsAt(10, 10).map((b) => b.id), [0]);
    assert.deepEqual(town.buildingsAt(70, 70).map((b) => b.id), [2]);
    assert.deepEqual(town.buildingsAt(50, 50), []);
    assert.deepEqual(town.buildingsInCircle(50, 16, 52).map((b) => b.id).sort(), [0, 1, 2]);
    assert.deepEqual(town.buildingsInCircle(50, 16, 10).map((b) => b.id), []);
});

test('cellAt: 建物の中ならかけらの番号、外なら -1', () => {
    const town = new Town([block(100, 50)], ANCHORED);
    const b = town.buildings[0];
    assert.equal(town.cellAt(b, 100, 50), 0);
    assert.equal(town.cellAt(b, 105, 59), 2 * b.cw + 1);
    assert.equal(town.cellAt(b, 99, 50), -1);
    assert.equal(town.cellAt(b, 132, 50), -1);
});

test('chip: 半径の中のかけらが消え、canvas から 4px 角で抜かれる', () => {
    const town = new Town([block(0, 0)], ANCHORED);
    const b = town.buildings[0];
    assert.equal(b.total, 64);
    const n = town.chip(b, 16, 16, 6);
    assert.ok(n >= 4 && n <= 12, `${n}`);
    assert.equal(count(b), 64 - n);
    assert.equal(b.remaining, 64 - n);
    const clears = b.canvas.ctx.calls.filter((c) => c.name === 'clearRect');
    assert.equal(clears.length, n);
    assert.ok(clears.every((c) => c.args[2] === 4 && c.args[3] === 4));
});

test('chip: 半径が小さくても、当たった点のかけらは必ず欠ける', () => {
    const town = new Town([block(0, 0)], ANCHORED);
    const b = town.buildings[0];
    town.chip(b, 9, 9, 0.5);
    assert.equal(b.cells[town.cellAt(b, 9, 9)], 0);
});

test('chip: 同じ建物の同じ所に同じ半径で当てると、同じ穴になる（ぎざぎざは位置から決まる）', () => {
    const holes = [0, 1].map(() => {
        const town = new Town([block(0, 0, 64, 64)], ANCHORED);
        town.chip(town.buildings[0], 30, 30, 11);
        return [...town.buildings[0].cells].map((v) => (v ? 1 : 0)).join('');
    });
    assert.equal(holes[0], holes[1]);
});

test('chip: 穴の縁はぎざぎざ（中心からちょうど同じ距離のかけらでも、欠けるものと残るものがある）', () => {
    // 輪の帯で数えるだけだと、きれいな円でも帯の内側が欠けて外側が残るので区別できない。
    // 格子は8方向に対称なので、同じ距離のかけらが何組もある。ぎざぎざが無ければどの組も揃う
    const town = new Town([block(0, 0, 128, 128)], ANCHORED);
    const b = town.buildings[0];
    town.chip(b, 64, 64, 30);
    const byDist = new Map();
    for (let k = 0; k < b.cells.length; k++) {
        const i = k % b.cw, j = (k - i) / b.cw;
        const d = Math.hypot(i * 4 + 2 - 64, j * 4 + 2 - 64);
        if (d < 28 || d > 32) continue;
        const key = d.toFixed(3);
        if (!byDist.has(key)) byDist.set(key, new Set());
        byDist.get(key).add(b.cells[k] ? 'left' : 'gone');
    }
    const mixed = [...byDist.values()].filter((v) => v.size === 2).length;
    assert.ok(mixed > 0, `同じ距離で欠け方が分かれた組 ${mixed} / ${byDist.size}`);
});

test('chip: 穴の縁に残ったかけらを焦げ色で塗る', () => {
    const town = new Town([block(0, 0)], ANCHORED);
    const b = town.buildings[0];
    const before = b.canvas.ctx.calls.length;
    town.chip(b, 16, 16, 4);
    const fills = b.canvas.ctx.calls.slice(before).filter((c) => c.name === 'fillRect');
    assert.ok(fills.length > 0);
});

test('chip: 建物に掛からない爆心でも、半径の中のかけらは欠ける。空振りなら 0', () => {
    const town = new Town([block(0, 0)], ANCHORED);
    const b = town.buildings[0];
    assert.ok(town.chip(b, -4, 16, 8) > 0);
    assert.equal(town.chip(b, -40, 16, 8), 0);
});

test('chip: 厚い壁の印はかけらごと消える（残ったかけらの印は変わらない）', () => {
    const town = new Town([block(0, 0)], ANCHORED);
    const b = town.buildings[0];
    town.chip(b, 2, 2, 1);
    assert.equal(b.cells[0], 0);
    assert.equal(b.cells[b.cells.length - 1] & SOLID, SOLID);
});
