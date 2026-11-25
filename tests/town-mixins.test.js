// world/town/Town.js は中身を層（townQuery / townDamage / townProjectiles / townFalling / townIcicles /
// townEffects）に置き、Object.assign で Town.prototype へ混ぜている（2026-11-25）。Object.assign は同名の
// キーを黙って後勝ちで上書きするので、名前が重なると片方のメソッドが消えても何も言わない。それをここで縛る
// （tests/player-mixins.test.js と同じ見方）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Town } from '../src/js/world/town/Town.js';
import { TownQuery } from '../src/js/world/town/townQuery.js';
import { TownDamage } from '../src/js/world/town/townDamage.js';
import { TownProjectiles } from '../src/js/world/town/townProjectiles.js';
import { TownFalling } from '../src/js/world/town/townFalling.js';
import { TownIcicles } from '../src/js/world/town/townIcicles.js';
import { TownEffects } from '../src/js/world/town/townEffects.js';

const MIXINS = { TownQuery, TownDamage, TownProjectiles, TownFalling, TownIcicles, TownEffects };

test('Town の層どうしでメソッド名が重ならない', () => {
  const owner = {};
  for (const [mixinName, mixin] of Object.entries(MIXINS)) {
    for (const key of Object.keys(mixin)) {
      assert.equal(owner[key], undefined, `${key} が ${owner[key]} と ${mixinName} の両方にある`);
      owner[key] = mixinName;
    }
  }
});

test('Town の層のメソッドが class 本体の同名メソッドを上書きしていない', () => {
  // class のメソッドは列挙不可。Object.assign は既存のプロパティへ代入するので、class 本体に
  // 同名があると「値は層のもの・列挙不可」のまま残る。列挙可能かどうかで重なりが分かる
  for (const [mixinName, mixin] of Object.entries(MIXINS)) {
    for (const key of Object.keys(mixin)) {
      const desc = Object.getOwnPropertyDescriptor(Town.prototype, key);
      assert.ok(desc, `${mixinName}.${key} が Town.prototype に無い`);
      assert.equal(desc.enumerable, true, `${mixinName}.${key} が Town.js の class 本体の同名メソッドと重なっている`);
      assert.equal(desc.value, mixin[key], `${mixinName}.${key} が後から別のもので上書きされている`);
    }
  }
});

test('Town の層の中身は関数だけ（値を混ぜると全インスタンスで共有されてしまう）', () => {
  for (const [mixinName, mixin] of Object.entries(MIXINS)) {
    for (const [key, value] of Object.entries(mixin)) {
      assert.equal(typeof value, 'function', `${mixinName}.${key} が関数でない`);
    }
  }
});
