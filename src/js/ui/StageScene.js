// ============================================
// StageScene - a compact "one cut" of each stage for the stage-ranking screen.
// Cave cross-section with the player (left) and that stage's first-introduced
// enemy (right) trading missiles. Reuses the REAL entity draw() methods so the
// sprites look exactly like in-game; entities are built against a small stub
// game (fixed aim) and drawn scaled/positioned in a preview area.
// ============================================

import { lerpColor } from '../utils/color.js';
import { ENEMY_ATTACKER_TYPES } from '../utils/Constants.js';
import { Player } from '../entities/Player.js';
import { EnemyTank } from '../entities/EnemyTank.js';
import { EnemyAttacker } from '../entities/EnemyAttacker.js';
import { EnemyDrone } from '../entities/EnemyDrone.js';
import { EnemyCruiseMissile } from '../entities/EnemyCruiseMissile.js';

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

    drawEntity(ctx, e.player, 'player', playerX, floorY, bob);
    drawEntity(ctx, e[enemyKey], enemyKey, enemyX, floorY, -bob);

    // Missiles crossing between the two (roughly weapon height).
    const midY = floorY - 26;
    drawExchange(ctx, { x: playerX + 26, y: midY + bob }, { x: enemyX - 26, y: midY - bob }, nowMs);
    ctx.restore();
}

function drawEntity(ctx, ent, key, centerX, floorY, bob) {
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
        // Centered sprites float above the floor.
        ctx.translate(centerX, floorY - 40 + bob);
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

// Two missiles crossing between the muzzles, with muzzle flashes, on a loop.
function drawExchange(ctx, p, e, nowMs) {
    const phase = (nowMs % 1600) / 1600;
    if (phase < 0.6) {
        const t = phase / 0.6;
        drawFlyingMissile(ctx, lerp(p.x, e.x, t), lerp(p.y, e.y, t), true, '#FFDD33');
    }
    if (phase >= 0.35 && phase < 0.95) {
        const t = (phase - 0.35) / 0.6;
        drawFlyingMissile(ctx, lerp(e.x, p.x, t), lerp(e.y, p.y, t), false, '#FF5544');
    }
    if (phase < 0.08) drawFlash(ctx, p.x, p.y, '#FFEE99');
    if (phase >= 0.35 && phase < 0.43) drawFlash(ctx, e.x, e.y, '#FFB0A0');
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
