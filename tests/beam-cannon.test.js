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
  REFLECT_BEAM_CHARGE_MIN, REFLECT_BEAM_CHARGE_MAX,
  COLOR_BEAM_CANNON_LAMP_DIM, COLOR_BEAM_CANNON_LAMP_BRIGHT,
  COLOR_BEAM_CANNON_LAMP_BACK, COLOR_BEAM_CANNON_FIN, COLOR_BEAM_CANNON_PIVOT,
  BEAM_LAMP_RING_OUTER, BEAM_LAMP_RING_INNER,
  REFLECT_BEAM_SECOND_SHOT_OFFSET, REFLECT_BEAM_SECOND_SHOT_JITTER,
} from '../src/js/utils/Constants.js';
import { lerpColor } from '../src/js/utils/color.js';

// 砲身の見た目パラメータ。draw() 側と同じ値をここでも持つ（描画専用の値は
// Constants ではなく EnemyTurret.js のモジュールスコープにあるため、テスト側で
// 別途決め打つ）。BARREL_LENGTH=14, BARREL_BASE=4
const BARREL_BASE = 4;
const BARREL_LENGTH = 14;
// ランプ本体の半径。draw() 側と同じ値（描画専用なので EnemyTurret.js の
// モジュールスコープにあり、import できない）
const BEAM_LAMP_CORE_RADIUS_FOR_TEST = 2;

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
  // （REFLECT_BEAM_CHARGE_MIN=180 より短い範囲で見る。長く回すと次の充填明けの
  // 攻撃が始まってしまい、この「連射しない」テストの趣旨とは別の話になる）
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

// 今回の要望の本体: 2発目は「撃つ瞬間の自機の位置」を向く（± 小さな角度のずれを
// 別に足す。それは REFLECT_BEAM_SECOND_SHOT_OFFSET 側のテストで扱う）。1発目の
// あと自機を動かしてから2発目を撃たせ、角度が「動いた後の自機の方向 ± ずれ」に
// なっていることを縛る。`_updateAiming()` を1発目の角度で固定してしまう回帰や、
// ずれが狙い直しを上書きしてしまう回帰が起きれば、この一致が崩れて失敗する
test('2発目は撃つ瞬間の自機の位置へ狙い直す（± ずれの範囲で）', () => {
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

  // 動いた後の自機の方向 ± REFLECT_BEAM_SECOND_SHOT_OFFSET のどちらかと一致すること
  // （狙い直しが、ずれに置き換わっていないことを縛る）
  const cx = t.x + t.width / 2;
  const cy = t.y + t.height / 2;
  const expected = Math.atan2(
    game.player.y + game.player.height / 2 - cy,
    game.player.x + game.player.width / 2 - cx,
  );
  const diff = Math.abs(secondAngle - expected);
  // REFLECT_BEAM_SECOND_SHOT_JITTER ぶんのランダムなブレが乗るようになったので、
  // 厳密な一致ではなく、そのブレの範囲に収まっていることを縛る（性質は変えず、
  // ブレのぶんだけ許容を広げる）
  assert.ok(
    Math.abs(diff - REFLECT_BEAM_SECOND_SHOT_OFFSET) <= REFLECT_BEAM_SECOND_SHOT_JITTER + 1e-9,
    `2発目が「動いた後の自機 ± ずれ」を向いていない: diff=${diff}`,
  );
});

// 今回の要望の本体: 自機が止まっていて狙い直しが効かなくても、2発目には
// REFLECT_BEAM_SECOND_SHOT_OFFSET ぶんのずれが乗るので2発の角度は違う。
// オフセットを0にする回帰（あるいは足し忘れ）が起きれば失敗する
test('自機が動かなくても、2発目には小さな角度のずれが乗る', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  fireOnce(t, game);
  const firstAngle = Math.atan2(game.enemyBullets[0].vy, game.enemyBullets[0].vx);

  for (let i = 0; i < REFLECT_BEAM_BURST_DELAY + 1; i++) t.update();
  assert.equal(game.enemyBullets.length, 2);
  const secondAngle = Math.atan2(game.enemyBullets[1].vy, game.enemyBullets[1].vx);

  assert.notEqual(firstAngle, secondAngle, '自機が動いていないのに2発の角度が同じ（ずれが乗っていない）');
  const diff = Math.abs(secondAngle - firstAngle);
  // ブレのぶんだけ許容を広げる（上と同じ理由）
  assert.ok(
    Math.abs(diff - REFLECT_BEAM_SECOND_SHOT_OFFSET) <= REFLECT_BEAM_SECOND_SHOT_JITTER + 1e-9,
    `ずれの大きさが REFLECT_BEAM_SECOND_SHOT_OFFSET と違う: diff=${diff}`,
  );
});

// 1発目はずらさない。狙った方向そのままに飛ぶことを縛る
test('1発目はずらさない（狙った方向そのまま）', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  fireOnce(t, game);
  assert.equal(game.enemyBullets.length, 1);

  const cx = t.x + t.width / 2;
  const cy = t.y + t.height / 2;
  const expected = Math.atan2(
    game.player.y + game.player.height / 2 - cy,
    game.player.x + game.player.width / 2 - cx,
  );
  const firstAngle = Math.atan2(game.enemyBullets[0].vy, game.enemyBullets[0].vx);
  assert.ok(Math.abs(firstAngle - expected) < 1e-9, '1発目が狙った方向からずれている');
});

