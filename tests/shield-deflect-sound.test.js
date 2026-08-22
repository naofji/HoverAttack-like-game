// 周回シールドが弾いたときの跳弾音。
// 無音バグを実際に出したことがあるので、A特性の実測で相対音量を縛る。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPON_SOUNDS } from '../src/js/audio/weaponSounds.js';
import { renderWeaponProfile, profileDuration } from './helpers/weapon-render.js';
import { transientLevel, db } from './helpers/dsp.js';

function levelOf(kind) {
  const p = WEAPON_SOUNDS[kind];
  const buf = renderWeaponProfile(p);
  return transientLevel((i) => buf[i] ?? 0, profileDuration(p));
}

test('表に shieldDeflect がある', () => {
  assert.ok(WEAPON_SOUNDS.shieldDeflect, '表に無い');
});

test('跳弾音は鳴っている（無音ではない）', () => {
  const level = levelOf('shieldDeflect');
  assert.ok(level > 0.001, `ほぼ無音: ${level}`);
});

// 同じ「当たったが効いていない」系の音である beamHit を基準にする。
// 小さすぎると弾かれたことに気づかず、大きすぎると展開中の連射で耳につく
test('beamHit との相対音量が範囲に収まる', () => {
  const rel = db(levelOf('shieldDeflect') / levelOf('beamHit'));
  assert.ok(rel > -6 && rel < 6, `beamHit との差が大きすぎる: ${rel.toFixed(1)}dB`);
});

// ミサイル・グレネード・MG が続けて当たると立て続けに鳴る。
// 尾を引くと重なって濁るので短い一撃にする
test('跳弾音は短い（0.12秒以内）', () => {
  const d = profileDuration(WEAPON_SOUNDS.shieldDeflect);
  assert.ok(d <= 0.12, `長すぎる: ${d}秒`);
});

// 「効いた」音（grenade の着弾など）と混ざらないよう、高く硬い金属の一撃にする
test('跳弾音は金属の打撃で作ってある', () => {
  const clicks = WEAPON_SOUNDS.shieldDeflect.clicks;
  assert.ok(clicks, 'clicks が無い（金属らしさが出ない）');
  assert.ok(clicks.metal > 1, `非整数倍の成分が重なっていない: ${clicks.metal}`);
  assert.ok(clicks.freq >= 1500, `弾かれた甲高さが足りない: ${clicks.freq}Hz`);
});

// ============================================
// 装甲の跳弾「カン！」（artillery に MG が当たったとき）
// ============================================
//
// 周回シールドの shieldDeflect と違い、こちらはダメージが入っている
// （軽減されているだけ）。0.2秒に1回まで間引いても連続で鳴るので、
// 一撃で終わる shieldDeflect より控えめかつ短くする必要がある。

test('表に armorRicochet がある', () => {
  assert.ok(WEAPON_SOUNDS.armorRicochet, '表に無い');
});

test('跳弾「カン！」は鳴っている（無音ではない）', () => {
  const level = levelOf('armorRicochet');
  assert.ok(level > 0.001, `ほぼ無音: ${level}`);
});

test('跳弾「カン！」はシールドの跳弾より控えめ', () => {
  const rel = db(levelOf('armorRicochet') / levelOf('shieldDeflect'));
  assert.ok(rel < -2, `繰り返し鳴るのに控えめになっていない: ${rel.toFixed(1)}dB`);
  assert.ok(rel > -12, `小さすぎて「弾かれている」と分からない: ${rel.toFixed(1)}dB`);
});

// 「カン！カン！」と連なるので、尾を引くと2発目と重なって濁る
test('跳弾「カン！」は非常に短い（0.06秒以内）', () => {
  const d = profileDuration(WEAPON_SOUNDS.armorRicochet);
  assert.ok(d <= 0.06, `長すぎる: ${d}秒`);
});

// シールドが「完全に弾いた」のか、装甲で「削れてはいる」のかを耳で分ける
test('跳弾「カン！」はシールドの跳弾より高い', () => {
  assert.ok(
    WEAPON_SOUNDS.armorRicochet.clicks.freq > WEAPON_SOUNDS.shieldDeflect.clicks.freq,
    '音程が同じ帯域で、シールドの跳弾と聞き分けられない',
  );
});
