// entities/EnemyBase.js は描画を entities/base/draw.js の mixin に置き、Object.assign で
// EnemyBase.prototype へ混ぜている（2026-11-24 に分けた。tests/player-mixins.test.js と同じ見方）。
// Object.assign は同名のキーを黙って上書きするので、class 本体と同じ名前を mixin に置くと
// 片方が消えても何も言わない。それをここで縛る。
//
// ソース文字列を grep せず、import した実物のオブジェクトと prototype を見る。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyBase } from '../src/js/entities/EnemyBase.js';
import { BaseDraw } from '../src/js/entities/base/draw.js';

test('BaseDraw のメソッドが class 本体の同名メソッドを上書きしていない', () => {
    // class のメソッドは列挙不可で、Object.assign は既存のプロパティへ代入するので、
    // class 本体に同名があると「値は mixin のもの・列挙不可」のまま残る
    for (const key of Object.keys(BaseDraw)) {
        const desc = Object.getOwnPropertyDescriptor(EnemyBase.prototype, key);
        assert.ok(desc, `BaseDraw.${key} が EnemyBase.prototype に無い`);
        assert.equal(desc.enumerable, true, `BaseDraw.${key} が EnemyBase.js の class 本体の同名メソッドと重なっている`);
        assert.equal(desc.value, BaseDraw[key], `BaseDraw.${key} が後から別のもので上書きされている`);
    }
});

test('BaseDraw の中身は関数だけ（値を混ぜると全インスタンスで共有されてしまう）', () => {
    for (const [key, value] of Object.entries(BaseDraw)) {
        assert.equal(typeof value, 'function', `BaseDraw.${key} が関数でない`);
    }
});

test('draw が混ざっている（入口の draw が無いと基地が描かれない）', () => {
    assert.equal(EnemyBase.prototype.draw, BaseDraw.draw);
});
