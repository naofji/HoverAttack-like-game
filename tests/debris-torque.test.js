import { test } from 'node:test';
import assert from 'node:assert/strict';
import { torqueSpinFactor } from '../src/js/entities/debris/index.js';

const RAD = Math.PI / 180;

/** 破片の長辺の向き（単位ベクトル）。 */
const axis = (deg) => ({ x: Math.cos(deg * RAD), y: Math.sin(deg * RAD) });

/**
 * 破片を微小角だけ回したとき、爆心 O から遠いほうの端点が
 * O から遠ざかるかどうかを実際に計算して確かめる。
 */
function farEndMovesAway(mx, my, a) {
    const f = torqueSpinFactor(mx, my, a.x, a.y);
    const half = 5;                       // 長辺の半分
    // O から遠いほうの端点を選ぶ
    const p1 = { x: mx + a.x * half, y: my + a.y * half };
    const p2 = { x: mx - a.x * half, y: my - a.y * half };
    const far = Math.hypot(p1.x, p1.y) >= Math.hypot(p2.x, p2.y) ? p1 : p2;

    const before = Math.hypot(far.x, far.y);
    // ctx.rotate と同じ向きで微小回転（x' = x cos - y sin, y' = x sin + y cos）
    const da = f * 1e-4;
    const rx = far.x - mx;
    const ry = far.y - my;
    const after = Math.hypot(
        mx + rx * Math.cos(da) - ry * Math.sin(da),
        my + rx * Math.sin(da) + ry * Math.cos(da),
    );
    return after - before;
}

test('長辺が爆心の方を向いているとトルクが立たない', () => {
    // 爆心は原点、破片は右側 (10,0)。軸も水平＝爆心方向と平行
    assert.ok(Math.abs(torqueSpinFactor(10, 0, ...Object.values(axis(0)))) < 1e-9);
    assert.ok(Math.abs(torqueSpinFactor(10, 0, axis(180).x, axis(180).y)) < 1e-9);
});

test('長辺が爆心方向と垂直でもトルクが立たない', () => {
    assert.ok(Math.abs(torqueSpinFactor(10, 0, axis(90).x, axis(90).y)) < 1e-9);
    assert.ok(Math.abs(torqueSpinFactor(10, 0, axis(270).x, axis(270).y)) < 1e-9);
});

test('45度で最大になる', () => {
    const at = (deg) => Math.abs(torqueSpinFactor(10, 0, axis(deg).x, axis(deg).y));
    assert.ok(Math.abs(at(45) - 1) < 1e-9, `45度で1にならない: ${at(45)}`);
    assert.ok(at(45) > at(30) && at(45) > at(60), '45度が頂点になっていない');
    assert.ok(at(30) > at(10) && at(60) > at(80), '山の形になっていない');
});

test('45度から離れるほど滑らかに小さくなる', () => {
    const at = (deg) => Math.abs(torqueSpinFactor(10, 0, axis(deg).x, axis(deg).y));
    let prev = at(45);
    for (const deg of [50, 55, 60, 70, 80, 89]) {
        const v = at(deg);
        assert.ok(v <= prev + 1e-9, `${deg}度で増えた: ${prev} -> ${v}`);
        prev = v;
    }
});

test('爆心から遠いほうの端点が遠ざかる向きに回る', () => {
    // これがご指定のルールそのもの。あらゆる向き・位置で成り立つこと
    for (const deg of [10, 30, 45, 60, 80, 100, 135, 170, 200, 260, 315]) {
        for (const [mx, my] of [[10, 0], [0, 10], [-7, 7], [6, -9], [-12, -4]]) {
            const delta = farEndMovesAway(mx, my, axis(deg));
            // トルクがほぼゼロの向きでは動かないので、それは除く
            if (Math.abs(torqueSpinFactor(mx, my, axis(deg).x, axis(deg).y)) < 1e-6) continue;
            assert.ok(delta > 0,
                `${deg}度 / 位置(${mx},${my}) で遠い端点が近づいた: ${delta.toExponential(2)}`);
        }
    }
});

test('軸の向きを逆に取っても同じ回転になる（A と B の呼び方に依存しない）', () => {
    for (const deg of [20, 45, 70, 110]) {
        const a = torqueSpinFactor(10, 0, axis(deg).x, axis(deg).y);
        const b = torqueSpinFactor(10, 0, axis(deg + 180).x, axis(deg + 180).y);
        assert.ok(Math.abs(a - b) < 1e-9, `${deg}度で符号が反転した: ${a} vs ${b}`);
    }
});

test('爆心と破片の位置が重なっても壊れない', () => {
    const f = torqueSpinFactor(0, 0, 1, 0);
    assert.ok(Number.isFinite(f), `有限値でない: ${f}`);
});
