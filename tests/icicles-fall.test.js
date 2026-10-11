import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IcicleFall } from '../src/js/world/town/IcicleFall.js';
import { FallingPiece } from '../src/js/world/town/FallingPiece.js';
import { impactTargets, applyImpact } from '../src/js/utils/impactDamage.js';
import { MAT_ICE, SOLID } from '../src/js/world/town/chunks.js';
import { fakeCanvas } from './helpers/town-fixtures.js';
import { ICICLE_KNOCK_VY, TOWN_FALL_GRAVITY } from '../src/js/utils/Constants.js';

const V = MAT_ICE | SOLID;

/** 3 かけら幅・3 段の、先の尖った塊（上の段が広く、下の段は真ん中の 1 かけらだけ）。左上が (x, y) */
function piece(x = 100, y = 100, damage = 20, extra = {}) {
    const cells = new Uint8Array([V, V, V, 0, V, 0, 0, V, 0]);
    return new IcicleFall({ canvas: fakeCanvas(12, 12), cells, cw: 3, ch: 3, x, y, damage, ...extra });
}
const entity = (x, y, extra = {}) => ({ x, y, width: 10, height: 10, alive: true, hp: 100, vx: 1.5, vy: 0, takeDamage(n) { this.hp -= n; }, ...extra });

test('IcicleFall は FallingPiece の一種。回らず、横へ流れず、重力で落ちる', () => {
    const p = piece();
    assert.ok(p instanceof FallingPiece);
    assert.equal(p.icicle, true);
    assert.equal(p.damage, 20);
    const y0 = p.y;
    p.step();
    assert.equal(p.angle, 0);
    assert.equal(p.x, 100);
    assert.ok(p.y > y0 && Math.abs(p.vy - TOWN_FALL_GRAVITY) < 1e-9);
});

test('渡された vx・spin は使わない（建物の切り離しが付けるばらつきで、つららが流れたり回ったりしない）', () => {
    const p = piece(100, 100, 20, { vx: 0.3, spin: 0.05 });
    for (let i = 0; i < 20; i++) p.step();
    assert.equal(p.x, 100);
    assert.equal(p.angle, 0);
});

test('touches: かけらの矩形が機体の矩形に掛かれば true。外接矩形の中でも、空のかけらには当たらない', () => {
    const p = piece(100, 100);   // 外接矩形は x 100〜112、y 100〜112。先（下の段）は真ん中の列（x 104〜108）だけ
    assert.equal(p.touches(entity(102, 102)), true, '上の段に重なる');
    assert.equal(p.touches(entity(104, 108)), true, '先のかけらに重なる');
    // 外接矩形の中だが、先の段の左（空のかけら）にだけ重なる機体
    assert.equal(p.touches(entity(100, 108, { width: 3, height: 4 })), false, '空のかけらに当たった');
    assert.equal(p.touches(entity(200, 100)), false, '離れている');
    assert.equal(p.touches(entity(100, 112)), false, '真下に接しているだけ（重ならない）');
    assert.equal(p.touches(entity(112, 100)), false, '右に接しているだけ（重ならない）');
    assert.equal(p.touches(entity(90, 100)), false, '左に接しているだけ（重ならない）');
    assert.equal(p.touches(entity(100, 90)), false, '真上に接しているだけ（重ならない）');
});

test('impactTargets: 自機・母艦・敵。死んでいるもの・ドッキング中の自機・無いものは除く', () => {
    const player = entity(0, 0), carrier = entity(0, 0), e1 = entity(0, 0), e2 = entity(0, 0, { alive: false });
    assert.deepEqual(impactTargets({ player, carrier, enemies: [e1, e2] }), [player, carrier, e1]);
    assert.deepEqual(impactTargets({ player: { ...player, docked: true }, carrier: null, enemies: [] }), []);
    assert.deepEqual(impactTargets({ player: null, carrier: null }), []);
    assert.deepEqual(impactTargets({ player: { ...player, alive: false }, enemies: undefined }), []);
});

test('applyImpact: ダメージを与え、当たった点を残し、下向きに押す（vx は変えない）。すでに速く落ちていれば押さない', () => {
    const e = entity(0, 0);
    applyImpact(e, 5, 6, 25, ICICLE_KNOCK_VY);
    assert.equal(e.hp, 75);
    assert.equal(e.lastHitX, 5);
    assert.equal(e.lastHitY, 6);
    assert.equal(e.vy, ICICLE_KNOCK_VY);
    assert.equal(e.vx, 1.5, 'vx が変わった');
    const fast = entity(0, 0, { vy: 5 });
    applyImpact(fast, 0, 0, 10, ICICLE_KNOCK_VY);
    assert.equal(fast.vy, 5, '速く落ちている機体を遅くした');
    const up = entity(0, 0, { vy: -6 });
    applyImpact(up, 0, 0, 10, ICICLE_KNOCK_VY);
    assert.equal(up.vy, ICICLE_KNOCK_VY, '上昇中の機体は下向きの押しに替わる');
});

test('applyImpact: takeDamage が無い相手・vy が無い相手でも例外を出さない', () => {
    applyImpact({ x: 0, y: 0 }, 0, 0, 10, 2);
    const noVy = { takeDamage() { this.called = true; } };
    applyImpact(noVy, 0, 0, 10, 2);
    assert.equal(noVy.called, true);
    assert.equal(noVy.vy, undefined);
});
