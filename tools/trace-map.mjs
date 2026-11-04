// Map の「状態の指紋」をシード × 面ごとに記録する。world/Map.js を層に分ける
// リファクタリング（docs/superpowers/specs/2026-11-04-map-split-design.md）で
// 「挙動を1ビットも変えていない」ことを示すためのもので、ゲーム本体からは呼ばれない。
//
// 使い方:
//   node tools/trace-map.mjs > before.json    # 変更前
//   node tools/trace-map.mjs > after.json     # 変更後
//   node tools/trace-map.mjs --compare before.json after.json
//
// 記録するのは次の指紋（SHA-1）。どれも「どの層が壊れたか」が読めるよう別々に取る:
//   state   … 生成直後の Map の自前のフィールド全部（grid / blockHP / water / 湧き位置 /
//             rooms / stairs / 要塞・施設・町の設計図 / tileShapes …）。フィールド名を
//             列挙せず総なめにするのは、移動の途中で「書くのを忘れたフィールド」を拾うため
//   rng     … 生成後の game.rng.state。乱数の消費回数が1回でも変わればここに出る
//   canvas  … document.createElement で作られた canvas ごとの描画の呼び出し列
//             （地形キャッシュ＝_renderAllToCache、ミニマップ、遠景）
//   query   … 形・当たり・水の問い合わせを格子状の点で総当たりした結果
//   draw    … draw(ctx) を3か所のカメラで呼んだ呼び出し列
//   after   … 爆破（destroyArea / damageBlock）と update() を 300 フレーム進めた後の
//             state・canvas・query。書く側（破壊・水の通知）の層を確かめる

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { TILE_SIZE } from '../src/js/utils/Constants.js';

if (process.argv[2] === '--compare') {
    const a = JSON.parse(readFileSync(process.argv[3], 'utf8'));
    const b = JSON.parse(readFileSync(process.argv[4], 'utf8'));
    let diffs = 0;
    // b にだけある組も差として数える（a のキーだけ回すと、増えた組を見落とす）
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (!a[key] || !b[key]) { diffs++; console.log(`${key}: ${a[key] ? 'after に無い' : 'before に無い'}`); continue; }
        for (const field of Object.keys(a[key])) {
            const x = JSON.stringify(a[key][field]);
            const y = JSON.stringify(b[key] && b[key][field]);
            if (x === y) continue;
            diffs++;
            if (diffs > 20) continue;
            // state はフィールドごとの表なので、変わったフィールド名だけを出す（全部出すと読めない）
            const xa = a[key][field], ya = b[key] && b[key][field];
            if (xa && ya && typeof xa === 'object' && !Array.isArray(xa)) {
                const keys = [...new Set([...Object.keys(xa), ...Object.keys(ya)])].filter((k) => xa[k] !== ya[k]);
                console.log(`${key} ${field}: ${keys.join(' ')}`);
            } else if (Array.isArray(xa) && Array.isArray(ya)) {
                const idx = xa.map((v, i) => (v === ya[i] ? -1 : i)).filter((i) => i >= 0);
                console.log(`${key} ${field}: [${idx.slice(0, 8).join(',')}${idx.length > 8 ? ',…' : ''}] of ${xa.length}→${ya.length}`);
            } else {
                console.log(`${key} ${field}: ${x} → ${y}`);
            }
        }
    }
    console.log(diffs === 0 ? 'IDENTICAL' : `${diffs} field(s) differ`);
    process.exit(diffs === 0 ? 0 : 1);
}

/** 呼び出しを逐次ハッシュに流し込む疑似 ctx（trace-water.mjs と同じ作り）。全部を配列に溜めるとメモリが持たない */
function hashingCtx() {
    const h = createHash('sha1');
    let n = 0;
    // 読み取りで分岐するプロパティは実物（Chrome）の値を持たせる。持たせないと、どのプロパティも
    // 関数として返り、mapMiniMap の `typeof ctx.filter === 'string'` が偽になって、Chrome が通らない
    // 側の分岐だけを確かめることになる（最終レビューの指摘）
    const own = {
        filter: 'none',
        imageSmoothingQuality: 'low',
        __digest: () => `${n}:${h.copy().digest('hex').slice(0, 16)}`,
    };
    return new Proxy(own, {
        get(target, prop) {
            if (prop in target) return target[prop];
            return (...args) => {
                n++;
                h.update(`${String(prop)}(${args.map((v) => (v && typeof v === 'object' ? (v.__name || '#') : v)).join(',')});`);
                // グラデーション・パターンの戻り値。fillStyle に代入されたとき名前で区別できるようにする
                return { __name: `${String(prop)}#${n}`, addColorStop(o, c) { h.update(`stop(${o},${c});`); } };
            };
        },
        set(target, prop, value) {
            n++;
            h.update(`${String(prop)}=${value && typeof value === 'object' ? value.__name : value};`);
            return true;
        },
    });
}

