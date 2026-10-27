// tools/record-terrain-baseline.mjs
// 四角い地形（5面以外と同じ）での自機・敵アタッカー・戦車の、全フレームの軌跡を出力する。
// タイル形状つき当たり判定の段2（docs/superpowers/plans/2026-10-27-tile-shape-2-bodies.md）を
// 入れる前に一度走らせ、各列の SHA-256 を tests/terrain-shape-invariance.test.js の BASELINE に貼る。
// 「実装から期待値を導かない」ための道具なので、段2の変更を入れた後は走らせない。
//
// tools/record-motion-baseline.mjs（環境の係数のとき）はチェックポイントだけを見ていたが、
// 段2は着地・乗り上げ・天井の1フレームの扱いを触るので、全フレームを比べる。
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Player } from '../src/js/entities/Player.js';
import { EnemyTank } from '../src/js/entities/EnemyTank.js';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { makeMap, makeGame, makeAttacker } from '../tests/helpers/enemy-world.js';
import { Grenade } from '../src/js/entities/Grenade.js';
import { PlayerBullet } from '../src/js/entities/PlayerBullet.js';
import { EnemyBullet } from '../src/js/entities/EnemyBullet.js';
import { Missile } from '../src/js/entities/Missile.js';
import { EnemyHomingMissile } from '../src/js/entities/EnemyHomingMissile.js';
import { EnemyCruiseMissile } from '../src/js/entities/EnemyCruiseMissile.js';
import { EnemyDrone } from '../src/js/entities/EnemyDrone.js';
import { stepBeam } from '../src/js/utils/beamPath.js';
import { MissileKit } from '../src/js/entities/MissileKit.js';
import { Carrier } from '../src/js/entities/Carrier.js';
import { TILE_SIZE, GRENADE_SPEED, REFLECT_BEAM_SPEED } from '../src/js/utils/Constants.js';

// 幅50・高さ24。床 row 20。列 12 に高さ1の段、列 20〜21 に高さ2の段、列 30〜31 は幅2の穴
// （底は row 22）、列 36〜44 は row 13 まで岩の低い天井、列 48 は壁。
function rows() {
    const out = [];
    for (let r = 0; r < 24; r++) {
        let s = '';
        for (let c = 0; c < 50; c++) {
            let solid = r >= 20;
            if (c >= 30 && c <= 31) solid = r >= 22;
            if (c === 12 && r === 19) solid = true;
            if (c >= 20 && c <= 21 && r >= 18) solid = true;
            if (c >= 36 && c <= 44 && r <= 13) solid = true;
            if (c === 48 && r >= 10) solid = true;
            if (c === 0 || c === 49) solid = true;
            s += solid ? '#' : '.';
        }
        out.push(s);
    }
    return out;
}

// 入力の台本: 右へ歩いて段を乗り上げ → 右+W でホバーして低い天井に当たる → 離して落ちる
// → 左へ歩いて段を降りる → 右へ歩いて穴に落ち、這い上がろうとする → 右+W で壁へ
function keysAt(f) {
    const held = new Set();
    if (f < 150) held.add('KeyD');
    else if (f < 260) { held.add('KeyD'); held.add('KeyW'); }
    else if (f < 300) { /* 離す */ }
    else if (f < 460) held.add('KeyA');
    else if (f < 640) held.add('KeyD');
    else if (f < 700) { held.add('KeyD'); held.add('KeyW'); }
    else if (f < 760) held.add('KeyA');
    else { held.add('KeyD'); held.add('KeyW'); }
    return held;
}

function input(f) {
    const held = keysAt(f);
    return {
        keys: {}, isKeyDown: (c) => held.has(c), isKeyPressed: () => false, isCharPressed: () => false,
        mouse: { left: false, right: false }, isLeftClickPressed: () => false, isRightClickPressed: () => false,
        rightHoldFrames: 0, crosshairLocked: false,
        getMouseWorld: () => ({ x: 1000, y: 0 }), getTargetWorld: () => ({ x: 1000, y: 0 }),
    };
}

