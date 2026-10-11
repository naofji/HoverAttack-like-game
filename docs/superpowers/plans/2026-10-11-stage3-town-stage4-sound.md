# 3面の町並み 段4（音）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 町が崩れると低い地鳴りと瓦礫のガラガラが鳴り（大きい崩壊ほど大きく長く、小さい破片が砕けたら小さく）、画面の近くで火が燃えているあいだは低いゴーッとパチパチのループが鳴る（近い火元が多いほど大きく、火元の位置から聞こえる）。どちらも Web Audio の手続き合成で、音量は A特性で実測して既存の音（爆発・バリアの唸り）との相対 dB をテストで縛る。

**Architecture:** 音そのものは新しい `src/js/audio/sounds/townSounds.js`（`AudioTownSounds`。`AudioManager.prototype` に `Object.assign` で混ぜる。fortressSounds.js と同じ形）。音の設計（崩れる音の部品の並び・パチパチのバッファ）は純関数 `townCollapseVoices` / `crackleSamples` に切り出し、WebAudio 版と node のオフライン再現（`tools/render-town-sounds.mjs`）が同じものを使う（CLAUDE.md「時間設計など両方が要るロジックは純粋関数に切り出して共有する」）。爆発音との比較のため、`_noiseBurst` のオフライン再現 `noiseBurstGen` を `tests/helpers/dsp.js` に足し、`playExplosion` の数値を表 `EXPLOSION_BURSTS` に出して両方が読む。鳴らすのは町の側: `Town._flushEffects` が画面の近くの崩壊・破片の砕けのうち一番大きい1つで `playTownCollapse` を呼び、`Town.update` が `FireSystem.soundLevel(view)` から `startTownFire` / `stopTownFire` を呼ぶ。ミッションを抜けるときは `stopLoopingSe` が炎のループも止める。

**Tech Stack:** バニラ ES modules、Web Audio API、`node --test`。

**Spec:** `docs/superpowers/specs/2026-10-11-stage3-town-design.md`（4章「音」、テストの表の「音」）

**範囲:** spec の段4だけ。爆発物の爆発は今の `playExplosion` のまま（spec 4章「新しい音は作らない」）。

## Global Constraints

- `git add -A` / `git add .` は使わない。変更したファイルを明示して add する
- `src/js/main.js` の `debugStartMission: 2` と、`src/js/utils/Constants.js` のユーザーの IDE 自動整形（町と関係ない行）は**未コミットのまま残す**。`git checkout` / `restore` / `stash` / `reset` を打たない。Constants.js は「町の節だけを HEAD に差し込んでステージする」手順（下）でコミットする。**この段では main.js を触らない**
- 一時的にわざと壊す確認は、控えのファイルを作ってから書き換え、控えから戻す
- コメントは日本語で「なぜそうしたか」。数値には根拠（実測の dB）
- 調整用の数値は `Constants.js` の `TOWN_*`
- **音は全部手続き合成。** オーディオファイルは足さない
- **WebAudio 版とオフライン再現は対。片方だけ変えない**（`playTownCollapse` ↔ `collapseGen`、`startTownFire` ↔ `fireLoopGen`、`_noiseBurst` ↔ `noiseBurstGen`）
- **音量は A特性で実測して縛る**（`tests/helpers/dsp.js` の `transientLevel` / `aWeightedRms`）。目安（spec 4章）: 崩壊は大きい爆発より 3dB 小さく、破片が砕ける音は小さい爆発より小さく、炎のループは最大でもバリアの唸り（-48dB）以下
- 新しい `play*` / `start*` / `stop*` は引数なしで呼んでも例外を投げない（`tests/audio-manager.test.js`）。効果音は SE バスを通す（`_out` / `_seDest`。`tests/se-bus.test.js`）
- 音と粒は画面の中かそのすぐ外（`VIEW_CULL_MARGIN`）だけ（spec 2章「画面の外」）
- テストは `npm test`。ソース文字列を grep するテストは書かない。テストを書いたら、わざと壊して赤くなることを確かめる
- 既知の失敗: `湧き位置は重複しない`（面7、週によって落ちる）。全体のゲートは `npm test -- --test-skip-pattern=湧き位置は重複しない`

**Constants.js のステージ手順**（町の節は `// --- 3面の町並み（props` から、町でない次の `// ---` の節の頭まで。町の節はファイルの末尾にある）:

```bash
S=<scratchpad>
git show HEAD:src/js/utils/Constants.js > $S/const-head.js
python3 - $S/const-head.js <<'EOF'
import sys
head = open(sys.argv[1]).read(); work = open('src/js/utils/Constants.js').read()
def sect(s):
    i = s.index('// --- 3面の町並み（props')
    j = s.index('export const TOWN_CEIL_KEEP_BELOW')
    while True:
        j = s.find('\n// ---', j + 1)
        if j < 0: return i, len(s)
        if not s.startswith('\n// --- 3面の町並み', j): return i, j
hi, hj = sect(head); wi, wj = sect(work)
open(sys.argv[1] + '.staged', 'w').write(head[:hi] + work[wi:wj] + head[hj:])
EOF
git update-index --cacheinfo 100644,$(git hash-object -w $S/const-head.js.staged),src/js/utils/Constants.js
git diff --cached src/js/utils/Constants.js   # 町の行だけが出ること
```

段4の定数の節は、ファイルの末尾（段3bの `TOWN_EXPLOSIONS_PER_SECOND` の後ろ）に `// --- 3面の町並み 段4（音）---` で始める。

## 計画の前に測ったこと（2026-10-11、scratch で `dsp.js` の部品を使って）

| 音 | A特性 |
|---|---|
| 大きい爆発（`playExplosion(true)`、窓 1.2秒） | -44.1 dB |
| 小さい爆発（`playExplosion(false)`、窓 0.8秒） | -58.0 dB |
| バリアの唸り（`aWeightedRms`） | -48.1 dB |
| 地鳴り（ローパス 400→60Hz、1.2秒）ゲイン 0.3 / 0.6 / 1.0 | -53.5 / -47.8 / -43.6 dB |
| ガラガラ（バンドパス Q3 を 10発、0.6秒にばらまく）ゲイン 0.1 / 0.2 / 0.4 | -55.2 / -49.9 / -44.5 dB |
| 炎のゴーッ（ローパス 300Hz のループ）ゲイン 0.04 | -65.2 dB |
| 炎のパチパチ（14回/秒のクリック、ハイパス 1800Hz）ゲイン 0.04 | -69.4 dB |

ここから初期値を決めた: 地鳴り 0.5・ガラガラ 0.15 で崩壊は約 -47.6dB（大きい爆発の -3.5dB）。ゴーッ 0.2・パチパチ 0.25 で炎は約 -49dB（唸りの -1dB）。**実装後に Task 2・3 のテストと道具で測り直し、外れたらゲインだけを動かす。**

## この計画で決めたこと（spec が決めていない所）

- **崩れる音の大きさは、崩れたかけらの数で決める**（崩壊は崩壊の時点で残っていたかけら、破片は破片のかけら）。`k = (かけら / 160)^0.75` を 0.1〜1 に収める。160 は塔1棟の崩壊の大きさ。0.75 乗にしたのは、平方根だと 20 かけらの破片が小さい爆発より大きく鳴るため（scratch の実測）
- **「80ms 以内はまとめる」は2段でやる。** 1 tick の中では町の側が一番大きい1つだけを渡す（グレネード1発で何棟も同時に崩れるのが一番多い）。tick をまたぐ分は `playTownCollapse` が覚えておき、80ms 以内に来た「前より小さい音」は鳴らさない。前より大きい音は鳴らす（待って比べると、崩れた瞬間から音が遅れる）
- **炎のループの強さ** = √(Σ 火元ごとの位置の音量 / 10) を 1 で頭打ち。位置の音量は既存の `positionalVolume`（画面の中は 1、外は下がって1画面ぶんで 0）。左右は火元の位置の重み付き平均。√ にしたのは、火元1つでも聞こえるように（1つで -10dB）
- **強さが 0 になったら `stopTownFire`**（0.4秒で引く）。0 の音量で鳴らし続ける形（バリアの唸り）にしないのは、3面を通して火の無い時間のほうが長いため

## Review Focus

1. **燃えているあいだにミッションを抜ける**（クリア・ゲームオーバー・設定画面・タイトルへ）: 炎のループが残らない（`stopLoopingSe` が止める）（Task 3 にテスト）
2. **1 tick に何棟も崩れる**（密集した村にグレネード）: 崩れる音は1回、一番大きいもの（Task 4 にテスト）
3. **画面の外の崩壊・遠くの火**: 崩れる音は鳴らない。遠くの火だけなら炎のループは小さいか止まる（Task 4 にテスト）
4. **音の出せない環境**（node、AudioContext が無い）: 新しいメソッドを引数なしで呼んでも例外を投げない（Task 2・3 にテスト）
5. **音量の取り違え**（ハイパスでパチパチのエネルギーが捨てられて聞こえない・崩壊が爆発より大きい）: A特性の相対 dB で上下を縛る（Task 2・3 にテスト）

---

## ファイル構成

