// ============================================
// StageScene - a compact "one cut" of each stage for the stage-ranking screen.
// Cave cross-section with the player (left) and that stage's first-introduced
// enemy (right) trading missiles. Reuses the REAL entity draw() methods so the
// sprites look exactly like in-game; entities are built against a small stub
// game (fixed aim) and drawn scaled/positioned in a preview area.
// ============================================

import { lerpColor } from '../utils/color.js';
import { ENEMY_ATTACKER_TYPES, STAGE_ENVIRONMENTS, WATER_FILL } from '../utils/Constants.js';
import { Player } from '../entities/Player.js';
import { EnemyTank } from '../entities/EnemyTank.js';
import { EnemyAttacker } from '../entities/EnemyAttacker.js';
import { EnemyDrone } from '../entities/EnemyDrone.js';
import { EnemyCruiseMissile } from '../entities/EnemyCruiseMissile.js';
import { drawSurfaceLine } from '../world/environment/water.js';

// Minimal stub so entity constructors/draw() run outside a live game. The player's
// weapon aims at getTargetWorld() — return a point far to the right so it faces right.
const stubGame = {
    input: {
        getTargetWorld: () => ({ x: 1e6, y: 0 }),
        getMouseWorld: () => ({ x: 1e6, y: 0 }),
    },
    camera: { x: 0, y: 0 },
    canvas: { width: 800, height: 600 },
    enemies: [],
    projectiles: [],
    enemyBullets: [],
    particles: [],
};

// Which enemy is signature / first-introduced per stage (index 0..6 = stage 1..7).
const STAGE_ENEMY_KEY = ['tank', 'attacker', 'heavy', 'drone', 'rival', 'artillery', 'cruise'];

/**
 * 面セレクトの一覧に出す敵の名前。**この表と STAGE_ENEMY_KEY を同じファイルに
 * 置いているのは、「何面には誰が出るか」の対応を1箇所に閉じるため。** 画面側に
 * 名前だけ持たせると、シーンに描かれる敵と一覧の名前が別々に育って食い違う。
 * @param {number} stageIndex 0..6
 * @returns {string} 表示名（未定義の面は空文字）
 */
export function stageEnemyLabel(stageIndex) {
    return ENEMY_LABELS[STAGE_ENEMY_KEY[stageIndex]] || '';
}

const ENEMY_LABELS = {
    tank: 'TANK',
    attacker: 'ATTACKER',
    heavy: 'HEAVY',
    drone: 'DRONE',
    rival: 'RIVAL',
    artillery: 'ARTILLERY',
    cruise: 'CRUISE MISSILE',
};

// What that enemy fires back at the player (matches in-game behaviour):
//   tank/drone -> bullets, attackers -> missiles, artillery -> homing missile,
//   cruise missile -> fires nothing; the missile itself flies right -> left.
const STAGE_PROJECTILE = ['bullet', 'missile', 'missile', 'bullet', 'missile', 'homing', 'fly'];

// anchor: how the entity's draw() places itself relative to (this.x, this.y).
//   'topleft' — draws from top-left; sit its feet on the floor.
//   'centerHalf' — draws around (x + w/2, y + h/2) (e.g. drone).
//   'centerDirect' — draws around (x, y) (e.g. cruise missile).
const META = {
    player:    { anchor: 'topleft', k: 1.6, float: false },
    tank:      { anchor: 'topleft', k: 1.4, float: false },
    attacker:  { anchor: 'topleft', k: 1.6, float: false },
    heavy:     { anchor: 'topleft', k: 1.6, float: false },
    rival:     { anchor: 'topleft', k: 1.6, float: false },
    artillery: { anchor: 'topleft', k: 1.6, float: false },
    drone:     { anchor: 'centerHalf', k: 1.47, float: true },
    cruise:    { anchor: 'centerDirect', k: 1.6, float: true },
};

