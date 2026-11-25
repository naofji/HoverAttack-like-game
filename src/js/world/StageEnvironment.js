// ============================================
// StageEnvironment - 面の環境（霧・雪・地底湖）
// ============================================
//
// 設計: docs/superpowers/specs/2026-09-04-stage-environments-design.md
//
// 面ごとの違いは Constants の STAGE_ENVIRONMENTS の1行にあり、ここはそれを
// 「この座標の物理係数」と「索敵の倍率」に翻訳するだけ。エンティティは
// motionFor / sightScaleFor の2つの純関数経由でしか環境を知らない（その2つと係数の値は utils/motion.js）。
//
// 描画は kind ごとのファイル（environment/）に分け、呼び出し口は4つ:
// main.js から drawBehindTerrain（地形の下）・drawOverWorld（地形の上）・
// drawOverlay（画面全体への重ね）の3回、加えて ScreenRenderer.js から
// drawDemoOverlay（面別ランキングなどデモ画面での画面重ね）。

import { STAGE_ENVIRONMENTS, FOG_SIGHT_SCALE, TILE_SIZE } from '../utils/Constants.js';
import { LAND_MOTION, WATER_MOTION, WATERFALL_MOTION, SNOW_MOTION } from '../utils/motion.js';
import { createNoneRenderer, canvasAvailable } from './environment/none.js';
import { createFogRenderer } from './environment/fog.js';
import { createWaterRenderer } from './environment/water.js';
import { createSnowRenderer } from './environment/snow.js';

// 物理係数の値と純関数は utils/motion.js にある（utils/ → world/ の逆向きの依存をなくすため、2026-11-26）。
// 使う側の import を変えずに済むよう、ここから同じ名前で再 export する
export {
    LAND_MOTION, WATER_MOTION, WATERFALL_MOTION, SNOW_MOTION, motionFor, fallSpeedScaleFor, sightScaleFor,
} from '../utils/motion.js';

const NONE_ROW = Object.freeze({ kind: 'none', backdrop: 'cave', terrain: 'cave' });

/** 描画側の実装を kind から選ぶ。document が無い（node のテスト）なら none に落とす。 */
function createRenderer(kind, env) {
    if (!canvasAvailable()) return createNoneRenderer();
    if (kind === 'fog') return createFogRenderer();
    if (kind === 'water' && env.game && env.game.map && env.game.map.water) return createWaterRenderer(env);
    if (kind === 'snow') return createSnowRenderer();
    return createNoneRenderer();
}

export class StageEnvironment {
    /**
     * @param {object} game Game（map / enemies / projectiles を読む）。デモ画面用は null 可
     * @param {number} stageIndex 0..6
     */
    constructor(game, stageIndex) {
        this.game = game;
        const row = STAGE_ENVIRONMENTS[stageIndex] || NONE_ROW;
        this.kind = row.kind;
        this.backdrop = row.backdrop;
        this.sightScale = this.kind === 'fog' ? FOG_SIGHT_SCALE : 1;
        this.renderer = createRenderer(this.kind, this);
    }

    motionAt(x, y) {
        if (this.kind === 'water') {
            const map = this.game && this.game.map;
            if (map && map.isWaterfallAtPixel && map.isWaterfallAtPixel(x, y)) return WATERFALL_MOTION;
            if (map && map.isWaterAtPixel && map.isWaterAtPixel(x, y)) return WATER_MOTION;
            return LAND_MOTION;
        }
        if (this.kind === 'snow') return SNOW_MOTION;
        return LAND_MOTION;
    }

    /** 毎シミュレーションtick。描画側の時計を進める。 */
    update() {
        this.renderer.update();
        // デモ画面（後続タスク）は game=null で StageEnvironment を作って update() を呼ぶので、
        // 水しぶきの検出は game があるときだけ行う（null なら判定対象のエンティティが無い）。
        if (this.kind === 'water' && this.game) this._trackWaterCrossings();
    }

    /** 前フレームと今フレームの「水中か」を比べ、またいだフレームだけしぶきを出す。 */
    _trackWaterCrossings() {
        const g = this.game;
        const map = g.map;
        const check = (e) => {
            if (!e || e.alive === false) return;
            const cx = e.x + (e.width || 0) / 2;
            const cy = e.y + (e.height || 0) / 2;
            const inWater = map.isWaterAtPixel(cx, cy);
            if (e._inWater === undefined) { e._inWater = inWater; return; } // 初回は記録だけ
            if (inWater !== e._inWater) {
                e._inWater = inWater;
                // しぶきは実際の液面に出す。中心のタイルに液面がかかっていなければ
                // （水から出た直後）、ひとつ下のタイルの液面を見る
                const r = Math.floor(cy / TILE_SIZE);
                const c = Math.floor(cx / TILE_SIZE);
                let surfaceY = map.getSurfaceY(r, c);
                if (surfaceY < 0) surfaceY = map.getSurfaceY(r + 1, c);
                if (surfaceY < 0) surfaceY = r * TILE_SIZE;
                if (g.spawnSplash) g.spawnSplash(cx, surfaceY, e.vy || 0);
            }
        };
        check(g.player);
        check(g.carrier);
        for (const e of g.enemies) check(e);
        for (const p of g.projectiles) check(p);
        for (const b of g.enemyBullets) check(b);
        // 破片（マシンガンの薬莢も含む）も水面をまたぐとしぶきを出す。particles には
        // 煙や火花など他の演出も混ざっているので isDebris で拾う対象だけを選ぶ
        for (const p of g.particles) if (p.isDebris) check(p);
    }

    /** ワールド座標（translate 済み）。遠景の直後、地形タイルの前（雪が岩の奥に見える）。 */
    drawBehindTerrain(ctx, camX, camY) {
        this.renderer.drawBehindTerrain(ctx, camX, camY);
    }

    /** ワールド座標（translate 済み）。地形と機体の後、煙幕の前。 */
    drawOverWorld(ctx, camX, camY) {
        this.renderer.drawOverWorld(ctx, camX, camY);
    }

    /** 画面座標。HUD の直前。alphaScale はデモ画面で薄くするため。本編用（霧だけが使う）。 */
    drawOverlay(ctx, alphaScale = 1) {
        this.renderer.drawOverlay(ctx, alphaScale);
    }

    /** デモ画面（面別ランキングなど）用の画面重ね。雪はここで画面スクロールに戻す。 */
    drawDemoOverlay(ctx, alphaScale = 1) {
        this.renderer.drawDemoOverlay(ctx, alphaScale);
    }
}