| ファイル | 役割 | Task |
|---|---|---|
| `tests/helpers/dsp.js` | 変更: `biquad` に `'highpass'`、係数の関数 `biquadCoeffs`、`_noiseBurst` の再現 `noiseBurstGen` | 1 |
| `src/js/audio/sounds/playerSounds.js` | 変更: `playExplosion` の数値を `EXPLOSION_BURSTS` に出す（音は変えない） | 1 |
| `src/js/audio/sounds/townSounds.js` | 新規: `townCollapseScale` / `townCollapseVoices` / `crackleSamples` と `AudioTownSounds`（`playTownCollapse` / `startTownFire` / `stopTownFire`） | 2・3 |
| `src/js/audio/AudioManager.js` | 変更: `AudioTownSounds` を混ぜる | 2 |
| `src/js/audio/engine/seBus.js` | 変更: `stopLoopingSe` が `stopTownFire` も呼ぶ | 3 |
| `tools/render-town-sounds.mjs` | 新規: 町の音を WAV に書き出し、A特性で測る。`collapseGen` / `fireLoopGen` / `explosionGen` を export（テストが読む） | 2・3 |
| `src/js/world/town/fire.js` | 変更: `soundLevel(view)` | 4 |
| `src/js/world/town/Town.js` | 変更: `_flushEffects` で崩れる音、`update` で炎のループ。破片の砕けの注文にかけらの数 | 4 |
| `src/js/audio/CLAUDE.md` | 変更: 試聴用の書き出しに `render-town-sounds.mjs` を1行 | 4 |
| `src/js/utils/Constants.js` | 変更: 段4の定数 | 2・3・4 |

---

### Task 1: 爆発音のオフライン再現（比べる相手を測れるようにする）

**Files:**
- Modify: `tests/helpers/dsp.js`（`biquad` と、その下に `biquadCoeffs` / `noiseBurstGen`）
- Modify: `src/js/audio/sounds/playerSounds.js:97-109`（`playExplosion`）
- Test: `tests/dsp-noise-burst.test.js`（新規）、`tests/se-synthesis.test.js`（そのまま通ること）

**Interfaces:**
- Produces:
  - `biquadCoeffs(type, f0, Q) → [b0, b1, b2, a1, a2]`（a0 で割った後。`'lowpass' | 'bandpass' | 'highpass'`）。`biquad` はこれを使う形にする（値は変えない）
  - `noiseBurstGen({ gain, dur, end = 0.001, from, to, sweepDur = dur, Q = 1 }, seed = 3) → (i) => sample` — `AudioOutput._noiseBurst` と同じ設計（ローパスを `from` から `to` へ指数で掃引し `sweepDur` 以後は `to`、ゲインを `gain` から `end` へ `dur` かけて指数で落とし、`dur` で止まる）。Q の既定 1 は WebAudio の BiquadFilterNode の既定値
  - `EXPLOSION_BURSTS = { large: {gain, dur, end, from, to, sweepDur}, small: {...} }`（playerSounds.js から export）

- [ ] **Step 1: 失敗するテストを書く**

`tests/dsp-noise-burst.test.js`:

```js
// _noiseBurst のオフライン再現（tests/helpers/dsp.js の noiseBurstGen）。
// 町の崩れる音を爆発音と比べて縛るために要る（段4。se-synthesis.test.js の冒頭にあるとおり、
// これまで爆発はオフライン再現が無く、音量を実測できなかった）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    SAMPLE_RATE, biquad, whiteNoise, noiseBurstGen, transientLevel, db,
} from './helpers/dsp.js';
import { EXPLOSION_BURSTS } from '../src/js/audio/sounds/playerSounds.js';

test('掃引しない noiseBurstGen は、固定のローパスに通したノイズに包絡を掛けたものと同じ', () => {
    const o = { gain: 0.3, dur: 0.2, end: 0.001, from: 800 };
    const gen = noiseBurstGen(o, 5);
    const n = whiteNoise(Math.ceil(o.dur * SAMPLE_RATE) + 2, 5);
    const lp = biquad('lowpass', 800, 1);
    for (let i = 0; i < 2000; i++) {
        const t = i / SAMPLE_RATE;
        const want = lp(n[i]) * o.gain * Math.pow(o.end / o.gain, t / o.dur);
        assert.ok(Math.abs(gen(i) - want) < 1e-12, `i=${i}`);
    }
    assert.equal(gen(Math.ceil(o.dur * SAMPLE_RATE) + 10), 0, 'dur の後は止まる');
});

test('掃引すると後半ほど暗くなる（A特性の音量が下がる）', () => {
    const sweep = noiseBurstGen({ gain: 0.3, dur: 0.4, end: 0.3, from: 2000, to: 60 }, 5);
    const flat = noiseBurstGen({ gain: 0.3, dur: 0.4, end: 0.3, from: 2000 }, 5);
    assert.ok(db(transientLevel(sweep, 0.4) / transientLevel(flat, 0.4)) < -3);
});

test('爆発の表: 大きい爆発は小さい爆発より大きく聞こえる（再現で測れる）', () => {
    const big = transientLevel(noiseBurstGen(EXPLOSION_BURSTS.large), 1.2);
    const small = transientLevel(noiseBurstGen(EXPLOSION_BURSTS.small), 1.2);
    assert.ok(db(big / small) > 6, `差 ${db(big / small).toFixed(1)}dB`);
});
```

- [ ] **Step 2: 走らせて失敗を見る**

Run: `npm test -- tests/dsp-noise-burst.test.js`
Expected: FAIL（`noiseBurstGen` / `EXPLOSION_BURSTS` が export されていない）

- [ ] **Step 3: 実装する**

`tests/helpers/dsp.js` の `biquad` を次の2つに置き換える（`biquad` の値は今と同じ。highpass を足すだけ）:

```js
/**
 * RBJ の係数（a0 で割った後）。WebAudio の BiquadFilterNode と同じ式。
 * @param {'bandpass'|'lowpass'|'highpass'} type
 * @returns {number[]} [b0, b1, b2, a1, a2]
 */
export function biquadCoeffs(type, f0, Q) {
    const w0 = 2 * Math.PI * f0 / SAMPLE_RATE;
    const cw = Math.cos(w0);
    const al = Math.sin(w0) / (2 * Q);
    let b0, b1, b2;
    if (type === 'bandpass') {
        b0 = al; b1 = 0; b2 = -al;
    } else if (type === 'highpass') {
        b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0;
    } else {
        b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0;
    }
    const a0 = 1 + al;
    return [b0 / a0, b1 / a0, b2 / a0, -2 * cw / a0, (1 - al) / a0];
}

/**
 * WebAudio の BiquadFilterNode と同じ RBJ 係数のフィルタ。
 * @param {'bandpass'|'lowpass'|'highpass'} type
 * @param {number} f0 中心／遮断周波数
 * @param {number} Q
 * @returns {(x:number)=>number} 1サンプルずつ通す関数
 */
export function biquad(type, f0, Q) {
    const [b0, b1, b2, a1, a2] = biquadCoeffs(type, f0, Q);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return (x) => {
        const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x; y2 = y1; y1 = y;
        return y;
    };
}
```

`transientLevel` の後ろに:

```js
/**
 * AudioOutput._noiseBurst（audio/engine/output.js）のオフライン再現。**片方だけ変えない。**
 * ローパスを from から to へ指数で掃引し（sweepDur 以後は to のまま）、ゲインを gain から end へ
 * dur かけて指数で落とし、dur で止まる。Q の既定 1 は BiquadFilterNode の既定値（_noiseBurst は Q を設定しない）。
 * 掃引中は係数をサンプルごとに計算し直す（WebAudio も a-rate で追う）
 * @returns {(i:number)=>number}
 */
export function noiseBurstGen({ gain, dur, end = 0.001, from, to, sweepDur = dur, Q = 1 }, seed = 3) {
    const n = whiteNoise(Math.ceil(dur * SAMPLE_RATE) + 2, seed);
    const fixed = to === undefined ? biquadCoeffs('lowpass', from, Q) : null;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return (i) => {
        const t = i / SAMPLE_RATE;
        if (t > dur) return 0;
        const f = to === undefined ? from : (t >= sweepDur ? to : from * Math.pow(to / from, t / sweepDur));
        const [b0, b1, b2, a1, a2] = fixed || biquadCoeffs('lowpass', f, Q);
        const x = n[i];
        const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x; y2 = y1; y1 = y;
        return y * gain * Math.pow(end / gain, t / dur);
    };
}
```

`src/js/audio/sounds/playerSounds.js`: ファイルの import の後ろ（`export const AudioPlayerSounds` の前）に:

```js
/**
 * 爆発音の数値。playExplosion と、そのオフライン再現（tests/helpers/dsp.js の noiseBurstGen）が
 * 両方これを読む。町の崩れる音（段4）をこの音との相対 dB で縛るため、表に出した
 * （tests/se-synthesis.test.js がこの値をノードの予約として押さえている）
 */
export const EXPLOSION_BURSTS = {
    large: { gain: 0.42, dur: 0.8, end: 0.01, from: 1000, to: 40, sweepDur: 0.5 },
    small: { gain: 0.21, dur: 0.3, end: 0.01, from: 600, to: 40, sweepDur: 0.2 },
};
```

`playExplosion` の `this._noiseBurst({...})` を次にする（コメントは残す）:

```js
        this._noiseBurst({
            t: this.ctx.currentTime, dest: this._out(sourceX),
            ...EXPLOSION_BURSTS[large ? 'large' : 'small'],
        });
```

- [ ] **Step 4: 走らせて通るのを見る**

Run: `npm test -- tests/dsp-noise-burst.test.js tests/se-synthesis.test.js tests/barrier-audio.test.js`
Expected: PASS（se-synthesis の playExplosion のテストが、予約が変わっていないことを示す。barrier-audio は `biquad` を書き換えても値が同じことを示す）

- [ ] **Step 5: わざと壊して赤くなるか確かめる**

