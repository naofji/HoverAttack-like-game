import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { isConcealed } from '../src/js/utils/concealment.js';
import {
  SMOKE_PUFF_COUNT, SMOKE_EMIT_SPAN, SMOKE_PUFF_LIFETIME,
  SMOKE_PUFF_RADIUS_START, SMOKE_PUFF_RADIUS_END,
  SMOKE_SPREAD_RADIUS, SMOKE_PUFF_RADIUS_JITTER, SMOKE_DRIFT_SPEED,
  SMOKE_RISE_SPEED,
} from '../src/js/utils/Constants.js';

before(() => {
  // スプライトを焼くのに canvas が要る。中身は使わないので呼び出しを飲むだけ
  const noopCtx = new Proxy({}, {
    get: () => () => ({ addColorStop: () => {} }),
  });
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }),
  };
});

async function makeScreen(x = 100, y = 100) {
  const { SmokeScreen } = await import('../src/js/entities/SmokeScreen.js');
  return new SmokeScreen(x, y);
}

/** n tick 進める */
function run(screen, n) {
  for (let i = 0; i < n; i++) screen.update();
}

// --- 撒き方 -------------------------------------------------------------------

test('発煙直後は全パフが出そろっていない（一斉に生むと湧き上がって見えない）', async () => {
  const s = await makeScreen();
  s.update();
  assert.ok(s.puffs.length < SMOKE_PUFF_COUNT,
    `1 tick で全部生まれている: ${s.puffs.length}`);
  assert.ok(s.puffs.length >= 1, '1つも生まれていない');
});

test('SMOKE_EMIT_SPAN のあいだに全パフが撒かれる', async () => {
  const s = await makeScreen();
  run(s, SMOKE_EMIT_SPAN + 1);
  assert.equal(s.puffs.length, SMOKE_PUFF_COUNT);
});

test('パフの年齢がばらける（同じ時計で動いていない）', async () => {
  const s = await makeScreen();
  run(s, SMOKE_EMIT_SPAN + 1);
  const ages = new Set(s.puffs.map((p) => p.age));
  assert.ok(ages.size > 1, 'すべてのパフの年齢が同じ');
});

test('同じ年齢でもパフごとに大きさが違う', async () => {
  // 位置だけ散らしても、同じ年齢のパフが全部同じ半径では
  // 「同じ丸の反復」に見えてしまう
  const s = await makeScreen();
  run(s, SMOKE_EMIT_SPAN + 1);
  const sameAge = s.puffs.filter((p) => p.age === s.puffs[0].age);
  assert.ok(sameAge.length > 1, '同じ年齢のパフが1枚しかなく比較できない');
  const radii = new Set(sameAge.map((p) => Math.round(p.radius * 100)));
  assert.ok(radii.size > 1, '同じ年齢のパフが全部同じ大きさ');
  // ばらつきは指定した範囲に収まる
  for (const p of s.puffs) {
    assert.ok(p.radiusScale >= 1 - SMOKE_PUFF_RADIUS_JITTER - 1e-9
      && p.radiusScale <= 1 + SMOKE_PUFF_RADIUS_JITTER + 1e-9,
    `大きさのばらつきが範囲外: ${p.radiusScale}`);
  }
});

test('撒く距離は中心寄りに偏る（芯は濃いまま、輪郭だけ不揃いになる）', async () => {
  // 一様に撒くと円板の外周ほど面積が広いぶん外側に密集し、雲の輪郭が
  // きれいな円に揃う。かつ中心の重なりが痩せて隠蔽が不安定になる
  const dists = [];
  for (let k = 0; k < 40; k++) {
    const s = await makeScreen(100, 100);
    run(s, SMOKE_EMIT_SPAN + 1);
    for (const p of s.puffs) dists.push(Math.hypot(p.x - 100, p.y - 100));
  }
  // 測るのは撒き終えた直後。この時点で既に漂い始めているので、その分を足した
  // 上限で見る。1 tick の移動量は外向きの初速（0.5〜1.5 倍のばらつき）に
  // 上昇ぶんが加わるので、両方を足さないと稀に上限を超えて落ちる
  const perTick = SMOKE_DRIFT_SPEED * 1.5 + SMOKE_RISE_SPEED;
  const drifted = SMOKE_SPREAD_RADIUS + perTick * (SMOKE_EMIT_SPAN + 2);
  for (const d of dists) {
    assert.ok(d <= drifted, `撒く範囲を超えた: ${d} > ${drifted}`);
  }
  dists.sort((a, b) => a - b);
  const median = dists[Math.floor(dists.length / 2)];
  assert.ok(median < SMOKE_SPREAD_RADIUS * 0.5,
    `中心寄りに偏っていない（中央値 ${median.toFixed(1)} / 上限 ${SMOKE_SPREAD_RADIUS}）`);
  // それでも遠くまで飛ぶものが居る（輪郭を不揃いにするのはこれ）
  assert.ok(dists[dists.length - 1] > SMOKE_SPREAD_RADIUS * 0.8,
    '遠くへ飛ぶパフが無く、輪郭が揃ってしまう');
});

test('撒く位置がばらける', async () => {
  const s = await makeScreen(100, 100);
  run(s, SMOKE_EMIT_SPAN + 1);
  const xs = new Set(s.puffs.map((p) => Math.round(p.x)));
  assert.ok(xs.size > 1, '全部同じ場所に湧いている');
});

// --- 時間変化 -----------------------------------------------------------------

