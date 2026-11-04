// world/Map.js は責務ごとのメソッドを別ファイルの mixin に置き、Object.assign で
// Map.prototype へ混ぜている。Object.assign は同名のキーを黙って後勝ちで上書きするので、
// 名前が重なると片方のメソッドが消えても何も言わない。それをここで縛る。
//
// ソース文字列を grep せず、import した実物のオブジェクトと prototype を見る。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Map as GameMap } from '../src/js/world/Map.js';
import { MapRender } from '../src/js/world/mapRender.js';
import { MapMiniMap } from '../src/js/world/mapMiniMap.js';
import { MapWater } from '../src/js/world/mapWater.js';
import { MapShapes } from '../src/js/world/mapShapes.js';

const MIXINS = { MapRender, MapMiniMap, MapWater, MapShapes };

test('mixin どうしでメソッド名が重ならない', () => {
  const owner = {};
  for (const [mixinName, mixin] of Object.entries(MIXINS)) {
    for (const key of Object.keys(mixin)) {
      assert.equal(owner[key], undefined, `${key} が ${owner[key]} と ${mixinName} の両方にある`);
      owner[key] = mixinName;
    }
  }
});

test('mixin のメソッドが class 本体の同名メソッドを上書きしていない', () => {
  // class のメソッドは列挙不可で、Object.assign は既存のプロパティへ代入するので、
  // class 本体に同名があると「値は mixin のもの・列挙不可」のまま残る。
  // 列挙可能かどうかで、class 本体と重なったかが分かる
  for (const [mixinName, mixin] of Object.entries(MIXINS)) {
    for (const key of Object.keys(mixin)) {
      const desc = Object.getOwnPropertyDescriptor(GameMap.prototype, key);
      assert.ok(desc, `${mixinName}.${key} が Map.prototype に無い`);
      assert.equal(desc.enumerable, true, `${mixinName}.${key} が Map.js の class 本体の同名メソッドと重なっている`);
      assert.equal(desc.value, mixin[key], `${mixinName}.${key} が後から別のもので上書きされている`);
    }
  }
});

test('mixin の中身は関数だけ（値を混ぜると全インスタンスで共有されてしまう）', () => {
  for (const [mixinName, mixin] of Object.entries(MIXINS)) {
    for (const [key, value] of Object.entries(mixin)) {
      assert.equal(typeof value, 'function', `${mixinName}.${key} が関数でない`);
    }
  }
});
