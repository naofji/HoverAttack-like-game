// ============================================
// CaveBackdrop - 視差スクロールする遠景の洞窟レイヤー
// ============================================
//
// マップ生成時に遠景を1枚のオフスクリーンcanvasへ描き切り、
// 以後は毎フレーム drawImage 1回で可視矩形を転送するだけにする。
// カメラ可動範囲の FAR_BG_PARALLAX 倍しか流れないため、canvas は
// 前景のタイルキャッシュよりずっと小さくて済む。

import {
    CANVAS_WIDTH, CANVAS_HEIGHT,
    HUD_TOP_HEIGHT, HUD_BOTTOM_HEIGHT,
    FAR_BG_PARALLAX,
    FOG_COLOR,
} from '../utils/Constants.js';
import { lerpColor } from '../utils/color.js';

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

// --- 遠景の階調 ---
// 3階調だけ使う。前景 (Map._drawRockyBlock) が5段階の量子化した陰影で描かれるのに対し
// 階調を粗くすることで「遠い」と読ませる。両側に外れると壊れるため
// (暗すぎれば黒一色、明るすぎれば前景のシルエットと競合)、
// tests/cave-backdrop.test.js の輝度テストが上下限を守っている。
const VOID_DARKEN = 0.90;       // 空洞: パレット色を黒へ寄せる割合
const ROCK_DARK_DARKEN = 0.82;  // 岩の陰
const ROCK_LIGHT_DARKEN = 0.72; // 岩の上端ハイライト

/**
 * backdrop ごとの色の寄せ先と割合。3階調ぶんまとめて同じ方向へ寄せる
 * （3色の相対関係は変えず、全体をずらすだけにすることで階調テストの
 * 「並び・構造差」の判定に影響しないようにする）。
 * k は 7パレット×5backdrop=35通りぜんぶで階調テスト（void ≥ 3、構造差 6〜30、
 * rockLight ≤ 前景の 0.45）を満たすところまで実測して詰めた値（tools 化はせず、
 * 一時スクリプトで全パレット×候補kを総当たりして最小の合格値を採用）。
 * - wet: 0.25 で全パレット通過（青黒方向は暗い側へ寄るので rockLight の上限に強い）
 * - snow: 明るい '#BFD4E6' へ寄せるため rockLight が前景比 0.45 の上限に一番当たりやすい。
 *   0.10 では Brown/Sienna/CafeNoir/DarkSlateBlue の4パレットで超過。0.04 まで下げて全通過
 * - fog: FOG_COLOR(#8A96A8) は中間輝度だが3色とも底上げするため、0.08 でも
 *   全パレットで rockLight が前景比0.45を超過。0.06 まで下げて全通過
 * - machine: 無彩色の暗いグレーへ寄せる。0.20 で全通過（暗方向なので wet と同様に強い）
 */
const BACKDROP_TINT = {
    cave: null,
    wet: { to: '#0A2A40', k: 0.25 },      // 湿った岩: 青黒へ
    snow: { to: '#BFD4E6', k: 0.04 },     // 雪: 青白く、ほんの少し明るく
    fog: { to: FOG_COLOR, k: 0.06 },      // 霧: コントラストを落とす（3階調とも同じ方向へ寄せる）
    machine: { to: '#20242C', k: 0.20 },  // 機械: 無彩色の暗いグレーへ
};

/**
 * ステージパレット色から遠景の3階調を導出する。
 * @param {string} paletteFill ステージパレットの fill 色 (#rrggbb)
 * @param {string} [backdrop] 'cave' | 'wet' | 'snow' | 'fog' | 'machine'
 * @returns {{voidColor:string, rockDark:string, rockLight:string}}
 */
export function backdropColors(paletteFill, backdrop = 'cave') {
    const base = {
        voidColor: lerpColor(paletteFill, '#000000', VOID_DARKEN),
        rockDark: lerpColor(paletteFill, '#000000', ROCK_DARK_DARKEN),
        rockLight: lerpColor(paletteFill, '#000000', ROCK_LIGHT_DARKEN),
    };
    const tint = BACKDROP_TINT[backdrop];
    if (!tint) return base;
    return {
        voidColor: lerpColor(base.voidColor, tint.to, tint.k),
        rockDark: lerpColor(base.rockDark, tint.to, tint.k),
        rockLight: lerpColor(base.rockLight, tint.to, tint.k),
    };
}

