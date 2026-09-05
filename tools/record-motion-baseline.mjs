// tools/record-motion-baseline.mjs
// 陸上での自機・戦車・ミサイルの軌跡のチェックポイントを出力する。
// 環境の係数を物理に入れる前に一度走らせ、出力を
// tests/environment-land-invariance.test.js の BASELINE に貼る。
// 「実装から期待値を導かない」ための道具なので、係数を入れた後は走らせない。
import { Player } from '../src/js/entities/Player.js';
import { EnemyTank } from '../src/js/entities/EnemyTank.js';
import { Missile } from '../src/js/entities/Missile.js';
import { makeMap, makeGame } from '../tests/helpers/enemy-world.js';
import { TILE_SIZE } from '../src/js/utils/Constants.js';
import { pathToFileURL } from 'node:url';

// 幅40・高さ24。床 row 20。列 30 に高さ1の段（乗り上げを通す）。
function rows() {
    const out = [];
    for (let r = 0; r < 24; r++) {
        if (r >= 20) out.push('#'.repeat(40));
        else if (r === 19) out.push('.'.repeat(30) + '#' + '.'.repeat(9));
        else out.push('.'.repeat(40));
    }
    return out;
}

// 入力の台本: 0-199 右、200-259 右+W（バースト→ホバー）、260-399 なし、400-599 左、600-999 右
function keysAt(frame) {
    const held = new Set();
    if (frame < 200) held.add('KeyD');
    else if (frame < 260) { held.add('KeyD'); held.add('KeyW'); }
    else if (frame >= 400 && frame < 600) held.add('KeyA');
    else if (frame >= 600) held.add('KeyD');
    return held;
}

function input(frame) {
    const held = keysAt(frame);
    return {
        keys: {}, isKeyDown: (c) => held.has(c), isKeyPressed: () => false, isCharPressed: () => false,
        mouse: { left: false, right: false }, isLeftClickPressed: () => false, isRightClickPressed: () => false,
        rightHoldFrames: 0, crosshairLocked: false,
        getMouseWorld: () => ({ x: 1000, y: 0 }), getTargetWorld: () => ({ x: 1000, y: 0 }),
    };
}

const CHECKPOINTS = [1, 50, 100, 199, 230, 260, 300, 400, 500, 600, 800, 999];
const r3 = (v) => Math.round(v * 1000) / 1000;

// EnemyTank のコンストラクタが facingRight / fireTimer の初期化に Math.random() を
// 使っており、これが軌跡（巡回方向）を左右してしまう。再現性を保つため、
// 生成中だけ Math.random を小さな LCG に差し替える（挙動そのものは変えない）。
function makeSeededRandom(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

export function record() {
    const game = makeGame(makeMap(rows()));
    // Player.update() がカメラシェイクやキャンバスサイズ参照を行う箇所があるため、
    // tests/burst-ceiling.test.js に倣って最小限のスタブを足す
    game.camera = { x: 0, y: 0, shake() {} };
    game.canvas = { width: 1024, height: 768 };
    // Missile が地形に当たると map.damageBlock() を呼ぶが、makeMap() のモックには無い。
    // このシナリオでは弾は天井の外(境界)に当たって消える想定で、
    // 破壊された地形の中身は軌跡に関係しないので何もしないスタブでよい
    game.map.damageBlock = () => {};

    const player = new Player(game, 5 * TILE_SIZE, 20 * TILE_SIZE - 24);
    game.player = player;

    const originalRandom = Math.random;
    Math.random = makeSeededRandom(1);
    let tank;
    try {
        tank = new EnemyTank(game, 20 * TILE_SIZE, 20 * TILE_SIZE - 16);
    } finally {
        Math.random = originalRandom;
    }
    tank.fireTimer = 1e9; // 撃たない（EnemyTank は fireInterval ではなく fireTimer で管理）
    game.enemies.push(tank);

    const missile = new Missile(game, 2 * TILE_SIZE, 10 * TILE_SIZE, -0.2, true);
    game.projectiles.push(missile);

    const out = { player: [], tank: [], missile: [] };
    for (let f = 0; f < 1000; f++) {
        game.input = input(f);
        player.update();
        tank.update();
        if (missile.alive) missile.update();
        if (CHECKPOINTS.includes(f)) {
            out.player.push([f, r3(player.x), r3(player.y), r3(player.vx), r3(player.vy)]);
            out.tank.push([f, r3(tank.x), r3(tank.y), r3(tank.vx), r3(tank.vy)]);
            out.missile.push([f, r3(missile.x), r3(missile.y), missile.alive ? 1 : 0]);
        }
    }
    return out;
}

// パスに空白や日本語(Google Drive の同期フォルダ名)が含まれるため、
// 単純な文字列比較(file://${process.argv[1]})だとURLエンコードの差で
// 一致せず直接実行を検出できない。pathToFileURL で揃えて比較する
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    console.log(JSON.stringify(record(), null, 1));
}
