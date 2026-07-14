// ============================================
// WeekSeed - ISO 8601 week (Monday start, UTC) -> deterministic seed
// ============================================

/** Returns { isoYear, week } for the ISO week containing the given date (UTC). */
function getISOWeek(date) {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    // Shift to the Thursday of the current ISO week (Mon=0 .. Sun=6).
    const dayNum = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dayNum + 3);
    const isoYear = d.getUTCFullYear();
    // Thursday of ISO week 1 is the Thursday in the week of Jan 4th.
    const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
    const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
    const week = 1 + Math.round((d - firstThursday) / (7 * 24 * 3600 * 1000));
    return { isoYear, week };
}

/** Current week identity + base seed. Pass a Date for testing; defaults to now. */
export function getCurrentWeek(date = new Date()) {
    const { isoYear, week } = getISOWeek(date);
    const seed = (isoYear * 100 + week) >>> 0;
    return { weekId: `${isoYear}-W${String(week).padStart(2, '0')}`, seed };
}

/** Mixes the week seed with a mission level into a well-distributed stage seed. */
export function stageSeed(weekSeed, missionLevel) {
    let h = Math.imul((weekSeed ^ 0x9e3779b9) >>> 0, 0x85ebca6b) >>> 0;
    h = Math.imul((h ^ (missionLevel + 1)) >>> 0, 0xc2b2ae35) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
}