function world() {
    const game = makeGame(makeMap(rows()));
    // tools/record-motion-baseline.mjs と同じ最小のスタブ
    game.camera = { x: 0, y: 0, shake() {} };
    game.canvas = { width: 1024, height: 768 };
    game.map.damageBlock = () => {};
    return game;
}

const r3 = (v) => Math.round(v * 1000) / 1000;
const line = (e) => `${r3(e.x)},${r3(e.y)},${r3(e.vx)},${r3(e.vy)},${e.onGround || e.grounded ? 1 : 0}`;

/** @returns {{ player: string[], attacker: string[], tank: string[] }} 各フレームの状態 */
export function record() {
    const out = { player: [], attacker: [], tank: [] };

    {
        const game = world();
        const p = new Player(game, 3 * TILE_SIZE, 20 * TILE_SIZE - 24);
        game.player = p;
        for (let f = 0; f < 900; f++) {
            game.input = input(f);
            p.update();
            out.player.push(line(p));
        }
    }

    // 敵アタッカーの AI は Math.random を使うので、記録の間だけ種つきの乱数に差し替える
    const origRandom = Math.random;
    const rng = new SeededRNG(1);
    Math.random = () => rng.next();
    try {
        const game = world();
        const a = makeAttacker(game, 4 * TILE_SIZE, 20 * TILE_SIZE - 24, 'heavy');
        // 巡回だけでは壁際を往復するだけなので、右の奥に動かない標的を置いて段・穴・天井を通らせる
        game.player = {
            x: 46 * TILE_SIZE, y: 20 * TILE_SIZE - 24, width: 16, height: 24, vx: 0, vy: 0,
            alive: true, docked: false, takeDamage() {},
        };
        for (let f = 0; f < 900; f++) {
            a.update();
            out.attacker.push(line(a));
        }
    } finally {
        Math.random = origRandom;
    }

    {
        const game = world();
        const t = new EnemyTank(game, 4 * TILE_SIZE, 20 * TILE_SIZE - 16);
        // 巡回の向きと射撃をここで固定する（理由は tools/record-motion-baseline.mjs）
        t.facingRight = true;
        t.patrolDir = 1;
        t.fireTimer = 1e9;
        game.enemies.push(t);
        for (let f = 0; f < 600; f++) {
            t.update();
            out.tank.push(line(t));
        }
    }
    return out;
}

/** テストに貼る要約。全フレームの文字列を貼ると数千行になるので、列ごとの SHA-256 と長さ */
export function digest(rec = record()) {
    const d = {};
    for (const [k, lines] of Object.entries(rec)) {
        d[k] = { frames: lines.length, sha256: createHash('sha256').update(lines.join('\n')).digest('hex') };
    }
    return d;
}

// ---------------------------------------------------------------
// 段3（飛び道具。docs/superpowers/plans/2026-10-27-tile-shape-3-projectiles.md）の基準線。
// 同じ地図で、グレネード・反射ビーム・弾・ミサイル・追尾ミサイル・巡航ミサイル・ドローンを
// 段・天井・壁・床に当てる。段2の record() の出力は変えない。
// ---------------------------------------------------------------

/** ミサイルが壊したタイルも記録に入れる（地図は書き換えない。壊れ方の差より当たった場所を見たい） */
function projectileWorld(hits) {
    const game = world();
    game.map.damageBlock = (r, c, dmg) => { hits.push(`dmg ${r},${c},${dmg}`); };
    game.map.destroyArea = (r, c, rad, dmg) => { hits.push(`area ${r},${c},${rad},${dmg}`); return []; };
    game.spawnDebris = () => {};
    game.map.width = game.map.cols * TILE_SIZE;
    game.map.height = game.map.rows * TILE_SIZE;
    game.player = {
        x: 40 * TILE_SIZE, y: 19 * TILE_SIZE - 24, width: 16, height: 24, vx: 0, vy: 0,
        alive: true, docked: false, takeDamage() {}, hp: 100,
    };
    return game;
}

