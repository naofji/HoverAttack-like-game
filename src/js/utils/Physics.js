// ============================================
// Physics Utilities - Shared collision helpers
// ============================================

import { TILE_SIZE, SIGHT_ASPECT } from './Constants.js';

/**
 * Check if an entity's bounding box collides with the map.
 * Uses a set of check points (corners + midpoints) for accuracy.
 * @param {object} entity - Must have x, y, width, height
 * @param {object} map - Must have isSolidAtPixel(x, y)
 * @param {Array} [customPoints] - Optional custom check points [{x, y}, ...]
 * @returns {boolean}
 */
export function collidesWithMap(entity, map, customPoints) {
    const points = customPoints || getDefaultCheckPoints(entity);
    for (const p of points) {
        if (map.isSolidAtPixel(p.x, p.y)) return true;
    }
    return false;
}

/**
 * Generate standard 8-point bounding box check points for an entity.
 * @param {object} entity - Must have x, y, width, height
 * @param {number} [inset=2] - Pixel inset from edges
 * @returns {Array} Array of {x, y} points
 */
export function getDefaultCheckPoints(entity, inset = 2) {
    return [
        { x: entity.x + inset, y: entity.y + inset },                               // top-left
        { x: entity.x + entity.width - inset, y: entity.y + inset },                 // top-right
        { x: entity.x + inset, y: entity.y + entity.height - 1 },                    // bottom-left
        { x: entity.x + entity.width - inset, y: entity.y + entity.height - 1 },     // bottom-right
        { x: entity.x + entity.width / 2, y: entity.y + inset },                     // mid-top
        { x: entity.x + entity.width / 2, y: entity.y + entity.height - 1 },         // mid-bottom
        { x: entity.x + inset, y: entity.y + entity.height / 2 },                    // mid-left
        { x: entity.x + entity.width - inset, y: entity.y + entity.height / 2 },     // mid-right
    ];
}

/**
 * Check horizontal collision between a moving entity and a list of other entities.
 * Pushes the entity out if overlapping and optionally calls a callback.
 * @param {object} self - The entity that moved horizontally (must have x, y, width, height, vx, alive)
 * @param {Array} entities - Array of entities to check against
 * @param {function} [onCollide] - Optional callback(self, other) called on collision
 */
export function checkHorizontalEntityCollision(self, entities, onCollide) {
    for (const entity of entities) {
        if (entity === self || !entity.alive) continue;

        if (self.x < entity.x + entity.width &&
            self.x + self.width > entity.x &&
            self.y < entity.y + entity.height &&
            self.y + self.height > entity.y) {

            if (self.vx > 0) {
                self.x = entity.x - self.width;
                self.vx = 0;
            } else if (self.vx < 0) {
                self.x = entity.x + entity.width;
                self.vx = 0;
            }

            if (onCollide) onCollide(self, entity);
        }
    }
}

/**
 * Check vertical collision (landing on top of entities) for a falling entity.
 * @param {object} self - The falling entity (must have x, y, width, height, vy, alive)
 * @param {Array} entities - Array of entities to check against
 * @returns {boolean} True if landed on something
 */
export function checkVerticalEntityCollision(self, entities) {
    for (const entity of entities) {
        if (entity === self || !entity.alive) continue;

        const myBottom = self.y + self.height;
        const myPrevBottom = myBottom - self.vy;
        const eTop = entity.y;

        if (self.x + self.width > entity.x && self.x < entity.x + entity.width) {
            if (myPrevBottom <= eTop + 4 && myBottom >= eTop) {
                self.y = eTop - self.height;
                self.vy = 0;
                self.x += entity.vx || 0;
                return true;
            }
        }
    }
    return false;
}

/**
 * Check line-of-sight between two points by raymarching through the map.
 * @param {number} x1 - Start X
 * @param {number} y1 - Start Y
 * @param {number} x2 - End X
 * @param {number} y2 - End Y
 * @param {object} map - Must have isSolidAtPixel(x, y)
 * @returns {boolean} True if there is clear line of sight
 */
export function hasLineOfSight(x1, y1, x2, y2, map) {
    const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    const steps = Math.ceil(dist / (TILE_SIZE / 2));

    for (let i = 1; i < steps; i++) {
        const tx = x1 + (x2 - x1) * (i / steps);
        const ty = y1 + (y2 - y1) * (i / steps);
        if (map.isSolidAtPixel(tx, ty)) {
            return false;
        }
    }
    return true;
}

/**
 * 楕円の索敵判定。`dist < sightRange` の置き換え。
 *
 * 横半径は渡された range そのもの（＝ CANVAS_WIDTH に比例する既存の値）で、
 * 縦半径は range * SIGHT_ASPECT。4:3 では SIGHT_ASPECT === 1 なので真円に
 * 退化する。この退化は実数演算では厳密に旧来の円 hypot(dx,dy) < range と
 * 一致する（tests/sight-ellipse.test.js の総当たりで確認済み）。ただし
 * 浮動小数では境界ぎりぎりの点で丸め誤差が乗りうるうえ、置き換え前の
 * 呼び出し側は `<=` を使っていた箇所があり、この関数は `<` なので、
 * 境界上ちょうどの標的1点だけは判定が変わりうる。
 *
 * range に Infinity を渡すと常に true（dx/Infinity が 0 になり、ry も
 * Infinity になるため）。EnemyBase._findTarget の既定引数がこの形。
 *
 * @param {number} dx 標的中心までの横距離
 * @param {number} dy 標的中心までの縦距離
 * @param {number} range 横半径（各敵の sightRange）
 * @returns {boolean}
 */
