// 敵基地が床の上に乗っているか。
//
// 基地の構造物はコアを中心に上下 28px、合わせて 56px の高さで描かれているのに、
// 当たり判定（ENEMY_BASE_HEIGHT）は 32px しかない。素直に
// 「箱の下端＝床の表面」で置くと、はみ出す下 12px ＝ 土台の支柱と締め具が
// まるごと床タイルの中に埋まる。実機で「土台がブロックにめり込んでいる」と
// 見えていたのがこれ。
//
// 置く高さは箱ではなく**描画の下端**を床に合わせる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyBase } from '../src/js/entities/EnemyBase.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import {
  ENEMY_BASE_WIDTH, ENEMY_BASE_HEIGHT, ENEMY_BASE_DRAW_OVERHANG, TILE_SIZE,
} from '../src/js/utils/Constants.js';

/** 構造物の描画が箱のローカル座標で上下どこまで届くか。 */
function structureExtent() {
  const base = Object.create(EnemyBase.prototype);
  base.width = ENEMY_BASE_WIDTH;
  base.height = ENEMY_BASE_HEIGHT;
  const ctx = makeFakeCtx();
  base._drawStructure(ctx);
  let top = Infinity, bottom = -Infinity;
  for (const c of ctx.calls.filter((c) => c.name === 'fillRect')) {
    const [, y, , h] = c.args; // 高さが負の fillRect もある（上向きに描く柱）
    top = Math.min(top, y, y + h);
    bottom = Math.max(bottom, y, y + h);
  }
  return { top, bottom };
}

test('はみ出し量の定数が実際の描画と一致している', () => {
  const { bottom } = structureExtent();
  assert.equal(bottom - ENEMY_BASE_HEIGHT, ENEMY_BASE_DRAW_OVERHANG,
    `構造物は箱の下端より ${bottom - ENEMY_BASE_HEIGHT}px はみ出している`);
});

test('構造物は箱より下へはみ出す（この定数が要る理由）', () => {
  assert.ok(ENEMY_BASE_DRAW_OVERHANG > 0);
});

test('スポーン位置は、構造物の下端が床の表面に接するように決まる', () => {
  // Map._placeMainBase 相当。床の行の上端が床の表面
  const floorR = 40;
  const surfaceY = floorR * TILE_SIZE;
  const spawnY = surfaceY - ENEMY_BASE_HEIGHT - ENEMY_BASE_DRAW_OVERHANG;

  const { bottom } = structureExtent();
  assert.equal(spawnY + bottom, surfaceY, '土台が床の表面に乗っていない');
});

test('周回シールドの羽根も床を越えない（基地を上げたぶんの余裕も使い切らない）', () => {
  const base = Object.create(EnemyBase.prototype);
  base.width = ENEMY_BASE_WIDTH;
  base.height = ENEMY_BASE_HEIGHT;
  const floorLocalY = ENEMY_BASE_HEIGHT + ENEMY_BASE_DRAW_OVERHANG;
  const half = base._orbitMaxHalfHeight();
  assert.ok(base._orbitCenterY() + half <= floorLocalY + 0.001,
    `羽根の下端 ${base._orbitCenterY() + half} が床 ${floorLocalY} を越えている`);
});

test('羽根はコアの高さを中心に回る（床に余裕ができたので寄せられる）', () => {
  const base = Object.create(EnemyBase.prototype);
  base.width = ENEMY_BASE_WIDTH;
  base.height = ENEMY_BASE_HEIGHT;
  assert.equal(base._orbitCenterY(), ENEMY_BASE_HEIGHT / 2,
    'コアの高さから外れている');
});
