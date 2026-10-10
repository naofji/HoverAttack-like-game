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
        this.tx = 0; this.ty = 0; this.stack = [];
    }
    save() { this.stack.push([this.tx, this.ty, this.globalAlpha, this.fillStyle]); }
    restore() { [this.tx, this.ty, this.globalAlpha, this.fillStyle] = this.stack.pop(); }
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
    fillRect(x, y, w, h) {
        const col = parseColor(this.fillStyle);
        const x0 = Math.floor(x + this.tx), y0 = Math.floor(y + this.ty);
        for (let py = y0; py < y0 + Math.ceil(h); py++) {
            for (let px = x0; px < x0 + Math.ceil(w); px++) this.blend(px, py, col);
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
        // 3引数 (dx, dy) と 7引数 (sx, sy, sw, sh, dx, dy) を受ける
        const [sx, sy, sw, sh, dx, dy] = a.length === 2 ? [0, 0, src._w, src._h, a[0], a[1]] : a;
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