控えを取ってから:
- `noiseBurstGen` の `t >= sweepDur ? to :` を `t >= sweepDur ? from :` にする → 「掃引すると後半ほど暗くなる」が赤くなるか見る（掃引中は暗くなるので赤くならないかもしれない。ならなければ `Math.pow(to / from, …)` を `1` にして、掃引そのものを消して赤くなることを見る）。戻す
- `Q = 1` を `Q = 0.707` にする → 1つ目が赤くなる。戻す
- `EXPLOSION_BURSTS.large.gain` を 0.43 にする → se-synthesis の playExplosion が赤くなる。戻す

- [ ] **Step 6: 全テストを走らせてコミット**

Run: `npm test -- --test-skip-pattern=湧き位置は重複しない > $S/t1.log 2>&1; tail -8 $S/t1.log`
Expected: fail 0

```bash
git add tests/helpers/dsp.js tests/dsp-noise-burst.test.js src/js/audio/sounds/playerSounds.js
git commit -m "test: _noiseBurst のオフライン再現と爆発音の表（町の音を爆発と比べて縛るため）"
```

---

### Task 2: 崩れる音

**Files:**
- Create: `src/js/audio/sounds/townSounds.js`
- Modify: `src/js/audio/AudioManager.js`（import と末尾の `Object.assign`）
- Create: `tools/render-town-sounds.mjs`
- Modify: `src/js/utils/Constants.js`（段4の節を始める）
- Test: `tests/town-sounds.test.js`（新規）

**Interfaces:**
- Consumes: `noiseBurstGen` / `biquad` / `whiteNoise` / `transientLevel` / `db`（Task 1）、`EXPLOSION_BURSTS`（Task 1）、`this._noiseBurst` / `this._out` / `this.noiseBuffer`（既存）
- Produces:
  - Constants: `TOWN_COLLAPSE_SOUND_REF`(160)・`_EXP`(0.75)・`_MIN`(0.1)・`_MERGE_MS`(80)、`TOWN_COLLAPSE_RUMBLE_GAIN`(0.5)・`_TIME`(1.2)・`_FROM`(400)・`_TO`(60)、`TOWN_COLLAPSE_RATTLES`(10)・`_RATTLE_SPREAD`(0.6)・`_RATTLE_GAIN`(0.15)・`_RATTLE_FREQ_MIN`(1200)・`_RATTLE_FREQ_RANGE`(2400)・`_RATTLE_Q`(3)
  - `townCollapseScale(size) → k`（0.1〜1）
  - `townCollapseVoices(size, rand) → { k, rumble: {gain, dur, end, from, to, sweepDur}, rattles: [{at, freq, gain, dur}] }`
  - `audioManager.playTownCollapse(size = 0, sourceX = null)`（80ms 以内の、前より小さい音は鳴らさない。覚え書きは `this._townCollapseAt` / `this._townCollapseK`）
  - `tools/render-town-sounds.mjs` の `collapseGen(size, seed = 1)` と `explosionGen(large)`（直接走らせたときだけ WAV を書き出す）

- [ ] **Step 1: 失敗するテストを書く**

`tests/town-sounds.test.js`:

```js
// 町の崩れる音（audio/sounds/townSounds.js）。spec 4章
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { fakeAudioCtx, withCtx } from './helpers/fake-audio-ctx.js';
import { townCollapseScale, townCollapseVoices } from '../src/js/audio/sounds/townSounds.js';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import {
    TOWN_COLLAPSE_SOUND_REF, TOWN_COLLAPSE_SOUND_MIN, TOWN_COLLAPSE_SOUND_MERGE_MS,
    TOWN_COLLAPSE_RATTLE_SPREAD, TOWN_COLLAPSE_RUMBLE_TIME,
} from '../src/js/utils/Constants.js';
import { transientLevel, db } from './helpers/dsp.js';
import { collapseGen, explosionGen } from '../tools/render-town-sounds.mjs';

const rand = (seed = 1) => { const r = new SeededRNG(seed); return () => r.next(); };

/** 偽 ctx で fn を鳴らし、作られたノードを返す。崩れる音のまとめの覚え書きは毎回消す */
function capture(fn, ctx = fakeAudioCtx()) {
    return withCtx(ctx, () => {
        audioManager.noiseBuffer = { name: 'noise' };
        delete audioManager._townCollapseAt;
        delete audioManager._townCollapseK;
        fn(ctx);
        return ctx.created;
    });
}
const reaches = (node, dst, seen = new Set()) => node === dst
    || (!seen.has(node) && (seen.add(node), (node.outputs || []).some((n) => reaches(n, dst, seen))));

test('大きさ: かけらが多いほど大きく、REF で 1、どんなに小さくても MIN', () => {
    assert.equal(townCollapseScale(TOWN_COLLAPSE_SOUND_REF), 1);
    assert.equal(townCollapseScale(TOWN_COLLAPSE_SOUND_REF * 5), 1);
    assert.equal(townCollapseScale(0), TOWN_COLLAPSE_SOUND_MIN);
    assert.equal(townCollapseScale(undefined), TOWN_COLLAPSE_SOUND_MIN);
    let prev = 0;
    for (let s = 1; s <= TOWN_COLLAPSE_SOUND_REF; s += 7) {
        const k = townCollapseScale(s);
        assert.ok(k >= prev, `${s}: ${k} < ${prev}`);
        prev = k;
    }
});

test('部品: 大きい崩壊ほど地鳴りが長く・ガラガラが多い。ガラガラは SPREAD の中にばらまかれる', () => {
    const big = townCollapseVoices(TOWN_COLLAPSE_SOUND_REF, rand());
    const small = townCollapseVoices(10, rand());
    assert.ok(big.rumble.dur > small.rumble.dur);
    assert.ok(big.rumble.dur <= TOWN_COLLAPSE_RUMBLE_TIME + 1e-9);
    assert.ok(big.rattles.length > small.rattles.length);
    assert.ok(small.rattles.length >= 1);
    for (const r of big.rattles) assert.ok(r.at >= 0 && r.at <= TOWN_COLLAPSE_RATTLE_SPREAD);
    assert.deepEqual(townCollapseVoices(50, rand(4)), townCollapseVoices(50, rand(4)), '同じ乱数なら同じ部品');
});

test('playTownCollapse: 地鳴り1本とガラガラが SE バスへ。地鳴りはローパスを掃引する', () => {
    // バスを先に組む。withCtx は seFade を null にするので、組まないと _seDest が出力そのものになり、
    // 「バスを通さず出力へ直結」の取り違えを見分けられない
    let fade;
    const nodes = capture(() => {
        audioManager._createSeBus();
        fade = audioManager.seFade;
        audioManager.playTownCollapse(TOWN_COLLAPSE_SOUND_REF, 0);
    });
    const sources = nodes.filter((n) => n.name === 'bufferSource');
    assert.ok(sources.length >= 2, `音源 ${sources.length}`);
    for (const s of sources) {
        assert.ok(reaches(s, fade), 'SE バスに届かない音源がある');
        assert.equal(s.started, 1);
        assert.equal(s.stopped, 1);
    }
    const lowpass = nodes.find((n) => n.name === 'filter' && n.type === 'lowpass');
    assert.ok(lowpass.frequency.events.some(([k]) => k === 'exp'), '地鳴りが掃引しない');
    assert.ok(nodes.some((n) => n.name === 'filter' && n.type === 'bandpass'), 'ガラガラが無い');
});

test('80ms 以内に続いた崩れる音は、前より小さければ鳴らさず、大きければ鳴らす。80ms 過ぎれば鳴る', () => {
    const ctx = fakeAudioCtx();
    const count = () => ctx.created.filter((n) => n.name === 'bufferSource').length;
    withCtx(ctx, () => {
        audioManager.noiseBuffer = { name: 'noise' };
        delete audioManager._townCollapseAt;
        audioManager.playTownCollapse(80, 0);
        const first = count();
        ctx.currentTime = 0.03;
        audioManager.playTownCollapse(20, 0);
        assert.equal(count(), first, '小さい音がまとまらない');
        ctx.currentTime = 0.05;
        audioManager.playTownCollapse(TOWN_COLLAPSE_SOUND_REF, 0);
        const second = count();
        assert.ok(second > first, '大きい音が鳴らない');
        ctx.currentTime = 0.05 + TOWN_COLLAPSE_SOUND_MERGE_MS / 1000 + 0.01;
        audioManager.playTownCollapse(10, 0);
        assert.ok(count() > second, '80ms 過ぎた音が鳴らない');
    });
});

test('引数なしでも、音の出せない環境でも例外を投げない', () => {
    audioManager.playTownCollapse();
    capture(() => audioManager.playTownCollapse());
});

// --- 音量の実測（A特性）。合成は tools/render-town-sounds.mjs と同じ設計 ---

test('崩壊（REF）は大きい爆発より約 3dB 小さい（-5〜-1.5dB）', () => {
    const big = transientLevel(explosionGen(true), 1.2);
    const collapse = transientLevel(collapseGen(TOWN_COLLAPSE_SOUND_REF), 1.2);
    const d = db(collapse / big);
    assert.ok(d > -5 && d < -1.5, `崩壊 ${db(collapse).toFixed(1)}dB / 爆発 ${db(big).toFixed(1)}dB → 差 ${d.toFixed(1)}dB`);
});

test('小さい破片（REF/8 かけら）が砕ける音は、小さい爆発より小さい', () => {
    const small = transientLevel(explosionGen(false), 0.8);
    const shatter = transientLevel(collapseGen(TOWN_COLLAPSE_SOUND_REF / 8), 0.8);
    assert.ok(shatter < small, `破片 ${db(shatter).toFixed(1)}dB / 小さい爆発 ${db(small).toFixed(1)}dB`);
});

test('ガラガラは地鳴りに埋もれない（崩壊の音の、地鳴りだけとの差が 1dB 以上）', () => {
    const all = transientLevel(collapseGen(TOWN_COLLAPSE_SOUND_REF), 1.2);
    const rumble = transientLevel(collapseGen(TOWN_COLLAPSE_SOUND_REF, 1, { rattles: false }), 1.2);
    assert.ok(db(all / rumble) > 1, `差 ${db(all / rumble).toFixed(1)}dB`);
});
```

