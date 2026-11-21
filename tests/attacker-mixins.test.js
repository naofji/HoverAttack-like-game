// 敵アタッカーの層（attacker/*.js）どうしで名前が重なると、Object.assign の後勝ちで
// 黙って上書きされる。tests/map-mixins.test.js と同じ見張り（2026-11-22、rollerDash を足すときに作った）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyAttacker } from '../src/js/entities/EnemyAttacker.js';
import { AttackerMovement } from '../src/js/entities/attacker/movement.js';
import { AttackerCombat } from '../src/js/entities/attacker/combat.js';
import { AttackerCollision } from '../src/js/entities/attacker/collision.js';
import { AttackerDraw } from '../src/js/entities/attacker/draw.js';
import { AttackerLegs } from '../src/js/entities/attacker/legs.js';
import { AttackerAfterimage } from '../src/js/entities/attacker/afterimage.js';
import { AttackerRollerDash } from '../src/js/entities/attacker/rollerDash.js';

const MIXINS = {
    AttackerMovement, AttackerCombat, AttackerCollision, AttackerDraw, AttackerLegs,
    AttackerAfterimage, AttackerRollerDash,
};

test('attacker の層どうしで名前が重ならない', () => {
    const owner = new Map();
    for (const [name, mixin] of Object.entries(MIXINS)) {
        for (const key of Object.keys(mixin)) {
            assert.ok(!owner.has(key), `${key} が ${owner.get(key)} と ${name} の両方にある`);
            owner.set(key, name);
        }
    }
});

test('各層の中身がそのまま EnemyAttacker.prototype に入っている', () => {
    for (const [name, mixin] of Object.entries(MIXINS)) {
        for (const key of Object.keys(mixin)) {
            assert.equal(EnemyAttacker.prototype[key], mixin[key], `${name}.${key} が別のもので上書きされている`);
        }
    }
});
