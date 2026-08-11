# ドッキング補給のSE 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ドッキング中の補給に音をつける。HP回復のハム（進捗で音程が上がるループ）、弾が1発入るたびの装填クリック、全リソース満タン時の合成音声「レディ」。

**Architecture:** ワンショットの2音は既存のデータ駆動合成（`WEAPON_SOUNDS` の表 ＋ `renderWeaponSound()` 1本）に乗せる。クリックは既存の `clicks` パーツで表に2行足すだけ、Ready は新パーツ `voice` を1つ追加して中身は表側に書く。ハムはループ音なのでそちらには乗らないため、AudioManager に散らばっているループ音の骨格を `_loopSound()` ヘルパーに集約し、その上に実装する。発火の判断は補給を進めている唯一の場所 `Player._updateDockedResupply()` に置く。

**Tech Stack:** Web Audio API（手続き合成のみ、音声ファイルは使わない）、ES modules、`node --test`（`npm test`）。

## Global Constraints

- 音声ファイル（wav/mp3）は追加しない。すべて手続き合成で作る。
- 装填クリックは1発＝1クリックで厳密に対応させる。間引かない。
- Ready は「未満 → 満タン」の変化でのみ1回鳴らす。満タンで居続けても、ドック時点で既に満タンでも鳴らさない。
- ループ音の載せ替えは carrierEngine のみ。`hover` / `enemyHover` には触らない。
- carrierEngine の音のパラメータ（周波数・ゲイン・時定数）は載せ替え前後で変えない。
- `src/js/audio/weaponSounds.js` の `renderWeaponSound()` と `tests/helpers/weapon-render.js` の `renderWeaponProfile()` は同じ音を出す対。片方だけ変えない。
- コミットは `git add <ファイルを明示>`。`git add -A` / `git add .` は使わない（作業ツリーの `src/js/main.js` に無関係の変更がある）。
- 実機での試聴はユーザーが行う。実装側は `npm test` とオフラインレンダリングで確かめる。

## File Structure

| ファイル | 役割 | 変更 |
|---|---|---|
| `src/js/audio/weaponSounds.js` | 音のプロファイル表と組み立て1本 | `voice` パーツ、`voiceBreakpoints()`、3プロファイル追加 |
| `tests/helpers/weapon-render.js` | 上のオフライン再現（測定用） | `voice` パーツの再現を追加 |
| `src/js/utils/Constants.js` | 調整値 | 回復ハムの定数5つ |
| `src/js/audio/AudioManager.js` | 鳴らす口とループ音 | `_loopSound()` / `_stopLoopSound()`、`startRepairHum()` / `stopRepairHum()`、carrierEngine 載せ替え、`fadeOutSe()` |
| `src/js/entities/Player.js` | 発火の判断 | `_updateDockedResupply()`、`_isFullyStocked()`、`_dockAllFull` |
| `src/js/main.js` | 離脱時の後始末 | undock 分岐に `stopRepairHum()` |
| `tests/helpers/fake-audio-ctx.js` | 疑似 AudioContext（新規・共有） | se-bus.test.js から切り出して拡張 |
| `tests/weapon-sounds.test.js` | 表と合成のテスト | `voice` と装填クリックのテスト追加 |
| `tests/loop-sound.test.js` | ループ音ヘルパーのテスト（新規） | |
| `tests/dock-resupply-sound.test.js` | 発火のテスト（新規） | |
| `tools/render-weapon-sounds.mjs` | 試聴用 WAV 書き出し | 新プロファイルの説明を追記 |
| `tools/render-repair-hum.mjs` | ハムの試聴用（新規） | |

---

### Task 1: `voice` パーツと「レディ」

Ready ボイスの合成。既存の `tone` は単一オシレータの掃引で母音のフォルマントが作れないため、5つ目のパーツを足す。声帯パルス（ノコギリ波）を3本のバンドパスに通し、母音を e → i へ滑らせる。

WebAudio 版とオフライン版の2つの実装がずれないよう、包絡とフォルマントの時間変化は `voiceBreakpoints()` という純粋関数1つに寄せ、両方がそれを読む。

**Files:**
- Modify: `src/js/audio/weaponSounds.js`
- Modify: `tests/helpers/weapon-render.js`
- Test: `tests/weapon-sounds.test.js`

**Interfaces:**
- Consumes: なし（最初のタスク）
- Produces:
  - `voiceBreakpoints(voice) → { env: [[t, gain], ...], formants: [[t, [f1, f2, f3]], ...], total: number }`（`weaponSounds.js` から export）
  - `WEAPON_SOUNDS.readyVoice`（`voice` パーツを持つプロファイル）
  - `renderWeaponSound()` / `renderWeaponProfile()` / `profileDuration()` が `voice` を扱えるようになる

- [ ] **Step 1: 失敗するテストを書く**

`tests/weapon-sounds.test.js` の末尾に追記する。先頭の import に `voiceBreakpoints` を足すこと（`import { WEAPON_SOUNDS, renderWeaponSound, voiceBreakpoints } from '../src/js/audio/weaponSounds.js';`）。

```js
// --- Ready ボイス ---------------------------------------------------------------

test('「レディ」は2音節で、間に子音の閉鎖がある', () => {
  const v = WEAPON_SOUNDS.readyVoice.voice;
  assert.equal(v.segments.length, 2, '2音節になっていない');
  assert.ok(v.segments[1].closure > 0, 'd の閉鎖が無く1音節に繋がって聞こえる');
});

test('母音が e から i へ動く（動かないと「レーレー」に聞こえる）', () => {
  const [a, b] = WEAPON_SOUNDS.readyVoice.voice.segments;
  // i は口が狭い。F1 が下がって F2 が上がるのが e→i の特徴
  assert.ok(b.f[0] < a.f[0], `F1 が下がっていない: ${a.f[0]} → ${b.f[0]}Hz`);
  assert.ok(b.f[1] > a.f[1], `F2 が上がっていない: ${a.f[1]} → ${b.f[1]}Hz`);
});

test('声の高さはほぼ一定（人ではなく機械の声）', () => {
  const v = WEAPON_SOUNDS.readyVoice.voice;
  const drop = Math.abs((v.f0End ?? v.f0) - v.f0) / v.f0;
  assert.ok(drop < 0.25, `抑揚が大きすぎて人の声に寄る: ${(drop * 100).toFixed(0)}%`);
});

test('breakpoint は時間順で、閉鎖の間は無音', () => {
  const { env, formants, total } = voiceBreakpoints(WEAPON_SOUNDS.readyVoice.voice);
  for (let i = 1; i < env.length; i++) {
    assert.ok(env[i][0] >= env[i - 1][0], `包絡の時刻が戻っている: ${env[i - 1][0]} → ${env[i][0]}`);
  }
  for (let i = 1; i < formants.length; i++) {
    assert.ok(formants[i][0] >= formants[i - 1][0], 'フォルマントの時刻が戻っている');
  }
  assert.ok(total > 0.2 && total < 0.45, `長さが「レディ」らしくない: ${total.toFixed(2)}秒`);

  // 閉鎖の中央では包絡が 0
  const seg = WEAPON_SOUNDS.readyVoice.voice.segments;
  const closureMid = seg[0].dur + seg[1].closure / 2;
  const at = (t) => {
    let prev = env[0];
    for (const e of env) { if (e[0] >= t) {
      const span = e[0] - prev[0];
      return span <= 0 ? e[1] : prev[1] + (e[1] - prev[1]) * (t - prev[0]) / span;
    } prev = e; }
    return prev[1];
  };
  assert.ok(at(closureMid) < 1e-9, `閉鎖が無音になっていない: ${at(closureMid)}`);
});

test('波形が壊れず、2つの音節として鳴る', () => {
  const buf = renderWeaponProfile(WEAPON_SOUNDS.readyVoice);
  assert.ok(buf.some((v) => v !== 0), '無音になっている');
  assert.ok(buf.every((v) => Number.isFinite(v)), 'NaN / Infinity が出ている');

  // 閉鎖のところで一度落ちる（＝2つの山に分かれる）
  const seg = WEAPON_SOUNDS.readyVoice.voice.segments;
  const win = (from, to) => {
    let peak = 0;
    for (let i = Math.floor(from * SAMPLE_RATE); i < Math.floor(to * SAMPLE_RATE); i++) {
      peak = Math.max(peak, Math.abs(buf[i]));
    }
    return peak;
  };
  const first = win(0.01, seg[0].dur - 0.02);
  const gap = win(seg[0].dur + 0.005, seg[0].dur + seg[1].closure);
  const second = win(seg[0].dur + seg[1].closure + 0.02,
    seg[0].dur + seg[1].closure + seg[1].dur - 0.02);
  assert.ok(first > 0, '1音節目が鳴っていない');
  assert.ok(second > 0, '2音節目が鳴っていない');
  assert.ok(gap < first * 0.25, `音節が繋がっている: 谷 ${gap.toFixed(4)} / 山 ${first.toFixed(4)}`);
});
```

