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
import { TILE_SIZE } from '../src/js/utils/Constants.js';

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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    console.log(JSON.stringify(digest(), null, 2));
}
