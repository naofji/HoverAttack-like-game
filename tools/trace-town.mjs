// tools/trace-town.mjs
// 本物のマップ（5シード × 3〜7面）の壊せる背景（map.town）を、台本どおりに壊して 600 フレーム進め、
// その間の状態・描画・音・粒をハッシュに流し込んだ指紋を出す。Town.js を層に分けるときに
// 「挙動が変わっていない」ことを示すための道具（trace-map.mjs / trace-walkers.mjs の町版）。
//
//   node tools/trace-town.mjs > before.json
//   （変更）
//   node tools/trace-town.mjs > after.json
//   node tools/trace-town.mjs --compare before.json after.json
//
// 何を流し込むか（どれも 1 本のハッシュ。100 フレームごとに途中のハッシュも残し、差の出始めを追える）:
// - 毎フレーム: 建物ごとの数（remaining / collapsed / exploded / 震え / alpha / 焦げ・焼けの数）、落ちる破片・
//   瓦礫・震え・焼けたかけら・火（fires / flames / smoke）・注文（effects）の中身、game.particles の位置
// - 30 フレームごと: 建物のかけらの表（cells）全部、town.draw と visibleRects の呼び出し、問い合わせ
//   （buildingsAt / buildingsInCircle / buildingsUnder）
// - canvas への呼び出し全部（建物の絵を欠かす clearRect も、draw の drawImage も）と、audioManager の呼び出し全部
//
// 台本（seed と面から SeededRNG で決める。Math.random も種つきの LCG に差し替える）:
// - 0 フレーム目: 建物 4 棟の中心に爆風（粒 150 と 36）、爆発物 2 つを欠かせて引き金、建物を撃ち抜く弾 6 発
//   （自機の弾・ミサイル・グレネード・敵の弾。毎フレーム動かして sweepProjectile）、ビーム 1 本
// - 60 フレーム目: 建物 8 棟の支えの岩を map.destroyArea で壊す（onBlockDestroyed → 崩れ・倒れ・落下）
// - 200 フレーム目: もう 4 棟に爆風
// - 自機と敵 2 体を建物に重ねて置く。1体はつらら・荷の真下（重なりで薄くなる・落ちてきた破片や荷やつららが当たる）
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';

if (process.argv[2] === '--compare') {
    const a = JSON.parse(readFileSync(process.argv[3], 'utf8'));
    const b = JSON.parse(readFileSync(process.argv[4], 'utf8'));
    let diffs = 0;
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (JSON.stringify(a[key]) === JSON.stringify(b[key])) continue;
        diffs++;
        const at = (a[key]?.checkpoints || []).findIndex((h, i) => h !== b[key]?.checkpoints?.[i]);
        console.log(`${key}: 差が出始めたのは ${at < 0 ? '最後の区間' : `${at * 100}〜${at * 100 + 99} フレーム目`}`);
    }
    console.log(diffs === 0 ? 'IDENTICAL' : `${diffs} run(s) differ`);
    process.exit(diffs === 0 ? 0 : 1);
}

// ---- 何でも流し込むハッシュ ----
let H = createHash('sha1');
const feed = (s) => H.update(s);
const num = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(6)) : String(v));

// canvas: 作った順に番号をつけ、呼び出しとプロパティの代入を番号つきで流し込む
let canvasSeq = 0;
function recordingCanvas(w = 0, h = 0) {
    const id = canvasSeq++;
    const canvas = { width: w, height: h, __id: id };
    const props = {};
    const ctx = new Proxy({}, {
        get(_, p) {
            if (p === 'canvas') return canvas;
            if (p in props) return props[p];
            if (p === 'measureText') return (t) => ({ width: String(t).length * 6 });
            if (p === 'getImageData') return (x, y, w2, h2) => ({ data: new Uint8ClampedArray(Math.max(0, w2 * h2 * 4)) });
            return (...args) => {
                feed(`c${id}.${String(p)}(${args.map((a) => (a && a.__id !== undefined ? `cv${a.__id}` : typeof a === 'object' ? typeof a : num(a))).join(',')})`);
                return { addColorStop() {} };
            };
        },
        set(_, p, v) {
            props[p] = v;
            feed(`c${id}.${String(p)}=${typeof v === 'object' ? typeof v : num(v)}`);
            return true;
        },
    });
    canvas.getContext = () => ctx;
    return canvas;
}
globalThis.document = { createElement: () => recordingCanvas() };

let lcg = 1;
Math.random = () => {
    lcg = (lcg * 1664525 + 1013904223) >>> 0;
    return lcg / 4294967296;
};
let fakeNow = 1_000_000;
Date.now = () => fakeNow;
globalThis.performance = { now: () => fakeNow };