- [ ] **Step 2: 失敗することを確認**

Run: `npm test -- tests/weapon-sounds.test.js`
Expected: FAIL。`voiceBreakpoints` が export されていないためのエラー、および `WEAPON_SOUNDS.readyVoice` が undefined。

- [ ] **Step 3: `voiceBreakpoints()` とプロファイルを追加**

`src/js/audio/weaponSounds.js`。ファイル冒頭のコメントのパーツ一覧に `voice` を1行足し、`@typedef` に `voice` を追記したうえで、`WEAPON_SOUNDS` の `grenade` の後ろにプロファイルを、`FLOOR` の定義の後ろに関数を置く。

```js
    // --- 補給完了の「レディ」---
    // 合成音声。声帯パルス（ノコギリ波）を3本のバンドパスに通し、
    // 母音を e → i へ滑らせて2音節にする。f0 をほとんど動かさないので
    // 人ではなく機械が喋っているように聞こえる。
    // closure は d の閉鎖。ここを無音にしないと「レーイ」と繋がる。
    readyVoice: {
        voice: {
            f0: 150, f0End: 132, gain: 0.16, Q: 9,
            segments: [
                { f: [520, 1650, 2500], dur: 0.11, gain: 1.0 },                  // レ（e）
                { f: [330, 2200, 2900], dur: 0.17, gain: 0.85, closure: 0.035 }, // ディ（i）
            ],
        },
    },
```

```js
/** 音節の立ち上がり／消え際／母音が移り終わる位置（区間長に対する割合）。 */
const VOICE_ATTACK = 0.012;
const VOICE_RELEASE = 0.020;
const VOICE_GLIDE = 0.5;

/**
 * `voice` の時間変化を折れ線で返す。
 *
 * WebAudio 版とオフラインの測定版で同じ音にするために、時間の設計は
 * ここ1箇所だけに置く。前者は折れ線をそのまま linearRamp で予約し、
 * 後者はサンプルごとに線形補間する。
 *
 * @param {object} voice プロファイルの voice パーツ
 * @returns {{env: [number, number][], formants: [number, number[]][], total: number}}
 *   時刻は音の先頭からの秒数
 */
export function voiceBreakpoints(voice) {
    const { gain = 1, segments } = voice;
    const env = [[0, 0]];
    const formants = [[0, segments[0].f]];
    let t = 0;
    for (const seg of segments) {
        const closure = seg.closure || 0;
        // 閉鎖の間は 0 のまま保つ。ここで折らないと閉鎖を横切って持ち上がる
        if (closure > 0) env.push([t + closure, 0]);
        t += closure;

        const g = gain * (seg.gain ?? 1);
        env.push([t + VOICE_ATTACK, g], [t + seg.dur - VOICE_RELEASE, g], [t + seg.dur, 0]);
        // 母音は区間の前半で移り終え、残りは保つ
        formants.push([t + seg.dur * VOICE_GLIDE, seg.f], [t + seg.dur, seg.f]);
        t += seg.dur;
    }
    return { env, formants, total: t };
}
```

`renderWeaponSound()` の末尾（`profile.clicks` のブロックの後ろ）に組み立てを足す。

```js
    if (profile.voice) {
        const { f0, f0End = f0, Q = 9, levels = [1, 0.5, 0.25] } = profile.voice;
        const { env, formants, total } = voiceBreakpoints(profile.voice);

        // 声帯パルス。高さをほとんど動かさないのがロボットらしさ
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f0, t0);
        osc.frequency.linearRampToValueAtTime(f0End, t0 + total);

        // 音節の包絡。閉鎖の間は 0 に落ちる
        const eg = ctx.createGain();
        eg.gain.setValueAtTime(env[0][1] * level, t0);
        for (let i = 1; i < env.length; i++) {
            eg.gain.linearRampToValueAtTime(env[i][1] * level, t0 + env[i][0]);
        }
        osc.connect(eg);

        // 3本のフォルマント。母音の違いはここに出る
        for (let k = 0; k < 3; k++) {
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.Q.value = Q;
            bp.frequency.setValueAtTime(formants[0][1][k], t0);
            for (let i = 1; i < formants.length; i++) {
                bp.frequency.linearRampToValueAtTime(formants[i][1][k], t0 + formants[i][0]);
            }
            const fg = ctx.createGain();
            fg.gain.value = levels[k];
            eg.connect(bp); bp.connect(fg); fg.connect(out);
        }

        osc.start(t0);
        osc.stop(t0 + total);
    }
```

- [ ] **Step 4: オフライン版を同じ音に揃える**

`tests/helpers/weapon-render.js`。import に `voiceBreakpoints` を足す（`import { voiceBreakpoints } from '../../src/js/audio/weaponSounds.js';`）。

掃引するバンドパスを、既存の `sweepingLowpass()` の隣に足す。

```js
/** 掃引するバンドパス（WebAudio の BiquadFilterNode と同じ係数）。 */
function sweepingBandpass(Q) {
    const st = { x1: 0, x2: 0, y1: 0, y2: 0 };
    return (x, f0) => {
        const w0 = 2 * Math.PI * Math.max(20, f0) / SAMPLE_RATE;
        const cw = Math.cos(w0);
        const al = Math.sin(w0) / (2 * Q);
        const b0 = al, b1 = 0, b2 = -al;
        const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
        const y = (b0 / a0) * x + (b1 / a0) * st.x1 + (b2 / a0) * st.x2
                - (a1 / a0) * st.y1 - (a2 / a0) * st.y2;
        st.x2 = st.x1; st.x1 = x; st.y2 = st.y1; st.y1 = y;
        return y;
    };
}

/** 折れ線を時刻 t で線形補間する。voiceBreakpoints の出力を読むために使う。 */
function lerpBreakpoints(points, t, pick = (v) => v) {
    let prev = points[0];
    for (const p of points) {
        if (p[0] >= t) {
            const span = p[0] - prev[0];
            if (span <= 0) return pick(p[1]);
            const k = (t - prev[0]) / span;
            const a = pick(prev[1]), b = pick(p[1]);
            return a + (b - a) * k;
        }
        prev = p;
    }
    return pick(prev[1]);
}
```

`profileDuration()` の `Math.max(...)` に `voice` の項を足す。

```js
        profile.voice ? voiceBreakpoints(profile.voice).total : 0,
```

