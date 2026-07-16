// ============================================
// IANA timezone -> ISO 3166-1 alpha-2 country code (curated, common zones).
// Unknown zones are simply absent (treated as no country).
// ============================================

export const TIMEZONE_COUNTRY = {
    // --- Asia ---
    'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Shanghai': 'CN',
    'Asia/Hong_Kong': 'HK', 'Asia/Taipei': 'TW', 'Asia/Singapore': 'SG',
    'Asia/Bangkok': 'TH', 'Asia/Jakarta': 'ID', 'Asia/Kuala_Lumpur': 'MY',
    'Asia/Manila': 'PH', 'Asia/Ho_Chi_Minh': 'VN', 'Asia/Kolkata': 'IN',
    'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Asia/Dubai': 'AE',
    'Asia/Riyadh': 'SA', 'Asia/Tehran': 'IR', 'Asia/Jerusalem': 'IL',
    'Asia/Yangon': 'MM', 'Asia/Colombo': 'LK', 'Asia/Kathmandu': 'NP',
    'Asia/Tashkent': 'UZ', 'Asia/Almaty': 'KZ', 'Asia/Baghdad': 'IQ',
    'Asia/Qatar': 'QA', 'Asia/Kuwait': 'KW', 'Asia/Beirut': 'LB',
    'Asia/Amman': 'JO',
    // --- Europe ---
    'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Paris': 'FR',
    'Europe/Berlin': 'DE', 'Europe/Madrid': 'ES', 'Europe/Rome': 'IT',
    'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE', 'Europe/Vienna': 'AT',
    'Europe/Zurich': 'CH', 'Europe/Lisbon': 'PT', 'Europe/Stockholm': 'SE',
    'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Europe/Helsinki': 'FI',
    'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ', 'Europe/Budapest': 'HU',
    'Europe/Bucharest': 'RO', 'Europe/Athens': 'GR', 'Europe/Kyiv': 'UA',
    'Europe/Kiev': 'UA', 'Europe/Moscow': 'RU', 'Europe/Istanbul': 'TR',
    'Asia/Istanbul': 'TR', 'Europe/Zagreb': 'HR', 'Europe/Belgrade': 'RS',
    'Europe/Sofia': 'BG', 'Europe/Bratislava': 'SK', 'Europe/Ljubljana': 'SI',
    'Europe/Vilnius': 'LT', 'Europe/Riga': 'LV', 'Europe/Tallinn': 'EE',
    'Europe/Luxembourg': 'LU', 'Europe/Reykjavik': 'IS',
    // --- Americas ---
    'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
    'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US',
    'Pacific/Honolulu': 'US', 'America/Toronto': 'CA', 'America/Vancouver': 'CA',
    'America/Edmonton': 'CA', 'America/Winnipeg': 'CA', 'America/Halifax': 'CA',
    'America/Mexico_City': 'MX', 'America/Monterrey': 'MX', 'America/Sao_Paulo': 'BR',
    'America/Bahia': 'BR', 'America/Fortaleza': 'BR', 'America/Buenos_Aires': 'AR',
    'America/Argentina/Buenos_Aires': 'AR', 'America/Santiago': 'CL',
    'America/Bogota': 'CO', 'America/Lima': 'PE', 'America/Caracas': 'VE',
    'America/Montevideo': 'UY', 'America/Asuncion': 'PY', 'America/La_Paz': 'BO',
    'America/Guatemala': 'GT', 'America/Costa_Rica': 'CR', 'America/Panama': 'PA',
    'America/Havana': 'CU', 'America/Santo_Domingo': 'DO', 'America/Puerto_Rico': 'PR',
    // --- Africa ---
    'Africa/Cairo': 'EG', 'Africa/Johannesburg': 'ZA', 'Africa/Lagos': 'NG',
    'Africa/Nairobi': 'KE', 'Africa/Casablanca': 'MA', 'Africa/Tunis': 'TN',
    'Africa/Algiers': 'DZ', 'Africa/Accra': 'GH', 'Africa/Addis_Ababa': 'ET',
    'Africa/Dar_es_Salaam': 'TZ', 'Africa/Khartoum': 'SD',
    // --- Oceania ---
    'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU',
    'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU', 'Pacific/Auckland': 'NZ',
    'Pacific/Fiji': 'FJ', 'Pacific/Guam': 'GU', 'Pacific/Port_Moresby': 'PG',
};
