import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildDebris, DEBRIS_SPECS } from '../src/js/entities/debris/index.js';
import { segmentPart } from '../src/js/entities/debris/shapes.js';
import { DEBRIS_SUBDIVIDE } from '../src/js/utils/Constants.js';

/** 乱数の影響を消して変換だけを見るための最小エンティティ。 */
function makeEntity(overrides = {}) {
  return {
    x: 200, y: 100, width: 24, height: 16,
    vx: 0, vy: 0, facingRight: true,
    ...overrides,
  };
}

/**
 * 1つのパーツは DEBRIS_SUBDIVIDE^2 個の破片に分割されて飛ぶ。
 * 分割片のオフセットはパーツ中心について対称なので、重心は元のパーツ中心と
 * 厳密に一致し、平均速度も元のパーツの速度と一致する。座標変換の検証は
 * この重心・平均に対して行えば、分割前と同じ精度で確かめられる。
 */
function centroid(debris) {
  const n = debris.length;
  const sum = debris.reduce((acc, d) => ({
    x: acc.x + d.x, y: acc.y + d.y, vx: acc.vx + d.vx, vy: acc.vy + d.vy,
  }), { x: 0, y: 0, vx: 0, vy: 0 });
  return { x: sum.x / n, y: sum.y / n, vx: sum.vx / n, vy: sum.vy / n, count: n };
}

/** 1パーツぶんの分割片が占める総面積は、元のパーツの面積と等しい。 */
function totalArea(debris) {
  return debris.reduce((acc, d) => acc + d.w * d.h, 0);
}

/** テスト専用スペックを一時的に登録して使う。 */
const TEST_KIND = '__test__';
DEBRIS_SPECS[TEST_KIND] = {
  holdFrames: 2,
  burst: 0,   // 放射方向の初速をゼロにして変換だけを検証する
  parts: [{ x: 4, y: 6, w: 8, h: 4, color: '#123456', weight: 1 }],
};

test('1つのパーツが 2x2 に分割され、面積の合計は元のパーツと等しい', () => {
  const debris = buildDebris(makeEntity(), TEST_KIND);
  assert.equal(debris.length, DEBRIS_SUBDIVIDE * DEBRIS_SUBDIVIDE);
  assert.equal(totalArea(debris), 8 * 4, '分割で面積が増減してはいけない');
  for (const d of debris) {
    assert.equal(d.w, 8 / DEBRIS_SUBDIVIDE);
    assert.equal(d.h, 4 / DEBRIS_SUBDIVIDE);
    assert.equal(d.color, '#123456');
  }
});

test('分割片は平均として元のパーツ中心から外向きへ開く', () => {
  // 片ごとに乱数で散らしているので、1片単位では内向きになることもある。
  // 「平均としては必ず外向き」であることを多数回の試行で確かめる。
  let sum = 0;
  let outward = 0;
  let n = 0;
  for (let i = 0; i < 300; i++) {
    const debris = buildDebris(makeEntity(), TEST_KIND);
    const c = centroid(debris);
    for (const d of debris) {
      const ox = d.x - c.x;
      const oy = d.y - c.y;
      const dot = ox * (d.vx - c.vx) + oy * (d.vy - c.vy);
      sum += dot;
      if (dot > 0) outward++;
      n++;
    }
  }
  assert.ok(sum / n > 0.5, `平均が外向きでない: ${sum / n}`);
  assert.ok(outward / n > 0.7, `外向きの割合が低すぎる: ${outward / n}`);
});

test('分割片は互いに異なる速度と角速度を持つ（動きが単調にならない）', () => {
  // 同じパーツから出た4片が同一の動きだと、全パーツが同じ開き方をして単調に見える。
  const debris = buildDebris(makeEntity({ vx: 2, vy: -1 }), TEST_KIND);
  const key = (d) => `${d.vx.toFixed(6)},${d.vy.toFixed(6)},${d.spin.toFixed(6)}`;
  const distinct = new Set(debris.map(key));
  assert.equal(distinct.size, debris.length, '分割片の動きが重複している');

  // 開く方向の違いだけでなく、大きさにもばらつきがあること
  const speeds = debris.map((d) => Math.hypot(d.vx, d.vy));
  const spread = Math.max(...speeds) - Math.min(...speeds);
  assert.ok(spread > 1e-6, `速さがすべて同じ: ${speeds}`);
});

