// ============================================
// Town: 粒・土煙・音の注文（update() でまとめて、画面の中の分だけ出す）
// ============================================
//
// world/town/Town.js から切り出した（2026-11-25、中身は動かしただけ）。
// Map.js と同じく **Object.assign(Town.prototype, ...) で混ぜる前提**のオブジェクトリテラルで、
// `this` は Town を指す。どの順で何を進めるかは Town.js の update() が唯一の記述。

import {
    TOWN_RUBBLE_COLORS, TOWN_DUST_COLOR, PLANT_LEAF_PARTICLE_COLORS, SNOWTREE_PARTICLE_COLORS,
    SNOWTREE_FLURRY_COLORS, ICE_PARTICLE_COLORS,
} from './palette.js';
import { createExplosion, Particle, SnowFlurryParticle } from '../../entities/Particle.js';
import { audioManager } from '../../audio/AudioManager.js';
import {
    VIEW_CULL_MARGIN, TOWN_COLLAPSE_PARTICLES, TOWN_SHATTER_PARTICLES, SNOWTREE_FLURRY_LIFE,
    SNOWTREE_FLURRY_MODES, SNOWTREE_FLURRY_NEEDLE_EVERY, SNOWTREE_FLURRY_BIG_SHARE, ICICLE_POWDER_SIZE,
    ICICLE_POWDER_BIG_SHARE,
} from '../../utils/Constants.js';

// つららの音の注文の種類 → audioManager のメソッド（audio/sounds/icicleSounds.js）
const ICICLE_SOUND_METHODS = { shake: 'playIcicleShake', fall: 'playIcicleFall', sink: 'playIcicleSink' };

