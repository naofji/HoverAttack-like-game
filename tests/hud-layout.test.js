// HUD の配置。
//
// HUD は上端 HUD_TOP_HEIGHT px の帯で、その中に2段＋時限バフのサブ行が入る。
// **帯からはみ出したものはプレイフィールドの上に描かれる**（区切り線をまたぐ）。
// O-DRIVE バーを A-AIM の下に足したときに実際そうなったので、
// 「HUD の中に収まっているか」を機械的に縛る。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HUD, HUD_MIN_WIDTH } from '../src/js/ui/HUD.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import {
  HUD_TOP_HEIGHT, PLAYER_MAX_HP, CARRIER_MAX_HP, HOVER_MAX_FUEL,
  OVERDRIVE_DURATION, AUTO_AIM_DURATION, AUTO_AIM_MAX_DURATION,
  CANVAS_WIDTH,
} from '../src/js/utils/Constants.js';

// 実際の解像度で試す。1024 を直書きしていた頃は、16:9 にしたあとの
// 本番の幅をどのテストも通っていなかった。
const W = CANVAS_WIDTH;

function makePlayer() {
  return {
    missiles: 12, grenades: 5, mgBurstLeft: 16, mgReloadTimer: 0,
    hoverFuel: HOVER_MAX_FUEL, hp: PLAYER_MAX_HP, lives: 3,
    currentWeapon: 'mg', repairKits: 2, alive: true,
    autoAimTimer: AUTO_AIM_DURATION, autoAimMaxTimer: AUTO_AIM_MAX_DURATION,
    autoAimPaused: false,
    overdriveTimer: OVERDRIVE_DURATION, overdriveMaxTimer: OVERDRIVE_DURATION,
  };
}

function drawHud(overrides = {}) {
  const hud = Object.create(HUD.prototype);
  const player = makePlayer();
  hud.game = {
    player,
    carrier: { hp: CARRIER_MAX_HP, lives: 2, alive: true },
    score: 1234, missionTimer: 65432, missionsCompleted: 2,
    canvas: { width: W, height: 768 },
    camera: { x: 0, y: 0 },
    base: null, baseEmergencyAlert: false, proximityAlertActive: false,
    liveTimeBonus: () => ({ current: 5000, max: 10000 }),
    debugInvincible: false,
    ...overrides,
  };
  const ctx = makeFakeCtx();
  hud.draw(ctx);
  return { ctx, player };
}

/**
 * 描かれた矩形と文字の縦の下端。
 *
 * 母艦の接近／被弾を知らせる**画面の縁の枠**は、意図してプレイフィールド側に
 * 描いている（HUD.draw が出しているが HUD の帯の中身ではない）ので除く。
 * 画面いっぱいの幅か高さを持つ帯だけがそれに当たる。
 */
function bottomEdges(ctx, canvasH = 768) {
  const out = [];
  for (const c of ctx.calls) {
    if (c.name === 'fillRect' || c.name === 'strokeRect') {
      const [x, y, w, h] = c.args;
      const isEdgeAlert = y >= HUD_TOP_HEIGHT && (w >= W || h >= canvasH - HUD_TOP_HEIGHT);
      if (isEdgeAlert) continue;
      void x;
      out.push({ what: `rect(${x},${y},${w},${h})`, bottom: Math.max(y, y + h) });
    } else if (c.name === 'fillText') {
      // textBaseline = middle。10px フォントなら中心 +5px が下端
      out.push({ what: `text:${c.args[0]}`, bottom: c.args[2] + 5 });
    }
  }
  return out;
}

test('HUD の描画はすべて帯の中に収まる', () => {
  // 背景の塗り（0..HUD_TOP_HEIGHT）と区切り線ちょうどは許す
  const { ctx } = drawHud();
  for (const e of bottomEdges(ctx)) {
    assert.ok(e.bottom <= HUD_TOP_HEIGHT,
      `${e.what} が HUD からはみ出している: 下端 ${e.bottom} > ${HUD_TOP_HEIGHT}`);
  }
});