let cache = null;
function entities() {
    if (cache) return cache;
    const e = {
        player: new Player(stubGame, 0, 0),
        tank: new EnemyTank(stubGame, 0, 0),
        attacker: new EnemyAttacker(stubGame, 0, 0, ENEMY_ATTACKER_TYPES.standard),
        heavy: new EnemyAttacker(stubGame, 0, 0, ENEMY_ATTACKER_TYPES.heavy),
        rival: new EnemyAttacker(stubGame, 0, 0, ENEMY_ATTACKER_TYPES.rival),
        artillery: new EnemyAttacker(stubGame, 0, 0, ENEMY_ATTACKER_TYPES.artillery),
        drone: new EnemyDrone(stubGame, 0, 0),
        cruise: new EnemyCruiseMissile(stubGame, 0, 0, Math.PI, []),
    };
    e.player.facingRight = true;
    e.player.docked = false;
    e.player.crouching = false;
    for (const k of ['tank', 'attacker', 'heavy', 'rival', 'artillery']) e[k].facingRight = false;
    if ('tiltAngle' in e.drone) e.drone.tiltAngle = 0;
    e.cruise.angle = Math.PI; // point left, toward the player
    e.cruise.driftAngle = 0;
    e.cruise.path = [];
    cache = e;
    return e;
}

/**
 * Draw the stage scene inside the rect (x, y, w, h).
 * @param {number} stageIndex 0..6
 * @param {{fill:string, border:string}} palette stage palette
 * @param {number} nowMs Date.now() (drives the light animation)
 */
export function drawStageScene(ctx, x, y, w, h, stageIndex, palette, nowMs) {
    ctx.save();
    drawCave(ctx, x, y, w, h, palette);

    const floorY = y + h - 20;
    const bob = Math.sin(nowMs / 320) * 2;

    const e = entities();
    const playerX = x + w * 0.17;
    const enemyKey = STAGE_ENEMY_KEY[stageIndex] || 'tank';
    const enemyX = x + w * 0.83;
    const proj = STAGE_PROJECTILE[stageIndex] || 'missile';
    const midY = floorY - 26;

    drawEntity(ctx, e.player, 'player', playerX, floorY, bob);

    if (proj === 'fly') {
        // Stage 7: the cruise missile itself flies right -> left toward the player
        // (it fires nothing). The player launches an interceptor missile at it.
        drawIntercept(ctx, e, { x: playerX + 26, y: midY + bob }, enemyX + 30, playerX + 40, floorY, midY - bob, bob, nowMs);
    } else {
        drawEntity(ctx, e[enemyKey], enemyKey, enemyX, floorY, -bob);
        drawExchange(ctx, { x: playerX + 26, y: midY + bob }, { x: enemyX - 26, y: midY - bob }, nowMs, proj);
    }

    // 面の環境を帯の中に描く（設計: デモ画面の背景）。全画面の重ねは画面側が別に行う
    const kind = STAGE_ENVIRONMENTS[stageIndex] ? STAGE_ENVIRONMENTS[stageIndex].kind : 'none';
    if (kind === 'water') {
        ctx.save();
        roundRectPath(ctx, x, y, w, h, 10);
        ctx.clip();
        ctx.fillStyle = WATER_FILL;
        ctx.fillRect(x, floorY - 12, w, h - (floorY - 12 - y));
        drawSurfaceLine(ctx, x, x + w, floorY - 12, nowMs / 16, []);
        ctx.restore();
    }

    ctx.restore();
}

function drawEntity(ctx, ent, key, centerX, floorY, bob, centerYOverride) {
    if (!ent) return;
    const m = META[key];
    const w = ent.width || 16;
    const hgt = ent.height || 24;
    if ('frameCounter' in ent) ent.frameCounter++;

    ctx.save();
    if (m.anchor === 'topleft') {
        ctx.translate(centerX, floorY);
        ctx.scale(m.k, m.k);
        ent.x = -w / 2;
        ent.y = -hgt;
    } else {
        // Centered sprites float above the floor (or at an explicit Y).
        const cy = (centerYOverride != null) ? centerYOverride : floorY - 40 + bob;
        ctx.translate(centerX, cy);
        ctx.scale(m.k, m.k);
        if (m.anchor === 'centerHalf') { ent.x = -w / 2; ent.y = -hgt / 2; }
        else { ent.x = 0; ent.y = 0; } // centerDirect
    }
    try {
        ent.draw(ctx);
    } catch (err) {
        // Never let a preview sprite crash the whole screen.
    }
    ctx.restore();
}

