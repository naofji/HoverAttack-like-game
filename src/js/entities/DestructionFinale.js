// ============================================
// Base Destruction FX - 敵基地破壊のフィナーレ演出
// ============================================
// 閃光 → 集中線 → 衝撃波リング を重ねて、ボスの最期を雑魚の爆発と差別化する。
// 3つとも既存の Particle と同じ「update() / draw() / alive」契約に従うので、
// game.particles に push するだけでゲームループに乗る（DebrisPart と同じ相乗り方式）。
//
// 座標はワールド座標。particles はカメラ変換の内側で描かれるため、
// 集中線は画面対角より長く取っておけば基地が画面のどこにあっても端まで届く。

import {
    FINALE_FLASH_LIFETIME, FINALE_FLASH_RADIUS,
    FINALE_LINE_COUNT, FINALE_LINE_LIFETIME,
    FINALE_LINE_INNER_MIN, FINALE_LINE_INNER_MAX,
    FINALE_RING_MAX_RADIUS, FINALE_RING_LIFETIME, FINALE_RING_WIDTH,
    CANVAS_WIDTH, CANVAS_HEIGHT,
} from '../utils/Constants.js';

/** 画面の隅まで確実に届く線長。 */
const SCREEN_DIAGONAL = Math.hypot(CANVAS_WIDTH, CANVAS_HEIGHT);

/** 寿命を数えるだけの共通の土台。 */
class TimedFx {
    constructor(x, y, lifetime) {
        this.x = x;
        this.y = y;
        this.maxLife = lifetime;
        this.life = lifetime;
        this.alive = true;
    }

    /** 0（開始）→ 1（消滅）の進行度。 */
    get progress() {
        return 1 - this.life / this.maxLife;
    }

    update() {
        if (!this.alive) return;
        this.life--;
        if (this.life <= 0) this.alive = false;
    }
}

/**
 * 爆発の起点を作る白い閃光。
 * いちばん短命で、集中線・リングが立ち上がる前に消える。
 */
export class FinaleFlash extends TimedFx {
    constructor(x, y) {
        super(x, y, FINALE_FLASH_LIFETIME);
    }

    draw(ctx) {
        if (!this.alive) return;

        const p = this.progress;
        // 一瞬で開いてから閉じる（sin の山）
        const radius = FINALE_FLASH_RADIUS * (0.4 + 0.6 * Math.sin(p * Math.PI));

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - p;
        const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, radius);
        grad.addColorStop(0, '#FFFFFF');
        grad.addColorStop(0.5, '#FFEE99');
        grad.addColorStop(1, 'rgba(255, 140, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

/**
 * 基地を消失点とする放射状の集中線。
 * 角度・内側の始点・線幅を1本ずつ乱数でばらつかせ、機械的な等間隔に見せない。
 */
export class SpeedLines extends TimedFx {
    constructor(x, y) {
        super(x, y, FINALE_LINE_LIFETIME);

        const innerRange = FINALE_LINE_INNER_MAX - FINALE_LINE_INNER_MIN;
        this.lines = [];
        for (let i = 0; i < FINALE_LINE_COUNT; i++) {
            // 均等割りを基準に、隣との間隔ぶんだけランダムにずらす
            const base = (i / FINALE_LINE_COUNT) * Math.PI * 2;
            const angle = base + (Math.random() - 0.5) * (Math.PI * 2 / FINALE_LINE_COUNT);
            this.lines.push({
                cos: Math.cos(angle),
                sin: Math.sin(angle),
                inner: FINALE_LINE_INNER_MIN + Math.random() * innerRange,
                // 画面対角より必ず長くする（基地が画面端にあっても端まで届く）
                outer: SCREEN_DIAGONAL * (1.05 + Math.random() * 0.35),
                width: 1.5 + Math.random() * 3.5,
            });
        }
    }

    draw(ctx) {
        if (!this.alive) return;

        const p = this.progress;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - p;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineCap = 'butt';

        for (const l of this.lines) {
            // 内側の端が外へ逃げていくので、線が中心から吹き飛ぶように見える
            const inner = l.inner + (l.outer - l.inner) * p * 0.35;
            ctx.lineWidth = l.width;
            ctx.beginPath();
            ctx.moveTo(this.x + l.cos * inner, this.y + l.sin * inner);
            ctx.lineTo(this.x + l.cos * l.outer, this.y + l.sin * l.outer);
            ctx.stroke();
        }
        ctx.restore();
    }
}

/**
 * 拡がる衝撃波リング。
 * 序盤で速く広がって後半で減速し、線幅は太→細、不透明度は 1 → 0 へ落とす。
 */
export class ShockwaveRing extends TimedFx {
    constructor(x, y) {
        super(x, y, FINALE_RING_LIFETIME);
    }

    /** 減速カーブ。progress 0→1 に対して 0→1 を、最初に速く返す。 */
    get radius() {
        const p = this.progress;
        return FINALE_RING_MAX_RADIUS * (1 - (1 - p) * (1 - p));
    }

    draw(ctx) {
        if (!this.alive) return;

        const p = this.progress;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - p;
        ctx.strokeStyle = '#CCE6FF';
        ctx.lineWidth = Math.max(1, FINALE_RING_WIDTH * (1 - p));
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}

/**
 * フィナーレの3要素をまとめて作る。
 * particles は配列順に描かれるので、返した順（閃光→集中線→リング）に push すれば
 * リングがいちばん手前に出る。
 */
export function createDestructionFinale(x, y) {
    return [
        new FinaleFlash(x, y),
        new SpeedLines(x, y),
        new ShockwaveRing(x, y),
    ];
}
