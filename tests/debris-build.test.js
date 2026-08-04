import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildDebris, DEBRIS_SPECS } from '../src/js/entities/debris/index.js';
import { segmentPart } from '../src/js/entities/debris/shapes.js';

/** 乱数の影響を消して変換だけを見るための最小エンティティ。 */
function makeEntity(overrides = {}) {
  return {
    x: 200, y: 100, width: 24, height: 16,
    vx: 0, vy: 0, facingRight: true,
    ...overrides,
  };
}

/** テスト専用スペックを一時的に登録して使う。 */
const TEST_KIND = '__test__';
DEBRIS_SPECS[TEST_KIND] = {
  holdFrames: 2,
  burst: 0,   // 放射方向の初速をゼロにして変換だけを検証する
  parts: [{ x: 4, y: 6, w: 8, h: 4, color: '#123456', weight: 1 }],
};

test('右向きならローカル座標がそのままワールドへ平行移動される', () => {
  const [p] = buildDebris(makeEntity(), TEST_KIND);
  assert.equal(p.x, 204);
  assert.equal(p.y, 106);
  assert.equal(p.w, 8);
  assert.equal(p.h, 4);
  assert.equal(p.color, '#123456');
});

test('左向きならX座標が機体幅の内側で反転する', () => {
  const [p] = buildDebris(makeEntity({ facingRight: false }), TEST_KIND);
  assert.equal(p.x, 200 + 24 - 4, 'x は entity.x + width - localX');
  assert.equal(p.y, 106, 'y は反転しない');
});

test('左向きでは初期角度の符号も反転する', () => {
  DEBRIS_SPECS['__angled__'] = {
    holdFrames: 0, burst: 0,
    parts: [{ x: 4, y: 6, w: 8, h: 4, color: '#000', angle: 0.5 }],
  };
  const [right] = buildDebris(makeEntity(), '__angled__');
  const [left] = buildDebris(makeEntity({ facingRight: false }), '__angled__');
  assert.ok(Math.abs(right.angle - 0.5) < 1e-9);
  assert.ok(Math.abs(left.angle + 0.5) < 1e-9);
  delete DEBRIS_SPECS['__angled__'];
});

test('機体の速度が破片の初速に継承される', () => {
  const [p] = buildDebris(makeEntity({ vx: 3, vy: -2 }), TEST_KIND);
  // burst が 0 なので、慣性 + 微小なランダム散らし のみ
  assert.ok(Math.abs(p.vx - 3) < 1.0, `慣性が継承されていない: ${p.vx}`);
  assert.ok(Math.abs(p.vy + 2) < 1.0, `慣性が継承されていない: ${p.vy}`);
});

test('スペックの holdFrames が破片に伝わる', () => {
  const [p] = buildDebris(makeEntity(), TEST_KIND);
  assert.equal(p.hold, 2);
});

test('rotation フックが指定されると機体中心まわりに回転する', () => {
  DEBRIS_SPECS['__rot__'] = {
    holdFrames: 0, burst: 0,
    rotation: () => Math.PI / 2,
    // 機体中心 (12, 8) の真右 4px の点
    parts: [{ x: 16, y: 8, w: 2, h: 2, color: '#000' }],
  };
  const [p] = buildDebris(makeEntity(), '__rot__');
  // 90度回転すると中心の真下へ移る
  assert.ok(Math.abs(p.x - (200 + 12)) < 1e-6, `x=${p.x}`);
  assert.ok(Math.abs(p.y - (100 + 12)) < 1e-6, `y=${p.y}`);
  assert.ok(Math.abs(p.angle - Math.PI / 2) < 1e-9);
  delete DEBRIS_SPECS['__rot__'];
});

