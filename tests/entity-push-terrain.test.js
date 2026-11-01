// 機体どうしの押し出しが、機体を地形の中へ置かないことのテスト。
//
// 自機と敵（アタッカー・戦車）は重なると相手の縁へ置き直される（横は相手の向こう側の縁、縦は相手の頭の上）。
// 置き直す先が岩かを見ていなかったので、ノックバックで重なると壁や天井にめり込んだ（実機の指摘
// 「基本的にノックバックの際に地形にめり込む」）。本物の7面・5面・3面でノックバックを与えて数えると、
// めり込みは全部この押し出しで起き、地形の解決そのものからは0だった。
// 置き直した先が岩の中なら、置き直す前（地形の解決を通った位置）へ戻す。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { Carrier } from '../src/js/entities/Carrier.js';
import { makeMap, makeGame, makeAttacker } from './helpers/enemy-world.js';
import { collidesWithTerrain } from '../src/js/utils/Physics.js';
import { TILE_SIZE as T } from '../src/js/utils/Constants.js';

/** 幅 30・高さ 24。床は row 20、列 cWall より右（cWall を含む）は全部岩、row ceilRows 未満は全部岩 */
function rows({ wallFrom = 99, wallTo = -1, ceilRows = 0 } = {}) {
    const out = [];
    for (let r = 0; r < 24; r++) {
        let s = '';
        for (let c = 0; c < 30; c++) {
            const solid = r >= 20 || r < ceilRows || (c >= wallFrom) || (c <= wallTo);
            s += solid ? '#' : '.';
        }
        out.push(s);
    }
    return out;
}

function world(rowSpec) {
    const game = makeGame(makeMap(rows(rowSpec)));
    game.camera = { x: 0, y: 0, shake() {} };
    game.canvas = { width: 1024, height: 768 };
    return game;
}

/** 動かない的。押し出しは alive と矩形と vx しか見ない */
function dummy(game, x, y, w, h) {
    const e = { alive: true, x, y, width: w, height: h, vx: 0, vy: 0 };
    game.enemies.push(e);
    return e;
}

test('自機が左へ飛ばされて敵に重なっても、敵の向こう側の壁の中へは押し出されない', () => {
    // 列 12 から右が壁（x = 192）。敵の右の縁を壁の 4px 手前に置き、自機は敵にほぼ重ねて左へ動かす。
    // 押し出しは自機を「敵の右の縁」へ置くので、自機の幅ぶん壁に入っていた
    const game = world({ wallFrom: 12 });
    const p = new Player(game, 0, 0);
    game.player = p;
    const e = dummy(game, 0, 0, 16, 24);
    e.x = 12 * T - 4 - e.width;
    e.y = 20 * T - e.height;
    p.x = 12 * T - 4 - p.width;
    p.y = 20 * T - p.height;
    p.vx = -1.5;   // ノックバックで左へ
    p.onGround = true;
    assert.equal(collidesWithTerrain(p, game.map), false, '前提: 動く前は岩の外');
    p._moveAndCollide();
    assert.equal(collidesWithTerrain(p, game.map), false, `壁の中 (${p.x}, ${p.y})`);
});

test('自機が敵の頭に乗っても、天井の中へは押し上げられない', () => {
    // 天井は row 10 まで（下端 y = 160）。敵の頭は「自機が乗ると頭が天井に 4px 入る」高さ
    const game = world({ ceilRows: 10 });
    const p = new Player(game, 0, 0);
    game.player = p;
    const e = dummy(game, 100, 0, 16, 24);
    e.y = 10 * T + p.height - 4;
    p.x = 100;
    p.y = 10 * T;          // 頭は天井の下端ちょうど＝岩の外。足は敵の頭に 4px 重なっている
    p.vy = 0.5;            // 落ちてきた
    p.onGround = false;
    assert.equal(collidesWithTerrain(p, game.map), false, '前提: 動く前は岩の外');
    p._moveAndCollide();
    assert.equal(collidesWithTerrain(p, game.map), false, `天井の中 (${p.x}, ${p.y})`);
});