// ずらす側は発射のたびに交互に入れ替える。毎回同じ側だと避け方を覚えられ、
// 乱数だと同じ側が続くことがあるため（乱数は使わない方針。game.rng も消費しない）。
// 1回目の攻撃(2発)と2回目の攻撃(2発)、それぞれの「2発目のずれの符号」が
// 逆になっていることを縛る
test('2発目のずれは発射のたびに交互になる', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');

  fireOnce(t, game);
  for (let i = 0; i < REFLECT_BEAM_BURST_DELAY + 1; i++) t.update();
  assert.equal(game.enemyBullets.length, 2, '1回目の攻撃で2発出ていない');
  const angle1a = Math.atan2(game.enemyBullets[0].vy, game.enemyBullets[0].vx);
  const angle1b = Math.atan2(game.enemyBullets[1].vy, game.enemyBullets[1].vx);
  const side1 = Math.sign(angle1b - angle1a);

  // 充填を待たずに2回目の攻撃へ進める（充填時間そのものはこのテストの対象では
  // ないため、cooldownTimer を直接0にして次の攻撃をすぐ始める）。fireOnce() は
  // 「弾が0発の状態から1発出るまで」を回す作りなので、既に2発ある状態からは
  // 使えず、ここでは3発目が出るまで直接回す
  t.cooldownTimer = 0;
  for (let i = 0; i < 600 && game.enemyBullets.length < 3; i++) t.update();
  for (let i = 0; i < REFLECT_BEAM_BURST_DELAY + 1; i++) t.update();
  assert.equal(game.enemyBullets.length, 4, '2回目の攻撃で2発出ていない');
  const angle2a = Math.atan2(game.enemyBullets[2].vy, game.enemyBullets[2].vx);
  const angle2b = Math.atan2(game.enemyBullets[3].vy, game.enemyBullets[3].vx);
  const side2 = Math.sign(angle2b - angle2a);

  assert.notEqual(side1, 0, '1回目のずれが検出できていない');
  assert.notEqual(side2, 0, '2回目のずれが検出できていない');
  assert.notEqual(side1, side2, 'ずらす側が交互になっていない（毎回同じ側）');
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
 * ctx.calls から「フィンの色で塗られた矩形」を集める。
 *
 * フィンは以前 stroke の縦線で描いていたが、砲身(高さ4px)の倍の高さの線が
 * 宙に浮いて「櫛」に見え、砲台の形が破綻していた（実機フィードバック）。
 * 塗りのある板に作り直したので、テストも fillRect を見る形へ変えた。
 * 色で絞ることで、砲身・エミッタ・台座の矩形と取り違えない。
 */
function findFinRects(calls) {
  const out = [];
  let fillStyle = null;
  for (const c of calls) {
    if (c.name === 'set:fillStyle') fillStyle = c.args[0];
    else if (c.name === 'fillRect' && fillStyle === COLOR_BEAM_CANNON_FIN) {
      const [x, y, w, h] = c.args;
      out.push({ x, y, w, h });
    }
  }
  return out;
}

/** 指定色で塗られた矩形を集める（エミッタの検証用） */
function findRectsOfColor(calls, color) {
  const out = [];
  let fillStyle = null;
  for (const c of calls) {
    if (c.name === 'set:fillStyle') fillStyle = c.args[0];
    else if (c.name === 'fillRect' && fillStyle === color) {
      const [x, y, w, h] = c.args;
      out.push({ x, y, w, h });
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
  const fins = findFinRects(ctx.calls);
  assert.equal(fins.length, t.spec.fins.count, 'フィンの本数が違う');

  for (const r of fins) {
    // 砲身の中心線に対して上下対称であること
    assert.equal(r.y, -(r.y + r.h), 'フィンが砲身の中心線に対して非対称');
    // 砲身の範囲の内側にあること（付け根と砲口を空ける）
    assert.ok(r.x > BARREL_BASE && r.x + r.w < BARREL_BASE + barrelLength, 'フィンが砲身の外にある');
  }
});

// 「櫛のように浮いて見える」という形の破綻への回帰テスト。
// フィンは砲身より高いが、砲身の厚みをまたいで（＝上下に貫いて）いなければ
// 砲身から浮いた飾りになる
test('冷却フィンは砲身にまたがっていて、宙に浮いていない', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  const ctx = makeFakeCtx();
  t.draw(ctx);

  const barrelHalf = t.spec.barrelHalfHeight;
  const fins = findFinRects(ctx.calls);
  assert.ok(fins.length > 0, 'フィンが描かれていない');
  for (const r of fins) {
    assert.ok(r.y < -barrelHalf, 'フィンが砲身の上側にまたがっていない');
    assert.ok(r.y + r.h > barrelHalf, 'フィンが砲身の下側にまたがっていない');
    assert.ok(r.w > 0, 'フィンが線（幅0）に戻っている');
  }
});

// 砲口の放射器。「ここからビームが出る」を形で示す塊
test('beam 型は砲口に放射器(エミッタ)の塊を持つ', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  const ctx = makeFakeCtx();
  t.draw(ctx);

  const emitter = t.spec.emitter;
  const barrelLength = BARREL_LENGTH - t.recoil;
  const muzzle = BARREL_BASE + barrelLength;
  const blocks = findRectsOfColor(ctx.calls, COLOR_BEAM_CANNON_PIVOT)
    .filter((r) => Math.abs((r.x + r.w) - muzzle) < 1e-6);

  assert.equal(blocks.length, 1, 'エミッタが砲口の位置に描かれていない');
  const [b] = blocks;
  assert.equal(b.h, emitter.halfHeight * 2, 'エミッタの高さが違う');
  assert.ok(b.h > t.spec.barrelHalfHeight * 2, 'エミッタが砲身より太くない（塊に見えない）');
  assert.equal(b.y, -emitter.halfHeight, 'エミッタが砲身の中心線に対して非対称');
});

