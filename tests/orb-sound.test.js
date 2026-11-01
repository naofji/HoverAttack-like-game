// Orb が機体・地形に当たったときの重い「ゴン」（設計 4.8）。無音バグを実際に出したことがあるので A特性で縛る。
// 鳴らすのは衝突ダメージのときと、地形で弾んだとき（法線の速さが ORB_BOUNCE_MIN_SPEED を超えたとき）。
// 転がる最中の細かい当たりで鳴り続けないよう、実時間で ORB_SOUND_INTERVAL_MS に1回まで間引く
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPON_SOUNDS } from '../src/js/audio/weaponSounds.js';
import { renderWeaponProfile, profileDuration } from './helpers/weapon-render.js';
import { transientLevel, db } from './helpers/dsp.js';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { Orb } from '../src/js/entities/Orb.js';
import { updateOrbs, resolveOrbBody } from '../src/js/systems/orbInteractions.js';
import { makeMap, makeGame } from './helpers/enemy-world.js';
import { TILE_SIZE as T, ORB_SOUND_INTERVAL_MS } from '../src/js/utils/Constants.js';

function levelOf(kind) {
  const p = WEAPON_SOUNDS[kind];
  const buf = renderWeaponProfile(p);
  return transientLevel((i) => buf[i] ?? 0, profileDuration(p));
}

test('表に orbImpact があり、無音ではない', () => {
  assert.ok(WEAPON_SOUNDS.orbImpact);
  assert.ok(levelOf('orbImpact') > 0.001);
});

// 重い石の音なので、小さすぎると低音が A特性で削られて埋もれる（無音バグと同じ型）。大きすぎると転がるたびに耳につく。
// 基準は同じ単発の「当たった」音の shieldDeflect（armorRicochet は連続で鳴るのでわざと小さく、基準に向かない）
test('shieldDeflect との相対音量が −6〜+6 dB に収まる', () => {
  const rel = db(levelOf('orbImpact') / levelOf('shieldDeflect'));
  assert.ok(rel > -6 && rel < 6, `${rel.toFixed(1)}dB`);
});

test('重い（tone が 150Hz 以下から始まる）・短い（0.25秒以内）', () => {
  const p = WEAPON_SOUNDS.orbImpact;
  assert.ok(p.tone && p.tone.from <= 150, '低い芯が無い');
  assert.ok(profileDuration(p) <= 0.25, `${profileDuration(p)}秒`);
});

function spy() {
  const calls = [];
  const saved = audioManager.playWeapon;
  audioManager.playWeapon = (kind, x, y) => { calls.push(kind); };
  return { calls, restore: () => { audioManager.playWeapon = saved; } };
}

function withClock(fn) {
  const saved = Date.now;
  let now = 1e6;
  Date.now = () => now;
  try { fn((ms) => { now += ms; }); } finally { Date.now = saved; }
}

test('機体に衝突ダメージを与えたとき orbImpact を1回鳴らし、間隔の中の2回目は鳴らさない', () => {
  const s = spy();
  try {
    withClock((advance) => {
      advance(10 * ORB_SOUND_INTERVAL_MS);   // 前のテストの最後の音から十分に空ける
      const game = { map: { isSolidPoint: () => false }, orbs: [], enemies: [] };
      const mk = () => ({ alive: true, x: 100, y: 92, width: 24, height: 16, vx: 0, vy: 0, takeDamage() {} });
      const a = mk(), b = mk();
      const orb = new Orb(game, { cx: 100 - 8 + 0.5, cy: 100, size: 'small' });
      orb.vx = 4;
      resolveOrbBody(game, orb, a);
      orb.x = 100 - 16 + 0.5; orb.vx = 4;
      resolveOrbBody(game, orb, b);       // 別の相手（ダメージは入る）だが、音は間隔の中
      assert.deepEqual(s.calls, ['orbImpact']);
      advance(ORB_SOUND_INTERVAL_MS + 1);
      const c = mk();
      orb.x = 100 - 16 + 0.5; orb.vx = 4;
      resolveOrbBody(game, orb, c);
      assert.deepEqual(s.calls, ['orbImpact', 'orbImpact']);
    });
  } finally { s.restore(); }
});

test('高い所から床に落ちて弾んだとき鳴り、床に止まっているあいだは鳴らない', () => {
  const s = spy();
  try {
    withClock((advance) => {
      advance(10 * ORB_SOUND_INTERVAL_MS);
      const rows = [];
      for (let r = 0; r < 20; r++) rows.push((r >= 15 ? '#' : '.').repeat(40));
      const game = makeGame(makeMap(rows));
      game.orbs = [new Orb(game, { cx: 20 * T, cy: 3 * T, size: 'small' })];
      game.landmines = [];
      for (let f = 0; f < 200; f++) { updateOrbs(game); advance(16); }
      assert.ok(s.calls.length >= 1, '弾んでも鳴らない');
      const n = s.calls.length;
      for (let f = 0; f < 200; f++) { updateOrbs(game); advance(16); }
      assert.equal(s.calls.length, n, '止まっているのに鳴る');
    });
  } finally { s.restore(); }
});
