// ============================================
// shellBallistics - スパイダーの弾の弧の逆算
// ============================================
//
// 初速を固定して、狙いの点（自機の頭上）を通る角度を求める。初速を変えずに角度で合わせるのは、
// 「グレネードより速く、緩やかな放物線」（ユーザー指定）の見た目を距離によらず保つため。
// 解は2つあり、**低い方（平らな弧）**を選ぶ。高い方は山なりになって指定の見た目から外れる。
//
// 座標は canvas と同じ y が下向き。重力は毎フレーム vy += gravity。

/**
 * @param {number} dx 発射点から狙いの点までの横の距離
 * @param {number} dy 縦の距離（下が正）
 * @param {number} speed 初速（px/フレーム）
 * @param {number} gravity 重力（px/フレーム²）
 * @returns {{angle:number, frames:number}|null} 角度（canvas の向き、ラジアン）と、着くまでのフレーム数。届かなければ null
 */
export function solveLaunch(dx, dy, speed, gravity) {
    const v2 = speed * speed;
    const X = Math.abs(dx);
    const Y = -dy; // 上を正にした高さ
    if (X < 1e-6) {
        // 真上・真下。tan の式は X で割るので別に解く
        if (Y > 0) {
            const disc = v2 - 2 * gravity * Y;
            if (disc < 0) return null;
            return { angle: -Math.PI / 2, frames: Math.max(1, Math.round((speed - Math.sqrt(disc)) / gravity)) };
        }
        const t = (-speed + Math.sqrt(v2 + 2 * gravity * -Y)) / gravity;
        return { angle: Math.PI / 2, frames: Math.max(1, Math.round(t)) };
    }
    const disc = v2 * v2 - gravity * (gravity * X * X + 2 * Y * v2);
    if (disc < 0) return null;
    const phi = Math.atan((v2 - Math.sqrt(disc)) / (gravity * X)); // 低い方の仰角
    const frames = Math.max(1, Math.round(X / (speed * Math.cos(phi))));
    const angle = dx >= 0 ? -phi : Math.PI + phi;
    return { angle, frames };
}

/**
 * 弾の update() と同じ順（vy += g → x += vx; y += vy）で、frames 回ぶんの位置を並べる。
 * 撃つ前に軌道が岩に当たらないかを見るのと、テストが使う。
 * @returns {Array<{x:number, y:number}>}
 */
export function simulateShell(x, y, angle, speed, gravity, frames) {
    let vx = Math.cos(angle) * speed;
    let vy = Math.sin(angle) * speed;
    const pts = [];
    for (let i = 0; i < frames; i++) {
        vy += gravity;
        x += vx;
        y += vy;
        pts.push({ x, y });
    }
    return pts;
}