const canvases = [];
globalThis.document = {
    createElement: () => {
        const ctx = hashingCtx();
        const cv = { width: 0, height: 0, getContext: () => ctx, __canvas: true };
        canvases.push(cv);
        return cv;
    },
};

const { Map: GameMap } = await import('../src/js/world/Map.js');

// --coverage: 一度も呼ばれなかった Map のメソッドを stderr に出す。指紋は「呼んだ経路」しか
// 確かめないので、層を移したメソッドの import 漏れ（ReferenceError）を拾えるのは呼ばれたものだけ。
// 呼ばれないものが残っていないかを、移動の前に一度見ておくためのもの
const coverage = process.argv.includes('--coverage') ? new globalThis.Map() : null;
if (coverage) {
    for (const name of Object.getOwnPropertyNames(GameMap.prototype)) {
        const fn = GameMap.prototype[name];
        if (name === 'constructor' || typeof fn !== 'function') continue;
        coverage.set(name, 0);
        GameMap.prototype[name] = function (...args) {
            coverage.set(name, coverage.get(name) + 1);
            return fn.apply(this, args);
        };
    }
}

const SEEDS = [1, 7, 42];
const MISSIONS = [0, 1, 2, 3, 4, 5, 6];
const UPDATE_FRAMES = 300;

/**
 * 任意の値を決定的にハッシュへ流す。game への参照と canvas は辿らない（game は
 * 記録側の偽物、canvas は canvas 指紋で別に取る）。同じオブジェクトへの2度目は
 * 参照の印だけ残す（町の設計図などが相互に参照しているため）
 */
function digestValue(root, skip) {
    const h = createHash('sha1');
    const seen = new WeakMap();
    let id = 0;
    const walk = (v) => {
        if (v === null || v === undefined || typeof v !== 'object') {
            h.update(typeof v === 'function' ? 'fn;' : `${typeof v}:${String(v)};`);
            return;
        }
        if (skip.has(v) || v.__canvas) { h.update('skip;'); return; }
        if (seen.has(v)) { h.update(`ref${seen.get(v)};`); return; }
        seen.set(v, id++);
        if (ArrayBuffer.isView(v)) {
            h.update(`${v.constructor.name}[${v.length}]`);
            h.update(Buffer.from(v.buffer, v.byteOffset, v.byteLength));
            return;
        }
        if (v instanceof Set) { h.update('Set{'); for (const x of v) walk(x); h.update('}'); return; }
        if (v instanceof globalThis.Map) {
            h.update('Map{');
            for (const [k, x] of v) { walk(k); walk(x); }
            h.update('}');
            return;
        }
        if (Array.isArray(v)) { h.update(`[${v.length}`); for (const x of v) walk(x); h.update(']'); return; }
        h.update(`${v.constructor ? v.constructor.name : 'Object'}{`);
        for (const k of Object.keys(v).sort()) { h.update(`${k}:`); walk(v[k]); }
        h.update('}');
    };
    walk(root);
    return h.digest('hex').slice(0, 16);
}

/** フィールドごとの指紋。総なめの1本だけだと、どのフィールドが変わったか読めない */
function stateFingerprint(map, game) {
    const out = {};
    for (const k of Object.keys(map).sort()) {
        if (k === 'game') continue;
        out[k] = digestValue(map[k], new Set([game]));
    }
    return out;
}

