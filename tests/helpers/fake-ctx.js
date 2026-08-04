// 呼び出しを記録するだけの疑似 Canvas 2D コンテキスト。
// 描画メソッドの幾何を検証するために使う。

const METHODS = [
  'save', 'restore', 'translate', 'scale', 'rotate',
  'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc',
  'stroke', 'fill', 'fillRect', 'strokeRect', 'clearRect',
];

/** @returns {object} calls 配列を持つ疑似 ctx */
export function makeFakeCtx() {
  const calls = [];
  const ctx = {
    calls,
    fillStyle: '', strokeStyle: '', lineWidth: 1,
    lineCap: '', lineJoin: '', globalAlpha: 1, font: '', textAlign: '',
  };
  for (const name of METHODS) {
    ctx[name] = (...args) => { calls.push({ name, args }); };
  }
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
