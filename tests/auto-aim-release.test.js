import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';
import { DEFAULT_SETTINGS } from '../src/js/utils/settings.js';
import {
    AUTO_AIM_CANCEL_THRESHOLD_DEFAULT,
    AUTO_AIM_LEAD_WINDOW,
    AUTO_AIM_LEAD_DEADZONE,
} from '../src/js/utils/Constants.js';
import { AimLeadTracker } from '../src/js/utils/aimLead.js';

/**
 * _updateAutoAim() だけを呼べる最小の game。
 * 前フレームのマウス位置を (0,0) に置いてから move だけ動かす。
 *
 * ブリーフの雛形は aimLead / currentWeapon を欠いていて、ロック維持パスが
 * _lockOnEnemy() → _leadPointFor() 経由で this.aimLead.measure() と
 * this.player.currentWeapon を読むため、そのままでは例外になる。
 * aimLead はスタブではなく実物の AimLeadTracker を使う（それ自体に単体テストが
 * あるので、ここでモックする意味がない）。
 */
function makeAimScene(settings, enemy) {
    const g = Object.create(Game);
    g.settings = settings;
    g.player = {
        alive: true, docked: false, autoAimTimer: 60,
        x: 0, y: 0, width: 16, height: 24, currentWeapon: 'mg',
    };
    g.enemies = enemy ? [enemy] : [];
    g.carrier = null;
    g.smokeScreens = [];
    g.camera = { x: 0, y: 0 };
    g.autoAimTarget = null;
    g.autoAimLeadPoint = null;
    g.autoAimLockedEnemy = enemy ?? null;
    g.aimLead = new AimLeadTracker(AUTO_AIM_LEAD_WINDOW, AUTO_AIM_LEAD_DEADZONE);
    g.input = { mouse: { x: 0, y: 0 } };
    g._prevMouseX = 0;
    g._prevMouseY = 0;
    return g;
}

function fakeEnemy() {
    return { alive: true, x: 40, y: 40, width: 20, height: 20, vx: 0, vy: 0 };
}

/** マウスを move だけ横に動かして 1 回更新し、ロックが残ったかを返す。 */
function movedBy(g, move) {
    g.input.mouse.x = move;
    g._updateAutoAim();
    return g.autoAimLockedEnemy !== null;
}

test('既定値では 4 を超える動きでロックが外れる（現行の挙動）', () => {
    const s = { ...DEFAULT_SETTINGS };
    assert.equal(s.autoAimRelease, AUTO_AIM_CANCEL_THRESHOLD_DEFAULT);
    assert.equal(movedBy(makeAimScene(s, fakeEnemy()), 5), false, '外れていない');
    assert.equal(movedBy(makeAimScene(s, fakeEnemy()), 4), true, '境界ちょうどで外れてしまう');
});

test('しきい値を上げると同じ動きでは外れない', () => {
    const s = { ...DEFAULT_SETTINGS, autoAimRelease: 20 };
    assert.equal(movedBy(makeAimScene(s, fakeEnemy()), 10), true, '設定が効いていない');
    assert.equal(movedBy(makeAimScene(s, fakeEnemy()), 21), false, '上げても必ず外れるべき動きで外れない');
});

test('しきい値を下げるとわずかな動きで外れる', () => {
    const s = { ...DEFAULT_SETTINGS, autoAimRelease: 1 };
    assert.equal(movedBy(makeAimScene(s, fakeEnemy()), 2), false, '設定が効いていない');
});

test('設定が無くても落ちず、既定のしきい値で動く', () => {
    assert.equal(movedBy(makeAimScene(undefined, fakeEnemy()), 5), false);
    assert.equal(movedBy(makeAimScene(undefined, fakeEnemy()), 3), true);
});
