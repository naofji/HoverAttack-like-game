// HUD の配置。
//
// HUD は上端 HUD_TOP_HEIGHT px の帯で、その中に2段＋時限バフのサブ行が入る。
// **帯からはみ出したものはプレイフィールドの上に描かれる**（区切り線をまたぐ）。
// O-DRIVE バーを A-AIM の下に足したときに実際そうなったので、
// 「HUD の中に収まっているか」を機械的に縛る。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HUD } from '../src/js/ui/HUD.js';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import {
  HUD_TOP_HEIGHT, PLAYER_MAX_HP, CARRIER_MAX_HP, HOVER_MAX_FUEL,
  OVERDRIVE_DURATION, AUTO_AIM_DURATION, AUTO_AIM_MAX_DURATION,
} from '../src/js/utils/Constants.js';

const W = 1024;

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
