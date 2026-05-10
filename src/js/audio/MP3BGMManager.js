/**
 * MP3BGMManager
 * Plays an external MP3 file as BGM via the Web Audio API.
 * Supports fade-in on start and fade-out on stop.
 */
export class MP3BGMManager {
    constructor(audioCtx) {
        this.ctx          = audioCtx;
        this.playing      = false;
        this.url          = 'src/assets/audio/bgm.mp3';
        this.audioElement = new Audio();
        this.audioElement.loop = true;
        this.source       = null;
        this.gainNode     = null;
        this._stopTimerId = null; // Pending fade-out timeout
    }

    // ------------------------------------------
    // Private
    // ------------------------------------------

    /** Connect audio element → gain → destination (idempotent). */
    _init() {
        if (this.source) return;
        this.source   = this.ctx.createMediaElementSource(this.audioElement);
        this.gainNode = this.ctx.createGain();
        this.gainNode.gain.value = 0; // Start muted; fade in on play
        this.source.connect(this.gainNode);
        this.gainNode.connect(this.ctx.destination);
    }

    // ------------------------------------------
    // Public API
    // ------------------------------------------

    /** Set the MP3 URL to load on the next start(). */
    setURL(url) {
        this.url = url;
        this.audioElement.src = url;
    }

    /** Start (or restart) playback with a 2-second fade-in. */
    start() {
        this._init();

        // Cancel any pending fade-out so it doesn't kill the new track
        if (this._stopTimerId !== null) {
            clearTimeout(this._stopTimerId);
            this._stopTimerId = null;
        }

        this.audioElement.pause();
        this.audioElement.currentTime = 0;
        this.audioElement.src  = this.url;
        this.audioElement.loop = true;

        this.audioElement.play().then(() => {
            this.playing = true;
            this.gainNode.gain.cancelScheduledValues(this.ctx.currentTime);
            this.gainNode.gain.setValueAtTime(0, this.ctx.currentTime);
            this.gainNode.gain.linearRampToValueAtTime(0.5, this.ctx.currentTime + 2);
        }).catch(err => {
            console.error('Failed to play MP3 BGM:', err);
            console.log('Make sure the file exists at:', this.url);
            this.playing = false;
        });
    }

    /** Fade out over ~0.5 s then pause. */
    stop() {
        if (!this.playing) return;

        // Cancel any previously scheduled stop to avoid races
        if (this._stopTimerId !== null) {
            clearTimeout(this._stopTimerId);
            this._stopTimerId = null;
        }

        this.gainNode.gain.cancelScheduledValues(this.ctx.currentTime);
        this.gainNode.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); // τ=0.1 → ~0.5s

        this._stopTimerId = setTimeout(() => {
            this.audioElement.pause();
            this.playing      = false;
            this._stopTimerId = null;
        }, 500);
    }
}
