import test from 'node:test';
import assert from 'node:assert';
import {
    WATER_NONE, WATER_BODY, WATER_SURFACE, WATER_FALL,
    rebuildWaterCache,
} from '../src/js/world/waterQuery.js';
import { MAX_WATER_MASS, TILE_SIZE } from '../src/js/utils/Constants.js';

/** 文字の絵から水マップを作る。'#'=岩 '.'=空 数字=水量 */
function fromArt(art) {
    const lines = art.trim().split('\n').map((s) => s.trim());
    const rows = lines.length;
    const cols = lines[0].length;
    const solid = new Uint8Array(rows * cols);
    const water = new Uint8Array(rows * cols);
    lines.forEach((ln, r) => [...ln].forEach((ch, c) => {
        if (ch === '#') solid[r * cols + c] = 1;
        else if (ch >= '1' && ch <= '8') water[r * cols + c] = Number(ch);
    }));
    const isSolid = (r, c) =>
        (r < 0 || r >= rows || c < 0 || c >= cols) ? true : solid[r * cols + c] === 1;
    const kind = new Uint8Array(rows * cols);
    const surfaceY = new Int16Array(rows * cols).fill(-1);
    rebuildWaterCache({
        water, kind, surfaceY, rows, cols, isSolid,
        dirtyCols: [...Array(cols).keys()],
    });
    return { rows, cols, water, kind, surfaceY, isSolid };
}

test('満水の湖: 一番上の行だけが水面で、中は水中。滝はひとつも無い', () => {
    const m = fromArt(`
        ##########
        #........#
        #88888888#
        #88888888#
        ##########
    `);
    const at = (r, c) => m.kind[r * m.cols + c];
    assert.equal(at(2, 3), WATER_SURFACE, '行2 は空気の直下なので水面');
    assert.equal(at(3, 3), WATER_BODY, '行3 は上が水なので水中');
    assert.equal(at(1, 3), WATER_NONE, '行1 は水が無い');
    for (let r = 0; r < m.rows; r++) {
        for (let c = 0; c < m.cols; c++) {
            assert.notEqual(m.kind[r * m.cols + c], WATER_FALL, `(${r},${c}) が滝になっている`);
        }
    }
});

test('落下中の水柱: 満水未満が縦に並んだところだけが滝。床の直上は水面', () => {
    const m = fromArt(`
        ##########
        #...4....#
        #...4....#
        #...4....#
        ##########
    `);
    const at = (r, c) => m.kind[r * m.cols + c];
    assert.equal(at(1, 4), WATER_FALL, '(1,4) は自分も直下も満水未満なので滝');
    assert.equal(at(2, 4), WATER_FALL, '(2,4) も滝');
    assert.equal(at(3, 4), WATER_SURFACE, '(3,4) は直下が床なので滝ではなく水面');
});

test('満水のセルは、直下が満水未満でも滝にしない（ルールB との違い）', () => {
    // 採用したルールC は「自分**も**直下も満水未満」。ここを「直下が満水未満」
    // だけにすると（ルールB）、レベリングの途中で下の行が一時的に 7 になった
    // 瞬間に上の満水セルが滝と判定され、湖の内部に縦縞が湧いて激しく点滅する
    // （実測: 湖底の爆破120フレームで往復865回。C は 0回）。
    // 満水セルは「落ち着いた水」であって落下中ではない、というのがルールC の要。
    const m = fromArt(`
        ######
        #....#
        #88..#
        #44..#
        ######
    `);
    const at = (r, c) => m.kind[r * m.cols + c];
    assert.equal(at(2, 1), WATER_SURFACE, '(2,1) は満水なので滝ではなく水面');
    assert.equal(at(2, 2), WATER_SURFACE, '(2,2) も同じ');
    assert.equal(at(3, 1), WATER_BODY, '(3,1) は直下が床で、上が水なので水中');
});

test('天井に張り付いた水は水面ではない（水中扱い）', () => {
    const m = fromArt(`
        ##########
        #####8####
        #####8####
        ##########
    `);
    assert.equal(m.kind[1 * m.cols + 5], WATER_BODY, '直上が岩なので水面にしない');
});

test('水面の Y は行セグメント全体の平均で、セグメント全員に同じ値が入る', () => {
    // 行2 に 8,8,4,4 の水面。平均 rawY = ((3-1)+(3-1)+(3-0.5)+(3-0.5))/4 * 16
    const m = fromArt(`
        ######
        #....#
        #8844#
        #8888#
        ######
    `);
    const expected = Math.round(((3 - 1) + (3 - 1) + (3 - 0.5) + (3 - 0.5)) / 4 * TILE_SIZE);
    for (let c = 1; c <= 4; c++) {
        assert.equal(m.kind[2 * m.cols + c], WATER_SURFACE, `(2,${c}) は水面`);
        assert.equal(m.surfaceY[2 * m.cols + c], expected,
            `(2,${c}) の液面はセグメント平均 ${expected} であるべき`);
    }
});

test('岩で仕切られた2つの水たまりは別のセグメントとして平均される', () => {
    const m = fromArt(`
        ########
        #......#
        #44#88.#
        #88#88.#
        ########
    `);
    const left = m.surfaceY[2 * m.cols + 1];
    const right = m.surfaceY[2 * m.cols + 4];
    assert.equal(m.surfaceY[2 * m.cols + 2], left, '左の水たまりは同じ液面');
    assert.equal(m.surfaceY[2 * m.cols + 5], right, '右の水たまりは同じ液面');
    assert.notEqual(left, right, '岩で仕切られているので液面は別々になるはず');
});

test('滝のセルと水なしのセルの surfaceY は -1', () => {
    const m = fromArt(`
        ######
        #..4.#
        #..4.#
        ######
    `);
    assert.equal(m.surfaceY[1 * m.cols + 3], -1, '滝は液面を持たない');
    assert.equal(m.surfaceY[1 * m.cols + 1], -1, '水なしは液面を持たない');
});