export const TownEffects = {
    /**
     * 溜めた注文を出す。画面の中かそのすぐ外（VIEW_CULL_MARGIN）だけ。
     * 崩壊は createExplosion を直接足す（spawnExplosion を通すと town.blast に戻って
     * 崩壊が隣を崩す連鎖が止まらなくなる。spec 2章）。
     * 崩れる音は、画面の近くの崩壊・砕けのうち一番大きい1つだけ鳴らす（グレネード1発で何棟も同時に
     * 崩れても1回。spec 4章「80ms 以内はまとめる」の tick の中の分。tick をまたぐ分は playTownCollapse が見る）
     */
    _flushEffects(game) {
        const cam = game.camera;
        const cv = game.canvas;
        const m = VIEW_CULL_MARGIN;
        let loud = null;
        for (const e of this.effects) {
            if (cam && cv && (e.x < cam.x - m || e.x > cam.x + cv.width + m
                || e.y < cam.y - m || e.y > cam.y + cv.height + m)) continue;
            if (e.type === 'iceSound') {   // つららの音（震え・落下・床に刺さる）。画面の近くのものだけがここへ来る
                audioManager[ICICLE_SOUND_METHODS[e.kind]](e.x);
                continue;
            }
            if ((e.type === 'collapse' || e.type === 'shatter') && e.size > 0 && (!loud || e.size > loud.size)) loud = e;
            if (e.type === 'leaf' && e.flora === 'ice') {
                this._spawnIceShards(game, e);
            } else if (e.type === 'leaf' && e.flora === 'snow') {
                this._spawnSnowFlurry(game, e);
            } else if (e.type === 'leaf') {
                const colors = e.flora === 'snow' ? SNOWTREE_PARTICLE_COLORS : PLANT_LEAF_PARTICLE_COLORS;
                for (let i = 0; i < e.count; i++) {
                    // 見た目だけの粒なので Math.random でよい。土の粒より軽く、ゆっくり落ちる
                    const a = -Math.PI * Math.random();
                    const sp = 0.3 + Math.random() * 1.2;
                    game.particles.push(new Particle(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp,
                        colors[i % colors.length], 1 + Math.random() * 2,
                        20 + Math.floor(Math.random() * 20)));
                }
            } else if (e.type === 'collapse') {
                game.particles.push(...createExplosion(e.x, e.y, TOWN_COLLAPSE_PARTICLES));
            } else {
                const color = TOWN_RUBBLE_COLORS[e.mat] || TOWN_RUBBLE_COLORS[1];
                const n = e.count || TOWN_SHATTER_PARTICLES;
                for (let i = 0; i < n; i++) {
                    // 見た目だけの粒なので Math.random でよい（既存の createExplosion と同じ）
                    const a = -Math.PI * Math.random();
                    const sp = 0.5 + Math.random() * 2;
                    const dust = e.type === 'dust' || i % 3 === 0;
                    game.particles.push(new Particle(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp,
                        dust ? TOWN_DUST_COLOR : color, dust ? 2 + Math.random() * 3 : 1 + Math.random() * 2,
                        20 + Math.floor(Math.random() * 20)));
                }
            }
        }
        if (loud) audioManager.playTownCollapse(loud.size, loud.x);
        this.effects.length = 0;
    },

    _emit(type, x, y, extra = {}) {
        this.effects.push({ type, x, y, ...extra });
    },

    /**
     * 氷の粒（当たって震え始めた hit・落ちて砕けた land・震えの予兆の drip）。見た目だけなので Math.random でよい。
     * hit は少なく控えめ、land は上へ多く散る、drip は 1 粒がほぼ真下へ。上へだけ散らす（床の線の点から下へ散ると岩の中で生まれる）
     */
    _spawnIceShards(game, e) {
        const spread = e.spread ?? 3;
        if (e.mode === 'powder' || e.mode === 'dust') { this._spawnIcePowder(game, e, spread); return; }
        for (let i = 0; i < e.count; i++) {
            const x = e.x + (Math.random() - 0.5) * 2 * spread, y = e.y - Math.random() * spread;
            let vx = 0, vy = 0.2, life = 40, size = 1;
            if (e.mode !== 'drip') {
                const a = -Math.PI * Math.random();
                const sp = e.mode === 'land' ? 0.6 + Math.random() * 1.6 : 0.2 + Math.random() * 0.8;
                vx = Math.cos(a) * sp; vy = Math.sin(a) * sp;
                life = 18 + Math.floor(Math.random() * 20);
                size = 1 + Math.floor(Math.random() * 3);
            }
            game.particles.push(new Particle(x, y, vx, vy, ICE_PARTICLE_COLORS[i % ICE_PARTICLE_COLORS.length], size, life));
        }
    },

    /**
     * つららの粉雪（舞う雪の粒 SnowFlurryParticle。雪の色）。powder: 床にめり込むところから出る大きめの粉雪で、上半分へ舞い上がる。
     * dust: 落ちている間につららの体から出る小さな粉雪で、ほとんど動かず、落ちたあとの筋になって残り、ゆっくり落ちる。
     * 上へだけ散らす（床の線の点から下へ散ると岩の中で生まれる）。見た目だけなので Math.random でよい
     */
    _spawnIcePowder(game, e, spread) {
        const powder = e.mode === 'powder';
        for (let i = 0; i < e.count; i++) {
            const x = e.x + (Math.random() - 0.5) * 2 * spread, y = e.y - Math.random() * spread;
            const a = powder ? -Math.PI * Math.random() : Math.random() * Math.PI * 2;
            const sp = powder ? 0.3 + Math.random() * 1.1 : 0.05 + Math.random() * 0.3;
            const size = powder
                ? (Math.random() < ICICLE_POWDER_BIG_SHARE ? ICICLE_POWDER_SIZE[1] : ICICLE_POWDER_SIZE[0] + Math.floor(Math.random() * (ICICLE_POWDER_SIZE[1] - ICICLE_POWDER_SIZE[0])))
                : 1 + Math.floor(Math.random() * 2);
            const life = SNOWTREE_FLURRY_LIFE[0] + Math.floor(Math.random() * (SNOWTREE_FLURRY_LIFE[1] - SNOWTREE_FLURRY_LIFE[0] + 1));
            game.particles.push(new SnowFlurryParticle(game, x, y, Math.cos(a) * sp, Math.sin(a) * sp,
                SNOWTREE_FLURRY_COLORS[i % SNOWTREE_FLURRY_COLORS.length], size, life));
        }
    },

    /** 落ちる破片の元の建物の flora（葉か雪か）。元の建物が分からなければ葉 */
    _floraOf(piece) {
        const src = piece.sourceId >= 0 ? this.buildings[piece.sourceId] : null;
        return src ? src.flora : 'leaf';
    },

    /**
     * 雪の木の粒（欠けた・倒れた）。舞う雪（SnowFlurryParticle）が大半で、6 粒に 1 粒は針葉の欠片。
     * 動きは出来事の種類（e.mode: hit / shake / puff。Constants.js の SNOWTREE_FLURRY_MODES）で決める。
     * 空気抵抗で止まって、揺れながら落ちる。見た目だけなので Math.random でよい
     */
    _spawnSnowFlurry(game, e) {
        const spread = e.spread ?? 3;
        const mode = SNOWTREE_FLURRY_MODES[e.mode] || SNOWTREE_FLURRY_MODES.hit;
        for (let i = 0; i < e.count; i++) {
            const a = mode.angle[0] + Math.random() * (mode.angle[1] - mode.angle[0]);
            const sp = mode.speed[0] + Math.random() * (mode.speed[1] - mode.speed[0]);
            // 上へだけ散らす（床の線の点から下へ散ると、岩の中で生まれて最初の更新で消える）
            const x = e.x + (Math.random() - 0.5) * 2 * spread, y = e.y - Math.random() * spread;
            if (i % SNOWTREE_FLURRY_NEEDLE_EVERY === SNOWTREE_FLURRY_NEEDLE_EVERY - 1) {
                game.particles.push(new Particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp,
                    SNOWTREE_PARTICLE_COLORS[SNOWTREE_PARTICLE_COLORS.length - 1], ((mode.size[0] + mode.size[1]) / 2) * (0.5 + Math.random()), 20 + Math.floor(Math.random() * 20)));
            } else {
                const life = SNOWTREE_FLURRY_LIFE[0] + Math.floor(Math.random() * (SNOWTREE_FLURRY_LIFE[1] - SNOWTREE_FLURRY_LIFE[0] + 1));
                game.particles.push(new SnowFlurryParticle(game, x, y, Math.cos(a) * sp, Math.sin(a) * sp,
                    SNOWTREE_FLURRY_COLORS[i % SNOWTREE_FLURRY_COLORS.length], Math.random() < SNOWTREE_FLURRY_BIG_SHARE ? mode.size[1] : mode.size[0], life));
            }
        }
    },
};
