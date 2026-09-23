// 4面の水の見た目を PNG に書き出す。滝・水たまりの描画を調整するとき、実機を
// 開かずに前後を見比べるためのもので、ゲーム本体からは呼ばれない。
//
// 使い方:
//   node tools/render-water-scene.mjs --out out.png                 # 今週の4面、水源1のまわり
//   node tools/render-water-scene.mjs --spring 1 --frames 3000 --out a.png
//   node tools/render-water-scene.mjs --seed 3 --x 1200 --y 300 --w 320 --h 480 --out b.png
//   node tools/render-water-scene.mjs --list                        # 水源の位置を出す
//
// 実物の Map を生成し、実物の描画（createWaterRenderer）を game.env.renderer に配線して
// 回す（配線しないと invalidate が呼ばれず、水の canvas が古いまま）。水の canvas は
// 本物と同じく1枚の大きな絵に部分的に塗り重ねるので、画素を持たせて再現する。
// 地形はタイルを1色で塗るだけ（面取りは再現しない）。
// 描けるのは fillRect / clearRect / drawImage / 折れ線の stroke だけ。
// ゲームの描画順（背景 → 水の背後 → 地形 → 前景の水）に合わせる。

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { TILE_SIZE } from '../src/js/utils/Constants.js';
import { getCurrentWeek, stageSeed } from '../src/js/utils/WeekSeed.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
    return acc;
}, []));

// ---- 画素を持つ canvas ----------------------------------------------------
function parseColor(s) {
    if (typeof s !== 'string') return [0, 0, 0, 0];
    let m = s.match(/rgba?\(([^)]+)\)/);
    if (m) {
        const p = m[1].split(',').map((v) => parseFloat(v));
        return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    }
    m = s.match(/^#([0-9a-f]{6})$/i);
    if (m) {
        const n = parseInt(m[1], 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
    }
    return [255, 0, 255, 1];
}

class PixelCanvas {
    constructor(w, h) { this.resize(w, h); }
    resize(w, h) { this._w = w; this._h = h; this.px = new Float32Array(Math.max(0, w * h * 4)); }
    set width(v) { this.resize(v, this._h || 0); }
    get width() { return this._w; }
    set height(v) { this.resize(this._w || 0, v); }
    get height() { return this._h; }
    getContext() { return this.ctx || (this.ctx = new PixelCtx(this)); }
}

class PixelCtx {
    constructor(cv) {
        this.cv = cv; this.fillStyle = '#000'; this.strokeStyle = '#000'; this.lineWidth = 1;
        this.globalAlpha = 1; this.tx = 0; this.ty = 0; this.stack = []; this.path = [];
    }
    save() { this.stack.push([this.tx, this.ty, this.globalAlpha, this.fillStyle, this.strokeStyle]); }
    restore() { [this.tx, this.ty, this.globalAlpha, this.fillStyle, this.strokeStyle] = this.stack.pop(); }
    translate(x, y) { this.tx += x; this.ty += y; }
    blend(x, y, [r, g, b, a]) {
        const { cv } = this;
        if (x < 0 || y < 0 || x >= cv._w || y >= cv._h) return;
        const i = (y * cv._w + x) * 4;
        const p = cv.px;
        const sa = a * this.globalAlpha;
        const da = p[i + 3];
        const oa = sa + da * (1 - sa);
        if (oa <= 0) return;
        p[i] = (r * sa + p[i] * da * (1 - sa)) / oa;
        p[i + 1] = (g * sa + p[i + 1] * da * (1 - sa)) / oa;
        p[i + 2] = (b * sa + p[i + 2] * da * (1 - sa)) / oa;
        p[i + 3] = oa;
    }
    // 部分画素は面積で薄める（滝の筋は 1.5px 幅など小数を使う）
    fillRect(x, y, w, h) {
        const col = parseColor(this.fillStyle);
        x += this.tx; y += this.ty;
        const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.ceil(x + w), y1 = Math.ceil(y + h);
        for (let py = y0; py < y1; py++) {
            const cy = Math.min(py + 1, y + h) - Math.max(py, y);
            if (cy <= 0) continue;
            for (let px = x0; px < x1; px++) {
                const cx = Math.min(px + 1, x + w) - Math.max(px, x);
                if (cx <= 0) continue;
                this.blend(px, py, [col[0], col[1], col[2], col[3] * cx * cy]);
            }
        }
    }
    clearRect(x, y, w, h) {
        const { cv } = this;
        x += this.tx; y += this.ty;
        for (let py = Math.max(0, Math.floor(y)); py < Math.min(cv._h, Math.ceil(y + h)); py++) {
            for (let px = Math.max(0, Math.floor(x)); px < Math.min(cv._w, Math.ceil(x + w)); px++) {
                cv.px.fill(0, (py * cv._w + px) * 4, (py * cv._w + px) * 4 + 4);
            }
        }
    }
    drawImage(src, sx, sy, sw, sh, dx, dy) {
        const s = src.px;
        for (let y = 0; y < sh; y++) {
            for (let x = 0; x < sw; x++) {
                const X = sx + x, Y = sy + y;
                if (X < 0 || Y < 0 || X >= src._w || Y >= src._h) continue;
                const i = (Y * src._w + X) * 4;
                if (s[i + 3] <= 0) continue;
                this.blend(Math.floor(dx + x + this.tx), Math.floor(dy + y + this.ty), [s[i], s[i + 1], s[i + 2], s[i + 3]]);
            }
        }
    }
    beginPath() { this.path = []; }
    moveTo(x, y) { this.path.push([[x + this.tx, y + this.ty]]); }
    lineTo(x, y) { this.path[this.path.length - 1].push([x + this.tx, y + this.ty]); }
    closePath() {}
    stroke() {
        const col = parseColor(this.strokeStyle);
        for (const poly of this.path) {
            for (let i = 1; i < poly.length; i++) {
                const [ax, ay] = poly[i - 1], [bx, by] = poly[i];
                const n = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))) || 1;
                for (let k = 0; k <= n; k++) {
                    this.blend(Math.floor(ax + (bx - ax) * k / n), Math.floor(ay + (by - ay) * k / n), col);
                }
            }
        }
    }
    fill() {}
    arc() {}
    setLineDash() {}
    createRadialGradient() { return { addColorStop() {} }; }
    createLinearGradient() { return { addColorStop() {} }; }
}

