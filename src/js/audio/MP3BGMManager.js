/**
 * MP3BGMManager - Handles loading and playing an external MP3 file as BGM.
 */
export class MP3BGMManager {
    constructor(audioCtx) {
        this.ctx = audioCtx;
        this.playing = false;
        this.audioElement = new Audio();
        this.audioElement.loop = true;
        this.source = null;
        this.gainNode = null;
        this.url = 'src/assets/audio/bgm.mp3'; // Default path
    }

    _init() {
        if (this.source) return;
        
        // Connect the audio element to the Web Audio context
        this.source = this.ctx.createMediaElementSource(this.audioElement);
        this.gainNode = this.ctx.createGain();
        this.gainNode.gain.value = 0; // Start muted for fade-in
        
        this.source.connect(this.gainNode);
        this.gainNode.connect(this.ctx.destination);
    }

    setURL(url) {
        this.url = url;
        this.audioElement.src = url;
    }

    start() {
        this._init();
        
        // If already playing, stop current playback to allow restart/change
        this.audioElement.pause();
        this.audioElement.currentTime = 0;

        this.audioElement.src = this.url;
        this.audioElement.play().then(() => {
            this.playing = true;
            // Fade in
            this.gainNode.gain.cancelScheduledValues(this.ctx.currentTime);
            this.gainNode.gain.setValueAtTime(0, this.ctx.currentTime);
            this.gainNode.gain.linearRampToValueAtTime(0.5, this.ctx.currentTime + 2);
        }).catch(err => {
            console.error("Failed to play MP3 BGM:", err);
            console.log("Make sure the file exists at:", this.url);
            this.playing = false;
        });
    }

    stop() {
        if (!this.playing) return;
        
        // Fade out then pause
        this.gainNode.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
        setTimeout(() => {
            this.audioElement.pause();
            this.playing = false;
        }, 1000);
    }
}
