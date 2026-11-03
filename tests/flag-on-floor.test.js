// ボス（敵基地）を倒した後のフラッグが、床の上に立っているか。
//
// 基地の箱は床より ENEMY_BASE_DRAW_OVERHANG(12px) だけ上に置いてある
// （構造物の描画が箱の下へはみ出すぶん。base-sits-on-floor.test.js 参照）。
// フラッグの足元を箱の下端に合わせると、床から 12px 浮いて見えていた。
// 足元は箱ではなく床の表面に合わせる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';
import {
  ENEMY_BASE_WIDTH, ENEMY_BASE_HEIGHT, ENEMY_BASE_DRAW_OVERHANG, FLAG_HEIGHT, TILE_SIZE,
} from '../src/js/utils/Constants.js';

test('フラッグの棒の下端が、基地の置かれていた床の表面に接する', () => {
  const floorTop = 40 * TILE_SIZE;
  // Map の enemyBaseSpawn と同じ置き方（箱の下端 = 床 - はみ出し量）
  const base = {
    alive: false,
    x: 10 * TILE_SIZE,
    y: floorTop - ENEMY_BASE_HEIGHT - ENEMY_BASE_DRAW_OVERHANG,
    width: ENEMY_BASE_WIDTH,
    height: ENEMY_BASE_HEIGHT,
  };
  const fake = { base, flag: null, gameState: 'playing', player: null };
  Game._checkMissionClear.call(fake);
  assert.ok(fake.flag, 'フラッグが出る');
  assert.equal(fake.flag.y + FLAG_HEIGHT, floorTop,
    `足元が床の表面(${floorTop})から ${floorTop - (fake.flag.y + FLAG_HEIGHT)}px 浮いている`);
});