const pline = (e) => `${r3(e.x)},${r3(e.y)},${r3(e.vx ?? 0)},${r3(e.vy ?? 0)},${e.alive ? 1 : 0}`;

/** 飛び道具を1本、消えるか maxFrames まで回して、各フレームの状態を out に積む */
function fly(out, e, maxFrames, hits) {
    for (let f = 0; f < maxFrames && e.alive; f++) {
        e.update();
        out.push(pline(e) + (hits.length ? ' ' + hits.splice(0).join(';') : ''));
    }
    out.push('end');
}

/** @returns {{ grenade: string[], beam: string[], bullet: string[], missile: string[], homing: string[], cruise: string[], drone: string[] }} */
export function recordProjectiles() {
    const out = { grenade: [], beam: [], bullet: [], missile: [], homing: [], cruise: [], drone: [] };
    // 軌跡の粒子・ドローンの AI が Math.random を使うので、記録の間だけ種つきの乱数に差し替える
    // ドローンの上下の揺れは Date.now から作る（EnemyDrone の巡回・ホバー）ので、時計もフレームで進める
    const origRandom = Math.random, origNow = Date.now;
    const rng = new SeededRNG(3);
    Math.random = () => rng.next();
    let clock = 0;
    Date.now = () => clock;
    try {
        const hits = [];
        const ox = 8 * TILE_SIZE, oy = 19 * TILE_SIZE;
        const deg = (d) => d * Math.PI / 180;

        // グレネード: 右上へ 8 方向 × 2 通りの速さ。段・天井・壁に当たって跳ね、床を転がる
        for (let d = -80; d <= -10; d += 10) {
            for (const sp of [GRENADE_SPEED, GRENADE_SPEED / 2]) {
                const game = projectileWorld(hits);
                fly(out.grenade, new Grenade(game, ox, oy, deg(d), sp), 400, hits);
            }
        }

        // 反射ビーム: 天井・壁・床・段の角に当たる 8 方向
        {
            const map = projectileWorld(hits).map;
            for (const d of [-75, -45, -30, -10, 10, 30, 45, 170]) {
                let b = { x: ox, y: oy - 20, vx: Math.cos(deg(d)) * REFLECT_BEAM_SPEED, vy: Math.sin(deg(d)) * REFLECT_BEAM_SPEED };
                for (let f = 0; f < 400; f++) {
                    b = stepBeam(b, map);
                    out.beam.push(`${r3(b.x)},${r3(b.y)},${r3(b.vx)},${r3(b.vy)},${b.bounced ? 1 : 0}`);
                }
                out.beam.push('end');
            }
        }

        // 弾（自機・敵）とミサイル: 壁・段・天井・床へ
        const shots = [-60, -30, -5, 0, 20, 160];
        for (const d of shots) {
            const g1 = projectileWorld(hits);
            fly(out.bullet, new PlayerBullet(g1, ox, oy - 4, deg(d)), 300, hits);
            const g2 = projectileWorld(hits);
            fly(out.bullet, new EnemyBullet(g2, ox, oy - 4, deg(d)), 300, hits);
            const g3 = projectileWorld(hits);
            fly(out.missile, new Missile(g3, ox, oy - 4, deg(d)), 300, hits);
        }

        // 追尾ミサイル: 右の奥の標的へ。途中の段・天井・壁を避けるか当たる
        for (const d of [-90, -45, 0]) {
            const game = projectileWorld(hits);
            fly(out.homing, new EnemyHomingMissile(game, ox, oy - 8, deg(d)), 400, hits);
        }

        // 巡航ミサイル: 経路なしで直進（発射から 45 フレームは地形を見ない）
        for (const d of [-90, -20, 0, 15]) {
            const game = projectileWorld(hits);
            fly(out.cruise, new EnemyCruiseMissile(game, 4 * TILE_SIZE, 16 * TILE_SIZE, deg(d)), 400, hits);
        }

        // ドローン: 巡回と体当たり
        {
            const game = projectileWorld(hits);
            const dr = new EnemyDrone(game, 24 * TILE_SIZE, 15 * TILE_SIZE);
            dr.fireTimer = 1e9;
            game.enemies.push(dr);
            for (let f = 0; f < 600; f++) {
                clock += 1000 / 60;
                dr.update();
                out.drone.push(`${pline(dr)},${dr.state}`);
            }
        }
        {
            const game = projectileWorld(hits);
            const dr = new EnemyDrone(game, 24 * TILE_SIZE, 15 * TILE_SIZE);
            dr.fireTimer = 1e9;
            game.enemies.push(dr);
            dr._startKamikaze(game.player);
            for (let f = 0; f < 600 && dr.alive; f++) {
                clock += 1000 / 60;
                dr.update();
                out.drone.push(`${pline(dr)},${dr.state}`);
            }
        }
    } finally {
        Math.random = origRandom;
        Date.now = origNow;
    }
    return out;
}

