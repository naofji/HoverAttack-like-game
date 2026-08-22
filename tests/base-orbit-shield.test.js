import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyBase } from '../src/js/entities/EnemyBase.js';
import {
  ENEMY_BASE_SHIELDS, ENEMY_BASE_HP,
  BASE_ORBIT_SHIELD_MISSION, BASE_ORBIT_SHIELD_PANELS, BASE_ORBIT_SHIELD_RADIUS,
  BASE_ORBIT_SHIELD_SPEED, BASE_ORBIT_SHIELD_GUARD_HALF, BASE_ORBIT_SHIELD_HEIGHT,
  BASE_ORBIT_SHIELD_DEPLOY,
} from '../src/js/utils/Constants.js';

function makeGame(missionsCompleted) {
  return {
    missionsCompleted,
    score: 0,
    enemies: [],
    particles: [],
    baseEmergencyAlert: false,
    emergencyTargetBase: null,
    alertCalls: 0,
    spawnSparks: () => { },
    spawnExplosion: () => { },
    triggerBaseEmergencyAlert(base) {
      this.alertCalls++;
      if (this.baseEmergencyAlert) return;
      this.baseEmergencyAlert = true;
      this.emergencyTargetBase = base;
    },
  };
}

/** 6面以降の基地。リングは全て割れていて、展開もすっかり終わった状態にする。 */
function deployedBase(missionsCompleted = BASE_ORBIT_SHIELD_MISSION) {
  const game = makeGame(missionsCompleted);
  const base = new EnemyBase(game, 100, 100);
  base.shields = 0;
  base.startOrbitShield();
  for (let i = 0; i < BASE_ORBIT_SHIELD_DEPLOY + 5; i++) base._updateOrbitShield();
  return { game, base };
}

const CORE_X = 100 + 24 / 2; // ENEMY_BASE_WIDTH は 24
const FROM_RIGHT = CORE_X + 10;
const FROM_LEFT = CORE_X - 10;

test('周回シールドの定数が定義されている', () => {
  assert.equal(BASE_ORBIT_SHIELD_MISSION, 5, '6面以降 = missionsCompleted 5 以上');
  assert.equal(BASE_ORBIT_SHIELD_PANELS, 2);
  assert.equal(BASE_ORBIT_SHIELD_RADIUS, 16);
  assert.ok(BASE_ORBIT_SHIELD_RADIUS < 25, '最内リング(25)の内側に収まっていない');
  assert.equal(BASE_ORBIT_SHIELD_SPEED, 0.030);
  assert.equal(BASE_ORBIT_SHIELD_GUARD_HALF, 0.70);
  assert.equal(BASE_ORBIT_SHIELD_HEIGHT, 34);
  assert.equal(BASE_ORBIT_SHIELD_DEPLOY, 30);
});

test('新しい基地は周回シールドを展開していない', () => {
  const base = new EnemyBase(makeGame(BASE_ORBIT_SHIELD_MISSION), 100, 100);
  assert.equal(base.orbitShieldActive, false);
});

test('6面以降は、最後のリングが割れた瞬間に展開が始まる', () => {
  const game = makeGame(BASE_ORBIT_SHIELD_MISSION);
  const base = new EnemyBase(game, 100, 100);
  for (let i = 0; i < ENEMY_BASE_SHIELDS; i++) base.takeDamage(1, FROM_RIGHT);
  assert.equal(base.shields, 0);
  assert.equal(base.orbitShieldActive, true);
  assert.equal(base.hp, ENEMY_BASE_HP, 'リングを割った勢いでコアまで削れている');
});

test('5面以下ではリングを全部割っても展開しない', () => {
  const game = makeGame(BASE_ORBIT_SHIELD_MISSION - 1);
  const base = new EnemyBase(game, 100, 100);
  for (let i = 0; i < ENEMY_BASE_SHIELDS; i++) base.takeDamage(1, FROM_RIGHT);
  assert.equal(base.orbitShieldActive, false);
});

test('5面以下ではリングを割ったあとの一撃がそのままコアに入る', () => {
  const game = makeGame(BASE_ORBIT_SHIELD_MISSION - 1);
  const base = new EnemyBase(game, 100, 100);
  base.shields = 0;
  base.takeDamage(1, FROM_RIGHT);
  assert.equal(base.hp, ENEMY_BASE_HP - 1);
});

test('リングが残っている間は、ガード中でも今までどおり1枚ずつ削れる', () => {
  const game = makeGame(BASE_ORBIT_SHIELD_MISSION);
  const base = new EnemyBase(game, 100, 100);
  base.orbitShieldActive = true;
  base.orbitPhase = Math.PI / 2; // 羽根は左右の端＝ガード中
  base.orbitDeployTimer = BASE_ORBIT_SHIELD_DEPLOY;
  base.takeDamage(1, FROM_RIGHT);
  assert.equal(base.shields, ENEMY_BASE_SHIELDS - 1, 'リングが削れていない');
});

