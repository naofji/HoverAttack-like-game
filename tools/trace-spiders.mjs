// tools/trace-spiders.mjs
// 本物のマップ（5シード × 6面・7面）でスパイダーを湧き位置に全部置き、台本で動く自機に向けて
// 2400 フレーム走らせた指紋を出す。EnemySpider.js を層に分けるときに「挙動が変わっていない」ことを
// 示すための道具（trace-walkers.mjs のスパイダー版）。
//
//   node tools/trace-spiders.mjs > before.json
//   （変更）
//   node tools/trace-spiders.mjs > after.json
//   node tools/trace-spiders.mjs --compare before.json after.json
//   node tools/trace-spiders.mjs --coverage     # 台本が通らなかった EnemySpider のメソッド
//
// 流し込むもの: 毎フレーム、スパイダーごとの自分の値の全部（数・文字・真偽、入れ子は浅く）と、
// 撃った弾（EnemyBurstShell）と割れた破片の位置・速さ。30 フレームごとに draw の canvas 呼び出し。
// 1200 フレーム目に半分のスパイダーへダメージを与える（被弾・破壊の経路）。
// 自機は本物の Player ではなく、湧き位置のあいだを決まった順に巡る箱（スパイダーの動きだけを見たい。
// 自機の物理が混ざると、そちらの変更でも指紋が動く）。Math.random は種つきの LCG に差し替える。
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

if (process.argv[2] === '--compare') {
    const a = JSON.parse(readFileSync(process.argv[3], 'utf8'));
    const b = JSON.parse(readFileSync(process.argv[4], 'utf8'));
    let diffs = 0;
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (JSON.stringify(a[key]) === JSON.stringify(b[key])) continue;
        diffs++;
        const at = (a[key]?.checkpoints || []).findIndex((h, i) => h !== b[key]?.checkpoints?.[i]);
        console.log(`${key}: 差が出始めたのは ${at < 0 ? '最後の区間' : `${at * 200}〜${at * 200 + 199} フレーム目`}`);
    }
    console.log(diffs === 0 ? 'IDENTICAL' : `${diffs} run(s) differ`);
    process.exit(diffs === 0 ? 0 : 1);
}

const nullCtx = new Proxy({ filter: 'none', imageSmoothingQuality: 'low' }, {
    get: (t, p) => (p in t ? t[p] : () => ({ addColorStop() {} })),
    set: () => true,
});
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => nullCtx }) };
let lcg = 1;
Math.random = () => {
    lcg = (lcg * 1664525 + 1013904223) >>> 0;
    return lcg / 4294967296;
};

const { Map: GameMap } = await import('../src/js/world/Map.js');
const { EnemySpider } = await import('../src/js/entities/EnemySpider.js');
const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
const { SeededRNG } = await import('../src/js/utils/SeededRNG.js');
const { makeFakeCtx } = await import('../tests/helpers/fake-ctx.js');

const SEEDS = [1, 7, 42, 99, 2026];
const MISSIONS = [5, 6];
const FRAMES = 2400;

const num = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(6)) : String(v));
function digest(h, v, depth = 0) {
    if (v === null || v === undefined || typeof v !== 'object') { h.update(typeof v === 'function' ? 'fn' : num(v)); return; }
    if (depth > 2) { h.update('…'); return; }
    if (Array.isArray(v)) { h.update(`[${v.length}`); for (const x of v) digest(h, x, depth + 1); h.update(']'); return; }
    h.update('{');
    for (const k of Object.keys(v)) {
        if (k === 'game' || k === 'map' || k === 'rng') continue;
        h.update(k); digest(h, v[k], depth + 1);
    }
    h.update('}');
}