export function withinSight(dx, dy, range) {
    const ry = range * SIGHT_ASPECT;
    return (dx / range) ** 2 + (dy / ry) ** 2 < 1;
}

/**
 * Check if a point is inside a rectangular entity's bounding box.
 * @param {number} px - Point X
 * @param {number} py - Point Y
 * @param {object} entity - Must have x, y, width, height
 * @returns {boolean}
 */
export function pointInRect(px, py, entity) {
    return px > entity.x && px < entity.x + entity.width &&
           py > entity.y && py < entity.y + entity.height;
}

/**
 * エンティティの中心座標。
 *
 * この作りには x,y の約束が2通りある。
 *  - 機体・アイテム: x,y は左上。中心は x + width/2
 *  - 巡航ミサイル・基地レーザー: x,y が中心そのもので、width/height は
 *    見た目の広がり（描画が translate(x,y) してから -width/2 を基準に描く）
 *
 * 見分けが付かないまま一律に width/2 を足すと、巡航ミサイル(24x16)で12px、
 * レーザー(100x6)では50pxも実際と違う場所を測ってしまう。約束の違いは
 * originIsCenter で自己申告してもらい、中心の求め方はここ1箇所に置く。
 *
 * @param {object} e x, y を持つ。左上基準なら width/height も
 * @returns {{x:number, y:number}}
 */
export function centerOf(e) {
    if (e.originIsCenter) return { x: e.x, y: e.y };
    return { x: e.x + (e.width || 0) / 2, y: e.y + (e.height || 0) / 2 };
}

/**
 * 線分と矩形が交わるか。反射ビームは帯全体が当たるので、点ではなく線分で見る。
 *
 * 境界を含む判定（辺に接する線分、角だけをかすめる線分も「当たり」）。
 * 既存の pointInRect は厳密不等号で「辺の上は外」だが、ここは異なる。理由：
 * - 帯の判定は「矩形の縁をかすめて当たらない」と理不尽に感じさせるべきではない
 * - pointInRect は点の判定だから 1px 差が見えず厳密不等号でも問題ないが、
 *   帯全体が対象の反射ビームでは縁の判定が目立つ。そのため緩い基準を採った。
 *
 * Liang–Barsky のクリッピング。線分を媒介変数 t（0〜1）で表し、矩形の4辺で
 * t の範囲を削っていく。範囲が残れば交わっている。ループも平方根も無いので、
 * 帯の節8本 × 対象2つを毎フレーム見ても軽い。
 *
 * @param {number} x1 線分の端
 * @param {number} y1
 * @param {number} x2 もう一方の端
 * @param {number} y2
 * @param {{x:number,y:number,width:number,height:number}} rect
 * @returns {boolean}
 */
export function segmentIntersectsRect(x1, y1, x2, y2, rect) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const left = rect.x;
    const right = rect.x + rect.width;
    const top = rect.y;
    const bottom = rect.y + rect.height;

    let t0 = 0;
    let t1 = 1;

    // 4辺ぶん、(p, q) の組で範囲を削る
    const clip = (p, q) => {
        if (p === 0) return q >= 0;      // 辺と平行。外側なら即座に不成立
        const r = q / p;
        if (p < 0) {
            if (r > t1) return false;
            if (r > t0) t0 = r;
        } else {
            if (r < t0) return false;
            if (r < t1) t1 = r;
        }
        return true;
    };

    return clip(-dx, x1 - left)
        && clip(dx, right - x1)
        && clip(-dy, y1 - top)
        && clip(dy, bottom - y1);
}

/**
 * 線分上で、点 (px, py) にいちばん近い場所を返す。
 *
 * 反射ビームの被弾点を出すのに使う。帯（節の集まり）のどこで当たったかは
 * segmentIntersectsRect が真偽しか返さないので、当たった節に対して
 * 「対象の中心にいちばん近い点」を取る。節が矩形を貫いていれば、その点は
 * 必ず矩形の内側に入る（＝見た目どおりの位置に火花が出る）。
 *
 * 重なりの中点を出す方法（Liang–Barsky の t0/t1 を返す）も試したが、
 * 対象の縁をかすめる節では中点が縁に寄りすぎて火花が体から外れて見えた。
 * 中心へ寄せるこちらのほうが素直だった。
 */
export function closestPointOnSegment(x1, y1, x2, y2, px, py) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return { x: x1, y: y1 };  // 長さ0の節（撃った直後）
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return { x: x1 + dx * t, y: y1 + dy * t };
}
