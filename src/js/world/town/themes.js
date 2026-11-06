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
//
// **乱数を引く順は表に移す前と同じにしてある**（3面の町並みは実機で詰めた値。1回でも引く順が
// 変わると週ごとの町が全部入れ替わる。tools/trace-map.mjs の指紋で IDENTICAL を確かめた）

import { buildAdobeTower, buildAdobeWallHouse, buildHangingBridge, buildOilJarStore } from './adobe.js';
import { buildMiningShack, buildScaffoldShack, buildLantern, buildHangingShack, buildMiningExplosive } from './mining.js';
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
