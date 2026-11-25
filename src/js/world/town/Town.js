// ============================================
// Town - 3面の町並み
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md
// 建物1棟ごとに canvas を1枚焼き、毎フレームは画面に掛かる建物を drawImage で
// 貼るだけにする（案1。町全体を1枚に焼く案は、段2で崩れ落ちる部分を毎回
// 大きな絵から切り出すことになるので採らなかった）。
// 段2で欠け・支え・落下を足した。壊れ方はどれも buildings の cells（かけらの表）だけを読み書きし、
// 絵は消えたかけらを clearRect で抜くだけにする（建物全体は描き直さない）。
//
// 描く場所は main._drawWorld の「機体・弾のあと」（前景）。建物に入った機体は陰に隠れて見える
// （当たり判定は前から「重なる建物が外からの弾を止める」ので、見た目をそれに揃えた）。
// 機体が重なっている建物は丸ごと薄くする（occlusion。TOWN_OCCLUDE_ALPHA）ので、中の機体は見失わない。
// 土台は、建物の矩形の範囲だけ地形を重ねて描き直して岩の縁に隠す（Map.drawTerrainOver。以前の
// 「地形の奥に描く」と同じ見た目）。
//
// 本体に残しているのは constructor・update()（どの順で何を進めるかの唯一の記述）・draw() だけ。
// 中身は層に分けてある（Map.js と同じ Object.assign(Town.prototype, ...) 方式。2026-11-25）:
// townQuery（問い合わせ・薄くする）/ townDamage（欠ける・焦げる・焼ける・爆風・支え・切り離し）/
// townProjectiles（弾・ビーム）/ townFalling（落ちる破片・倒れる木・瓦礫）/ townIcicles（つらら）/
// townEffects（粒・音の注文）。触ったら node tools/trace-town.mjs の指紋で前後を比べる。

import { rasterizeParts, computeAnchors, MAT_MASK, MAT_EXPLOSIVE } from './chunks.js';
import { paintParts } from './shapes.js';
import { FireSystem } from './fire.js';
import { ExplosiveSystem } from './explosives.js';
import { getSmokeSprites } from '../../entities/smokeSprites.js';
import { audioManager } from '../../audio/AudioManager.js';
import { isInView } from '../../utils/viewCull.js';
import { VIEW_CULL_MARGIN } from '../../utils/Constants.js';
import { TownQuery } from './townQuery.js';
import { TownDamage } from './townDamage.js';
import { TownProjectiles } from './townProjectiles.js';
import { TownFalling } from './townFalling.js';
import { TownIcicles } from './townIcicles.js';
import { TownEffects } from './townEffects.js';

function defaultCreateCanvas(w, h) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    return cv;
}