`renderWeaponProfile()` の末尾（`profile.clicks` のブロックの後ろ、`return buf;` の直前）に足す。

```js
    if (profile.voice) {
        const { f0, f0End = f0, Q = 9, levels = [1, 0.5, 0.25] } = profile.voice;
        const { env, formants, total } = voiceBreakpoints(profile.voice);
        const bps = [0, 1, 2].map(() => sweepingBandpass(Q));
        const len = Math.min(n, Math.floor(total * SAMPLE_RATE));
        let phase = 0;
        for (let i = 0; i < len; i++) {
            const t = i / SAMPLE_RATE;
            phase = (phase + (f0 + (f0End - f0) * (t / total)) / SAMPLE_RATE) % 1;
            const src = (2 * phase - 1) * lerpBreakpoints(env, t);
            for (let k = 0; k < 3; k++) {
                buf[i] += bps[k](src, lerpBreakpoints(formants, t, (f) => f[k])) * levels[k];
            }
        }
    }
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npm test -- tests/weapon-sounds.test.js`
Expected: PASS（既存のテストも含めて全部）

- [ ] **Step 6: 全テストを流す**

Run: `npm test`
Expected: PASS。`どの音も少なくとも1つの部品を持つ` が落ちたら、そのテストの条件に `|| p.voice` を足す（`readyVoice` は voice しか持たない）。

- [ ] **Step 7: コミット**

```bash
git add src/js/audio/weaponSounds.js tests/helpers/weapon-render.js tests/weapon-sounds.test.js
git commit -m "feat: 合成音声のパーツ voice と補給完了の「レディ」を追加"
```

---

### Task 2: 装填クリック2種

弾が1発入るたびの音。既存の `clicks` パーツ（リロードの「ガチャリ」を作っている部品）をそのまま使い、表に2行足す。合成コードは書かない。

毎秒6回鳴るので、音量は既存のリロード音より明確に小さく、かつミサイルとグレネードで揃っている必要がある。数値は実測して決める。

**Files:**
- Modify: `src/js/audio/weaponSounds.js`
- Test: `tests/weapon-sounds.test.js`

**Interfaces:**
- Consumes: Task 1 の `renderWeaponProfile()`（`voice` 対応済み）
- Produces: `WEAPON_SOUNDS.ammoMissile` / `WEAPON_SOUNDS.ammoGrenade`（`playWeapon(kind)` の kind として Task 6 が使う）

- [ ] **Step 1: 失敗するテストを書く**

`tests/weapon-sounds.test.js` の末尾に追記。

```js
// --- 補給の装填クリック ---------------------------------------------------------

test('装填は1発＝1打撃', () => {
  for (const kind of ['ammoMissile', 'ammoGrenade']) {
    assert.equal(WEAPON_SOUNDS[kind].clicks.count, 1, `${kind}: 打撃が1つでない`);
  }
});

test('装填音は連続して鳴っても潰れない短さ（毎秒6回鳴る）', () => {
  for (const kind of ['ammoMissile', 'ammoGrenade']) {
    assert.ok(profileDuration(WEAPON_SOUNDS[kind]) < 1 / 6,
      `${kind}: 次の1発に重なる: ${profileDuration(WEAPON_SOUNDS[kind]).toFixed(3)}秒`);
  }
});

test('ミサイルとグレネードで音色が違う（どちらが入ったか分かる）', () => {
  const m = WEAPON_SOUNDS.ammoMissile.clicks;
  const g = WEAPON_SOUNDS.ammoGrenade.clicks;
  assert.ok(m.freq > g.freq * 2, `高さが近すぎて聞き分けられない: ${m.freq} / ${g.freq}Hz`);
});

test('装填音はリロードと同じ機構の音に聞こえる', () => {
  // 非整数倍の共鳴比が金属らしさを決める。ここが違うと別の機械の音になる
  const metal = WEAPON_SOUNDS.reload.clicks.metal;
  assert.equal(WEAPON_SOUNDS.ammoMissile.clicks.metal, metal);
  assert.equal(WEAPON_SOUNDS.ammoGrenade.clicks.metal, metal);
});

test('装填音は2種の聞こえる大きさが揃い、リロードより控えめ', () => {
  // 低い打撃はバンドパスを通る帯域が狭くて痩せるので、同じ gain だと揃わない。
  // 毎秒6回鳴るため、1回だけのリロードより明確に小さくないと煩い
  const level = (kind) => transientLevel(
    (i) => renderWeaponProfile(WEAPON_SOUNDS[kind])[i] ?? 0,
    profileDuration(WEAPON_SOUNDS[kind]),
  );
  const m = level('ammoMissile');
  const g = level('ammoGrenade');
  const reload = level('reload');

  assert.ok(Math.abs(db(m / g)) < 2.5,
    `2種の音量が揃っていない: ${db(m / g).toFixed(1)}dB 差`);
  for (const [kind, v] of [['ammoMissile', m], ['ammoGrenade', g]]) {
    assert.ok(db(v / reload) < -5, `${kind}: リロードに対して大きすぎる: ${db(v / reload).toFixed(1)}dB`);
    assert.ok(db(v / reload) > -18, `${kind}: 小さすぎて聞こえない: ${db(v / reload).toFixed(1)}dB`);
  }
});
```

- [ ] **Step 2: 失敗することを確認**

Run: `npm test -- tests/weapon-sounds.test.js`
Expected: FAIL。`WEAPON_SOUNDS.ammoMissile` が undefined。

- [ ] **Step 3: プロファイルを追加**

`src/js/audio/weaponSounds.js` の `grenade` の後ろ（`readyVoice` の前）に置く。

```js
    // --- 補給の装填 ---
    // ドッキング中に弾が1発入るたびに鳴る。1発＝1打撃。
    // リロードと同じ metal 比にして、同じ機構が動いている音に揃える。
    // ミサイルは薬室に入る軽い「カチッ」、グレネードは重い「コツン」。
    // 低い打撃ほど通る帯域が狭くて痩せるので、グレネードの gain は大きい。
    ammoMissile: {
        clicks: { count: 1, gap: 0, freq: 1150, dur: 0.030, gain: 0.30, Q: 9, metal: 2.76 },
    },
    ammoGrenade: {
        clicks: { count: 1, gap: 0, freq: 430, dur: 0.045, gain: 0.62, Q: 8, metal: 2.76 },
    },
```

- [ ] **Step 4: 音量を実測して gain を詰める**

Run: `npm test -- tests/weapon-sounds.test.js`

`装填音は2種の聞こえる大きさが揃い…` が落ちたら、失敗メッセージの dB を読んで `gain` を直す。差が `+X dB` なら、その音の `gain` を `10 ** (-X / 20)` 倍する。1回で収まらなければ繰り返す。**通るまで次へ進まない。**

- [ ] **Step 5: 全テストを流す**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/js/audio/weaponSounds.js tests/weapon-sounds.test.js
git commit -m "feat: 補給の装填クリック（ミサイル／グレネード）を追加"
```

---

### Task 3: 疑似 AudioContext をテストヘルパーに切り出す

ループ音のテストにはノードを作る `AudioContext` もどきが要る。同じものが `tests/se-bus.test.js` の中に既にあるので、書き足さずに共有ヘルパーへ移し、オシレータとフィルタを足す。

**Files:**
- Create: `tests/helpers/fake-audio-ctx.js`
- Modify: `tests/se-bus.test.js:12-63`（`fakeCtx` と `withCtx` の定義を削除して import に置き換え）

**Interfaces:**
- Consumes: なし
- Produces:
  - `fakeAudioCtx() → ctx`（`created` に作られたノードが積まれる。ノードは `{ name, inputs, outputs, connect, disconnect }`、パラメータは `{ value, events, setValueAtTime, linearRampToValueAtTime, setTargetAtTime, cancelScheduledValues }`）
  - `withCtx(ctx, fn)`（`audioManager` に ctx を差し込んで fn を実行し、必ず元に戻す）

- [ ] **Step 1: ヘルパーを作る**

`tests/helpers/fake-audio-ctx.js`:

```js
// 接続とスケジュールを記録するだけの AudioContext もどき。
//
// node:test には AudioContext が無いので、ノードの繋ぎ方や予約した値を
// 確かめたいときはこれを audioManager に差し込む。音は出ない。