test('gun 型は冷却フィンもエミッタも持たない', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'gun');
  const ctx = makeFakeCtx();
  t.draw(ctx);

  assert.equal(findFinRects(ctx.calls).length, 0, 'gun 型にフィンが出ている');
  assert.equal(t.spec.emitter, undefined, 'gun 型にエミッタが設定されている');
});

// ============================================
// 充填式の連射（冷却なし）とパイロットランプ
// ============================================
//
// 「冷却時間は不要で、充填で連続して打ってくる」というユーザー要望の実装。
// beam 型は撃ち終わったら 'cooldown' 状態を経由せず 'idle' に戻り、
// cooldownTimer を「次弾までの充填」として使い回す。

/** 1回の攻撃(2発)を撃ち切るまで update を回す。 */
function fireVolley(turret, game) {
  fireOnce(turret, game);
  for (let i = 0; i < REFLECT_BEAM_BURST_DELAY + 1; i++) turret.update();
}

test('beam 型は撃ち終わったあと cooldown 状態を通らず idle に戻る', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  fireVolley(t, game);
  assert.equal(game.enemyBullets.length, 2, '2発とも出ていない');
  assert.equal(t.state, 'idle', 'cooldown 状態を経由している（beam 型は冷却が無いはず）');
});

test('充填時間は毎回 REFLECT_BEAM_CHARGE_MIN〜MAX の範囲に入り、固定値ではない', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');

  const seen = new Set();
  for (let volley = 0; volley < 12; volley++) {
    // fireOnce() は「game.enemyBullets が空の間だけ update を回す」作りなので、
    // クリアせずに使い回すと2回目以降は1フレームも進まない（ループ内で回るのは
    // fireVolley 内の REFLECT_BEAM_BURST_DELAY+1 フレームだけ）。実際に12回撃たせて
    // サンプルを採るため、毎回クリアしてから撃つ（レビュー指摘: 以前は実質2サンプル
    // しか採れておらず、その2つが偶然一致すると下の assert が約1.6%の確率で落ちていた）
    game.enemyBullets.length = 0;
    fireVolley(t, game);
    assert.ok(
      t.chargeTotal >= REFLECT_BEAM_CHARGE_MIN && t.chargeTotal <= REFLECT_BEAM_CHARGE_MAX,
      `充填時間が範囲外: ${t.chargeTotal}`,
    );
    seen.add(t.chargeTotal);
  }
  // 固定値だとリズムを読み切られるため、1発ごとに選び直していること。
  // 実装を「常に min にする」に壊すとこの assert が落ちる（12回中1種類だけになる）。
  // ただしこれは乱数まかせの検証で、範囲の両端に正しく写ることまでは確率でしか
  // 縛れない。両端の一致は下の2本の決定的なテストで別途縛る
  assert.ok(seen.size > 1, '充填時間が毎回同じ値になっている（範囲から選び直していない）');
});

// 上のテストは「12回引いて2種類以上あること」という確率的な検証で、CLAUDE.md の
// 「乱数依存の不等式テストを書かない」方針から外れる（前例: スラスター炎で約4%の
// 確率で落ちるテストを出し、純関数へ切り出して直した）。Math.random を差し替えて
// 「範囲の両端に正しく写る」ことを確率ゼロで縛る
test('充填時間は Math.random=0 のとき REFLECT_BEAM_CHARGE_MIN に写る', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  const originalRandom = Math.random;
  try {
    Math.random = () => 0;
    fireVolley(t, game);
  } finally {
    // 差し替えを他のテストへ漏らさない
    Math.random = originalRandom;
  }
  assert.equal(t.chargeTotal, REFLECT_BEAM_CHARGE_MIN);
});

