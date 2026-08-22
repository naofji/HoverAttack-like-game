// ============================================
// Orbit Shield - 6面以降の敵基地コアを守る周回シールドの幾何
// ============================================
// コア中心を通る**鉛直軸**のまわりを羽根が回る。それを真横から見た平行投影として
// 扱うので、必要なのは位相 θ ひとつだけ:
//
//   画面上の横ずれ  dx    = radius * sin θ
//   奥行き          depth = cos θ      （正なら手前 / 負なら奥）
//
// 描画は depth の符号で「コアより先に描く / 後に描く」を分けるだけで立体に見える。
//
// ガードが成立するのは羽根が軌道の**左右の端**にいるとき、つまりプレイヤーと
// コアを結ぶ線上に羽根が入り込んだとき。端に近いほど cos θ は 0 に近づくので、
// 判定は |cos θ| のしきい値ひとつで書ける（下の isGuardAngle を参照）。
//
// EnemyBase から幾何だけを切り出してあるのは、canvas も game も要らずに
// node --test で角度と境界を直接押さえるため。

/**
 * 羽根それぞれの位相。等間隔に配置する。
 * @param {number} phase 先頭の羽根の位相（rad）
 * @param {number} panels 羽根の枚数
 * @returns {number[]}
 */
export function panelAngles(phase, panels) {
    const step = (Math.PI * 2) / panels;
    const out = [];
    for (let i = 0; i < panels; i++) out.push(phase + i * step);
    return out;
}

/** 画面上の横ずれ。位相90°で軌道の右端（+radius）。 */
export function panelOffsetX(angle, radius) {
    return Math.sin(angle) * radius;
}

/** 奥行き。正なら手前（コアより後に描く）、負なら奥（コアより先に描く）。 */
export function panelDepth(angle) {
    return Math.cos(angle);
}

/**
 * この羽根が今ガードしているか。
 *
 * 端（±90°）からの角度差を φ とすると cos θ = sin φ なので、
 * 「φ が guardHalf 以内」は「|cos θ| ≤ sin(guardHalf)」と同じ。
 * 三角関数の逆関数を使わずに済むぶん素直で、境界も一意に決まる。
 *
 * @param {number} guardHalf ガード窓の半角（rad）。大きいほど防御時間が長い
 */
export function isGuardAngle(angle, guardHalf) {
    return Math.abs(Math.cos(angle)) <= Math.sin(guardHalf);
}

/**
 * 被弾がガードされるか。
 *
 * @param {number[]} angles 全ての羽根の位相
 * @param {number} dx 被弾点のコア中心からの横ずれ（正＝右から来た）
 * @param {number} guardHalf ガード窓の半角（rad）
 * @returns {boolean} 攻撃が来た側にガード中の羽根がいれば true
 */
export function guardBlocks(angles, dx, guardHalf) {
    // 真上・真下（dx === 0）は右側扱いに倒す。鉛直軸まわりの羽根に真上から
    // 撃ち込む理屈なら通るべきだが、周回シールドが関わるのは「とどめの1発」
    // だけなので、抜け道を作るより単純に弾く側へ寄せている
    const side = dx >= 0 ? 1 : -1;
    for (const a of angles) {
        if (!isGuardAngle(a, guardHalf)) continue;
        if ((Math.sin(a) >= 0 ? 1 : -1) === side) return true;
    }
    return false;
}

/**
 * 展開の進み具合を 0..1 に均す（ease-out）。
 *
 * せり出しは「勢いよく出て、最後に落ち着く」方が機械らしく見えるので
 * 二次の ease-out にした。半径と回転速度の両方をこれで立ち上げる。
 */
export function deployEase(progress) {
    const p = Math.min(1, Math.max(0, progress));
    return 1 - (1 - p) * (1 - p);
}
