import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FortressBarrier } from '../src/js/entities/FortressBarrier.js';
// **先頭で静的に読む。** テストの途中で await import すると、先行するテストが
// 差し替えた偽 document を main.js が掴んでしまう（getElementById が無くて落ちた）
import { Game } from '../src/js/main.js';
import { TILE_SIZE } from '../src/js/utils/Constants.js';
import {
  BARRIER_EMITTER_HP, BARRIER_TOUCH_DAMAGE,
  BARRIER_KNOCKBACK_VX, BARRIER_KNOCKBACK_VY,
} from '../src/js/utils/Constants.js';

function makeGame(over = {}) {
  return {
    particles: [], projectiles: [], enemyBullets: [], enemies: [],
    player: null, carrier: null, camera: null,
    spawnExplosion() {}, spawnDebris() {}, addScore() {},
    ...over,
  };
}

/** 列 c、行 top..bottom に張るバリア。 */
function makeBarrier(game, { c = 10, top = 4, bottom = 8 } = {}) {
  return new FortressBarrier(game, { c, top, bottom });
}

function makePlayer(x, y) {
  return {
    x, y, width: 16, height: 24, alive: true, docked: false, invincibleTimer: 0,
    vx: 0, vy: 0, hp: 100,
    takeDamage(n) { this.hp -= n; },
  };
}

test('バリアは上下2基のユニットを両方壊すまで消えない', () => {
  const game = makeGame();
  const b = makeBarrier(game);
  assert.equal(b.active, true, '最初から消えている');
  b.damageEmitter('top', BARRIER_EMITTER_HP);
  assert.equal(b.active, true, '片方だけで消えてしまった');
  b.damageEmitter('bottom', BARRIER_EMITTER_HP);
  assert.equal(b.active, false, '両方壊しても消えない');
});

test('ユニットはミサイル2発ぶんの硬さ', async () => {
  const { DAMAGE_PLAYER_MISSILE } = await import('../src/js/utils/Constants.js');
  assert.equal(BARRIER_EMITTER_HP, DAMAGE_PLAYER_MISSILE * 2);
});

test('自機が触れるとダメージを受け、来た方向へ押し戻される', () => {
  const game = makeGame();
  const b = makeBarrier(game);
  // バリアの左から突っ込む
  const player = makePlayer(b.fieldX - 8, (4 + 1) * TILE_SIZE);
  game.player = player;
  b.update();
  assert.ok(player.hp < 100, 'ダメージを受けていない');
  assert.ok(player.vx < 0, `左から来たのに左へ押し戻されていない (vx=${player.vx})`);
  assert.equal(player.vy, BARRIER_KNOCKBACK_VY);
  assert.equal(Math.abs(player.vx), BARRIER_KNOCKBACK_VX);
});

test('右から突っ込めば右へ押し戻される', () => {
  const game = makeGame();
  const b = makeBarrier(game);
  // 場に重なりつつ、中心より右に居る位置
  const player = makePlayer(b.fieldX + b.fieldW - 2, (4 + 1) * TILE_SIZE);
  game.player = player;
  b.update();
  assert.ok(player.vx > 0, `右から来たのに右へ押し戻されていない (vx=${player.vx})`);
});

test('消えたバリアは自機に何もしない', () => {
  const game = makeGame();
  const b = makeBarrier(game);
  b.damageEmitter('top', BARRIER_EMITTER_HP);
  b.damageEmitter('bottom', BARRIER_EMITTER_HP);
  const player = makePlayer(b.fieldX, (4 + 1) * TILE_SIZE);
  game.player = player;
  b.update();
  assert.equal(player.hp, 100, '消えたのにダメージを受けた');
  assert.equal(player.vx, 0);
});

