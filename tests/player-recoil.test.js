// 自機の被弾ノックバック（反動）。2026-11-23 ユーザー指定:「敵のアタッカーと同じように自機も被弾したときに
// ノックバックするように。勢いで岩にめり込まないように」。
// 速度は前から applyKnockback で書き換えていたが、次のフレームで左右の入力（±MAX の代入）と地面の摩擦に
// 消されて、ほとんど飛ばされていなかった。アタッカーと同じく反動の時間（PLAYER_RECOIL_FRAMES）を持たせ、
// その間は左右の入力と摩擦を止める。MG の弾では飛ばない（アタッカーも MG では飛ばない）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { CollisionManager } from '../src/js/systems/CollisionManager.js';
import { EnemyHomingMissile } from '../src/js/entities/EnemyHomingMissile.js';
import { EnemyBullet } from '../src/js/entities/EnemyBullet.js';
import { applyKnockback } from '../src/js/utils/Knockback.js';
import { makeMap, makeGame, flatFloorRows } from './helpers/enemy-world.js';
import {
  TILE_SIZE, PLAYER_RECOIL_FRAMES, PLAYER_MAX_SPEED,
  MISSILE_HIT_KNOCKBACK_VX, MISSILE_HIT_KNOCKBACK_VY, LANDMINE_KNOCKBACK_VX, LANDMINE_KNOCKBACK_VY,
} from '../src/js/utils/Constants.js';

const T = TILE_SIZE;

function inputWith(held) {
  return {
    keys: {}, isKeyDown: (c) => held.has(c), isKeyPressed: () => false, isCharPressed: () => false,
    mouse: { left: false, right: false }, isLeftClickPressed: () => false, isRightClickPressed: () => false,
    rightHoldFrames: 0, crosshairLocked: false,
    getMouseWorld: () => ({ x: 0, y: 0 }), getTargetWorld: () => ({ x: 0, y: 0 }),
  };
}

function setup(rows = flatFloorRows(), x = 8 * T, y = 2 * T) {
  const game = makeGame(makeMap(rows));
  game.spawnHeavyDamage = () => {};
  const held = new Set();
  game.input = inputWith(held);
  const p = new Player(game, x, y);
  p.docked = false;
  p.invincibleTimer = 0;
  game.player = p;
  for (let i = 0; i < 60; i++) p.update();   // 床に降ろす
  return { game, p, held };
}

const cx = (p) => p.x + p.width / 2;
const cy = (p) => p.y + p.height / 2;

test('ミサイルに当たると、反対へ入力していても反動の間は飛ばされた向きへ動き、明けたら入力が戻る', () => {
  const { game, p, held } = setup();
  held.add('KeyA');   // 左へ歩いている
  p.update();
  const cm = new CollisionManager(game);
  // 左から当たる → 右へ飛ばされる
  cm._enemyMissileVsTargets({ x: cx(p) - 4, y: cy(p), isRival: false, alive: true });
  assert.equal(p.recoilTimer, PLAYER_RECOIL_FRAMES);
  const x0 = p.x;
  for (let i = 0; i < PLAYER_RECOIL_FRAMES; i++) {
    p.update();
    assert.ok(p.vx > 0, `${i} フレーム目で入力に戻った vx ${p.vx}`);
  }
  assert.ok(p.x - x0 >= MISSILE_HIT_KNOCKBACK_VX * PLAYER_RECOIL_FRAMES * 0.8, `飛ばされた距離 ${(p.x - x0).toFixed(1)}`);
  p.update();
  assert.equal(p.vx, -PLAYER_MAX_SPEED, '反動が明けても入力が戻らない');
});

test('止まっていても、地面の摩擦ですぐには止まらず飛ばされる（地雷・爆風・Orb など applyKnockback 全部）', () => {
  const { p } = setup();
  const x0 = p.x;
  applyKnockback(p, -1, LANDMINE_KNOCKBACK_VY, LANDMINE_KNOCKBACK_VX);   // 右から → 左へ
  assert.equal(p.recoilTimer, PLAYER_RECOIL_FRAMES);
  for (let i = 0; i < 10; i++) p.update();
  assert.ok(x0 - p.x >= LANDMINE_KNOCKBACK_VX * 10 * 0.8, `飛ばされた距離 ${(x0 - p.x).toFixed(1)}`);
});

