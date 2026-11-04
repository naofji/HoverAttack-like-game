// main.js の Game はオブジェクトリテラルで、機能群（設定画面・タイトル・ランキング・射撃・爆発・Auto Aim）は
// 別ファイルの同じ形のリテラルを Object.assign(Game, ...) で混ぜている。Object.assign は同名のキーを
// 黙って後勝ちで上書きするので、mixin どうしで名前が重なると片方のメソッドが消えても何も言わない。
// それをここで縛る（tests/map-mixins.test.js と同じ見方）。
//
// Game 本体のリテラルとの重なりは、代入の後では区別がつかない（どちらも列挙可能なただのプロパティ）
// ので縛れていない。mixin へ移すときは、移したメソッドを本体から消し忘れないこと。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';
import { SettingsFlow } from '../src/js/ui/flows/settingsFlow.js';
import { AttractFlow } from '../src/js/ui/flows/attractFlow.js';
import { OnlineFlow } from '../src/js/systems/OnlineFlow.js';
import { CombatActions } from '../src/js/systems/CombatActions.js';
import { SpawnEffects } from '../src/js/systems/SpawnEffects.js';
import { AutoAim } from '../src/js/systems/AutoAim.js';

const MIXINS = { SettingsFlow, AttractFlow, OnlineFlow, CombatActions, SpawnEffects, AutoAim };

test('Game の mixin どうしでメソッド名が重ならない', () => {
  const owner = {};
  for (const [mixinName, mixin] of Object.entries(MIXINS)) {
    for (const key of Object.keys(mixin)) {
      assert.equal(owner[key], undefined, `${key} が ${owner[key]} と ${mixinName} の両方にある`);
      owner[key] = mixinName;
    }
  }
});

test('Game には mixin のメソッドがそのまま入っている（後から別のもので上書きされていない）', () => {
  for (const [mixinName, mixin] of Object.entries(MIXINS)) {
    for (const key of Object.keys(mixin)) {
      assert.equal(Game[key], mixin[key], `${mixinName}.${key} が Game で別のものになっている`);
    }
  }
});
