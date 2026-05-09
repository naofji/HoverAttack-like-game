// ============================================
// Camera - Smooth following with lerp
// ============================================

import { CAMERA_LERP, HUD_TOP_HEIGHT, HUD_BOTTOM_HEIGHT } from '../utils/Constants.js';

export class Camera {
    constructor(game) {
        this.game = game;
        this.x = 0;
        this.y = 0;
        this.target = null;
        this.shakeIntensity = 0;
        this.shakeTimer = 0;
    }

    /** Set the entity to follow */
    follow(entity) {
        this.target = entity;
    }

    /** Snap camera instantly to target (no lerp) */
    snapToTarget() {
        if (!this.target) return;
        this.x = this.target.x + this.target.width / 2 - this.game.canvas.width / 2;
        
        const visibleHeight = this.game.canvas.height - HUD_TOP_HEIGHT - HUD_BOTTOM_HEIGHT;
        this.y = this.target.y + this.target.height / 2 - HUD_TOP_HEIGHT - visibleHeight / 2;
        
        this._clamp();
    }

    /** Trigger a screen shake effect */
    shake(intensity, duration) {
        this.shakeIntensity = intensity;
        this.shakeTimer = duration;
    }

    update() {
        if (!this.target) return;

        const targetX = this.target.x + this.target.width / 2 - this.game.canvas.width / 2;

        const visibleHeight = this.game.canvas.height - HUD_TOP_HEIGHT - HUD_BOTTOM_HEIGHT;
        const targetY = this.target.y + this.target.height / 2 - HUD_TOP_HEIGHT - visibleHeight / 2;

        this.x += (targetX - this.x) * CAMERA_LERP;
        this.y += (targetY - this.y) * CAMERA_LERP;

        this._clamp();

        // Apply shake offset
        if (this.shakeTimer > 0) {
            this.x += (Math.random() - 0.5) * this.shakeIntensity;
            this.y += (Math.random() - 0.5) * this.shakeIntensity;
            this.shakeTimer--;
            this.shakeIntensity *= 0.95; // Gradually decay intensity
        }
    }

    _clamp() {
        const maxX = this.game.map.width - this.game.canvas.width;
        // Allows the camera to go negative so the top boundary of the map is drawn below the HUD
        const minY = -HUD_TOP_HEIGHT;
        // Allows the camera to go just enough so the bottom boundary of the map meets the bottom HUD
        const maxY = this.game.map.height - this.game.canvas.height + HUD_BOTTOM_HEIGHT;
        
        this.x = Math.max(0, Math.min(this.x, maxX));
        this.y = Math.max(minY, Math.min(this.y, maxY));
    }
}