test('弾もグレネードも吸収される（自機の弾も敵の弾も）', () => {
  const game = makeGame();
  const b = makeBarrier(game);
  const at = (isPlayerOwned) => ({
    x: b.fieldX + 1, y: (4 + 1) * TILE_SIZE, alive: true, exploded: false, isPlayerOwned,
  });
  const mine = at(true);
  const theirs = at(false);
  game.projectiles = [mine, theirs];
  b.update();
  assert.equal(mine.alive, false, '自機の弾が吸収されていない');
  assert.equal(theirs.alive, false, '敵の弾が吸収されていない');
  // 吸収なので爆発しない（exploded を立てて爆発処理を抑える）
  assert.equal(mine.exploded, true);
});

test('ユニットに当たった自機の弾はユニットを削る（吸収されない）', () => {
  const game = makeGame();
  const b = makeBarrier(game);
  const proj = { x: b.units.top.x + 2, y: b.units.top.y + 2, alive: true, exploded: false, isPlayerOwned: true };
  game.projectiles = [proj];
  const before = b.units.top.hp;
  b.update();
  assert.ok(b.units.top.hp < before, 'ユニットが削れていない');
  assert.equal(proj.alive, false, '弾が消えていない');
});

test('敵はダメージを受けない（守備隊が自滅しない）', () => {
  const game = makeGame();
  const b = makeBarrier(game);
  let damaged = false;
  const enemy = {
    x: b.fieldX - 6, y: (4 + 1) * TILE_SIZE, width: 16, height: 12, alive: true,
    vx: 0, vy: 0, takeDamage() { damaged = true; },
  };
  game.enemies = [enemy];
  b.update();
  assert.equal(damaged, false, '守備隊が自分のバリアで削れている');
});

test('敵はバリアで巡回の向きを変える（壁と同じ扱い）', () => {
  const game = makeGame();
  const b = makeBarrier(game);
  const tank = {
    x: b.fieldX - 2, y: b.fieldY + 6, width: 16, height: 12, alive: true,
    vx: 3, vy: 0, patrolDir: 1, facingRight: true, takeDamage() {},
  };
  game.enemies = [tank];
  b.update();
  assert.equal(tank.patrolDir, -1, '巡回の向きが変わっていない');
  assert.equal(tank.facingRight, false, '向きの表示が変わっていない');
  assert.ok(tank.x + tank.width <= b.fieldX, '場の外へ出されていない');
});

test('patrolDir を持たない敵でも落ちない', () => {
  const game = makeGame();
  const b = makeBarrier(game);
  const thing = { x: b.fieldX, y: b.fieldY + 6, width: 16, height: 12, alive: true, vx: 2, vy: 0 };
  game.enemies = [thing];
  b.update();
  assert.ok(thing.x + thing.width <= b.fieldX);
});

test('引数なしで update しても例外を投げない', () => {
  const b = makeBarrier(makeGame());
  b.update();
  b.update();
  assert.ok(true);
});

test('バリアは7面にだけ立ち、階の数だけある', async () => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
  const { SeededRNG } = await import('../src/js/utils/SeededRNG.js');
  const { Map } = await import('../src/js/world/Map.js');
  const { SpawnManager } = await import('../src/js/systems/SpawnManager.js');

  for (const lv of [0, 6]) {
    const map = new Map({ rng: new SeededRNG(1) }, lv);
    const game = makeGame({ map });
    new SpawnManager(game).spawnBarriers();
    const want = map.fortressZones.reduce((a, z) => a + z.barriers.length, 0);
    assert.equal(game.barriers.length, want, `面${lv + 1} のバリアの数`);
    if (lv === 0) assert.equal(game.barriers.length, 0, '7面以外にバリアがある');
    else assert.ok(game.barriers.length > 0, '7面にバリアが無い');
  }
});

test('バリアは階の中に収まる（床や天井に埋まらない）', async () => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
  const { SeededRNG } = await import('../src/js/utils/SeededRNG.js');
  const { Map } = await import('../src/js/world/Map.js');
  const { BLOCK_EMPTY } = await import('../src/js/utils/Constants.js');
  const map = new Map({ rng: new SeededRNG(2) }, 6);
  for (const z of map.fortressZones) {
    for (const spec of z.barriers) {
      const b = new FortressBarrier(makeGame({ map }), spec);
      assert.ok(b.fieldH > 0, 'バリアの高さが 0 以下');
      // 帯が通る行が全部空洞であること
      for (let r = spec.top; r <= spec.bottom; r++) {
        assert.equal(map.grid[r][spec.c], BLOCK_EMPTY,
          `バリアの通り道が岩 (${r},${spec.c})`);
      }
    }
  }
});