export class Town {
    /**
     * @param {Array<object>} specs generateTown() の設計図
     * @param {{isSolidTile?: (r:number, c:number) => boolean, rockAt?: (x:number, y:number) => boolean,
     *   createCanvas?: (w:number, h:number) => object}} [opts]
     */
    constructor(specs, { isSolidTile = () => false, rockAt = null, createCanvas = defaultCreateCanvas, random = Math.random,
        smokeSprites = getSmokeSprites, metalHeat = false, chipScale = 1 } = {}) {
        this.isSolidTile = isSolidTile;
        // 弾・ミサイル・ビームで欠ける半径に掛ける倍率（TOWN_PROJECTILE_IMPACT の chip）。7面の基地だけ 0.75
        // （BASE_TOWN_CHIP_SCALE。ユーザー「若干硬め」）。爆風と落ちてくる破片の欠け方には掛けない（「若干」なので弾だけ）
        this.chipScale = chipScale;
        // 6面だけ: 金属の穴の縁を茶色く焦がさず、赤く焼けてから冷める（spec 2026-11-07-stage6-factory 2章）。
        // hot は焼けているかけら [{ b, k, age }]。_heatIndex は同じかけらを二重に積まないための索引
        this.metalHeat = metalHeat;
        this.hot = [];
        this._heatIndex = new Map();
        // 5面だけ: ワールド座標の点がタイルの形の岩の中か（Map.isSolidPoint）。支えをタイルでなく形で見る。
        // 隣のブロックが壊れると根元のタイルが坂・面取りに削れて、タイルは岩のままでも木の根元の下が宙になる
        // （段5の実測で、木・つららの約1割が 8〜10px 浮いたまま立っていた）。null はタイル単位（3面・4面は今までどおり）
        this.rockAt = rockAt;
        this.createCanvas = createCanvas;
        // 火のつき方・燃え広がりの乱数（spec 3章「乱数」: Math.random で構わない。テストは種つきを渡す）
        this.random = random;
        // 煙のパフの絵（SmokeScreen と同じ焼いたもの）。node の書き出しの道具は () => null を渡す
        this.smokeSprites = smokeSprites;
        this.fire = new FireSystem(this);
        this.explosives = new ExplosiveSystem(this);
        this.falling = [];
        this.rubble = [];
        // 震えているつらら（brittle の建物。当たってから ICICLE_SHAKE_TICKS 数える。_shake / _updateShaking）
        this.shaking = [];
        // 弾ごとの覚え書き（発射位置で無視する建物・細い部品を欠かせた建物）。弾が消えれば一緒に消える
        this._projState = new WeakMap();
        // 粒・土煙の注文。update() でまとめて、画面の中の分だけ出す（spec 2章「画面の外」）。
        // 壊れ方そのもの（かけら・支え・落下）は注文と関係なく、その場で進める
        this.effects = [];
        this.buildings = specs.map((spec, id) => {
            const { cells, cw, ch } = rasterizeParts(spec.parts, spec.w, spec.h);
            const canvas = createCanvas(spec.w, spec.h);
            const ctx = canvas.getContext('2d');
            paintParts(ctx, spec.parts);
            const total = cells.reduce((n, v) => n + (v ? 1 : 0), 0);
            return {
                id, site: spec.site, style: spec.style, kind: spec.kind,
                // 4面の植物。燃えない・誘爆しない・崩壊の演出（爆発・地鳴り・焦げた土台・瓦礫）を持たず、
                // 欠けた分が葉の破片になって落ちるだけ
                soft: spec.soft === true,
                // 5面の雪の木は 'snow'。砕けた粒と穴の縁の色が葉と変わる（それ以外は同じ）
                flora: spec.flora || 'leaf',
                // 木の幹の x（建物の左端から px）。倒れる木の軸の手がかり（幹が丸ごと壊されても、根元の位置が分かる）
                footX: spec.footX,
                // 5面のつらら。当たっても欠けずに震え、震えが終わったら全体が 1 つの塊（IcicleFall）になって落ちる。
                // damage: 落ちたときに機体へ与える値。shakeLeft: 震えの残り tick（0 は震えていない）。shaken: 一度震えたら二度と震えない
                brittle: spec.brittle === true,
                damage: spec.damage || 0,
                // 6面のクレーンの荷の矩形（建物の左上から px）と種類。落ちる塊に荷のかけらが入っていれば機体にダメージ（_detach）
                heavy: spec.heavy || null,
                shakeLeft: 0,
                shaken: false,
                x: spec.x, y: spec.y, width: spec.w, height: spec.h,
                cells, cw, ch,
                anchors: computeAnchors(cells, cw, ch, spec.x, spec.y, isSolidTile, rockAt),
                canvas, ctx, total, remaining: total, collapsed: false,
                // 火が焦がしたかけら（燃えているあいだ崩れの対象。fire.js）
                burnt: new Set(),
                // 段3b: 爆発物（かけらに爆発物の材料がある建物）。爆発したら exploded
                explosive: cells.some((v) => (v & MAT_MASK) === MAT_EXPLOSIVE), exploded: false,
                // 爆発の種類（TOWN_EXPLOSIVE_PROFILES のキー）。6面の工場は 'factory'（グレネードと同じ）
                blast: spec.blast || 'town',
                // 描く不透明度。機体が重なっている間は TOWN_OCCLUDE_ALPHA へ、離れたら 1 へ少しずつ寄る（updateOcclusion）
                alpha: 1,
            };
        });
        // 建物は動かないので、外接矩形が掛かるマス目に1度だけ登録する
        this._grid = new Map();
        for (const b of this.buildings) {
            for (const key of this._gridKeys(b.x, b.y, b.x + b.width, b.y + b.height)) {
                if (!this._grid.has(key)) this._grid.set(key, []);
                this._grid.get(key).push(b);
            }
        }
        // 岩のタイル → それに支えられている建物（岩が壊れたときに引く）
        this._anchorIndex = new Map();
        for (const b of this.buildings) {
            for (const a of b.anchors) {
                const key = `${a.r},${a.c}`;
                if (!this._anchorIndex.has(key)) this._anchorIndex.set(key, new Set());
                this._anchorIndex.get(key).add(b);
            }
        }
    }

