// ============================================
// Camera - Smooth following with lerp
// ============================================

import { CAMERA_LERP } from '../utils/Constants.js';

export class Camera {
    constructor(game) {
        this.game = game;
        this.x = 0;
        this.y = 0;
        this.target = null;
    }

    /** Set the entity to follow */
    follow(entity) {
        this.target = entity;
    }

    /** Snap camera instantly to target (no lerp) */
    snapToTarget() {
        if (!this.target) return;
        this.x = this.target.x + this.target.width / 2 - this.game.canvas.width / 2;
        this.y = this.target.y + this.target.height / 2 - this.game.canvas.height / 2;
        this._clamp();
    }

    update() {
        if (!this.target) return;

        const targetX = this.target.x + this.target.width / 2 - this.game.canvas.width / 2;
        const targetY = this.target.y + this.target.height / 2 - this.game.canvas.height / 2;

        this.x += (targetX - this.x) * CAMERA_LERP;
        this.y += (targetY - this.y) * CAMERA_LERP;

        this._clamp();
    }

    _clamp() {
        const maxX = this.game.map.width - this.game.canvas.width;
        const maxY = this.game.map.height - this.game.canvas.height;
        this.x = Math.max(0, Math.min(this.x, maxX));
        this.y = Math.max(0, Math.min(this.y, maxY));
    }
}