test('ホーミングミサイルの直撃でも飛ばされる', () => {
  const { game, p } = setup();
  const cm = new CollisionManager(game);
  const m = new EnemyHomingMissile(game, cx(p) + 4, cy(p), Math.PI);   // 右から → 左へ
  cm._applyBulletHit(m, p);
  assert.equal(p.recoilTimer, PLAYER_RECOIL_FRAMES);
  assert.equal(p.vx, -MISSILE_HIT_KNOCKBACK_VX);
  assert.equal(p.vy, MISSILE_HIT_KNOCKBACK_VY);
});

test('敵の MG の弾では飛ばされない（アタッカーも MG では飛ばない）', () => {
  const { game, p } = setup();
  const cm = new CollisionManager(game);
  const b = new EnemyBullet(game, cx(p) - 4, cy(p), 0);
  const vx = p.vx;
  cm._applyBulletHit(b, p);
  assert.equal(p.recoilTimer, 0);
  assert.equal(p.vx, vx);
});

test('死んで出直したら反動は残らない', () => {
  const { p } = setup();
  applyKnockback(p, 1, LANDMINE_KNOCKBACK_VY, LANDMINE_KNOCKBACK_VX);
  p.respawn(8 * T, 2 * T);
  assert.equal(p.recoilTimer, 0);
});

/**
 * 機体の当たりの箱が岩に入っているか。当たりの箱は描いた箱より上・左右が 2px、下が 1px 内側
 * （utils/Physics.js の getDefaultCheckPoints と同じ。ホバーで天井に張り付くときも頭が 2px まで岩に重なる作り）。
 * 点ではなく箱の中を 1px おきに見る（点のすき間に岩が入っていても拾う）
 */
function inRock(map, p) {
  const x0 = p.x + 2, x1 = p.x + p.width - 2, y0 = p.y + 2, y1 = p.y + p.height - 1;
  for (let x = x0; x <= x1 + 1e-9; x += 1) {
    for (let y = y0; y <= y1 + 1e-9; y += 1) {
      if (map.isSolidAtPixel(x, y)) return true;
    }
  }
  return map.isSolidAtPixel(x1, y1);
}

test('壁・天井・段のそばで一番強い地雷の反動を受けても、岩にめり込まない', () => {
  // 天井の低い通路（高さ 3 タイル）、右に壁、左に段。地雷の反動は上へ 6・横へ 3
  const rows = [];
  for (let r = 0; r < 24; r++) {
    let row = '';
    for (let c = 0; c < 30; c++) {
      const wall = c === 0 || c === 29 || c === 20;                 // 外壁と右の壁
      const ceiling = r <= 16 && c >= 6 && c < 20;                  // 低い天井（row 17〜19 が通路）
      const step = r === 19 && c >= 3 && c < 6;                     // 左の段
      row += (r >= 20 || wall || ceiling || step) ? '#' : '.';
    }
    rows.push(row);
  }
  let checked = 0;
  for (let c = 7; c <= 19; c++) {
    for (const dir of [-1, 1]) {
      for (const hold of [null, 'KeyA', 'KeyD', 'KeyW']) {
        const { game, p, held } = setup(rows, c * T, 17 * T);
        assert.equal(inRock(game.map, p), false, '置いた時点でめり込んでいる');
        if (hold) held.add(hold);
        applyKnockback(p, dir, LANDMINE_KNOCKBACK_VY, LANDMINE_KNOCKBACK_VX);
        for (let i = 0; i < PLAYER_RECOIL_FRAMES + 20; i++) {
          p.update();
          checked++;
          assert.equal(inRock(game.map, p), false,
            `列 ${c}・向き ${dir}・入力 ${hold} の ${i} フレーム目でめり込んだ (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
        }
      }
    }
  }
  assert.ok(checked > 1000);
});
