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

// ------------------------------------------------------------------
// 参照実装との突き合わせ
//
// 現行（キャッシュ導入前）の遅い実装を tests/helpers/water-reference.js に
// 写してあり、それを「答え」としてキャッシュと全セル比べる。期待値を実装から
// 導かないためにファイルを分けている。
// ------------------------------------------------------------------

import { referenceKindAt, referenceSurfaceYAll } from './helpers/water-reference.js';
import { stepWaterSimulation } from '../src/js/world/waterSimulation.js';

/** 種を決めた線形合同法。node --test に乱数を持ち込まないため */
function makeRng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function randomWorld(seed) {
    const rng = makeRng(seed);
    const rows = 20, cols = 24;
    const solid = new Uint8Array(rows * cols);
    const water = new Uint8Array(rows * cols);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const edge = (r === 0 || r === rows - 1 || c === 0 || c === cols - 1);
            if (edge || rng() < 0.22) solid[r * cols + c] = 1;
        }
    }
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (solid[r * cols + c]) continue;
            if (rng() < 0.45) water[r * cols + c] = 1 + Math.floor(rng() * MAX_WATER_MASS);
        }
    }
    const isSolid = (r, c) =>
        (r < 0 || r >= rows || c < 0 || c >= cols) ? true : solid[r * cols + c] === 1;
    return { rows, cols, water, isSolid };
}

function buildCache(ctx) {
    const kind = new Uint8Array(ctx.rows * ctx.cols);
    const surfaceY = new Int16Array(ctx.rows * ctx.cols).fill(-1);
    rebuildWaterCache({ ...ctx, kind, surfaceY, dirtyCols: [...Array(ctx.cols).keys()] });
    return { kind, surfaceY };
}

function assertMatchesReference(ctx, cache, label) {
    const refY = referenceSurfaceYAll(ctx);
    for (let r = 0; r < ctx.rows; r++) {
        for (let c = 0; c < ctx.cols; c++) {
            const k = r * ctx.cols + c;
            assert.equal(cache.kind[k], referenceKindAt(ctx, r, c),
                `${label}: kind が (${r},${c}) で食い違う`);
            assert.equal(cache.surfaceY[k], refY[k],
                `${label}: surfaceY が (${r},${c}) で食い違う`);
        }
    }
}

test('ランダムな地形と水量 40通りで、キャッシュが参照実装と全セル一致する', () => {
    for (let seed = 1; seed <= 40; seed++) {
        const ctx = randomWorld(seed);
        assertMatchesReference(ctx, buildCache(ctx), `seed ${seed}`);
    }
});

test('水を動かしたあとも、変化した列だけ作り直せば参照実装と一致する', () => {
    for (let seed = 1; seed <= 20; seed++) {
        const ctx = randomWorld(seed);
        const cache = buildCache(ctx);

        let active = new Set();
        for (let i = 0; i < ctx.rows * ctx.cols; i++) if (ctx.water[i] > 0) active.add(i);

        for (let step = 0; step < 30 && active.size; step++) {
            const res = stepWaterSimulation({
                water: ctx.water, rows: ctx.rows, cols: ctx.cols,
                isSolid: ctx.isSolid, activeCells: active, doFall: true,
            });
            active = res.nextActiveCells;
            const dirty = new Set(res.changedCells.map(([, c]) => c));
            rebuildWaterCache({
                ...ctx, kind: cache.kind, surfaceY: cache.surfaceY, dirtyCols: dirty,
            });
            assertMatchesReference(ctx, cache, `seed ${seed} step ${step}`);
        }
    }
});

test('湖底のブロックを壊しても、湖の内部に滝（縦縞）が現れない', () => {
    // 以前は滝判定が「自分より下のどこかに空気がある」だったため、湖底に
    // 穴が開いた瞬間、水が1ドットも動いていないのに、その列が水面まで
    // 全部「滝」と判定されて 8px の細帯で描かれていた（湖を貫く縦縞）。
    // 穴が埋まるにつれ空気の位置が下がるので、縞が波打って水面へ移動して
    // いくように見えた。水面もそこで途切れてセグメントが2つに割れていた。
    const rows = 12, cols = 14;
    const solid = new Uint8Array(rows * cols);
    for (let c = 0; c < cols; c++) { solid[c] = 1; solid[(rows - 1) * cols + c] = 1; }
    for (let r = 0; r < rows; r++) { solid[r * cols] = 1; solid[r * cols + cols - 1] = 1; }
    for (let c = 1; c < cols - 1; c++) solid[7 * cols + c] = 1;  // 湖底

    const water = new Uint8Array(rows * cols);
    for (let r = 2; r <= 6; r++) {
        for (let c = 1; c < cols - 1; c++) water[r * cols + c] = MAX_WATER_MASS;
    }
    const isSolid = (r, c) =>
        (r < 0 || r >= rows || c < 0 || c >= cols) ? true : solid[r * cols + c] === 1;

    const kind = new Uint8Array(rows * cols);
    const surfaceY = new Int16Array(rows * cols).fill(-1);
    const all = [...Array(cols).keys()];
    rebuildWaterCache({ water, kind, surfaceY, rows, cols, isSolid, dirtyCols: all });

    // 湖底 (7, 6) を破壊
    solid[7 * cols + 6] = 0;
    rebuildWaterCache({ water, kind, surfaceY, rows, cols, isSolid, dirtyCols: all });

    for (let r = 2; r <= 6; r++) {
        for (let c = 1; c < cols - 1; c++) {
            assert.notEqual(kind[r * cols + c], WATER_FALL,
                `(${r},${c}) が滝と判定された（湖を貫く縦縞の再発）`);
        }
    }

    // 水面が縦縞で分断されていないこと＝行2 の液面が全列で同じ値
    const y = surfaceY[2 * cols + 1];
    for (let c = 1; c < cols - 1; c++) {
        assert.equal(surfaceY[2 * cols + c], y,
            `水面が (2,${c}) で分断され、液面がずれている`);
    }
});

