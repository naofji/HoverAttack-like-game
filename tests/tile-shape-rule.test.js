// タイルの形（4象限）を決める規則のテスト。期待値はすべて手で書いた（実装から導かない）。
// 設計: docs/superpowers/specs/2026-10-27-tile-shape-collision-design.md の 4節
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    Q_EMPTY, Q_FULL, Q_TRI_NO_TL, Q_TRI_NO_TR, Q_TRI_NO_BL, Q_TRI_NO_BR,
    packShape, unpackShape, SHAPE_EMPTY, SHAPE_FULL, computeTileShape,
} from '../src/js/utils/tileShape.js';

const F = Q_FULL, E = Q_EMPTY, TL = Q_TRI_NO_TL, TR = Q_TRI_NO_TR, BL = Q_TRI_NO_BL, BR = Q_TRI_NO_BR;

/** ASCII（# 岩、P 磨き、. 空）から cellAt を作る。範囲外は外周と同じ 'polished' */
function cells(rows) {
    return (r, c) => {
        if (r < 0 || r >= rows.length || c < 0 || c >= rows[0].length) return 'polished';
        const ch = rows[r][c];
        return ch === '#' ? 'rock' : ch === 'P' ? 'polished' : 'empty';
    };
}
const shape = (rows, r, c, rule = 'snowSlope') => computeTileShape(cells(rows), r, c, rule);

test('packShape と unpackShape は往復する', () => {
    assert.deepEqual(unpackShape(packShape(E, TL, BR, F)), [E, TL, BR, F]);
    assert.deepEqual(unpackShape(SHAPE_FULL), [F, F, F, F]);
    assert.deepEqual(unpackShape(SHAPE_EMPTY), [E, E, E, E]);
});

test("'square' の規則では岩は満ち、空は空（周りが全部空でも削らない）", () => {
    const g = ['...', '.#.', '...'];
    assert.equal(shape(g, 1, 1, 'square'), SHAPE_FULL);
    assert.equal(computeTileShape(cells(g), 1, 1, undefined), SHAPE_FULL);
    assert.equal(shape(g, 0, 0, 'square'), SHAPE_EMPTY);
});

test('単独タイルは4角とも小さい面取り＝菱形', () => {
    assert.equal(shape(['...', '.#.', '...'], 1, 1), packShape(TL, TR, BL, BR));
});

test('宙に浮いた2ブロックの板は「<==>」（左が「<=」、右が「=>」）', () => {
    const g = ['.....', '.##..', '.....'];
    assert.equal(shape(g, 1, 1), packShape(TL, F, BL, F));
    assert.equal(shape(g, 1, 2), packShape(F, TR, F, BR));
});

test('高さ2以上の崖の上の角は段が続かないので小さい面取り', () => {
    const g = [
        '......',
        '###...',
        '###...',
        '######',
    ];
    assert.equal(shape(g, 1, 2), packShape(F, TR, F, F));
    assert.equal(shape(g, 2, 2), SHAPE_FULL); // 崖の面（右だけ露出）は削らない
    // 鏡像（左上の角は左下の隣を見る。右上とは別の条件なので両方縛る）
    const m = [
        '......',
        '...###',
        '...###',
        '######',
    ];
    assert.equal(shape(m, 1, 3), packShape(TL, F, F, F));
});

test('天井の崖の下の角も、段が続かなければ小さい面取り', () => {
    const g = [
        '######',
        '###...',
        '###...',
        '......',
    ];
    assert.equal(shape(g, 2, 2), packShape(F, F, F, BR));
    const m = [
        '######',
        '...###',
        '...###',
        '......',
    ];
    assert.equal(shape(m, 2, 3), packShape(F, F, BL, F));
});

test('右へ上る1段ずつの階段は、各段がタイル1枚ぶんの斜め', () => {
    const g = [
        '......',
        '....##',
        '...###',
        '..####',
        '######',
    ];
    const ramp = packShape(E, TL, TL, F);
    assert.equal(shape(g, 3, 2), ramp);
    assert.equal(shape(g, 2, 3), ramp);
    assert.equal(shape(g, 1, 4), ramp);
});

test('左へ上る階段は鏡像', () => {
    const g = [
        '......',
        '##....',
        '###...',
        '####..',
        '######',
    ];
    const ramp = packShape(TR, E, F, TR);
    assert.equal(shape(g, 3, 3), ramp);
    assert.equal(shape(g, 2, 2), ramp);
    assert.equal(shape(g, 1, 1), ramp);
});

test('平らな床に1段だけの段も、左下が岩なので斜め', () => {
    assert.equal(shape(['.....', '..###', '#####'], 1, 2), packShape(E, TL, TL, F));
});

test('天井側の段（上下反転の階段）も同じ規則で斜め', () => {
    const g = [
        '######',
        '..####',
        '...###',
        '....##',
        '......',
    ];
    assert.equal(shape(g, 1, 2), packShape(BL, F, E, BL));
    assert.equal(shape(g, 2, 3), packShape(BL, F, E, BL));
    const m = [
        '######',
        '####..',
        '###...',
        '##....',
        '......',
    ];
    assert.equal(shape(m, 1, 3), packShape(F, BR, BR, E));
});

test('凹角（内側の角）は削らない', () => {
    const g = [
        '.....',
        '.#...',
        '.##..',
        '#####',
    ];
    assert.equal(shape(g, 2, 1), SHAPE_FULL);
});

test('磨き仕上げは周りが全部空でも満ち。隣の岩は磨きを岩として数える', () => {
    assert.equal(shape(['...', '.P.', '...'], 1, 1), SHAPE_FULL);
    assert.equal(shape(['....', '.#P.', '....'], 1, 1), packShape(TL, F, BL, F));
});

test('幅1の柱の上端は斜めにせず、上の2角の小さい面取り（自己交差しない）', () => {
    const g = ['...', '.#.', '.#.', '###'];
    assert.equal(shape(g, 1, 1), packShape(TL, TR, F, F));
});