function drawCave(ctx, x, y, w, h, palette) {
    const r = 10;
    roundRectPath(ctx, x, y, w, h, r);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, lerpColor(palette.fill, '#000000', 0.72));
    g.addColorStop(1, lerpColor(palette.fill, '#000000', 0.5));
    ctx.fillStyle = g;
    ctx.fill();

    ctx.save();
    roundRectPath(ctx, x, y, w, h, r);
    ctx.clip();
    // Floor slab
    ctx.fillStyle = lerpColor(palette.fill, '#000000', 0.35);
    ctx.fillRect(x, y + h - 16, w, 16);
    ctx.fillStyle = lerpColor(palette.fill, '#ffffff', 0.12);
    ctx.fillRect(x, y + h - 16, w, 2);
    // Stalactite silhouettes
    ctx.fillStyle = lerpColor(palette.fill, '#000000', 0.2);
    const spikes = [0.3, 0.5, 0.68, 0.92];
    for (let i = 0; i < spikes.length; i++) {
        const sx = x + w * spikes[i];
        const sw = 14 + (i % 2) * 8;
        ctx.beginPath();
        ctx.moveTo(sx - sw / 2, y);
        ctx.lineTo(sx + sw / 2, y);
        ctx.lineTo(sx, y + 20 + (i % 2) * 8);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();

    ctx.lineWidth = 2;
    ctx.strokeStyle = lerpColor(palette.fill, '#ffffff', 0.35);
    roundRectPath(ctx, x, y, w, h, r);
    ctx.stroke();
}

// --- 7面: クルーズミサイルの迎撃 ---
// 以前は迎撃弾（1.6秒周期）とクルーズミサイル（2.2秒周期）が別々の時計で動き、弾は毎フレーム
// 「その瞬間の相手の位置」へ向けて補間していた。周期が揃わないので、相手が近づくと弾がほとんど
// 進まない・相手が右端へ戻った瞬間に弾が跳ぶ・当たっても何も起きずにすり抜ける、と見えた（実機の指摘）。
// 今は1本の周期の台本にした: 相手は一定の速さで飛んでくる → 決まった時刻に撃つ → 弾は会合点へ
// 一定の速さで飛び、相手とちょうどそこで出会う → 爆発して、周期の終わりまで相手は消える。
// 描画専用の値なので Constants ではなくここに置く。
const INTERCEPT_CYCLE_MS = 2400;
const INTERCEPT_LAUNCH = 0.2;   // 撃つ時刻（周期に対する比）
const INTERCEPT_HIT = 0.55;     // 出会う時刻。相手はこのとき start→end の 55% まで来ている
const INTERCEPT_BLAST = 0.15;   // 爆発の長さ（周期に対する比）
const INTERCEPT_FLASH = 0.04;   // 撃った瞬間の銃口の光

/**
 * 迎撃の1周期のどこにいるか。純粋関数（テストで縛る: tests/stage-scene-intercept.test.js）。
 * @param {number} phase 0..1（周期の中の位置）
 * @param {number} fromX 迎撃弾が出る x
 * @param {number} startX 相手が現れる x（右端）
 * @param {number} endX 相手が進んでいく先の x（自機の手前）
 * @returns {{cruiseX:number|null, missileT:number|null, missileX:number|null, hitX:number,
 *   blast:number|null, muzzle:boolean}} cruiseX が null なら相手は描かない（撃ち落とした後）。
 *   missileT は弾の飛んだ割合 0..1（null なら飛んでいない）。blast は爆発の進み 0..1
 */
