// 雪の面で敵が「自分から落ちる」頻度を数える。滑りを入れる前後で比べるための
// もので、ゲーム本体からは呼ばれない。
//
// 使い方:
//   node tools/measure-snow-slide.mjs > /tmp/snow-after.json
//
// 画面に出さず JSON に吐くのは、実機の数値は記録して後から突き合わせたいため。

import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { ICE_SLIDE, TILE_SIZE, ENEMY_ATTACKER_TYPES } from '../src/js/utils/Constants.js';

// Map._generateMiniMap() が document を触るので、最小の stub を置く
// （tests/MapDeterminism.test.js と同じ手口）
const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }),
};

const { Map: GameMap } = await import('../src/js/world/Map.js');
const { EnemyAttacker } = await import('../src/js/entities/EnemyAttacker.js');
const { EnemyTank } = await import('../src/js/entities/EnemyTank.js');

const SEEDS = [1, 2, 3, 4, 5, 6];
const FRAMES = 3600;          // 60秒ぶん
const MISSION_LEVEL = 4;      // 5面（0 起点）
const SNOW = { motionAt: () => ({ speed: 1, gravity: 1, slide: ICE_SLIDE }), sightScale: 1, kind: 'snow' };

/** 敵の update() が触るものだけを持つ最小の game。 */
function makeGame(map) {
    return {
        map, env: SNOW,
        player: null, carrier: null,
        enemies: [], projectiles: [], enemyBullets: [],
        missileKits: [], repairKits: [], autoAimUnits: [], particles: [],
        rng: new SeededRNG(1),
        camera: { x: 0, y: 0 }, canvas: { width: 1366, height: 768 },
        spawnSparks() {}, spawnExplosion() {}, addScore() {},
        spawnSmokeScreen() {}, spawnSnowKick() {}, spawnSplash() {},
    };
}

const result = { frames: FRAMES, seeds: SEEDS.length, falls: 0, deaths: 0, offMap: 0, perSeed: [] };

for (const seed of SEEDS) {
    const map = new GameMap({ rng: new SeededRNG(seed) }, MISSION_LEVEL);
    const game = makeGame(map);

    // 実物の湧き位置に置く（配置そのものは触らない＝週次の決定性に影響しない）
    for (const p of map.enemyAttackerSpawns) {
        game.enemies.push(new EnemyAttacker(game, p.x, p.y, ENEMY_ATTACKER_TYPES.standard));
    }
    for (const p of map.enemyTankSpawns) {
        game.enemies.push(new EnemyTank(game, p.x, p.y));
    }

    // 「落ちた」の数え方に注意。接地フラグの立ち下がりをそのまま数えると、
    // ホバー戦車の 0.3px の上下やアタッカーの段差でフラグが1フレームおきに
    // 途切れるぶんまで拾ってしまい、1体あたり毎分 500 回という無意味な値になる
    // （最初これで数えた）。**15フレーム(0.25秒)以上続けて宙に浮き、かつ
    // 1タイル以上下がった**ものだけを1回と数える。
    // 自機のダミーを置いて、敵を「追跡・切り返し」の状態に入れる。これが無いと
    // 敵は巡回しているだけで、滑りが効く場面をほとんど通らない（最初それで
    // 「変化なし」という結論を出しかけた）。マップの上空を往復させ、
    // 各シードで同じ軌跡を辿らせる（乱数を使わない＝比較が安定する）
    const dummy = {
        x: 0, y: 0, width: 16, height: 24, alive: true, docked: false,
        vx: 0, vy: 0, hp: 100, takeDamage() {}, invincibleTimer: 9e9,
    };
    game.player = dummy;
    const spanX = map.cols * TILE_SIZE;
    const midY = (map.rows * TILE_SIZE) / 2;

    const state = new WeakMap();
    let falls = 0, deaths = 0, offMap = 0, dropped = 0;
    for (let f = 0; f < FRAMES; f++) {
        // 往復（三角波）。1フレーム 2px で、マップ全幅を行って戻る
        const t = (f * 2) % (spanX * 2);
        dummy.x = t < spanX ? t : spanX * 2 - t;
        dummy.y = midY + Math.sin(f / 90) * 4 * TILE_SIZE;

        for (const e of game.enemies) {
            if (!e.alive) continue;
            const st = state.get(e) || { air: 0, yAtLeave: e.y };
            e.update();
            const nowGrounded = e.onGround ?? e.grounded ?? false;
            if (!nowGrounded) {
                if (st.air === 0) st.yAtLeave = e.y;
                st.air++;
            } else {
                if (st.air >= 15 && e.y - st.yAtLeave >= TILE_SIZE) {
                    falls++;
                    dropped += e.y - st.yAtLeave;
                }
                st.air = 0;
            }
            state.set(e, st);
            if (!e.alive) deaths++;
            if (e.y > map.rows * TILE_SIZE) offMap++;
        }
    }
    result.droppedPx = (result.droppedPx || 0) + dropped;
    result.perSeed.push({ seed, enemies: game.enemies.length, falls, deaths, offMap });
    result.falls += falls;
    result.deaths += deaths;
    result.offMap += offMap;
}

// 1体あたり・60秒あたりに正規化しておく（体数が seed ごとに違うため）
const total = result.perSeed.reduce((n, s) => n + s.enemies, 0);
result.enemies = total;
result.fallsPerEnemyPerMinute = +(result.falls / total).toFixed(3);
result.deathsPerEnemyPerMinute = +(result.deaths / total).toFixed(3);
console.log(JSON.stringify(result, null, 2));
