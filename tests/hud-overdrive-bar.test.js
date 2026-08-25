import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HUD } from '../src/js/ui/HUD.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { OVERDRIVE_DURATION, OVERDRIVE_WARN_TICKS, OVERDRIVE_MAX_DURATION } from '../src/js/utils/Constants.js';
import { BUFF_SPECS } from '../src/js/ui/HUD.js';

// オーバードライブの残時間バー。A-AIM ゲージのすぐ下に同じ作法で出す。
// 「いつ切れるか」が読めないと、無限だと思って撃っていた弾が急に減り始める。


/**
 * 旧 API の形で1本だけ描くヘルパー。
 *
 * 実装は「残量と色を決める」(_autoAimState / _overdriveState) と「1本描く」
 * (_drawBuffBar) に分かれたので、テスト側でその2つを繋いでいる。
 * こうしておけば、色・残量・点滅の検査はこれまでどおりの書き方で残せる。
 */
function drawOne(hud, ctx, kind, player, y = 100) {
  const state = kind === 'autoAim' ? hud._autoAimState(player) : hud._overdriveState(player);
  if (!state) return;
  hud._drawBuffBar(ctx, y, 0, BUFF_SPECS[kind], state);
}

function drawBar({ overdriveTimer = OVERDRIVE_DURATION, maxTimer = OVERDRIVE_DURATION } = {}) {
  const ctx = makeFakeCtx();
  const hud = Object.create(HUD.prototype);
  drawOne(hud, ctx, 'overdrive', { overdriveTimer, overdriveMaxTimer: maxTimer });
  return {
    ctx,
    fills: ctx.calls.filter((c) => c.name === 'set:fillStyle').map((c) => c.args[0]),
    texts: ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]),
    bars: ctx.calls.filter((c) => c.name === 'fillRect'),
  };
}

test('効いている間はラベルとバーが出る', () => {
  const { texts, bars } = drawBar();
  assert.ok(texts.includes('OVERDRIVE'), `ラベルが出ていない: ${texts.join(' / ')}`);
  assert.ok(bars.length >= 2, `バーが描かれていない: ${bars.length} 個`);
});

// 分母は「そのとき持っていた最大」から**上限**へ変えた。刻みが入ったことで
// 「刻みちょうどまで＝1個ぶん」と読めるようになり、1個でも満タンに見せていた
// 当時の意図は刻みが引き継いでいる。
test('残量がバーの長さに出る', () => {
  // 0枚目は地(常に満幅)、1枚目が残量、その後が先端と刻み
  const widthOf = (bars) => bars[1].args[2];
  const full = drawBar({ overdriveTimer: OVERDRIVE_MAX_DURATION }).bars;
  const half = drawBar({ overdriveTimer: OVERDRIVE_MAX_DURATION / 2 }).bars;
  assert.ok(widthOf(full) > widthOf(half), '残量がバーの長さに出ていない');
});

test('持っていなければ何も描かない', () => {
  const { ctx } = drawBar({ overdriveTimer: 0 });
  assert.equal(ctx.calls.length, 0, '持っていないのに描いている');
});

test('自機がいなくても落ちない', () => {
  const ctx = makeFakeCtx();
  const hud = Object.create(HUD.prototype);
  drawOne(hud, ctx, 'overdrive', null);
  assert.equal(ctx.calls.length, 0);
});

test('分母が 0 でもゼロ除算でバーが壊れない', () => {
  // 拾う前の状態に手が入った経路（セーブの読み込みなど）でも NaN を描かない
  const { bars } = drawBar({ overdriveTimer: 10, maxTimer: 0 });
  for (const b of bars) {
    assert.ok(Number.isFinite(b.args[2]), `バーの幅が数値でない: ${b.args[2]}`);
  }
});

