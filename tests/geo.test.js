import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCountryCode, flagEmoji } from '../src/js/utils/geo.js';

test('getCountryCode maps known IANA timezones to ISO2', () => {
  assert.equal(getCountryCode('Asia/Tokyo'), 'JP');
  assert.equal(getCountryCode('America/New_York'), 'US');
  assert.equal(getCountryCode('Europe/London'), 'GB');
  assert.equal(getCountryCode('Australia/Sydney'), 'AU');
});

test('getCountryCode returns empty string for unknown or empty timezone', () => {
  assert.equal(getCountryCode('Antarctica/Troll'), ''); // valid IANA zone, intentionally not in the curated map
  assert.equal(getCountryCode(''), '');                 // empty string is guarded -> ''
});
// NOTE: do NOT assert getCountryCode(undefined) === '' — an omitted argument falls
// back to the host timezone (Intl), which on some dev machines (e.g. Asia/Tokyo) maps
// to a real code. That default path is only meaningful in the browser and is not
// unit-tested here. Pass an explicit timezone string in tests.

test('flagEmoji converts a 2-letter code to regional-indicator flag', () => {
  // 🇯🇵 = U+1F1EF U+1F1F5
  assert.equal(flagEmoji('JP'), String.fromCodePoint(0x1F1EF, 0x1F1F5));
  assert.equal(flagEmoji('jp'), String.fromCodePoint(0x1F1EF, 0x1F1F5)); // case-insensitive
});

test('flagEmoji returns empty string for invalid input', () => {
  assert.equal(flagEmoji(''), '');
  assert.equal(flagEmoji('J'), '');
  assert.equal(flagEmoji('JPN'), '');
  assert.equal(flagEmoji(null), '');
  assert.equal(flagEmoji(123), '');
});