test('充填時間は Math.random が1に近いとき、選べる上限(REFLECT_BEAM_CHARGE_MAX-1)に写る', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  const originalRandom = Math.random;
  try {
    Math.random = () => 0.999999;
    fireVolley(t, game);
  } finally {
    Math.random = originalRandom;
  }
  // _rollBeamCharge() は Math.floor(min + Math.random() * (max - min))。
  // Math.random() は仕様上常に1未満なので、rand を1に近づけても
  // min + rand*(max-min) は max に限りなく近づくだけで max 自身には届かず、
  // floor した実際の上限は REFLECT_BEAM_CHARGE_MAX - 1 になる（[min, max) の半開区間）。
  // 「REFLECT_BEAM_CHARGE_MAX ちょうどに写る」という素朴な期待は実装と合わないため、
  // 実装が実際に選べる値のほうを正としてここで縛る
  assert.equal(t.chargeTotal, REFLECT_BEAM_CHARGE_MAX - 1);
});

test('充填の進み具合は撃った直後の0付近から充填しきった1付近へ増える', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  fireVolley(t, game);

  const justFired = t._beamChargeProgress();
  assert.ok(justFired < 0.05, `撃った直後の進み具合が0付近ではない: ${justFired}`);

  for (let i = 0; i < t.chargeTotal - 1; i++) t.update();
  const almostCharged = t._beamChargeProgress();
  assert.ok(almostCharged > 0.95, `充填しきる直前の進み具合が1付近ではない: ${almostCharged}`);
  assert.ok(almostCharged > justFired, '進み具合が増えていない');
});

test('game.rng を消費しない（充填時間の抽選は Math.random のみ使う）', () => {
  const game = makeGame();
  let rngCalls = 0;
  game.rng = { next: () => { rngCalls++; return 0.5; } };
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  for (let volley = 0; volley < 5; volley++) fireVolley(t, game);
  assert.equal(rngCalls, 0, 'game.rng を消費している（週次の決定性が壊れる）');
});

test('撃った直後のランプは暗紫寄り、充填しきったランプは明るい紫寄り', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');

  const expectedDim = lerpColor(COLOR_BEAM_CANNON_LAMP_DIM, COLOR_BEAM_CANNON_LAMP_BRIGHT, 0);
  const expectedBright = lerpColor(COLOR_BEAM_CANNON_LAMP_DIM, COLOR_BEAM_CANNON_LAMP_BRIGHT, 1);
  // 暗紫と明るい紫は別の値であること（同じ色に潰れていたらそもそもテストにならない）
  assert.notEqual(expectedDim, expectedBright, 'DIM/BRIGHT の定数が同じ色になっている');

  // 撃った直後: cooldownTimer === chargeTotal（進み0）
  t.chargeTotal = 200;
  t.cooldownTimer = 200;
  t.state = 'idle';
  const dimCtx = makeFakeCtx();
  t.draw(dimCtx);
  const dimColors = dimCtx.calls.filter((c) => c.name === 'set:fillStyle').map((c) => c.args[0]);
  assert.ok(dimColors.includes(expectedDim), '撃った直後のランプが暗紫になっていない');
  assert.ok(!dimColors.includes(expectedBright), '撃った直後なのに明るい紫で描かれている');

  // 充填しきった: cooldownTimer === 0（進み1）
  t.cooldownTimer = 0;
  const brightCtx = makeFakeCtx();
  t.draw(brightCtx);
  const brightColors = brightCtx.calls.filter((c) => c.name === 'set:fillStyle').map((c) => c.args[0]);
  assert.ok(brightColors.includes(expectedBright), '充填しきったランプが明るい紫になっていない');
  assert.ok(!brightColors.includes(expectedDim), '充填しきったのに暗紫のままで描かれている');
});

test('gun 型のランプは従来どおり黄／赤で、色は充填率に依存しない', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'gun');

  const idleCtx = makeFakeCtx();
  t.draw(idleCtx);
  const idleColors = idleCtx.calls.filter((c) => c.name === 'set:fillStyle').map((c) => c.args[0]);
  assert.ok(idleColors.includes('#FFCC00'), '待機中のランプが黄色になっていない');

  t.state = 'bursting';
  const burstCtx = makeFakeCtx();
  t.draw(burstCtx);
  const burstColors = burstCtx.calls.filter((c) => c.name === 'set:fillStyle').map((c) => c.args[0]);
  assert.ok(burstColors.includes('#FF2222'), '連射中のランプが赤色になっていない');
});

test('gun 型は今までどおり cooldown 状態を通る', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'gun');
  for (let i = 0; i < 600 && game.enemyBullets.length === 0; i++) t.update();
  // burst 分だけ撃ち切るまで進める（gun のバーストは maxBurstCount 発、
  // 間隔は ENEMY_TURRET_BURST_DELAY）
  for (let i = 0; i < t.maxBurstCount * (ENEMY_TURRET_BURST_DELAY + 1) + 5; i++) {
    t.update();
    if (t.state === 'cooldown') break;
  }
  assert.equal(t.state, 'cooldown', 'gun 型が cooldown 状態を通らなくなっている');
});

