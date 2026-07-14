// ============================================
// SeededRNG - Deterministic PRNG (mulberry32)
// ============================================

export class SeededRNG {
    constructor(seed) {
        this.state = seed >>> 0;
    }

    /** Returns a float in [0, 1). Drop-in replacement for Math.random(). */
    next() {
        this.state = (this.state + 0x6D2B79F5) >>> 0;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}
