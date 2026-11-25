// ============================================
// EnemySpider - 6面の前半〜中盤の偵察の小型ロボ（床・壁・天井を這い、自機の頭上で破裂する弾を撃つ）
// ============================================
//
// 設計書 docs/superpowers/specs/2026-11-22-spider-enemy-design.md。
// 6面の後半を単調にしないこと、上からの弾を避けさせることがねらい（ユーザー）。
//
// 体は自機・アタッカーの歩く仕組み（walkerBody.js）を使わない。あちらは床の上を歩く前提で、
// 壁・天井を這わせると共有部品を曲げることになる。面に沿って進む規則は utils/surfaceCrawl.js に
// 純粋関数として置き、ここは「いつ走る・止まる・跳ぶ・糸を使う」の判断と、空中の動きだけを持つ。
//
// 動きはクモの「ダッと走る → ぴたっと止まる → 急に切り返す」と横跳び（2026-11-23 ユーザー指定。初めの一定速で
// 長く這う動きは「フナムシみたい」だった）。自機が見えると、ドローンと同じく自機から間合いを取った所へ走り寄り、
// 撃ったあとは横跳びで離れることがある。
//
// 判断の乱数は**湧いた場所から作った個体の乱数**（spawnStateRng）だけを使い、Math.random は使わない。
// 同じ週・同じ面・同じ場所のスパイダーは同じ動きをする（面別ランキングの公平さ。utils/spawnState.js）。
//
// 本体に残しているのは constructor・update()（毎フレームどの順で何を進めるかの唯一の記述）・被弾と破壊だけ。
// 中身は層に分けてある（attacker/ と同じ Object.assign(EnemySpider.prototype, ...) 方式。2026-11-25）:
// spider/crawl（面を這う・角を回る・自機へ寄る）/ spider/air（横跳び・跳び移り・落ちる・糸）/
// spider/combat（撃つ）/ spider/draw（描画）。触ったら node tools/trace-spiders.mjs の指紋で前後を比べる。

import {
    SPIDER_SIZE, SPIDER_HP, SPIDER_SCORE, SPIDER_RUN_FRAMES, SPIDER_FIRE_INTERVAL,
} from '../utils/Constants.js';
import { downOf } from '../utils/surfaceCrawl.js';
import { spawnStateRng } from '../utils/spawnState.js';
import { applyDamage } from '../utils/damage.js';
import { playDestruction } from './destruction.js';
import { SpiderCrawl, pick } from './spider/crawl.js';
import { SpiderAir } from './spider/air.js';
import { SpiderCombat } from './spider/combat.js';
import { SpiderDraw } from './spider/draw.js';

export class EnemySpider {
    /**
     * @param {object} game
     * @param {number} x 箱の左上
     * @param {number} y
     * @param {'floor'|'ceiling'|'wallL'|'wallR'} surface 張り付いている面
     */
    constructor(game, x, y, surface = 'floor') {
        this.game = game;
        this.x = x;
        this.y = y;
        this.width = SPIDER_SIZE;
        this.height = SPIDER_SIZE;
        this.hp = SPIDER_HP;
        this.maxHp = this.hp;
        this.alive = true;

        this.rng = spawnStateRng(game, x, y);
        this.surface = surface;
        const dir = this.rng.next() < 0.5 ? 1 : -1;
        const down = downOf(surface);
        // 面に沿う向き（下と直交する軸）
        this.fwd = down.y !== 0 ? { x: dir, y: 0 } : { x: 0, y: dir };
        // 絵の向きを覚えておく（空中では面が無いので、最後に張り付いていた面で描く）
        this.drawSurface = surface;

        this.mode = 'crawl';
        this.modeTimer = pick(this.rng, SPIDER_RUN_FRAMES);
        this.vx = 0;
        this.vy = 0;
        this.airGravity = { x: 0, y: 0 };
        this.airFrames = 0;

        // 糸。thread の間だけ支点（天井の下面の点）を持つ
        this.threadAnchor = null;
        this.threadDir = 0;       // -1 = 登る、+1 = 降りる
        this.threadShoot = 0;     // 糸が伸びきるまでの残りフレーム

        this.walkPhase = 0;

        // 最初の発射までの時間も湧いた場所から決める（全員が同じ瞬間に撃ち始めないように）
        this.fireTimer = Math.floor(this.rng.next() * SPIDER_FIRE_INTERVAL);
    }

    update() {
        if (!this.alive) return;
        if (this._updateFire()) return;
        switch (this.mode) {
            case 'crawl': this._updateCrawl(); break;
            case 'pause': this._updatePause(); break;
            case 'hop':
            case 'leap':
            case 'fall': this._updateAirborne(); break;
            case 'thread': this._updateThread(); break;
            case 'corner': this._updateCorner(); break;
            default: break;
        }
    }

    // ------------------------------------------
    // 被弾・撃破
    // ------------------------------------------
    takeDamage(amount) {
        applyDamage(this, amount);
    }

    die() {
        this.alive = false;
        playDestruction(this.game, this, 'spider');
        this.game.addScore(SPIDER_SCORE);
    }

}

// 層（2026-11-25 に分けた）。名前が重なると黙って上書きされるので tests/spider-mixins.test.js が縛っている
Object.assign(EnemySpider.prototype, SpiderCrawl, SpiderAir, SpiderCombat, SpiderDraw);
