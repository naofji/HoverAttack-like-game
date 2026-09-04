// ============================================
// StageEnvironment - 面の環境（霧・雪・地底湖）
// ============================================
//
// 設計: docs/superpowers/specs/2026-09-04-stage-environments-design.md
//
// 面ごとの違いは Constants の STAGE_ENVIRONMENTS の1行にあり、ここはそれを
// 「この座標の物理係数」と「索敵の倍率」に翻訳するだけ。エンティティは
// motionFor / sightScaleFor の2つの純関数経由でしか環境を知らない
// （game.env を直接読む箇所を増やさない。テストの簡易 game に env が無くても
// 陸上として動くようにするため）。
//
// 描画は kind ごとのファイル（environment/）に分け、main.js からは
// drawOverWorld と drawOverlay の2回だけ呼ぶ。

import {
    STAGE_ENVIRONMENTS, WATER_SPEED_SCALE, WATER_GRAVITY_SCALE, ICE_SLIDE, FOG_SIGHT_SCALE,
} from '../utils/Constants.js';
import { createNoneRenderer, canvasAvailable } from './environment/none.js';
import { createFogRenderer } from './environment/fog.js';
import { createWaterRenderer } from './environment/water.js';

/** 陸上。陸上の面では全エンティティがこれを受け取り、掛けても値が変わらない。 */
export const LAND_MOTION = Object.freeze({ speed: 1, gravity: 1, slide: 0 });
const WATER_MOTION = Object.freeze({ speed: WATER_SPEED_SCALE, gravity: WATER_GRAVITY_SCALE, slide: 0 });
const SNOW_MOTION = Object.freeze({ speed: 1, gravity: 1, slide: ICE_SLIDE });

const NONE_ROW = Object.freeze({ kind: 'none', backdrop: 'cave', terrain: 'cave' });

/** 描画側の実装を kind から選ぶ。document が無い（node のテスト）なら none に落とす。 */
function createRenderer(kind, env) {
    if (!canvasAvailable()) return createNoneRenderer();
    if (kind === 'fog') return createFogRenderer();
    if (kind === 'water' && env.game && env.game.map && env.game.map.water) return createWaterRenderer(env);
    return createNoneRenderer();
}

/**
 * 座標の物理係数。game.env が無い（テストの簡易 game）なら陸上。
 * @returns {{speed:number, gravity:number, slide:number}}
 */
export function motionFor(game, x, y) {
    return game && game.env ? game.env.motionAt(x, y) : LAND_MOTION;
}

/** 索敵の横半径に掛ける倍率。game.env が無ければ 1。 */
export function sightScaleFor(game) {
    return game && game.env ? game.env.sightScale : 1;
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
            return map && map.isWaterAtPixel(x, y) ? WATER_MOTION : LAND_MOTION;
        }
        if (this.kind === 'snow') return SNOW_MOTION;
        return LAND_MOTION;
    }

    /** 毎シミュレーションtick。描画側の時計を進める。 */
    update() {
        this.renderer.update();
    }

    /** ワールド座標（translate 済み）。地形と機体の後、煙幕の前。 */
    drawOverWorld(ctx, camX, camY) {
        this.renderer.drawOverWorld(ctx, camX, camY);
    }

    /** 画面座標。HUD の直前。alphaScale はデモ画面で薄くするため。 */
    drawOverlay(ctx, alphaScale = 1) {
        this.renderer.drawOverlay(ctx, alphaScale);
    }
}