test('パイロットランプの脈動の輪は外周から中心へ動く（時間が進むと arc の半径が縮む）', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  t.chargeTotal = 200;
  t.cooldownTimer = 199; // 撃った直後（経過1フレーム分）

  const early = makeFakeCtx();
  t.draw(early);
  const earlyRadii = early.calls.filter((c) => c.name === 'arc' && c.args[0] === 0 && c.args[1] === 0)
    .map((c) => c.args[2]);

  t.cooldownTimer = 180; // 少し充填が進んだ状態（同じ脈の周期内で経過が増える）
  const later = makeFakeCtx();
  t.draw(later);
  const laterRadii = later.calls.filter((c) => c.name === 'arc' && c.args[0] === 0 && c.args[1] === 0)
    .map((c) => c.args[2]);

  assert.ok(earlyRadii.length > 0 && laterRadii.length > 0, 'パイロットランプの輪が描かれていない');
  // 少なくとも1本は、時間が進むにつれ半径が縮んでいること
  // （中心に近づく＝外周から中心への脈動。全本が同時に大きくなっていたら失敗する）
  const shrunk = earlyRadii.some((r0, i) => laterRadii[i] !== undefined && laterRadii[i] < r0);
  assert.ok(shrunk, '輪の半径が時間とともに縮んでいない');
});

// ============================================
// 実機フィードバック(2回目): 脈動を「読める」動きにする
// ============================================
//
// 「中心に向かって波打つ感じ（Windows のファイル転送インジケーターのような
// 感じ）は見て取れなかった」という指摘への対応。原因はランプの内側（半径6px）
// でだけ輪を動かしていたことで、動く距離が短すぎて明滅にしか見えなかった。
// 輪を砲台の外側(BEAM_LAMP_RING_OUTER)から胴体の縁のすぐ外(BEAM_LAMP_RING_INNER)
// まで収束させることで距離を稼いだ。

// beginPath() の区切りで ctx.calls を「1つの図形」の単位にまとめ、arc の半径と
// その時点の globalAlpha を一緒に持たせるヘルパー。輪(stroke && !fill)だけを
// 抜き出すのに使う（座・ランプ本体・ピボットは fill を伴うので除外できる）
function ringArcs(calls) {
  const out = [];
  let current = null;
  let globalAlpha = 1;
  const finalize = () => { if (current) out.push(current); };
  for (const c of calls) {
    if (c.name === 'set:globalAlpha') globalAlpha = c.args[0];
    if (c.name === 'beginPath') {
      finalize();
      current = { arcs: [], fill: false, stroke: false, alpha: globalAlpha };
    } else if (current && c.name === 'arc') {
      current.arcs.push({ x: c.args[0], y: c.args[1], r: c.args[2] });
    } else if (current && c.name === 'fill') {
      current.fill = true;
    } else if (current && c.name === 'stroke') {
      current.stroke = true;
      current.alpha = globalAlpha; // stroke() 時点で有効な alpha を採用
    }
  }
  finalize();
  return out
    .filter((s) => s.stroke && !s.fill && s.arcs.length > 0)
    .map((s) => ({ r: s.arcs[0].r, alpha: s.alpha }));
}

// ① リングの半径が BEAM_LAMP_RING_INNER 〜 BEAM_LAMP_RING_OUTER の範囲にあること。
// ランプの内側（半径6px 以内）だけで動いていたら、この範囲チェックで必ず落ちる
test('脈動の輪はランプの内側ではなく、砲台の外側(BEAM_LAMP_RING_OUTER)から胴体の縁のすぐ外(BEAM_LAMP_RING_INNER)の範囲で動く', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  t.chargeTotal = 200;

  // 周期の中の色々な位相を見るため、cooldownTimer を複数サンプルする
  for (const cooldownTimer of [199, 170, 140, 100, 60, 20, 1]) {
    t.cooldownTimer = cooldownTimer;
    const ctx = makeFakeCtx();
    t.draw(ctx);
    const rings = ringArcs(ctx.calls);
    assert.ok(rings.length > 0, `輪が描かれていない (cooldownTimer=${cooldownTimer})`);
    for (const { r } of rings) {
      assert.ok(
        r >= BEAM_LAMP_RING_INNER - 1e-6 && r <= BEAM_LAMP_RING_OUTER + 1e-6,
        `輪の半径が想定の範囲外: r=${r} (期待 ${BEAM_LAMP_RING_INNER}〜${BEAM_LAMP_RING_OUTER})`,
      );
    }
  }
});

// ③ 輪の本数は3本のまま（実機フィードバックの対象は軌道と濃淡で、本数は変えない）
test('脈動の輪は3本のまま', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  const ctx = makeFakeCtx();
  t.draw(ctx);
  assert.equal(ringArcs(ctx.calls).length, 3, '輪の本数が3本から変わっている');
});

