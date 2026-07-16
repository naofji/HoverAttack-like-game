// ============================================
// geo - derive a country code from the device timezone, and a flag emoji.
// ============================================

import { TIMEZONE_COUNTRY } from './timezoneCountry.js';

/**
 * Resolve a 2-letter country code from an IANA timezone.
 * Defaults to the host timezone; unknown/missing zones return ''.
 */
export function getCountryCode(timeZone = _hostTimeZone()) {
    if (!timeZone) return '';
    return TIMEZONE_COUNTRY[timeZone] || '';
}

function _hostTimeZone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch (e) {
        return '';
    }
}

/** Convert a 2-letter country code to a regional-indicator flag emoji, or '' if invalid. */
export function flagEmoji(code) {
    if (typeof code !== 'string') return '';
    const c = code.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(c)) return '';
    const base = 0x1F1E6; // Regional Indicator Symbol Letter A
    return String.fromCodePoint(base + (c.charCodeAt(0) - 65), base + (c.charCodeAt(1) - 65));
}
