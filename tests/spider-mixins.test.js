// entities/EnemySpider.js は中身を層（spider/crawl・air・combat・draw）に置き、Object.assign で
// EnemySpider.prototype へ混ぜている（2026-11-25）。Object.assign は同名のキーを黙って後勝ちで上書きするので、
// 名前が重なると片方のメソッドが消えても何も言わない。それをここで縛る（tests/hud-mixins.test.js と同じ見方）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemySpider } from '../src/js/entities/EnemySpider.js';
import { SpiderCrawl } from '../src/js/entities/spider/crawl.js';
import { SpiderAir } from '../src/js/entities/spider/air.js';
import { SpiderCombat } from '../src/js/entities/spider/combat.js';
import { SpiderDraw } from '../src/js/entities/spider/draw.js';

const MIXINS = { SpiderCrawl, SpiderAir, SpiderCombat, SpiderDraw };

test('スパイダーの層どうしでメソッド名が重ならない', () => {
  const owner = {};
  for (const [mixinName, mixin] of Object.entries(MIXINS)) {
    for (const key of Object.keys(mixin)) {
      assert.equal(owner[key], undefined, `${key} が ${owner[key]} と ${mixinName} の両方にある`);
      owner[key] = mixinName;
    }
  }
});

test('スパイダーの層のメソッドが class 本体の同名メソッドを上書きしていない', () => {
  // class のメソッドは列挙不可。Object.assign は既存のプロパティへ代入するので、class 本体に
  // 同名があると「値は層のもの・列挙不可」のまま残る。列挙可能かどうかで重なりが分かる
  for (const [mixinName, mixin] of Object.entries(MIXINS)) {
    for (const key of Object.keys(mixin)) {
      const desc = Object.getOwnPropertyDescriptor(EnemySpider.prototype, key);
      assert.ok(desc, `${mixinName}.${key} が EnemySpider.prototype に無い`);
      assert.equal(desc.enumerable, true, `${mixinName}.${key} が EnemySpider.js の class 本体の同名メソッドと重なっている`);
      assert.equal(desc.value, mixin[key], `${mixinName}.${key} が後から別のもので上書きされている`);
      assert.equal(typeof desc.value, 'function', `${mixinName}.${key} が関数でない`);
    }
  }
});