const { Map: GameMap } = await import('../src/js/world/Map.js');
const { SpawnEffects } = await import('../src/js/systems/SpawnEffects.js');
const { audioManager } = await import('../src/js/audio/AudioManager.js');
const { TILE_SIZE } = await import('../src/js/utils/Constants.js');

// audioManager の呼び出しを全部流し込む（中身は呼ばない。node では available=false で黙るだけなので同じ）
for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(audioManager))) {
    if (k === 'constructor' || typeof audioManager[k] !== 'function') continue;
    audioManager[k] = (...args) => { feed(`a.${k}(${args.map((a) => (typeof a === 'object' ? typeof a : num(a))).join(',')})`); };
}

const SEEDS = [1, 7, 42, 99, 2026];
const MISSIONS = [2, 3, 4, 5, 6];   // 3面 町 / 4面 植物 / 5面 雪の木・つらら / 6面 工場 / 7面 基地
const FRAMES = 600;

/** 自分の列挙できる値を順に流し込む。canvas・ctx・建物への参照（循環）は id だけ */
function digest(v, depth = 0) {
    if (v === null || v === undefined || typeof v !== 'object') { feed(typeof v === 'function' ? 'fn' : num(v)); return; }
    if (ArrayBuffer.isView(v)) { feed(`ta${v.length}:`); feed(Buffer.from(v.buffer, v.byteOffset, v.byteLength)); return; }
    if (v.__id !== undefined) { feed(`cv${v.__id}`); return; }
    if (depth > 0 && v.cells && v.id !== undefined) { feed(`b${v.id}`); return; }
    if (depth > 3) { feed('…'); return; }
    if (v instanceof Set) { feed('S'); for (const x of v) digest(x, depth + 1); return; }
    if (v instanceof Map) { feed('M'); for (const [k, x] of v) { digest(k, depth + 1); digest(x, depth + 1); } return; }
    if (Array.isArray(v)) { feed(`[${v.length}`); for (const x of v) digest(x, depth + 1); feed(']'); return; }
    feed('{');
    for (const k of Object.keys(v)) {
        if (k === 'ctx' || k === 'game' || k === 'town' || k === 'map') continue;
        feed(k); digest(v[k], depth + 1);
    }
    feed('}');
}

function buildingSummary(b) {
    feed(`b${b.id}:${b.remaining},${b.collapsed},${b.exploded},${b.shakeLeft},${b.shaken},${num(b.alpha)},${b.burnt.size}`);
}

function makeBody(x, y, w, h, name) {
    return {
        name, x, y, width: w, height: h, vx: 0, vy: 0, alive: true, docked: false, hp: 1000,
        takeDamage(d) { this.hp -= d; feed(`dmg:${name}:${num(d)}`); },
    };
}