// --coverage: 台本が EnemySpider のどのメソッドを通ったか
const coverage = process.argv.includes('--coverage');
const calls = {};
if (coverage) {
    for (const k of Object.getOwnPropertyNames(EnemySpider.prototype)) {
        const f = EnemySpider.prototype[k];
        if (k === 'constructor' || typeof f !== 'function') continue;
        EnemySpider.prototype[k] = function (...args) { calls[k] = (calls[k] || 0) + 1; return f.apply(this, args); };
    }
}

function run(seed, mission) {
    lcg = (seed * 2654435761 + mission) >>> 0 || 1;
    const h = createHash('sha1');
    const noop = () => {};
    const game = {
        rng: new SeededRNG(seed), camera: { x: 0, y: 0, shake: noop }, canvas: { width: 960, height: 540 },
        missionsCompleted: mission, enemies: [], projectiles: [], enemyBullets: [], particles: [], pickups: [],
        smokeScreens: [], landmines: [], orbs: [], barriers: [], storageTowers: [], electricFloors: [], items: [],
        player: null, carrier: null, settings: {},
        spawnSparks: (...a) => h.update(`spark${a.map(num).join(',')}`),
        spawnExplosion: (...a) => h.update(`boom${a.slice(0, 3).map(num).join(',')}`),
        addScore: (s) => h.update(`score${s}`),
        spawnDebris: noop, spawnSmokeScreen: noop,
    };
    game.map = new GameMap(game, mission);
    game.env = new StageEnvironment(game, mission);
    const spawns = game.map.spiderSpawns;
    if (!spawns.length) return null;
    const spiders = spawns.map((p) => new EnemySpider(game, p.x, p.y, p.surface));
    game.enemies.push(...spiders);
    // 自機の代わりの箱。湧き位置の上空を 300 フレームごとに次へ移る（その間はゆっくり左右に揺れる）
    const player = { x: 0, y: 0, width: 24, height: 32, vx: 0, vy: 0, alive: true, docked: false, hp: 100,
        takeDamage(d) { h.update(`hit${num(d)}`); } };
    game.player = player;
    const checkpoints = [];
    for (let f = 0; f < FRAMES; f++) {
        const target = spawns[Math.floor(f / 300) % spawns.length];
        player.x = target.x + Math.sin(f / 40) * 90;
        player.y = target.y - 90 + Math.cos(f / 55) * 30;
        game.camera.x = player.x - 480; game.camera.y = player.y - 270;
        if (f === 1200) spiders.forEach((s, i) => { if (i % 2 === 0 && s.alive) s.takeDamage(i % 4 === 0 ? 9999 : 1); });
        for (const s of spiders) if (s.alive) s.update();
        for (const b of game.enemyBullets) if (b.alive !== false && b.update) b.update();
        game.enemyBullets = game.enemyBullets.filter((b) => b.alive !== false);
        h.update(`f${f}`);
        for (const s of spiders) digest(h, s);
        for (const b of game.enemyBullets) h.update(`${b.constructor.name}:${num(b.x)},${num(b.y)},${num(b.vx)},${num(b.vy)};`);
        game.particles.length = 0;
        if (f % 30 === 0) {
            for (const s of spiders) {
                if (!s.alive) continue;
                const ctx = makeFakeCtx();
                s.draw(ctx);
                h.update(JSON.stringify(ctx.calls));
            }
        }
        if (f % 200 === 199) checkpoints.push(h.copy().digest('hex').slice(0, 16));
    }
    return { spiders: spiders.length, alive: spiders.filter((s) => s.alive).length, checkpoints, hash: h.digest('hex') };
}

const out = {};
for (const seed of SEEDS) for (const mission of MISSIONS) out[`seed${seed}/面${mission + 1}`] = run(seed, mission);
if (coverage) {
    const all = Object.getOwnPropertyNames(EnemySpider.prototype).filter((k) => k !== 'constructor').sort();
    console.log(`通らなかった: ${all.filter((k) => !calls[k]).join(' ') || '（なし）'}`);
} else {
    process.stdout.write(JSON.stringify(out, null, 1) + '\n');
}