// ④ 軌道の両端（外周に現れた瞬間・中心の縁に着いた瞬間）で薄く、中間で濃い。
// 「湧いて消えるのが唐突に見えない」ためのなだらかな濃淡（Windows の転送
// インジケーターのような見え方）を縛る
test('脈動の輪は軌道の両端で薄く、中間で濃い（濃さがなだらかに変わる）', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  t.chargeTotal = 200;

  // 輪は BEAM_LAMP_RINGS(3) 本あるので、1本の位相が「端」に来るタイミングと
  // 「中間」に来るタイミングをそれぞれ用意する。周期は cycle であり、
  // BEAM_LAMP_CYCLE_SLOW(50)〜FAST(14) の範囲。progress=0 (chargeTotal=cooldownTimer)
  // のときは cycle=50 になるので、その前提で elapsed を選ぶ
  t.cooldownTimer = t.chargeTotal - 1; // elapsed=1 → phase≈0.02（端）
  const edgeCtx = makeFakeCtx();
  t.draw(edgeCtx);
  const edgeAlphas = ringArcs(edgeCtx.calls).map((s) => s.alpha);

  t.cooldownTimer = t.chargeTotal - 25; // elapsed=25 → phase=0.5（中間、cycle=50想定）
  const midCtx = makeFakeCtx();
  t.draw(midCtx);
  const midAlphas = ringArcs(midCtx.calls).map((s) => s.alpha);

  assert.ok(edgeAlphas.length > 0 && midAlphas.length > 0, '輪が描かれていない');
  // 端の濃さの最大値より、中間の濃さの最大値の方が濃い（値が大きい）こと
  const maxEdge = Math.max(...edgeAlphas);
  const maxMid = Math.max(...midAlphas);
  assert.ok(maxMid > maxEdge, `中間の方が濃いはずが、端(${maxEdge})以下: 中間=${maxMid}`);

  // 濃さが一定でないこと（同じ描画内でも輪ごとに位相が違うので alpha はばらつくはず）
  const allAlphas = [...edgeAlphas, ...midAlphas];
  const distinct = new Set(allAlphas.map((a) => a.toFixed(4)));
  assert.ok(distinct.size > 1, '輪の濃さが常に一定になっている（なだらかな濃淡になっていない）');
});

// ============================================
// 実機フィードバック: 輪を「輪」として見せる／紫を強くする／2発目にブレを足す
// ============================================
//
// beginPath() の区切りで ctx.calls を「1つの図形（arc群 + fill/stroke の有無 +
// その時点の lineWidth）」の単位にまとめるヘルパー。塗りつぶしの円と、線で
// 描かれた輪を区別するために使う（fill だけの円と stroke だけの円を見分ける）。
function arcSegments(calls) {
  const out = [];
  let current = null;
  let lineWidth = 1;
  const finalize = () => { if (current) out.push(current); };
  for (const c of calls) {
    if (c.name === 'set:lineWidth') lineWidth = c.args[0];
    if (c.name === 'beginPath') {
      finalize();
      current = { arcs: [], fill: false, stroke: false, lineWidth };
    } else if (current && c.name === 'arc') {
      current.arcs.push({ x: c.args[0], y: c.args[1], r: c.args[2] });
    } else if (current && c.name === 'fill') {
      current.fill = true;
    } else if (current && c.name === 'stroke') {
      current.stroke = true;
      current.lineWidth = lineWidth;
    }
  }
  finalize();
  return out;
}

// arc() の呼び出し1つ1つに、その時点で有効な fillStyle/strokeStyle を添える。
// 座（COLOR_BEAM_CANNON_LAMP_BACK）がどの半径で描かれたかを見分けるのに使う
function arcCallsWithStyle(calls) {
  let fillStyle = '';
  let strokeStyle = '';
  const out = [];
  for (const c of calls) {
    if (c.name === 'set:fillStyle') fillStyle = c.args[0];
    else if (c.name === 'set:strokeStyle') strokeStyle = c.args[0];
    else if (c.name === 'arc') out.push({ x: c.args[0], y: c.args[1], r: c.args[2], fillStyle, strokeStyle });
  }
  return out;
}

// ⑴ 脈動の輪は、塗りつぶし(fill)を重ねる形ではなく、輪郭線(stroke)で描く。
// 半透明の塗りを重ねると輪ではなく明滅に見える、という実機フィードバックの対応
test('パイロットランプの脈動の輪は塗りつぶしではなく線(stroke)で描かれる', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  const ctx = makeFakeCtx();
  t.draw(ctx);

  const segments = arcSegments(ctx.calls);
  // ピボット本体(半径8, fill+stroke)や座・ランプ本体(fillのみ)を除いた、輪だけの
  // 図形（stroke されていて、fill はされていない円。輪は砲台の外(BEAM_LAMP_RING_OUTER)
  // まで出るので、以前の「半径0〜8未満」という範囲では絞れなくなった。fill の有無だけで
  // 十分区別できる）
  const ringSegments = segments.filter((s) => (
    s.stroke && !s.fill
    && s.arcs.some((a) => a.x === 0 && a.y === 0 && a.r > 0)
  ));
  assert.ok(ringSegments.length > 0, '輪が stroke で描かれていない（塗りつぶしのままの可能性）');
  for (const s of ringSegments) {
    assert.ok(
      s.lineWidth >= 1.5 && s.lineWidth <= 2,
      `輪の線の太さが範囲外(1.5〜2を想定): ${s.lineWidth}`,
    );
  }
});