test('アタッカーが右へ飛ばされて自機に重なっても、自機の向こう側の壁の中へは押し出されない', () => {
    // 列 4 から左が壁（右の面 x = 80）。自機の左の縁を壁の 2px 先に置き、アタッカーはその上に重ねて右へ動かす。
    // 押し出しはアタッカーを「自機の左の縁」の左へ置くので、壁に入っていた
    const game = world({ wallTo: 4 });
    const a = makeAttacker(game, 0, 0, 'standard');
    const p = new Player(game, 0, 0);
    game.player = p;
    p.x = 5 * T + 2;
    p.y = 20 * T - p.height;
    a.x = 5 * T + 1;
    a.y = 20 * T - a.height;
    a.vx = 1.5;
    a.vy = 0;
    a.onGround = true;
    assert.equal(collidesWithTerrain(a, game.map), false, '前提: 動く前は岩の外');
    a._moveAndCollide();
    assert.equal(collidesWithTerrain(a, game.map), false, `壁の中 (${a.x}, ${a.y})`);
});

test('アタッカーが他の機体の頭に乗っても、天井の中へは押し上げられない', () => {
    const game = world({ ceilRows: 10 });
    const a = makeAttacker(game, 0, 0, 'standard');
    const other = dummy(game, 100, 0, 16, 24);
    other.y = 10 * T + a.height - 4;
    a.x = 100;
    a.y = 10 * T;
    a.vx = 0;
    a.vy = 0.5;
    a.onGround = false;
    assert.equal(collidesWithTerrain(a, game.map), false, '前提: 動く前は岩の外');
    a._moveAndCollide();
    assert.equal(collidesWithTerrain(a, game.map), false, `天井の中 (${a.x}, ${a.y})`);
});

test('岩が無ければ、押し出しは今までどおり相手の縁へ置く（横・縦）', () => {
    const game = world();
    const p = new Player(game, 0, 0);
    game.player = p;
    const e = dummy(game, 100, 20 * T - 24, 16, 24);
    p.x = 104;
    p.y = 20 * T - p.height;
    p.vx = -1.5;
    p.onGround = true;
    p._moveAndCollide();
    assert.equal(p.x, e.x + e.width, '横: 敵の右の縁へ');

    const q = new Player(game, 0, 0);
    game.player = q;
    const f = dummy(game, 300, 100, 16, 24);
    q.x = 300;
    q.y = 100 - q.height + 2;
    q.vy = 0.5;
    q.onGround = false;
    q._moveAndCollide();
    assert.equal(q.y, f.y - q.height, '縦: 敵の頭の上へ');
    assert.equal(q.onGround, true);
});

// 壁に当たったときの吸着。縁から 2px 内側の点で当てるので、2px/フレームより速く当たると動く前の位置が
// すでに境目の向こうにあり、切り上げ（切り捨て）で壁から1タイル離れた所へ吸着していた。狭い所では
// それが反対側の壁の中になる（rival の反動 2.6・ドローン 3.0。本物の3面で4件）
for (const dir of [-1, 1]) {
    test(`アタッカーが ${dir < 0 ? '左' : '右'}の壁へ速く飛ばされても、1タイル跳ね返らず壁の面で止まり、反対側の壁に入らない`, () => {
        // 幅2タイルの縦穴（列 5〜6、x = 80〜112）。アタッカー（幅 16 前後）は穴の中で左右どちらかの壁の近くにいる
        const game = world({ wallTo: 4, wallFrom: 7 });
        const a = makeAttacker(game, 0, 0, 'rival');
        a.y = 20 * T - a.height;
        // 縁が壁の面から 0.3px 離れた所。2.6px 動くと縁から 2px 内側の点が壁に入って当たるが、動く前の
        // 位置は境目の向こうなので、切り上げ（切り捨て）だと次の境目へ行く
        a.x = dir < 0 ? 5 * T + 0.3 : 7 * T - a.width - 0.3;
        a.vx = dir * 2.6;
        a.vy = 0;
        a.onGround = true;
        assert.equal(collidesWithTerrain(a, game.map), false, '前提: 動く前は岩の外');
        a._moveAndCollide();
        assert.equal(collidesWithTerrain(a, game.map), false, `岩の中 (${a.x})`);
        const face = dir < 0 ? 5 * T : 7 * T;
        const edge = dir < 0 ? a.x : a.x + a.width;
        assert.ok(Math.abs(edge - face) < 0.1, `壁の面 ${face} で止まっていない: 縁 ${edge}`);
    });
}

// 母艦の押し出しも同じ規則（2026-10-31、ユーザーの指示「母艦の押し出しも同じように」）。
// 本物の地図の計測では0件だったが、作りは機体どうしと同じで、壁際・天井際・床際で母艦と重なると岩に入る

/** 母艦の押し出しが読むのは矩形・速度・甲板の左右だけ（Carrier の値と同じ） */
function carrierAt(game, x, y, vx = 0) {
    const c = { game, alive: true, x, y, width: 64, height: 32, vx, vy: 0, platformLeft: 16, platformRight: 48 };
    game.carrier = c;
    return c;
}

