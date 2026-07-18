import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Camera } from '../src/js/world/Camera.js';

function stubGame() {
  return { canvas: { width: 800, height: 600 }, map: { width: 8000, height: 6000 } };
}

test('renderX/renderY interpolate between prev and current', () => {
  const cam = new Camera(stubGame());
  cam.prevX = 100; cam.x = 200;
  cam.prevY = 50;  cam.y = 150;
  assert.equal(cam.renderX(0), 100);
  assert.equal(cam.renderX(1), 200);
  assert.equal(cam.renderX(0.5), 150);
  assert.equal(cam.renderY(0.5), 100);
});

test('prev defaults to current when unset (no jump)', () => {
  const cam = new Camera(stubGame());
  cam.x = 300; cam.y = 400;
  // prevX/prevY start equal to x/y (0 here) — after snapshotPrev they track.
  cam.snapshotPrev();
  assert.equal(cam.renderX(0.5), 300);
  assert.equal(cam.renderY(0.5), 400);
});