import { audioManager } from '../../src/js/audio/AudioManager.js';

/** @returns {object} 作られたノードが `created` に積まれる疑似 ctx */
export function fakeAudioCtx() {
  const ctx = {
    currentTime: 0,
    sampleRate: 48000,
    state: 'running',
    destination: { name: 'destination', inputs: [] },
    created: [],
    _param(value = 0) {
      return {
        value, events: [],
        setValueAtTime(v, t) { this.value = v; this.events.push(['set', v, t]); },
        linearRampToValueAtTime(v, t) { this.target = v; this.events.push(['ramp', v, t]); },
        exponentialRampToValueAtTime(v, t) { this.target = v; this.events.push(['exp', v, t]); },
        setTargetAtTime(v, t, tc) { this.target = v; this.events.push(['target', v, t, tc]); },
        cancelScheduledValues() { this.events.push(['cancel']); },
      };
    },
    _node(name, extra = {}) {
      const n = {
        name, inputs: [], outputs: [], started: 0, stopped: 0,
        connect(dst) { this.outputs.push(dst); (dst.inputs || []).push(this); },
        disconnect() {},
        ...extra,
      };
      ctx.created.push(n);
      return n;
    },
    createGain() { return ctx._node('gain', { gain: ctx._param(1) }); },
    createOscillator() {
      return ctx._node('oscillator', {
        type: 'sine', frequency: ctx._param(440), detune: ctx._param(0),
        start() { this.started++; }, stop() { this.stopped++; },
      });
    },
    createBiquadFilter() {
      return ctx._node('filter', {
        type: 'lowpass', frequency: ctx._param(350), Q: ctx._param(1),
      });
    },
    createBufferSource() {
      return ctx._node('bufferSource', {
        buffer: null, loop: false,
        start() { this.started++; }, stop() { this.stopped++; },
      });
    },
    createStereoPanner() { return ctx._node('panner', { pan: ctx._param(0) }); },
    createDynamicsCompressor() {
      return ctx._node('compressor', {
        threshold: ctx._param(0), knee: ctx._param(0), ratio: ctx._param(1),
        attack: ctx._param(0), release: ctx._param(0),
      });
    },
  };
  return ctx;
}

/** audioManager に ctx を差し込んで fn を実行し、必ず元へ戻す。 */
export function withCtx(ctx, fn) {
  const saved = {
    ctx: audioManager.ctx, fade: audioManager.seFade, master: audioManager.seMaster,
    faded: audioManager.seFaded, lx: audioManager.listenerX, loops: audioManager._loops,
  };
  audioManager.ctx = ctx;
  audioManager.seFade = null;
  audioManager.seMaster = null;
  audioManager.seFaded = false;
  audioManager._loops = {};
  try {
    return fn();
  } finally {
    Object.assign(audioManager, {
      ctx: saved.ctx, seFade: saved.fade, seMaster: saved.master,
      seFaded: saved.faded, listenerX: saved.lx, _loops: saved.loops,
    });
  }
}
```

`_loops` は Task 4 で AudioManager に足す。ここでは未定義のまま保存・復元されるだけで問題ない。

- [ ] **Step 2: se-bus.test.js を差し替える**

`tests/se-bus.test.js` の `function fakeCtx() { ... }` と `function withCtx(ctx, fn) { ... }` の定義（12〜63行目あたり）を丸ごと削除し、import を足す。

```js
import { fakeAudioCtx, withCtx } from './helpers/fake-audio-ctx.js';
```

ファイル内の `fakeCtx()` の呼び出しをすべて `fakeAudioCtx()` に置き換える。`reaches()` はこのファイル固有なので残す。

- [ ] **Step 3: テストが通ることを確認**

Run: `npm test -- tests/se-bus.test.js`
Expected: PASS（切り出し前と同じ結果。1件も落ちない）

- [ ] **Step 4: コミット**

```bash
git add tests/helpers/fake-audio-ctx.js tests/se-bus.test.js
git commit -m "refactor: 疑似 AudioContext をテストヘルパーに切り出す"
```

---

### Task 4: ループ音ヘルパーと carrierEngine の載せ替え

鳴り続ける音は AudioManager 内に hover / enemyHover / carrierEngine の3つあり、「無ければ作る／`setTargetAtTime` で追従／止めるときフェードして 250ms 後に `stop()`」という骨格を3回書いている。Task 5 のハムで4回目にしないため、骨格を1本に集約する。

載せ替えるのは carrierEngine のみ。音の数値は一切変えない。

**Files:**
- Modify: `src/js/audio/AudioManager.js:24-40`（constructor）, `:713-758`（carrierEngine）
- Test: `tests/loop-sound.test.js`（新規）

**Interfaces:**
- Consumes: Task 3 の `fakeAudioCtx()` / `withCtx()`
- Produces:
  - `audioManager._loops`（key → ノード束、または null）
  - `_loopSound(key, { build, tune })`。`build()` は `{ gain, sources: [...] }` を含むオブジェクトを返す。`tune(nodes, t)` は毎回呼ばれる
  - `_stopLoopSound(key, fade = 0.12)`

- [ ] **Step 1: 失敗するテストを書く**

`tests/loop-sound.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { fakeAudioCtx, withCtx } from './helpers/fake-audio-ctx.js';

test('繰り返し start しても音源は1組しか作られない', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager.startCarrierEngine(0);
    const after1 = ctx.created.length;
    audioManager.startCarrierEngine(0.5);
    audioManager.startCarrierEngine(1);
    assert.equal(ctx.created.length, after1, '毎回ノードを作り直している（音が重なる）');
  });
});

test('毎フレーム呼ばれた値が追従に反映される', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager.startCarrierEngine(0);
    const gain = audioManager._loops.carrier.gain;
    const first = gain.gain.target;
    audioManager.startCarrierEngine(1);
    assert.ok(gain.gain.target > first, '移動しても音量が上がっていない');
  });
});

test('母艦のエンジンの音は載せ替え前と同じ値を予約する', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager.startCarrierEngine(0);
    const n = audioManager._loops.carrier;
    assert.equal(n.osc.frequency.target, 46);
    assert.equal(n.sub.frequency.target, 23);
    assert.equal(n.filter.frequency.target, 150);
    assert.ok(Math.abs(n.gain.gain.target - 0.06) < 1e-9);

    audioManager.startCarrierEngine(1);
    assert.equal(n.osc.frequency.target, 60);
    assert.equal(n.sub.frequency.target, 30);
    assert.equal(n.filter.frequency.target, 270);
    assert.ok(Math.abs(n.gain.gain.target - 0.11) < 1e-9);
  });
});

test('止めるときは切らずに引く', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager.startCarrierEngine(0.5);
    const gain = audioManager._loops.carrier.gain;
    audioManager.stopCarrierEngine();
    assert.equal(gain.gain.target, 0, '0 まで引いていない');
    assert.equal(audioManager._loops.carrier, null, '止めたのに残っている');
  });
});