export function digestProjectiles(rec = recordProjectiles()) {
    return digest(rec);
}

// ---------------------------------------------------------------
// 段4（地面に乗るもの。docs/superpowers/plans/2026-10-28-tile-shape-4-grounded.md）の基準線。
// 本物の地図（5面を除く）の湧き位置と地図を作った後の乱数の状態、段の地図で落とすアイテムと
// 自機を載せて走らせる母艦。段2・段3の出力は変えない。
// ---------------------------------------------------------------

/** @returns {{ spawns: string[], item: string[], carrier: string[] }} */
export async function recordGrounded() {
    const out = { spawns: [], item: [], carrier: [] };
    if (!globalThis.document) {
        const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
        globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
    }
    const { Map } = await import('../src/js/world/Map.js');
    for (const level of [0, 1, 2, 3, 5, 6]) {
        for (const seed of [1, 2, 3]) {
            const game = { rng: new SeededRNG(seed) };
            const map = new Map(game, level);
            out.spawns.push(`level ${level} seed ${seed} rng ${game.rng.state}`);
            for (const p of map.landmineSpawns) out.spawns.push(`mine ${r3(p.x)},${r3(p.y)}`);
            for (const p of map.enemyTankSpawns) out.spawns.push(`tank ${r3(p.x)},${r3(p.y)}`);
            for (const p of map.enemyAttackerSpawns) out.spawns.push(`attacker ${r3(p.x)},${r3(p.y)}`);
            for (const p of map.enemyTurretSpawns) out.spawns.push(`turret ${r3(p.x)},${r3(p.y)},${p.isCeiling ? 1 : 0}`);
        }
    }

    // アイテム: 床・段の上・穴の上・低い天井の下から落とす
    for (const c of [5, 12, 20, 30, 40]) {
        const game = world();
        const it = new MissileKit(game, c * TILE_SIZE + 8, 8 * TILE_SIZE);
        for (let f = 0; f < 200 && !it.onGround; f++) {
            it._fall();
            out.item.push(`${r3(it.x)},${r3(it.y)},${r3(it.vy)},${it.onGround ? 1 : 0}`);
        }
        out.item.push('end');
    }

    // 母艦: 自機を載せて右へ（段・穴・段2つ）、折り返して左へ
    {
        const game = world();
        const held = new Set();
        game.input = { isKeyDown: (k) => held.has(k) };
        game.player = { x: 0, y: 0, width: 16, height: 24, alive: true, docked: true, onGround: true };
        const cr = new Carrier(game, 3 * TILE_SIZE, 20 * TILE_SIZE - 32);
        for (let f = 0; f < 600; f++) {
            held.clear();
            held.add(f < 400 ? 'KeyD' : 'KeyA');
            cr.update();
            out.carrier.push(`${r3(cr.x)},${r3(cr.y)},${r3(cr.vx)},${r3(cr.vy)}`);
        }
    }
    return out;
}

export async function digestGrounded() {
    return digest(await recordGrounded());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv.includes('--grounded')) {
    digestGrounded().then((d) => console.log(JSON.stringify(d, null, 2)));
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv.includes('--projectiles')) {
    console.log(JSON.stringify(digestProjectiles(), null, 2));
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    console.log(JSON.stringify(digest(), null, 2));
}
