import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPON_SOUNDS } from '../src/js/audio/weaponSounds.js';
import { renderWeaponProfile, profileDuration } from './helpers/weapon-render.js';
import { transientLevel, db } from './helpers/dsp.js';
import { ReflectBeam } from '../src/js/entities/ReflectBeam.js';
import { EnemyTurret } from '../src/js/entities/EnemyTurret.js';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { makeMap } from './helpers/enemy-world.js';
import { REFLECT_BEAM_SHOT_COUNT, REFLECT_BEAM_BURST_DELAY } from '../src/js/utils/Constants.js';

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

// 1発が2連弾（REFLECT_BEAM_SHOT_COUNT 発）になった。REFLECT_BEAM_BURST_DELAY
// (0.4秒) 離れて撃つので、同一フレームで playWeapon が重なって実効+6dBになる
// 問題は起きない。むしろ「2発来た」ことが分かるよう、2発とも鳴らす方針にした
// （EnemyTurret._executeAttack() から silent 引数を削除）。
// 1回の攻撃(2発)につき発射音も2回、同時に鳴らないことを縛る
test('2連弾は1発につき1回、合計2回発射音が鳴る（同時には鳴らない）', () => {
  const ROOM = [
    '####################',
    '#..................#',
    '#..................#',
    '#..................#',
    '####################',
  ];
  const game = {
    map: makeMap(ROOM), enemies: [], enemyBullets: [], particles: [], projectiles: [],
    missionsCompleted: 6,
    player: { x: 100, y: 40, width: 16, height: 16, alive: true, docked: false },
    carrier: null,
    score: 0,
    addScore(n) { this.score += n; },
    spawnDebris() {}, spawnSparks() {}, spawnExplosion() {},
  };
  const t = new EnemyTurret(game, 32, 40, false, 'beam');

  const played = [];
  const original = audioManager.playWeapon;
  audioManager.playWeapon = (kind) => { played.push(kind); };
  try {
    for (let i = 0; i < 600 && game.enemyBullets.length === 0; i++) t.update();
    // 1発目の時点ではまだ1回だけ
    assert.deepEqual(played, ['reflectBeam'], '1発目の時点で発射音が1回になっていない');

    // burstTimer=burstDelay からの数え方は tests/beam-cannon.test.js のコメント参照。
    // burstDelay+1 回の update() で2発目が撃たれる
    for (let i = 0; i < REFLECT_BEAM_BURST_DELAY + 1; i++) t.update();
  } finally {
    audioManager.playWeapon = original;
  }

  assert.equal(game.enemyBullets.length, REFLECT_BEAM_SHOT_COUNT, '2連弾の本数が変わっている（前提が崩れている）');
  assert.deepEqual(played, ['reflectBeam', 'reflectBeam'], `発射音が${played.length}回鳴っている（2連弾で2回のはず）`);
});

// ============================================
// 被弾音（実機フィードバック3回目「もっと派手に。専用の効果音があってもいい」）
// ============================================
//
// 当たるとビーム自体が消えるので1発につき1回しか鳴らない。連射でも
// REFLECT_BEAM_BURST_DELAY(0.4秒) 離れた2回まで＝鳴り続ける心配は無い。
// それでも発射音より控えめにするのは、被弾は「撃たれた」より後の出来事で、
// 画面には閃光とスパークという視覚の手がかりが同時に出るため。

test('表に beamHit がある', () => {
  assert.ok(WEAPON_SOUNDS.beamHit, '表に無い');
});

// 無音バグを実際に出したことがあるためのテスト
test('被弾音は鳴っている（無音ではない）', () => {
  const level = levelOf('beamHit');
  assert.ok(level > 0.001, `ほぼ無音: ${level}`);
});

test('被弾音は発射音より控えめだが、埋もれない', () => {
  const rel = db(levelOf('beamHit') / levelOf('reflectBeam'));
  assert.ok(rel < -2, `発射音に対して控えめになっていない: ${rel.toFixed(1)}dB`);
  assert.ok(rel > -10, `発射音に対して小さすぎて埋もれる: ${rel.toFixed(1)}dB`);
});

// 発射音（低く唸る）と被弾音（高く弾ける）が同じ音に聞こえないこと。
// 同じだと「撃たれた」のか「当たった」のかが音では区別できない
test('被弾音は発射音より高い帯域で鳴る', () => {
  assert.ok(
    WEAPON_SOUNDS.beamHit.hiss.from > WEAPON_SOUNDS.reflectBeam.hiss.from,
    '被弾音のノイズが発射音より高くない（撃たれたのか当たったのか区別できない）',
  );
});

// 短い一撃であること。長いと被弾が続いたときに尾が重なって濁る
test('被弾音は短い（0.15秒以内）', () => {
  const d = profileDuration(WEAPON_SOUNDS.beamHit);
  assert.ok(d <= 0.15, `長すぎる: ${d}秒`);
});