export function interceptPhase(phase, fromX, startX, endX) {
    const hitX = lerp(startX, endX, INTERCEPT_HIT);
    const out = { cruiseX: null, missileT: null, missileX: null, hitX, blast: null, muzzle: false };
    if (phase < INTERCEPT_HIT) out.cruiseX = lerp(startX, endX, phase);
    if (phase >= INTERCEPT_LAUNCH && phase < INTERCEPT_HIT) {
        out.missileT = (phase - INTERCEPT_LAUNCH) / (INTERCEPT_HIT - INTERCEPT_LAUNCH);
        out.missileX = lerp(fromX, hitX, out.missileT);
    }
    out.muzzle = phase >= INTERCEPT_LAUNCH && phase < INTERCEPT_LAUNCH + INTERCEPT_FLASH;
    if (phase >= INTERCEPT_HIT && phase < INTERCEPT_HIT + INTERCEPT_BLAST) {
        out.blast = (phase - INTERCEPT_HIT) / INTERCEPT_BLAST;
    }
    return out;
}

function drawIntercept(ctx, e, p, startX, endX, floorY, cruiseY, bob, nowMs) {
    const phase = (nowMs % INTERCEPT_CYCLE_MS) / INTERCEPT_CYCLE_MS;
    const s = interceptPhase(phase, p.x, startX, endX);
    if (s.cruiseX !== null) drawEntity(ctx, e.cruise, 'cruise', s.cruiseX, floorY, -bob, cruiseY);
    if (s.missileT !== null) {
        // 高さも会合点（相手の今の高さ）へ寄せていく。相手は上下に揺れているので、最後に追いつく形にする
        drawFlyingMissile(ctx, s.missileX, lerp(p.y, cruiseY, s.missileT), true, '#FFDD33');
    }
    if (s.muzzle) drawFlash(ctx, p.x, p.y, '#FFEE99');
    if (s.blast !== null) drawBlast(ctx, s.hitX, cruiseY, s.blast);
}

/** 撃ち落とした爆発。広がりながら薄れる火の玉と、外へ散る火花 */
function drawBlast(ctx, bx, by, t) {
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = '#FFB347';
    ctx.beginPath();
    ctx.arc(bx, by, 6 + t * 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFF2B0';
    ctx.beginPath();
    ctx.arc(bx, by, 3 + t * 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FF7A33';
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.4;
        const r = 8 + t * 20;
        ctx.fillRect(bx + Math.cos(a) * r - 1, by + Math.sin(a) * r - 1, 2, 2);
    }
    ctx.restore();
}

// Player missile (yellow, bazooka) travels p -> target on a loop, with a muzzle flash.
function drawPlayerMissile(ctx, p, target, nowMs) {
    const phase = (nowMs % 1600) / 1600;
    if (phase < 0.6) {
        const t = phase / 0.6;
        drawFlyingMissile(ctx, lerp(p.x, target.x, t), lerp(p.y, target.y, t), true, '#FFDD33');
    }
    if (phase < 0.08) drawFlash(ctx, p.x, p.y, '#FFEE99');
}

// Player missile out (yellow) + the enemy's own projectile back, typed per enemy.
function drawExchange(ctx, p, e, nowMs, enemyKind) {
    drawPlayerMissile(ctx, p, e, nowMs);

    const phase = (nowMs % 1600) / 1600;
    if (phase >= 0.35 && phase < 0.95) {
        const t = (phase - 0.35) / 0.6;
        let mx = lerp(e.x, p.x, t);
        let my = lerp(e.y, p.y, t);
        if (enemyKind === 'bullet') {
            drawBullet(ctx, mx, my, '#FF6644');
        } else if (enemyKind === 'homing') {
            my += Math.sin(t * Math.PI * 3) * 7; // wavy homing track
            drawFlyingMissile(ctx, mx, my, false, '#FF9933');
        } else {
            drawFlyingMissile(ctx, mx, my, false, '#FF5544'); // regular missile
        }
    }
    if (phase >= 0.35 && phase < 0.43) drawFlash(ctx, e.x, e.y, '#FFB0A0');
}

function drawBullet(ctx, mx, my, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(mx, my, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawFlyingMissile(ctx, mx, my, movingRight, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(mx, my, 4, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = lerpColor(color, '#000000', 0.2);
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(mx + (movingRight ? -10 : 10), my);
    ctx.stroke();
    ctx.restore();
}

function drawFlash(ctx, fx, fy, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(fx, fy, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}