- [ ] **Step 2: 走らせて失敗を見る**

Run: `npm test -- tests/town-sounds.test.js`
Expected: FAIL（`townSounds.js` / `render-town-sounds.mjs` が無い）

- [ ] **Step 3: 定数を足す**

`src/js/utils/Constants.js` の末尾:

```js

// --- 3面の町並み 段4（音）---
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md（4章）。音量は A特性で実測して
// tests/town-sounds.test.js が爆発・バリアの唸りとの相対 dB で縛る（tools/render-town-sounds.mjs で測れる）
// 崩れる音の大きさ k = (崩れたかけら / REF)^EXP を MIN〜1 に収める。REF は塔1棟の崩壊。
// 平方根（0.5 乗）だと 20 かけらの破片が小さい爆発より大きく鳴った（scratch の実測）
export const TOWN_COLLAPSE_SOUND_REF = 160;
export const TOWN_COLLAPSE_SOUND_EXP = 0.75;
export const TOWN_COLLAPSE_SOUND_MIN = 0.1;
export const TOWN_COLLAPSE_SOUND_MERGE_MS = 80;   // これより近く続いた崩れる音は、大きいほうだけ鳴らす
// 低い地鳴り: ローパスしたノイズを FROM → TO へ掃引しながら TIME 秒で落とす（k で長さが半分まで縮む）
export const TOWN_COLLAPSE_RUMBLE_GAIN = 0.5;
export const TOWN_COLLAPSE_RUMBLE_TIME = 1.2;
export const TOWN_COLLAPSE_RUMBLE_FROM = 400;
export const TOWN_COLLAPSE_RUMBLE_TO = 60;
// 瓦礫のガラガラ: 短いバンドパスのノイズを RATTLES 発（k 倍）、SPREAD 秒の中にばらまく
export const TOWN_COLLAPSE_RATTLES = 10;
export const TOWN_COLLAPSE_RATTLE_SPREAD = 0.6;
export const TOWN_COLLAPSE_RATTLE_GAIN = 0.15;
export const TOWN_COLLAPSE_RATTLE_FREQ_MIN = 1200;
export const TOWN_COLLAPSE_RATTLE_FREQ_RANGE = 2400;
export const TOWN_COLLAPSE_RATTLE_Q = 3;
```

- [ ] **Step 4: 音を実装する**

`src/js/audio/sounds/townSounds.js`:

```js
// ============================================
// AudioManager - 3面の町の音（崩れる音・炎のループ）
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md（4章）。
// 崩れる音は「低い地鳴り＋瓦礫のガラガラ」。地鳴りだけだと爆発の尾と区別がつかず、
// ガラガラだけだと軽い。どちらの大きさ・長さも崩れたかけらの数で決める（townCollapseScale）。
// 音の設計（部品の並び）は純関数 townCollapseVoices に出し、tools/render-town-sounds.mjs の
// オフライン再現と共有する。**WebAudio 版と再現は対。片方だけ変えない。**
//
// **AudioManager.prototype へ Object.assign で混ぜる前提**のオブジェクト
// リテラルで、`this` は audioManager シングルトンを指す
// （理由は audio/sounds/stings.js の冒頭）。

import {
    TOWN_COLLAPSE_SOUND_REF, TOWN_COLLAPSE_SOUND_EXP, TOWN_COLLAPSE_SOUND_MIN, TOWN_COLLAPSE_SOUND_MERGE_MS,
    TOWN_COLLAPSE_RUMBLE_GAIN, TOWN_COLLAPSE_RUMBLE_TIME, TOWN_COLLAPSE_RUMBLE_FROM, TOWN_COLLAPSE_RUMBLE_TO,
    TOWN_COLLAPSE_RATTLES, TOWN_COLLAPSE_RATTLE_SPREAD, TOWN_COLLAPSE_RATTLE_GAIN,
    TOWN_COLLAPSE_RATTLE_FREQ_MIN, TOWN_COLLAPSE_RATTLE_FREQ_RANGE, TOWN_COLLAPSE_RATTLE_Q,
} from '../../utils/Constants.js';

/** 崩れたかけらの数 → 音の大きさ k（MIN〜1） */
export function townCollapseScale(size) {
    const k = Math.pow(Math.max(0, size || 0) / TOWN_COLLAPSE_SOUND_REF, TOWN_COLLAPSE_SOUND_EXP);
    return Math.max(TOWN_COLLAPSE_SOUND_MIN, Math.min(1, k));
}

/**
 * 崩れる音の部品。地鳴り（_noiseBurst の引数）と、ガラガラ（バンドパスのノイズの一撃）の並び。
 * @param {number} size 崩れたかけらの数
 * @param {() => number} rand 0〜1。WebAudio 版は Math.random、再現は種つき
 */
export function townCollapseVoices(size, rand) {
    const k = townCollapseScale(size);
    const dur = TOWN_COLLAPSE_RUMBLE_TIME * (0.5 + 0.5 * k);
    const rumble = {
        gain: TOWN_COLLAPSE_RUMBLE_GAIN * k, dur, end: 0.001,
        from: TOWN_COLLAPSE_RUMBLE_FROM, to: TOWN_COLLAPSE_RUMBLE_TO, sweepDur: dur,
    };
    const rattles = [];
    const n = Math.max(1, Math.round(TOWN_COLLAPSE_RATTLES * k));
    for (let i = 0; i < n; i++) {
        rattles.push({
            at: rand() * TOWN_COLLAPSE_RATTLE_SPREAD * (0.5 + 0.5 * k),
            freq: TOWN_COLLAPSE_RATTLE_FREQ_MIN + rand() * TOWN_COLLAPSE_RATTLE_FREQ_RANGE,
            gain: TOWN_COLLAPSE_RATTLE_GAIN * k * (0.5 + 0.5 * rand()),
            dur: 0.04 + rand() * 0.04,
        });
    }
    return { k, rumble, rattles };
}

export const AudioTownSounds = {
    /**
     * 建物の崩壊・落ちた破片が砕けたとき。町の側（Town._flushEffects）が 1 tick に一番大きい1つだけ渡す。
     * tick をまたいで TOWN_COLLAPSE_SOUND_MERGE_MS 以内に続いた音は、前より小さければ鳴らさない。
     * 前より大きければ鳴らす（待って比べると、崩れた瞬間から音が遅れる）
     * @param {number} [size] 崩れたかけらの数
     * @param {number} [sourceX] 音源のワールドX
     */
    playTownCollapse(size = 0, sourceX = null) {
        if (!this._prepare()) return;
        const t = this.ctx.currentTime;
        const v = townCollapseVoices(size, Math.random);
        if (this._townCollapseAt !== undefined && t - this._townCollapseAt < TOWN_COLLAPSE_SOUND_MERGE_MS / 1000
            && v.k <= this._townCollapseK) return;
        this._townCollapseAt = t;
        this._townCollapseK = v.k;
        const dest = this._out(sourceX);
        this._noiseBurst({ t, dest, ...v.rumble });
        for (const r of v.rattles) {
            const src = this.ctx.createBufferSource();
            src.buffer = this.noiseBuffer;
            const bp = this.ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.value = r.freq;
            bp.Q.value = TOWN_COLLAPSE_RATTLE_Q;
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(r.gain, t + r.at);
            g.gain.exponentialRampToValueAtTime(0.001, t + r.at + r.dur);
            src.connect(bp); bp.connect(g); g.connect(dest);
            // ノイズの読み出し位置をずらして、ガラガラごとに違う粒にする
            src.start(t + r.at, r.at);
            src.stop(t + r.at + r.dur);
        }
    },
};
```

`src/js/audio/AudioManager.js`: `import { AudioFortressSounds } from './sounds/fortressSounds.js';` の下に `import { AudioTownSounds } from './sounds/townSounds.js';`、末尾の `Object.assign` の `AudioFortressSounds,` の後ろに ` AudioTownSounds,` を足す。

- [ ] **Step 5: オフライン再現と書き出しの道具を作る**

`tools/render-town-sounds.mjs`:

