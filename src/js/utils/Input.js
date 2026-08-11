// ============================================
// Input Manager
// ============================================

import { canvasPointer } from './pointer.js';

// Keys that should prevent default browser behavior (scrolling, etc.)
const PREVENT_DEFAULT_KEYS = new Set([
    'Space', 'ShiftLeft', 'ShiftRight', 'Tab', 'Escape',
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

        // 直近の mousemove の client 座標。canvas がリサイズ/全画面切替で
        // 拡大率を変えたときに mouse.x/y を再計算するために持っておく。
        // 一度も mousemove が来ていない間は null（既知の位置が無いので再計算しない）。
        this._lastClientX = null;
        this._lastClientY = null;

        // Lock-on state
        this.crosshairLocked = false;
        this.lockedWorldX = 0;
        this.lockedWorldY = 0;
        // Typing support for Ranking entry
        this.typedChars = [];

        // このフレームに押された文字（e.key）。配列に依存せず「+」「-」を拾うため。
        // e.code だと JIS キーボードの「+」が Semicolon になり US 配列と食い違う。
        this.pressedChars = new Set();

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

            if (!e.repeat) this.pressedChars.add(e.key);

            this.keys[e.code] = true;
            if (PREVENT_DEFAULT_KEYS.has(e.code)) {
                e.preventDefault();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        // リスナを canvas ではなく window に付けている。canvas に付けていた頃は
        // カーソルが canvas の外に出た瞬間にイベントが止まって撃てなくなり、
        // さらに canvas 内で押して外で離すと mouseup を取り逃がして
        // mouse.left が true のまま残っていた（押しっぱなし判定になる）。
        window.addEventListener('mousemove', (e) => {
            this._lastClientX = e.clientX;
            this._lastClientY = e.clientY;
            this._applyClientPos(e.clientX, e.clientY, true);
        });

        window.addEventListener('mousedown', (e) => {
            if (e.button === 0) this.mouse.left = true;
            if (e.button === 2) this.mouse.right = true;
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.mouse.left = false;
            if (e.button === 2) this.mouse.right = false;
        });

        // Prevent context menu for right-click grenade
        // 黒帯の上で右クリックしてもメニューが出ないよう、これも window に付ける
        window.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        // canvas は CSS で画面幅に合わせて拡大表示されるので、ウィンドウの
        // リサイズや M での全画面切替で拡大率（getBoundingClientRect() の結果）
        // が変わる。マウスを1px も動かさずに切り替えた場合、動かすまで
        // mouse.x/y が古い拡大率のままになり、クロスヘアが実際のクリック先から
        // ズレて見える。カーソル自体は動いていないので mousemove は来ない —
        // 記憶している最後の client 座標を新しい拡大率で再変換して追従させる。
        //
        // 第3引数を false にしてロック解除を止めている。ロックは Shift で
        // プレイヤーが明示的に掛けた状態で、画面サイズが変わるだけでは
        // 「マウスを動かした」ことにはならない。ここを true のままにすると
        // rect が変わるたびほぼ確実に mouse.x/y の再計算結果が前回値と
        // 食い違い、M を押しただけで戦闘中のロックオンが無言で外れてしまう
        // （実際に発生した回帰）。
        window.addEventListener('resize', () => {
            this._applyClientPos(this._lastClientX, this._lastClientY, false);
        });
        document.addEventListener('fullscreenchange', () => {
            this._applyClientPos(this._lastClientX, this._lastClientY, false);
        });

        // window レベルの mouseup は、ボタンを離した瞬間がブラウザの外
        // （タスクバー、他アプリ、OS、Alt-Tab 中）だと発火しない。
        // その状態でウィンドウがフォーカスを失うと mouse.left/right が
        // true のまま固まり、撃ちっぱなしになる上 isLeftClickPressed()
        // が二度と立たなくなる（グレネード投擲やクリックで進む画面が
        // 全部死ぬ）。blur で強制的に離した状態に戻す。
        window.addEventListener('blur', () => {
            this.mouse.left = false;
            this.mouse.right = false;
        });
    }

    /**
     * 記憶している client 座標を canvas 内部座標に変換して mouse.x/y に反映する。
     * まだ一度も mousemove が来ていない（座標が未知の）間は何もしない。
     *
     * @param {boolean} unlockOnChange 座標が変わったときロックを解除するか。
     *   mousemove（実際にマウスが動いた）は true、resize/fullscreenchange
     *   （rect が変わっただけでマウスは動いていない）は false で呼ぶ。
     */
    _applyClientPos(clientX, clientY, unlockOnChange) {
        if (clientX === null || clientY === null) return;

        const { x, y } = canvasPointer(
            this.canvas.getBoundingClientRect(),
            this.canvas.width, this.canvas.height,
            clientX, clientY
        );

        if (this.mouse.x !== x || this.mouse.y !== y) {
            this.mouse.x = x;
            this.mouse.y = y;

            if (unlockOnChange && this.crosshairLocked) {
                this.crosshairLocked = false;
                console.log('Crosshair Unlocked (Mouse Moved)');
            }
        }
    }

    /** Key is currently held down */
    isKeyDown(code) {
        return !!this.keys[code];
    }

    /** Key was just pressed this frame (not held) */
    isKeyPressed(code) {
        return !!this.keys[code] && !this.prevKeys[code];
    }

    /**
     * このフレームに押された文字か（配列非依存）。
     * 同じ意味の複数表記をまとめて渡せる。例: isCharPressed('+', '=')
     * @param {...string} chars e.key の値
     */
    isCharPressed(...chars) {
        return chars.some((c) => this.pressedChars.has(c));
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
        this.pressedChars.clear();

        // 右クリック長押しカウント
        if (this.mouse.right) {
            this.rightHoldFrames++;
        } else {
            this.rightHoldFrames = 0;
        }
    }
}