/** ラベル文字の描画位置を名前で引く。 */
function textX(ctx, label) {
  const c = ctx.calls.find((c) => c.name === 'fillText' && c.args[0] === label);
  return c ? { x: c.args[1], y: c.args[2] } : null;
}

test('A-AIM と O-DRIVE は同じ段に横並びで出る', () => {
  const { ctx } = drawHud();
  const a = textX(ctx, 'A-AIM');
  const o = textX(ctx, 'O-DRIVE');
  assert.ok(a && o, '両方のラベルが出ていない');
  assert.equal(a.y, o.y, '同じ段になっていない');
  assert.ok(a.x < o.x, 'A-AIM が O-DRIVE の右にある');
});

test('2本のバーは横に重ならない', () => {
  // サブ行に描かれた矩形だけを集めて、左右の塊が交差しないことを見る
  const { ctx } = drawHud();
  const subRowY = textX(ctx, 'A-AIM').y;
  const rects = ctx.calls
    .filter((c) => c.name === 'fillRect' && Math.abs(c.args[1] + c.args[3] / 2 - subRowY) < 6)
    .map((c) => ({ left: c.args[0], right: c.args[0] + c.args[2] }));
  assert.ok(rects.length >= 4, `サブ行のバーが足りない: ${rects.length}`);

  const aaimRight = Math.max(...rects.filter((r) => r.left < 300).map((r) => r.right));
  const odriveLeft = Math.min(...rects.filter((r) => r.left >= 300).map((r) => r.left));
  assert.ok(aaimRight < odriveLeft,
    `A-AIM(右端 ${aaimRight}) と O-DRIVE(左端 ${odriveLeft}) が重なっている`);
});

test('片方だけ効いているときも、それぞれの位置は動かない', () => {
  // 「空いた場所へ詰める」ことはしない。バーが左右に飛ぶと目で追えなくなる
  const both = drawHud();
  const alone = drawHud({ player: { ...makePlayer(), autoAimTimer: 0 } });

  assert.equal(textX(alone.ctx, 'A-AIM'), null, '切れているのに A-AIM が出ている');
  assert.deepEqual(textX(alone.ctx, 'O-DRIVE'), textX(both.ctx, 'O-DRIVE'),
    'A-AIM の有無で O-DRIVE の位置が動いている');
});

test('INVINCIBLE 札が CARRIER の表示と重ならない', () => {
  const { ctx } = drawHud({ debugInvincible: true });
  const badge = textX(ctx, 'INVINCIBLE');
  const carrier = textX(ctx, 'CARRIER');
  assert.ok(badge, '札が出ていない');
  assert.ok(carrier, 'CARRIER が出ていない');
  const overlapsRow = badge.y === carrier.y;
  const badgeRight = badge.x + 'INVINCIBLE'.length * 16 * 0.6;
  assert.ok(!overlapsRow || badgeRight < carrier.x,
    `札(${badge.x}..${badgeRight}) が CARRIER(${carrier.x}) に重なっている`);
});


// ============================================
// ゾーン分けと、ライフゲージの整列
// ============================================
//
// HUD は「進行 / 武装 / 機体 / 得点」の4ゾーンに割ってある。16:9 で横が
// 342px 増えたとき、要素が 1024 幅の絶対座標のまま左に寄っていて、
// CARRIER の右端と SCORE の左端のあいだに 251px の穴が空いていた。
// ゾーンの原点を CANVAS_WIDTH から導くことで、次に解像度が動いても
// 同じ穴が空かないようにしている。

/**
 * 塗り色を追いながら fillRect を集める。HP バーのように「色でしか
 * 見分けられない矩形」を取り出すために要る。
 */
function rectsByFill(ctx, fill) {
  const out = [];
  let cur = '';
  for (const c of ctx.calls) {
    if (c.name === 'set:fillStyle') cur = c.args[0];
    else if (c.name === 'fillRect' && cur === fill) {
      const [x, y, w, h] = c.args;
      out.push({ x, y, w, h });
    }
  }
  return out;
}