test('二重に止めても落ちない', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager.startCarrierEngine(0);
    audioManager.stopCarrierEngine();
    assert.doesNotThrow(() => audioManager.stopCarrierEngine());
  });
});

test('鳴らしていないものを止めても落ちない', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    assert.doesNotThrow(() => audioManager.stopCarrierEngine());
  });
});

test('音の出せない環境では何も作らない', () => {
  assert.doesNotThrow(() => audioManager.startCarrierEngine(1));
  assert.equal(audioManager.ctx, null);
});
```

- [ ] **Step 2: 失敗することを確認**

Run: `npm test -- tests/loop-sound.test.js`
Expected: FAIL。`audioManager._loops` が undefined。

- [ ] **Step 3: ヘルパーを実装する**

`src/js/audio/AudioManager.js` の constructor に1行足す（`this.hoverRPM = 0;` の下あたり）。

```js
        this._loops = {};        // 鳴り続けている音（key → ノード束）
```

`_seDest()` の定義の後ろにヘルパーを置く。

```js
    /**
     * 鳴り続ける音の共通の骨格。
     *
     * 「無ければ作る → 毎回 setTargetAtTime で追従させる」という形は
     * ホバーにもエンジンにも補給のハムにも要る。ここに集約して、
     * 音ごとの違いは build / tune の2つだけに出るようにしてある。
     *
     * 毎フレーム呼んでよい。呼ぶのをやめるだけでは止まらないので、
     * 止めるときは _stopLoopSound() を呼ぶこと。
     *
     * @param {string} key 音の名前（_loops のキー）
     * @param {{build: () => object, tune: (nodes: object, t: number) => void}} spec
     *   build は `{ gain, sources: [...] }` を含むノード束を返す。
     *   gain は止めるときに引く段、sources は start / stop する音源
     */
    _loopSound(key, spec) {
        if (!this._prepare()) return;
        let nodes = this._loops[key];
        if (!nodes) {
            nodes = spec.build();
            this._loops[key] = nodes;
            for (const src of nodes.sources) src.start();
        }
        spec.tune(nodes, this.ctx.currentTime);
    }

    /**
     * ループ音を止める。ぶつ切りにせず引いてから音源を捨てる。
     * 鳴っていないときや、音の出せない環境で呼んでも何も起きない。
     * @param {string} key
     * @param {number} [fade] 引くのにかける時定数（秒）
     */
    _stopLoopSound(key, fade = 0.12) {
        const nodes = this._loops[key];
        if (!nodes) return;
        this._loops[key] = null;
        nodes.gain.gain.setTargetAtTime(0, this.ctx.currentTime, fade);
        const { sources } = nodes;
        setTimeout(() => {
            for (const src of sources) {
                try { src.stop(); src.disconnect(); } catch (e) { /* 既に停止 */ }
            }
        }, Math.max(250, fade * 2000));
    }
```

- [ ] **Step 4: carrierEngine を載せ替える**

`startCarrierEngine` / `stopCarrierEngine` の本体を丸ごと差し替える。JSDoc コメントはそのまま残す。

```js
    startCarrierEngine(throttle = 0) {
        this._loopSound('carrier', {
            build: () => {
                const osc = this.ctx.createOscillator();
                const sub = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                const filter = this.ctx.createBiquadFilter();

                osc.type = 'sawtooth';
                sub.type = 'sine';
                filter.type = 'lowpass';
                filter.frequency.value = 180;
                filter.Q.value = 3;
                gain.gain.value = 0;

                osc.connect(filter);
                sub.connect(filter);
                filter.connect(gain);
                gain.connect(this._seDest());
                return { gain, filter, osc, sub, sources: [osc, sub] };
            },
            // 停止中は低く静かに、移動中は少し上がる
            tune: (n, t) => {
                n.osc.frequency.setTargetAtTime(46 + throttle * 14, t, 0.12);
                n.sub.frequency.setTargetAtTime(23 + throttle * 7, t, 0.12);
                n.filter.frequency.setTargetAtTime(150 + throttle * 120, t, 0.12);
                n.gain.gain.setTargetAtTime(0.06 + throttle * 0.05, t, 0.12);
            },
        });
    }

    /** 母艦のエンジンを止める（アタッチ解除時）。 */
    stopCarrierEngine() {
        this._stopLoopSound('carrier');
    }
```

古い `this.carrierOsc` / `carrierSub` / `carrierGain` / `carrierFilter` はどこからも参照されなくなる。constructor に宣言は無いので削除するものは無い。

- [ ] **Step 5: テストが通ることを確認**

Run: `npm test -- tests/loop-sound.test.js`
Expected: PASS

- [ ] **Step 6: 全テストを流す**

Run: `npm test`
Expected: PASS。特に `tests/se-bus.test.js` の `持続音は音源ごと止める` と `tests/audio-manager.test.js` が落ちていないこと。

- [ ] **Step 7: コミット**

```bash
git add src/js/audio/AudioManager.js tests/loop-sound.test.js
git commit -m "refactor: ループ音の骨格を _loopSound に集約し母艦エンジンを載せ替える"
```

---

### Task 5: 回復ハム

HP が満ちるまで鳴り続けるループ。進捗で音程が上がるので、あと何秒で満ちるかが耳で分かる。母艦のエンジン（46〜60Hz）と帯域が被らないよう中域に置く。

**Files:**
- Modify: `src/js/utils/Constants.js:122-129`（Docking Resupply の節の末尾）
- Modify: `src/js/audio/AudioManager.js`（carrierEngine の後ろ、`fadeOutSe()`）
- Test: `tests/loop-sound.test.js`

**Interfaces:**
- Consumes: Task 4 の `_loopSound()` / `_stopLoopSound()`
- Produces:
  - `audioManager.startRepairHum(progress)`（progress は 0〜1。毎フレーム呼んでよい）
  - `audioManager.stopRepairHum()`
  - 定数 `REPAIR_HUM_FREQ_FROM` / `REPAIR_HUM_FREQ_TO` / `REPAIR_HUM_GAIN` / `REPAIR_HUM_WOBBLE_HZ` / `REPAIR_HUM_WOBBLE_DEPTH`

- [ ] **Step 1: 失敗するテストを書く**

`tests/loop-sound.test.js` の末尾に追記。import に定数を足す。

```js
import {
  REPAIR_HUM_FREQ_FROM, REPAIR_HUM_FREQ_TO, REPAIR_HUM_GAIN,
} from '../src/js/utils/Constants.js';
```

```js
// --- 回復ハム -------------------------------------------------------------------

test('回復が進むと音程が上がる（あと何秒かが耳で分かる）', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager.startRepairHum(0);
    const osc = audioManager._loops.repair.osc;
    assert.equal(osc.frequency.target, REPAIR_HUM_FREQ_FROM);
    audioManager.startRepairHum(1);
    assert.equal(osc.frequency.target, REPAIR_HUM_FREQ_TO);
  });
});

test('進捗が範囲外でも音程が飛ばない', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager.startRepairHum(-5);
    const osc = audioManager._loops.repair.osc;
    assert.equal(osc.frequency.target, REPAIR_HUM_FREQ_FROM);
    audioManager.startRepairHum(99);
    assert.equal(osc.frequency.target, REPAIR_HUM_FREQ_TO);
  });
});

test('ハムは母艦のエンジンと帯域が被らない', () => {
  // 被ると唸りになって、どちらの音も濁る
  assert.ok(REPAIR_HUM_FREQ_FROM > 200,
    `エンジン（46〜60Hz）に近すぎる: ${REPAIR_HUM_FREQ_FROM}Hz`);
  assert.ok(REPAIR_HUM_FREQ_TO > REPAIR_HUM_FREQ_FROM, '進んでも上がらない');
});

