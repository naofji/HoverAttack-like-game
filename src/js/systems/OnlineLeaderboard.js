// ============================================
// OnlineLeaderboard - GAS Web App network client (fail-safe, no throws)
// ============================================

export class OnlineLeaderboard {
    constructor(url) {
        this.url = url || '';
    }

    async fetchData(timeoutMs = 5000) {
        if (!this.url) return { ok: false, error: 'not-configured' };
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const res = await fetch(this.url, { signal: ctrl.signal });
            if (!res.ok) return { ok: false, error: 'http-' + res.status };
            const data = await res.json();
            if (!data || data.ok !== true) return { ok: false, error: 'bad-data' };
            return { ok: true, weekId: data.weekId, ranking: data.ranking || [], fame: data.fame || [], stageRankings: data.stageRankings || [] };
        } catch (e) {
            return { ok: false, error: (e && e.name === 'AbortError') ? 'timeout' : 'network' };
        } finally {
            clearTimeout(timer);
        }
    }

    async submit(entry, timeoutMs = 5000) {
        if (!this.url) return { ok: false, error: 'not-configured' };
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const res = await fetch(this.url, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(entry),
                signal: ctrl.signal,
            });
            if (!res.ok) return { ok: false, error: 'http-' + res.status };
            const data = await res.json();
            if (!data || data.ok !== true) return { ok: false, error: (data && data.reason) || 'bad-data' };
            return { ok: true, rank: data.rank, weekId: data.weekId };
        } catch (e) {
            return { ok: false, error: (e && e.name === 'AbortError') ? 'timeout' : 'network' };
        } finally {
            clearTimeout(timer);
        }
    }

    async submitStages(payload, timeoutMs = 5000) {
        if (!this.url) return { ok: false, error: 'not-configured' };
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const res = await fetch(this.url, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ kind: 'stages', name: payload.name, country: payload.country, stages: payload.stages || [] }),
                signal: ctrl.signal,
            });
            if (!res.ok) return { ok: false, error: 'http-' + res.status };
            const data = await res.json();
            if (!data || data.ok !== true) return { ok: false, error: (data && data.reason) || 'bad-data' };
            return { ok: true };
        } catch (e) {
            return { ok: false, error: (e && e.name === 'AbortError') ? 'timeout' : 'network' };
        } finally {
            clearTimeout(timer);
        }
    }
}
