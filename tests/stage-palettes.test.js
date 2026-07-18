import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGE_PALETTES } from '../src/js/utils/Constants.js';

test('7 stage palettes with fill+border', () => {
    assert.equal(STAGE_PALETTES.length, 7);
    for (const p of STAGE_PALETTES) {
        assert.match(p.fill, /^#[0-9A-Fa-f]{6}$/);
        assert.match(p.border, /^#[0-9A-Fa-f]{6}$/);
    }
});

test('stage 1 is brown, stage 7 is dark slate blue', () => {
    assert.equal(STAGE_PALETTES[0].fill, '#8B4513');
    assert.equal(STAGE_PALETTES[6].fill, '#483D8B');
});
