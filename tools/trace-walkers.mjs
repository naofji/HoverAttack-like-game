// tools/trace-walkers.mjs
// 本物のマップ（3シード×7面）の上で自機と敵アタッカーを走らせ、毎フレームの体の状態を
// ハッシュに流し込んだ指紋を出す。当たり判定（段差の乗り上げ・壁への吸着・着地・天井・足元の探り）を
// 共有部品へ寄せるときに「挙動が変わっていない」ことを示すための道具（trace-map.mjs の機体版）。
//
//   node tools/trace-walkers.mjs > before.json
//   （変更）
//   node tools/trace-walkers.mjs > after.json
//   node tools/trace-walkers.mjs --compare before.json after.json
//
// 自機の入力は SeededRNG で決めた台本（20フレームごとに左右・ホバー・しゃがみを引き直す）。
// Math.random も種つきの LCG に差し替える（粒子や煙の散らばりが物理に混ざらないことは
// 保証されていないので、混ざっても前後で同じになるようにしておく）。
// 敵は撃たない（fireInterval を潰す）。弾の当たりはここで測りたいものではなく、弾が地形を
// 壊すとマップが変わって指紋が別の理由で揺れるため。
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
        console.log(`${key}: ${JSON.stringify(a[key])} → ${JSON.stringify(b[key])}`);
    }
    console.log(diffs === 0 ? 'IDENTICAL' : `${diffs} run(s) differ`);
    process.exit(diffs === 0 ? 0 : 1);
}

// マップの描画キャッシュが canvas を作るので、何もしない canvas を返す
const nullCtx = new Proxy({ filter: 'none', imageSmoothingQuality: 'low' }, {
    get: (t, p) => (p in t ? t[p] : () => ({ addColorStop() {} })),
    set: () => true,
});
globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => nullCtx }),
};

let lcg = 1;
Math.random = () => {
    lcg = (lcg * 1664525 + 1013904223) >>> 0;
    return lcg / 4294967296;
};

const { Map: GameMap } = await import('../src/js/world/Map.js');
const { Player } = await import('../src/js/entities/Player.js');
const { EnemyAttacker } = await import('../src/js/entities/EnemyAttacker.js');
const { ENEMY_ATTACKER_TYPES, TILE_SIZE } = await import('../src/js/utils/Constants.js');
const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');

const SEEDS = [1, 7, 42];
const MISSIONS = [0, 1, 2, 3, 4, 5, 6];
const FRAMES = 1500;
const WALKERS_PER_MAP = 6;
const TYPE_KEYS = Object.keys(ENEMY_ATTACKER_TYPES);

function makeInput(rng) {
    const held = new Set();
    let next = 0;
    return {
        step(frame) {
            if (frame < next) return;
            next = frame + 20;
            held.clear();
            const r = rng.next();
            if (r < 0.4) held.add('KeyD'); else if (r < 0.8) held.add('KeyA');
            if (rng.next() < 0.35) held.add('KeyW');
            if (rng.next() < 0.1) held.add('KeyS');
        },
        keys: {}, isKeyDown: (c) => held.has(c), isKeyPressed: () => false, isCharPressed: () => false,
        mouse: { x: 0, y: 0, left: false, right: false },
        isLeftClickPressed: () => false, isRightClickPressed: () => false,
        rightHoldFrames: 0, crosshairLocked: false,
        getMouseWorld: () => ({ x: 0, y: 0 }), getTargetWorld: () => ({ x: 0, y: 0 }),
    };
}

const BODY_FIELDS = ['x', 'y', 'vx', 'vy', 'onGround', 'onTerrain', 'facingRight', 'walkFrame',
    'stunTimer', 'hoverCooldown', 'crouching', 'aiState', 'patrolDir', 'jumpCooldown', 'alive', 'hp'];

function digestBody(h, tag, e) {
    h.update(tag);
    for (const f of BODY_FIELDS) h.update(`${f}=${e[f]};`);
}

function noop() {}

function makeGame(seed, mission) {
    const game = {
        rng: new SeededRNG(seed),
        camera: { x: 0, y: 0, shake: noop },
        canvas: { width: 960, height: 540 },
        env: null,
        missionsCompleted: mission,
        enemies: [], projectiles: [], enemyBullets: [], particles: [], missileKits: [], repairKits: [],
        autoAimUnits: [], smokeScreens: [], landmines: [], orbs: [], barriers: [], storageTowers: [],
        electricFloors: [], items: [],
        player: null, carrier: null,
        spawnSparks: noop, spawnExplosion: noop, addScore: noop, spawnSmokeScreen: noop,
        settings: {},
    };
    game.map = new GameMap(game, mission);
    // 水・雪・霧の面は環境が motion（水中の速さ）や霧の索敵を変えるので、本番と同じく作る
    game.env = new StageEnvironment(game, mission);
    return game;
}

const result = {};
for (const seed of SEEDS) {
    for (const mission of MISSIONS) {
        lcg = seed * 7919 + mission;
        const key = `seed${seed}/m${mission}`;
        const h = createHash('sha1');
        let error = null;
        let frame = 0;
        try {
            const game = makeGame(seed, mission);
            const spawns = game.map.enemyAttackerSpawns.slice(0, WALKERS_PER_MAP);
            const input = makeInput(new SeededRNG(seed * 31 + mission));
            game.input = input;
            // 自機は最初の湧き位置の少し上から落とす（着地・段差・天井を通す）
            const p0 = spawns[0] || { x: 10 * TILE_SIZE, y: 10 * TILE_SIZE };
            game.player = new Player(game, p0.x, p0.y - TILE_SIZE);
            spawns.forEach((pos, i) => {
                const cfg = { ...ENEMY_ATTACKER_TYPES[TYPE_KEYS[i % TYPE_KEYS.length]], fireInterval: 1e9 };
                game.enemies.push(new EnemyAttacker(game, pos.x, pos.y, cfg));
            });
            for (frame = 0; frame < FRAMES; frame++) {
                input.step(frame);
                game.player.update();
                for (const e of game.enemies) if (e.alive) e.update();
                game.particles.length = 0;
                game.enemyBullets.length = 0;
                game.projectiles.length = 0;
                digestBody(h, 'P', game.player);
                game.enemies.forEach((e, i) => digestBody(h, `E${i}`, e));
            }
        } catch (err) {
            error = `${err && err.message} @frame ${frame}`;
        }
        result[key] = { trace: h.digest('hex').slice(0, 20), frames: frame, error };
    }
}
console.log(JSON.stringify(result, null, 1));
