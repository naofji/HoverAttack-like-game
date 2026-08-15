import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyTurret } from '../src/js/entities/EnemyTurret.js';
import { ReflectBeam } from '../src/js/entities/ReflectBeam.js';
import { makeMap } from './helpers/enemy-world.js';
import { makeFakeCtx, extractPolylines } from './helpers/fake-ctx.js';
import {
  REFLECT_BEAM_CANNON_HP, REFLECT_BEAM_CANNON_SCORE, ENEMY_TURRET_HP,
  REFLECT_BEAM_MUZZLE_FLASH_FRAMES, COLOR_BEAM_CANNON_BARREL,
  REFLECT_BEAM_BURST_DELAY, ENEMY_TURRET_BURST_DELAY,
} from '../src/js/utils/Constants.js';

// 砲身の見た目パラメータ。draw() 側と同じ値をここでも持つ（描画専用の値は
// Constants ではなく EnemyTurret.js のモジュールスコープにあるため、テスト側で
// 別途決め打つ）。BARREL_LENGTH=14, BARREL_BASE=4
const BARREL_BASE = 4;
const BARREL_LENGTH = 14;

const ROOM = [
  '####################',
  '#..................#',
  '#..................#',
  '#..................#',
  '####################',
];

function makeGame() {
  const map = makeMap(ROOM);
  return {
    map, enemies: [], enemyBullets: [], particles: [], projectiles: [],
    missionsCompleted: 6,
    player: { x: 100, y: 40, width: 16, height: 16, alive: true, docked: false },
    carrier: null,
    score: 0,
    addScore(n) { this.score += n; },
    // playDestruction() が die() 経由で呼ぶ。brief 添付のフィクスチャには無く、
    // 無いと TypeError で「HP とスコア」のテストが落ちていた（本題の HP/スコア判定と無関係の理由）
    spawnDebris() {},
    spawnSparks() {}, spawnExplosion() {},
  };
}

/** 撃つまで update を回す。 */
function fireOnce(turret, game) {
  for (let i = 0; i < 600 && game.enemyBullets.length === 0; i++) turret.update();
}

test('既定は従来のタレット', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false);
  assert.equal(t.type, 'gun');
  assert.equal(t.maxHp, ENEMY_TURRET_HP);
});

// TURRET_TYPES はプレーンオブジェクトなので、`TURRET_TYPES[type]` という
// 真偽判定だと Object.prototype 由来のキー（'constructor' など）まで
// 「存在する」と誤判定してしまい、gun へのフォールバックが効かない。
// 実際に type='constructor' を渡すと spec が Object.prototype.constructor に
// なり、hp が undefined の不死身タレットになっていた（レビューで指摘）。
test('未知の type (プロトタイプのキー) は gun にフォールバックする', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'constructor');
  assert.equal(t.type, 'gun', '未知の type が gun にフォールバックしていない');
  assert.equal(t.hp, ENEMY_TURRET_HP, 'HP が gun の値になっていない');
  assert.equal(t.maxHp, ENEMY_TURRET_HP, 'maxHp が gun の値になっていない');
});

test('beam 型は反射ビームを撃つ', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  fireOnce(t, game);
  assert.equal(game.enemyBullets.length, 1, 'ビームが出ていない');
  assert.ok(game.enemyBullets[0] instanceof ReflectBeam, '出たのがビームではない');
});

// 2連弾の1本目・2本目が「同一フレーム」に出てしまうと、狙い直しの意味が無くなる。
// 1発目が出た瞬間には enemyBullets はまだ1発で、REFLECT_BEAM_BURST_DELAY フレーム
// 進めてはじめて2発目が出ることを縛る（同時発射に戻っていたら失敗する形）
test('beam 型は1回の攻撃で2発を、間隔を空けて撃つ', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  fireOnce(t, game);
  assert.equal(game.enemyBullets.length, 1, '1発目の時点で2発出ている（同時発射のまま）');

  // burstTimer は発射した瞬間に spec.burstDelay(=REFLECT_BEAM_BURST_DELAY) に
  // セットされ、以後の update() で 1 ずつ減って 0 になった「次の」呼び出しで
  // 撃つ（_updateStateMachine 参照）。よって2発目が出るまでに必要な追加の
  // update() 呼び出しは REFLECT_BEAM_BURST_DELAY + 1 回
  for (let i = 0; i < REFLECT_BEAM_BURST_DELAY; i++) t.update();
  assert.equal(game.enemyBullets.length, 1, '間隔を空けずに2発目が出た');

  t.update();
  assert.equal(game.enemyBullets.length, 2, '2発目が出ていない');
});

