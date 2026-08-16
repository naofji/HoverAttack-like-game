// 画面外の描画を省く判定。実測で「敵99体のうち画面内は約11体」＝描画呼び出しの
// 89% が捨て仕事だと分かったのが発端（2026-08-16）。
//
// 判定そのものより**安全側の作り**を縛るのが主眼。見えているものを消してしまう
// 事故のほうが、少し余分に描くことより遥かに高くつく。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isInView } from '../src/js/utils/viewCull.js';

// camera.x/y は左上。canvas は内部解像度そのまま（表示の拡大とは無関係）
const camera = { x: 1000, y: 500 };
const canvas = { width: 1024, height: 768 };

/** x,y が左上のクラス（EnemyTank / EnemyAttacker など多数） */
const topLeft = (x, y, w = 32, h = 32) => ({ x, y, width: w, height: h });

test('画面の中央にいるものは見えている', () => {
    assert.equal(isInView(topLeft(1500, 880), camera, canvas, 0), true);
});

test('画面の右外に完全に出たものは見えていない', () => {
    // 画面の右端は 1000 + 1024 = 2024
    assert.equal(isInView(topLeft(2200, 880), camera, canvas, 0), false);
});

test('画面の左外・上外・下外もそれぞれ見えていない', () => {
    assert.equal(isInView(topLeft(700, 880), camera, canvas, 0), false);
    assert.equal(isInView(topLeft(1500, 300), camera, canvas, 0), false);
    assert.equal(isInView(topLeft(1500, 1400), camera, canvas, 0), false);
});

test('縁にまたがるものは見えている扱いにする（半分だけ切れて消えるのを防ぐ）', () => {
    // 中心が右端 2024 の外側 8px。機体の半径は 16 なので左半分が画面内
    assert.equal(isInView(topLeft(2016, 880), camera, canvas, 0), true);
});

test('margin のぶんだけ判定が広がる', () => {
    // 中心が右端から 100px 外。半径 16 では届かないが、margin 100 なら入る
    const far = topLeft(2108, 880);
    assert.equal(isInView(far, camera, canvas, 0), false);
    assert.equal(isInView(far, camera, canvas, 100), true);
});

test('大きい機体ほど早く見え始める（半径に width/height が効く）', () => {
    // 画面の左外 900 に置く。左上基準なので右端は x + width。
    // 32px なら 932 で画面（1000〜）に届かないが、基地のような 400px なら
    // 1300 まで伸びて端がかかる
    assert.equal(isInView(topLeft(900, 880, 32, 32), camera, canvas, 0), false);
    assert.equal(isInView(topLeft(900, 880, 400, 400), camera, canvas, 0), true);
});

test('originIsCenter のクラスは width を足さずに中心を取る', () => {
    // 中心の求め方は centerOf() に任せる約束。ここを自前で書くと、
    // 巡航ミサイル(24x16)やレーザー(100x6)で最大50px ずれる（Physics.js のコメント）。
    // 幅 400 の横長を右端 2024 の外に置く。半径は 200。
    // 左上基準なら中心が x+200 なので左端が 2100 で画面外、
    // 中心基準なら中心が 2100 で左端が 1900 になり画面内に入る
    const wide = { x: 2100, y: 880, width: 400, height: 8 };
    assert.equal(isInView({ ...wide }, camera, canvas, 0), false);
    assert.equal(isInView({ ...wide, originIsCenter: true }, camera, canvas, 0), true);
});

test('camera が無ければ見えている扱い（安全側に倒す）', () => {
    assert.equal(isInView(topLeft(9999, 9999), null, canvas, 0), true);
});

test('canvas が無ければ見えている扱い（安全側に倒す）', () => {
    assert.equal(isInView(topLeft(9999, 9999), camera, null, 0), true);
});

test('margin を省くと 0 として扱う', () => {
    assert.equal(isInView(topLeft(2200, 880), camera, canvas), false);
});