test('ハムは他の音を邪魔しない音量', () => {
  // 鳴り続ける音なので、単発の効果音より小さくないと耳につく
  assert.ok(REPAIR_HUM_GAIN > 0.01, `小さすぎて聞こえない: ${REPAIR_HUM_GAIN}`);
  assert.ok(REPAIR_HUM_GAIN < 0.09, `鳴り続ける音として大きすぎる: ${REPAIR_HUM_GAIN}`);
});

test('ハムも繰り返し start で音源が増えない', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager.startRepairHum(0);
    const after1 = ctx.created.length;
    audioManager.startRepairHum(0.5);
    assert.equal(ctx.created.length, after1);
  });
});

test('ハムを止めると引いて消える', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager.startRepairHum(0.5);
    const gain = audioManager._loops.repair.gain;
    audioManager.stopRepairHum();
    assert.equal(gain.gain.target, 0);
    assert.equal(audioManager._loops.repair, null);
  });
});

test('エンジンとハムは互いを止めない', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager.startCarrierEngine(0);
    audioManager.startRepairHum(0);
    audioManager.stopRepairHum();
    assert.ok(audioManager._loops.carrier, 'ハムを止めたらエンジンまで止まった');
  });
});

test('ゲームオーバーのフェードでハムも音源ごと止まる', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager._createSeBus();
    audioManager.startRepairHum(0.5);
    audioManager.fadeOutSe();
    assert.equal(audioManager._loops.repair, null, '引いた後も鳴り続ける');
  });
});
```

- [ ] **Step 2: 失敗することを確認**

Run: `npm test -- tests/loop-sound.test.js`
Expected: FAIL。`REPAIR_HUM_FREQ_FROM` の import で落ちる。

- [ ] **Step 3: 定数を追加**

`src/js/utils/Constants.js` の `DOCK_FUEL_RATE` の行の後ろに置く。

```js
// 回復ハム：ドッキング中に HP が満ちるまで鳴り続ける。進むほど音程が上がるので、
// あと何秒で満ちるかが耳で分かる。母艦のエンジン（46〜60Hz）と被らない中域に置く。
export const REPAIR_HUM_FREQ_FROM = 300;    // HP 空
export const REPAIR_HUM_FREQ_TO = 460;      // 満タン直前
export const REPAIR_HUM_GAIN = 0.05;        // 鳴り続けるので単発の効果音より控えめ
export const REPAIR_HUM_WOBBLE_HZ = 7;      // 装置が働いている感じを出す揺れ
export const REPAIR_HUM_WOBBLE_DEPTH = 0.012;
```

- [ ] **Step 4: ハムを実装**

`src/js/audio/AudioManager.js` の import に定数を足す。

```js
    REPAIR_HUM_FREQ_FROM, REPAIR_HUM_FREQ_TO, REPAIR_HUM_GAIN,
    REPAIR_HUM_WOBBLE_HZ, REPAIR_HUM_WOBBLE_DEPTH,
```

`stopCarrierEngine()` の後ろに置く。

```js
    /**
     * ドッキング中の HP 回復。満ちるまで鳴り続け、進むほど音程が上がる。
     * 毎フレーム呼んでよい。満タンになったら stopRepairHum() を呼ぶこと。
     * @param {number} progress 0=空 1=満タン
     */
    startRepairHum(progress = 0) {
        const p = Math.max(0, Math.min(1, progress));
        this._loopSound('repair', {
            build: () => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                // 揺れ。一定だと電子音になり、装置が働いている感じが出ない
                const lfo = this.ctx.createOscillator();
                const lfoGain = this.ctx.createGain();

                osc.type = 'triangle';
                lfo.type = 'sine';
                lfo.frequency.value = REPAIR_HUM_WOBBLE_HZ;
                lfoGain.gain.value = REPAIR_HUM_WOBBLE_DEPTH;
                gain.gain.value = 0;

                osc.connect(gain);
                lfo.connect(lfoGain);
                lfoGain.connect(gain.gain);
                gain.connect(this._seDest());
                return { gain, osc, lfo, sources: [osc, lfo] };
            },
            tune: (n, t) => {
                const freq = REPAIR_HUM_FREQ_FROM + p * (REPAIR_HUM_FREQ_TO - REPAIR_HUM_FREQ_FROM);
                n.osc.frequency.setTargetAtTime(freq, t, 0.15);
                n.gain.gain.setTargetAtTime(REPAIR_HUM_GAIN, t, 0.15);
            },
        });
    }

    /** 回復ハムを止める（満タン、または補給の途中で離脱したとき）。 */
    stopRepairHum() {
        this._stopLoopSound('repair');
    }
```

`fadeOutSe()` の持続音を止めている並びに1行足し、JSDoc の「持続音（自機のホバー・敵のホバー・母艦のエンジン）」を「…・母艦のエンジン・補給のハム」に直す。

```js
        this.stopRepairHum();
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npm test -- tests/loop-sound.test.js`
Expected: PASS

- [ ] **Step 6: 全テストを流す**

Run: `npm test`
Expected: PASS。`tests/se-bus.test.js` の `持続音は音源ごと止める` は `stopHover` / `stopEnemyHover` / `stopCarrierEngine` だけを差し替えて比べているので、`stopRepairHum` を足しても結果は変わらない。落ちた場合はそのテストの期待値を実態に合わせる。

- [ ] **Step 7: コミット**

```bash
git add src/js/utils/Constants.js src/js/audio/AudioManager.js tests/loop-sound.test.js
git commit -m "feat: ドッキング中の HP 回復にハムを追加"
```

---

### Task 6: 補給の進行に音を繋ぐ

ここまでの3音を実際に鳴らす。判断は補給を進めている唯一の場所に置く。

**Files:**
- Modify: `src/js/entities/Player.js:514-538`（`_updateDockedResupply` と `resupply`）, `:478-489`（`reset` 相当の初期化）
- Modify: `src/js/main.js:1020-1030`（undock 分岐）
- Test: `tests/dock-resupply-sound.test.js`（新規）

**Interfaces:**
- Consumes: `WEAPON_SOUNDS.ammoMissile` / `ammoGrenade` / `readyVoice`（Task 1・2）、`startRepairHum()` / `stopRepairHum()`（Task 5）
- Produces: `Player._isFullyStocked() → boolean`、`Player._dockAllFull`

- [ ] **Step 1: 失敗するテストを書く**

`tests/dock-resupply-sound.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { Player } from '../src/js/entities/Player.js';
import {
  PLAYER_MAX_HP, MISSILE_INITIAL_COUNT, GRENADE_INITIAL_COUNT, HOVER_MAX_FUEL,
} from '../src/js/utils/Constants.js';

/** audioManager の呼び出しを記録する。音は鳴らせないので呼び出しで確かめる。 */
function spyAudio(names) {
  const calls = [];
  const originals = {};
  for (const n of names) {
    originals[n] = audioManager[n];
    audioManager[n] = (...args) => calls.push({ name: n, args });
  }
  return {
    calls,
    restore() { for (const n of names) audioManager[n] = originals[n]; },
    count(n) { return calls.filter((c) => c.name === n).length; },
    weapons(kind) {
      return calls.filter((c) => c.name === 'playWeapon' && c.args[0] === kind).length;
    },
  };
}

/** ドッキング直後の自機。空にした状態から始める。 */
function makeDockedPlayer(overrides = {}) {
  const p = Object.create(Player.prototype);
  p.game = { gameSpeed: 1 };
  p.hp = 0;
  p.missiles = 0;
  p.grenades = 0;
  p.hoverFuel = 0;
  p.mgBurstLeft = 0;
  p.mgFireTimer = 0;
  p.mgReloadTimer = 0;
  Object.assign(p, overrides);
  p.resupply();
  return p;
}