test('mirrored かつ rotation が同時に非ゼロだと「先に反転、次に回転」で合成される', () => {
  // 実際の描画（例: EnemyDrone.draw()）は
  //   translate(center) → rotate(rotation) → scale(mirrored ? -1 : 1, 1)
  // の順でキャンバス変換を積む。これは点への適用としては
  // 「先に mirror → 次に rotate」（= R(θ)·M）と同じ。
  //
  // 機体中心 (12, 8) から見て相対座標 (10, 0) の点、θ = 90°、mirrored = true で手計算する:
  //   1. mirror:  (10, 0) -> (-10, 0)
  //   2. rotate 90°: (x,y) -> (x*cos90 - y*sin90, x*sin90 + y*cos90)
  //                  (-10, 0) -> (-10*0 - 0*1, -10*1 + 0*0) = (0, -10)
  // 機体は width=24, height=16 なので中心は (entity.x+12, entity.y+8)。
  // よってワールド座標はその中心から (0, -10) だけ動いた
  // (entity.x+12, entity.y-2) になるはず。
  DEBRIS_SPECS['__mirror_rot__'] = {
    holdFrames: 0, burst: 0,
    rotation: () => Math.PI / 2,
    // 機体中心 (12, 8) の真右 10px、角度 0.4 を持つ点
    parts: [{ x: 22, y: 8, w: 2, h: 2, color: '#000', angle: 0.4 }],
  };
  const entity = makeEntity({ facingRight: false }); // mirrored = true
  const [p] = buildDebris(entity, '__mirror_rot__');

  assert.ok(Math.abs(p.x - (200 + 12 + 0)) < 1e-6, `x=${p.x}`);
  assert.ok(Math.abs(p.y - (100 + 8 - 10)) < 1e-6, `y=${p.y}`);

  // 角度も同じ順序: 先に mirror で符号反転(-0.4)、その後 rotation(90°) を加算
  const expectedAngle = -0.4 + Math.PI / 2;
  assert.ok(Math.abs(p.angle - expectedAngle) < 1e-9, `angle=${p.angle}`);

  delete DEBRIS_SPECS['__mirror_rot__'];
});

test('getDebrisParts があればスペックの静的パーツより優先される', () => {
  const entity = makeEntity();
  entity.getDebrisParts = () => [{ x: 0, y: 0, w: 1, h: 1, color: '#FFF' }];
  const parts = buildDebris(entity, TEST_KIND);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].color, '#FFF');
});

test('未登録の kind では空配列を返す', () => {
  assert.deepEqual(buildDebris(makeEntity(), 'nonexistent'), []);
});

test('segmentPart は線分を回転矩形に変換する', () => {
  const p = segmentPart(0, 0, 3, 4, 2, '#ABCDEF', 0.7);
  assert.equal(p.x, 1.5, '中点');
  assert.equal(p.y, 2);
  assert.equal(p.w, 5, '線分の長さ');
  assert.equal(p.h, 2, '線の太さ');
  assert.ok(Math.abs(p.angle - Math.atan2(4, 3)) < 1e-9);
  assert.equal(p.color, '#ABCDEF');
  assert.equal(p.weight, 0.7);
});

test('EnemyDrone のパーツが機体枠から極端に外れていない', () => {
  const spec = DEBRIS_SPECS.drone;
  assert.ok(spec, 'drone スペックが登録されている');
  assert.ok(spec.parts.length >= 5, `パーツが少なすぎる: ${spec.parts.length}`);
  const W = 24, H = 16;
  for (const part of spec.parts) {
    assert.ok(typeof part.color === 'string' && part.color.length > 0);
    assert.ok(part.w > 0 && part.h > 0);
    assert.ok(part.x >= -W && part.x <= W * 2, `x が範囲外: ${part.x}`);
    assert.ok(part.y >= -H && part.y <= H * 2, `y が範囲外: ${part.y}`);
  }
});

// node:test は test() をこの時点では実行せず、モジュール読み込み完了後に
// まとめて走らせる。そのためここで同期的に delete すると、TEST_KIND を
// 使う全テストより先にスペックが消えてしまう。後片付けは after() に回す。
after(() => {
  delete DEBRIS_SPECS[TEST_KIND];
});