import { makeFakeCtx } from './helpers/fake-ctx.js';
import { BARRIER_FLARE_FRAMES, BARRIER_FLARE_HEIGHT } from '../src/js/utils/Constants.js';

test('弾を吸うと、当たった高さに光の輪が残る（消えるだけにしない）', () => {
  const game = makeGame();
  const b = makeBarrier(game);
  const hitY = b.fieldY + 10;
  game.projectiles = [{ x: b.fieldX + 1, y: hitY, alive: true, exploded: false, isPlayerOwned: false }];
  b.update();
  assert.equal(b.flares.length, 1, '吸収の跡が残っていない');
  assert.ok(Math.abs(b.flares[0].y - hitY) < 1, '当たった高さと違う位置に出ている');
  // 閃光の粒も出る（弾が「何かに当たった」ことが伝わるように）
  assert.ok(game.particles.length > 0, '吸収で粒が出ていない');
});

test('光の輪は時間で消える', () => {
  const game = makeGame();
  const b = makeBarrier(game);
  game.projectiles = [{ x: b.fieldX + 1, y: b.fieldY + 10, alive: true, exploded: false, isPlayerOwned: false }];
  b.update();
  game.projectiles = [];
  for (let i = 0; i < BARRIER_FLARE_FRAMES + 2; i++) b.update();
  assert.equal(b.flares.length, 0, `${BARRIER_FLARE_FRAMES} フレーム経っても消えない`);
});

test('光の輪は描画に出る（バリア本体より手前で明るく）', () => {
  const game = makeGame();
  const b = makeBarrier(game);
  game.projectiles = [{ x: b.fieldX + 1, y: b.fieldY + 10, alive: true, exploded: false, isPlayerOwned: false }];
  b.update();
  const plain = makeFakeCtx();
  const withFlare = makeFakeCtx();
  b.draw(withFlare);
  b.flares.length = 0;
  b.draw(plain);
  const rects = (ctx) => ctx.calls.filter((c) => c.name === 'fillRect').length;
  assert.ok(rects(withFlare) > rects(plain), '光の輪が描かれていない');
});

import { BARRIER_SUCK_COUNT, BARRIER_SUCK_FRAMES } from '../src/js/utils/Constants.js';

test('吸収の粒は爆発とは逆に、外から中心へ向かう', () => {
  const game = makeGame();
  const b = makeBarrier(game);
  const hitY = b.fieldY + 10;
  game.projectiles = [{ x: b.fieldX + 1, y: hitY, alive: true, exploded: false, isPlayerOwned: false }];
  b.update();
  const parts = game.particles.filter((p) => p.vx !== undefined);
  assert.equal(parts.length, BARRIER_SUCK_COUNT, '吸収の粒の数が違う');
  const cx = b.fieldX + b.fieldW / 2;
  for (const p of parts) {
    // 速度が中心の方を向いていること。外向き（＝爆発）なら内積が正になる
    const toCenterX = cx - p.x;
    const toCenterY = hitY - p.y;
    const dot = toCenterX * p.vx + toCenterY * p.vy;
    assert.ok(dot > 0, `粒が外を向いている（爆発に見える） v=(${p.vx},${p.vy})`);
  }
});

test('吸収の粒は寿命ぶんでちょうど中心に着く（通り抜けて散らない）', () => {
  const game = makeGame();
  const b = makeBarrier(game);
  const hitY = b.fieldY + 10;
  game.projectiles = [{ x: b.fieldX + 1, y: hitY, alive: true, exploded: false, isPlayerOwned: false }];
  b.update();
  const p = game.particles[0];
  const cx = b.fieldX + b.fieldW / 2;
  const endX = p.x + p.vx * BARRIER_SUCK_FRAMES;
  assert.ok(Math.abs(endX - cx) < 1, `寿命の終わりに中心へ着かない (${endX} vs ${cx})`);
});