```js
#!/usr/bin/env node
// 3面の町の音（崩れる音・炎のループ）を WAV に書き出し、A特性で音量を実測する。
//
// **合成は audio/sounds/townSounds.js の WebAudio 版と同じ設計を写したもの。**
// 部品の並び（townCollapseVoices / crackleSamples）は同じ純関数を使い、ノードの組み方だけをここで写す。
// 片方だけ変えると聴いた印象と実機がずれるので、数値を動かしたら両方直すこと。
// テスト（tests/town-sounds.test.js）が collapseGen / explosionGen を読む。
//
// 使い方:
//   node tools/render-town-sounds.mjs
//   open audio-preview/            # macOS

import { writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { TOWN_COLLAPSE_SOUND_REF, TOWN_COLLAPSE_RATTLE_Q } from '../src/js/utils/Constants.js';
import { townCollapseVoices } from '../src/js/audio/sounds/townSounds.js';
import { EXPLOSION_BURSTS } from '../src/js/audio/sounds/playerSounds.js';
import {
    SAMPLE_RATE, biquad, whiteNoise, noiseBurstGen, transientLevel, db,
} from '../tests/helpers/dsp.js';

/** 爆発音（playExplosion）の再現。比べる相手 */
export function explosionGen(large) {
    return noiseBurstGen(EXPLOSION_BURSTS[large ? 'large' : 'small']);
}

/**
 * 崩れる音（playTownCollapse）の再現。地鳴りは _noiseBurst と同じ、ガラガラはバンドパスのノイズの一撃。
 * @param {number} size 崩れたかけらの数
 * @param {number} [seed]
 * @param {{rattles?: boolean}} [opts] rattles: false で地鳴りだけ（テストでガラガラの寄与を測る）
 */
export function collapseGen(size, seed = 1, { rattles = true } = {}) {
    const rng = new SeededRNG(seed);
    const v = townCollapseVoices(size, () => rng.next());
    const rumble = noiseBurstGen(v.rumble, seed + 100);
    const noise = whiteNoise(Math.ceil(2 * SAMPLE_RATE), seed + 200);
    const parts = rattles ? v.rattles.map((r) => ({ ...r, bp: biquad('bandpass', r.freq, TOWN_COLLAPSE_RATTLE_Q) })) : [];
    return (i) => {
        const t = i / SAMPLE_RATE;
        let y = rumble(i);
        for (const r of parts) {
            if (t < r.at || t > r.at + r.dur) continue;
            // WebAudio 版は start(t + at, at)＝ノイズの at 秒目から読む。ここも同じ所から読む
            const x = noise[Math.floor((t - r.at + r.at) * SAMPLE_RATE)] ?? 0;
            y += r.bp(x) * r.gain * Math.pow(0.001 / r.gain, (t - r.at) / r.dur);
        }
        return y;
    };
}

function toWav(samples) {
    const data = Buffer.alloc(samples.length * 2);
    for (let i = 0; i < samples.length; i++) {
        data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
    }
    const h = Buffer.alloc(44);
    h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
    h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SAMPLE_RATE, 24);
    h.writeUInt32LE(SAMPLE_RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
    h.write('data', 36); h.writeUInt32LE(data.length, 40);
    return Buffer.concat([h, data]);
}

function render(gen, seconds) {
    const out = new Float32Array(Math.ceil(seconds * SAMPLE_RATE));
    for (let i = 0; i < out.length; i++) out[i] = gen(i);
    return out;
}

// テストから import されたときは書き出さない（直接走らせたときだけ）
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const OUT_DIR = new URL('../audio-preview/', import.meta.url);
    mkdirSync(OUT_DIR, { recursive: true });
    const items = [
        ['town-collapse-large', collapseGen(TOWN_COLLAPSE_SOUND_REF), 1.4],
        ['town-collapse-small', collapseGen(TOWN_COLLAPSE_SOUND_REF / 3), 1.4],
        ['town-shatter', collapseGen(TOWN_COLLAPSE_SOUND_REF / 8), 1.0],
    ];
    for (const [name, gen, sec] of items) writeFileSync(new URL(`${name}.wav`, OUT_DIR), toWav(render(gen, sec)));

    const L = (gen, s) => db(transientLevel(gen, s));
    console.log('--- A特性の実測 ---');
    console.log(`大きい爆発（比較）      ${L(explosionGen(true), 1.2).toFixed(1)} dB`);
    console.log(`崩壊（${TOWN_COLLAPSE_SOUND_REF} かけら）     ${L(collapseGen(TOWN_COLLAPSE_SOUND_REF), 1.2).toFixed(1)} dB`);
    console.log(`小さい爆発（比較）      ${L(explosionGen(false), 0.8).toFixed(1)} dB`);
    console.log(`破片（${TOWN_COLLAPSE_SOUND_REF / 8} かけら）       ${L(collapseGen(TOWN_COLLAPSE_SOUND_REF / 8), 0.8).toFixed(1)} dB`);
    console.log(`\n書き出し: ${OUT_DIR.pathname}`);
}
```

（`noise[Math.floor((t - r.at + r.at) * SAMPLE_RATE)]` は `noise[i]` と同じ値。読み出し位置が WebAudio 版の `start(t + at, at)` と揃っていることを式で残すため、そのまま書く。気になるなら `noise[i]` にしてコメントで同じことを書く）

- [ ] **Step 6: 走らせて通るのを見る。外れたらゲインだけ動かす**

Run: `npm test -- tests/town-sounds.test.js tests/audio-manager.test.js tests/se-bus.test.js`
Expected: PASS。dB のテストが外れたら `node tools/render-town-sounds.mjs` で測り、`TOWN_COLLAPSE_RUMBLE_GAIN` / `TOWN_COLLAPSE_RATTLE_GAIN`（崩壊が大きすぎ・小さすぎ）か `TOWN_COLLAPSE_SOUND_EXP`（破片が大きすぎ）だけを動かす。動かしたら Ruling を台帳に書き、定数のコメントに実測の dB を書き足す

- [ ] **Step 7: わざと壊して赤くなるか確かめる**

控えを取ってから、1つずつ:
- `playTownCollapse` のまとめの `if (…) return;` を消す → 「80ms 以内に続いた…」が赤くなる。戻す
- `&& v.k <= this._townCollapseK` を消す → 同じテストの「大きい音が鳴らない」が赤くなる。戻す
- `TOWN_COLLAPSE_RUMBLE_GAIN` を 2 倍にする → 「崩壊（REF）は大きい爆発より約 3dB 小さい」が赤くなる。戻す
- `TOWN_COLLAPSE_SOUND_EXP` を 0.5 にする → 「小さい破片…小さい爆発より小さい」が赤くなる（scratch の実測では -56.6dB 対 -58.0dB）。戻す
- ガラガラの `g.connect(dest)` を `g.connect(this.ctx.destination)` にする → 「SE バスへ」が赤くなる（テストはバスを先に組んで `seFade` に届くかを見る）。戻す

- [ ] **Step 8: 全テストを走らせてコミット**

Run: `npm test -- --test-skip-pattern=湧き位置は重複しない > $S/t2.log 2>&1; tail -8 $S/t2.log`
Expected: fail 0

```bash
git add src/js/audio/sounds/townSounds.js src/js/audio/AudioManager.js tools/render-town-sounds.mjs tests/town-sounds.test.js
# Constants.js は「ステージ手順」で町の節だけ
git commit -m "feat: 町の崩れる音（低い地鳴り＋瓦礫のガラガラ。大きさはかけらの数、80ms 以内はまとめる。A特性で爆発と比べて縛る）"
```

---

### Task 3: 炎のループ

**Files:**
- Modify: `src/js/audio/sounds/townSounds.js`
- Modify: `src/js/audio/engine/seBus.js`（`stopLoopingSe`）
- Modify: `tools/render-town-sounds.mjs`
- Modify: `src/js/utils/Constants.js`（段4の節に追加）
- Test: `tests/town-fire-sound.test.js`（新規）

**Interfaces:**
- Consumes: `this._loopSound(key, {build, tune})` / `this._stopLoopSound(key, fade)` / `this._panFor(x)` / `this._seDest()`（既存）、`humGen`（`tools/render-barrier-sounds.mjs`）
- Produces:
  - Constants: `TOWN_FIRE_ROAR_GAIN`(0.2)・`_ROAR_FILTER`(300)、`TOWN_FIRE_CRACKLE_GAIN`(0.25)・`_CRACKLE_FILTER`(1800)・`_CRACKLE_RATE`(14)・`_CRACKLE_SECONDS`(3.7)・`_CRACKLE_SEED`(0x7F1E)
  - `crackleSamples(n, sampleRate, rng) → Float32Array`（rng は `{next()}`）
  - `audioManager.startTownFire(intensity = 0, sourceX = null)` / `stopTownFire()`。ループのキーは `'townFire'`
  - `stopLoopingSe()` が `stopTownFire()` も呼ぶ
  - 道具の `fireLoopGen(intensity, seed = 1, { roar = true, crackle = true } = {})`

- [ ] **Step 1: 失敗するテストを書く**

`tests/town-fire-sound.test.js`:

