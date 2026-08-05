import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEBRIS_SPECS, buildDebris } from '../src/js/entities/debris/index.js';
import { turretBaseParts, turretHeadParts } from '../src/js/entities/debris/turretParts.js';
import { EnemyTurret } from '../src/js/entities/EnemyTurret.js';
import { makeMap, makeGame, flatFloorRows } from './helpers/enemy-world.js';
import {
  ENEMY_TURRET_WIDTH, ENEMY_TURRET_HEIGHT,
} from '../src/js/utils/Constants.js';

test('tank のパーツが基本的な形を満たす（座標と draw() の一致は debris-static-parts-match-draw.test.js で検証）', () => {
  const spec = DEBRIS_SPECS.tank;
  assert.ok(spec);
  assert.ok(spec.parts.length >= 5, `パーツが少なすぎる: ${spec.parts.length}`);
  for (const p of spec.parts) {
    assert.ok(p.w > 0 && p.h > 0);
  }
});

test('turret の基部は設置向きで上下が入れ替わる', () => {
  const floor = { isCeilingMounted: false, width: ENEMY_TURRET_WIDTH, height: ENEMY_TURRET_HEIGHT };
  const ceiling = { isCeilingMounted: true, width: ENEMY_TURRET_WIDTH, height: ENEMY_TURRET_HEIGHT };
  const floorY = turretBaseParts(floor)[0].y;
  const ceilingY = turretBaseParts(ceiling)[0].y;
  assert.ok(floorY > ENEMY_TURRET_HEIGHT / 2, `床置きの基部が下にない: ${floorY}`);
  assert.ok(ceilingY < ENEMY_TURRET_HEIGHT / 2, `天井吊りの基部が上にない: ${ceilingY}`);
});

test('turret の基部は初速をほぼ持たない（据え付けが崩れる感じ）', () => {
  for (const p of turretBaseParts({ isCeilingMounted: false, width: 24, height: 24 })) {
    assert.ok(p.weight >= 5, `基部の weight が軽い: ${p.weight}`);
  }
});

test('turret の旋回体は currentAngle を反映する', () => {
  const a = turretHeadParts({ currentAngle: 0, recoil: 0, width: 24, height: 24 });
  const b = turretHeadParts({ currentAngle: Math.PI / 2, recoil: 0, width: 24, height: 24 });
  assert.notEqual(
    a.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join('|'),
    b.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join('|'),
  );
});

test('turret の破片は基部と旋回体の両方を含む（実クラスの getDebrisParts() を使う）', () => {
  const game = makeGame(makeMap(flatFloorRows()));
  const turret = new EnemyTurret(game, 300, 400, false);
  turret.currentAngle = 0.3;
  turret.recoil = 0;
  assert.equal(turret.width, ENEMY_TURRET_WIDTH);
  assert.equal(turret.height, ENEMY_TURRET_HEIGHT);

  const debris = buildDebris(turret, 'turret');
  assert.ok(debris.length >= 5, `破片が少なすぎる: ${debris.length}`);
});