test('光の輪は広がるのではなく縮む', () => {
  const game = makeGame();
  const b = makeBarrier(game);
  game.projectiles = [{ x: b.fieldX + 1, y: b.fieldY + 10, alive: true, exploded: false, isPlayerOwned: false }];
  b.update();
  const widthAt = (age) => {
    b.flares[0].age = age;
    const ctx = makeFakeCtx();
    b.draw(ctx);
    // 輪は高さ BARRIER_FLARE_HEIGHT の矩形。ユニット(8px)・ランプ(2px)とは
    // 高さで見分けられるので、それで拾う
    const rect = ctx.calls.find(
      (c) => c.name === 'fillRect' && c.args[3] === BARRIER_FLARE_HEIGHT);
    assert.ok(rect, '輪が描かれていない');
    return rect.args[2];
  };
  assert.ok(widthAt(0) > widthAt(BARRIER_FLARE_FRAMES - 1),
    '輪が広がっている（爆発に見える）');
});

test('ホーミング・反射ビーム・敵の弾（enemyBullets）も吸収する', () => {
  // 実機の指摘。自機の弾は game.projectiles、敵のホーミングと反射ビームは
  // game.enemyBullets に入る。片方だけ見ていると素通りする
  const game = makeGame();
  const b = makeBarrier(game);
  const at = () => ({ x: b.fieldX + 1, y: b.fieldY + 6, alive: true, isPlayerOwned: false });
  const homing = at();
  const beam = at();
  const bullet = at();
  game.enemyBullets = [homing, beam, bullet];
  b.update();
  for (const [name, p] of [['ホーミング', homing], ['反射ビーム', beam], ['敵の弾', bullet]]) {
    assert.equal(p.alive, false, `${name} が吸収されていない`);
  }
  assert.equal(b.flares.length, 3, '吸収した数だけ光の輪が出ていない');
});

import { luminance } from '../src/js/utils/color.js';
import {
  BARRIER_UNIT_COLOR, BARRIER_UNIT_LAMP_COLOR, BARRIER_UNIT_LAMP_OFF_COLOR,
  BLOCK_METAL, BLOCK_HARD, BLOCK_NORMAL, BLOCK_EMPTY,
} from '../src/js/utils/Constants.js';

test('ユニットは地形より遥かに明るい（撃つものだと分かる）', async () => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
  const { SeededRNG } = await import('../src/js/utils/SeededRNG.js');
  const { Map } = await import('../src/js/world/Map.js');
  const m = new Map({ rng: new SeededRNG(1) }, 6);
  const unit = luminance(BARRIER_UNIT_COLOR);
  for (const b of [BLOCK_METAL, BLOCK_HARD, BLOCK_NORMAL]) {
    const terrain = luminance(m.blockStyles[b].fill);
    assert.ok(unit - terrain > 100,
      `ユニット(${unit.toFixed(0)}) が地形(${terrain.toFixed(0)}) に埋もれる`);
  }
});

test('ランプは点いているときも消えているときも本体と見分けられる', () => {
  const body = luminance(BARRIER_UNIT_COLOR);
  const on = luminance(BARRIER_UNIT_LAMP_COLOR);
  const off = luminance(BARRIER_UNIT_LAMP_OFF_COLOR);
  assert.ok(Math.abs(body - on) > 30, `点灯が本体と紛れる (${on.toFixed(0)} vs ${body.toFixed(0)})`);
  assert.ok(Math.abs(body - off) > 30, `消灯が本体と紛れる (${off.toFixed(0)} vs ${body.toFixed(0)})`);
  // 点灯のほうが「明るい」向きに見えるよう、消灯より上に置く
  assert.ok(on > off, `点灯(${on.toFixed(0)}) が消灯(${off.toFixed(0)}) より暗い`);
});