// --- 遠景の形状パラメータ ---
// 前景と同じ「フラット塗りの角ばった多角形」だけで描く。グラデーションと
// 1-2px の細片は使わない (前景はハードエッジのみ、最小ディテールは4px)。
const BAND_SPACING = 260;         // この間隔ごとに岩の層を1枚
const BAND_THICKNESS_MIN = 70;
const BAND_THICKNESS_RANGE = 90;  // 層の厚み 70〜160px
const SEGMENT_WIDTH = 96;         // 折れ線1区間の幅 = 前景タイル(16px)の6倍
const EDGE_JITTER = 34;           // 折れ線のY揺らぎ幅
const HIGHLIGHT_THICKNESS = 14;   // 層の上端に乗せるハイライト帯の厚み

const SPIKE_CHANCE = 0.45;        // 区間ごとに鍾乳石が生える確率
const SPIKE_HALF_WIDTH = 22;
const SPIKE_HALF_WIDTH_SNOW = 8;  // 雪は氷柱として細く見せる（つらら）
const SPIKE_LENGTH_MIN = 36;
const SPIKE_LENGTH_RANGE = 90;    // 鍾乳石の長さ 36〜126px

export class CaveBackdrop {
    /**
     * @param {number} mapWidth   マップ全体の幅 (px)
     * @param {number} mapHeight  マップ全体の高さ (px)
     * @param {string} paletteFill ステージパレットの fill 色 (#rrggbb)
     * @param {SeededRNG} rng     マップ生成と共有する乱数源
     * @param {string} [backdrop] 'cave' | 'wet' | 'snow' | 'fog' | 'machine'
     */
    constructor(mapWidth, mapHeight, paletteFill, rng, backdrop = 'cave') {
        // Camera._clamp() と同一のカメラ可動範囲
        this.camXMin = 0;
        this.camXMax = mapWidth - CANVAS_WIDTH;
        this.camYMin = -HUD_TOP_HEIGHT;
        this.camYMax = mapHeight - CANVAS_HEIGHT + HUD_BOTTOM_HEIGHT;

        // 転送元計算と丸めを揃えるため floor を使う。
        // これで sourceX(camXMax) === width - CANVAS_WIDTH が厳密に成立する。
        this.width = Math.floor((this.camXMax - this.camXMin) * FAR_BG_PARALLAX) + CANVAS_WIDTH;
        this.height = Math.floor((this.camYMax - this.camYMin) * FAR_BG_PARALLAX) + CANVAS_HEIGHT;

        this.paletteFill = paletteFill;
        this.backdrop = backdrop;

        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;

        this._generate(this.canvas.getContext('2d'), paletteFill, rng);
    }

    /**
     * 遠景を1回だけ描き切る。空洞を塗り、その上に岩の層を重ねる。
     * 前景と同じ描画言語 — フラット塗りの角ばった多角形だけ — を使う。
     * グラデーションも1-2pxの細片も使わない (ドット絵の前景から浮くため)。
     * @param {CanvasRenderingContext2D} ctx
     * @param {string} paletteFill ステージパレットの fill 色
     * @param {SeededRNG} rng
     */
    _generate(ctx, paletteFill, rng) {
        const W = this.width;
        const H = this.height;

        this.colors = backdropColors(paletteFill, this.backdrop);
        const { voidColor, rockDark, rockLight } = this.colors;

        // 1) 空洞
        ctx.fillStyle = voidColor;
        ctx.fillRect(0, 0, W, H);

        // 2) 岩の層。層と層の間が空洞として抜けて見える。
        const bandCount = Math.max(1, Math.round(H / BAND_SPACING));
        for (let b = 0; b < bandCount; b++) {
            const centerY = ((b + 0.5) / bandCount) * H;
            this._drawRockBand(ctx, rng, centerY, rockDark, rockLight, this.backdrop);
        }

        // 3) backdrop ごとの装飾。岩層の間（空洞の帯）に描く。
        if (this.backdrop === 'wet') this._drawWetDecor(ctx, rng, W, H);
        if (this.backdrop === 'machine') this._drawMachineDecor(ctx, rng, W, H, bandCount);
    }

