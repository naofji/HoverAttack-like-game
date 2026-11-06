// ============================================
// themes - 町の絵柄の表
// ============================================
//
// 設計: docs/superpowers/specs/2026-11-07-stage6-factory-design.md
// 置き方（床・壁・天井・爆発物の脇置き）は generate.js の1本だけで、面ごとの違いは
// 「どの build 関数で建てるか」だけ。その違いをここの表の1行に出す（CLAUDE.md の
// 「違いは表の1行に、手順は1本」）。
//
// 行の形:
//   wide / narrow … 天井の高い広い所に多い系統 / 狭い所に多い系統（adobeShare の確率で wide を選ぶ）
//   floor(style, rng, { maxW, maxH })    … 床の建物。{ kind, w, h, footX, footW, parts, insets? } | null
//   wall(style, rng, { maxReach })       … 壁の右側に張り付く向き（左の壁には generate が反転）。x 0〜4 が壁に埋まる
//   ceiling(style, rng, { room, maxHang }) … 上端 4px が天井に埋まる。room は右の天井の残り（px）
//   explosive(style, rng)                … 床の建物の脇に置く爆発物。下端 4px が床に埋まる
//   ceilingBoost（省略可）               … 天井に吊るす数の倍率。村の濃さに掛ける（省略 = 1）
//   explosiveBlast（省略可）             … 爆発物の爆発の種類（TOWN_EXPLOSIVE_PROFILES のキー。省略 = 'town'）
//
// **乱数を引く順は表に移す前と同じにしてある**（3面の町並みは実機で詰めた値。1回でも引く順が
// 変わると週ごとの町が全部入れ替わる。tools/trace-map.mjs の指紋で IDENTICAL を確かめた）

import { buildAdobeTower, buildAdobeWallHouse, buildHangingBridge, buildOilJarStore } from './adobe.js';
import { buildMiningShack, buildScaffoldShack, buildLantern, buildHangingShack, buildMiningExplosive } from './mining.js';
import { buildBaseBuilding, buildControlRoom, buildCrane, buildFactoryLamp } from './militaryBase.js';
import { buildMachine, buildWallPipes, buildPipeBundle, buildFactoryExplosive } from './factory.js';
import { step4 } from './shapes.js';

/** 3面: A（日干し煉瓦の塔の町）と C（坑道の町） */
export const TOWN_THEME = {
    wide: 'A',
    narrow: 'C',
    floor: (style, rng, size) => (style === 'A' ? buildAdobeTower(rng, size) : buildMiningShack(rng, size)),
    wall: (style, rng, size) => (style === 'A' ? buildAdobeWallHouse(rng, size) : buildScaffoldShack(rng, size)),
    ceiling(style, rng, { room, maxHang }) {
        if (style === 'A' && room >= 64 && rng.next() < 0.5) {
            return buildHangingBridge(rng, { span: step4(rng, 64, Math.min(160, room)), maxHang });
        }
        if (style === 'C' && rng.next() < 0.4) return buildHangingShack(rng, { maxHang });
        return buildLantern(rng, { maxHang });
    },
    explosive: (style, rng) => (style === 'A' ? buildOilJarStore(rng) : buildMiningExplosive(rng)),
};

/**
 * 6面: B（基地。倉庫・格納庫・監視塔・レーダー・工場棟）と F（工場。工作機械・化学タンク）。
 * 工場を P にしなかったのは、4面の植物の style が既に 'P'（plant）だから（面は違うが、読み違えのもと）。
 * 天井は3面の吊り橋の位置にクレーン（広い天井だけ）、吊り小屋の位置に配管の束、ランタンの位置に照明。
 * クレーン 0.8・配管の束 0.75（3面の吊り橋 0.5・吊り小屋 0.4）: 照明より多く出して、ユーザーの「天井から吊り下げた
 * クレーンやパイプが絡み合った化学工場」を目立たせる（ceilingBoost と同じ理由）。
 * 爆発物は系統によらず同じ（化学タンク・ボンベの束・ドラム缶。基地にも燃料は置く）
 */
export const FACTORY_THEME = {
    wide: 'B',
    narrow: 'F',
    // 天井に吊るす数の倍率（村の濃さに掛ける。3面は省略 = 1）。ユーザーが最初に挙げたのが「天井から吊り下げた
    // クレーンやパイプ」なので6面だけ増やす。6シードの実測で、倍率 1 のとき天井のものは1面あたり約9個（クレーン 1.5）
    // しかなく、2 で約13個。3 にしても候補の天井（TOWN_CEIL_MIN_RUN / _DROP）が尽きて照明ばかり増えた
    ceilingBoost: 2,


    floor: (style, rng, size) => (style === 'B' ? buildBaseBuilding(rng, size) : buildMachine(rng, size)),
    wall: (style, rng, size) => (style === 'B' ? buildControlRoom(rng, size) : buildWallPipes(rng, size)),
    ceiling(style, rng, { room, maxHang }) {
        if (style === 'B' && room >= 64 && rng.next() < 0.8) {
            return buildCrane(rng, { span: step4(rng, 64, Math.min(160, room)), maxHang });
        }
        if (style === 'F' && rng.next() < 0.75) return buildPipeBundle(rng, { room, maxHang });
        return buildFactoryLamp(rng, { maxHang });
    },
    explosive: (style, rng) => buildFactoryExplosive(rng),
    // 爆発物の爆発の種類（Constants.js の TOWN_EXPLOSIVE_PROFILES）。工場は可燃物が多いのでグレネードと同じ派手な爆発
    explosiveBlast: 'factory',
};