/** その位相で使われたラベル／バーの色（先頭の1つ）。 */
function barColor(timer, nowMs) {
  const realNow = Date.now;
  Date.now = () => nowMs;
  try {
    return drawBar({ overdriveTimer: timer }).fills.find((c) => /^#/.test(c));
  } finally {
    Date.now = realNow;
  }
}

/** #rrggbb の G 成分。金と赤の見分けに使う。 */
const greenOf = (hex) => parseInt(hex.slice(3, 5), 16);

test('残り時間が十分なうちは金色のまま点滅しない（ゲージとして読ませる）', () => {
  // 機体の輝きは常に往復するが、HUD は残量を読む道具なので落ち着かせる
  assert.equal(barColor(OVERDRIVE_DURATION, 0), barColor(OVERDRIVE_DURATION, 250));
  assert.ok(greenOf(barColor(OVERDRIVE_DURATION, 0)) >= 170, '金色でない');
});

test('切れかけると金色が抜けて赤へ寄っていく', () => {
  const g = (timer) => greenOf(barColor(timer, 0));
  assert.ok(g(OVERDRIVE_WARN_TICKS) > g(OVERDRIVE_WARN_TICKS / 2),
    '色が変わっていない');
  assert.ok(g(OVERDRIVE_WARN_TICKS / 10) <= 110,
    `最後まで金色が残っている: G=${g(OVERDRIVE_WARN_TICKS / 10)}`);
});

test('残り3秒を切ると点滅する（切れる予告）', () => {
  // 点滅は時間で色が変わる。同じ残量でも位相違いで2色になることを見る
  const colorsAt = (nowMs) => {
    const realNow = Date.now;
    Date.now = () => nowMs;
    try {
      return drawBar({ overdriveTimer: 60 }).fills;
    } finally {
      Date.now = realNow;
    }
  };
  const a = colorsAt(0).join();
  const b = colorsAt(250).join();
  assert.notEqual(a, b, '残りわずかなのに点滅していない');

  // 十分残っているときは点滅しない
  const steady = (nowMs) => {
    const realNow = Date.now;
    Date.now = () => nowMs;
    try {
      return drawBar({ overdriveTimer: OVERDRIVE_DURATION }).fills.join();
    } finally {
      Date.now = realNow;
    }
  };
  assert.equal(steady(0), steady(250), '残量が十分なのに点滅している');
});

test('HUD の通常描画からも呼ばれる', () => {
  // メソッドがあるだけで draw() から呼ばれていなければ画面には出ない。
  // 描画の中身は上のテストで見ているので、ここでは到達だけを確かめる
  const hud = Object.create(HUD.prototype);
  const player = {
    missiles: 0, grenades: 0, mgBurstLeft: 0, mgReloadTimer: 0, hoverFuel: 0,
    hp: 100, currentWeapon: 'mg', repairKits: 0,
    autoAimTimer: 0, overdriveTimer: OVERDRIVE_DURATION, overdriveMaxTimer: OVERDRIVE_DURATION,
  };
  hud.game = {
    player, carrier: null, score: 0, debugInvincible: false,
    canvas: { width: 1024, height: 768 },
    camera: { x: 0, y: 0 },
    missionsCompleted: 0, base: null,
    baseEmergencyAlert: false, proximityAlertActive: false,
    liveTimeBonus: () => ({ current: 0, max: 1 }),
  };
  // draw() は AUTO AIM と OVERDRIVE の2本を通す。オーバードライブぶんが
  // 出ているかを、渡された spec で見分ける
  const seen = [];
  const original = HUD.prototype._drawBuffBar;
  HUD.prototype._drawBuffBar = function (ctx, y, x, spec, state) {
    seen.push(spec.label);
    return original.call(this, ctx, y, x, spec, state);
  };
  try {
    hud.draw(makeFakeCtx());
  } finally {
    HUD.prototype._drawBuffBar = original;
  }
  assert.ok(seen.includes('OVERDRIVE'), `draw() から呼ばれていない: ${seen.join(' / ')}`);
});