function queryFingerprint(map) {
    const h = createHash('sha1');
    const S = TILE_SIZE;
    const step = 7; // タイルの中の位置もずらしながら当てる（16 と互いに素）
    for (let y = 1; y < map.height; y += step * 3) {
        const row = [];
        for (let x = 1; x < map.width; x += step * 3) {
            const r = Math.floor(y / S), c = Math.floor(x / S);
            row.push(
                map.isSolid(r, c) ? 1 : 0,
                map.isSolidAtPixel(x, y) ? 1 : 0,
                map.isSolidPoint(x, y) ? 1 : 0,
                map.tileShapeAt(r, c),
                map.rectHitsTerrain(x, y, 20, 14) ? 1 : 0,
                map.terrainTopY(x, y, y + 48),
                map.terrainBottomY(x, y, y - 48),
                map.floorSlopeAt(x, y),
                map.ceilingSlopeAt(x, y),
                map.hasShapedTileIn(x, y, 24, 24) ? 1 : 0,
                JSON.stringify(map.floorUnder(x, 20, y)),
                JSON.stringify(map.ceilingOver(x, 20, y)),
                JSON.stringify(map.popOutOfRock(x, y)),
                JSON.stringify(map.slopeHitAlong(x, y, x + 30, y + 20)),
                map.isWater(r, c) ? 1 : 0,
                map.isWaterSurface(r, c) ? 1 : 0,
                map.isWaterfallCell(r, c) ? 1 : 0,
                map.getSurfaceY(r, c),
                map.isWaterAtPixel(x, y) ? 1 : 0,
                map.isWaterfallAtPixel(x, y) ? 1 : 0,
                map.isWaterFoam(r, c) ? 1 : 0,
                map.getWaterPaintTopY(r, c),
                JSON.stringify(map.pixelToTile(x, y)),
            );
        }
        h.update(row.join(','));
    }
    h.update(JSON.stringify(map.waterfallLandingCols()));
    h.update(JSON.stringify(map.getWaterFoamCells ? [...(map.getWaterFoamCells() || [])] : null));
    return h.digest('hex').slice(0, 16);
}

function canvasFingerprint() {
    return canvases.map((cv) => `${cv.width}x${cv.height}:${cv.getContext().__digest()}`);
}

function drawFingerprint(map, game) {
    const out = [];
    for (const [fx, fy] of [[0, 0], [0.4, 0.5], [0.8, 0.7]]) {
        game.camera.x = Math.floor(map.width * fx);
        game.camera.y = Math.floor(map.height * fy);
        const ctx = hashingCtx();
        map.draw(ctx);
        out.push(ctx.__digest());
    }
    return out;
}

/** 書く側を動かす。爆破位置は派生 RNG で決める（game.rng は生成の指紋に使うので触らない） */
function disturb(map) {
    const rng = new SeededRNG(0xC0FFEE);
    for (let i = 0; i < 6; i++) {
        const r = 3 + Math.floor(rng.next() * (map.rows - 6));
        const c = 3 + Math.floor(rng.next() * (map.cols - 6));
        map.destroyArea(r, c, 2);
        map.damageBlock(r + 3, c, 1);
    }
    for (let f = 0; f < UPDATE_FRAMES; f++) {
        map.update();
        if (f % 50 === 0) map.takeWaterRepaintCells();
    }
    map.refreshMiniMap();
}

const result = {};
for (const seed of SEEDS) {
    for (const mission of MISSIONS) {
        canvases.length = 0;
        const game = {
            rng: new SeededRNG(seed),
            camera: { x: 0, y: 0 },
            canvas: { width: 960, height: 540 },
            env: null,
        };
        const map = new GameMap(game, mission);
        const entry = {
            rng: game.rng.state,
            state: stateFingerprint(map, game),
            canvas: canvasFingerprint(),
            query: queryFingerprint(map),
            draw: drawFingerprint(map, game),
        };
        disturb(map);
        entry.afterState = stateFingerprint(map, game);
        entry.afterCanvas = canvasFingerprint();
        entry.afterQuery = queryFingerprint(map);
        result[`seed${seed}/m${mission}`] = entry;
    }
}
if (coverage) {
    const unused = [...coverage].filter(([, n]) => n === 0).map(([k]) => k);
    console.error(`methods: ${coverage.size}, never called: ${unused.length ? unused.join(' ') : '(none)'}`);
}
console.log(JSON.stringify(result, null, 1));
