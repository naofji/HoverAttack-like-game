// ============================================
// UI Theme - 「80年代をベースに未来を辿った」画面のための規律
// ============================================
// 元の ScreenRenderer.js は色を52種類・文字サイズを16段階その場で選んでいた。
// 1回しか使われない色が大半で、#e8e8e8 / #eaeaea / #eeeeee のように目で
// 区別できないものが並んでいた。階層が読めないのが「醜い」の主因。
//
// 方向性は「当時の実機の再現」ではなく「当時の人が想像した未来の画面」。
// したがってグローや走査線はむしろ主役として使う。ただし無秩序にかけず、
// 段階を決めて意味のあるところにだけ効かせる。
//
// 逆に、角丸（roundRect）とグレーのグラデーションは 2010年代の Web UI の語彙で、
// 80年代でも未来でもない。角を落とすなら角丸ではなく面取り（斜めに切る）を使う。
//
// 色相は既存のまま（緑・琥珀・シアン）。近すぎる値を畳み、背景と本文にだけ
// わずかな青みを入れて CRT の黒に寄せている。

/** UI の色。ゲーム内キャラクターの色はここではなく Constants / 各エンティティ側。 */
export const UI = {
    bg: '#05070D',          // 純黒より僅かに青い＝CRTの黒
    panelFill: '#0A1020',
    panelHead: '#12213A',
    border: '#2A6FB0',
    borderDim: '#14375A',

    ink: '#E8F4FF',         // 本文（純白より僅かに青い）
    dim: '#8299B2',         // 副次的な本文
    faint: '#3A4A5E',       // 補助・非選択

    ok: '#00FF66',          // 主見出し（緑）
    accent: '#FFCC00',      // 見出し・強調（琥珀）
    info: '#00CCFF',        // 補助情報（シアン）
    warn: '#FF3B5C',        // 警告

    gold: '#FFD700',        // 1位
    silver: '#CCCCCC',      // 2位
    bronze: '#CD7F32',      // 3位
};

const FAMILY = '"Space Mono", monospace';

/**
 * 文字スケール。6段階に固定する。
 * 元は 9/11/13/14/15/16/17/18/19/20/24/28/30/34/36/40 の16段階で、
 * 13〜20px に8段階が密集していたため大小の差が意味を持っていなかった。
 */
export const SIZE = {
    title: 36,
    head: 24,
    sub: 18,
    body: 16,
    small: 13,
    micro: 11,
};

/**
 * ctx.font 用の文字列。
 * @param {keyof SIZE} step
 * @param {boolean} [bold]
 */
export function font(step, bold = false) {
    return `${bold ? 'bold ' : ''}${SIZE[step]}px ${FAMILY}`;
}

/** 行送り。等幅フォントを行グリッドに乗せるための標準値。 */
export function lineHeight(step) {
    return Math.round(SIZE[step] * 1.45);
}

/**
 * 発光の段階。元は shadowBlur が 10箇所でバラバラの強さだった。
 * soft = 補助的な強調 / mid = 見出し / hard = 画面の主役（点滅プロンプト等）
 */
export const GLOW = { soft: 6, mid: 12, hard: 20 };

/**
 * 以降の描画に発光を乗せる。ctx.save()/restore() は呼び出し側の責任。
 * @param {keyof GLOW} level
 */
export function glow(ctx, color, level = 'mid') {
    ctx.shadowColor = color;
    ctx.shadowBlur = GLOW[level];
}

/** 発光を切る。同じ save() スコープ内で続けて非発光のものを描くとき用。 */
export function noGlow(ctx) {
    ctx.shadowBlur = 0;
}

/**
 * 面取りした矩形のパスを引く（角丸ではなく斜めに切り落とす）。
 * 角丸は Web UI の語彙で浮くため、この方向では使わない。
 */
export function chamferPath(ctx, x, y, w, h, cut) {
    const c = Math.min(cut, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + c, y);
    ctx.lineTo(x + w - c, y);
    ctx.lineTo(x + w, y + c);
    ctx.lineTo(x + w, y + h - c);
    ctx.lineTo(x + w - c, y + h);
    ctx.lineTo(x + c, y + h);
    ctx.lineTo(x, y + h - c);
    ctx.lineTo(x, y + c);
    ctx.closePath();
}