```js
// 町の炎のループ（audio/sounds/townSounds.js）。spec 4章
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { fakeAudioCtx, withCtx } from './helpers/fake-audio-ctx.js';
import { crackleSamples } from '../src/js/audio/sounds/townSounds.js';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { TOWN_FIRE_CRACKLE_RATE } from '../src/js/utils/Constants.js';
import { aWeightedRms, db } from './helpers/dsp.js';
import { fireLoopGen } from '../tools/render-town-sounds.mjs';
import { humGen } from '../tools/render-barrier-sounds.mjs';

const reaches = (node, dst, seen = new Set()) => node === dst
    || (!seen.has(node) && (seen.add(node), (node.outputs || []).some((n) => reaches(n, dst, seen))));

test('パチパチのバッファ: 同じ種なら同じ。1秒あたりおよそ RATE 回のクリック', () => {
    const a = crackleSamples(48000 * 2, 48000, new SeededRNG(3));
    const b = crackleSamples(48000 * 2, 48000, new SeededRNG(3));
    assert.deepEqual(a, b);
    // クリックの頭を数える（無音から音が立ち上がる所）
    let heads = 0;
    for (let i = 1; i < a.length; i++) if (a[i - 1] === 0 && a[i] !== 0) heads++;
    assert.ok(heads > TOWN_FIRE_CRACKLE_RATE * 2 * 0.7 && heads < TOWN_FIRE_CRACKLE_RATE * 2 * 1.3, `${heads}`);
});

test('startTownFire: ゴーッとパチパチの2つのループが SE バスへ。強さに音量が追従し、左右に振れる', () => {
    const ctx = fakeAudioCtx();
    withCtx(ctx, () => {
        audioManager.noiseBuffer = { name: 'noise' };
        audioManager.listenerX = 0;
        audioManager.startTownFire(0.5, 600);
        const sources = ctx.created.filter((n) => n.name === 'bufferSource');
        assert.equal(sources.length, 2);
        for (const s of sources) {
            assert.equal(s.loop, true);
            assert.equal(s.started, 1);
            assert.ok(reaches(s, ctx.destination));
        }
        const loop = audioManager._loops.townFire;
        assert.equal(loop.gain.gain.target, 0.5);
        assert.ok(loop.pan.pan.target > 0, '右の火が右から聞こえない');
        audioManager.startTownFire(1, 600);
        assert.equal(ctx.created.filter((n) => n.name === 'bufferSource').length, 2, '毎回作り直している');
        assert.equal(loop.gain.gain.target, 1);
    });
});

test('stopTownFire と stopLoopingSe（ミッションを抜けるとき）でループが止まる', () => {
    for (const stop of ['stopTownFire', 'stopLoopingSe']) {
        const ctx = fakeAudioCtx();
        withCtx(ctx, () => {
            audioManager.noiseBuffer = { name: 'noise' };
            audioManager.startTownFire(1, 0);
            const loop = audioManager._loops.townFire;
            audioManager[stop]();
            assert.equal(audioManager._loops.townFire, null, `${stop} で止まらない`);
            assert.equal(loop.gain.gain.target, 0);
        });
    }
});

test('引数なしでも、音の出せない環境でも例外を投げない', () => {
    audioManager.startTownFire();
    audioManager.stopTownFire();
});

// --- 音量の実測（A特性）。合成は tools/render-town-sounds.mjs と同じ設計 ---

test('炎のループは最大でもバリアの唸り以下、かつ 6dB より小さくはならない（聞こえる）', () => {
    const hum = aWeightedRms(humGen());
    const fire = aWeightedRms(fireLoopGen(1));
    const d = db(fire / hum);
    assert.ok(d <= 0 && d > -6, `炎 ${db(fire).toFixed(1)}dB / 唸り ${db(hum).toFixed(1)}dB → 差 ${d.toFixed(1)}dB`);
});

test('パチパチはハイパスで消えていない（ゴーッとの差が ±6dB 以内）', () => {
    const roar = aWeightedRms(fireLoopGen(1, 1, { crackle: false }));
    const crackle = aWeightedRms(fireLoopGen(1, 1, { roar: false }));
    const d = db(crackle / roar);
    assert.ok(Math.abs(d) < 6, `パチパチ ${db(crackle).toFixed(1)}dB / ゴーッ ${db(roar).toFixed(1)}dB`);
});
```

- [ ] **Step 2: 走らせて失敗を見る**

Run: `npm test -- tests/town-fire-sound.test.js`
Expected: FAIL（`crackleSamples` / `fireLoopGen` が無い）

- [ ] **Step 3: 実装する**

`src/js/utils/Constants.js` の段4の節に追加:

```js
// 炎のループ: 低いゴーッ（ノイズのループを ROAR_FILTER でローパス）＋パチパチ（まばらなクリックを並べた
// CRACKLE_SECONDS 秒のバッファをループ、CRACKLE_FILTER でハイパス）。最大でもバリアの唸り（-48dB）以下
export const TOWN_FIRE_ROAR_GAIN = 0.2;
export const TOWN_FIRE_ROAR_FILTER = 300;
export const TOWN_FIRE_CRACKLE_GAIN = 0.25;
export const TOWN_FIRE_CRACKLE_FILTER = 1800;
export const TOWN_FIRE_CRACKLE_RATE = 14;        // 1秒あたりのクリックの数
export const TOWN_FIRE_CRACKLE_SECONDS = 3.7;    // 繰り返しが耳につかない長さ（2秒だと周期が分かる）
export const TOWN_FIRE_CRACKLE_SEED = 0x7F1E;
```

`src/js/audio/sounds/townSounds.js`: import に上の定数と `SeededRNG`（`../../utils/SeededRNG.js`）を足す。`townCollapseVoices` の後ろに:

```js
/**
 * パチパチのバッファ（n サンプル）。まばらなクリック（数 ms の減衰するノイズ）を並べる。
 * WebAudio 版は1度だけ作ってループし、再現も同じものを使う
 * @param {{next: () => number}} rng
 */
export function crackleSamples(n, sampleRate, rng) {
    const out = new Float32Array(n);
    const count = Math.round(TOWN_FIRE_CRACKLE_RATE * n / sampleRate);
    for (let c = 0; c < count; c++) {
        const at = Math.floor(rng.next() * n);
        const len = Math.floor(sampleRate * (0.002 + rng.next() * 0.004));
        const amp = 0.3 + 0.7 * rng.next();
        for (let k = 0; k < len && at + k < n; k++) out[at + k] += (rng.next() * 2 - 1) * amp * Math.exp(-5 * k / len);
    }
    return out;
}
```

`AudioTownSounds` に足す:

```js
    /**
     * 画面の近くで火が燃えているあいだのループ。毎 tick 呼んでよい（町の側が Town.update から呼ぶ）。
     * 強さは近い火元の数と位置から（FireSystem.soundLevel）。0 になったら stopTownFire を呼ぶこと
     * @param {number} [intensity] 0〜1
     * @param {number} [sourceX] 火元のワールドX（重み付きの平均）
     */
    startTownFire(intensity = 0, sourceX = null) {
        const level = Math.max(0, Math.min(1, intensity));
        this._loopSound('townFire', {
            build: () => {
                const roar = this.ctx.createBufferSource();
                roar.buffer = this.noiseBuffer;
                roar.loop = true;
                const lp = this.ctx.createBiquadFilter();
                lp.type = 'lowpass';
                lp.frequency.value = TOWN_FIRE_ROAR_FILTER;
                const roarGain = this.ctx.createGain();
                roarGain.gain.value = TOWN_FIRE_ROAR_GAIN;

                const crackle = this.ctx.createBufferSource();
                crackle.buffer = this._townCrackleBuffer();
                crackle.loop = true;
                const hp = this.ctx.createBiquadFilter();
                hp.type = 'highpass';
                hp.frequency.value = TOWN_FIRE_CRACKLE_FILTER;
                hp.Q.value = 0.7;
                const crackleGain = this.ctx.createGain();
                crackleGain.gain.value = TOWN_FIRE_CRACKLE_GAIN;

                const gain = this.ctx.createGain();
                gain.gain.value = 0;
                roar.connect(lp); lp.connect(roarGain); roarGain.connect(gain);
                crackle.connect(hp); hp.connect(crackleGain); crackleGain.connect(gain);
                // 火元が動くので、パンナーは作り置いて追従させる（_panned は1回きりの音用）
                let pan = null;
                if (typeof this.ctx.createStereoPanner === 'function') {
                    pan = this.ctx.createStereoPanner();
                    gain.connect(pan);
                    pan.connect(this._seDest());
                } else {
                    gain.connect(this._seDest());
                }
                return { gain, pan, sources: [roar, crackle] };
            },
            tune: (n, t) => {
                n.gain.gain.setTargetAtTime(level, t, 0.25);
                if (n.pan) n.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, this._panFor(sourceX))), t, 0.25);
            },
        });
    },

    /** 炎のループを止める（火が消えた・画面から火が無くなった・ミッションを抜けた）。燃え尽きるように少し長めに引く */
    stopTownFire() {
        this._stopLoopSound('townFire', 0.4);
    },

    /** パチパチのバッファ。1度だけ作る */
    _townCrackleBuffer() {
        if (!this.townCrackleBuffer || this.townCrackleBuffer.sampleRate !== this.ctx.sampleRate) {
            const n = Math.round(TOWN_FIRE_CRACKLE_SECONDS * this.ctx.sampleRate);
            const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
            buf.getChannelData(0).set(crackleSamples(n, this.ctx.sampleRate, new SeededRNG(TOWN_FIRE_CRACKLE_SEED)));
            this.townCrackleBuffer = buf;
        }
        return this.townCrackleBuffer;
    },
```

`src/js/audio/engine/seBus.js` の `stopLoopingSe()` に `this.stopTownFire();` を足し、JSDoc の「4つ」を「5つ（3面の町の炎のループも）」に直す。

`tools/render-town-sounds.mjs`: import に `TOWN_FIRE_*` の定数・`crackleSamples`・`aWeightedRms` を足し、`collapseGen` の後ろに:

```js
/**
 * 炎のループ（startTownFire）の再現。ゴーッは noiseBuffer（2秒の白色ノイズ）のループをローパス、
 * パチパチは crackleSamples のループをハイパス（Q 0.7）
 * @param {{roar?: boolean, crackle?: boolean}} [opts] 片方だけを測るとき
 */
export function fireLoopGen(intensity, seed = 1, { roar = true, crackle = true } = {}) {
    const noise = whiteNoise(2 * SAMPLE_RATE, seed + 300);
    const nC = Math.round(TOWN_FIRE_CRACKLE_SECONDS * SAMPLE_RATE);
    const clicks = crackleSamples(nC, SAMPLE_RATE, new SeededRNG(TOWN_FIRE_CRACKLE_SEED));
    const lp = biquad('lowpass', TOWN_FIRE_ROAR_FILTER, 1);
    const hp = biquad('highpass', TOWN_FIRE_CRACKLE_FILTER, 0.7);
    return (i) => {
        const r = roar ? lp(noise[i % noise.length]) * TOWN_FIRE_ROAR_GAIN : 0;
        const c = crackle ? hp(clicks[i % nC]) * TOWN_FIRE_CRACKLE_GAIN : 0;
        return (r + c) * intensity;
    };
}
```

