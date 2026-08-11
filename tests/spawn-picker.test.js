import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { TILE_SIZE } from '../src/js/utils/Constants.js';

// Map._generateMiniMap() が動くだけの最小の DOM スタブ
before(() => {
    const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
    globalThis.document = {
        createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }),
    };
});

/**
 * 敵とアイテムの配置は「候補を走査 → 全部混ぜる → 先頭n件 → ピクセル座標」
 * という1本の手順（_pickSpawnPositions）に統一してある。
 *
 * ここで縛りたいのは、その手順が消費する乱数の回数。必要数で打ち切ると
 * 消費回数が変わり、以降の生成がすべてずれて「同じ週なのに別のステージ」に
 * なる。MapDeterminism.test.js は同じ種で同じ結果になることを見るが、
 * こちらは消費回数そのものを見る。
 */

/** 乱数の消費回数を数える rng。 */
function countingRng(seed) {
    const rng = new SeededRNG(seed);
    const inner = rng.next.bind(rng);
    const counter = { draws: 0 };
    rng.next = () => { counter.draws++; return inner(); };
    return { rng, counter };
}

async function makeMap(seed, missionLevel = 2) {
    const { Map } = await import('../src/js/world/Map.js');
    const { rng, counter } = countingRng(seed);
    const map = new Map({ rng }, missionLevel);
    return { map, counter };
}

test('シャッフルは候補数-1 回ちょうど乱数を引く（必要数で打ち切らない）', async () => {
    const { map, counter } = await makeMap(42);

    // 候補が必要数よりずっと多い状況を作る（10個だけ欲しいが候補は数千）
    const candidatesSeen = [];
    const before = counter.draws;
    const spawns = map._pickSpawnPositions({
        rowFrom: 2, rowTo: map.rows - 2,
        colFrom: 2, colTo: map.cols - 2,
        startAreaRows: 0, startAreaCols: 0,
        accept: (r, c) => { candidatesSeen.push([r, c]); return true; },
        count: 10,
        width: 16, height: 16,
    });
    const used = counter.draws - before;

    assert.equal(spawns.length, 10, '必要数だけ返ること');
    assert.ok(candidatesSeen.length > 100, 'テストの前提: 候補が十分多いこと');
    assert.equal(
        used, candidatesSeen.length - 1,
        `候補 ${candidatesSeen.length} 件に対し ${used} 回引いている（候補数-1 であるべき）`,
    );
});

test('候補が必要数より少なくても、あるだけ返して落ちない', async () => {
    const { map } = await makeMap(7);
    const spawns = map._pickSpawnPositions({
        rowFrom: 5, rowTo: 7, colFrom: 5, colTo: 7,
        startAreaRows: 0, startAreaCols: 0,
        accept: () => true,
        count: 999,
        width: 16, height: 16,
    });
    assert.equal(spawns.length, 4, '2x2 の候補しか無いので4件');
});

test('候補がゼロなら乱数を引かずに空を返す', async () => {
    const { map, counter } = await makeMap(7);
    const before = counter.draws;
    const spawns = map._pickSpawnPositions({
        rowFrom: 5, rowTo: 10, colFrom: 5, colTo: 10,
        startAreaRows: 0, startAreaCols: 0,
        accept: () => false,
        count: 5,
        width: 16, height: 16,
    });
    assert.deepEqual(spawns, []);
    assert.equal(counter.draws - before, 0, '候補ゼロで乱数を消費している');
});

test('開始地点のまわりは候補から外れる', async () => {
    const { map } = await makeMap(7);
    const seen = [];
    map._pickSpawnPositions({
        rowFrom: 0, rowTo: 20, colFrom: 0, colTo: 20,
        startAreaRows: 16, startAreaCols: 20,
        accept: (r, c) => { seen.push([r, c]); return true; },
        count: 1,
        width: 16, height: 16,
    });
    assert.ok(
        seen.every(([r, c]) => !(r < 16 && c < 20)),
        '開始地点の除外範囲が候補に入っている',
    );
});

test('足元合わせと空中浮かせで y の求め方が変わる', async () => {
    const { map } = await makeMap(7);
    const spec = {
        rowFrom: 5, rowTo: 6, colFrom: 5, colTo: 6,
        startAreaRows: 0, startAreaCols: 0,
        accept: () => true, count: 1, width: 16, height: 24,
    };

    const onFloor = map._pickSpawnPositions({ ...spec })[0];
    const inAir = map._pickSpawnPositions({ ...spec, centerInTile: true })[0];

    // 床置き: タイルの下端に足が着く
    assert.equal(onFloor.y, 6 * TILE_SIZE - 24);
    // 空中: タイルの中央に機体の中心が来る
    assert.equal(inAir.y, 5 * TILE_SIZE + (TILE_SIZE - 24) / 2);
    // x はどちらもタイル中央寄せで同じ
    assert.equal(onFloor.x, inAir.x);
    assert.equal(onFloor.x, 5 * TILE_SIZE + (TILE_SIZE - 16) / 2);
});

test('同じ種なら配置も乱数の消費回数も同じ', async () => {
    const a = await makeMap(2026, 4);
    const b = await makeMap(2026, 4);
    assert.equal(a.counter.draws, b.counter.draws, '消費回数が違う');
    assert.deepEqual(a.map.enemyTankSpawns, b.map.enemyTankSpawns);
    assert.deepEqual(a.map.enemyDroneSpawns, b.map.enemyDroneSpawns);
    assert.deepEqual(a.map.landmineSpawns, b.map.landmineSpawns);
});