// --- 片方のユニットを壊すと、空中が続く限りバリアが伸びる ---

/** 全部空洞の偽マップ。行 solidRows を岩にする。 */
function fakeMap(rows = 20, cols = 20, solidRows = []) {
  const grid = [];
  for (let r = 0; r < rows; r++) {
    grid.push(new Array(cols).fill(BLOCK_EMPTY));
  }
  for (const r of solidRows) grid[r] = new Array(cols).fill(BLOCK_NORMAL);
  return { rows, cols, grid };
}

test('上のユニットを壊すと、上の岩に当たるまでバリアが伸びる', () => {
  // 行 1 が岩、行 9 が床。バリアは 4..8 に張られている
  const map = fakeMap(20, 20, [1, 9]);
  const game = makeGame({ map });
  const b = new FortressBarrier(game, { c: 10, top: 4, bottom: 8 });
  const before = b.fieldY;
  b.damageEmitter('top', BARRIER_EMITTER_HP);
  b.update();
  assert.ok(b.fieldY < before, 'バリアが上へ伸びていない');
  // 行 1 が岩なので、行 2 の上端まで伸びる
  assert.equal(b.fieldY, 2 * TILE_SIZE, `伸び方が違う (${b.fieldY})`);
});

test('下のユニットを壊すと下へ伸びる', () => {
  const map = fakeMap(20, 20, [1, 15]);
  const game = makeGame({ map });
  const b = new FortressBarrier(game, { c: 10, top: 4, bottom: 8 });
  const beforeBottom = b.fieldY + b.fieldH;
  b.damageEmitter('bottom', BARRIER_EMITTER_HP);
  b.update();
  assert.ok(b.fieldY + b.fieldH > beforeBottom, 'バリアが下へ伸びていない');
  assert.equal(b.fieldY + b.fieldH, 15 * TILE_SIZE, `伸び方が違う (${b.fieldY + b.fieldH})`);
});

test('壊していないうちは伸びない', () => {
  const map = fakeMap(20, 20, [1, 15]);
  const b = new FortressBarrier(makeGame({ map }), { c: 10, top: 4, bottom: 8 });
  const y = b.fieldY;
  const h = b.fieldH;
  b.update();
  assert.equal(b.fieldY, y);
  assert.equal(b.fieldH, h);
});

test('床に穴を開けてから壊すと、その穴を通って伸びる（毎フレーム測り直す）', () => {
  // これがこの仕掛けの肝。床は硬い岩なので自機が壊せる
  const map = fakeMap(20, 20, [1, 9]);
  const game = makeGame({ map });
  const b = new FortressBarrier(game, { c: 10, top: 4, bottom: 8 });
  b.damageEmitter('bottom', BARRIER_EMITTER_HP);
  b.update();
  const blocked = b.fieldY + b.fieldH;
  assert.equal(blocked, 9 * TILE_SIZE, '床で止まっていない');
  // 自機が床のその列に穴を開けた
  map.grid[9][10] = BLOCK_EMPTY;
  b.update();
  assert.ok(b.fieldY + b.fieldH > blocked, '開けた穴を通って伸びていない');
});

test('マップが無くても落ちない（テスト用の偽ゲームで呼ばれる）', () => {
  const b = new FortressBarrier(makeGame(), { c: 10, top: 4, bottom: 8 });
  b.damageEmitter('top', BARRIER_EMITTER_HP);
  b.update();
  assert.ok(b.fieldH > 0);
});

