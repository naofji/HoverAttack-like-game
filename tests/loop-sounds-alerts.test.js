// systems/LoopSounds.js と systems/Alerts.js（2026-11-24 に main.js から切り出した）の手順を、
// 本物の Game のメソッドとして呼ぶ。切り出したとき、mixin の import を1つずつ外しても
// 既存テストが落ちない経路が4つあった（敵のホバー音・母艦のエンジン音の強さ・接近警報の距離）。
// import が漏れても気づけないので、ここで実際に通す。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { CARRIER_SPEED, CARRIER_PROXIMITY_ALERT_RANGE } from '../src/js/utils/Constants.js';

/** audioManager のメソッドを記録用に差し替え、終わったら必ず戻す（audio-wiring の spyAudio と同じ考え方） */
function withSpy(names, fn) {
    const calls = [];
    const saved = {};
    for (const n of names) {
        saved[n] = audioManager[n];
        audioManager[n] = (...args) => { calls.push([n, ...args]); };
    }
    try { fn(calls); } finally { Object.assign(audioManager, saved); }
}

const view = () => ({
    canvas: { width: 800, height: 600 },
    camera: { x: 0, y: 0 },
    _viewRect: Game._viewRect,
});

test('敵のホバー音: 画面内でホバーしている敵の音量と位置を渡す。居なければ 0', () => {
    withSpy(['setEnemyHover'], (calls) => {
        const game = { ...view(), enemies: [{ alive: true, hovering: true, x: 390, y: 290, width: 20, height: 20 }] };
        Game._updateEnemyHoverSound.call(game);
        assert.equal(calls.length, 1);
        const [, volume, x] = calls[0];
        assert.ok(volume > 0, `音量 ${volume}`);
        assert.equal(x, 400);

        calls.length = 0;
        Game._updateEnemyHoverSound.call({ ...view(), enemies: [] });
        assert.deepEqual(calls, [['setEnemyHover', 0]]);
    });
});

test('母艦のエンジン音: ドッキング中は速さに比例した強さで鳴らし、離れたら止める', () => {
    withSpy(['startCarrierEngine', 'stopCarrierEngine', 'stopRepairHum'], (calls) => {
        const carrier = { alive: true, vx: -CARRIER_SPEED / 2 };
        Game._updateCarrierEngineSound.call({ player: { docked: true, alive: true }, carrier });
        assert.deepEqual(calls, [['startCarrierEngine', 0.5]]);

        calls.length = 0;
        carrier.vx = CARRIER_SPEED * 3;   // 速すぎても 1 で頭打ち
        Game._updateCarrierEngineSound.call({ player: { docked: true, alive: true }, carrier });
        assert.deepEqual(calls, [['startCarrierEngine', 1]]);

        calls.length = 0;
        Game._updateCarrierEngineSound.call({ player: { docked: false, alive: true }, carrier });
        assert.deepEqual(calls.map((c) => c[0]), ['stopCarrierEngine', 'stopRepairHum']);
    });
});

test('接近警報: 母艦の中心から範囲の内側に敵か敵弾の中心が入ったら立つ', () => {
    withSpy(['playAlarm'], () => {
        const carrier = { alive: true, x: 1000, y: 500, width: 60, height: 40 };   // 中心 (1030, 520)
        const at = (dx) => ({ alive: true, x: 1030 + dx - 5, y: 520 - 5, width: 10, height: 10 });
        const game = (enemies, enemyBullets = []) => ({
            carrier, enemies, enemyBullets, gameState: 'playing', totalTime: 1,
        });

        const inside = game([at(CARRIER_PROXIMITY_ALERT_RANGE - 1)]);
        Game._updateProximityAlert.call(inside);
        assert.equal(inside.proximityAlertActive, true);

        const outside = game([at(CARRIER_PROXIMITY_ALERT_RANGE + 1)]);
        Game._updateProximityAlert.call(outside);
        assert.equal(outside.proximityAlertActive, false);

        const bullet = game([], [at(-(CARRIER_PROXIMITY_ALERT_RANGE - 1))]);
        Game._updateProximityAlert.call(bullet);
        assert.equal(bullet.proximityAlertActive, true, '敵弾でも立つ');

        const dead = game([{ ...at(0), alive: false }]);
        Game._updateProximityAlert.call(dead);
        assert.equal(dead.proximityAlertActive, false, '倒した敵では立たない');
    });
});