test('右へ動く母艦に押されても、自機は右の壁の中へ押し出されない', () => {
    // 列 12 から右が壁（x = 192）。自機は壁に接して立ち、母艦は左から 3px 重なって右へ動いている
    const game = world({ wallFrom: 12 });
    const p = new Player(game, 0, 0);
    game.player = p;
    p.x = 12 * T - p.width;
    p.y = 20 * T - p.height;
    p.vx = 0;
    p.onGround = true;
    carrierAt(game, p.x + 3 - 64, 20 * T - 32, 1);
    assert.equal(collidesWithTerrain(p, game.map), false, '前提: 動く前は岩の外');
    p._moveAndCollide();
    assert.equal(collidesWithTerrain(p, game.map), false, `壁の中 (${p.x}, ${p.y})`);
});

test('左へ動く母艦（Carrier._pushPlayer）に押されても、自機は左の壁の中へ押し出されない', () => {
    // 列 4 から左が壁（右の面 x = 80）。自機は壁の 1px 先に立ち、母艦は右から 6px 重なって左へ動いている
    const game = world({ wallTo: 4 });
    const p = new Player(game, 0, 0);
    game.player = p;
    p.x = 5 * T + 1;
    p.y = 20 * T - p.height;
    const c = carrierAt(game, p.x + p.width - 6, 20 * T - 32, -1);
    assert.equal(collidesWithTerrain(p, game.map), false, '前提: 押される前は岩の外');
    Carrier.prototype._pushPlayer.call(c);
    assert.equal(collidesWithTerrain(p, game.map), false, `壁の中 (${p.x}, ${p.y})`);
});

test('自機が母艦の甲板に降りても、天井の中へは押し上げられない', () => {
    // 天井の下端は y = 160。甲板は「自機が乗ると頭が天井に 4px 入る」高さ
    const game = world({ ceilRows: 10 });
    const p = new Player(game, 0, 0);
    game.player = p;
    const c = carrierAt(game, 100, 10 * T + p.height - 4);
    p.x = c.x + 24;
    p.y = 10 * T;
    p.vy = 0.5;
    p.onGround = false;
    assert.equal(collidesWithTerrain(p, game.map), false, '前提: 動く前は岩の外');
    p._moveAndCollide();
    assert.equal(collidesWithTerrain(p, game.map), false, `天井の中 (${p.x}, ${p.y})`);
});

test('自機が下から母艦を持ち上げても、床の中へは押し下げられない', () => {
    // 床から上がり始めた自機の頭が母艦の底に 4px 入っている。頭を底に合わせると足が床に 4px 入る
    const game = world();
    const p = new Player(game, 0, 0);
    game.player = p;
    p.x = 100;
    p.y = 20 * T - p.height;
    p.vy = -0.5;
    p.onGround = false;
    const c = carrierAt(game, 90, 20 * T - p.height + 4 - 32);
    assert.equal(collidesWithTerrain(p, game.map), false, '前提: 動く前は岩の外');
    p._moveAndCollide();
    assert.equal(collidesWithTerrain(p, game.map), false, `床の中 (${p.x}, ${p.y})`);
    assert.equal(c.vy, 0, '押し下げを断ったら母艦も持ち上げない');
});

test('岩が無ければ、母艦の押し出しは今までどおり（横・甲板・持ち上げ）', () => {
    const game = world();
    const p = new Player(game, 0, 0);
    game.player = p;
    p.x = 200;
    p.y = 20 * T - p.height;
    p.vx = 0;
    p.onGround = true;
    const c = carrierAt(game, 200 + 3 - 64, 20 * T - 32, 1);
    p._moveAndCollide();
    assert.equal(p.x, c.x + c.width, '横: 母艦の右の縁へ');

    const q = new Player(game, 0, 0);
    game.player = q;
    const d = carrierAt(game, 300, 100);
    q.x = d.x + 24;
    q.y = 100 - q.height + 2;
    q.vy = 0.5;
    q.onGround = false;
    q._moveAndCollide();
    assert.equal(q.y, d.y - q.height, '甲板: 甲板の上へ');
    assert.equal(q.onGround, true);

    const r = new Player(game, 0, 0);
    game.player = r;
    r.x = 400;
    r.y = 200;
    r.vy = -1;
    r.onGround = false;
    const e = carrierAt(game, 390, 200 + 3 - 32);
    r._moveAndCollide();
    assert.equal(r.y, e.y + e.height, '持ち上げ: 頭を母艦の底へ');
    assert.ok(e.vy < 0, '母艦が持ち上がる');
});