/**
 * 面取りフレーム。塗りと発光は任意。
 * @param {object} [opts]
 * @param {string} [opts.fill] 内側の塗り
 * @param {keyof GLOW} [opts.glow] 枠にかける発光
 * @param {number} [opts.cut] 面取り量
 * @param {number} [opts.lineWidth]
 */
export function drawFrame(ctx, x, y, w, h, color, opts = {}) {
    const { fill = null, glow: level = null, cut = 10, lineWidth = 1 } = opts;
    ctx.save();
    if (fill) {
        chamferPath(ctx, x, y, w, h, cut);
        ctx.fillStyle = fill;
        ctx.fill();
    }
    if (level) glow(ctx, color, level);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    chamferPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, cut);
    ctx.stroke();
    ctx.restore();
}

/**
 * 見出し付きのパネル。面取りフレーム＋ヘッダ帯。
 * 角丸・半透明・グラデーションは使わない。
 */
export function drawPanel(ctx, x, y, w, h, title, titleColor = UI.accent) {
    drawFrame(ctx, x, y, w, h, UI.border, { fill: UI.panelFill, cut: 12 });

    if (!title) return;
    const headH = 30;
    ctx.save();
    ctx.fillStyle = UI.panelHead;
    ctx.fillRect(x + 6, y + 6, w - 12, headH);
    ctx.strokeStyle = UI.borderDim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 6, y + 6 + headH + 0.5);
    ctx.lineTo(x + w - 6, y + 6 + headH + 0.5);
    ctx.stroke();

    ctx.fillStyle = titleColor;
    ctx.font = font('sub', true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    glow(ctx, titleColor, 'soft');
    ctx.fillText(title, x + w / 2, y + 6 + headH / 2);
    ctx.restore();
}

/**
 * キーキャップ。グレーのグラデーションと影をやめ、
 * 暗い下地＋発光する縁という「未来のコンソール」寄りの見せ方にする。
 * @returns {number} 描いた幅（呼び出し側のレイアウト用）
 */
export function drawKeyCap(ctx, x, y, text) {
    ctx.save();
    ctx.font = font('small', true);
    const w = Math.max(ctx.measureText(text).width + 20, 40);
    const h = 26;
    const rx = x - w;
    const ry = y - h / 2;

    drawFrame(ctx, rx, ry, w, h, UI.info, { fill: UI.panelHead, cut: 5 });

    ctx.fillStyle = UI.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, rx + w / 2, ry + h / 2);
    ctx.restore();
    return w;
}

/**
 * 走査線。画面全体に薄い横縞を重ねて CRT 感を出す。
 * 情報の可読性を落とさないよう、間隔は広めで濃度は低く。
 */
export function drawScanlines(ctx, w, h, spacing = 3, alpha = 0.10) {
    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    for (let y = 0; y < h; y += spacing) ctx.fillRect(0, y, w, 1);
    ctx.restore();
}

/**
 * ランキング3画面の階調。ブロンズ／シルバー／ゴールドで格の違いを示す
 * （設計: docs/superpowers/specs/2026-07-17-ranking-screens-tiered-theme-design.md）。
 * 意図のある色分けなのでパレットに畳まず、名前を付けてここに集約する。
 */
export const TIER = {
    local: {
        bg: '#120B04', title: '#CD7F32', subtitle: '#9C6B34',
        rowBright: '#F0AE6A', rowDim: '#7A5228',
    },
    global: {
        bg: '#080B0F', title: '#D8DEE6', subtitle: '#95A0AB',
        rowBright: '#FFFFFF', rowDim: '#5F6B78',
    },
    fame: {
        bg: '#17102B', title: '#FFD700', subtitle: '#C9A94A',
        rowBright: '#FFE680', rowDim: '#9C7A26',
    },
};

/** ランキング行のハイライト（自分の記録の点滅）。 */
export const ROW_HIGHLIGHT = '#FF00E5';
