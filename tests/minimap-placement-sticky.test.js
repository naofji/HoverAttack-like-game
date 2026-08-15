// pickStickyMiniMapCorner の置き場所選択ロジックを縛るテスト。
//
// 「マウスカーソルと反対側」かつ「往復させない」というユーザー要望を実現するため、
// 従来の pickMiniMapCorner（固定優先順位: 左上＞左下＞右上＞右下）とは別に、
// 「今の隅で足りているなら動かない／動くときだけカーソルから最も遠い隅へ」という
// ロジックを新設した（詳細は src/js/ui/minimapPlacement.js のコメント）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { miniMapCornerPositions, pickStickyMiniMapCorner } from '../src/js/ui/minimapPlacement.js';

const BASE = { canvasW: 1024, canvasH: 768, mapW: 300, mapH: 150, margin: 16, hudTop: 60, hudBottom: 0 };
const positions = miniMapCornerPositions(BASE);
const PADDING = 48;

// 隅の矩形中心（テスト内の距離計算の目視確認用）
// topLeft:(166,151) bottomLeft:(166,677) topRight:(858,151) bottomRight:(858,677)

test('今いる隅が許容できるなら、カーソルが反対側にあってもそのまま留まる', () => {
    // 今いる隅は topRight（クロスヘアからは塞がれていない＝許容できる）。
    // クロスヘアは topLeft 寄りなので、もし「毎回最遠を選び直す」実装だと
    // 最遠の bottomRight に飛んでしまうはず。ここが「留まる」の本体の確認になる
    // （最遠＝現在の隅、という選び方だと留まっても偶然の一致で見分けが付かないため、
    // わざと最遠にならない隅を「今の隅」にしている）。
    const r = pickStickyMiniMapCorner({
        positions, mapW: BASE.mapW, mapH: BASE.mapH,
        currentCorner: 'topRight',
        unitPoint: null,
        crosshairPoint: { x: 200, y: 100 }, // topLeft 寄り
        padding: PADDING,
    });
    assert.equal(r.corner, 'topRight', '往復してしまっている（最遠のbottomRightへ飛んだ）');
});

test('今いる隅にクロスヘアが余白の内側まで近づいたら、別の隅へ移る', () => {
    // topLeft 矩形(16,76)-(316,226)の右端すぐ外、padding=48 の範囲内の点
    const nearTopLeft = { x: 336, y: 100 };
    const r = pickStickyMiniMapCorner({
        positions, mapW: BASE.mapW, mapH: BASE.mapH,
        currentCorner: 'topLeft',
        unitPoint: null,
        crosshairPoint: nearTopLeft,
        padding: PADDING,
    });
    assert.notEqual(r.corner, 'topLeft', '余白内に入ったのに動いていない');
    // クロスヘアから最も遠い隅は bottomRight のはず
    assert.equal(r.corner, 'bottomRight');
});

test('移り先はカーソルから最も遠い隅（カーソル位置を変えて複数方向で確認）', () => {
    const cases = [
        { cursor: { x: 200, y: 100 }, expected: 'bottomRight' }, // 左上寄り
        { cursor: { x: 900, y: 700 }, expected: 'topLeft' },     // 右下寄り
        { cursor: { x: 900, y: 100 }, expected: 'bottomLeft' },  // 右上寄り
        { cursor: { x: 200, y: 700 }, expected: 'topRight' },    // 左下寄り
    ];
    for (const { cursor, expected } of cases) {
        const r = pickStickyMiniMapCorner({
            positions, mapW: BASE.mapW, mapH: BASE.mapH,
            currentCorner: null, // 「今の隅」が無い＝必ず選び直す状況にして、距離だけを見る
            unitPoint: null,
            crosshairPoint: cursor,
            padding: PADDING,
        });
        assert.equal(r.corner, expected, `cursor=${JSON.stringify(cursor)}`);
    }
});

test('移り先は自機と重ならない隅（最遠が自機と重なるなら次点を選ぶ）', () => {
    // クロスヘアは topLeft 寄り → 最遠は bottomRight のはずだが、自機が bottomRight にいる
    const nearTopLeft = { x: 336, y: 100 };
    const unitAtBottomRight = { x: 858, y: 677 }; // bottomRight 矩形の中心
    const r = pickStickyMiniMapCorner({
        positions, mapW: BASE.mapW, mapH: BASE.mapH,
        currentCorner: 'topLeft',
        unitPoint: unitAtBottomRight,
        crosshairPoint: nearTopLeft,
        padding: PADDING,
    });
    assert.notEqual(r.corner, 'bottomRight', '自機と重なる隅を選んでしまっている');
    // 次に遠いのは bottomLeft（topRight より遠い）
    assert.equal(r.corner, 'bottomLeft');
});

test('自機と重ならない隅が1つも無ければ、カーソルから最も遠い隅を選ぶ（自機の条件は諦める）', () => {
    // 4隅すべて同じ矩形に潰し、自機点をその中に置く＝どの隅も自機と重なる状況を作る
    const collapsedPositions = {
        topLeft: { x: 0, y: 0 },
        bottomLeft: { x: 0, y: 0 },
        topRight: { x: 0, y: 0 },
        bottomRight: { x: 0, y: 0 },
    };
    const r = pickStickyMiniMapCorner({
        positions: collapsedPositions, mapW: 1000, mapH: 1000,
        currentCorner: null,
        unitPoint: { x: 500, y: 500 }, // 4隅すべての矩形の内側
        crosshairPoint: { x: 5000, y: 5000 },
        padding: PADDING,
    });
    // 自機の条件を諦めても何らかの隅は返る（クラッシュしない）こと自体が本体
    assert.ok(['topLeft', 'bottomLeft', 'topRight', 'bottomRight'].includes(r.corner));
});

test('今いる隅に自機が重なったら移る', () => {
    const unitAtTopLeft = { x: 166, y: 151 }; // topLeft 矩形の中心
    const r = pickStickyMiniMapCorner({
        positions, mapW: BASE.mapW, mapH: BASE.mapH,
        currentCorner: 'topLeft',
        unitPoint: unitAtTopLeft,
        crosshairPoint: { x: 900, y: 700 }, // クロスヘアは topLeft を塞いでいない
        padding: PADDING,
    });
    assert.notEqual(r.corner, 'topLeft', '自機と重なっているのに留まっている');
});