// 地形キャッシュ・ミニマップの canvas は描かないので、何もしない ctx を渡す
const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
let wantPixels = false;
globalThis.document = {
    createElement: () => {
        if (wantPixels) return new PixelCanvas(0, 0);
        return { width: 0, height: 0, getContext: () => noopCtx };
    },
};

const { Map: GameMap } = await import('../src/js/world/Map.js');
const { createWaterRenderer } = await import('../src/js/world/environment/water.js');

// ---- 実行 -----------------------------------------------------------------
const MISSION = 3;
const seed = args.seed ? Number(args.seed) : stageSeed(getCurrentWeek().seed, MISSION);
const game = { rng: new SeededRNG(seed) };
const map = new GameMap(game, MISSION);
game.map = map;
game.camera = { x: 0, y: 0 };
game.canvas = { width: 1366, height: 768 };

if (args.list) {
    console.log(`seed ${seed}  map ${map.cols}x${map.rows} tiles`);
    map.waterSprings.forEach((s, i) => console.log(`spring ${i}: r${s.r} c${s.c}  px(${s.c * TILE_SIZE}, ${s.r * TILE_SIZE})`));
    process.exit(0);
}

const env = { game };
wantPixels = true;
const renderer = createWaterRenderer(env);
wantPixels = false;
env.renderer = renderer;
game.env = env;

const frames = Number(args.frames || 1500);
for (let f = 0; f < frames; f++) { map.update(); renderer.update(); }

const sp = map.waterSprings[Number(args.spring || 0)];
const W = Number(args.w || 320), H = Number(args.h || 480);
const X = args.x !== undefined ? Number(args.x) : Math.max(0, sp.c * TILE_SIZE - W / 2);
const Y = args.y !== undefined ? Number(args.y) : Math.max(0, sp.r * TILE_SIZE - 32);

const screen = new PixelCanvas(W, H);
const ctx = screen.getContext();
ctx.fillStyle = '#0d1a1a';
ctx.fillRect(0, 0, W, H);
ctx.translate(-X, -Y);
renderer.drawBehindTerrain(ctx, X, Y);
ctx.fillStyle = '#4f9a6c';
for (let r = Math.floor(Y / TILE_SIZE); r <= Math.floor((Y + H) / TILE_SIZE); r++) {
    for (let c = Math.floor(X / TILE_SIZE); c <= Math.floor((X + W) / TILE_SIZE); c++) {
        if (map.isSolid(r, c)) ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
}
renderer.drawOverWorld(ctx, X, Y);

// ---- PNG（拡大して書く） ---------------------------------------------------
const scale = Number(args.scale || 3);
const OW = W * scale, OH = H * scale;
const raw = Buffer.alloc((OW * 3 + 1) * OH);
for (let y = 0; y < OH; y++) {
    raw[y * (OW * 3 + 1)] = 0;
    for (let x = 0; x < OW; x++) {
        const i = (Math.floor(y / scale) * W + Math.floor(x / scale)) * 4;
        const o = y * (OW * 3 + 1) + 1 + x * 3;
        raw[o] = screen.px[i]; raw[o + 1] = screen.px[i + 1]; raw[o + 2] = screen.px[i + 2];
    }
}
const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(OW, 0); ihdr.writeUInt32BE(OH, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync(args.out || 'water-scene.png', Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
]));
console.log(`seed ${seed} frames ${frames} region (${X},${Y}) ${W}x${H} -> ${args.out || 'water-scene.png'}`);