test('ATTACKER と CARRIER の HP バーは左端も幅も揃う', () => {
  // 元は 40px と 60px だった。HP の比(100:120 なら 40:48)でもなく、
  // 単に場所が空いていただけの値で、根拠のコメントも無かった。
  const { ctx } = drawHud();
  const bars = rectsByFill(ctx, '#DD0000');
  assert.equal(bars.length, 2, `HP バーが2本ない: ${bars.length}`);
  const [a, b] = bars;
  assert.equal(a.x, b.x, `左端が揃っていない: ${a.x} と ${b.x}`);
  assert.equal(a.w, b.w, `幅が揃っていない: ${a.w} と ${b.w}`);
  assert.notEqual(a.y, b.y, '2本が同じ段に重なっている');
});

test('リペアキットの数が変わっても、機体ゾーンの他の要素は動かない', () => {
  // 以前はキットが CARRIER の表示の直後に並んでいて、増減で押し出しが起きえた。
  // キット自身は文字を描かないので、**文字の描画をすべて**突き合わせれば
  // ラベルだけでなく残機の数字のズレも捕まる（ラベルだけ見ていた版は、
  // 残機を動かすミューテーションを素通しした）。
  const none = drawHud({ player: { ...makePlayer(), repairKits: 0 } });
  const many = drawHud({ player: { ...makePlayer(), repairKits: 8 } });

  const texts = (ctx) => ctx.calls
    .filter((c) => c.name === 'fillText')
    .map((c) => `${c.args[0]}@${c.args[1]},${c.args[2]}`);
  assert.deepEqual(texts(none.ctx), texts(many.ctx),
    'キットの数で文字の位置が動いている');

  for (const fill of ['#DD0000', '#00DD00']) {
    assert.deepEqual(rectsByFill(none.ctx, fill), rectsByFill(many.ctx, fill),
      `キットの数で HP バー(${fill})の位置が動いている`);
  }
});

test('HUD の描画はすべて画面幅の内側に収まる', () => {
  // 右端揃えのスコアが画面外へ出ていないか。
  // **文字も測る。** 矩形だけ見ていた版は、得点を 200px 右へずらす
  // ミューテーションを素通しした。
  const { ctx } = drawHud();
  let font = '';
  let align = 'left';
  for (const c of ctx.calls) {
    if (c.name === 'set:font') font = c.args[0];
    else if (c.name === 'set:textAlign') align = c.args[0];
    else if (c.name === 'fillRect' || c.name === 'strokeRect') {
      const [x, , w] = c.args;
      if (w >= W) continue;             // 背景と画面の縁の帯は対象外
      assert.ok(x >= 0 && x + w <= W, `rect(${x},w=${w}) が画面外にある`);
    } else if (c.name === 'fillText') {
      const [text, x] = c.args;
      const px = parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? '16');
      const tw = String(text).length * px * 0.6;   // 等幅なので字数から出せる
      const left = align === 'right' ? x - tw : align === 'center' ? x - tw / 2 : x;
      assert.ok(left >= 0 && left + tw <= W,
        `文字 "${text}"(${left}..${left + tw}, align=${align}) が画面外にある`);
    }
  }
});

test('ゾーンの区切り線は帯の中に3本あり、左から右へ並ぶ', () => {
  const { ctx } = drawHud();
  const rules = rectsByFill(ctx, '#2a2a2a');
  assert.equal(rules.length, 3, `区切り線が3本ない: ${rules.length}`);
  for (const r of rules) {
    assert.ok(r.y > 0 && r.y + r.h <= HUD_TOP_HEIGHT, `区切り線が帯からはみ出している: ${JSON.stringify(r)}`);
  }
  const xs = rules.map((r) => r.x);
  assert.deepEqual(xs, [...xs].sort((a, b) => a - b), '区切り線の順序が入れ替わっている');
});

test('いまの CANVAS_WIDTH は HUD が要る最小幅を満たしている', () => {
  // ゾーンは内容から決めた固定幅で、余りは得点ゾーンが受ける。
  // ここを下回ると得点が機体ゾーンに食い込む。CANVAS_WIDTH を下げるときの見張り。
  assert.ok(CANVAS_WIDTH >= HUD_MIN_WIDTH,
    `CANVAS_WIDTH(${CANVAS_WIDTH}) が HUD の最小幅(${HUD_MIN_WIDTH})を下回っている`);
});