    /** 毎 tick。main._simulationTick が map.update() のあとに呼ぶ */
    update(game) {
        // 前景に描くので、隠れて見失うと困るもの（機体・アイテム・地雷）が重なる建物を薄くする。
        // 敵は画面の近くだけ見る（平均100体いて、遠くの敵が重なる建物は描かれない）
        const cam = game.camera, cv = game.canvas;
        const near = (e) => !cam || !cv || isInView(e, cam, cv, VIEW_CULL_MARGIN);
        const seen = [game.player, game.carrier, ...(game.enemies || []).filter(near),
            ...(game.pickups || []), ...(game.landmines || [])];
        this.updateOcclusion(seen.filter((e) => e && e.alive !== false));

        // game.projectiles の弾（自機のミサイル・グレネード・マシンガンと、敵のミサイル・グレネード）。
        // 敵のマシンガン・ホーミング・巡航・ビームは game.enemyBullets で、CollisionManager が更新の直後に見る。
        // 持ち主による違い（敵は当たるが無傷。自機・母艦が重なる建物だけ例外）は sweepProjectile の中で決まる
        if (game.projectiles.length > 0) {
            // 敵の弾でも欠ける建物（自機・母艦が重なっている建物）を、1 tick に1回だけ集める
            const vulnerable = this.buildingsUnder([game.player, game.carrier].filter((e) => e && e.alive));
            for (const p of game.projectiles) this.sweepProjectile(p, vulnerable);
        }
        this._updateShaking();
        this._updateFalling(game);
        this._updateHeat();
        const view = cam && cv ? { x: cam.x, y: cam.y, w: cv.width, h: cv.height } : null;
        this.fire.update(view);
        // 炎のループ（spec 4章）。画面に近い火元が無くなったら引いて止める。
        // 遊んでいる最中（'playing'）でなければ始めない。最後の自機を失った tick やクリアの tick は、
        // stopLoopingSe のあとにこの update が来るので、ここで作り直すと CONTINUE や次の面
        // （町が無く、誰も止めない）まで鳴り続けた（最終レビュー指摘）。gameState の無い道具・テストは遊んでいる扱い
        const playing = game.gameState === undefined || game.gameState === 'playing';
        const fireSound = this.fire.soundLevel(view);
        if (playing && fireSound.intensity > 0) audioManager.startTownFire(fireSound.intensity, fireSound.x);
        else audioManager.stopTownFire();
        this.explosives.update(game, view);
        this._flushEffects(game);
    }

    draw(ctx, view) {
        const x1 = view.x + view.w;
        const y1 = view.y + view.h;
        // 6面の金属の焼けた縁は、その建物を描いた直後に重ねる（建物の canvas は描き直さない）。全部の建物のあとに
        // まとめて重ねると、重なった手前の建物の上に奥の建物の赤い点が浮いた（最終レビュー指摘。6面 5シードで 77 組）
        const hotOf = this.hot.length > 0 ? new Map() : null;
        if (hotOf) {
            for (const h of this.hot) {
                if (!hotOf.has(h.b)) hotOf.set(h.b, []);
                hotOf.get(h.b).push(h);
            }
        }
        for (const b of this.buildings) {
            if (b.x >= x1 || b.x + b.width <= view.x || b.y >= y1 || b.y + b.height <= view.y) continue;
            if (b.alpha < 1) {
                ctx.globalAlpha = b.alpha;
                ctx.drawImage(b.canvas, b.x + this._shakeOffset(b), b.y);
                ctx.globalAlpha = 1;
            } else {
                ctx.drawImage(b.canvas, b.x + this._shakeOffset(b), b.y);
            }
            const hot = hotOf && hotOf.get(b);
            if (hot) this._drawHeat(ctx, b, hot);
        }
        // 火（煙 → 炎 → 残り火）。建物の直後＝瓦礫・破片より奥、岩の縁よりも奥。煙が無いときは絵を焼かない
        this.fire.draw(ctx, view, this.fire.smoke.length > 0 ? this.smokeSprites() : null);
        // 瓦礫の山: 下に広い段、上に狭い段の2つの四角（fillRect だけで描く決まり）
        for (const r of this.rubble) {
            if (r.x >= x1 || r.x + r.w <= view.x || r.groundY - r.h >= y1 || r.groundY <= view.y) continue;
            ctx.fillStyle = r.color;
            const low = Math.ceil(r.h / 2);
            ctx.fillRect(r.x, r.groundY - low, r.w, low);
            ctx.fillRect(r.x + r.w / 4, r.groundY - r.h, r.w / 2, r.h - low);
        }
        // 落ちる破片。回るので長辺の正方形で見る
        for (const p of this.falling) {
            const s = p.reach || Math.max(p.width, p.height);
            if (p.cx - s >= x1 || p.cx + s <= view.x || p.cy - s >= y1 || p.cy + s <= view.y) continue;
            p.draw(ctx);
        }
    }
}

// 層（2026-11-25 に分けた）。名前が重なると黙って上書きされるので tests/town-mixins.test.js が縛っている
Object.assign(Town.prototype, TownQuery, TownDamage, TownProjectiles, TownFalling, TownIcicles, TownEffects);
