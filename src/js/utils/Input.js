// ============================================
// Input Manager
// ============================================

// Keys that should prevent default browser behavior (scrolling, etc.)
const PREVENT_DEFAULT_KEYS = new Set([
    'Space', 'ShiftLeft', 'ShiftRight', 'Tab',
    'KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyM', 'KeyF',
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'
]);

export class Input {
    constructor(canvas) {
        this.canvas = canvas;
        this.keys = {};
        this.prevKeys = {};
        this.mouse = { x: 0, y: 0, left: false, right: false };
        this.prevMouse = { left: false, right: false };
        this.rightHoldFrames = 0; // 右クリック長押しフレームカウント

        // Lock-on state
        this.crosshairLocked = false;
        this.lockedWorldX = 0;
        this.lockedWorldY = 0;
        // Typing support for Ranking entry
        this.typedChars = [];

        this._setupListeners();
    }

    _setupListeners() {
        window.addEventListener('keydown', (e) => {
            if (!this.keys[e.code]) {
                // Record single keystrokes (no repeat) for text entry
                if (e.key.length === 1 && /[a-zA-Z0-9 :\-_.]/.test(e.key)) {
                    this.typedChars.push(e.key);
                } else if (e.key === 'Backspace' || e.key === 'Enter') {
                    this.typedChars.push(e.key);
                }
            }

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
            const newX = e.clientX - rect.left;
            const newY = e.clientY - rect.top;
            
            if (this.mouse.x !== newX || this.mouse.y !== newY) {
                this.mouse.x = newX;
                this.mouse.y = newY;
                
                if (this.crosshairLocked) {
                    this.crosshairLocked = false;
                    console.log('Crosshair Unlocked (Mouse Moved)');
                }
            }
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

    /** Right mouse just clicked this frame (押し始めの1フレームのみ) */
    isRightClickPressed() {
        return this.mouse.right && !this.prevMouse.right;
    }

    /** Right mouse is being held this frame (押し始め以外でも継続中) */
    isRightClickHeld() {
        return this.mouse.right;
    }

    /** Right mouse was just released this frame */
    isRightClickReleased() {
        return !this.mouse.right && this.prevMouse.right;
    }

    /** Get typed characters/actions of this frame */
    getTypedChars() {
        return this.typedChars;
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
    endFrame() {
        this.prevKeys = { ...this.keys };
        this.prevMouse = { left: this.mouse.left, right: this.mouse.right };
        this.typedChars = []; // Clear key queue

        // 右クリック長押しカウント
        if (this.mouse.right) {
            this.rightHoldFrames++;
        } else {
            this.rightHoldFrames = 0;
        }
    }
}