書き出しの `items` に `['town-fire', fireLoopGen(1), 4.0]` を足し、実測の表示に:

```js
    const { humGen } = await import('./render-barrier-sounds.mjs');
    console.log(`バリアの唸り（比較）    ${db(aWeightedRms(humGen())).toFixed(1)} dB`);
    console.log(`炎のループ（最大）      ${db(aWeightedRms(fireLoopGen(1))).toFixed(1)} dB`);
    console.log(`  ゴーッだけ            ${db(aWeightedRms(fireLoopGen(1, 1, { crackle: false }))).toFixed(1)} dB`);
    console.log(`  パチパチだけ          ${db(aWeightedRms(fireLoopGen(1, 1, { roar: false }))).toFixed(1)} dB`);
```

（`render-barrier-sounds.mjs` は import しただけで WAV を書き出す作りなので、直接走らせたときの節の中で動的に import する。テストはもともとそれを import している）

- [ ] **Step 4: 走らせて通るのを見る。外れたらゲインだけ動かす**

Run: `npm test -- tests/town-fire-sound.test.js tests/audio-manager.test.js tests/se-bus.test.js`
Expected: PASS。dB が外れたら `node tools/render-town-sounds.mjs` で測り、`TOWN_FIRE_ROAR_GAIN` / `TOWN_FIRE_CRACKLE_GAIN` だけを動かす（Ruling と実測をコメントに）

- [ ] **Step 5: わざと壊して赤くなるか確かめる**

控えを取ってから、1つずつ:
- `stopLoopingSe` の `this.stopTownFire();` を消す → 「stopLoopingSe でループが止まる」が赤くなる。戻す
- `TOWN_FIRE_CRACKLE_FILTER` を 9000 にする → 「パチパチはハイパスで消えていない」が赤くなる。戻す
- `TOWN_FIRE_ROAR_GAIN` を 2 倍にする → 「バリアの唸り以下」が赤くなる。戻す
- `tune` の `n.gain.gain.setTargetAtTime(level, …)` を `(1, …)` にする → 「強さに音量が追従」が赤くなる。戻す

- [ ] **Step 6: 全テストを走らせてコミット**

Run: `npm test -- --test-skip-pattern=湧き位置は重複しない > $S/t3.log 2>&1; tail -8 $S/t3.log`
Expected: fail 0

```bash
git add src/js/audio/sounds/townSounds.js src/js/audio/engine/seBus.js tools/render-town-sounds.mjs tests/town-fire-sound.test.js
# Constants.js は「ステージ手順」で町の節だけ
git commit -m "feat: 町の炎のループ（低いゴーッ＋パチパチ。強さと左右を追従、ミッションを抜けると止まる。A特性でバリアの唸り以下に縛る）"
```

---

### Task 4: 町から鳴らす

**Files:**
- Modify: `src/js/world/town/fire.js`（`soundLevel`）
- Modify: `src/js/world/town/Town.js`（`_shatter` の注文、`_flushEffects`、`update`）
- Modify: `src/js/utils/Constants.js`（`TOWN_FIRE_SOUND_FULL`）
- Modify: `src/js/audio/CLAUDE.md`（試聴用の書き出しに1行）
- Test: `tests/town-sound-wiring.test.js`（新規）

**Interfaces:**
- Consumes: `audioManager.playTownCollapse` / `startTownFire` / `stopTownFire`（Task 2・3）、`positionalVolume(x, y, {cx, cy, halfW, halfH})`（`utils/audioFalloff.js`）
- Produces:
  - Constants: `TOWN_FIRE_SOUND_FULL`(10)
  - `FireSystem.soundLevel(view) → { intensity: 0〜1, x: number|null }`。view は Town の `{x, y, w, h}`（null なら全部の火元が音量 1）
  - 崩壊の注文 `{type: 'collapse', size}`（今のまま）と、破片の砕けの注文に `size: p.count`（かけらの数）を足す
  - `_flushEffects` は画面の近くの `collapse` / `shatter` のうち `size` が一番大きい1つで `playTownCollapse(size, x)` を1回だけ呼ぶ
  - `update` は `fire.update(view)` の後ろで、`soundLevel(view).intensity > 0` なら `startTownFire(intensity, x)`、0 なら `stopTownFire()`

- [ ] **Step 1: 失敗するテストを書く**

`tests/town-sound-wiring.test.js`:

```js
// 町から音を鳴らす（Town._flushEffects / Town.update / FireSystem.soundLevel）。spec 4章「鳴るとき」
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { TOWN_FIRE_SOUND_FULL } from '../src/js/utils/Constants.js';
import { block } from './helpers/town-fixtures.js';
import { made, townOf } from './helpers/town-fire-fixtures.js';
import { MAT_WOOD } from '../src/js/world/town/chunks.js';

/** audioManager の呼び出しを記録する（tests/audio-wiring.test.js の spyAudio と同じ流儀） */
function spyAudio(names) {
    const calls = [];
    const originals = {};
    for (const n of names) {
        originals[n] = audioManager[n];
        audioManager[n] = (...args) => calls.push({ name: n, args });
    }
    return {
        calls,
        of(n) { return calls.filter((c) => c.name === n); },
        restore() { for (const n of names) audioManager[n] = originals[n]; },
    };
}
const NAMES = ['playTownCollapse', 'startTownFire', 'stopTownFire'];
const gameAt = (view) => ({
    particles: [], projectiles: [], enemies: [],
    camera: view ? { x: view.x, y: view.y } : null, canvas: view ? { width: view.w, height: view.h } : null,
});

// 床は row 8（y 128〜143）だけ。建物の下端 4px が床に入る。根元を帯状に欠かせると上が支えを失って
// 崩壊し、崩壊の時点で残っているかけら（＝崩れる音の大きさ）が多く残る。真ん中を丸ごと吹き飛ばすと
// 崩壊の時点で何も残らず、崩れる音の大きさが 0 になる（爆発音のほうが鳴るので、それでよい）
const FLOOR = { isSolidTile: (r) => r === 8 };
const standing = (x, w, h) => block(x, 132 - h, w, h);
const cutRoot = (town, b) => town.chip(b, b.x + b.width / 2, 120, b.width / 2 + 2);

test('建物が1棟崩壊すると、崩れる音が1回、崩れたかけらの数と建物の位置で鳴る', () => {
    const spy = spyAudio(NAMES);
    try {
        const town = townOf([standing(100, 32, 64)], 1, FLOOR);
        const b = town.buildings[0];
        cutRoot(town, b);
        assert.equal(b.collapsed, true, '前提: 崩壊した');
        town.update(gameAt(null));
        const calls = spy.of('playTownCollapse');
        assert.equal(calls.length, 1);
        const [size, x] = calls[0].args;
        assert.ok(size > 0);
        assert.ok(Math.abs(x - 116) <= 16);
    } finally { spy.restore(); }
});

test('1 tick に何棟も崩れても、崩れる音は1回（一番大きいもの）', () => {
    const spy = spyAudio(NAMES);
    try {
        const town = townOf([standing(0, 32, 64), standing(100, 48, 128), standing(200, 32, 64)], 1, FLOOR);
        for (const b of town.buildings) cutRoot(town, b);
        assert.ok(town.buildings.every((b) => b.collapsed), '前提: 3棟とも崩壊した');
        town.update(gameAt(null));
        const calls = spy.of('playTownCollapse');
        assert.equal(calls.length, 1);
        assert.ok(Math.abs(calls[0].args[1] - 124) <= 24, `一番大きい塔の位置で鳴っていない: ${calls[0].args[1]}`);
    } finally { spy.restore(); }
});

test('画面の外の崩壊は鳴らない', () => {
    const spy = spyAudio(NAMES);
    try {
        const town = townOf([standing(5000, 32, 64)], 1, FLOOR);
        cutRoot(town, town.buildings[0]);
        town.update(gameAt({ x: 0, y: 0, w: 640, h: 360 }));
        assert.equal(spy.of('playTownCollapse').length, 0);
    } finally { spy.restore(); }
});

test('落ちた破片が砕けると、破片のかけらの数で崩れる音が鳴る', () => {
    const spy = spyAudio(NAMES);
    try {
        // 中ほどを抜いて上だけ落とす（下の土台は岩に支えられ、上の塊が 1 つ落ちて row 10 の床で砕ける）
        const town = townOf([block(0, 0, 16, 64)], 1, { isSolidTile: (r) => r === 3 || r >= 10 });
        town.chip(town.buildings[0], 8, 34, 3);
        assert.ok(town.falling.length >= 1, '前提: 落ちる破片がある');
        spy.calls.length = 0;
        for (let i = 0; i < 200 && town.falling.length; i++) town.update(gameAt(null));
        const sizes = spy.of('playTownCollapse').map((c) => c.args[0]);
        assert.ok(sizes.length >= 1, '砕けた音が鳴らない');
        assert.ok(sizes.every((s) => s > 0 && s < 64), `破片のかけらの数ではない: ${sizes}`);
    } finally { spy.restore(); }
});

test('soundLevel: 火元が多いほど強く（√ で FULL で 1）、火が無ければ 0', () => {
    const specs = Array.from({ length: 12 }, (_, i) => made(i * 40, 0, 32, 32, MAT_WOOD));
    const town = townOf(specs);
    assert.deepEqual(town.fire.soundLevel(null), { intensity: 0, x: null });
    town.fire.ignite(town.buildings[0], 0);
    const one = town.fire.soundLevel(null).intensity;
    assert.ok(Math.abs(one - Math.sqrt(1 / TOWN_FIRE_SOUND_FULL)) < 1e-9, `${one}`);
    for (const b of town.buildings) town.fire.ignite(b, 5);
    assert.equal(town.fire.soundLevel(null).intensity, 1);
});

test('soundLevel: 画面から遠い火元は弱く、左右は火元の位置', () => {
    const town = townOf([made(100, 100, 32, 32, MAT_WOOD), made(8000, 100, 32, 32, MAT_WOOD)]);
    const view = { x: 0, y: 0, w: 640, h: 360 };
    town.fire.ignite(town.buildings[0], 0);
    const near = town.fire.soundLevel(view);
    town.fire.fires.length = 0;
    town.fire.ignite(town.buildings[1], 0);
    const far = town.fire.soundLevel(view);
    assert.ok(near.intensity > 0 && Math.abs(near.x - 102) < 4);
    assert.equal(far.intensity, 0, '画面から 1画面以上離れた火が聞こえる');
});

test('update: 火があれば startTownFire、無くなれば stopTownFire', () => {
    const spy = spyAudio(NAMES);
    try {
        const town = townOf([made(100, 100, 32, 32, MAT_WOOD)]);
        town.update(gameAt(null));
        assert.equal(spy.of('startTownFire').length, 0);
        assert.equal(spy.of('stopTownFire').length, 1);
        town.fire.ignite(town.buildings[0], 0);
        spy.calls.length = 0;
        town.update(gameAt(null));
        const [intensity, x] = spy.of('startTownFire')[0].args;
        assert.ok(intensity > 0 && Math.abs(x - 102) < 4);
        assert.equal(spy.of('stopTownFire').length, 0);
    } finally { spy.restore(); }
});
```