test('つながった水たまりの液面は、上の行が全幅を覆えなくても段差にならない', () => {
    // 水量は8段階に量子化されているので、ひとつの水たまりでも一番上の行が
    // 全幅を覆えないことがある。行ごとに平均すると液面が2つに割れて
    // 「つながっているはずの液面に段差」ができる（実機の指摘。実測で
    // 左が 46px、右が 48px に割れていた）。
    const m = fromArt(`
        ##############
        #............#
        #45678888....#
        #88888888888.#
        ##############
    `);
    const ys = [];
    for (let c = 1; c <= 11; c++) {
        for (let r = 0; r < m.rows; r++) {
            if (m.kind[r * m.cols + c] === WATER_SURFACE) { ys.push(m.surfaceY[r * m.cols + c]); break; }
        }
    }
    assert.equal(ys.length, 11, '列1..11 それぞれに水面セルがあるはず');
    for (const y of ys) {
        assert.equal(y, ys[0], `液面が段差になっている: ${ys.join(',')}`);
    }
});

test('岩の縁を挟んで高さが違う水は、隣の列でも繋がらない', () => {
    // 「段差をまたいで繋ぐ」を入れたことで、別々の水まで繋げてしまわないこと。
    // (2,3) は岩 (3,3) の上に乗った水、(3,4) はその1段下の水。列は隣どうしで
    // 行差も1だが、深いほうの行 (3,3) が岩なので同じ水たまりではない。
    const m = fromArt(`
        ##########
        #........#
        #..4.....#
        #..#4....#
        #..#8....#
        ##########
    `);
    assert.equal(m.kind[2 * m.cols + 3], WATER_SURFACE, '(2,3) は岩の上の水面');
    assert.equal(m.kind[3 * m.cols + 4], WATER_SURFACE, '(3,4) は1段下の水面');
    assert.notEqual(m.surfaceY[2 * m.cols + 3], m.surfaceY[3 * m.cols + 4],
        '岩の縁で隔てられた水の液面が繋がってしまっている');
});

test('浮いた岩の真下でも、満ちていない水は水面として扱う（波の線が途切れない）', () => {
    // 実機の指摘: 浮いた岩の下だけ波の線が描かれず、段差に見えていた。
    // 天井が岩でも、満水でなければ「天井に張り付いた水」ではなく、実際に
    // 見える液面がある（実機の指摘）
    const m = fromArt(`
        ..........
        ....####..
        4444444444
        8888888888
    `);
    // 岩の真下(行2, 列4-7)も、水面側(列0-3)と同じ水面として扱われ、
    // 同じ液面の高さに揃うべき
    const outsideY = m.surfaceY[2 * m.cols + 1];
    for (let c = 4; c <= 7; c++) {
        assert.equal(m.kind[2 * m.cols + c], WATER_SURFACE, `列${c}(岩の真下)が水面として扱われていない`);
        assert.equal(m.surfaceY[2 * m.cols + c], outsideY, `列${c}の液面が水面側と揃っていない`);
    }
});

test('浮いた岩の真下でも、満水なら従来どおり水面を持たない（タイル全体でよい）', () => {
    const m = fromArt(`
        ..........
        ....####..
        8888888888
    `);
    for (let c = 4; c <= 7; c++) {
        assert.equal(m.kind[2 * m.cols + c], WATER_BODY, `列${c}(満水・岩の真下)は水中のはず`);
    }
});

test('完全に岩に囲まれ、開けた水面と繋がらない孤立した水だまりは水面にしない', () => {
    // 実機の指摘: 岩の先細った先端の下に、量子化の残りかすのような孤立した
    // 浅い水だまりがあると、そこだけ独立した波の線が浮いて不自然に見えた。
    // 「天井が岩でも満ちていなければ水面」というルールは、開けた水面と
    // つながっている（levelSurfaceSegment で同じかたまりになる）ときだけ
    // 適用すべきで、かたまりの中に一つも「本当に開けた」セルが無いなら
    // 水面として扱わない（見た目には水中セルとして塗るだけでよい）。
    const m = fromArt(`
        ##########
        ##4#4#####
        ##########
    `);
    assert.equal(m.kind[1 * m.cols + 2], WATER_BODY, '開けた水面と繋がらない孤立した水は水面にしない');
    assert.equal(m.kind[1 * m.cols + 4], WATER_BODY, '開けた水面と繋がらない孤立した水は水面にしない');
    assert.equal(m.surfaceY[1 * m.cols + 2], -1);
});