// ⑵-2 ランプの下に暗い座が敷かれる。かつ、ランプ本体より先に描かれること
// （後に描くと隠れてしまうため、順序が意味を持つ）
test('ランプの下に暗い座(COLOR_BEAM_CANNON_LAMP_BACK)が、ランプ本体より先に敷かれる', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  t.chargeTotal = 200;
  t.cooldownTimer = 200; // 進み0 -> 暗紫寄りの色で描かれる（区別しやすい値を使う）
  const ctx = makeFakeCtx();
  t.draw(ctx);

  const expectedLampColor = lerpColor(COLOR_BEAM_CANNON_LAMP_DIM, COLOR_BEAM_CANNON_LAMP_BRIGHT, 0);

  const backIdx = ctx.calls.findIndex((c) => c.name === 'set:fillStyle' && c.args[0] === COLOR_BEAM_CANNON_LAMP_BACK);
  const lampIdx = ctx.calls.findIndex((c) => c.name === 'set:fillStyle' && c.args[0] === expectedLampColor);

  assert.ok(backIdx >= 0, '暗い座(COLOR_BEAM_CANNON_LAMP_BACK)が描かれていない');
  assert.ok(lampIdx >= 0, 'ランプ本体の色が描かれていない');
  assert.ok(backIdx < lampIdx, '座がランプ本体より後に描かれている（これだと座が隠してしまう）');
});

// ⑵-3 座はピボットの円（半径8）からはみ出さない
test('暗い座はピボットの円（半径8）からはみ出さない', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  const ctx = makeFakeCtx();
  t.draw(ctx);

  const arcs = arcCallsWithStyle(ctx.calls);
  const seatArc = arcs.find((a) => a.x === 0 && a.y === 0 && a.fillStyle === COLOR_BEAM_CANNON_LAMP_BACK);
  assert.ok(seatArc, '暗い座の arc が見つからない');
  assert.ok(seatArc.r > 0, '座の半径が0以下');
  assert.ok(seatArc.r <= 8, `座がピボット(半径8)からはみ出している: r=${seatArc.r}`);
});

// ⑶ 2発目のブレ。同じ側・同じ自機位置で撃たせても、REFLECT_BEAM_SECOND_SHOT_JITTER
// ぶんのランダムなブレのおかげで角度が毎回わずかに変わる。左右交互のオフセット
// （8度）だけを比べると符号違いで「変わった」ことになってしまいブレを検証
// できないため、同じ側どうし（1回目と3回目）を比べる
test('2発目の角度は、同じ側・同じ自機位置でも撃つたびにわずかに変わる（ブレが効いている）', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  const secondAngles = [];

  fireOnce(t, game);
  for (let i = 0; i < REFLECT_BEAM_BURST_DELAY + 1; i++) t.update();
  secondAngles.push(Math.atan2(game.enemyBullets[1].vy, game.enemyBullets[1].vx));

  for (let v = 1; v < 4; v++) {
    t.cooldownTimer = 0;
    const before = game.enemyBullets.length;
    for (let i = 0; i < 600 && game.enemyBullets.length < before + 1; i++) t.update();
    for (let i = 0; i < REFLECT_BEAM_BURST_DELAY + 1; i++) t.update();
    secondAngles.push(Math.atan2(game.enemyBullets[before + 1].vy, game.enemyBullets[before + 1].vx));
  }

  // 0回目と2回目（インデックス0, 2）は左右交互で同じ側になる
  assert.notEqual(
    secondAngles[0], secondAngles[2],
    '同じ側・同じ自機位置なのに2発目の角度が毎回同じ（ブレが効いていない）',
  );
});

// ⑶ ブレの大きさが REFLECT_BEAM_SECOND_SHOT_JITTER の範囲に収まる（暴れすぎない）
test('2発目のブレは REFLECT_BEAM_SECOND_SHOT_JITTER の範囲に収まる', () => {
  const game = makeGame();
  for (let trial = 0; trial < 30; trial++) {
    const t = new EnemyTurret(game, 32, 40, false, 'beam');
    game.enemyBullets = [];
    fireOnce(t, game);
    const firstAngle = Math.atan2(game.enemyBullets[0].vy, game.enemyBullets[0].vx);
    for (let i = 0; i < REFLECT_BEAM_BURST_DELAY + 1; i++) t.update();
    const secondAngle = Math.atan2(game.enemyBullets[1].vy, game.enemyBullets[1].vx);

    const diff = Math.abs(secondAngle - firstAngle);
    const err = Math.abs(diff - REFLECT_BEAM_SECOND_SHOT_OFFSET);
    assert.ok(
      err <= REFLECT_BEAM_SECOND_SHOT_JITTER + 1e-9,
      `ブレが REFLECT_BEAM_SECOND_SHOT_JITTER の範囲を超えている: err=${err}`,
    );
  }
});

// ============================================
// 実機フィードバック(3回目): 輪が砲台の形を隠している
// ============================================
//
// 「充填リングが大きすぎて反射ビーム砲台のカタチが見えにくくなっている」への
// 対応。大きさ以前に**描画順**が原因だった（輪は砲台の全パーツを描いた後に
// 描かれていたので、常に形の上に乗っていた）。輪を draw() の先頭へ回し、
// 台座・砲身・フィン・エミッタ・ピボットのすべてに隠れるようにする。
// 機体の外へはみ出した弧だけが見える＝「外から機体に吸い込まれる光」になる。
//
// 順序そのものが仕様なので、順序で検証する。

