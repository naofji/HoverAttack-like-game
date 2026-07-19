import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { MISSILE_INITIAL_COUNT } from '../src/js/utils/Constants.js';

function makeDockedPlayer(gameSpeed) {
  const p = Object.create(Player.prototype);
  p.game = { gameSpeed };
  p.hp = 100;          // full — HP branch inactive
  p.missiles = 0;      // empty — the branch under test
  p.grenades = 12;     // full
  p.hoverFuel = 100;   // full
  return p;
}

test('NEWTYPE (1.0x): missiles refill in 360 sim frames (6 real seconds)', () => {
  const p = makeDockedPlayer(1.0);
  for (let i = 0; i < 360; i++) p._updateDockedResupply();
  assert.ok(p.missiles >= MISSILE_INITIAL_COUNT - 1e-9, `missiles=${p.missiles}`);
});

test('NORMAL (0.8x): missiles refill in 288 sim frames (= same 6 real seconds)', () => {
  const p = makeDockedPlayer(0.8);
  for (let i = 0; i < 288; i++) p._updateDockedResupply();
  assert.ok(p.missiles >= MISSILE_INITIAL_COUNT - 1e-9, `missiles=${p.missiles}`);
});

test('NORMAL (0.8x): not already full well before the real-time budget', () => {
  const p = makeDockedPlayer(0.8);
  for (let i = 0; i < 200; i++) p._updateDockedResupply();
  assert.ok(p.missiles < MISSILE_INITIAL_COUNT, `missiles=${p.missiles}`);
});

test('missing gameSpeed falls back to 1x without throwing', () => {
  const p = makeDockedPlayer(undefined);
  for (let i = 0; i < 360; i++) p._updateDockedResupply();
  assert.ok(p.missiles >= MISSILE_INITIAL_COUNT - 1e-9, `missiles=${p.missiles}`);
});

test('refill never exceeds the cap', () => {
  const p = makeDockedPlayer(0.8);
  for (let i = 0; i < 1000; i++) p._updateDockedResupply();
  assert.ok(p.missiles <= MISSILE_INITIAL_COUNT, `missiles=${p.missiles}`);
});
