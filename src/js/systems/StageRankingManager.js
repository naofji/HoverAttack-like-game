// ============================================
// StageRankingManager - per-stage weekly rankings (local)
// Two lists per stage: fastest time (asc) and high score (desc), top 5 each.
// ============================================

const STAGE_KEY = 'hoverattack_stage_rankings';
export const STAGE_TOP = 5;
export const STAGE_COUNT = 7;

function emptyStages() {
    return Array.from({ length: STAGE_COUNT }, () => ({ time: [], score: [] }));
}

export class StageRankingManager {
    constructor(weekId) {
        this.weekId = weekId;
        this.stages = emptyStages();
        this._load();
    }

    _load() {
        let stored = null;
        try {
            const data = localStorage.getItem(STAGE_KEY);
            stored = data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('Failed to load stage rankings:', e);
            stored = null;
        }
        if (stored && stored.weekId === this.weekId && Array.isArray(stored.stages) && stored.stages.length === STAGE_COUNT) {
            this.stages = stored.stages.map((s) => ({
                time: Array.isArray(s.time) ? s.time : [],
                score: Array.isArray(s.score) ? s.score : [],
            }));
        } else {
            this.stages = emptyStages();
            this._save();
        }
    }

    _save() {
        try {
            localStorage.setItem(STAGE_KEY, JSON.stringify({ weekId: this.weekId, stages: this.stages }));
        } catch (e) {
            console.error('Failed to save stage rankings:', e);
        }
    }

    _slot(stage) {
        const idx = stage - 1;
        if (idx < 0 || idx >= STAGE_COUNT) return null;
        return this.stages[idx];
    }

    addStageResult(stage, { name, timeMs, score, country }) {
        const slot = this._slot(stage);
        if (!slot) return;
        const nm = (name || 'AAA').toUpperCase().substring(0, 10);
        const co = country || '';
        slot.time.push({ name: nm, timeMs, country: co });
        slot.time.sort((a, b) => a.timeMs - b.timeMs);
        slot.time = slot.time.slice(0, STAGE_TOP);
        slot.score.push({ name: nm, score, country: co });
        slot.score.sort((a, b) => b.score - a.score);
        slot.score = slot.score.slice(0, STAGE_TOP);
        this._save();
    }

    getStage(stage) {
        const slot = this._slot(stage);
        return slot ? { time: slot.time, score: slot.score } : { time: [], score: [] };
    }

    wouldRankTime(stage, timeMs) {
        const slot = this._slot(stage);
        if (!slot) return false;
        if (slot.time.length < STAGE_TOP) return true;
        return timeMs < slot.time[slot.time.length - 1].timeMs;
    }

    wouldRankScore(stage, score) {
        const slot = this._slot(stage);
        if (!slot) return false;
        if (slot.score.length < STAGE_TOP) return true;
        return score > slot.score[slot.score.length - 1].score;
    }
}