    /**
     * 岩の層を1枚描く。上端・下端とも折れ線で、下端からは鍾乳石が垂れる。
     * 上端にだけハイライト帯を乗せ、光が上から来ている印象を作る。
     * @param {CanvasRenderingContext2D} ctx
     * @param {SeededRNG} rng
     * @param {number} centerY 層の中心Y
     * @param {string} rockDark 岩の陰の色
     * @param {string} rockLight 岩の上端ハイライトの色
     * @param {string} [style] backdrop 種別。'snow' のときだけハイライト帯と
     *   鍾乳石（氷柱として細く）の見た目を変える。
     */
    _drawRockBand(ctx, rng, centerY, rockDark, rockLight, style = 'cave') {
        const isSnow = style === 'snow';
        const spikeHalfWidth = isSnow ? SPIKE_HALF_WIDTH_SNOW : SPIKE_HALF_WIDTH;
        // 雪はハイライト帯を積雪の白へ寄せる（SNOW_CAP_COLOR に近い色）。
        // 実機の指摘: 5面の遠景が目立ちすぎる。白い帯は前景と競合するため
        // 明度・彩度を落とす（0.5 → 仕様書指定の 0.12）。
        // fix round 1: 装飾色の輝度ルールは「backdrop × 全パレット」の総当たりではなく
        // 「実際にその backdrop を使う面のパレットに対してだけ」縛るのが正しい
        // （STAGE_ENVIRONMENTS[i].backdrop は STAGE_PALETTES[i] としか組まない）。
        // 雪(snow)を使うのは5面 SteelBlue(#4682B4) だけなので、それに対して詰め直す:
        // 0.12 では前景輝度0.45倍の上限(54.4)を超える(輝度65.96)ため、
        // 上限ぎりぎりまで戻して 0.06（輝度53.75 ≤ cap 54.38）にした。
        const highlightColor = isSnow ? lerpColor(rockLight, '#FFFFFF', 0.06) : rockLight;
        const segCount = Math.ceil(this.width / SEGMENT_WIDTH) + 1;
        const thickness = BAND_THICKNESS_MIN + rng.next() * BAND_THICKNESS_RANGE;

        // 折れ線の頂点。頂点間隔が前景タイルの6倍なので、遠景ほど形が大きく単純に見える。
        const top = [];
        const bottom = [];
        for (let i = 0; i < segCount; i++) {
            top.push(centerY - thickness / 2 + (rng.next() - 0.5) * EDGE_JITTER);
            bottom.push(centerY + thickness / 2 + (rng.next() - 0.5) * EDGE_JITTER);
        }

        // 区間ごとの鍾乳石の長さ (0 なら生えない)
        const spikes = [];
        for (let i = 0; i < segCount - 1; i++) {
            spikes.push(rng.next() < SPIKE_CHANCE
                ? SPIKE_LENGTH_MIN + rng.next() * SPIKE_LENGTH_RANGE
                : 0);
        }

        // 岩本体: 上端を左→右、下端を右→左に辿り、途中で鍾乳石の頂点を差し込む
        ctx.fillStyle = rockDark;
        ctx.beginPath();
        ctx.moveTo(0, top[0]);
        for (let i = 1; i < segCount; i++) ctx.lineTo(i * SEGMENT_WIDTH, top[i]);
        ctx.lineTo((segCount - 1) * SEGMENT_WIDTH, bottom[segCount - 1]);
        for (let i = segCount - 2; i >= 0; i--) {
            const len = spikes[i];
            if (len > 0) {
                const midX = (i + 0.5) * SEGMENT_WIDTH;
                const baseY = (bottom[i] + bottom[i + 1]) / 2;
                ctx.lineTo(midX + spikeHalfWidth, baseY);
                ctx.lineTo(midX, baseY + len);
                ctx.lineTo(midX - spikeHalfWidth, baseY);
            }
            ctx.lineTo(i * SEGMENT_WIDTH, bottom[i]);
        }
        ctx.closePath();
        ctx.fill();

        // 上端のハイライト帯
        ctx.fillStyle = highlightColor;
        ctx.beginPath();
        ctx.moveTo(0, top[0]);
        for (let i = 1; i < segCount; i++) ctx.lineTo(i * SEGMENT_WIDTH, top[i]);
        for (let i = segCount - 1; i >= 0; i--) {
            ctx.lineTo(i * SEGMENT_WIDTH, top[i] + HIGHLIGHT_THICKNESS);
        }
        ctx.closePath();
        ctx.fill();
    }