test('beam 型は1回の攻撃(2発)のあとは連射しない（クールダウン中は増えない）', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  fireOnce(t, game);
  for (let i = 0; i < REFLECT_BEAM_BURST_DELAY + 1; i++) t.update();
  const afterFirstVolley = game.enemyBullets.length;
  assert.equal(afterFirstVolley, 2);
  // 撃った直後にさらに回しても、クールダウン中は増えない
  // （REFLECT_BEAM_CANNON_COOLDOWN=180 より短い範囲で見る。長く回すと次の
  // クールダウン明けの攻撃が始まってしまい、この「連射しない」テストの趣旨とは
  // 別の話になる）
  for (let i = 0; i < 100; i++) t.update();
  assert.equal(game.enemyBullets.length, afterFirstVolley, '連射している');
});

test('beam 型は HP とスコアが専用の値になる', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  assert.equal(t.maxHp, REFLECT_BEAM_CANNON_HP);
  t.die();
  assert.equal(game.score, REFLECT_BEAM_CANNON_SCORE);
});

// 撃ったことを伝えるための演出。**予告ではない**ので、撃つ前には光らない
test('撃った瞬間に砲口の放射光が出て、やがて消える', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  assert.equal(t.muzzleFlash, 0, '撃つ前から光っている');
  fireOnce(t, game);
  assert.equal(t.muzzleFlash, REFLECT_BEAM_MUZZLE_FLASH_FRAMES);
  for (let i = 0; i < REFLECT_BEAM_MUZZLE_FLASH_FRAMES + 1; i++) t.update();
  assert.equal(t.muzzleFlash, 0, '光が消えていない');
});

test('放射光は円形のグラデーションで描かれる', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  fireOnce(t, game);

  const lit = makeFakeCtx();
  t.draw(lit);
  assert.ok(lit.calls.some((c) => c.name === 'arc'), '放射光の円が描かれていない');

  t.muzzleFlash = 0;
  const dark = makeFakeCtx();
  t.draw(dark);
  const arcs = (ctx) => ctx.calls.filter((c) => c.name === 'arc').length;
  assert.ok(arcs(lit) > arcs(dark), '光っていないときと同じ描画になっている');
});

test('beam 型は明るい灰色で描かれる', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  const ctx = makeFakeCtx();
  t.draw(ctx);
  const colors = ctx.calls.filter((c) => c.name === 'set:fillStyle').map((c) => c.args[0]);
  assert.ok(colors.includes(COLOR_BEAM_CANNON_BARREL), '専用の色で描かれていない');
});

// 遮蔽に隠れても撃ってこないと、隠れているだけで安全になってしまう。
// 反射する武器なので、壁越しに撃って跳ね返らせるのがこの砲台の見せ場
test('beam 型は視線が通らなくても撃つ', () => {
  const game = makeGame();
  // 自機との間を壁で塞ぐ（この部屋の作りに合わせて自分で座標を決めること）
  game.map.isSolidAtPixel = (x, y) => x > 60 && x < 80;
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  for (let i = 0; i < 600 && game.enemyBullets.length === 0; i++) t.update();
  assert.ok(game.enemyBullets.length > 0, '遮蔽があると撃たない');
});

test('gun 型は視線が通らないと撃たない', () => {
  const game = makeGame();
  game.map.isSolidAtPixel = (x, y) => x > 60 && x < 80;
  const t = new EnemyTurret(game, 32, 40, false, 'gun');
  for (let i = 0; i < 600; i++) t.update();
  assert.equal(game.enemyBullets.length, 0, '遮蔽があるのに撃っている');
});

// 今回の要望の本体: 2発目は「撃つ瞬間の自機の位置」を向く。1発目のあと自機を
// 動かしてから2発目を撃たせ、角度が動いた後の自機の方向と一致することを縛る。
// `_updateAiming()` を1発目の角度で固定してしまう回帰が起きれば、この角度の
// 一致が崩れて失敗する
test('2発目は撃つ瞬間の自機の位置へ狙い直す', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  fireOnce(t, game);
  assert.equal(game.enemyBullets.length, 1);
  const firstAngle = Math.atan2(game.enemyBullets[0].vy, game.enemyBullets[0].vx);

  // 1発目のあと、自機を大きく動かす（下方向へ）
  game.player.x = 100;
  game.player.y = 150;

  for (let i = 0; i < REFLECT_BEAM_BURST_DELAY + 1; i++) t.update();
  assert.equal(game.enemyBullets.length, 2, '2発目が出ていない');

  const secondAngle = Math.atan2(game.enemyBullets[1].vy, game.enemyBullets[1].vx);
  assert.notEqual(firstAngle, secondAngle, '2発とも同じ角度のまま（狙い直していない）');

  // 動いた後の自機の方向と一致すること
  const cx = t.x + t.width / 2;
  const cy = t.y + t.height / 2;
  const expected = Math.atan2(
    game.player.y + game.player.height / 2 - cy,
    game.player.x + game.player.width / 2 - cx,
  );
  assert.ok(Math.abs(secondAngle - expected) < 1e-6, '2発目が動いた後の自機を向いていない');
});