test('タンクやドローンはバリアを突っ切れない（位置ごと戻される）', () => {
  // 速度を押し戻すだけでは、敵は自分の AI で毎フレーム速度を上書きするので
  // すり抜けてしまう（実機の指摘）。位置そのものを場の外へ戻す
  const game = makeGame();
  const b = makeBarrier(game);
  const y = b.fieldY + 6;
  // 場のど真ん中に居る敵（前のフレームで踏み込んでしまった状態）
  const tank = { x: b.fieldX - 2, y, width: 16, height: 12, alive: true, vx: 3, vy: 0, patrolDir: 1, takeDamage() {} };
  game.enemies = [tank];
  b.update();
  const overlapping = tank.x < b.fieldX + b.fieldW && tank.x + tank.width > b.fieldX;
  assert.equal(overlapping, false, `敵が場に重なったまま (x=${tank.x})`);
  assert.ok(tank.x + tank.width <= b.fieldX, '左から来た敵が右側へ抜けている');
  assert.equal(tank.patrolDir, -1, '向きが変わっていない');
});

test('自機も位置ごと戻される（強行突破できない）', () => {
  const game = makeGame();
  const b = makeBarrier(game);
  const player = makePlayer(b.fieldX - 2, b.fieldY + 6);
  game.player = player;
  b.update();
  const overlapping = player.x < b.fieldX + b.fieldW && player.x + player.width > b.fieldX;
  assert.equal(overlapping, false, `自機が場に重なったまま (x=${player.x})`);
});

test('右側から来たものは右側へ戻される', () => {
  const game = makeGame();
  const b = makeBarrier(game);
  const drone = {
    x: b.fieldX + b.fieldW - 2, y: b.fieldY + 6, width: 24, height: 16,
    alive: true, vx: -3, vy: 0, patrolDir: -1, takeDamage() {},
  };
  game.enemies = [drone];
  b.update();
  assert.ok(drone.x >= b.fieldX + b.fieldW, `右から来たのに左側へ抜けている (x=${drone.x})`);
  assert.equal(drone.patrolDir, 1, '向きが変わっていない');
});

// --- ユニットは他の敵と同じ形で HP を持つ（ダメージバーが出る） ---

test('ユニットは hp / maxHp / alive と矩形を1つのオブジェクトで持つ', () => {
  // _drawHpBarIfDamaged は「hp・maxHp・alive・矩形を持つもの」なら何でも受ける。
  // 矩形と HP が別々だと、そこへ渡せる形にならない（実機の指摘）
  const b = makeBarrier(makeGame());
  for (const which of ['top', 'bottom']) {
    const u = b.units[which];
    assert.equal(u.hp, BARRIER_EMITTER_HP);
    assert.equal(u.maxHp, BARRIER_EMITTER_HP);
    assert.equal(u.alive, true);
    for (const k of ['x', 'y', 'width', 'height']) {
      assert.equal(typeof u[k], 'number', `${which}.${k} が数値でない`);
    }
  }
});

test('削れると hp が減り、尽きると alive が false になる', () => {
  const b = makeBarrier(makeGame());
  b.damageEmitter('top', 10);
  assert.equal(b.units.top.hp, BARRIER_EMITTER_HP - 10);
  assert.equal(b.units.top.alive, true, 'まだ生きているはず');
  b.damageEmitter('top', BARRIER_EMITTER_HP);
  assert.equal(b.units.top.alive, false);
  assert.equal(b.units.top.hp, 0, 'HP が負に振れている');
});

test('_drawHpBarIfDamaged が受け付ける形になっている', () => {
  const b = makeBarrier(makeGame());
  const drawn = [];
  const fake = { _drawEnemyHealthBar: (ctx, e) => drawn.push(e) };
  // 無傷なら出ない
  Game._drawHpBarIfDamaged.call(fake, null, b.units.top);
  assert.equal(drawn.length, 0, '無傷なのにバーが出ている');
  // 削れたら出る
  b.damageEmitter('top', 10);
  Game._drawHpBarIfDamaged.call(fake, null, b.units.top);
  assert.equal(drawn.length, 1, '削れてもバーが出ない');
  // 壊れたら出ない
  b.damageEmitter('top', BARRIER_EMITTER_HP);
  Game._drawHpBarIfDamaged.call(fake, null, b.units.top);
  assert.equal(drawn.length, 1, '壊れたユニットにバーが出ている');
});
