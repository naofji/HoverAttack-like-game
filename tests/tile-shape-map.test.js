// Map に焼いたタイルの形と、形で当てる問い合わせのテスト。
// 5面以外は今のタイル単位の判定（isSolid / isSolidAtPixel）と完全に同じ答えになることを、
// 本物の地図で縛る（設計 5節「5面以外の面では…ビット単位で同じ結果」）。
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { TILE_SIZE, BLOCK_EMPTY, BLOCK_NORMAL, BLOCK_INDESTRUCTIBLE, BLOCK_METAL } from '../src/js/utils/Constants.js';
import {
    Q_EMPTY, Q_TRI_NO_TL, Q_TRI_NO_TR, Q_TRI_NO_BL, Q_TRI_NO_BR, Q_FULL,
    packShape, unpackShape, SHAPE_EMPTY, SHAPE_FULL,
} from '../src/js/utils/tileShape.js';

before(() => {
    const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

const T = TILE_SIZE;
const buildMap = async (seed, level) => {
    const { Map } = await import('../src/js/world/Map.js');
    return new Map({ rng: new SeededRNG(seed) }, level);
};

/** 今のタイル単位の判定で書いた矩形の参照（半開区間 [x, x+w) × [y, y+h)） */
function refRectHits(map, x, y, w, h) {
    const c0 = Math.floor(x / T), c1 = Math.ceil((x + w) / T) - 1;
    const r0 = Math.floor(y / T), r1 = Math.ceil((y + h) / T) - 1;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (map.isSolid(r, c)) return true;
    return false;
}

for (const level of [0, 1, 2, 3, 5, 6]) {
    test(`${level + 1}面: 形はすべて満ちか空で、点・矩形の問い合わせは今のタイル単位の判定と同じ`, async () => {
        for (const seed of [7, 2026]) {
            const map = await buildMap(seed, level);
            assert.equal(map.tileShapeRule, 'square');
            for (let r = 0; r < map.rows; r++) {
                for (let c = 0; c < map.cols; c++) {
                    assert.equal(map.tileShapeAt(r, c), map.isSolid(r, c) ? SHAPE_FULL : SHAPE_EMPTY);
                }
            }
            const rng = new SeededRNG(seed * 31 + level);
            const W = map.cols * T, H = map.rows * T;
            for (let i = 0; i < 2000; i++) {
                // 4回に1回はタイルの境目ちょうど、それ以外は地図の外へ 32px はみ出す範囲の実数
                const snap = i % 4 === 0;
                const x = snap ? Math.floor(rng.next() * (map.cols + 4) - 2) * T : rng.next() * (W + 64) - 32;
                const y = snap ? Math.floor(rng.next() * (map.rows + 4) - 2) * T : rng.next() * (H + 64) - 32;
                assert.equal(map.isSolidPoint(x, y), map.isSolidAtPixel(x, y), `点 (${x}, ${y})`);
                const w = snap ? T * (1 + Math.floor(rng.next() * 2)) : 1 + rng.next() * 39;
                const h = snap ? T * (1 + Math.floor(rng.next() * 2)) : 1 + rng.next() * 39;
                assert.equal(map.rectHitsTerrain(x, y, w, h), refRectHits(map, x, y, w, h), `矩形 (${x}, ${y}, ${w}, ${h})`);
            }
        }
    });
}

test('5面: 階段の途中の段はタイル1枚ぶんの斜めになり、磨き仕上げは満ちのまま', async () => {
    const map = await buildMap(7, 4);
    assert.equal(map.tileShapeRule, 'snowSlope');
    assert.ok(map.stairs.length > 0, '階段が無い');
    let checked = 0;
    for (const s of map.stairs) {
        // 両端の段は隣の地形しだいで面取りにもなるので、途中の段だけ見る
        for (let i = 1; i < s.length - 1; i++) {
            const q = unpackShape(map.tileShapeAt(s.r - i, s.c + s.dir * i));
            const expected = s.dir === 1 ? [Q_EMPTY, Q_TRI_NO_TL, Q_TRI_NO_TL, Q_FULL] : [Q_TRI_NO_TR, Q_EMPTY, Q_FULL, Q_TRI_NO_TR];
            assert.deepEqual(q, expected, `段 ${JSON.stringify(s)} の ${i} 段目`);
            checked++;
        }
    }
    assert.ok(checked > 0);
    for (let r = 0; r < map.rows; r++) {
        for (let c = 0; c < map.cols; c++) {
            const b = map.grid[r][c];
            if (b === BLOCK_INDESTRUCTIBLE || b === BLOCK_METAL) assert.equal(map.tileShapeAt(r, c), SHAPE_FULL);
        }
    }
});

/** 本物の生成をせずに、格子だけを持つ5面の地図もどき */
async function fakeSnowMap(rows) {
    const { Map } = await import('../src/js/world/Map.js');
    const m = Object.create(Map.prototype);
    m.grid = rows.map((s) => s.split('').map((ch) => (ch === '#' ? BLOCK_NORMAL : ch === 'P' ? BLOCK_INDESTRUCTIBLE : BLOCK_EMPTY)));
    m.blockHP = m.grid.map((row) => row.map((b) => (b === BLOCK_EMPTY ? 0 : 1)));
    m.rows = m.grid.length; m.cols = m.grid[0].length;
    m.water = null; m.town = null;
    m.invalidateTileRegion = () => {};
    m.tileShapeRule = 'snowSlope';
    m._buildTileShapes();
    return m;
}

test('板の左を壊すと、右は位置を変えずに菱形になり、左は空になる', async () => {
    const m = await fakeSnowMap(['......', '.##...', '......']);
    assert.equal(m.tileShapeAt(1, 2), packShape(Q_FULL, Q_TRI_NO_TR, Q_FULL, Q_TRI_NO_BR));
    assert.equal(m.damageBlock(1, 1, 99), true);
    assert.equal(m.tileShapeAt(1, 1), SHAPE_EMPTY);
    assert.equal(m.tileShapeAt(1, 2), packShape(Q_TRI_NO_TL, Q_TRI_NO_TR, Q_TRI_NO_BL, Q_TRI_NO_BR));
});

test('段差の下の岩を壊すと、そこに新しい斜面ができる', async () => {
    // (2,3) を壊すと (2,4) の左が開き、左下 (3,3) が岩なので斜めになる
    const m = await fakeSnowMap(['......', '......', '...###', '######']);
    assert.equal(m.tileShapeAt(2, 4), SHAPE_FULL);
    m.damageBlock(2, 3, 99);
    assert.equal(m.tileShapeAt(2, 4), packShape(Q_EMPTY, Q_TRI_NO_TL, Q_TRI_NO_TL, Q_FULL));
});

test('上の岩を壊すと下のタイルの角が、斜めの隣を壊すと坂が作り直される（3x3 すべて）', async () => {
    // 2x2 の浮いた塊の左上を壊すと、その下 (2,1) の上が開いて左上の角が面取りになる
    const a = await fakeSnowMap(['....', '.##.', '.##.', '....']);
    assert.equal(a.tileShapeAt(2, 1), packShape(Q_FULL, Q_FULL, Q_TRI_NO_BL, Q_FULL));
    a.damageBlock(1, 1, 99);
    assert.equal(a.tileShapeAt(2, 1), packShape(Q_TRI_NO_TL, Q_FULL, Q_TRI_NO_BL, Q_FULL));
    // 段 (1,2) の左下 (2,1) を壊すと段が続かなくなり、斜めから小さい面取りに戻る
    const b = await fakeSnowMap(['....', '..##', '####']);
    assert.equal(b.tileShapeAt(1, 2), packShape(Q_EMPTY, Q_TRI_NO_TL, Q_TRI_NO_TL, Q_FULL));
    b.damageBlock(2, 1, 99);
    assert.equal(b.tileShapeAt(1, 2), packShape(Q_TRI_NO_TL, Q_FULL, Q_FULL, Q_FULL));
});

test('地図の端で壊しても例外を投げない。磨き仕上げの隣で壊しても磨きは満ちのまま', async () => {
    const m = await fakeSnowMap(['#P#', '###', '###']);
    assert.doesNotThrow(() => m.damageBlock(0, 0, 99));
    assert.doesNotThrow(() => m.damageBlock(0, 2, 99));
    assert.equal(m.tileShapeAt(0, 1), SHAPE_FULL);
});

test('tileShapes を持たない偽オブジェクトへ bind した damageBlock も例外を投げない', async () => {
    const { Map } = await import('../src/js/world/Map.js');
    const self = {
        rows: 2, cols: 2,
        grid: [[BLOCK_NORMAL, BLOCK_NORMAL], [BLOCK_NORMAL, BLOCK_NORMAL]],
        blockHP: [[1, 1], [1, 1]],
        water: null,
        invalidateTileRegion() {},
    };
    assert.equal(Map.prototype.damageBlock.bind(self)(0, 0, 1), true);
});

test('地図の外と NaN は岩と答える', async () => {
    const m = await fakeSnowMap(['...', '...', '...']);
    assert.equal(m.isSolidPoint(NaN, 0), true);
    assert.equal(m.isSolidPoint(-1, 10), true);
    assert.equal(m.isSolidPoint(10, 3 * T), true);
    assert.equal(m.isSolidPoint(10, 10), false);
    assert.equal(m.rectHitsTerrain(-5, 10, 10, 10), true);
    assert.equal(m.rectHitsTerrain(2, 2, 10, 10), false);
    assert.equal(m.tileShapeAt(-1, 0), SHAPE_FULL);
    assert.equal(m.tileShapeAt(NaN, 0), SHAPE_FULL);
});

test('問い合わせは形で答える: 斜めの段の上の空中は空、斜辺の下は岩', async () => {
    const m = await fakeSnowMap(['......', '......', '..####', '######']);
    // (2,2) は斜め（斜辺 y = 2T + 16 − lx）
    assert.equal(m.isSolidPoint(2 * T + 4, 2 * T + 11), false);
    assert.equal(m.isSolidPoint(2 * T + 4, 2 * T + 12), true);
    assert.equal(m.rectHitsTerrain(2 * T, 2 * T, 4, 4), false);    // 空の象限
    assert.equal(m.rectHitsTerrain(2 * T + 2, 2 * T + 2, 6, 12), true);
});

test('terrainTopY / terrainBottomY は斜辺の高さを返し、岩が無ければ null', async () => {
    const m = await fakeSnowMap(['......', '......', '..####', '######']);
    const x = 2 * T + 4;
    assert.equal(m.terrainTopY(x, 0, 4 * T - 1), 2 * T + 12);
    assert.equal(m.terrainTopY(x, 0, 2 * T + 11), null);           // 斜辺まで届かない
    assert.equal(m.terrainTopY(x, 2 * T + 13, 4 * T - 1), 2 * T + 13); // 岩の中から始めればそこ
    const c = await fakeSnowMap(['######', '..####', '......', '......']);
    // (1,2) は天井側の斜め（斜辺 y = T + lx、岩は右上）。下から上へ見る
    assert.equal(c.terrainBottomY(x, 4 * T - 1, 0), T + 4);
    assert.equal(c.terrainBottomY(x, 4 * T - 1, T + 5), null);
});

test('形の焼き込みは乱数を使わない（5面の地図を作ったあとの game.rng が同じ）', async () => {
    const { Map } = await import('../src/js/world/Map.js');
    const a = { rng: new SeededRNG(11) };
    new Map(a, 4);
    const orig = Map.prototype._buildTileShapes;
    Map.prototype._buildTileShapes = function () {};
    try {
        const b = { rng: new SeededRNG(11) };
        new Map(b, 4);
        assert.equal(a.rng.state, b.rng.state);
    } finally {
        Map.prototype._buildTileShapes = orig;
    }
});
