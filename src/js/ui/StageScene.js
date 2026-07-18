// ============================================
// StageScene - a compact "one cut" of each stage for the stage-ranking screen.
// Cave cross-section with the player (left) and that stage's first-introduced
// enemy (right) trading missiles. Drawn with lightweight custom sprites (the
// real entity draw() methods are game-coupled and the wrong scale for a preview).
// ============================================

import { lerpColor } from '../utils/color.js';

// Which enemy is signature / first-introduced per stage (index 0..6 = stage 1..7).
const STAGE_ENEMY = [
    { kind: 'tank',    color: '#E0B000' }, // 1: Yellow tank
    { kind: 'soldier', color: '#55CCDD' }, // 2: Light-blue attacker
    { kind: 'soldier', color: '#44AA44' }, // 3: Green robot (heavy)
    { kind: 'drone',   color: '#4a5058' }, // 4: Blackish drone
    { kind: 'soldier', color: '#CC3333' }, // 5: Rival (red)
    { kind: 'soldier', color: '#DDAA00' }, // 6: Yellow missile robot (artillery)
    { kind: 'cruise',  color: '#ff6a52' }, // 7: Cruise missile (the enemy is the missile)
];

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
    const hover = Math.sin(nowMs / 320) * 2;

    const playerX = x + w * 0.16;
    const enemyMeta = STAGE_ENEMY[stageIndex] || STAGE_ENEMY[0];
    const enemyX = x + w * 0.84;

    // Muzzle anchor points (roughly where each side's weapon fires from).
    const pMuzzle = { x: playerX + 22, y: floorY - 16 + hover };
    const eMuzzle = { x: enemyX - 20, y: floorY - 14 - hover };

    drawMiniPlayer(ctx, playerX, floorY, hover);
    drawEnemy(ctx, enemyMeta, enemyX, floorY, -hover);

    drawExchange(ctx, pMuzzle, eMuzzle, nowMs);
    ctx.restore();
}

function drawCave(ctx, x, y, w, h, palette) {
    // Rounded dark chamber with a faint stage tint + accent frame.
    const r = 10;
    ctx.beginPath();
    roundRectPath(ctx, x, y, w, h, r);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, lerpColor(palette.fill, '#000000', 0.72));
    g.addColorStop(1, lerpColor(palette.fill, '#000000', 0.5));
    ctx.fillStyle = g;
    ctx.fill();

    ctx.save();
    ctx.clip();
    // Floor slab
    ctx.fillStyle = lerpColor(palette.fill, '#000000', 0.35);
    ctx.fillRect(x, y + h - 16, w, 16);
    ctx.fillStyle = lerpColor(palette.fill, '#ffffff', 0.12);
    ctx.fillRect(x, y + h - 16, w, 2);

    // Stalactites (top) and stalagmites (bottom) silhouettes.
    ctx.fillStyle = lerpColor(palette.fill, '#000000', 0.2);
    const spikes = [0.28, 0.5, 0.68, 0.9];
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

    // Accent frame
    ctx.lineWidth = 2;
    ctx.strokeStyle = lerpColor(palette.fill, '#ffffff', 0.35);
    ctx.beginPath();
    roundRectPath(ctx, x, y, w, h, r);
    ctx.stroke();
}

function drawMiniPlayer(ctx, cx, floorY, hover) {
    const bodyC = '#E8E8E8'; // player mech is white (matches in-game sprite)
    const y = floorY - 26 + hover;
    ctx.save();
    // Hover exhaust
    ctx.fillStyle = 'rgba(0,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(cx, floorY - 2, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Body (rounded)
    ctx.fillStyle = bodyC;
    roundRectPath(ctx, cx - 9, y, 18, 20, 5);
    ctx.fill();
    // Backpack
    ctx.fillStyle = '#AAAAAA';
    ctx.fillRect(cx - 13, y + 4, 5, 12);
    // Visor (facing right) — blue accent
    ctx.fillStyle = '#00AAFF';
    ctx.fillRect(cx + 2, y + 4, 5, 4);
    // Bazooka pointing right
    ctx.fillStyle = '#3a3f45';
    ctx.fillRect(cx + 6, y + 9, 20, 6);
    ctx.fillStyle = '#22262b';
    ctx.fillRect(cx + 24, y + 8, 4, 8);
    ctx.restore();
}

function drawEnemy(ctx, meta, cx, floorY, hover) {
    switch (meta.kind) {
        case 'tank': return drawMiniTank(ctx, cx, floorY, meta.color);
        case 'turret': return drawMiniTurret(ctx, cx, floorY, meta.color);
        case 'drone': return drawMiniDrone(ctx, cx, floorY, hover, meta.color);
        case 'cruise': return drawMiniCruise(ctx, cx, floorY, hover, meta.color);
        case 'soldier':
        default: return drawMiniSoldier(ctx, cx, floorY, hover, meta.color);
    }
}

function drawMiniSoldier(ctx, cx, floorY, hover, color) {
    const y = floorY - 26 + hover;
    ctx.save();
    ctx.fillStyle = 'rgba(0,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx, floorY - 2, 8, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    roundRectPath(ctx, cx - 9, y, 18, 20, 5);
    ctx.fill();
    // Helmet visor (facing left)
    ctx.fillStyle = '#ffee66';
    ctx.fillRect(cx - 7, y + 4, 5, 4);
    // Gun pointing left
    ctx.fillStyle = '#2b2f34';
    ctx.fillRect(cx - 26, y + 9, 20, 6);
    ctx.fillRect(cx - 28, y + 8, 4, 8);
    ctx.restore();
}

