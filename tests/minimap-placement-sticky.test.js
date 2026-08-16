// pickStickyMiniMapCorner の置き場所選択ロジックを縛るテスト。
//
// 「マウスカーソルと反対側」かつ「往復させない」というユーザー要望を実現するため、
// 従来の pickMiniMapCorner（固定優先順位: 左上＞左下＞右上＞右下）とは別に
// 新設したもの（詳細は src/js/ui/minimapPlacement.js のコメント）。
//
// 初版は「今の隅にカーソルが乗ったら、カーソルから最も遠い隅へ移る」だったが、
// これは**対角2隅しか使わない**構造だった（実機で「右上に来ることが1度もない」と
// 指摘された）。動く条件がカーソルが今の隅に乗ることなので、最遠は必ず対角に
// なり、topLeft↔bottomRight の閉じたループから出られない。
// 現在は「カーソルがいる半分の反対側」を画面の中心線で決める方式。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { miniMapCornerPositions, pickStickyMiniMapCorner } from '../src/js/ui/minimapPlacement.js';

const BASE = { canvasW: 1024, canvasH: 768, mapW: 300, mapH: 150, margin: 16, hudTop: 60, hudBottom: 0 };
const positions = miniMapCornerPositions(BASE);
const PADDING = 48;
const ALL = ['topLeft', 'bottomLeft', 'topRight', 'bottomRight'];

// 表示領域（HUD帯を除く）の中心。ここを境にカーソルの「いる側」が決まる
// centerX=512, centerY=(76+602+150)/2=414
const CENTER = { x: 512, y: 414 };

function pick(currentCorner, crosshairPoint, unitPoint = null) {
    return pickStickyMiniMapCorner({
        positions, mapW: BASE.mapW, mapH: BASE.mapH,
        currentCorner, unitPoint, crosshairPoint, padding: PADDING,
    });
}

// ============================================
// 回帰テスト（本題）: 4隅すべてに到達できること
// ============================================

test('カーソルを4象限に置くと、それぞれ対角の隅が選ばれる（4隅すべてが使われる）', () => {
    const cases = [
        { cursor: { x: 150, y: 120 }, expected: 'bottomRight' }, // 左上寄り
        { cursor: { x: 880, y: 700 }, expected: 'topLeft' },     // 右下寄り
        { cursor: { x: 880, y: 120 }, expected: 'bottomLeft' },  // 右上寄り
        { cursor: { x: 150, y: 700 }, expected: 'topRight' },    // 左下寄り
    ];
    for (const { cursor, expected } of cases) {
        // どの隅から出発しても同じ結論になること（初版はここで出発点に引きずられた）
        for (const from of ALL) {
            const r = pick(from, cursor);
            assert.equal(r.corner, expected, `from=${from} cursor=${JSON.stringify(cursor)}`);
        }
    }
});

test('カーソルを画面じゅうに動かすと、4隅すべてが選ばれる', () => {
    // 初版はこの走査で topLeft と bottomRight の2隅しか出なかった。
    // 乱数は使わず格子状に走査する（不安定なテストにしないため）
    const seen = new Set();
    let corner = 'topLeft';
    for (let y = 80; y < 760; y += 40) {
        for (let x = 20; x < 1010; x += 40) {
            corner = pick(corner, { x, y }, { x: 512, y: 384 }).corner;
            seen.add(corner);
        }
    }
    assert.deepEqual([...seen].sort(), [...ALL].sort(), `使われた隅が偏っている: ${[...seen]}`);
});

// ============================================
// 「反対側」の決まり方
// ============================================

test('カーソルが左半分にあれば右側の隅、右半分にあれば左側の隅', () => {
    assert.ok(pick('topRight', { x: 100, y: 700 }).corner.endsWith('Right'), 'カーソルが左なのに左の隅');
    assert.ok(pick('topLeft', { x: 950, y: 700 }).corner.endsWith('Left'), 'カーソルが右なのに右の隅');
});

test('カーソルが上半分にあれば下側の隅、下半分にあれば上側の隅', () => {
    assert.ok(pick('topLeft', { x: 100, y: 100 }).corner.startsWith('bottom'), 'カーソルが上なのに上の隅');
    assert.ok(pick('bottomLeft', { x: 100, y: 740 }).corner.startsWith('top'), 'カーソルが下なのに下の隅');
});

// ============================================
// 往復させないためのヒステリシス（中心線の不感帯）
// ============================================

test('カーソルが中心線の近くを揺れているあいだは動かない', () => {
    // 中心のすぐ左右・すぐ上下（不感帯の内側）を行き来させても隅は変わらない。
    // これが無いと、カーソルが画面中央を横切るたびにミニマップが往復する
    // （初版で「今の隅に留まる」ルールを入れた理由そのもの）
    for (const from of ALL) {
        for (const d of [-30, 30]) {
            assert.equal(pick(from, { x: CENTER.x + d, y: CENTER.y }).corner, from, `x方向 d=${d} from=${from}`);
            assert.equal(pick(from, { x: CENTER.x, y: CENTER.y + d }).corner, from, `y方向 d=${d} from=${from}`);
        }
    }
});

test('中心線から十分離れれば動く', () => {
    // 不感帯（横 ±87px / 縦 ±71px 相当）を明確に超える位置
    assert.equal(pick('topLeft', { x: CENTER.x - 200, y: CENTER.y }).corner, 'topRight');
    assert.equal(pick('topRight', { x: CENTER.x + 200, y: CENTER.y }).corner, 'topLeft');
});

test('クロスヘアが無ければ今の隅から動かない', () => {
    for (const from of ALL) {
        assert.equal(pick(from, null).corner, from);
    }
});