    /** 湿った岩: 下部の暗い帯と、ところどころの滴りの筋（4px 幅。細片は使わない）。 */
    _drawWetDecor(ctx, rng, W, H) {
        ctx.fillStyle = lerpColor(this.colors.voidColor, '#000000', 0.5);
        ctx.fillRect(0, H * 0.8, W, H * 0.2);
        // 実機の指摘: 滴りの水色が明るすぎて前景と競合する。#4FA3E0 寄せ 0.4 から
        // 仕様書指定の #3A6A90 寄せ 0.3 へ変更。
        // fix round 1: wet(滴り)を使うのは4面 SeaGreen(#2E8B57) だけなので、それに
        // 対して詰め直す（backdrop×全パレットの総当たりは過剰だった）。
        // 0.3 では前景輝度0.45倍の上限(52.0)を超える(輝度53.28)ため、
        // 上限ぎりぎりまで戻して 0.27（輝度51.42 ≤ cap 51.96）にした。
        ctx.fillStyle = lerpColor(this.colors.rockLight, '#3A6A90', 0.27);
        for (let x = 0; x < W; x += 96) {
            if (rng.next() < 0.5) continue;
            const len = 30 + rng.next() * 80;
            ctx.fillRect(x + rng.next() * 60, H * 0.3 + rng.next() * H * 0.4, 4, len);
        }
    }

    /** 洞窟を改造した要塞: 岩層の間に配管・隔壁パネル・桁・ランプの列。岩は残す。 */
    _drawMachineDecor(ctx, rng, W, H, bandCount) {
        // 実機の指摘: 配管・ランプが明るすぎて前景と競合する。
        // 仕様書指定は steel #3A4250 / steelDark #262C36 / lamp #6E5A2E だが、
        // fix round 1: machine を使うのは7面 DarkSlateBlue(#483D8B) だけなので、
        // それに対して詰め直す（backdrop×全パレットの総当たりは過剰だった。
        // 特に lamp は G 成分の輝度重み0.7152のため、素朴な琥珀色は見た目以上に
        // 「明るい」と判定され、Brown 等の暗いパレットを基準にすると必要以上に
        // 暗くなってしまっていた）。前景輝度0.45倍の上限(31.0)に対し、
        // 各色を仕様書の値からスケールダウンして上限ぎりぎりまで詰めた:
        // steel #1A1E24(lum 29.6, 仕様書比45%) / steelDark #111418(lum 19.7, 同45%) /
        // lamp #251C0C(lum 28.8, 仕様書比16%)。
        const steel = '#1A1E24';
        const steelDark = '#111418';
        const lamp = '#251C0C';
        for (let b = 0; b < bandCount - 1; b++) {
            // 層と層の間の空洞の中心
            const gapY = ((b + 1) / bandCount) * H;
            // 配管: 太さ12。96px ごとに継ぎ手
            ctx.fillStyle = steel;
            ctx.fillRect(0, gapY - 6, W, 12);
            ctx.fillStyle = steelDark;
            for (let x = 0; x < W; x += 96) ctx.fillRect(x, gapY - 9, 8, 18);
            // 隔壁パネル: 区間ごとに確率で
            for (let x = 0; x < W; x += 192) {
                if (rng.next() < 0.5) continue;
                ctx.fillStyle = steelDark;
                ctx.fillRect(x + 20, gapY + 14, 120, 40);
                ctx.fillStyle = steel;
                ctx.fillRect(x + 24, gapY + 18, 112, 32);
            }
            // 桁: 縦の柱と X ブレース（多角形の塗りだけ）
            ctx.fillStyle = steel;
            for (let x = 48; x < W; x += 256) {
                ctx.fillRect(x, gapY - 60, 10, 120);
            }
            // ランプの列: 64px ごとに 4px の点
            ctx.fillStyle = lamp;
            for (let x = 32; x < W; x += 64) ctx.fillRect(x, gapY - 20, 4, 4);
        }
    }

    /** カメラX → 転送元X (整数, canvas内に収まるようクランプ) */
    sourceX(camX) {
        const raw = Math.floor((camX - this.camXMin) * FAR_BG_PARALLAX);
        return clamp(raw, 0, this.width - CANVAS_WIDTH);
    }

    /** カメラY → 転送元Y (整数, canvas内に収まるようクランプ) */
    sourceY(camY) {
        const raw = Math.floor((camY - this.camYMin) * FAR_BG_PARALLAX);
        return clamp(raw, 0, this.height - CANVAS_HEIGHT);
    }

    /**
     * 遠景の可視矩形をブロック転送する。
     * ctx は translate(-camX, -camY) 済みのため、転送先はワールド座標を指定する。
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} camX 補間済みカメラX
     * @param {number} camY 補間済みカメラY
     */
    draw(ctx, camX, camY) {
        ctx.drawImage(
            this.canvas,
            this.sourceX(camX), this.sourceY(camY), CANVAS_WIDTH, CANVAS_HEIGHT,
            camX, camY, CANVAS_WIDTH, CANVAS_HEIGHT
        );
    }
}
