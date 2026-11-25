// ui/HUD.js は各ゾーンと警報を ui/hud/ の層（alerts / weapons / units / status）に置き、
// Object.assign で HUD.prototype へ混ぜている（2026-11-25）。Object.assign は同名のキーを黙って
// 後勝ちで上書きするので、名前が重なると片方のメソッドが消えても何も言わない。それをここで縛る
// （tests/player-mixins.test.js と同じ見方）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HUD } from '../src/js/ui/HUD.js';
import { HudAlerts } from '../src/js/ui/hud/alerts.js';
import { HudWeapons } from '../src/js/ui/hud/weapons.js';
import { HudUnits } from '../src/js/ui/hud/units.js';
import { HudStatus } from '../src/js/ui/hud/status.js';

const MIXINS = { HudAlerts, HudWeapons, HudUnits, HudStatus };

test('HUD の層どうしでメソッド名が重ならない', () => {
  const owner = {};
  for (const [mixinName, mixin] of Object.entries(MIXINS)) {
    for (const key of Object.keys(mixin)) {
      assert.equal(owner[key], undefined, `${key} が ${owner[key]} と ${mixinName} の両方にある`);
      owner[key] = mixinName;
    }
  }
});

test('HUD の層のメソッドが class 本体の同名メソッドを上書きしていない', () => {
  // class のメソッドは列挙不可。Object.assign は既存のプロパティへ代入するので、class 本体に
  // 同名があると「値は層のもの・列挙不可」のまま残る。列挙可能かどうかで重なりが分かる
  for (const [mixinName, mixin] of Object.entries(MIXINS)) {
    for (const key of Object.keys(mixin)) {
      const desc = Object.getOwnPropertyDescriptor(HUD.prototype, key);
      assert.ok(desc, `${mixinName}.${key} が HUD.prototype に無い`);
      assert.equal(desc.enumerable, true, `${mixinName}.${key} が HUD.js の class 本体の同名メソッドと重なっている`);
      assert.equal(desc.value, mixin[key], `${mixinName}.${key} が後から別のもので上書きされている`);
    }
  }
});

test('HUD の層の中身は関数だけ（値を混ぜると全インスタンスで共有されてしまう）', () => {
  for (const [mixinName, mixin] of Object.entries(MIXINS)) {
    for (const [key, value] of Object.entries(mixin)) {
      assert.equal(typeof value, 'function', `${mixinName}.${key} が関数でない`);
    }
  }
});