- [ ] **Step 2: 走らせて失敗を見る**

Run: `npm test -- tests/town-sound-wiring.test.js`
Expected: FAIL（`TOWN_FIRE_SOUND_FULL` の import のエラー。定数だけ先に足せば、`soundLevel` が無い・`playTownCollapse` が呼ばれない）。fixture の前提（「崩壊した」「落ちる破片がある」）で落ちたら、fixture の寸法を直して Ruling を台帳に書く（実装の問題ではない）

- [ ] **Step 3: 実装する**

`src/js/utils/Constants.js` の段4の節に追加:

```js
// 炎のループの強さ = √(Σ 火元ごとの位置の音量 / FULL) を 1 で頭打ち。√ にしたのは火元1つでも聞こえるように
// （1つで -10dB）。位置の音量は positionalVolume（画面の中 1、外は下がって1画面ぶんで 0）
export const TOWN_FIRE_SOUND_FULL = 10;
```

`src/js/world/town/fire.js`: import に `positionalVolume`（`../../utils/audioFalloff.js`）と `TOWN_FIRE_SOUND_FULL` を足し、`draw` の後ろに:

```js
    /**
     * 炎のループの強さと左右（Town.update が毎 tick audioManager へ渡す。spec 4章）。
     * view は Town の {x, y, w, h}。無ければ（道具・テスト）全部の火元を音量 1 とする
     * @returns {{intensity:number, x:number|null}}
     */
    soundLevel(view) {
        const lv = view ? { cx: view.x + view.w / 2, cy: view.y + view.h / 2, halfW: view.w / 2, halfH: view.h / 2 } : null;
        let sum = 0, sx = 0;
        for (const f of this.fires) {
            const c = FireSystem.center(f.b, f.k);
            const w = lv ? positionalVolume(c.x, c.y, lv) : 1;
            sum += w;
            sx += w * c.x;
        }
        if (sum <= 0) return { intensity: 0, x: null };
        return { intensity: Math.min(1, Math.sqrt(sum / TOWN_FIRE_SOUND_FULL)), x: sx / sum };
    }
```

`src/js/world/town/Town.js`:
- import に `import { audioManager } from '../../audio/AudioManager.js';`
- `_shatter` の `this._emit('shatter', p.cx, groundY, { mat, count: TOWN_SHATTER_PARTICLES });` を `{ mat, count: TOWN_SHATTER_PARTICLES, size: p.count }` にする（`p.count` は砕ける前のかけらの数。`p.alive = false` はかけらを消さないので同じ値）
- `update` の `this.fire.update(view);` の後ろに:

```js
        // 炎のループ（spec 4章）。画面に近い火元が無くなったら引いて止める
        const fireSound = this.fire.soundLevel(view);
        if (fireSound.intensity > 0) audioManager.startTownFire(fireSound.intensity, fireSound.x);
        else audioManager.stopTownFire();
```

- `_flushEffects` の JSDoc の「音は段4」を「崩れる音は、画面の近くの崩壊・砕けのうち一番大きい1つだけ鳴らす（グレネード1発で何棟も同時に崩れても1回。spec 4章「80ms 以内はまとめる」の tick の中の分。tick をまたぐ分は playTownCollapse が見る）」にし、ループの前に `let loud = null;`、画面外で `continue` する判定の後ろ（種類で分ける前）に:

```js
            if ((e.type === 'collapse' || e.type === 'shatter') && e.size > 0 && (!loud || e.size > loud.size)) loud = e;
```

ループの後ろ（`this.effects.length = 0;` の前）に:

```js
        if (loud) audioManager.playTownCollapse(loud.size, loud.x);
```

`src/js/audio/CLAUDE.md` の「試聴用の書き出し」の行に `、node tools/render-town-sounds.mjs（3面の町の崩れる音・炎のループ。A特性の実測も出す）` を足す。

- [ ] **Step 4: 走らせて通るのを見る**

Run: `npm test -- tests/town-sound-wiring.test.js tests/town-wiring.test.js tests/town-fire.test.js tests/town-fire-fx.test.js tests/town-settle.test.js tests/town-falling.test.js tests/town-explosives.test.js tests/town-explosives-chain.test.js`
Expected: PASS（全部）

- [ ] **Step 5: わざと壊して赤くなるか確かめる**

控えを取ってから、1つずつ:
- `_flushEffects` の「一番大きい1つ」をやめ、注文ごとに `playTownCollapse` を呼ぶ → 「1 tick に何棟も崩れても1回」が赤くなる。戻す
- 画面外の `continue` より前で `loud` を決めるようにする → 「画面の外の崩壊は鳴らない」が赤くなる。戻す
- `_shatter` の `size: p.count` を消す → 「落ちた破片が砕けると…」が赤くなる。戻す
- `soundLevel` の `Math.sqrt(…)` を外す → 「√ で FULL で 1」が赤くなる。戻す
- `update` の `else audioManager.stopTownFire();` を消す → 「無くなれば stopTownFire」が赤くなる。戻す

- [ ] **Step 6: 書き出して聴ける形にし、数を控える**

Run: `node tools/render-town-sounds.mjs`
Expected: `audio-preview/` に `town-collapse-large.wav` / `town-collapse-small.wav` / `town-shatter.wav` / `town-fire.wav`。表示の dB を控え（最後の報告に書く）、定数のコメントの「実測」と一致しているか見る

- [ ] **Step 7: 全テストを走らせてコミット**

Run: `npm test -- --test-skip-pattern=湧き位置は重複しない > $S/t4.log 2>&1; tail -8 $S/t4.log`
Expected: fail 0

```bash
git add src/js/world/town/fire.js src/js/world/town/Town.js src/js/audio/CLAUDE.md tests/town-sound-wiring.test.js
# Constants.js は「ステージ手順」で町の節だけ
git commit -m "feat: 町から崩れる音（1 tick に一番大きい1つ・画面の近くだけ）と炎のループ（近い火元の数と位置）を鳴らす"
```

---

## 実機に渡すときの対応表（最後の報告に貼る）

| 確認ポイント | 調整する定数 |
|---|---|
| 崩れる音の大きさ（爆発と比べて） | `TOWN_COLLAPSE_RUMBLE_GAIN`（地鳴り）、`TOWN_COLLAPSE_RATTLE_GAIN`（ガラガラ） |
| 地鳴りの長さ・低さ | `TOWN_COLLAPSE_RUMBLE_TIME`（1.2秒）、`_FROM` / `_TO`（400→60Hz） |
| ガラガラの数・散らばり・高さ | `TOWN_COLLAPSE_RATTLES`（10）、`_RATTLE_SPREAD`（0.6秒）、`_RATTLE_FREQ_MIN` / `_RANGE` |
| 小さい破片の音が大きすぎ・小さすぎ | `TOWN_COLLAPSE_SOUND_EXP`（0.75）、`_MIN`（0.1）、`_REF`（160 かけら） |
| 崩れる音が重なりすぎ | `TOWN_COLLAPSE_SOUND_MERGE_MS`（80） |
| 炎のゴーッの大きさ・こもり具合 | `TOWN_FIRE_ROAR_GAIN`、`TOWN_FIRE_ROAR_FILTER`（300Hz） |
| パチパチの大きさ・数 | `TOWN_FIRE_CRACKLE_GAIN`、`TOWN_FIRE_CRACKLE_RATE`（14回/秒） |
| 火元いくつで炎の音が最大になるか | `TOWN_FIRE_SOUND_FULL`（10） |

確認のときはハードリロード（Cmd+Shift+R）が要る。`node tools/render-town-sounds.mjs` で `audio-preview/` に WAV が出るので、実機の前に単体で聴ける。
