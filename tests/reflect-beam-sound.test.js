import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPON_SOUNDS } from '../src/js/audio/weaponSounds.js';
import { renderWeaponProfile, profileDuration } from './helpers/weapon-render.js';
import { transientLevel, db } from './helpers/dsp.js';
import { ReflectBeam } from '../src/js/entities/ReflectBeam.js';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { makeMap } from './helpers/enemy-world.js';

// 単発の短い音どうしを比べるので transientLevel を使う（tests/weapon-sounds.test.js
// と同じやり方）。brief 案の aWeightedRms(() => renderWeaponProfile(...)) は
// サンプルごとの関数のはずが配列をそのまま返してしまい NaN になったため、
// この形に直した。
function levelOf(kind) {
  const p = WEAPON_SOUNDS[kind];
  const buf = renderWeaponProfile(p);
  return transientLevel((i) => buf[i] ?? 0, profileDuration(p));
}

test('表に reflectBeam がある', () => {
  assert.ok(WEAPON_SOUNDS.reflectBeam, '表に無い');
});

// 敵のマシンガンと同じくらいの存在感にする。小さすぎると撃たれたことに
// 気づけず、大きすぎると連続して撃たれたときに耳につく
test('敵マシンガンとの相対音量が範囲に収まる', () => {
  const beam = levelOf('reflectBeam');
  const mg = levelOf('enemyMg');
  const rel = db(beam / mg);
  assert.ok(rel > -6 && rel < 6, `敵マシンガンとの差が大きすぎる: ${rel.toFixed(1)}dB`);
});

// 無音バグを実際に出したことがあるためのテスト
test('鳴っている（無音ではない）', () => {
  const level = levelOf('reflectBeam');
  assert.ok(level > 0.001, `ほぼ無音: ${level}`);
});

test('撃つと発射音を鳴らす', () => {
  const played = [];
  const original = audioManager.playWeapon;
  audioManager.playWeapon = (kind) => { played.push(kind); };
  try {
    const map = makeMap(['####', '#..#', '####']);
    new ReflectBeam({ map, particles: [] }, 20, 20, 0);
  } finally {
    audioManager.playWeapon = original;
  }
  assert.deepEqual(played, ['reflectBeam']);
});
