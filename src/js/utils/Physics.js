// ============================================
// Physics Utilities - Shared collision helpers
// ============================================

import { TILE_SIZE } from './Constants.js';

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
 * Calculate distance between the centers of two entities.
 * @param {object} e1 - Must have x, y, width, height
 * @param {object} e2 - Must have x, y, width, height
 * @returns {number} Euclidean distance
 */
export function distanceBetween(e1, e2) {
    const dx = (e1.x + e1.width / 2) - (e2.x + e2.width / 2);
    const dy = (e1.y + e1.height / 2) - (e2.y + e2.height / 2);
    return Math.sqrt(dx * dx + dy * dy);
}
