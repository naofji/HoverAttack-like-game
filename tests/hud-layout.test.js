// HUD の配置。
//
// HUD は上端 HUD_TOP_HEIGHT px の帯で、その中に2段＋時限バフのサブ行が入る。
// **帯からはみ出したものはプレイフィールドの上に描かれる**（区切り線をまたぐ）。
// O-DRIVE バーを A-AIM の下に足したときに実際そうなったので、
// 「HUD の中に収まっているか」を機械的に縛る。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HUD, HUD_MIN_WIDTH, HUD_BUFF_TICK_COLOR, HUD_HP_DAMAGE_COLOR } from '../src/js/ui/HUD.js';
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

test('AUTO AIM と OVERDRIVE は同じ段に横並びで出る', () => {
  const { ctx } = drawHud();
  const a = textX(ctx, 'AUTO AIM');
  const o = textX(ctx, 'OVERDRIVE');
  assert.ok(a && o, '両方のラベルが出ていない');
  assert.equal(a.y, o.y, '同じ段になっていない');
  assert.ok(a.x < o.x, 'AUTO AIM が OVERDRIVE の右にある');
});

test('2本のバーは横に重ならない', () => {
  const { ctx } = drawHud();
  const a = textX(ctx, 'AUTO AIM');
  const o = textX(ctx, 'OVERDRIVE');
  const barsNear = (x0, x1) => ctx.calls
    .filter((c) => c.name === 'fillRect' && Math.abs(c.args[1] + c.args[3] / 2 - a.y) < 8
                   && c.args[0] >= x0 && c.args[0] < x1)
    .map((c) => ({ left: c.args[0], right: c.args[0] + c.args[2] }));
  const aa = barsNear(a.x, o.x);
  const od = barsNear(o.x, Infinity);
  assert.ok(aa.length && od.length, 'バーが見つからない');
  assert.ok(Math.max(...aa.map((r) => r.right)) < Math.min(...od.map((r) => r.left)),
    'AUTO AIM と OVERDRIVE のバーが重なっている');
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
  const bars = rectsByFill(ctx, HUD_HP_DAMAGE_COLOR);
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

  for (const fill of [HUD_HP_DAMAGE_COLOR, '#12D64A']) {
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

test('縦の区切り線は引かない（塊は間隔だけで出す）', () => {
  // 実機で「機械的でデザインされていない」と却下された。塊は
  // ゾーン間の余白と段の揃えだけで表す。
  const { ctx } = drawHud();
  assert.equal(rectsByFill(ctx, '#2a2a2a').length, 0, '区切り線が残っている');
});

test('いまの CANVAS_WIDTH は HUD が要る最小幅を満たしている', () => {
  // ゾーンは内容から決めた固定幅で、余りは得点ゾーンが受ける。
  // ここを下回ると得点が機体ゾーンに食い込む。CANVAS_WIDTH を下げるときの見張り。
  assert.ok(CANVAS_WIDTH >= HUD_MIN_WIDTH,
    `CANVAS_WIDTH(${CANVAS_WIDTH}) が HUD の最小幅(${HUD_MIN_WIDTH})を下回っている`);
});


// ============================================
// 作り直した HUD の不変条件
// ============================================

/** 描かれた文字を、その時点のフォントと揃えごと拾う。 */
function texts(ctx) {
  const out = [];
  let font = '', align = 'left';
  for (const c of ctx.calls) {
    if (c.name === 'set:font') font = c.args[0];
    else if (c.name === 'set:textAlign') align = c.args[0];
    else if (c.name === 'fillText') {
      const px = parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? '16');
      out.push({ text: String(c.args[0]), x: c.args[1], y: c.args[2], px, align });
    }
  }
  return out;
}
const find = (ctx, t) => texts(ctx).find((e) => e.text === t);

// --- 段の揃え ---

test('3つのゾーンで、段の中心の高さが揃う', () => {
  // 各ゾーンを縦中央に置いていた頃は、段の高さの違いで下段が
  // 43.0 / 46.5 / 47.5 とバラバラになり、TIME と BONUS が沈んで見えた。
  const { ctx } = drawHud();
  const rows = ['ATTACKER', 'MISSILE', 'MISSION'].map((t) => find(ctx, t));
  const rows2 = ['CARRIER', 'HOVER', 'TIME'].map((t) => find(ctx, t));
  for (const r of [...rows, ...rows2]) assert.ok(r, '基準の文字が出ていない');
  assert.equal(new Set(rows.map((r) => r.y)).size, 1, `上段が揃っていない: ${rows.map((r) => r.y)}`);
  assert.equal(new Set(rows2.map((r) => r.y)).size, 1, `下段が揃っていない: ${rows2.map((r) => r.y)}`);
});

test('武装ゾーンは1段目と2段目の左端が揃う', () => {
  const { ctx } = drawHud();
  assert.equal(find(ctx, 'MISSILE').x, find(ctx, 'HOVER').x,
    'MISSILE と HOVER の左端がずれている');
});

// --- ラベルとバーの間隔 ---

test('HOVER / AUTO AIM / OVERDRIVE は、字の右端からバーの左端までが同じ', () => {
  // 等間隔にしていた頃は、ラベルがどちらのバーに属するか目で決められなかった。
  const { ctx } = drawHud();
  const gaps = [];
  for (const label of ['HOVER', 'AUTO AIM', 'OVERDRIVE']) {
    const t = find(ctx, label);
    assert.ok(t, `${label} が出ていない`);
    const right = t.x + t.text.length * t.px * 0.6;
    // そのラベルより右で、いちばん近い矩形の左端
    // HOVER は三角形なので fillRect ではなく moveTo で始まる
    const lefts = ctx.calls
      .filter((c) => (c.name === 'fillRect' && c.args[0] > right - 1
                      && Math.abs(c.args[1] + c.args[3] / 2 - t.y) < 14)
                  || (c.name === 'moveTo' && c.args[0] > right - 1 && Math.abs(c.args[1] - t.y) < 14))
      .map((c) => c.args[0]);
    assert.ok(lefts.length, `${label} の右にバーが無い`);
    gaps.push(Math.round(Math.min(...lefts) - right));
  }
  assert.equal(new Set(gaps).size, 1, `間隔が揃っていない: ${gaps.join(' / ')}`);
});

// --- 武器の3状態 ---

test('武器を切り替えても、ラベルの位置は動かない', () => {
  // 選択中だけ左の余白が違うと、切り替えるたびに字が横に飛ぶ。
  const mg = drawHud();
  const missile = drawHud({ player: { ...makePlayer(), currentWeapon: 'missile' } });
  for (const label of ['MISSILE', 'MACHINE GUN', 'GRENADE']) {
    assert.deepEqual(
      { x: find(mg.ctx, label).x, y: find(mg.ctx, label).y },
      { x: find(missile.ctx, label).x, y: find(missile.ctx, label).y },
      `${label} が武器の切り替えで動いている`);
  }
});

test('GRENADE は選択の対象ではないので暗くしない', () => {
  // いつでも撃てるものなので、非選択の武器と同じ扱いにはしない。
  const { ctx } = drawHud();
  const inks = [];
  let cur = '';
  for (const c of ctx.calls) {
    if (c.name === 'set:fillStyle') cur = c.args[0];
    else if (c.name === 'fillText' && c.args[0] === 'GRENADE') inks.push(cur);
  }
  assert.equal(inks.length, 1, 'GRENADE が1回だけ描かれていない');
  assert.equal(inks[0], '#FFCC00', `暗い色で描かれている: ${inks[0]}`);
});

// --- 省略しない ---

test('ラベルは省略形を使わない', () => {
  const { ctx } = drawHud();
  const all = texts(ctx).map((t) => t.text);
  for (const full of ['MISSILE', 'MACHINE GUN', 'GRENADE', 'AUTO AIM', 'OVERDRIVE']) {
    assert.ok(all.includes(full), `${full} が出ていない`);
  }
  for (const abbr of ['GREN', 'M-GUN', 'A-AIM', 'O-DRIVE', 'O-DRV']) {
    assert.equal(all.includes(abbr), false, `省略形 ${abbr} が残っている`);
  }
});

// --- 得点エリア ---

test('TIME は得点エリアにあり、白系で描かれる', () => {
  const { ctx } = drawHud();
  const time = find(ctx, 'TIME');
  const score = find(ctx, 'SCORE');
  assert.ok(time && score, 'TIME か SCORE が出ていない');
  assert.ok(time.x > CANVAS_WIDTH / 2, 'TIME が得点エリアに無い');
  // 直前に置かれた塗り色を見る
  let ink = '';
  for (const c of ctx.calls) {
    if (c.name === 'set:fillStyle') ink = c.args[0];
    if (c.name === 'fillText' && /^\d\d:\d\d\.\d\d$/.test(String(c.args[0]))) break;
  }
  assert.match(ink, /^#[EF]/i, `時計が白系でない: ${ink}`);
});

test('数字の大きさは SCORE > MISSION > BONUS > TIME の順', () => {
  const { ctx } = drawHud();
  const px = (t) => texts(ctx).find((e) => e.text === t).px;
  const score = texts(ctx).find((e) => /^\d{7}$/.test(e.text)).px;
  const mission = texts(ctx).find((e) => e.text === '3' && e.x > CANVAS_WIDTH / 2).px;
  const bonus = texts(ctx).find((e) => /^\d{6}$/.test(e.text)).px;
  const time = texts(ctx).find((e) => /^\d\d:\d\d\.\d\d$/.test(e.text)).px;
  void px;
  assert.ok(score > mission, `SCORE(${score}) > MISSION(${mission})`);
  assert.ok(mission > bonus, `MISSION(${mission}) > BONUS(${bonus})`);
  assert.ok(bonus > time, `BONUS(${bonus}) > TIME(${time})`);
});

// --- バフのバーの刻み ---

test('AUTO AIM は3個ぶん、OVERDRIVE は2個ぶんの刻みが入る', () => {
  // 刻みの数 = 何個まで重ねられるか。1個ぶんの長さは両方で同じにする。
  const { ctx } = drawHud();
  const ticks = rectsByFill(ctx, HUD_BUFF_TICK_COLOR);
  assert.equal(ticks.length, 3, `刻みは AUTO AIM 2本 + OVERDRIVE 1本 のはず: ${ticks.length}`);
});
