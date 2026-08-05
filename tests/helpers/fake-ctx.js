// 呼び出しを記録するだけの疑似 Canvas 2D コンテキスト。
// 描画メソッドの幾何を検証するために使う。

const METHODS = [
  'save', 'restore', 'translate', 'scale', 'rotate',
  'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc',
  'stroke', 'fill', 'fillRect', 'strokeRect', 'clearRect',
  'drawImage',
];

/** これらのプロパティへの代入は calls に `{ name: 'set:<prop>', args: [value] }` として記録する。 */
const TRACKED_PROPS = ['strokeStyle', 'fillStyle', 'lineWidth', 'lineCap', 'lineJoin', 'globalAlpha'];

/** @returns {object} calls 配列を持つ疑似 ctx */
export function makeFakeCtx() {
  const calls = [];
  const ctx = {
    calls,
    font: '', textAlign: '',
  };
  const values = {
    strokeStyle: '', fillStyle: '', lineWidth: 1, lineCap: '', lineJoin: '', globalAlpha: 1,
  };
  for (const prop of TRACKED_PROPS) {
    Object.defineProperty(ctx, prop, {
      enumerable: true,
      get() { return values[prop]; },
      set(v) {
        values[prop] = v;
        calls.push({ name: `set:${prop}`, args: [v] });
      },
    });
  }
  for (const name of METHODS) {
    ctx[name] = (...args) => { calls.push({ name, args }); };
  }
  // 実物のグラデーションは比較できないので、生成引数とカラーストップを持つ
  // プレーンオブジェクトを返す。fillStyle に代入されると set:fillStyle として記録される。
  ctx.createRadialGradient = (...args) => ({
    type: 'radialGradient',
    args,
    stops: [],
    addColorStop(offset, color) { this.stops.push([offset, color]); },
  });
  return ctx;
}

/**
 * beginPath 〜 stroke の間の moveTo/lineTo を1本のポリラインとして抽出する。
 * @param {Array<{name:string,args:any[]}>} calls
 * @returns {Array<Array<{x:number,y:number}>>}
 */
export function extractPolylines(calls) {
  const out = [];
  let current = null;
  for (const c of calls) {
    if (c.name === 'beginPath') {
      current = [];
    } else if (current && (c.name === 'moveTo' || c.name === 'lineTo')) {
      current.push({ x: c.args[0], y: c.args[1] });
    } else if (c.name === 'stroke' && current) {
      out.push(current);
      current = null;
    }
  }
  return out;
}

/** fillRect 呼び出しだけを {x,y,w,h} の配列で取り出す。 */
export function extractFillRects(calls) {
  return calls
    .filter((c) => c.name === 'fillRect')
    .map((c) => ({ x: c.args[0], y: c.args[1], w: c.args[2], h: c.args[3] }));
}

/** arc 呼び出しだけを {x,y,radius} の配列で取り出す（円で描かれたパーツ用）。 */
export function extractArcs(calls) {
  return calls
    .filter((c) => c.name === 'arc')
    .map((c) => ({ x: c.args[0], y: c.args[1], radius: c.args[2] }));
}

/**
 * fillRect 呼び出しを、その時点で有効な fillStyle 込みで取り出す
 * ({x,y,w,h,color})。パーツ定義の座標「かつ」色が描画側に存在することを
 * 確認したいときに使う。
 */
export function extractFillRectsWithColor(calls) {
  const out = [];
  let color = '';
  for (const c of calls) {
    if (c.name === 'set:fillStyle') {
      color = c.args[0];
    } else if (c.name === 'fillRect') {
      out.push({ x: c.args[0], y: c.args[1], w: c.args[2], h: c.args[3], color });
    }
  }
  return out;
}

/**
 * strokeStyle / fillStyle / lineWidth / lineCap / lineJoin への代入値を、
 * 代入された順番のまま取り出す。
 * @param {Array<{name:string,args:any[]}>} calls
 * @param {string} propName 例: 'lineWidth'
 * @returns {any[]}
 */
export function extractSets(calls, propName) {
  return calls
    .filter((c) => c.name === `set:${propName}`)
    .map((c) => c.args[0]);
}
