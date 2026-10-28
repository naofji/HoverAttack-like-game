// 画素を持つ最小の canvas と PNG 書き出し。tools/render-town-scene.mjs が使う。
// tools/render-water-scene.mjs の同じ部分から、町に要る fillRect / clearRect /
// drawImage だけを抜き出した（水の道具は折れ線も描くので、あちらはそのまま）。

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

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
    return [255, 0, 255, 1];   // 読めない色はマゼンタにして目立たせる
}

export class PixelCanvas {
    constructor(w = 0, h = 0) { this._w = w; this._h = h; this._alloc(); }
    _alloc() { this.px = new Float32Array(Math.max(0, this._w * this._h * 4)); }
    set width(v) { this._w = v; this._alloc(); }
    get width() { return this._w; }
    set height(v) { this._h = v; this._alloc(); }
    get height() { return this._h; }
    getContext() { return this.ctx || (this.ctx = new PixelCtx(this)); }
}

class PixelCtx {
    constructor(cv) {
        this.cv = cv; this.fillStyle = '#000'; this.globalAlpha = 1;
        this.tx = 0; this.ty = 0; this.rot = 0; this.stack = [];
    }
    save() { this.stack.push([this.tx, this.ty, this.rot, this.globalAlpha, this.fillStyle]); }
    restore() { [this.tx, this.ty, this.rot, this.globalAlpha, this.fillStyle] = this.stack.pop(); }
    translate(x, y) { this.tx += x; this.ty += y; }
    // 落ちる破片と倒れる木（ToppleTree）が使う。translate のあとの rotate を、2 引数の drawImage だけが見る
    // （最近傍の逆写像。fillRect などは回さない）。ふつうの落ちる破片は見た目だけの回転なので、
    // 書き出しの絵では回さない道具もあった（その場合は rot が 0 のまま貼られる）
    rotate(a) { this.rot += a; }
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
    fillRect(x, y, w, h) {
        const col = parseColor(this.fillStyle);
        const x0 = Math.floor(x + this.tx), y0 = Math.floor(y + this.ty);
        for (let py = y0; py < y0 + Math.ceil(h); py++) {
            for (let px = x0; px < x0 + Math.ceil(w); px++) this.blend(px, py, col);
        }
    }
    // 7面の要塞の金属パネル（Map._drawPolishedBlock）が使う。線幅1で .5 ずれた座標＝画素にぴったり載る線だけを想定し、
    // 4辺をそれぞれ1画素の fillRect として塗る（本物の canvas では線は座標の両側に半分ずつ掛かる）
    strokeRect(x, y, w, h) {
        const f = this.fillStyle;
        this.fillStyle = this.strokeStyle;
        const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.floor(x + w), y1 = Math.floor(y + h);
        this.fillRect(x0, y0, x1 - x0 + 1, 1);
        this.fillRect(x0, y1, x1 - x0 + 1, 1);
        this.fillRect(x0, y0 + 1, 1, y1 - y0 - 1);
        this.fillRect(x1, y0 + 1, 1, y1 - y0 - 1);
        this.fillStyle = f;
    }
    // 多角形（4面の植物）。本物の canvas と同じく nonzero の規則で、縁はなめらか（4x4 の副標本で半透明にする）
    beginPath() { this.path = []; }
    moveTo(x, y) { this.path.push([[x, y]]); }
    lineTo(x, y) { this.path[this.path.length - 1].push([x, y]); }
    closePath() {}
    fill() {
        const col = parseColor(this.fillStyle);
        const rings = this.path;
        const winding = (px, py) => {
            let w = 0;
            for (const r of rings) {
                for (let i = 0; i < r.length; i++) {
                    const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length];
                    if ((y0 <= py) === (y1 <= py)) continue;
                    const cross = (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0);
                    if (y0 <= py ? cross > 0 : cross < 0) w += y1 > y0 ? 1 : -1;
                }
            }
            return w;
        };
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const r of rings) for (const [x, y] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        const N = 4;
        for (let py = Math.floor(y0 + this.ty); py <= Math.floor(y1 + this.ty); py++) {
            for (let px = Math.floor(x0 + this.tx); px <= Math.floor(x1 + this.tx); px++) {
                let hit = 0;
                for (let sy = 0; sy < N; sy++) {
                    for (let sx = 0; sx < N; sx++) {
                        if (winding(px - this.tx + (sx + 0.5) / N, py - this.ty + (sy + 0.5) / N) !== 0) hit++;
                    }
                }
                if (hit > 0) this.blend(px, py, [col[0], col[1], col[2], col[3] * hit / (N * N)]);
            }
        }
    }
    clearRect(x, y, w, h) {
        const { cv } = this;
        const x0 = Math.floor(x + this.tx), y0 = Math.floor(y + this.ty);
        for (let py = Math.max(0, y0); py < Math.min(cv._h, y0 + Math.ceil(h)); py++) {
            for (let px = Math.max(0, x0); px < Math.min(cv._w, x0 + Math.ceil(w)); px++) {
                cv.px.fill(0, (py * cv._w + px) * 4, (py * cv._w + px) * 4 + 4);
            }
        }
    }
    drawImage(src, ...a) {
        // 本物の canvas と同じ (img, dx, dy) と (img, sx, sy, sw, sh, dx, dy, dw, dh) を受ける。
        // 町は拡大縮小して貼らないので、dw/dh が sw/sh と違えば例外にする（黙って違う絵を作らない）
        if (a.length !== 2 && a.length !== 8) throw new Error(`drawImage: 引数 ${a.length + 1} 個は未対応`);
        if (a.length === 8 && (a[6] !== a[2] || a[7] !== a[3])) throw new Error('drawImage: 拡大縮小は未対応');
        const [sx, sy, sw, sh, dx, dy] = a.length === 2 ? [0, 0, src._w, src._h, a[0], a[1]] : a;
        const s = src.px;
        if (this.rot !== 0 && a.length === 2) {
            // 回した先の外接矩形を走り、画素の中心を逆に回して元の画素を引く
            const c = Math.cos(this.rot), n = Math.sin(this.rot);
            const r = Math.ceil(Math.hypot(sw, sh) + Math.hypot(dx, dy));
            for (let Y = Math.floor(this.ty) - r; Y <= Math.ceil(this.ty) + r; Y++) {
                for (let X = Math.floor(this.tx) - r; X <= Math.ceil(this.tx) + r; X++) {
                    const u = X + 0.5 - this.tx, v = Y + 0.5 - this.ty;
                    const lx = Math.floor(u * c + v * n - dx), ly = Math.floor(-u * n + v * c - dy);
                    if (lx < 0 || ly < 0 || lx >= sw || ly >= sh) continue;
                    const i = ((sy + ly) * src._w + (sx + lx)) * 4;
                    if (s[i + 3] <= 0) continue;
                    this.blend(X, Y, [s[i], s[i + 1], s[i + 2], s[i + 3]]);
                }
            }
            return;
        }
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

/** canvas を scale 倍（最近傍）にして PNG で書く */
export function writePng(path, cv, scale = 1) {
    const W = cv._w, H = cv._h, OW = W * scale, OH = H * scale;
    const raw = Buffer.alloc((OW * 3 + 1) * OH);
    for (let y = 0; y < OH; y++) {
        raw[y * (OW * 3 + 1)] = 0;
        for (let x = 0; x < OW; x++) {
            const i = (Math.floor(y / scale) * W + Math.floor(x / scale)) * 4;
            const o = y * (OW * 3 + 1) + 1 + x * 3;
            raw[o] = cv.px[i]; raw[o + 1] = cv.px[i + 1]; raw[o + 2] = cv.px[i + 2];
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(OW, 0); ihdr.writeUInt32BE(OH, 4); ihdr[8] = 8; ihdr[9] = 2;
    writeFileSync(path, Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
    ]));
}