test('右向きならローカル座標がそのままワールドへ平行移動される', () => {
  const c = centroid(buildDebris(makeEntity(), TEST_KIND));
  assert.ok(Math.abs(c.x - 204) < 1e-9, `x=${c.x}`);
  assert.ok(Math.abs(c.y - 106) < 1e-9, `y=${c.y}`);
});

test('左向きならX座標が機体幅の内側で反転する', () => {
  const c = centroid(buildDebris(makeEntity({ facingRight: false }), TEST_KIND));
  assert.ok(Math.abs(c.x - (200 + 24 - 4)) < 1e-9, 'x は entity.x + width - localX');
  assert.ok(Math.abs(c.y - 106) < 1e-9, 'y は反転しない');
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
  // burst が 0 なので、慣性 + 微小なランダム散らし のみ。
  // 分割片の開きは中心対称なので平均を取ると打ち消える。
  const c = centroid(buildDebris(makeEntity({ vx: 3, vy: -2 }), TEST_KIND));
  assert.ok(Math.abs(c.vx - 3) < 1.0, `慣性が継承されていない: ${c.vx}`);
  assert.ok(Math.abs(c.vy + 2) < 1.0, `慣性が継承されていない: ${c.vy}`);
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
  const debris = buildDebris(makeEntity(), '__rot__');
  const c = centroid(debris);
  // 90度回転すると中心の真下へ移る
  assert.ok(Math.abs(c.x - (200 + 12)) < 1e-6, `x=${c.x}`);
  assert.ok(Math.abs(c.y - (100 + 12)) < 1e-6, `y=${c.y}`);
  for (const d of debris) {
    assert.ok(Math.abs(d.angle - Math.PI / 2) < 1e-9, '分割片は元パーツの角度を保つ');
  }
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
  const debris = buildDebris(entity, '__mirror_rot__');
  const c = centroid(debris);

  assert.ok(Math.abs(c.x - (200 + 12 + 0)) < 1e-6, `x=${c.x}`);
  assert.ok(Math.abs(c.y - (100 + 8 - 10)) < 1e-6, `y=${c.y}`);

  // 角度も同じ順序: 先に mirror で符号反転(-0.4)、その後 rotation(90°) を加算
  const expectedAngle = -0.4 + Math.PI / 2;
  for (const d of debris) {
    assert.ok(Math.abs(d.angle - expectedAngle) < 1e-9, `angle=${d.angle}`);
  }

  delete DEBRIS_SPECS['__mirror_rot__'];
});

test('getDebrisParts があればスペックの静的パーツより優先される', () => {
  const entity = makeEntity();
  entity.getDebrisParts = () => [{ x: 0, y: 0, w: 1, h: 1, color: '#FFF' }];
  const debris = buildDebris(entity, TEST_KIND);
  assert.equal(debris.length, DEBRIS_SUBDIVIDE * DEBRIS_SUBDIVIDE, '1パーツぶんだけ出る');
  assert.ok(debris.every((d) => d.color === '#FFF'));
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

test('EnemyDrone のパーツが基本的な形を満たす（座標と draw() の一致は debris-static-parts-match-draw.test.js で検証）', () => {
  const spec = DEBRIS_SPECS.drone;
  assert.ok(spec, 'drone スペックが登録されている');
  assert.ok(spec.parts.length >= 5, `パーツが少なすぎる: ${spec.parts.length}`);
  for (const part of spec.parts) {
    assert.ok(typeof part.color === 'string' && part.color.length > 0);
    assert.ok(part.w > 0 && part.h > 0);
  }
});

// node:test は test() をこの時点では実行せず、モジュール読み込み完了後に
// まとめて走らせる。そのためここで同期的に delete すると、TEST_KIND を
// 使う全テストより先にスペックが消えてしまう。後片付けは after() に回す。
after(() => {
  delete DEBRIS_SPECS[TEST_KIND];
});
