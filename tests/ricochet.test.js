// 装甲に弾かれた跳弾の演出。線状の光と「カン！」の音。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { RicochetStreak, ImpactFlash } from '../src/js/entities/Particle.js';
import { playRicochet } from '../src/js/entities/ricochet.js';
import { audioManager } from '../src/js/audio/AudioManager.js';
import {
  RICOCHET_STREAK_LIFETIME, RICOCHET_STREAK_LENGTH, RICOCHET_STREAK_COUNT,
  RICOCHET_SOUND_INTERVAL_MS, COLOR_RICOCHET, COLOR_RICOCHET_FADE,
  RICOCHET_FLASH_RADIUS,
} from '../src/js/utils/Constants.js';

// 音の間引きは playRicochet のモジュール変数で持っている（ゲーム中は1本しか
// 走らないので十分）。テスト間で持ち越さないよう、呼ぶたびに時計を十分先へ送る
let clockBase = 100000;

/** Date.now と audioManager.playWeapon を差し替えて playRicochet を回す。 */
function withClock(fn) {
  const origNow = Date.now;
  const origPlay = audioManager.playWeapon;
  const sounds = [];
  clockBase += 10 * RICOCHET_SOUND_INTERVAL_MS;
  let now = clockBase;
  Date.now = () => now;
  audioManager.playWeapon = (kind) => sounds.push(kind);
  try {
    return fn({ sounds, advance: (ms) => { now += ms; } });
  } finally {
    Date.now = origNow;
    audioManager.playWeapon = origPlay;
  }
}

// ------------------------------------------
// RicochetStreak（線状の光）
// ------------------------------------------

test('跳弾の光は点ではなく線分で描かれる', () => {
  const s = new RicochetStreak(50, 60, 3, 0);
  const ctx = makeFakeCtx();
  s.draw(ctx);
  assert.ok(ctx.calls.some((c) => c.name === 'moveTo'), 'moveTo が無い（線になっていない）');
  assert.ok(ctx.calls.some((c) => c.name === 'lineTo'), 'lineTo が無い');
  assert.ok(ctx.calls.some((c) => c.name === 'stroke'), 'stroke が無い');
});

test('線は進行方向へ伸びる', () => {
  const s = new RicochetStreak(50, 60, 4, 0); // 真右へ飛ぶ
  const ctx = makeFakeCtx();
  s.draw(ctx);
  const from = ctx.calls.find((c) => c.name === 'moveTo').args;
  const to = ctx.calls.find((c) => c.name === 'lineTo').args;
  assert.ok(to[0] > from[0], '線が進行方向に伸びていない');
  assert.ok(Math.abs(to[1] - from[1]) < 0.001, '真横に飛ぶ光が縦に傾いている');
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  assert.ok(Math.abs(len - RICOCHET_STREAK_LENGTH) < 0.001, `線の長さが違う: ${len}`);
});

test('跳弾の光は重力を受けない（落ちると火花に見える）', () => {
  const s = new RicochetStreak(50, 60, 3, 0);
  s.update();
  s.update();
  assert.equal(s.vy, 0, '縦の速度が付いている');
});

test('跳弾の光は寿命で消える', () => {
  const s = new RicochetStreak(50, 60, 3, 0);
  for (let i = 0; i < RICOCHET_STREAK_LIFETIME; i++) {
    assert.equal(s.alive, true, `${i}フレーム目で既に消えている`);
    s.update();
  }
  assert.equal(s.alive, false, '寿命を過ぎても消えていない');
});

test('跳弾の光は白く出て黄へ冷める', () => {
  const fresh = new RicochetStreak(50, 60, 3, 0);
  const c1 = makeFakeCtx();
  fresh.draw(c1);
  // lerpColor は小文字の #rrggbb を返すので、比較は大小文字を無視する
  const first = c1.calls.find((c) => c.name === 'set:strokeStyle').args[0];
  assert.equal(first.toLowerCase(), COLOR_RICOCHET.toLowerCase());

  const old = new RicochetStreak(50, 60, 3, 0);
  for (let i = 0; i < RICOCHET_STREAK_LIFETIME - 1; i++) old.update();
  const c2 = makeFakeCtx();
  old.draw(c2);
  const last = c2.calls.find((c) => c.name === 'set:strokeStyle').args[0];
  assert.notEqual(last.toLowerCase(), first.toLowerCase(), '最後まで同じ色のまま（冷めていない）');
  assert.notEqual(COLOR_RICOCHET, COLOR_RICOCHET_FADE, '出る色と冷める色が同じ');
});

// ------------------------------------------
// playRicochet（呼び出し口）
// ------------------------------------------

function makeGame() {
  return { particles: [] };
}

test('跳弾は光を撒く', () => {
  withClock(() => {
    const game = makeGame();
    playRicochet(game, 100, 50, 4, 0);
    const streaks = game.particles.filter((p) => p instanceof RicochetStreak);
    assert.equal(streaks.length, RICOCHET_STREAK_COUNT);
  });
});

// 「線だけでは地味」という実機フィードバックへの対応。反射ビームの被弾で
// 同じ指摘を受けたときと同じ手当てで、線は散らばって視界の端では拾えないが、
// 1点で光る閃光は拾える
test('跳弾は命中点で閃光を出す', () => {
  withClock(() => {
    const game = makeGame();
    playRicochet(game, 100, 50, 4, 0);
    const flashes = game.particles.filter((p) => p instanceof ImpactFlash);
    assert.equal(flashes.length, 1, '閃光が出ていない');
    assert.equal(flashes[0].x, 100);
    assert.equal(flashes[0].y, 50);
    assert.equal(flashes[0].radius, RICOCHET_FLASH_RADIUS);
  });
});

test('跳弾は弾が来た向きへ跳ね返る', () => {
  withClock(() => {
    const game = makeGame();
    playRicochet(game, 100, 50, 4, 0); // 右向きに飛んできた弾
    const streaks = game.particles.filter((p) => p instanceof RicochetStreak);
    assert.ok(streaks.length > 0);
    assert.ok(streaks.every((p) => p.vx < 0),
      '入射と同じ向きへ抜けている（跳ね返って見えない）');
  });
});

test('跳弾は「カン！」を鳴らす', () => {
  withClock(({ sounds }) => {
    playRicochet(makeGame(), 100, 50, 4, 0);
    assert.deepEqual(sounds, ['armorRicochet']);
  });
});

// MG は4フレームに1発＝毎秒15発。当たるたびに鳴らすとただの雑音になる
test('連射で当て続けても音は間引かれる', () => {
  withClock(({ sounds, advance }) => {
    const game = makeGame();
    for (let i = 0; i < 10; i++) {
      playRicochet(game, 100, 50, 4, 0);
      advance(16); // 約1フレーム
    }
    assert.equal(sounds.length, 1, `間引きが効いていない: ${sounds.length}回`);
    const streaks = game.particles.filter((p) => p instanceof RicochetStreak);
    assert.equal(streaks.length, RICOCHET_STREAK_COUNT * 10,
      '光まで間引かれている（弾は出続けているので毎発光ってよい）');
  });
});

test('間隔をあければまた鳴る', () => {
  withClock(({ sounds, advance }) => {
    playRicochet(makeGame(), 100, 50, 4, 0);
    advance(RICOCHET_SOUND_INTERVAL_MS + 1);
    playRicochet(makeGame(), 100, 50, 4, 0);
    assert.equal(sounds.length, 2);
  });
});
