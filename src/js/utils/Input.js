// ============================================
// Input Manager
// ============================================

// Keys that should prevent default browser behavior (scrolling, etc.)
const PREVENT_DEFAULT_KEYS = new Set([
    'Space', 'ShiftLeft', 'ShiftRight',
    'KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyM',
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'
]);

export class Input {
    constructor(canvas) {
        this.canvas = canvas;
        this.keys = {};
        this.prevKeys = {};
        this.mouse = { x: 0, y: 0, left: false, right: false };
        this.prevMouse = { left: false, right: false };

        // Lock-on state
        this.crosshairLocked = false;
        this.lockedWorldX = 0;
        this.lockedWorldY = 0;

        this._setupListeners();
    }

    _setupListeners() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            if (PREVENT_DEFAULT_KEYS.has(e.code)) {
                e.preventDefault();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
        });

        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) this.mouse.left = true;
            if (e.button === 2) this.mouse.right = true;
        });

        this.canvas.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.mouse.left = false;
            if (e.button === 2) this.mouse.right = false;
        });

        // Prevent context menu for right-click grenade
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }

    /** Key is currently held down */
    isKeyDown(code) {
        return !!this.keys[code];
    }

    /** Key was just pressed this frame (not held) */
    isKeyPressed(code) {
        return !!this.keys[code] && !this.prevKeys[code];
    }

    /** Left mouse just clicked this frame */
    isLeftClickPressed() {
        return this.mouse.left && !this.prevMouse.left;
    }

    /** Right mouse just clicked this frame */
    isRightClickPressed() {
        return this.mouse.right && !this.prevMouse.right;
    }

    /** Get mouse position in world coordinates */
    getMouseWorld(camera) {
        return {
            x: this.mouse.x + camera.x,
            y: this.mouse.y + camera.y
        };
    }

    /** Get target world coordinates (either locked or current mouse) */
    getTargetWorld(camera) {
        if (this.crosshairLocked) {
            return { x: this.lockedWorldX, y: this.lockedWorldY };
        }
        return this.getMouseWorld(camera);
    }

    /** Call at end of each frame to track previous state */
    endFrame(camera) {
        // Toggle Lock-on with Shift key
        if (this.isKeyPressed('ShiftLeft') || this.isKeyPressed('ShiftRight')) {
            this.crosshairLocked = !this.crosshairLocked;
            if (this.crosshairLocked && camera) {
                const world = this.getMouseWorld(camera);
                this.lockedWorldX = world.x;
                this.lockedWorldY = world.y;
            }
        }

        this.prevKeys = { ...this.keys };
        this.prevMouse = { left: this.mouse.left, right: this.mouse.right };
    }
}