function run(seed, mission) {
    canvasSeq = 0;
    lcg = (seed * 2654435761) >>> 0 || 1;
    fakeNow = 1_000_000;
    H = createHash('sha1');
    const map = new GameMap({ rng: new SeededRNG(seed) }, mission);
    const town = map.town;
    if (!town || town.buildings.length === 0) return null;
    const rng = new SeededRNG((seed * 7919 + mission) >>> 0);
    const pick = (list) => list[Math.floor(rng.next() * list.length)];
    const bs = town.buildings;
    const center = (b) => [b.x + b.width / 2, b.y + b.height / 2];

    const tb = pick(bs);
    const player = makeBody(tb.x + 4, tb.y + 4, 28, 32, 'player');
    // 敵の1体は、つらら（5面）か荷のある建物（6面）があればその真下に置く（落ちてきたものが当たる経路を通すため）
    const dropper = bs.find((b) => b.brittle) || bs.find((b) => b.heavy);
    const enemies = [0, 1].map((i) => {
        const b = i === 1 && dropper ? dropper : pick(bs);
        return makeBody(b.x + 2, b.y + b.height + (b.brittle ? 40 : -30), 24, 24, `e${i}`);
    });
    const game = Object.assign({
        particles: [], projectiles: [], enemies, landmines: [], player, carrier: null,
        camera: { x: tb.x - 400, y: tb.y - 300 }, canvas: { width: 1366, height: 768 }, map,
        smokeScreens: [], enemyBullets: [], debris: [],
    }, SpawnEffects);
    const view = () => ({ x: game.camera.x, y: game.camera.y, w: 1366, h: 768 });

    const blasts = (n) => { for (let i = 0; i < n; i++) { const [x, y] = center(pick(bs)); town.blast(x, y, i % 2 ? 36 : 150); } };

    // 0 フレーム目
    blasts(4);
    // 真下に敵を置いたつらら・荷の建物を撃つ（つららは震えてから落ちる）
    if (dropper) town.chip(dropper, ...center(dropper), 4);
    const xs = bs.filter((b) => b.explosive);
    for (let i = 0; i < 2 && xs.length; i++) { const b = pick(xs); town.chip(b, ...center(b), 4); }
    const shots = [];
    const kinds = ['bullet', 'missile', 'grenade', 'bullet', 'missile', 'bullet'];
    kinds.forEach((townKind, i) => {
        const b = pick(bs);
        const [cx, cy] = center(b);
        const dir = i % 2 ? 1 : -1;
        shots.push({
            townKind, alive: true, exploded: false, isPlayerOwned: i !== 5,
            x: cx - dir * (b.width / 2 + 40), y: cy - 20 + i * 4, vx: dir * 6, vy: townKind === 'grenade' ? 3 : 0.5,
            onTownWall(x, y) { this.alive = false; feed(`wall:${i}:${num(x)},${num(y)}`); },
        });
    });
    const beamB = pick(bs);
    const [bx, by] = center(beamB);
    town.sweepProjectile({
        townKind: 'beam', alive: true, exploded: false, isPlayerOwned: true,
        segments: () => [{ x1: bx - 200, y1: by - 10, x2: bx + 200, y2: by + 10 }],
    });

    const checkpoints = [];
    for (let f = 0; f < FRAMES; f++) {
        fakeNow += 16;
        if (f === 60) {
            // 支えの岩を壊す（8棟）。本物の経路: destroyArea → damageBlock → town.onBlockDestroyed
            for (let i = 0; i < 8; i++) {
                const b = i === 0 && dropper ? dropper : pick(bs);
                if (!b.anchors.length) continue;
                const a = pick(b.anchors);
                map.destroyArea(a.r, a.c, 1, 99);
            }
        }
        if (f === 200) blasts(4);
        for (const p of shots) {
            if (!p.alive) continue;
            p._prevX = p.x; p._prevY = p.y;
            p.x += p.vx; p.y += p.vy;
            town.sweepProjectile(p, new Set([bs[0].id]));
        }
        town.update(game);

        feed(`f${f}`);
        for (const b of bs) buildingSummary(b);
        digest(town.falling); digest(town.rubble); digest(town.shaking); digest(town.hot);
        digest(town.effects);
        digest(town.fire.fires); digest(town.fire.flames); digest(town.fire.smoke);
        feed(`p${game.particles.length}`);
        for (const p of game.particles) feed(`${num(p.x)},${num(p.y)},${p.color}`);
        game.particles.length = 0;
        feed(`hp:${player.hp},${enemies.map((e) => e.hp)},${num(player.vy)}`);

        if (f % 30 === 0) {
            for (const b of bs) digest(b.cells);
            const v = view();
            const ctx = recordingCanvas(1366, 768).getContext('2d');
            town.draw(ctx, v);
            digest(town.visibleRects(v));
            const [qx, qy] = center(tb);
            feed(`at:${town.buildingsAt(qx, qy).map((b) => b.id)}`);
            feed(`circ:${town.buildingsInCircle(qx, qy, 120).map((b) => b.id)}`);
            digest(town.buildingsUnder([player, ...enemies]));
        }
        if (f % 100 === 99) checkpoints.push(H.copy().digest('hex').slice(0, 16));
    }
    return { buildings: bs.length, tiles: TILE_SIZE, checkpoints, hash: H.digest('hex') };
}

// --coverage: 台本が Town のどのメソッドを通ったかを面ごとに数える（指紋の代わりに出す）。
// 層に分けたあとも prototype に並ぶ名前で数える（並ぶ順は層の混ぜ方で変わるので、名前順に並べて出す）
const coverage = process.argv.includes('--coverage');
const calls = {};
let currentKey = '';
if (coverage) {
    const { Town } = await import('../src/js/world/town/Town.js');
    for (const k of Object.getOwnPropertyNames(Town.prototype)) {
        const f = Town.prototype[k];
        if (k === 'constructor' || typeof f !== 'function') continue;
        Town.prototype[k] = function (...args) {
            const c = (calls[currentKey] ||= {});
            c[k] = (c[k] || 0) + 1;
            return f.apply(this, args);
        };
    }
}

const out = {};
for (const seed of SEEDS) for (const mission of MISSIONS) {
    currentKey = `面${mission + 1}`;
    out[`seed${seed}/面${mission + 1}`] = run(seed, mission);
}
if (coverage) {
    const { Town } = await import('../src/js/world/town/Town.js');
    const all = Object.getOwnPropertyNames(Town.prototype).filter((k) => k !== 'constructor').sort();
    for (const [key, c] of Object.entries(calls)) {
        console.log(`${key}: 通らなかった ${all.filter((k) => !c[k]).join(' ') || '（なし）'}`);
    }
    const none = all.filter((k) => !Object.values(calls).some((c) => c[k]));
    console.log(`どの面でも通らなかった: ${none.join(' ') || '（なし）'}`);
} else {
    process.stdout.write(JSON.stringify(out, null, 1) + '\n');
}
