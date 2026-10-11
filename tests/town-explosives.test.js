// 町の爆発物が欠けたら爆発する（explosives.js）。spec 3b章「爆発する条件」「機体へのダメージ」「岩は壊さない」
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    TOWN_EXPLOSIVE_DAMAGE, TOWN_EXPLOSIVE_RADIUS, TOWN_EXPLOSIVE_BLAST_COUNT,
} from '../src/js/utils/Constants.js';
import { Landmine } from '../src/js/entities/Landmine.js';
import { drum, shed, unit, world } from './helpers/town-explosive-fixtures.js';

test('爆発物の建物には explosive の印、ふつうの建物には無い', () => {
    const { town } = world([drum(100, 100), shed(200, 100)]);
    assert.equal(town.buildings[0].explosive, true);
    assert.equal(town.buildings[1].explosive, false);
});

test('弾で欠けた爆発物は、その tick の update で爆発する（spawnExplosion を粒 BLAST_COUNT で通る）', () => {
    // 縦長にして、自分の爆風（約 30px）の外にもかけらが残る形にする。8x16 のドラム缶だと
    // 爆風が丸ごと欠かせるので、consume が無くても remaining が 0 になってしまう
    const w = world([drum(100, 100, 16, 68)]);
    const b = w.town.buildings[0];
    w.town.chip(b, 108, 104, 4);
    assert.equal(w.booms.length, 0, 'chip の中では爆発しない（update で）');
    w.step(1);
    assert.equal(w.booms.length, 1);
    assert.equal(w.booms[0].size, TOWN_EXPLOSIVE_BLAST_COUNT);
    assert.equal(b.exploded, true);
    assert.equal(b.remaining, 0, '爆発した爆発物は残らない');
});

test('爆発は1回だけ: 爆発の前に何度欠けても、爆発のあとに引き金を引かれても', () => {
    const w = world([drum(100, 100, 16, 16)]);
    const b = w.town.buildings[0];
    w.town.chip(b, 102, 102, 2);
    w.town.chip(b, 110, 110, 2);
    w.step(30);
    // 爆発のあとはかけらが残らないので、欠けからは引き金が来ない。火・着地・誘爆から来た場合を直接
    w.town.explosives.trigger(b, 0);
    w.step(30);
    assert.equal(w.booms.length, 1);
});

test('ふつうの建物は欠けても爆発しない', () => {
    const w = world([shed(100, 100)]);
    w.town.chip(w.town.buildings[0], 110, 110, 6);
    w.step(30);
    assert.equal(w.booms.length, 0);
});

test('ダメージ: 半径の中の自機・母艦・敵に TOWN_EXPLOSIVE_DAMAGE、外には無し', () => {
    const w = world([drum(100, 100)]);   // 中心 (104, 108)
    w.game.player = unit(104 + 30, 108);
    w.game.carrier = unit(104 + TOWN_EXPLOSIVE_RADIUS + 20, 108);
    w.game.enemies.push(unit(104, 108 - 40), unit(104 - 90, 108));
    w.town.chip(w.town.buildings[0], 104, 108, 4);
    w.step(1);
    assert.deepEqual(w.game.player.hits, [TOWN_EXPLOSIVE_DAMAGE]);
    assert.deepEqual(w.game.carrier.hits, []);
    assert.deepEqual(w.game.enemies[0].hits, [TOWN_EXPLOSIVE_DAMAGE]);
    assert.deepEqual(w.game.enemies[1].hits, []);
});

test('爆発は町を欠かせて火をつける（spawnExplosion → town.blast）。岩は壊さない', () => {
    // 小屋は爆風で崩壊しない大きさにする（崩壊した土台は焦げて燃えない＝段3の決まり）
    const w = world([drum(100, 100), shed(116, 76, 48, 48)]);
    const hut = w.town.buildings[1];
    w.town.chip(w.town.buildings[0], 104, 108, 4);
    w.step(1);
    assert.ok(hut.remaining < hut.total, '隣の小屋が欠けていない');
    assert.ok(w.town.fire.countIn(hut) > 0, '隣の小屋に火がつかない');
    assert.deepEqual(w.rockHits, []);
});

test('爆風は近くの地雷も誘爆する', () => {
    const w = world([drum(100, 100)]);
    const mine = new Landmine(w.game, 120, 110);
    w.game.landmines.push(mine);
    w.town.chip(w.town.buildings[0], 104, 108, 4);
    w.step(1);
    assert.equal(mine.alive, false);
});