// 上のテストの対照実験: 自機が動かなければ2発の角度は同じになる（角度差は
// 「狙い直し」の結果であって、常に角度が変わる仕掛けではないことを縛る）
test('自機が動かなければ2発の角度は同じ', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  fireOnce(t, game);
  const firstAngle = Math.atan2(game.enemyBullets[0].vy, game.enemyBullets[0].vx);

  for (let i = 0; i < REFLECT_BEAM_BURST_DELAY + 1; i++) t.update();
  assert.equal(game.enemyBullets.length, 2);
  const secondAngle = Math.atan2(game.enemyBullets[1].vy, game.enemyBullets[1].vx);

  assert.equal(firstAngle, secondAngle, '自機が動いていないのに角度が変わった');
});

// 型ごとに連射間隔を持たせた影響で、既存の gun 型（連射間隔10）を壊していないこと
test('gun 型の連射間隔は従来どおり10のまま', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'gun');
  for (let i = 0; i < 600 && game.enemyBullets.length === 0; i++) t.update();
  assert.equal(game.enemyBullets.length, 1);

  for (let i = 0; i < ENEMY_TURRET_BURST_DELAY; i++) t.update();
  assert.equal(game.enemyBullets.length, 1, '2発目が早く出すぎている（間隔が10より短い）');

  t.update();
  assert.equal(game.enemyBullets.length, 2, '2発目が出ていない（間隔が10より長い）');
});

// 発射位置が砲身の中だと、放射光がビームの根元に隠れて見えない（実機で指摘）。
// 発射後は反動で _muzzleOffset() の値が動く（砲身が縮む）ので、ここで比べるのは
// 発射した瞬間に固定された muzzleFlashOffset。これなら「放射光とビームが
// 同じ点から出ている」ことを直接縛れる
test('ビームは砲口（砲身の先端）から出る', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  for (let i = 0; i < 600 && game.enemyBullets.length === 0; i++) t.update();

  const cx = t.x + t.width / 2;
  const cy = t.y + t.height / 2;
  const off = t.muzzleFlashOffset;
  for (const b of game.enemyBullets) {
    const d = Math.hypot(b.x - cx, b.y - cy);
    assert.ok(Math.abs(d - off) < 1e-6, `砲口(${off})から出ていない: ${d}`);
  }
});

/**
 * ctx.calls の全ポリラインの中から、「垂直（x1===x2）かつ砲身の厚み(±2)より
 * 上下へはみ出す」線分を集める。
 *
 * フィンは1回の beginPath〜stroke の中で moveTo/lineTo を count 回繰り返して
 * 描いているため、extractPolylines() は全体を1本の折れ線として返す
 * （`beginPath`〜`stroke` の間の点をまとめて1本にする仕様）。以前は
 * 「最初のポリラインを2点ずつに切って垂直線分を数える」実装にしていたが、
 * これだと①gun 型に誤って fins を足しても「垂直な短い線分が無い」ことしか
 * 見ておらず素通りする穴があり（レビュー指摘）、②draw() の描画順が変わって
 * フィンが最初のポリラインでなくなると無関係な線を掴んで壊れる、という
 * 2つの問題があった。全ポリライン・全線分を対象にすることで両方を塞ぐ。
 */
function findFinSegments(calls) {
  const out = [];
  for (const line of extractPolylines(calls)) {
    for (let i = 0; i + 1 < line.length; i++) {
      const p0 = line[i];
      const p1 = line[i + 1];
      if (p0.x === p1.x && Math.abs(p0.y) > 2 && Math.abs(p1.y) > 2) {
        out.push([p0, p1]);
      }
    }
  }
  return out;
}

// 冷却フィン（ラジエーター）。普通のタレットとの見分けが色だけに頼っていたのを、
// 輪郭の凹凸でも区別できるようにするための追加。beam 型だけが持つ
test('beam 型は砲身に冷却フィンが立つ', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  const ctx = makeFakeCtx();
  t.draw(ctx);

  const barrelLength = BARREL_LENGTH - t.recoil;
  const finLines = findFinSegments(ctx.calls);
  assert.equal(finLines.length, t.spec.fins.count, 'フィンの本数が違う');

  for (const [p0, p1] of finLines) {
    // 砲身の中心線に対して上下対称であること
    assert.ok(p0.y === -p1.y, 'フィンが砲身の中心線に対して非対称');
    // 砲身の範囲の内側にあること（付け根と砲口を空ける）
    assert.ok(p0.x > BARREL_BASE && p0.x < BARREL_BASE + barrelLength, 'フィンが砲身の外にある');
  }
});

test('gun 型は冷却フィンを持たない', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'gun');
  const ctx = makeFakeCtx();
  t.draw(ctx);

  const finLines = findFinSegments(ctx.calls);
  assert.equal(finLines.length, 0, 'gun 型にフィンが出ている');
});