test('パフは時間とともに拡大する', async () => {
  const s = await makeScreen();
  s.update();
  const p = s.puffs[0];
  const early = p.radius;
  run(s, 100);
  assert.ok(p.radius > early, '拡散していない');
  // 半径はパフごとの大きさのばらつき（radiusScale）が掛かるので、
  // 素の開始・終端半径そのものではなく、それを按分した範囲で見る
  assert.ok(p.radius <= SMOKE_PUFF_RADIUS_END * p.radiusScale + 1e-9, '終端半径を超えた');
  assert.ok(early >= SMOKE_PUFF_RADIUS_START * p.radiusScale - 1e-9, '開始半径より小さい');
});

test('パフは漂う（位置が動く）', async () => {
  const s = await makeScreen();
  s.update();
  const p = s.puffs[0];
  const x0 = p.x, y0 = p.y;
  run(s, 60);
  assert.ok(p.x !== x0 || p.y !== y0, '漂っていない');
});

test('パフは回転する', async () => {
  const s = await makeScreen();
  s.update();
  const p = s.puffs[0];
  const r0 = p.rotation;
  run(s, 30);
  assert.notEqual(p.rotation, r0, '回っていない');
});

// --- 寿命 ---------------------------------------------------------------------

test('パフは寿命で消え、雲はパフが全部消えたら死ぬ', async () => {
  const s = await makeScreen();
  run(s, SMOKE_PUFF_LIFETIME - 10);
  assert.ok(s.alive, 'まだパフが残っているのに死んでいる');
  run(s, SMOKE_EMIT_SPAN + 20);
  assert.equal(s.puffs.length, 0, 'パフが残っている');
  assert.equal(s.alive, false, '雲が死んでいない');
});

test('雲は必ず死ぬ（撒き終わる前に殺されない・永遠に残らない）', async () => {
  const s = await makeScreen();
  // 撒いている途中に死なないこと（emitted < COUNT でパフが0の瞬間があっても）
  run(s, 2);
  assert.ok(s.alive, '撒いている途中で死んだ');
  run(s, SMOKE_EMIT_SPAN + SMOKE_PUFF_LIFETIME + 10);
  assert.equal(s.alive, false, '寿命を過ぎても生きている');
});

test('発煙してしばらくは隠れ、やがて必ず隠れなくなる', async () => {
  // この機能の本体。「発煙直後にいちばん濃い」「必ず終わる」の両方を測る。
  // 個々の tick を決め打ちすると乱数で揺れるので、隠れている長さで縛る。
  const s = await makeScreen(100, 100);
  let concealedTicks = 0;
  let firstConcealed = -1;
  for (let t = 0; t < SMOKE_EMIT_SPAN + SMOKE_PUFF_LIFETIME + 20; t++) {
    s.update();
    if (isConcealed(100, 100, [s])) {
      concealedTicks++;
      if (firstConcealed < 0) firstConcealed = t;
    }
  }
  assert.ok(firstConcealed >= 0, '一度も隠れなかった（発煙の意味がない）');
  assert.ok(firstConcealed < SMOKE_EMIT_SPAN + 20,
    `隠れるまでが遅い: ${firstConcealed} tick（逃げる前に撃たれる）`);
  assert.ok(concealedTicks > 60,
    `隠れている時間が短い: ${concealedTicks} tick（1秒未満では逃げられない）`);
  assert.ok(concealedTicks < SMOKE_PUFF_LIFETIME,
    `隠れている時間が長い: ${concealedTicks} tick（薄れても隠れたままになっている）`);
  assert.equal(isConcealed(100, 100, [s]), false, '最後まで隠れたまま');
});

// --- 描画 ---------------------------------------------------------------------

test('パフ1枚につき drawImage は多くても2回（焼き付けの利得）', async () => {
  // 色段をまたぐ間だけ2枚をクロスフェードする。形をいくら複雑にしても
  // 実行時のコストがこの回数から増えない、というのが焼き付けの利点
  const s = await makeScreen();
  run(s, SMOKE_EMIT_SPAN + 1);
  const ctx = makeFakeCtx();
  s.draw(ctx);
  const draws = ctx.calls.filter((c) => c.name === 'drawImage').length;
  assert.ok(draws >= s.puffs.length, `描かれていないパフがある: ${draws}`);
  assert.ok(draws <= s.puffs.length * 2, `1パフに3回以上描いている: ${draws}`);
  // 実行時にグラデーションを作らない（焼いてある）
  assert.equal(ctx.calls.filter((c) => c.name === 'createRadialGradient').length, 0);
});

test('描画は回転と alpha を使い、後始末をする', async () => {
  const s = await makeScreen();
  run(s, 30);
  const ctx = makeFakeCtx();
  s.draw(ctx);

  assert.ok(ctx.calls.some((c) => c.name === 'rotate'), '回転していない');
  const alphas = ctx.calls.filter((c) => c.name === 'set:globalAlpha').map((c) => c.args[0]);
  assert.ok(alphas.some((a) => a > 0 && a < 1), `半透明で描いていない: ${alphas}`);
  assert.equal(
    ctx.calls.filter((c) => c.name === 'save').length,
    ctx.calls.filter((c) => c.name === 'restore').length,
    'save と restore の数が合わない',
  );
});

test('消えかけのパフは薄く描かれる', async () => {
  const early = await makeScreen();
  run(early, 30);
  const late = await makeScreen();
  run(late, SMOKE_EMIT_SPAN + SMOKE_PUFF_LIFETIME - 20);

  const alphaMax = (screen) => {
    const ctx = makeFakeCtx();
    screen.draw(ctx);
    return Math.max(...ctx.calls
      .filter((c) => c.name === 'set:globalAlpha')
      .map((c) => c.args[0]));
  };
  assert.ok(alphaMax(late) < alphaMax(early), '古い煙が薄くなっていない');
});