test('展開中はガードの角度に関係なくコアにダメージが入らない', () => {
  const game = makeGame(BASE_ORBIT_SHIELD_MISSION);
  const base = new EnemyBase(game, 100, 100);
  base.shields = 0;
  base.startOrbitShield();
  base.orbitPhase = 0; // 羽根は正面＝本来なら素通しする位相
  base.takeDamage(1, FROM_RIGHT);
  assert.equal(base.hp, ENEMY_BASE_HP, '展開中に抜かれた');
  assert.equal(base.alive, true);
});

test('展開中はミサイルを連打されても落ちない', () => {
  const game = makeGame(BASE_ORBIT_SHIELD_MISSION);
  const base = new EnemyBase(game, 100, 100);
  base.shields = 0;
  base.startOrbitShield();
  for (let i = 0; i < BASE_ORBIT_SHIELD_DEPLOY; i++) {
    base.takeDamage(1, FROM_RIGHT);
    base._updateOrbitShield();
  }
  assert.equal(base.hp, ENEMY_BASE_HP, '展開が終わる前に削られた');
});

test('展開が終われば、羽根が開いている位相ではコアに届く', () => {
  const { base } = deployedBase();
  base.orbitPhase = 0; // 正面と真裏＝左右どちらも開いている
  base.takeDamage(1, FROM_RIGHT);
  assert.equal(base.hp, ENEMY_BASE_HP - 1);
});

test('展開が終わったあと、ガード中の被弾はコアに届かない', () => {
  const { base } = deployedBase();
  base.orbitPhase = Math.PI / 2;
  base.takeDamage(1, FROM_RIGHT);
  assert.equal(base.hp, ENEMY_BASE_HP, '右から来た攻撃が右端の羽根を抜けた');
  base.takeDamage(1, FROM_LEFT);
  assert.equal(base.hp, ENEMY_BASE_HP, '左から来た攻撃が左端の羽根を抜けた');
});

test('弾かれた被弾では緊急防衛アラートを立てない', () => {
  const { game, base } = deployedBase();
  base.orbitPhase = Math.PI / 2;
  base.takeDamage(1, FROM_RIGHT);
  assert.equal(game.alertCalls, 0, '弾いたのにアラートが飛んだ');
  assert.equal(game.baseEmergencyAlert, false);
});

test('弾かれた被弾ではスコアも動かない', () => {
  const { game, base } = deployedBase();
  base.orbitPhase = Math.PI / 2;
  base.takeDamage(1, FROM_RIGHT);
  assert.equal(game.score, 0);
});

test('hitX を渡さない呼び出しは今までどおり素通しする', () => {
  const { base } = deployedBase();
  base.orbitPhase = Math.PI / 2; // ガード中でも
  base.takeDamage(1);
  assert.equal(base.hp, ENEMY_BASE_HP - 1, '既存の takeDamage(amount) の挙動が変わった');
});

test('isOrbitGuarded は外から見たガード状態を返す（MG の跳弾演出が使う）', () => {
  const { base } = deployedBase();
  base.orbitPhase = Math.PI / 2;
  assert.equal(base.isOrbitGuarded(FROM_RIGHT), true);
  base.orbitPhase = 0;
  assert.equal(base.isOrbitGuarded(FROM_RIGHT), false);
});

test('展開が終わると羽根は所定の半径まで出きり、規定の速さで回る', () => {
  const { base } = deployedBase();
  assert.ok(Math.abs(base.orbitRadius() - BASE_ORBIT_SHIELD_RADIUS) < 1e-9);
  const before = base.orbitPhase;
  base._updateOrbitShield();
  assert.ok(Math.abs((base.orbitPhase - before) - BASE_ORBIT_SHIELD_SPEED) < 1e-9);
});

test('展開の途中では羽根はまだ出きっていない', () => {
  const game = makeGame(BASE_ORBIT_SHIELD_MISSION);
  const base = new EnemyBase(game, 100, 100);
  base.shields = 0;
  base.startOrbitShield();
  assert.equal(base.orbitRadius(), 0, 'コアの中心から出ていない');
  for (let i = 0; i < BASE_ORBIT_SHIELD_DEPLOY / 2; i++) base._updateOrbitShield();
  const mid = base.orbitRadius();
  assert.ok(mid > 0 && mid < BASE_ORBIT_SHIELD_RADIUS, `途中の半径が想定外: ${mid}`);
});

test('展開が終わるまでは isOrbitGuarded が常に true（描画側も無敵と同じ扱いにする）', () => {
  const game = makeGame(BASE_ORBIT_SHIELD_MISSION);
  const base = new EnemyBase(game, 100, 100);
  base.shields = 0;
  base.startOrbitShield();
  base.orbitPhase = 0;
  assert.equal(base.isOrbitGuarded(FROM_RIGHT), true);
});

test('展開していない基地はガードしない', () => {
  const base = new EnemyBase(makeGame(BASE_ORBIT_SHIELD_MISSION), 100, 100);
  assert.equal(base.isOrbitGuarded(FROM_RIGHT), false);
});
