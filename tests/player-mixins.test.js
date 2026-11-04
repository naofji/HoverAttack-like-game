// entities/Player.js は描画を entities/player/draw.js の mixin に置き、坂の手順（slopeBody.js）と
// いっしょに Object.assign で Player.prototype へ混ぜている。Object.assign は同名のキーを黙って
// 後勝ちで上書きするので、名前が重なると片方のメソッドが消えても何も言わない。それをここで縛る
// （tests/map-mixins.test.js と同じ見方）。
//
// ソース文字列を grep せず、import した実物のオブジェクトと prototype を見る。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { PlayerDraw } from '../src/js/entities/player/draw.js';
import { SlopeBody } from '../src/js/entities/slopeBody.js';

const MIXINS = { SlopeBody, PlayerDraw };

test('Player の mixin どうしでメソッド名が重ならない', () => {
  const owner = {};
  for (const [mixinName, mixin] of Object.entries(MIXINS)) {
    for (const key of Object.keys(mixin)) {
      assert.equal(owner[key], undefined, `${key} が ${owner[key]} と ${mixinName} の両方にある`);
      owner[key] = mixinName;
    }
  }
});

test('Player の mixin のメソッドが class 本体の同名メソッドを上書きしていない', () => {
  // class のメソッドは列挙不可で、Object.assign は既存のプロパティへ代入するので、
  // class 本体に同名があると「値は mixin のもの・列挙不可」のまま残る。
  // 列挙可能かどうかで、class 本体と重なったかが分かる
  for (const [mixinName, mixin] of Object.entries(MIXINS)) {
    for (const key of Object.keys(mixin)) {
      const desc = Object.getOwnPropertyDescriptor(Player.prototype, key);
      assert.ok(desc, `${mixinName}.${key} が Player.prototype に無い`);
      assert.equal(desc.enumerable, true, `${mixinName}.${key} が Player.js の class 本体の同名メソッドと重なっている`);
      assert.equal(desc.value, mixin[key], `${mixinName}.${key} が後から別のもので上書きされている`);
    }
  }
});

test('PlayerDraw の中身は関数だけ（値を混ぜると全インスタンスで共有されてしまう）', () => {
  for (const [key, value] of Object.entries(PlayerDraw)) {
    assert.equal(typeof value, 'function', `PlayerDraw.${key} が関数でない`);
  }
});