/** 輪(stroke されていて fill を伴わない原点の円)の stroke() が ctx.calls の何番目かを返す。 */
function ringStrokeIndices(calls) {
  const out = [];
  let current = null;
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    if (c.name === 'beginPath') {
      current = { hasOriginArc: false, fill: false };
    } else if (current && c.name === 'arc') {
      if (c.args[0] === 0 && c.args[1] === 0 && c.args[2] > 0) current.hasOriginArc = true;
    } else if (current && c.name === 'fill') {
      current.fill = true;
    } else if (current && c.name === 'stroke') {
      if (current.hasOriginArc && !current.fill) out.push(i);
    }
  }
  return out;
}

test('脈動の輪は砲台の本体より先に描かれる（形の上に重ならない）', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  t.chargeTotal = 200;
  t.cooldownTimer = 100; // 輪が3本とも出ている状態
  const ctx = makeFakeCtx();
  t.draw(ctx);

  const rings = ringStrokeIndices(ctx.calls);
  assert.equal(rings.length, 3, '輪が3本描かれていない（抽出に失敗している可能性）');

  // 砲台の実体で最初に描かれるのは台座の塗り。輪がそれより後にあると、
  // 輪が機体の上に乗って形を隠す
  const firstBodyFill = ctx.calls.findIndex((c) => c.name === 'fillRect');
  assert.ok(firstBodyFill >= 0, '砲台の本体が fillRect で描かれていない');
  assert.ok(
    Math.max(...rings) < firstBodyFill,
    `輪が砲台の本体より後に描かれている（輪の最後=${Math.max(...rings)}, 本体の最初=${firstBodyFill}）`,
  );
});

test('ランプ本体と座は砲台の本体より後に描かれる（ピボットに隠れない）', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  t.chargeTotal = 200;
  t.cooldownTimer = 100;
  const ctx = makeFakeCtx();
  t.draw(ctx);

  // 座は COLOR_BEAM_CANNON_LAMP_BACK の塗り。これがピボット(半径8)より後に
  // 来ていないと、ランプがピボットの下に潜って見えなくなる
  const backIdx = ctx.calls.findIndex(
    (c) => c.name === 'set:fillStyle' && c.args[0] === COLOR_BEAM_CANNON_LAMP_BACK,
  );
  const lastBodyFill = ctx.calls.reduce((acc, c, i) => (c.name === 'fillRect' ? i : acc), -1);
  assert.ok(backIdx >= 0, 'ランプの座が描かれていない');
  assert.ok(
    backIdx > lastBodyFill,
    `ランプの座が砲台の本体より先に描かれている（座=${backIdx}, 本体の最後=${lastBodyFill}）`,
  );
});

// ============================================
// 実機フィードバック(4回目): 座がピボットを黒く塗り潰していた
// ============================================
//
// 「PIVOT に重なるように黒いマスクを掛けていないか」という指摘。掛けていた。
// 暗い座(COLOR_BEAM_CANNON_LAMP_BACK, 半径7)はピボットの円(半径8)を描いた
// **後**に敷かれるので、残る明るい部分は外周1pxのリングだけだった。
// ピボットを明るくするほど悪化する組み合わせで、白くした結果あらわになった。
//
// 座のサイズ根拠も古かった。元は「輪(最大半径6)を覆う」大きさとして7を選んだ
// もので、輪を砲台の外へ出した時点で基準はランプ本体(半径2)に変わっている。
//
// 「はみ出さない(r <= 8)」だけでは、ちょうど 8 でも通ってしまい塗り潰しを
// 防げない。ピボットが**面として**残る大きさであることを縛る。
test('暗い座はピボットの円を塗り潰さず、明るい面をはっきり残す', () => {
  const game = makeGame();
  const t = new EnemyTurret(game, 32, 40, false, 'beam');
  const ctx = makeFakeCtx();
  t.draw(ctx);

  const arcs = arcCallsWithStyle(ctx.calls);
  const seatArc = arcs.find((a) => a.x === 0 && a.y === 0 && a.fillStyle === COLOR_BEAM_CANNON_LAMP_BACK);
  assert.ok(seatArc, '暗い座の arc が見つからない');

  // 座が覆う面積がピボット(半径8)の半分を超えたら「マスク」に見える。
  // 面積比 = (r/8)^2 なので、半分の境目は r = 8/√2 ≒ 5.66
  const coverage = (seatArc.r / 8) ** 2;
  assert.ok(
    coverage < 0.5,
    `座がピボットの面積の ${(coverage * 100).toFixed(0)}% を覆っている（黒いマスクに見える）: r=${seatArc.r}`,
  );

  // 逆に小さすぎるとランプの座として機能しない（本体は半径2）
  assert.ok(seatArc.r > BEAM_LAMP_CORE_RADIUS_FOR_TEST, `座がランプ本体より小さい: r=${seatArc.r}`);
});
