// 誘爆の遅れ・火・落下・上限・画面の外（explosives.js）。spec 3b章「誘爆の仕方」「暴走の歯止め」
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    TOWN_EXPLOSIVE_COOKOFF, TOWN_CHAIN_DELAY_MIN, TOWN_CHAIN_DELAY_RANGE,
    TOWN_EXPLOSIONS_PER_SECOND, TOWN_EXPLOSIVE_RADIUS, TOWN_EXPLOSIVE_DAMAGE,
} from '../src/js/utils/Constants.js';
import { drum, shed, unit, world } from './helpers/town-explosive-fixtures.js';

const MAX_DELAY = TOWN_CHAIN_DELAY_MIN + TOWN_CHAIN_DELAY_RANGE;

test('爆風の中の別の爆発物は 8〜15 フレーム遅れて爆発する（いろいろな種で）', () => {
    const gaps = new Set();
    for (let seed = 1; seed <= 20; seed++) {
        const w = world([drum(100, 100), drum(130, 100)], { seed });   // 中心どうし 30px
        w.town.chip(w.town.buildings[0], 104, 108, 4);
        w.step(40);
        assert.equal(w.booms.length, 2, `seed ${seed}`);
        const gap = w.booms[1].frame - w.booms[0].frame;
        assert.ok(gap >= TOWN_CHAIN_DELAY_MIN && gap <= MAX_DELAY, `seed ${seed}: ${gap}`);
        gaps.add(gap);
    }
    assert.ok(gaps.size >= 3, `遅れがばらつかない: ${[...gaps]}`);
});

test('町を欠かせる半径の外でも、TOWN_EXPLOSIVE_RADIUS の中の爆発物は誘爆する。外は誘爆しない', () => {
    const d = TOWN_EXPLOSIVE_RADIUS - 6;   // 町の欠け（約 30px）は届かない
    // 3つ目は1つ目からも2つ目からも半径の外（2つ目の誘爆からも届かない所）
    const w = world([drum(100, 100), drum(100 + d, 100), drum(100 + d + TOWN_EXPLOSIVE_RADIUS + 40, 100)]);
    const [a, b, c] = w.town.buildings;
    w.town.chip(a, 104, 108, 4);
    w.step(1);
    assert.equal(b.remaining, b.total, '前提: 2つ目は町の欠けでは欠けていない');
    w.step(40);
    assert.equal(b.exploded, true);
    assert.equal(c.exploded, false);
});

test('2つの爆発物が互いの爆風の中でも、どちらも1回ずつ', () => {
    const w = world([drum(100, 100), drum(120, 100)]);
    w.town.chip(w.town.buildings[0], 104, 108, 4);
    w.step(80);
    assert.equal(w.booms.length, 2);
});

test('火が届いた爆発物は TOWN_EXPLOSIVE_COOKOFF フレーム後に爆発する（それより前には爆発しない）', () => {
    const w = world([drum(100, 100)]);
    const b = w.town.buildings[0];
    assert.ok(w.town.fire.ignite(b, 0));
    w.step(TOWN_EXPLOSIVE_COOKOFF - 1);
    assert.equal(w.booms.length, 0);
    w.step(1);
    assert.equal(w.booms.length, 1);
});

test('燃えている小屋から火が燃え移った爆発物も、やがて爆発する', () => {
    const w = world([shed(100, 100), drum(132, 116)]);   // 小屋の右の壁に接する
    const hut = w.town.buildings[0];
    for (let k = 0; k < hut.cells.length; k += hut.cw) w.town.fire.ignite(hut, k + hut.cw - 1);   // 右端の列
    w.step(1200);
    assert.equal(w.town.buildings[1].exploded, true);
});

test('支えを失って落ちた爆発物は、砕けた所で1回だけ爆発し、瓦礫を残さない', () => {
    let rock = true;
    const w = world([drum(0, 0, 16, 68)], { isSolidTile: (r) => (r === 4 && rock) || r === 30 });
    rock = false;
    w.town.onBlockDestroyed(4, 0);
    assert.equal(w.town.falling.length, 1, '前提: 落ちる');
    w.step(200);
    assert.equal(w.booms.length, 1);
    assert.ok(Math.abs(w.booms[0].y - 30 * 16) <= 16, `爆発した高さ ${w.booms[0].y}`);
    assert.equal(w.town.rubble.length, 0);
});

test('火が届いて待っているあいだに落ち始めても、爆発は1回（落ちている破片か砕けた所で）', () => {
    let rock = true;
    const w = world([drum(0, 0, 16, 68)], { isSolidTile: (r) => (r === 4 && rock) || r === 30 });
    w.town.fire.ignite(w.town.buildings[0], 0);
    rock = false;
    w.town.onBlockDestroyed(4, 0);
    w.step(200);
    assert.equal(w.booms.length, 1);
    assert.ok(w.booms[0].y > 68, `元の位置（${w.booms[0].y}）で爆発した`);
    // 爆発したあとに、同じ爆発物の破片が落ち続けて瓦礫を残さない（宙で爆発しても）
    assert.equal(w.town.falling.length, 0);
    assert.equal(w.town.rubble.length, 0);
});

test('グレネードの爆風で丸ごと消し飛んだ爆発物も、その位置で爆発する', () => {
    const w = world([drum(100, 100)]);
    w.town.blast(104, 108, 150);   // 半径約 40px。ドラム缶は丸ごと消える
    assert.equal(w.town.buildings[0].remaining, 0, '前提: 丸ごと消えた');
    w.step(MAX_DELAY);
    assert.equal(w.booms.length, 1);
    assert.ok(Math.abs(w.booms[0].x - 104) <= 4 && Math.abs(w.booms[0].y - 108) <= 4);
});

test('60 フレームあたり TOWN_EXPLOSIONS_PER_SECOND 回まで。超えた分は消えずに後ろへずれる', () => {
    // 互いの爆風が届かないよう 120px ずつ離した 10 個に、同じ tick で火をつける
    const w = world(Array.from({ length: 10 }, (_, i) => drum(100 + i * 120, 100)));
    for (const b of w.town.buildings) w.town.explosives.trigger(b, 0);
    w.step(300);
    assert.equal(w.booms.length, 10, '全部いつかは爆発する');
    for (const b of w.booms) {
        const inWindow = w.booms.filter((o) => o.frame > b.frame - 60 && o.frame <= b.frame).length;
        assert.ok(inWindow <= TOWN_EXPLOSIONS_PER_SECOND, `frame ${b.frame}: ${inWindow}`);
    }
});

test('画面の外の爆発: ダメージ・町の欠け・誘爆は起き、粒・閃光・爆発音（spawnExplosion）は出ない', () => {
    const w = world([drum(2000, 2000), shed(2010, 1992), drum(2030, 2000)], { view: { x: 0, y: 0, w: 640, h: 360 } });
    const [a, hut, b] = w.town.buildings;
    w.game.player = unit(2004 + 20, 2008);
    w.town.chip(a, 2004, 2008, 4);
    w.step(40);
    assert.equal(a.exploded, true);
    assert.equal(b.exploded, true, '画面の外でも誘爆する');
    assert.ok(hut.remaining < hut.total);
    assert.deepEqual(w.game.player.hits.slice(0, 1), [TOWN_EXPLOSIVE_DAMAGE]);
    assert.equal(w.booms.length, 0);
    assert.equal(w.game.particles.length, 0);
});
