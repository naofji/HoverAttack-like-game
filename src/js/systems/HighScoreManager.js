// ============================================
// HighScore Manager - weekly ranking + wall of fame (local)
// ============================================

const WEEKLY_KEY = 'hoverattack_weekly_ranking';
const FAME_KEY = 'hoverattack_wall_of_fame';
const MAX_WEEKLY = 20;
const FAME_TOP = 3;
const MIN_SCORE = 1000; // Scores must exceed this to be recordable.

export class HighScoreManager {
    constructor(weekId) {
        this.weekId = weekId;
        this.scores = [];        // this week's ranking (up to MAX_WEEKLY)
        this.wallOfFame = [];     // [{ weekId, entries: [top3] }], oldest first in storage
        this._load();
    }

    _load() {
        // Load wall of fame (persistent archive).
        try {
            const fameData = localStorage.getItem(FAME_KEY);
            this.wallOfFame = fameData ? JSON.parse(fameData) : [];
        } catch (e) {
            console.error('Failed to load wall of fame:', e);
            this.wallOfFame = [];
        }

        // Load this week's ranking; roll over if the stored week differs.
        let stored = null;
        try {
            const data = localStorage.getItem(WEEKLY_KEY);
            stored = data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('Failed to load weekly ranking:', e);
            stored = null;
        }

        if (stored && stored.weekId === this.weekId) {
            this.scores = Array.isArray(stored.scores) ? stored.scores : [];
        } else {
            // New week: archive the previous week's top 3, then reset.
            if (stored && Array.isArray(stored.scores) && stored.scores.length > 0) {
                this.wallOfFame.push({
                    weekId: stored.weekId,
                    entries: stored.scores.slice(0, FAME_TOP),
                });
                this._saveFame();
            }
            this.scores = [];
            this._saveWeekly();
        }
    }

    _saveWeekly() {
        try {
            localStorage.setItem(WEEKLY_KEY, JSON.stringify({ weekId: this.weekId, scores: this.scores }));
        } catch (e) {
            console.error('Failed to save weekly ranking:', e);
        }
    }

    _saveFame() {
        try {
            localStorage.setItem(FAME_KEY, JSON.stringify(this.wallOfFame));
        } catch (e) {
            console.error('Failed to save wall of fame:', e);
        }
    }

    isHighScore(score) {
        if (score <= MIN_SCORE) return false;
        if (this.scores.length < MAX_WEEKLY) return true;
        return score > this.scores[this.scores.length - 1].score;
    }

    addScore(name, score, mission, clearTime = null) {
        const entry = {
            name: (name || 'AAA').toUpperCase().substring(0, 10),
            score: score,
            mission: mission,
            clearTime: clearTime,
        };
        this.scores.push(entry);
        this.scores.sort((a, b) => b.score - a.score);
        if (this.scores.length > MAX_WEEKLY) {
            this.scores = this.scores.slice(0, MAX_WEEKLY);
        }
        this._saveWeekly();
        return this.scores.indexOf(entry);
    }

    /** This week's ranking (up to MAX_WEEKLY entries). */
    getTop10() {
        return this.scores;
    }

    /** Wall of fame, newest week first. */
    getWallOfFame() {
        return this.wallOfFame.slice().reverse();
    }
}