/** 満タンになるまで（余裕をみて 400 フレーム）回す。 */
function runUntilFull(p, frames = 400) {
  for (let i = 0; i < frames; i++) p._updateDockedResupply();
}

test('弾は1発入るごとにクリックが鳴る', () => {
  const spy = spyAudio(['playWeapon', 'startRepairHum', 'stopRepairHum']);
  try {
    runUntilFull(makeDockedPlayer());
    assert.equal(spy.weapons('ammoMissile'), MISSILE_INITIAL_COUNT,
      'ミサイルのクリック数が装填数と合っていない');
    assert.equal(spy.weapons('ammoGrenade'), GRENADE_INITIAL_COUNT,
      'グレネードのクリック数が装填数と合っていない');
  } finally { spy.restore(); }
});

test('装填音は左右に振れない（自機は常に母艦の上）', () => {
  const spy = spyAudio(['playWeapon', 'startRepairHum', 'stopRepairHum']);
  try {
    runUntilFull(makeDockedPlayer());
    for (const c of spy.calls) {
      if (c.name === 'playWeapon') {
        assert.equal(c.args.length, 1, `座標を渡していて左右に振れる: ${c.args.join(', ')}`);
      }
    }
  } finally { spy.restore(); }
});

test('回復中はハムが鳴り、満タンで止まる', () => {
  const spy = spyAudio(['playWeapon', 'startRepairHum', 'stopRepairHum']);
  try {
    const p = makeDockedPlayer();
    p._updateDockedResupply();
    assert.ok(spy.count('startRepairHum') > 0, '回復中にハムが鳴っていない');
    assert.equal(spy.count('stopRepairHum'), 0, '回復の途中で止まっている');

    runUntilFull(p);
    assert.equal(spy.count('stopRepairHum'), 1, '満タンでちょうど1回止まっていない');
    assert.equal(p.hp, PLAYER_MAX_HP);
  } finally { spy.restore(); }
});

test('ハムの進捗は 0 から 1 へ動く', () => {
  const spy = spyAudio(['playWeapon', 'startRepairHum', 'stopRepairHum']);
  try {
    const p = makeDockedPlayer();
    runUntilFull(p);
    const progress = spy.calls.filter((c) => c.name === 'startRepairHum').map((c) => c.args[0]);
    assert.ok(progress[0] < 0.1, `始まりが 0 付近でない: ${progress[0]}`);
    assert.ok(progress[progress.length - 1] > 0.9, '終わりが 1 付近でない');
    for (let i = 1; i < progress.length; i++) {
      assert.ok(progress[i] >= progress[i - 1], '進捗が戻っている');
    }
  } finally { spy.restore(); }
});

test('全部満ちた瞬間に「レディ」がちょうど1回', () => {
  const spy = spyAudio(['playWeapon', 'startRepairHum', 'stopRepairHum']);
  try {
    const p = makeDockedPlayer();
    runUntilFull(p);
    assert.equal(spy.weapons('readyVoice'), 1);
    // 満タンのまま居続けても増えない
    runUntilFull(p, 120);
    assert.equal(spy.weapons('readyVoice'), 1, '満タンで居続けると鳴り続ける');
  } finally { spy.restore(); }
});

test('最後に満ちるものより前では鳴らない', () => {
  const spy = spyAudio(['playWeapon', 'startRepairHum', 'stopRepairHum']);
  try {
    const p = makeDockedPlayer();
    // HP（3.6秒）も燃料（4秒）も満ちるが、弾（6秒）はまだ
    for (let i = 0; i < 300; i++) p._updateDockedResupply();
    assert.equal(p.hp, PLAYER_MAX_HP);
    assert.ok(p.missiles < MISSILE_INITIAL_COUNT);
    assert.equal(spy.weapons('readyVoice'), 0, '弾が残っているのに出撃可能と告げている');
  } finally { spy.restore(); }
});

test('最初から満タンならドックしても鳴らない', () => {
  const spy = spyAudio(['playWeapon', 'startRepairHum', 'stopRepairHum']);
  try {
    const p = makeDockedPlayer({
      hp: PLAYER_MAX_HP, missiles: MISSILE_INITIAL_COUNT,
      grenades: GRENADE_INITIAL_COUNT, hoverFuel: HOVER_MAX_FUEL,
    });
    runUntilFull(p, 120);
    assert.equal(spy.weapons('readyVoice'), 0, '補給していないのに鳴っている');
    assert.equal(spy.weapons('ammoMissile'), 0);
    assert.equal(spy.count('startRepairHum'), 0, '減っていないのにハムが鳴っている');
  } finally { spy.restore(); }
});

test('補給の途中で離陸するとハムが止まる', () => {
  const source = readFileSync(new URL('../src/js/main.js', import.meta.url), 'utf8');
  const undock = source.slice(source.indexOf('player.docked = false;'));
  assert.ok(undock.slice(0, 400).includes('stopRepairHum()'),
    '離脱してもハムが鳴り続ける');
});
```

このファイルの先頭に `import { readFileSync } from 'node:fs';` を足すこと（最後のテストで使う）。

- [ ] **Step 2: 失敗することを確認**

Run: `npm test -- tests/dock-resupply-sound.test.js`
Expected: FAIL。クリックが0回、`readyVoice` が0回など。

- [ ] **Step 3: Player を実装**

`src/js/entities/Player.js`。`_updateDockedResupply()` を差し替える。

```js
    /** Called every frame while docked — gradually restores HP, ammo, and fuel. */
    _updateDockedResupply() {
        // Rates are defined per real-time frame; sim frames tick gameSpeed× slower
        // in NORMAL mode, so scale up to keep resupply seconds equal across modes.
        const scale = 1 / (this.game.gameSpeed || 1);

        // 回復・装填はそれぞれ音を持つ。補給が進んでいることを耳で追えるように、
        // 「1発入った」瞬間と「満ちた」瞬間をここで拾う
        if (this.hp < PLAYER_MAX_HP) {
            this.hp = Math.min(PLAYER_MAX_HP, this.hp + DOCK_HP_RATE * scale);
            if (this.hp < PLAYER_MAX_HP) {
                audioManager.startRepairHum(this.hp / PLAYER_MAX_HP);
            } else {
                audioManager.stopRepairHum();
            }
        }
        if (this.missiles < MISSILE_INITIAL_COUNT) {
            const before = Math.floor(this.missiles);
            this.missiles = Math.min(MISSILE_INITIAL_COUNT, this.missiles + DOCK_MISSILE_RATE * scale);
            if (Math.floor(this.missiles) > before) audioManager.playWeapon('ammoMissile');
        }
        if (this.grenades < GRENADE_INITIAL_COUNT) {
            const before = Math.floor(this.grenades);
            this.grenades = Math.min(GRENADE_INITIAL_COUNT, this.grenades + DOCK_GRENADE_RATE * scale);
            if (Math.floor(this.grenades) > before) audioManager.playWeapon('ammoGrenade');
        }
        if (this.hoverFuel < HOVER_MAX_FUEL) {
            this.hoverFuel = Math.min(HOVER_MAX_FUEL, this.hoverFuel + DOCK_FUEL_RATE * scale);
        }

        // 全部満ちた瞬間に一度だけ。満タンで居続けても、ドックした時点で既に
        // 満タンでも鳴らさない（_dockAllFull はドック成立時に現状で初期化される）
        const full = this._isFullyStocked();
        if (full && !this._dockAllFull) audioManager.playWeapon('readyVoice');
        this._dockAllFull = full;
    }

    /** 補給するものが何も残っていないか。 */
    _isFullyStocked() {
        return this.hp >= PLAYER_MAX_HP
            && this.missiles >= MISSILE_INITIAL_COUNT
            && this.grenades >= GRENADE_INITIAL_COUNT
            && this.hoverFuel >= HOVER_MAX_FUEL;
    }
