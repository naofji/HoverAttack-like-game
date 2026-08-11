import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { Player } from '../src/js/entities/Player.js';
import {
  PLAYER_MAX_HP, MISSILE_INITIAL_COUNT, GRENADE_INITIAL_COUNT, HOVER_MAX_FUEL,
} from '../src/js/utils/Constants.js';

/** audioManager の呼び出しを記録する。音は鳴らせないので呼び出しで確かめる。 */
function spyAudio(names) {
  const calls = [];
  const originals = {};
  for (const n of names) {
    originals[n] = audioManager[n];
    audioManager[n] = (...args) => calls.push({ name: n, args });
  }
  return {
    calls,
    restore() { for (const n of names) audioManager[n] = originals[n]; },
    count(n) { return calls.filter((c) => c.name === n).length; },
    weapons(kind) {
      return calls.filter((c) => c.name === 'playWeapon' && c.args[0] === kind).length;
    },
  };
}

/** ドッキング直後の自機。空にした状態から始める。 */
function makeDockedPlayer(overrides = {}) {
  const p = Object.create(Player.prototype);
  p.game = { gameSpeed: 1 };
  p.hp = 0;
  p.missiles = 0;
  p.grenades = 0;
  p.hoverFuel = 0;
  p.mgBurstLeft = 0;
  p.mgFireTimer = 0;
  p.mgReloadTimer = 0;
  Object.assign(p, overrides);
  p.resupply();
  return p;
}

/** 満タンになるまで（余裕をみて 400 フレーム）回す。 */
function runUntilFull(p, frames = 400) {
  for (let i = 0; i < frames; i++) p._updateDockedResupply();
}

test('弾は1発入るごとにクリックが鳴る', () => {
  const spy = spyAudio(['playWeapon', 'startRepairHum', 'stopRepairHum']);
  try {
    runUntilFull(makeDockedPlayer());
    assert.equal(spy.weapons('ammoMissile'), MISSILE_INITIAL_COUNT,
      'ミサイルのクリック数が装填数と合っていない');
    assert.equal(spy.weapons('ammoGrenade'), GRENADE_INITIAL_COUNT,
      'グレネードのクリック数が装填数と合っていない');
  } finally { spy.restore(); }
});

test('装填音は左右に振れない（自機は常に母艦の上）', () => {
  const spy = spyAudio(['playWeapon', 'startRepairHum', 'stopRepairHum']);
  try {
    runUntilFull(makeDockedPlayer());
    for (const c of spy.calls) {
      if (c.name === 'playWeapon') {
        assert.equal(c.args.length, 1, `座標を渡していて左右に振れる: ${c.args.join(', ')}`);
      }
    }
  } finally { spy.restore(); }
});

test('回復中はハムが鳴り、満タンで止まる', () => {
  const spy = spyAudio(['playWeapon', 'startRepairHum', 'stopRepairHum']);
  try {
    const p = makeDockedPlayer();
    p._updateDockedResupply();
    assert.ok(spy.count('startRepairHum') > 0, '回復中にハムが鳴っていない');
    assert.equal(spy.count('stopRepairHum'), 0, '回復の途中で止まっている');

    runUntilFull(p);
    assert.equal(spy.count('stopRepairHum'), 1, '満タンでちょうど1回止まっていない');
    assert.equal(p.hp, PLAYER_MAX_HP);
  } finally { spy.restore(); }
});

test('ハムの進捗は 0 から 1 へ動く', () => {
  const spy = spyAudio(['playWeapon', 'startRepairHum', 'stopRepairHum']);
  try {
    const p = makeDockedPlayer();
    runUntilFull(p);
    const progress = spy.calls.filter((c) => c.name === 'startRepairHum').map((c) => c.args[0]);
    assert.ok(progress[0] < 0.1, `始まりが 0 付近でない: ${progress[0]}`);
    assert.ok(progress[progress.length - 1] > 0.9, '終わりが 1 付近でない');
    for (let i = 1; i < progress.length; i++) {
      assert.ok(progress[i] >= progress[i - 1], '進捗が戻っている');
    }
  } finally { spy.restore(); }
});

test('全部満ちた瞬間に「レディ」がちょうど1回', () => {
  const spy = spyAudio(['playWeapon', 'startRepairHum', 'stopRepairHum']);
  try {
    const p = makeDockedPlayer();
    runUntilFull(p);
    assert.equal(spy.weapons('readyVoice'), 1);
    // 満タンのまま居続けても増えない
    runUntilFull(p, 120);
    assert.equal(spy.weapons('readyVoice'), 1, '満タンで居続けると鳴り続ける');
  } finally { spy.restore(); }
});

test('最後に満ちるものより前では鳴らない', () => {
  const spy = spyAudio(['playWeapon', 'startRepairHum', 'stopRepairHum']);
  try {
    const p = makeDockedPlayer();
    // HP（3.6秒）も燃料（4秒）も満ちるが、弾（6秒）はまだ
    for (let i = 0; i < 300; i++) p._updateDockedResupply();
    assert.equal(p.hp, PLAYER_MAX_HP);
    assert.ok(p.missiles < MISSILE_INITIAL_COUNT);
    assert.equal(spy.weapons('readyVoice'), 0, '弾が残っているのに出撃可能と告げている');
  } finally { spy.restore(); }
});

test('最初から満タンならドックしても鳴らない', () => {
  const spy = spyAudio(['playWeapon', 'startRepairHum', 'stopRepairHum']);
  try {
    const p = makeDockedPlayer({
      hp: PLAYER_MAX_HP, missiles: MISSILE_INITIAL_COUNT,
      grenades: GRENADE_INITIAL_COUNT, hoverFuel: HOVER_MAX_FUEL,
    });
    runUntilFull(p, 120);
    assert.equal(spy.weapons('readyVoice'), 0, '補給していないのに鳴っている');
    assert.equal(spy.weapons('ammoMissile'), 0);
    assert.equal(spy.count('startRepairHum'), 0, '減っていないのにハムが鳴っている');
  } finally { spy.restore(); }
});

test('補給の途中で離陸するとハムが止まる', () => {
  const source = readFileSync(new URL('../src/js/main.js', import.meta.url), 'utf8');
  const undock = source.slice(source.indexOf('player.docked = false;'));
  assert.ok(undock.slice(0, 400).includes('stopRepairHum()'),
    '離脱してもハムが鳴り続ける');
});
