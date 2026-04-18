// ============================================
// HighScore Manager
// ============================================

const STORAGE_KEY = 'hoverattack_highscores';

export class HighScoreManager {
    constructor() {
        this.scores = [];
        this.loadScores();
    }

    loadScores() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            if (data) {
                this.scores = JSON.parse(data);
            } else {
                this.scores = this._getDefaultScores();
                this.saveScores();
            }
        } catch (e) {
            console.error('Failed to load high scores:', e);
            this.scores = this._getDefaultScores();
        }
    }

    saveScores() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.scores));
        } catch (e) {
            console.error('Failed to save high scores:', e);
        }
    }

    _getDefaultScores() {
        // Initial dummy scores (Top 20)
        return [
            { name: 'HOVER', score: 20000, mission: 7, clearTime: '05:00.00' },
            { name: 'ATTACK', score: 18000, mission: 6, clearTime: null },
            { name: 'ROBOT', score: 16000, mission: 5, clearTime: null },
            { name: 'CAVE', score: 15000, mission: 4, clearTime: null },
            { name: 'LASER', score: 14000, mission: 4, clearTime: null },
            { name: 'BASE', score: 13000, mission: 3, clearTime: null },
            { name: 'DRONE', score: 12000, mission: 3, clearTime: null },
            { name: 'TANK', score: 11000, mission: 3, clearTime: null },
            { name: 'PLAYER', score: 10000, mission: 2, clearTime: null },
            { name: 'NOVICE', score: 9000, mission: 2, clearTime: null },
            { name: 'GUEST2', score: 8000, mission: 2, clearTime: null },
            { name: 'GUEST3', score: 7000, mission: 2, clearTime: null },
            { name: 'GUEST4', score: 6000, mission: 1, clearTime: null },
            { name: 'GUEST5', score: 5000, mission: 1, clearTime: null },
            { name: 'GUEST6', score: 4000, mission: 1, clearTime: null },
            { name: 'GUEST7', score: 3000, mission: 1, clearTime: null },
            { name: 'GUEST8', score: 2000, mission: 1, clearTime: null },
            { name: 'GUEST9', score: 1000, mission: 1, clearTime: null },
            { name: 'GUEST10', score: 500, mission: 1, clearTime: null },
            { name: 'GUEST11', score: 100, mission: 1, clearTime: null }
        ];
    }

    isHighScore(score) {
        if (this.scores.length < 20) return true;
        return score > this.scores[this.scores.length - 1].score;
    }

    addScore(name, score, mission, clearTime = null) {
        const entry = { name: (name || 'AAA').toUpperCase().substring(0, 10), score: score, mission: mission, clearTime: clearTime };
        this.scores.push(entry);
        this.scores.sort((a, b) => b.score - a.score);
        if (this.scores.length > 20) {
            this.scores = this.scores.slice(0, 20);
        }
        this.saveScores();
        return this.scores.indexOf(entry);
    }

    getTop10() {
        return this.scores;
    }
}