```

`resupply()` に1行足す。

```js
    /** Resupply all resources (when docking). */
    resupply() {
        // Weapon state is reset immediately on dock; actual HP/ammo/fuel
        // are restored gradually each frame via _updateDockedResupply().
        this._resetMGState();
        // 満タンでドックしたときに「レディ」を鳴らさないよう、今の状態で初期化する
        this._dockAllFull = this._isFullyStocked();
    }
```

自機の初期化（`this.docked = true;` を含むブロック、`audioManager.stopHover();` のあたり）にも同じ初期化を足す。リスポーンは満タンで始まるので、これが無いと復帰の直後に「レディ」が鳴る。

```js
        audioManager.stopHover();
        audioManager.stopRepairHum();
        this._dockAllFull = this._isFullyStocked();
```

- [ ] **Step 4: main.js の離脱処理**

`src/js/main.js` の undock 分岐、`audioManager.stopCarrierEngine();` の直後に足す。

```js
                audioManager.stopRepairHum();
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npm test -- tests/dock-resupply-sound.test.js`
Expected: PASS

- [ ] **Step 6: 全テストを流す**

Run: `npm test`
Expected: PASS。特に `tests/dock-resupply.test.js`（補給の速度）と `tests/audio-wiring.test.js` が落ちていないこと。

- [ ] **Step 7: コミット**

`src/js/main.js` には無関係の変更が入っている可能性がある。`git diff src/js/main.js` を見て、**この計画で足した1行だけ**をコミットすること。他の変更が混ざっていたら `git add -p src/js/main.js` で1行だけ選ぶ。

```bash
git add src/js/entities/Player.js tests/dock-resupply-sound.test.js
git add -p src/js/main.js
git commit -m "feat: 補給の進行に回復ハム・装填クリック・「レディ」を繋ぐ"
```

---

### Task 7: 試聴用の書き出し

耳で決めるしかない部分をユーザーが確かめられるようにする。ワンショットの2音＋Ready は既存ツールが `WEAPON_SOUNDS` を全部回すので自動的に出る。説明だけ足す。ループのハムは表に載らないので専用のツールを1本置く。

**Files:**
- Modify: `tools/render-weapon-sounds.mjs`（`NOTES`）
- Create: `tools/render-repair-hum.mjs`

**Interfaces:**
- Consumes: `WEAPON_SOUNDS`（Task 1・2）、`REPAIR_HUM_*` 定数（Task 5）
- Produces: `audio-preview/w-ammoMissile.wav` / `w-ammoGrenade.wav` / `w-readyVoice.wav` / `repair-hum.wav`

- [ ] **Step 1: 既存ツールに説明を足す**

`tools/render-weapon-sounds.mjs` の `NOTES` に3行足す。

```js
    ammoMissile: '補給：ミサイルが1発入る「カチッ」',
    ammoGrenade: '補給：グレネードが1発入る「コツン」',
    readyVoice: '補給完了の「レディ」',
```

- [ ] **Step 2: 書き出して聴けることを確認**

Run: `node tools/render-weapon-sounds.mjs`
Expected: 一覧に `w-ammoMissile.wav` / `w-ammoGrenade.wav` / `w-readyVoice.wav` が説明つきで出る。

- [ ] **Step 3: ハムのツールを書く**

`tools/render-repair-hum.mjs`:

```js
#!/usr/bin/env node
// 回復ハムを WAV に書き出して聴く。
//
// ループ音は WEAPON_SOUNDS の表に載らないので（あちらは鳴らし切る音の表）、
// ここで別に書き出す。実際の回復と同じ 3.6 秒で音程が上がりきる。
//
// 使い方:
//   node tools/render-repair-hum.mjs
//   open audio-preview/            # macOS

import { writeFileSync, mkdirSync } from 'node:fs';
import {
    REPAIR_HUM_FREQ_FROM, REPAIR_HUM_FREQ_TO, REPAIR_HUM_GAIN,
    REPAIR_HUM_WOBBLE_HZ, REPAIR_HUM_WOBBLE_DEPTH,
    PLAYER_MAX_HP, DOCK_HP_RATE,
} from '../src/js/utils/Constants.js';
import { SAMPLE_RATE } from '../tests/helpers/dsp.js';

const OUT_DIR = new URL('../audio-preview/', import.meta.url);
const SECONDS = PLAYER_MAX_HP / DOCK_HP_RATE / 60;   // 満タンまでの実時間

/** 16bit モノラルの WAV を組み立てる。 */
function toWav(samples) {
    const data = Buffer.alloc(samples.length * 2);
    for (let i = 0; i < samples.length; i++) {
        const v = Math.max(-1, Math.min(1, samples[i]));
        data.writeInt16LE(Math.round(v * 32767), i * 2);
    }
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + data.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(SAMPLE_RATE, 24);
    header.writeUInt32LE(SAMPLE_RATE * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(data.length, 40);
    return Buffer.concat([header, data]);
}

const n = Math.floor(SECONDS * SAMPLE_RATE);
const buf = new Float64Array(n);
let phase = 0;
let lfoPhase = 0;
for (let i = 0; i < n; i++) {
    const p = i / n;                                   // 回復の進捗
    const f = REPAIR_HUM_FREQ_FROM + p * (REPAIR_HUM_FREQ_TO - REPAIR_HUM_FREQ_FROM);
    phase = (phase + f / SAMPLE_RATE) % 1;
    lfoPhase = (lfoPhase + REPAIR_HUM_WOBBLE_HZ / SAMPLE_RATE) % 1;
    const tri = 4 * Math.abs(phase - 0.5) - 1;
    const gain = REPAIR_HUM_GAIN + Math.sin(2 * Math.PI * lfoPhase) * REPAIR_HUM_WOBBLE_DEPTH;
    buf[i] = tri * gain;
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(new URL('repair-hum.wav', OUT_DIR), toWav(buf));
console.log(`audio-preview/repair-hum.wav  ${SECONDS.toFixed(1)}s  `
    + `${REPAIR_HUM_FREQ_FROM} → ${REPAIR_HUM_FREQ_TO}Hz`);
```

- [ ] **Step 4: 書き出しを確認**

Run: `node tools/render-repair-hum.mjs`
Expected: `audio-preview/repair-hum.wav  3.6s  300 → 460Hz` と出る。

- [ ] **Step 5: 全テストを流す**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add tools/render-weapon-sounds.mjs tools/render-repair-hum.mjs
git commit -m "tools: 補給の3音を試聴用に書き出せるようにする"
```

- [ ] **Step 7: ユーザーへ引き渡す**

`audio-preview/` の4ファイル（`w-ammoMissile.wav` / `w-ammoGrenade.wav` / `w-readyVoice.wav` / `repair-hum.wav`）を聴いてもらい、実機でも確かめてもらう。ローカルサーバーは `python3 -m http.server 8000` で立てる。ブラウザはハードリロードが要ることを伝える。

調整が要るときに触る場所:
- クリックの音色・音量 → `WEAPON_SOUNDS.ammoMissile` / `ammoGrenade`（`tests/weapon-sounds.test.js` の音量テストが範囲を守る）
- 「レディ」の声 → `WEAPON_SOUNDS.readyVoice.voice`（`f0` で高さ、`segments[].dur` で速さ、`f` で母音）
- ハム → `Constants.js` の `REPAIR_HUM_*`