function drawMiniTank(ctx, cx, floorY, color) {
    ctx.save();
    // Tracks
    ctx.fillStyle = '#2a2d31';
    roundRectPath(ctx, cx - 20, floorY - 12, 40, 12, 4);
    ctx.fill();
    // Hull
    ctx.fillStyle = color;
    roundRectPath(ctx, cx - 16, floorY - 22, 32, 12, 4);
    ctx.fill();
    // Turret + barrel (left)
    ctx.fillStyle = lerpColor(color, '#000000', 0.25);
    roundRectPath(ctx, cx - 8, floorY - 30, 16, 10, 3);
    ctx.fill();
    ctx.fillStyle = '#2b2f34';
    ctx.fillRect(cx - 30, floorY - 27, 22, 5);
    ctx.restore();
}

function drawMiniTurret(ctx, cx, floorY, color) {
    ctx.save();
    // Base
    ctx.fillStyle = lerpColor(color, '#000000', 0.3);
    roundRectPath(ctx, cx - 14, floorY - 12, 28, 12, 3);
    ctx.fill();
    // Dome
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, floorY - 12, 12, Math.PI, 0);
    ctx.fill();
    // Eye + barrel (left)
    ctx.fillStyle = '#ff5555';
    ctx.beginPath();
    ctx.arc(cx - 2, floorY - 16, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2f34';
    ctx.fillRect(cx - 28, floorY - 18, 16, 5);
    ctx.restore();
}

function drawMiniDrone(ctx, cx, floorY, hover, color) {
    const cy = floorY - 34 + hover * 2;
    ctx.save();
    // Rotor blur
    ctx.strokeStyle = 'rgba(200,220,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 16, cy - 12);
    ctx.lineTo(cx + 16, cy - 12);
    ctx.stroke();
    // Body
    ctx.fillStyle = color;
    roundRectPath(ctx, cx - 13, cy - 8, 26, 14, 6);
    ctx.fill();
    // Eye (left)
    ctx.fillStyle = '#ff5555';
    ctx.beginPath();
    ctx.arc(cx - 6, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    // Legs
    ctx.strokeStyle = lerpColor(color, '#000000', 0.4);
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy + 6); ctx.lineTo(cx - 10, cy + 14);
    ctx.moveTo(cx + 8, cy + 6); ctx.lineTo(cx + 10, cy + 14);
    ctx.stroke();
    ctx.restore();
}

function drawMiniCruise(ctx, cx, floorY, hover, color) {
    const cy = floorY - 26 + hover * 2;
    ctx.save();
    // Warning glow
    ctx.fillStyle = 'rgba(255,80,60,0.25)';
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fill();
    // Missile body (pointing left)
    ctx.fillStyle = color;
    roundRectPath(ctx, cx - 18, cy - 6, 34, 12, 6);
    ctx.fill();
    ctx.beginPath(); // nose cone
    ctx.moveTo(cx - 18, cy - 6);
    ctx.lineTo(cx - 30, cy);
    ctx.lineTo(cx - 18, cy + 6);
    ctx.closePath();
    ctx.fill();
    // Fins
    ctx.fillStyle = lerpColor(color, '#000000', 0.3);
    ctx.beginPath();
    ctx.moveTo(cx + 14, cy - 6); ctx.lineTo(cx + 22, cy - 12); ctx.lineTo(cx + 16, cy - 6);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 14, cy + 6); ctx.lineTo(cx + 22, cy + 12); ctx.lineTo(cx + 16, cy + 6);
    ctx.closePath(); ctx.fill();
    // Exhaust
    ctx.fillStyle = 'rgba(255,200,80,0.8)';
    ctx.beginPath();
    ctx.moveTo(cx + 16, cy - 4); ctx.lineTo(cx + 28, cy); ctx.lineTo(cx + 16, cy + 4);
    ctx.closePath(); ctx.fill();
    ctx.restore();
}

// Two missiles crossing between the muzzles, with muzzle flashes, on a loop.
function drawExchange(ctx, p, e, nowMs) {
    const phase = (nowMs % 1600) / 1600;

    // Player missile: travels p -> e during [0, 0.6)
    if (phase < 0.6) {
        const t = phase / 0.6;
        drawFlyingMissile(ctx, lerp(p.x, e.x, t), lerp(p.y, e.y, t), true, '#FFDD33');
    }
    // Enemy missile: travels e -> p during [0.35, 0.95)
    if (phase >= 0.35 && phase < 0.95) {
        const t = (phase - 0.35) / 0.6;
        drawFlyingMissile(ctx, lerp(e.x, p.x, t), lerp(e.y, p.y, t), false, '#FF5544');
    }
    // Muzzle flashes at fire moments.
    if (phase < 0.08) drawFlash(ctx, p.x, p.y, '#FFEE99');
    if (phase >= 0.35 && phase < 0.43) drawFlash(ctx, e.x, e.y, '#FFB0A0');
}

function drawFlyingMissile(ctx, mx, my, movingRight, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(mx, my, 4, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Trail
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
