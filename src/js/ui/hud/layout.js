// ============================================
// HUD の配置（ゾーン・段・列・ゲージの寸法と色）
// ============================================
//
// もとは ui/HUD.js の冒頭にあった。HUD を層（ui/hud/ の alerts / weapons / units / status）に
// 分けたとき（2026-11-25）、どの層も読むのでここへ出した。値と理由のコメントはそのまま。
// テストと外から読む名前（HUD_MIN_WIDTH / BUFF_SPECS / HUD_BUFF_TICK_COLOR /
// HUD_HP_DAMAGE_COLOR）は今までどおり ui/HUD.js からも import できる。

import { AUTO_AIM_DURATION, AUTO_AIM_MAX_DURATION, OVERDRIVE_DURATION, OVERDRIVE_MAX_DURATION } from '../../utils/Constants.js';

// ============================================
// レイアウト
// ============================================
//
// HUD は「機体 / 武装 / ステータス」の3ゾーンを横に並べた帯。
//
// **縦の区切り線は引かない。** 一度入れたが実機で「機械的で、デザインされていない」
// と却下された。塊はゾーン間の余白（HUD_ZONE_GAP）と、段の高さを3ゾーンで
// 揃えることだけで表す。
//
// **段の中心は3ゾーン共通の固定値。** 以前はゾーンごとに中身を縦中央へ置いていて、
// 段の高さが違うぶん下段の中心が 43.0 / 46.5 / 47.5 とバラつき、ステータスの
// TIME と BONUS が沈んで見えた（実機で指摘された）。
//
// **ゾーン幅は中身の実測から決めてある。** 等幅フォントなので字数×フォント×0.6 で
// 出せる。tests/hud-layout.test.js が「画面幅に収まるか」を毎回確かめる。
export const HUD_PAD = 20;          // 帯の左右の余白
export const HUD_ZONE_GAP = 34;     // ゾーンとゾーンのあいだ。ここが唯一の区切り

/** 段の中心Y。上段 17 / 下段 44。合計 55px で、帯 60px の中でわずかに上寄せになる。 */
export const HUD_ROW1_Y = 17;
export const HUD_ROW2_Y = 44;

export const HUD_ZONE_W = { units: 300, weapons: 573, status: 384 };

/**
 * HUD が成立する最小の画面幅。CANVAS_WIDTH を下げるときの見張りとして
 * tests/hud-layout.test.js が参照する。
 */
export const HUD_MIN_WIDTH =
    HUD_PAD * 2 + HUD_ZONE_W.units + HUD_ZONE_GAP + HUD_ZONE_W.weapons
    + HUD_ZONE_GAP + HUD_ZONE_W.status;

/** 各ゾーンの左端。ステータスの右端も返す（中身は右端揃えで置くため）。 */
export function hudZones(w) {
    const units = HUD_PAD;
    const weapons = units + HUD_ZONE_W.units + HUD_ZONE_GAP;
    const status = weapons + HUD_ZONE_W.weapons + HUD_ZONE_GAP;
    return { units, weapons, status, right: w - HUD_PAD };
}

// --- 機体ゾーン ---
//
// ATTACKER と CARRIER を1本の表として組む。列を固定してあるので、ラベルの
// 字数が違ってもバーの左端と幅が縦に揃う。kits に列を確保してあるので、
// リペアキットが 0 個でも他の要素は動かない。
export const UNIT_COLS = { label: 0, lives: 88, bar: 108, barW: 140, barH: 13, kits: 260 };

// --- 武装ゾーン ---
//
// 1段目は武器の札を3つ。**左の内寸は3状態とも同じ**にしてある（枠 + 余白）。
// 選択中だけ余白を詰めていた頃は、武器を切り替えるたびにラベルが 3px 横に飛んだ。
export const SLOT_BORDER = 3;
export const SLOT_PAD = 10;
export const SLOT_INSET = SLOT_BORDER + SLOT_PAD;  // 字が始まる位置。2段目もここに合わせる
export const SLOT_GAP = 14;                        // 札と札のあいだ

// 2段目のゲージ。**ラベルと自分のバーは近く、組と組は遠く**する。
// 等間隔にしていた頃は、ラベルがどちらのバーに属するのか目で決められなかった
// （とくに AUTO AIM。左隣の HOVER のバーが長いぶん、直後のラベルが宙に浮いた）。
export const GAUGE_TIE = 8;    // 字の右端 → 自分のバーの左端
export const GAUGE_SPLIT = 24; // 組と組のあいだ

export const HOVER_W = 132, HOVER_H = 18;   // 三角形。元は 80x12 で細かった

/**
 * 時限バフのゲージ。**容量ぜんぶを1本にして、ユニット1個ぶんの境目に刻みを入れる。**
 * 塗りの長さ＝残り時間の絶対量、刻みの数＝何個ぶん重ねられるか。
 *
 * units は Constants の値から導く（AUTO AIM は 180秒/60秒=3、OVERDRIVE は 72秒/36秒=2）。
 * 幅は 1個ぶんがどちらも 36px になるように取ってある。同じ長さなら同じ「1個」に
 * 見えるので、2つのバフを同じ物差しで読める。
 */
export const BUFF_UNIT_W = 36;
export const HUD_BUFF_TICK_COLOR = 'rgba(255,255,255,0.42)';
/** ライフの地。受けたダメージがこの赤で残る。 */
export const HUD_HP_DAMAGE_COLOR = '#C41212';
export const BUFF_SPECS = {
    autoAim: {
        label: 'AUTO AIM',
        units: Math.round(AUTO_AIM_MAX_DURATION / AUTO_AIM_DURATION),
        ink: '#FF8A1F', head: '#FFD9B0', dim: '#a5651f',
    },
    overdrive: {
        label: 'OVERDRIVE',
        units: Math.round(OVERDRIVE_MAX_DURATION / OVERDRIVE_DURATION),
        ink: '#FFD62B', head: '#FFF3B8', dim: '#a58a1f',
    },
    barH: 9,
    font: 'bold 10px "Space Mono", monospace',
};

// --- ステータスゾーン ---
//
// 左列に MISSION / TIME（文脈）、右列に SCORE / BONUS（動く数字）。
// TIME をここへ移したのは、得点系の情報だから（以前は帯の左端で、SCORE と
// 画面の端どうしに離れていて視線が往復していた）。
//
// 数字の大きさは SCORE 30 > MISSION 24 > BONUS 21 > TIME 19。BONUS は TIME と
// 同じく刻々と減るので TIME より大きく取ってある。
export const STATUS_COLS = { cap: 0, small: 70, capR: 144, bigR: 0 };
export const HUD_LABEL_FONT = 'bold 10px "Space Mono", monospace';
export const HUD_LABEL_INK = '#5f8f6f';
export const SCORE_FONT = 'bold 30px "Space Mono", monospace';
export const SCORE_INK = '#F4F8F4';    // 白。BONUS の緑→黄→赤と役割を分ける
export const MISSION_FONT = 'bold 24px "Space Mono", monospace';
export const TIME_FONT = 'bold 19px "Space Mono", monospace';
export const TIME_INK = '#E8F0E8';
export const BONUS_FONT = 'bold 21px "Space Mono", monospace';

/** デバッグ札のX。ステータスゾーンの左側の余りに置く。 */
export const DEBUG_BADGE_DX = 0;