// ============================================
// 自機を避ける
// ============================================

test('本来の隅に自機が重なっていたら、上下を裏返した隅へ逃げる', () => {
    // カーソルは左上 → 本来は bottomRight。そこに自機がいる
    const r = pick('topLeft', { x: 150, y: 120 }, { x: 858, y: 677 });
    assert.notEqual(r.corner, 'bottomRight', '自機と重なる隅を選んでしまっている');
    assert.equal(r.corner, 'topRight', '左右ではなく上下を裏返してほしい（カーソルと反対側の左右は保ちたい）');
});

test('上下を裏返しても自機が重なるなら、左右も裏返す', () => {
    // bottomRight と topRight の両方に自機がかかる縦長の状況を、自機点2つ分に
    // 相当する矩形の潰し方で作るのは難しいので、隅の座標を寄せて作る
    const tight = {
        topLeft: { x: 0, y: 0 },
        bottomLeft: { x: 0, y: 400 },
        topRight: { x: 700, y: 0 },
        bottomRight: { x: 700, y: 400 },
    };
    // 自機を右側の帯の中央に置くと topRight/bottomRight の両方に重なる
    const r = pickStickyMiniMapCorner({
        positions: tight, mapW: 300, mapH: 400,
        currentCorner: 'topLeft',
        unitPoint: { x: 850, y: 400 },
        crosshairPoint: { x: 100, y: 50 }, // 左上 → 本来は bottomRight
        padding: PADDING,
    });
    assert.ok(r.corner.endsWith('Left'), `左側へ逃げていない: ${r.corner}`);
});

test('どの隅も自機と重なるなら、本来の隅を返す（クラッシュしない）', () => {
    const collapsed = {
        topLeft: { x: 0, y: 0 }, bottomLeft: { x: 0, y: 0 },
        topRight: { x: 0, y: 0 }, bottomRight: { x: 0, y: 0 },
    };
    const r = pickStickyMiniMapCorner({
        positions: collapsed, mapW: 1000, mapH: 1000,
        currentCorner: null,
        unitPoint: { x: 500, y: 500 },
        crosshairPoint: { x: 5000, y: 5000 },
        padding: PADDING,
    });
    assert.ok(ALL.includes(r.corner));
});

test('今いる隅に自機が重なったら移る', () => {
    const unitAtTopLeft = { x: 166, y: 151 }; // topLeft 矩形の中心
    // カーソルは右下 → 本来は topLeft だが、そこに自機がいる
    const r = pick('topLeft', { x: 900, y: 700 }, unitAtTopLeft);
    assert.notEqual(r.corner, 'topLeft', '自機と重なっているのに留まっている');
});

// ============================================
// 実機フィードバック: 近づいても動かず、自機がミニマップと重なる
// ============================================
//
// 自機の当たり判定だけ余白ゼロで見ていた（クロスヘアには padding があった）ので、
// **実際に矩形へ入るまで動かない**。しかも隅の切り替えはフェードを挟むので、
// 動き出してから消えるまでの十数フレームは重なったままになる。
// 自機にも余白（unitPadding）を持たせ、入る手前で動き始めるようにする。

const UNIT_PADDING = 64;

function pickWithUnitPadding(currentCorner, unitPoint, crosshairPoint = null) {
    return pickStickyMiniMapCorner({
        positions, mapW: BASE.mapW, mapH: BASE.mapH,
        currentCorner, unitPoint, crosshairPoint,
        padding: PADDING, unitPadding: UNIT_PADDING,
    });
}

test('自機がミニマップに入る手前（余白の内側）でも、隅が切り替わる', () => {
    // 左上のミニマップの右下の角から、外へ少しだけ離れた点。
    // 矩形の外なので余白ゼロの実装では「重なっていない」と判定される
    const tl = positions.topLeft;
    const justOutside = {
        x: tl.x + BASE.mapW + UNIT_PADDING / 2,
        y: tl.y + BASE.mapH + UNIT_PADDING / 2,
    };
    assert.ok(
        justOutside.x > tl.x + BASE.mapW && justOutside.y > tl.y + BASE.mapH,
        '前提が崩れている：この点は矩形の外にあるはず',
    );

    const r = pickWithUnitPadding('topLeft', justOutside);
    assert.notEqual(r.corner, 'topLeft', '自機が近づいているのに左上のままになっている');
});

test('自機が余白の外にいるうちは、隅は動かない（過敏に往復しない）', () => {
    const tl = positions.topLeft;
    const farOutside = {
        x: tl.x + BASE.mapW + UNIT_PADDING * 2,
        y: tl.y + BASE.mapH + UNIT_PADDING * 2,
    };
    const r = pickWithUnitPadding('topLeft', farOutside);
    assert.equal(r.corner, 'topLeft', '自機が十分離れているのに動いている');
});

// unitPadding を省略したときに従来どおり（余白ゼロ）であること。
// 既定を変えると pickStickyMiniMapCorner を使う他の呼び出しの挙動が変わる
test('unitPadding を渡さなければ従来どおり余白ゼロで判定する', () => {
    const tl = positions.topLeft;
    const justOutside = { x: tl.x + BASE.mapW + 10, y: tl.y + BASE.mapH + 10 };
    const r = pickStickyMiniMapCorner({
        positions, mapW: BASE.mapW, mapH: BASE.mapH,
        currentCorner: 'topLeft', unitPoint: justOutside, crosshairPoint: null,
        padding: PADDING,
    });
    assert.equal(r.corner, 'topLeft', '余白を渡していないのに動いている');
});
