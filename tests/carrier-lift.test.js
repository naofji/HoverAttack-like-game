import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { CARRIER_WIDTH, CARRIER_HEIGHT } from '../src/js/utils/Constants.js';

function makeOpenMap() {
  return { isSolidAtPixel: () => false };
}

function makeCarrier(x, y) {
  return {
    x, y, width: CARRIER_WIDTH, height: CARRIER_HEIGHT,
    vx: 0, vy: 0, alive: true, platformLeft: 16, platformRight: 48,
  };
}

test('player lifts the carrier from below even without a game.options object', () => {
  const carrier = makeCarrier(100, 200);
  const p = Object.create(Player.prototype);
  p.game = { map: makeOpenMap(), carrier, enemies: [] }; // note: no `.options` at all
  p.width = 16;
  p.height = 20;
  p.x = carrier.x + 10;               // 110 — horizontally overlapping the carrier
  p.y = carrier.y + carrier.height - 5; // 227 — head just under the carrier's bottom edge
  p.vx = 0;
  p.vy = -3; // moving upward into the carrier
  p.docked = false;
  p.onGround = false;

  p._moveAndCollide();

  assert.equal(p.y, carrier.y + carrier.height, 'player head snaps to the carrier bottom');
  assert.equal(carrier.vy, -1.5, 'carrier is lifted at half the player speed');
  assert.equal(carrier.vx, 0, 'carrier follows the player horizontal speed while lifted');
});

test('player is pushed out of the carrier side even without a game.options object', () => {
  const carrier = makeCarrier(100, 200);
  const p = Object.create(Player.prototype);
  p.game = { map: makeOpenMap(), carrier, enemies: [] };
  p.width = 16;
  p.height = 20;
  p.x = 88;
  p.y = 210; // vertically overlapping the carrier body
  p.vx = 2;
  p.vy = 0;
  p.docked = false;
  p.onGround = false;

  p._moveAndCollide();

  assert.equal(p.x, carrier.x - p.width, 'player pushed back out of the carrier side');
  assert.equal(p.vx, 0);
});
