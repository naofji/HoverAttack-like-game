import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Play, Code, Box, AlertCircle, Settings2, MousePointer2, ChevronDown, ChevronRight, ChevronUp, Sparkles, Loader2, Undo, Redo, X, Copy, HelpCircle, Palette, Ruler } from 'lucide-react';

// ==========================================
// 1. Initial Default Data (Enemy Attacker)
// ==========================================
const DEFAULT_CODE = `// Width: 16, Height: 24 (Offset to center)
ctx.translate(-8, -12);

// Facing logic
if (!p.facingRight) {
  ctx.translate(16, 0); 
  ctx.scale(-1, 1);
}

// --- Body ---
ctx.fillStyle = p.bodyColor;
ctx.fillRect(5, 4, 10, 12);

// --- Head ---
ctx.fillStyle = p.headColor;
ctx.fillRect(6, 0, 8, 5);
// Visor
ctx.fillStyle = p.visorColor;
ctx.fillRect(10, 1, 3, 3);

// --- Backpack ---
ctx.fillStyle = p.backpackColor;
ctx.fillRect(2, 5, 4, 8);
ctx.fillStyle = p.exhaustColor;
ctx.fillRect(2, 12, 4, 2);

// --- Legs ---
const drawLeg = (legX, legY, offset) => {
  ctx.fillStyle = p.bodyColor;
  ctx.fillRect(legX, legY, 3, 4);
  ctx.fillStyle = p.headColor;
  ctx.fillRect(legX + offset, legY + 4, 3, 4);
};

if (!p.onGround) {
  drawLeg(6, 16, -1); // Near leg
  drawLeg(9, 16, 1);  // Far leg
} else {
  const WALK_POSES = [
    { near: -2, far: 2 },
    { near: -1, far: 1 },
    { near: 0, far: 0 },
    { near: 1, far: -1 },
  ];
  const pose = WALK_POSES[p.walkFrame] || WALK_POSES[2];
  drawLeg(6, 16, pose.near);
  drawLeg(9, 16, pose.far);
}

// --- Hover Exhaust Effect ---
if (p.hovering) {
  for (let i = 0; i < 3; i++) {
    const px = 2 + Math.random() * 4;
    const py = 14 + Math.random() * 6;
    const size = 1 + Math.random() * 2;
    ctx.fillStyle = '#00FFFF';
    ctx.globalAlpha = 0.3 + Math.random() * 0.4;
    ctx.fillRect(px, py, size, size);
  }
  ctx.globalAlpha = 1.0;
}

// --- Gun barrel ---
ctx.fillStyle = p.gunColor;
ctx.fillRect(13, 7, 5, 2);
ctx.fillStyle = '#999999';
ctx.fillRect(17, 7, 2, 2);`;

const DEFAULT_PARAMS = {
  scale: 6,
  bodyColor: "#3B82F6",
  headColor: "#93C5FD",
  visorColor: "#EF4444",
  backpackColor: "#1E3A8A",
  exhaustColor: "#9CA3AF",
  gunColor: "#4B5563",
  facingRight: true,
  hovering: false,
  onGround: true,
  walkFrame: 2
};

// ==========================================
// 2. Utils: Parser & Code Manipulation
// ==========================================

const splitArgs = (str) => {
  let args = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '(' || char === '{' || char === '[') depth++;
    else if (char === ')' || char === '}' || char === ']') depth--;
    else if (char === ',' && depth === 0) {
      args.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  args.push(current);
  return args;
};

const replaceNumberRightmost = (str, newNum, snapMode) => {
  const regex = /-?\d+(?:\.\d+)?/g;
  let match;
  let lastMatch = null;
  while ((match = regex.exec(str)) !== null) {
    lastMatch = match;
  }
  if (lastMatch) {
    const idx = lastMatch.index;
    const len = lastMatch[0].length;

    let val = newNum;
    if (snapMode === 'integer') val = Math.round(newNum);
    else if (snapMode === 'half') val = Math.round(newNum * 2) / 2;

    const formattedNum = Number.isInteger(val) ? val.toString() : parseFloat(val.toFixed(2)).toString();
    return str.substring(0, idx) + formattedNum + str.substring(idx + len);
  }
  return str;
};

const parseColorToHexAndAlpha = (colorStr) => {
  let hex = '#000000';
  let alpha = 1;
  if (!colorStr) return { hex, alpha };
  const str = String(colorStr).trim().toLowerCase();

  if (str.startsWith('#')) {
    if (str.length === 4) {
      hex = '#' + str[1] + str[1] + str[2] + str[2] + str[3] + str[3];
    } else if (str.length === 5) {
      hex = '#' + str[1] + str[1] + str[2] + str[2] + str[3] + str[3];
      alpha = parseInt(str[4] + str[4], 16) / 255;
    } else if (str.length === 7) {
      hex = str;
    } else if (str.length === 9) {
      hex = str.substring(0, 7);
      alpha = parseInt(str.substring(7, 9), 16) / 255;
    }
  } else if (str.startsWith('rgb')) {
    const match = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
    if (match) {
      const r = parseInt(match[1]).toString(16).padStart(2, '0');
      const g = parseInt(match[2]).toString(16).padStart(2, '0');
      const b = parseInt(match[3]).toString(16).padStart(2, '0');
      hex = `#${r}${g}${b}`;
      if (match[4] !== undefined) {
        alpha = parseFloat(match[4]);
      }
    }
  }
  return { hex, alpha };
};

const buildColorString = (hex, alpha, originalFormat) => {
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  const isRgb = String(originalFormat).trim().toLowerCase().startsWith('rgb');
  const isHexAlpha = String(originalFormat).trim().toLowerCase().startsWith('#') && (originalFormat.length === 9 || originalFormat.length === 5);

  if (isRgb || alpha < 1) {
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  } else if (isHexAlpha) {
    const alphaHex = Math.round(alpha * 255).toString(16).padStart(2, '0');
    return `${hex}${alphaHex}`;
  }
  return hex;
};


// ==========================================
// 3. Core Engine: Code Instrumentation
// ==========================================

const processCodeAndInjectParams = (sourceCode, params) => {
  const declared = new Set();
  let header = '';

  let preProcessed = sourceCode;
  if (!preProcessed.includes('class ') && /^\s*[a-zA-Z0-9_]+\s*\([^)]*\)\s*\{/.test(preProcessed)) {
    preProcessed = `class SnippetWrapper { ` + preProcessed + `\n}`;
  }

  let processed = preProcessed.replace(/import\s+([\s\S]*?)from\s+['"][^'"]+['"];?/g, (match, importBody) => {
    const items = importBody.replace(/[{}]/g, '').split(',').map(s => s.trim()).filter(Boolean);
    items.forEach(item => {
      const name = item.split(/\s+/).pop();
      if (!declared.has(name)) {
        declared.add(name);
        header += `const ${name} = p['${name}'] !== undefined ? p['${name}'] : 0;\n`;
      }
    });
    return match.replace(/[^\n]/g, '');
  });

  processed = processed.replace(/\bexport\s+class\b/g, '       class');
  processed = processed.replace(/\bexport\s+const\b/g, '       const');
  processed = processed.replace(/\bexport\s+let\b/g, '       let');
  processed = processed.replace(/\bexport\s+function\b/g, '       function');

  Object.keys(params).forEach(k => {
    if (!declared.has(k)) {
      declared.add(k);
      header += `const ${k} = p['${k}'];\n`;
    }
  });

  let lines = processed.split('\n');
  lines = lines.map((line, i) => {
    const commentIdx = line.indexOf('//');
    if (commentIdx !== -1) {
      const codePart = line.substring(0, commentIdx);
      const commentPart = line.substring(commentIdx);
      return codePart.replace(/\bctx\./g, `ctx._line(${i}).`) + commentPart;
    }
    return line.replace(/\bctx\./g, `ctx._line(${i}).`);
  });
  processed = lines.join('\n');

  const classMatch = processed.match(/class\s+([a-zA-Z0-9_]+)/);
  if (classMatch) {
    const className = classMatch[1];
    processed += `\n
try {
  const createSafeMock = () => new Proxy(function(){}, {
    get: (target, prop) => {
      if (prop === 'docked' || prop === 'alive' || prop === 'isPlayerOwned') return false;
      if (prop === 'x' || prop === 'y' || prop === 'width' || prop === 'height') return 0;
      if (prop === Symbol.toPrimitive) return () => 0;
      if (typeof prop === 'string' && prop !== 'prototype' && prop !== 'name') return createSafeMock();
      return undefined;
    },
    apply: () => createSafeMock()
  });

  const mockGame = { 
    player: createSafeMock(), carrier: createSafeMock(), input: createSafeMock(), map: createSafeMock(),
    projectiles: createSafeMock(), enemies: createSafeMock(), camera: createSafeMock(),
    spawnHeavyDamage: () => {}, spawnExplosion: () => {}, spawnSparks: () => {}, addScore: () => {}
  };

  const safeP = new Proxy(p, {
    get: (target, prop) => prop in target ? target[prop] : 0
  });

  const classCode = ${className}.toString();
  const ctorMatch = classCode.match(/constructor\\s*\\(([^)]*)\\)/);
  let argsList = [];
  if (ctorMatch && ctorMatch[1].trim() !== '') {
    argsList = ctorMatch[1].split(',').map(a => a.trim().split(/[=:]/)[0].trim());
  }
  
  const callArgs = argsList.map(name => {
    if (name === 'game' || name === 'scene') return mockGame;
    if (name === 'x' || name === 'y') return 0;
    if (name === 'p' || name === 'config' || name === 'options') return safeP;
    if (safeP[name] !== undefined) return safeP[name];
    return 0;
  });

  if (callArgs.length === 0) {
    callArgs.push(mockGame, 0, 0, safeP, safeP);
  }

  const instance = new ${className}(...callArgs);
  Object.assign(instance, p);
  if (!instance.config) instance.config = safeP;
  
  let renderMethod = instance.draw || instance.render || instance.drawShape;
  if (!renderMethod) {
      const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(instance))
          .filter(m => m !== 'constructor' && typeof instance[m] === 'function');
      if (methods.length > 0) renderMethod = instance[methods[0]];
  }

  if (typeof renderMethod === 'function') {
     const w = instance.width || 0;
     const h = instance.height || 0;
     ctx.save();
     ctx.translate(-w/2, -h/2);

     const methodStr = renderMethod.toString();
     let argNames = [];
     const argsMatch = methodStr.match(/^[a-zA-Z0-9_]*\\s*\\(([^)]*)\\)/) || methodStr.match(/^function\\s*[^(]*\\(([^)]*)\\)/);
     if (argsMatch && argsMatch[1].trim() !== '') {
         argNames = argsMatch[1].split(',').map(s => s.trim().split('=')[0].trim());
     }

     const callArgsRender = argNames.map(name => {
         if (name === 'ctx') return ctx;
         return safeP[name] !== undefined ? safeP[name] : 0;
     });
     
     if (!argNames.includes('ctx')) callArgsRender.unshift(ctx);
     
     renderMethod.apply(instance, callArgsRender);
     ctx.restore();
  } else {
     throw new Error("No renderable method found on " + '${className}');
  }
} catch(e) {
  throw new Error("Initialization Error: " + e.message);
}`;
  }

  return header + '\n' + processed;
};

const createProxyCtx = (realCtx, hitCtx, refs) => {
  let lastLineId = 0;
  let activePathLineId = 0;
  return new Proxy(realCtx, {
    get(target, prop, receiver) {
      if (prop === '_line') {
        return (lineIndex) => {
          lastLineId = lineIndex + 1;
          if (lineIndex === refs.selectedLine.current) {
            refs.captureNextDraw.current = true;
          }
          const r = (lastLineId >> 16) & 255;
          const g = (lastLineId >> 8) & 255;
          const b = lastLineId & 255;
          hitCtx.fillStyle = `rgb(${r},${g},${b})`;
          hitCtx.strokeStyle = `rgb(${r},${g},${b})`;
          return receiver;
        };
      }

      const value = target[prop];
      if (typeof value === 'function') {
        return (...args) => {
          const res = value.apply(target, args);

          if (prop === 'beginPath') {
            activePathLineId = 0;
          }
          if (['arc', 'rect', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'ellipse'].includes(prop)) {
            activePathLineId = lastLineId;
          }

          if (['moveTo', 'lineTo'].includes(prop)) {
            refs.hitVertices.current.push({ id: lastLineId, x: args[0], y: args[1], transform: realCtx.getTransform() });
          } else if (prop === 'quadraticCurveTo') {
            refs.hitVertices.current.push({ id: lastLineId, x: args[0], y: args[1], transform: realCtx.getTransform() });
            refs.hitVertices.current.push({ id: lastLineId, x: args[2], y: args[3], transform: realCtx.getTransform() });
          } else if (prop === 'bezierCurveTo') {
            refs.hitVertices.current.push({ id: lastLineId, x: args[0], y: args[1], transform: realCtx.getTransform() });
            refs.hitVertices.current.push({ id: lastLineId, x: args[2], y: args[3], transform: realCtx.getTransform() });
            refs.hitVertices.current.push({ id: lastLineId, x: args[4], y: args[5], transform: realCtx.getTransform() });
          }

          if (refs.captureNextDraw.current) {
            const drawMethods = ['fillRect', 'strokeRect', 'rect', 'roundRect', 'arc', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo'];
            if (drawMethods.includes(prop)) {
              refs.selectedShapeInfo.current = {
                method: prop,
                args: args,
                transform: realCtx.getTransform()
              };
              refs.captureNextDraw.current = false;
            }
          }

          const hitMethods = ['fillRect', 'strokeRect', 'clearRect', 'fill', 'stroke', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'rect', 'ellipse', 'bezierCurveTo', 'quadraticCurveTo', 'save', 'restore', 'translate', 'scale', 'rotate', 'transform', 'setTransform', 'roundRect', 'fillText', 'strokeText'];
          if (hitMethods.includes(prop)) {
            if (['fill', 'stroke'].includes(prop) && activePathLineId > 0) {
              const prevFill = hitCtx.fillStyle;
              const prevStroke = hitCtx.strokeStyle;

              const r = (activePathLineId >> 16) & 255;
              const g = (activePathLineId >> 8) & 255;
              const b = activePathLineId & 255;
              hitCtx.fillStyle = `rgb(${r},${g},${b})`;
              hitCtx.strokeStyle = `rgb(${r},${g},${b})`;

              hitCtx[prop].apply(hitCtx, args);

              hitCtx.fillStyle = prevFill;
              hitCtx.strokeStyle = prevStroke;
            } else {
              hitCtx[prop].apply(hitCtx, args);
            }
          }
          return res;
        };
      }
      return value;
    },
    set(target, prop, value) {
      target[prop] = value;
      if (['lineWidth', 'lineCap', 'lineJoin', 'miterLimit', 'font', 'textAlign', 'textBaseline'].includes(prop)) {
        hitCtx[prop] = value;
      }
      return true;
    }
  });
};

// --- Gemini AI Integration ---
const analyzeCodeWithAI = async (code) => {
  try {
    const apiKey = "";
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: code }] }],
        systemInstruction: { parts: [{ text: "You are an expert canvas 2D graphics analyzer. Extract visual parameters (colors, dimensions, offsets, toggles, specific states, and styling modes like 'type', 'kind', or 'name') from the code. Return ONLY a valid JSON object. For numbers, deeply infer 'min' and 'max'. For variables used as categories in switch/if-else blocks (e.g., type === 'heavy', name === 'boss', or state === 1), infer all possible values and return them as an 'options' array. CRITICAL: Ensure the types in 'options' exactly match the code. Colors can be hex or rgba. Do not include gameplay-only logic variables. Example: {\"bodyColor\": {\"value\": \"#ff0000\"}, \"shadowColor\": {\"value\": \"rgba(0,0,0,0.5)\"}, \"name\": {\"value\": \"enemy\", \"options\": [\"normal\", \"enemy\", \"boss\"]}, \"walkFrame\": {\"value\": 0, \"min\": 0, \"max\": 3}}" }] },
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (text) {
      const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(jsonStr);
    }
  } catch (err) {
    console.error("AI Analysis Error", err);
    throw err;
  }
  return null;
};


// ==========================================
// 4. Main Application Component
// ==========================================
export default function App() {
  const [sourceCode, setSourceCode] = useState(DEFAULT_CODE);
  const [paramsJson, setParamsJson] = useState(JSON.stringify(DEFAULT_PARAMS, null, 2));
  const [parsedParams, setParsedParams] = useState(DEFAULT_PARAMS);
  const [paramMeta, setParamMeta] = useState({});
  const [errorMsg, setErrorMsg] = useState(null);

  const [hoveredLines, setHoveredLines] = useState([]);
  const [selectedLine, setSelectedLine] = useState(null);
  const [editingLine, setEditingLine] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [isAllSelected, setIsAllSelected] = useState(false);

  const [snapMode, setSnapMode] = useState('integer');

  const [sidebarWidth, setSidebarWidth] = useState(288);
  const [bottomHeight, setBottomHeight] = useState(250);

  const [isParamsOpen, setIsParamsOpen] = useState(false);
  const [isColorTweakOpen, setIsColorTweakOpen] = useState(false);

  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

  const [activeSearchParam, setActiveSearchParam] = useState(null);
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);

  const [showRuler, setShowRuler] = useState(false);

  const historyRef = useRef({ past: [DEFAULT_CODE], future: [] });
  const [lastCommittedCode, setLastCommittedCode] = useState(DEFAULT_CODE);

  const canvasRef = useRef(null);
  const hitCanvasRef = useRef(document.createElement('canvas'));
  const containerRef = useRef(null);
  const mousePosRef = useRef(null);
  const codeContainerRef = useRef(null);

  const selectedLineRef = useRef(null);
  const captureNextDrawRef = useRef(false);
  const selectedShapeInfo = useRef(null);
  const handlesInfo = useRef(null);
  const hitVerticesRef = useRef([]);

  const layoutResizeRef = useRef({
    isResizingSidebar: false,
    isResizingBottom: false,
    startX: 0,
    startY: 0,
    startWidth: 0,
    startHeight: 0
  });

  const dragStateRef = useRef({
    active: false,
    mode: null,
    handle: null,
    targetLineIdx: -1,
    originalLineText: '',
    originalCode: '',
    funcName: '',
    argStrs: [],
    origVals: [],
    startX: 0,
    startY: 0
  });

  const runAiAnalysis = useCallback(async (code, currentParams) => {
    setIsAiLoading(true);
    setErrorMsg(null);

    setParsedParams({ scale: currentParams.scale || 6 });
    setParamsJson(JSON.stringify({ scale: currentParams.scale || 6 }, null, 2));
    setParamMeta({});

    try {
      const aiResult = await analyzeCodeWithAI(code);
      if (aiResult) {
        const newParams = { scale: currentParams.scale || 6 };
        const newMeta = {};

        Object.keys(aiResult).forEach(key => {
          if (typeof aiResult[key] === 'object' && aiResult[key] !== null && 'value' in aiResult[key]) {
            if (currentParams[key] !== undefined) {
              newParams[key] = currentParams[key];
            } else {
              newParams[key] = aiResult[key].value;
            }

            newMeta[key] = {};
            if (aiResult[key].min !== undefined && aiResult[key].max !== undefined) {
              newMeta[key].min = aiResult[key].min;
              newMeta[key].max = aiResult[key].max;
            }
            if (aiResult[key].options !== undefined && Array.isArray(aiResult[key].options)) {
              newMeta[key].options = aiResult[key].options;
            }
          } else {
            if (currentParams[key] !== undefined) {
              newParams[key] = currentParams[key];
            } else {
              newParams[key] = aiResult[key];
            }
          }
        });

        setParsedParams(newParams);
        setParamsJson(JSON.stringify(newParams, null, 2));
        setParamMeta(newMeta);
      }
    } catch (e) {
      setErrorMsg("AIによるパラメータ解析に失敗しました。");
      setParsedParams(currentParams);
      setParamsJson(JSON.stringify(currentParams, null, 2));
    } finally {
      setIsAiLoading(false);
    }
  }, []);

  const paramToLinesMap = useMemo(() => {
    const lines = sourceCode.split('\n');
    const map = {};

    Object.keys(parsedParams).forEach(key => {
      map[key] = [];
      const regex = new RegExp(`\\b(p|config|cfg|this\\.config|this)\\.${key}\\b|\\b${key}\\b`, 'g');
      lines.forEach((line, idx) => {
        if (regex.test(line)) map[key].push(idx);
      });
    });
    return map;
  }, [sourceCode, parsedParams]);

  const scrollToLine = useCallback((lineIdx) => {
    if (codeContainerRef.current) {
      const lineEl = codeContainerRef.current.children[lineIdx];
      if (lineEl) {
        lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, []);

  const highlightText = useCallback((text, keyword) => {
    if (!text) return ' ';
    if (!keyword) return text;
    const regex = new RegExp(`(\\b(?:p|config|cfg|this\\.config|this)\\.${keyword}\\b|\\b${keyword}\\b)`, 'g');
    const parts = text.split(regex);
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        return <span key={i} className="bg-yellow-500/40 text-yellow-100 rounded-sm px-0.5 border border-yellow-500/50 font-bold">{part}</span>;
      }
      return part;
    });
  }, []);

  useEffect(() => {
    if (activeSearchParam && (!paramToLinesMap[activeSearchParam] || paramToLinesMap[activeSearchParam].length === 0)) {
      setActiveSearchParam(null);
    }
  }, [paramToLinesMap, activeSearchParam]);

  useEffect(() => { selectedLineRef.current = selectedLine; }, [selectedLine]);

  const commitCodeChange = useCallback((newCode) => {
    if (lastCommittedCode !== newCode) {
      historyRef.current.past.push(lastCommittedCode);
      historyRef.current.future = [];
      setLastCommittedCode(newCode);
    }
  }, [lastCommittedCode]);

  const handleUndo = useCallback(() => {
    if (historyRef.current.past.length > 0) {
      const prev = historyRef.current.past.pop();
      historyRef.current.future.push(sourceCode);
      setSourceCode(prev);
      setLastCommittedCode(prev);
    }
  }, [sourceCode]);

  const handleRedo = useCallback(() => {
    if (historyRef.current.future.length > 0) {
      const next = historyRef.current.future.pop();
      historyRef.current.past.push(sourceCode);
      setSourceCode(next);
      setLastCommittedCode(next);
    }
  }, [sourceCode]);

  useEffect(() => {
    const handleGlobalClick = () => {
      if (isAllSelected) setIsAllSelected(false);
    };
    window.addEventListener('mousedown', handleGlobalClick);
    return () => window.removeEventListener('mousedown', handleGlobalClick);
  }, [isAllSelected]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeTag = document.activeElement?.tagName;
      const isCmdOrCtrl = e.ctrlKey || e.metaKey;

      if (isCmdOrCtrl && e.key.toLowerCase() === 'z') {
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 'y') {
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
        e.preventDefault();
        handleRedo();
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 'a') {
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
        e.preventDefault();
        setIsAllSelected(true);
        window.getSelection()?.removeAllRanges();
      }
    };

    const handleCopy = (e) => {
      if (isAllSelected) {
        e.clipboardData.setData('text/plain', sourceCode);
        e.preventDefault();
        return;
      }
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
    };

    const handleCut = (e) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

      if (isAllSelected) {
        e.clipboardData.setData('text/plain', sourceCode);
        e.preventDefault();
        setSourceCode('');
        commitCodeChange('');
        runAiAnalysis('', parsedParams);
        setIsAllSelected(false);
      }
    };

    const handlePaste = (e) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

      const pasteData = (e.clipboardData || window.clipboardData).getData('text');
      if (pasteData) {
        e.preventDefault();
        setSourceCode(pasteData);
        commitCodeChange(pasteData);
        runAiAnalysis(pasteData, parsedParams);
        setIsAllSelected(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('copy', handleCopy);
    window.addEventListener('cut', handleCut);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('copy', handleCopy);
      window.removeEventListener('cut', handleCut);
      window.removeEventListener('paste', handlePaste);
    };
  }, [handleUndo, handleRedo, sourceCode, parsedParams, commitCodeChange, runAiAnalysis, isAllSelected]);

  useEffect(() => {
    setParsedParams(prev => {
      const activeKeys = new Set(['scale']);
      const isVisualParam = (nameVar) => {
        const n = nameVar.toLowerCase();
        const logicKeywords = ['hp', 'speed', 'score', 'timer', 'time', 'fuel', 'cooldown', 'friction', 'gravity', 'capacity', 'id', 'alive', 'max', 'min', 'dist', 'range', 'interval', 'chance', 'force', 'count', 'dir'];
        const visualKeywords = ['color', 'width', 'height', 'size', 'scale', 'radius', 'x', 'y', 'offset', 'frame', 'pose', 'facing', 'angle', 'alpha', 'thick', 'margin', 'pad', 'draw', 'visib', 'hover', 'ground', 'shadow', 'glow', 'type', 'mode', 'kind', 'state', 'name'];

        if (logicKeywords.some(k => n.includes(k))) return false;
        if (visualKeywords.some(k => n.includes(k))) return true;
        if (n.length <= 2) return true;
        return false;
      };

      const pMatches = [...sourceCode.matchAll(/(?:p|config|cfg|this\.config)\.([a-zA-Z0-9_]+)/g)];
      pMatches.forEach(match => { if (isVisualParam(match[1])) activeKeys.add(match[1]); });

      const importMatches = [...sourceCode.matchAll(/import\s+([\s\S]*?)from\s+['"][^'"]+['"];?/g)];
      importMatches.forEach(match => {
        const items = match[1].replace(/[{}]/g, '').split(',').map(s => s.trim()).filter(Boolean);
        items.forEach(item => {
          const key = item.split(/\s+/).pop();
          if (isVisualParam(key)) activeKeys.add(key);
        });
      });

      if (!sourceCode.includes('class ') && /^\s*[a-zA-Z0-9_]+\s*\([^)]*\)\s*\{/.test(sourceCode)) {
        const match = sourceCode.match(/^\s*[a-zA-Z0-9_]+\s*\(([^)]*)\)\s*\{/);
        if (match && match[1].trim() !== '') {
          const argNames = match[1].split(',').map(s => s.trim().split('=')[0].trim());
          argNames.forEach(key => { if (key !== 'ctx' && isVisualParam(key)) activeKeys.add(key); });
        }
      }

      const nextParams = {};
      let isChanged = false;
      const codeHasVar = (key) => new RegExp(`\\b${key}\\b`).test(sourceCode);

      Object.keys(prev).forEach(key => {
        if (key === 'scale' || activeKeys.has(key) || codeHasVar(key)) {
          nextParams[key] = prev[key];
        } else isChanged = true;
      });

      activeKeys.forEach(key => {
        if (nextParams[key] === undefined) {
          if (key.toLowerCase().includes('color')) nextParams[key] = '#ffffff';
          else if (/^(is|has|facing|on[A-Z])/.test(key)) nextParams[key] = true;
          else nextParams[key] = 0;
          isChanged = true;
        }
      });

      if (isChanged) {
        setTimeout(() => setParamsJson(JSON.stringify(nextParams, null, 2)), 0);
        return nextParams;
      }
      return prev;
    });
  }, [sourceCode]);

  const handleJsonChange = (e) => {
    setParamsJson(e.target.value);
    try {
      setParsedParams(JSON.parse(e.target.value));
      setErrorMsg(null);
    } catch (err) { }
  };

  const updateParam = (key, value) => {
    const newParams = { ...parsedParams, [key]: value };
    setParsedParams(newParams);
    setParamsJson(JSON.stringify(newParams, null, 2));
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e) => {
      const state = layoutResizeRef.current;
      if (state.isResizingSidebar) {
        const newWidth = state.startWidth - (e.clientX - state.startX);
        setSidebarWidth(Math.max(200, Math.min(newWidth, 600)));
      }
      if (state.isResizingBottom) {
        const newHeight = state.startHeight - (e.clientY - state.startY);
        setBottomHeight(Math.max(100, Math.min(newHeight, window.innerHeight * 0.8)));
      }
    };

    const handleGlobalMouseUp = () => {
      if (layoutResizeRef.current.isResizingSidebar || layoutResizeRef.current.isResizingBottom) {
        layoutResizeRef.current.isResizingSidebar = false;
        layoutResizeRef.current.isResizingBottom = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [bottomHeight, sidebarWidth]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const hitCanvas = hitCanvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    const hitCtx = hitCanvas.getContext('2d', { willReadFrequently: true });

    const proxyRefs = {
      selectedLine: selectedLineRef,
      captureNextDraw: captureNextDrawRef,
      selectedShapeInfo: selectedShapeInfo,
      hitVertices: hitVerticesRef
    };
    const proxyCtx = createProxyCtx(ctx, hitCtx, proxyRefs);

    let animationFrameId;

    const resizeCanvas = () => {
      if (!canvas || !hitCanvas || !container) return;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      hitCanvas.width = canvas.width;
      hitCanvas.height = canvas.height;
    };

    const resizeObserver = new ResizeObserver(() => resizeCanvas());
    resizeObserver.observe(container);

    let compiledFn = null;
    try {
      const finalCode = processCodeAndInjectParams(sourceCode, parsedParams);
      compiledFn = new Function('ctx', 'p', finalCode);
      setErrorMsg(null);
    } catch (err) {
      setErrorMsg(`Compilation Error: ${err.message}`);
    }

    const renderLoop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hitCtx.clearRect(0, 0, hitCanvas.width, hitCanvas.height);
      hitCtx.imageSmoothingEnabled = false;

      const size = 20;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#1e293b';
      for (let i = 0; i < canvas.width; i += size) {
        for (let j = 0; j < canvas.height; j += size) {
          if ((i / size + Math.floor(j / size)) % 2 === 0) ctx.fillRect(i, j, size, size);
        }
      }

      if (compiledFn) {
        const scale = parsedParams.scale || 1;
        ctx.save(); hitCtx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        hitCtx.translate(hitCanvas.width / 2, hitCanvas.height / 2);
        ctx.scale(scale, scale); hitCtx.scale(scale, scale);

        if (showRuler) {
          const maxDist = Math.max(canvas.width, canvas.height) / scale;
          ctx.save();
          ctx.lineWidth = 1 / scale;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.beginPath();
          for (let i = 0; i <= maxDist; i += 10) {
            ctx.moveTo(i, -maxDist); ctx.lineTo(i, maxDist);
            if (i > 0) { ctx.moveTo(-i, -maxDist); ctx.lineTo(-i, maxDist); }
            ctx.moveTo(-maxDist, i); ctx.lineTo(maxDist, i);
            if (i > 0) { ctx.moveTo(-maxDist, -i); ctx.lineTo(maxDist, -i); }
          }
          ctx.stroke();

          ctx.lineWidth = 2 / scale;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.beginPath();
          ctx.moveTo(0, -maxDist); ctx.lineTo(0, maxDist);
          ctx.moveTo(-maxDist, 0); ctx.lineTo(maxDist, 0);
          ctx.stroke();
          ctx.restore();
        }

        try {
          selectedShapeInfo.current = null;
          captureNextDrawRef.current = false;
          handlesInfo.current = null;
          hitVerticesRef.current = [];
          compiledFn(proxyCtx, parsedParams);
        } catch (err) {
          setErrorMsg(`Runtime Error: ${err.message}`);
        }

        ctx.restore(); hitCtx.restore();
      }

      hitCtx.save();
      hitCtx.setTransform(1, 0, 0, 1, 0, 0);
      hitVerticesRef.current.forEach(v => {
        const r = (v.id >> 16) & 255;
        const g = (v.id >> 8) & 255;
        const b = v.id & 255;
        hitCtx.fillStyle = `rgb(${r},${g},${b})`;
        hitCtx.beginPath();
        hitCtx.arc(
          v.transform.a * v.x + v.transform.c * v.y + v.transform.e,
          v.transform.b * v.x + v.transform.d * v.y + v.transform.f,
          8, 0, Math.PI * 2
        );
        hitCtx.fill();
      });
      hitCtx.restore();

      if (selectedLine !== null && selectedShapeInfo.current) {
        const { method, args, transform } = selectedShapeInfo.current;
        let corners = [];
        let isSupported = false;
        let shapeType = '';

        if (['fillRect', 'strokeRect', 'rect', 'roundRect'].includes(method)) {
          const [x, y, w, h] = args;
          corners = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
          shapeType = 'box';
          isSupported = true;
        } else if (method === 'arc') {
          const [x, y, r] = args;
          corners = [{ x: x - r, y: y - r }, { x: x + r, y: y - r }, { x: x + r, y: y + r }, { x: x - r, y: y + r }];
          shapeType = 'box';
          isSupported = true;
        } else if (['moveTo', 'lineTo'].includes(method)) {
          const [x, y] = args;
          corners = [{ x, y, type: 'move' }];
          shapeType = 'points';
          isSupported = true;
        } else if (method === 'quadraticCurveTo') {
          const [cp1x, cp1y, x, y] = args;
          corners = [{ x: cp1x, y: cp1y, type: 'cp1' }, { x, y, type: 'move' }];
          shapeType = 'points';
          isSupported = true;
        } else if (method === 'bezierCurveTo') {
          const [cp1x, cp1y, cp2x, cp2y, x, y] = args;
          corners = [{ x: cp1x, y: cp1y, type: 'cp1' }, { x: cp2x, y: cp2y, type: 'cp2' }, { x, y, type: 'move' }];
          shapeType = 'points';
          isSupported = true;
        }

        if (isSupported) {
          const screenCorners = corners.map(c => ({
            ...c,
            x: transform.a * c.x + transform.c * c.y + transform.e,
            y: transform.b * c.x + transform.d * c.y + transform.f
          }));

          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);

          if (shapeType === 'box') {
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(screenCorners[0].x, screenCorners[0].y);
            ctx.lineTo(screenCorners[1].x, screenCorners[1].y);
            ctx.lineTo(screenCorners[2].x, screenCorners[2].y);
            ctx.lineTo(screenCorners[3].x, screenCorners[3].y);
            ctx.closePath();
            ctx.stroke();

            ctx.setLineDash([]);
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#0284c7';
            const drawHandle = (x, y) => {
              ctx.beginPath(); ctx.rect(x - 4, y - 4, 8, 8);
              ctx.fill(); ctx.stroke();
            };

            screenCorners.forEach(c => drawHandle(c.x, c.y));
            const mids = [
              { x: (screenCorners[0].x + screenCorners[1].x) / 2, y: (screenCorners[0].y + screenCorners[1].y) / 2 },
              { x: (screenCorners[1].x + screenCorners[2].x) / 2, y: (screenCorners[1].y + screenCorners[2].y) / 2 },
              { x: (screenCorners[2].x + screenCorners[3].x) / 2, y: (screenCorners[2].y + screenCorners[3].y) / 2 },
              { x: (screenCorners[3].x + screenCorners[0].x) / 2, y: (screenCorners[3].y + screenCorners[0].y) / 2 }
            ];
            mids.forEach(c => drawHandle(c.x, c.y));
            handlesInfo.current = {
              nw: screenCorners[0], n: mids[0], ne: screenCorners[1],
              e: mids[1], se: screenCorners[2], s: mids[2],
              sw: screenCorners[3], w: mids[3],
              transform: transform
            };
          } else if (shapeType === 'points') {
            ctx.setLineDash([]);
            const drawHandle = (x, y, isCp) => {
              ctx.fillStyle = isCp ? '#fde047' : '#ffffff';
              ctx.strokeStyle = isCp ? '#ca8a04' : '#0284c7';
              ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
              ctx.fill(); ctx.stroke();
            };

            handlesInfo.current = { transform };

            if (method === 'quadraticCurveTo') {
              ctx.strokeStyle = '#ca8a04'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
              ctx.beginPath(); ctx.moveTo(screenCorners[0].x, screenCorners[0].y); ctx.lineTo(screenCorners[1].x, screenCorners[1].y); ctx.stroke();
            } else if (method === 'bezierCurveTo') {
              ctx.strokeStyle = '#ca8a04'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
              ctx.beginPath(); ctx.moveTo(screenCorners[0].x, screenCorners[0].y); ctx.lineTo(screenCorners[2].x, screenCorners[2].y); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(screenCorners[1].x, screenCorners[1].y); ctx.lineTo(screenCorners[2].x, screenCorners[2].y); ctx.stroke();
            }

            screenCorners.forEach((c) => {
              drawHandle(c.x, c.y, c.type.startsWith('cp'));
              handlesInfo.current[c.type] = c;
            });
          }
          ctx.restore();
        }
      }

      if (mousePosRef.current && !dragStateRef.current.active) {
        const { x, y } = mousePosRef.current;
        try {
          const pixel = hitCtx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
          if (pixel[3] > 0 && (pixel[0] !== 0 || pixel[1] !== 0 || pixel[2] !== 0)) {
            const lineId = ((pixel[0] << 16) | (pixel[1] << 8) | pixel[2]) - 1;
            const totalLines = sourceCode.split('\n').length;
            if (lineId >= 0 && lineId < totalLines) {
              setHoveredLines([lineId]);
            } else {
              setHoveredLines([]);
            }
          } else {
            setHoveredLines([]);
          }
        } catch (e) { }
      }

      animationFrameId = requestAnimationFrame(renderLoop);
    };

    renderLoop();
    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animationFrameId);
    };
  }, [sourceCode, parsedParams, selectedLine, showRuler]);

  useEffect(() => {
    if (selectedLine !== null && codeContainerRef.current) {
      const container = codeContainerRef.current;
      const lineEl = container.children[selectedLine];
      if (lineEl) {
        const containerRect = container.getBoundingClientRect();
        const lineRect = lineEl.getBoundingClientRect();
        const isVisible = (lineRect.top >= containerRect.top + 20) && (lineRect.bottom <= containerRect.bottom - 20);
        if (!isVisible) {
          lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }, [selectedLine]);

  // ★復元: ドラッグ＆ドロップなどのマウス操作系関数
  const handleMouseMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const currentX = (e.clientX - rect.left) * (canvasRef.current.width / rect.width);
    const currentY = (e.clientY - rect.top) * (canvasRef.current.height / rect.height);

    let cursor = 'crosshair';
    if (!dragStateRef.current.active) {
      if (selectedLine !== null && handlesInfo.current) {
        let hoveredHandle = null;
        for (const [key, pos] of Object.entries(handlesInfo.current)) {
          if (key === 'transform') continue;
          if (Math.abs(currentX - pos.x) <= 8 && Math.abs(currentY - pos.y) <= 8) hoveredHandle = key;
        }
        if (hoveredHandle) {
          const cm = { nw: 'nwse-resize', ne: 'nesw-resize', se: 'nwse-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', move: 'move', cp1: 'move', cp2: 'move' };
          cursor = cm[hoveredHandle];
        } else if (hoveredLines.includes(selectedLine)) {
          cursor = 'move';
        }
      } else if (hoveredLines.length > 0) {
        cursor = 'pointer';
      }
      if (containerRef.current) containerRef.current.style.cursor = cursor;
    }

    if (dragStateRef.current.active) {
      const state = dragStateRef.current;
      const dxScreen = currentX - state.startX;
      const dyScreen = currentY - state.startY;
      let dxLocal = dxScreen;
      let dyLocal = dyScreen;
      if (handlesInfo.current && handlesInfo.current.transform) {
        const t = handlesInfo.current.transform;
        const det = t.a * t.d - t.b * t.c;
        if (det !== 0) {
          dxLocal = (t.d * dxScreen - t.c * dyScreen) / det;
          dyLocal = (-t.b * dxScreen + t.a * dyScreen) / det;
        }
      } else {
        dxLocal = dxScreen / (parsedParams.scale || 1);
        dyLocal = dyScreen / (parsedParams.scale || 1);
      }

      let newVals = [...state.origVals];
      if (state.mode === 'move') {
        if (newVals.length > 0) newVals[0] += dxLocal;
        if (newVals.length > 1) newVals[1] += dyLocal;
      } else if (state.mode === 'resize') {
        const [oX, oY, oW, oH] = state.origVals;
        const h = state.handle;
        if (['fillRect', 'strokeRect', 'rect', 'roundRect'].includes(state.funcName)) {
          let nX = oX, nY = oY, nW = oW, nH = oH;
          if (h.includes('w')) { nX = oX + dxLocal; nW = oW - dxLocal; }
          if (h.includes('e')) { nW = oW + dxLocal; }
          if (h.includes('n')) { nY = oY + dyLocal; nH = oH - dyLocal; }
          if (h.includes('s')) { nH = oH + dyLocal; }
          newVals[0] = nX; newVals[1] = nY; newVals[2] = nW; newVals[3] = nH;
        } else if (state.funcName === 'arc') {
          let nR = state.origVals[2];
          if (h === 'e') nR += dxLocal;
          else if (h === 'w') nR -= dxLocal;
          else if (h === 's') nR += dyLocal;
          else if (h === 'n') nR -= dyLocal;
          else nR += ((Math.abs(dxLocal) + Math.abs(dyLocal)) / 2) * (Math.sign(dxLocal || dyLocal) || 1);
          newVals[2] = Math.max(0, nR);
        }
      } else if (state.mode === 'point') {
        const h = state.handle;
        if (['moveTo', 'lineTo'].includes(state.funcName)) {
          if (h === 'move') { newVals[0] = state.origVals[0] + dxLocal; newVals[1] = state.origVals[1] + dyLocal; }
        } else if (state.funcName === 'quadraticCurveTo') {
          if (h === 'cp1') { newVals[0] = state.origVals[0] + dxLocal; newVals[1] = state.origVals[1] + dyLocal; }
          if (h === 'move') { newVals[2] = state.origVals[2] + dxLocal; newVals[3] = state.origVals[3] + dyLocal; }
        } else if (state.funcName === 'bezierCurveTo') {
          if (h === 'cp1') { newVals[0] = state.origVals[0] + dxLocal; newVals[1] = state.origVals[1] + dyLocal; }
          if (h === 'cp2') { newVals[2] = state.origVals[2] + dxLocal; newVals[3] = state.origVals[3] + dyLocal; }
          if (h === 'move') { newVals[4] = state.origVals[4] + dxLocal; newVals[5] = state.origVals[5] + dyLocal; }
        }
      }

      const newArgStrs = state.argStrs.map((str, i) => {
        if (newVals[i] !== undefined && newVals[i] !== state.origVals[i]) {
          return replaceNumberRightmost(str, newVals[i], snapMode);
        }
        return str;
      });
      const newLineText = state.originalLineText.replace(/([a-zA-Z0-9_.]+)\s*\((.*)\)/, (match, fn) => {
        return `${fn}(${newArgStrs.join(', ')})`;
      });
      const codeLines = sourceCode.split('\n');
      codeLines[state.targetLineIdx] = newLineText;
      setSourceCode(codeLines.join('\n'));
    }
    mousePosRef.current = { x: currentX, y: currentY };
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const currentX = (e.clientX - rect.left) * (canvasRef.current.width / rect.width);
    const currentY = (e.clientY - rect.top) * (canvasRef.current.height / rect.height);
    let clickedHandle = null;

    if (selectedLine !== null && handlesInfo.current) {
      for (const [key, pos] of Object.entries(handlesInfo.current)) {
        if (key === 'transform') continue;
        if (Math.abs(currentX - pos.x) <= 8 && Math.abs(currentY - pos.y) <= 8) {
          clickedHandle = key; break;
        }
      }
    }

    const startDrag = (mode, handle, lineIdx) => {
      const targetLineText = sourceCode.split('\n')[lineIdx];
      const match = targetLineText.match(/([a-zA-Z0-9_.]+)\s*\((.*)\)/);
      if (!match) return;
      const funcName = match[1].split('.').pop();
      if (['scale', 'rotate', 'transform', 'setTransform'].includes(funcName) || targetLineText.includes('rgb')) return;
      const argStrs = splitArgs(match[2]);
      const origVals = argStrs.map(s => {
        const m = s.match(/(-?\d+(?:\.\d+)?)(?!.*-?\d+(?:\.\d+)?)/);
        return m ? parseFloat(m[1]) : undefined;
      });
      dragStateRef.current = {
        active: true, mode, handle, targetLineIdx: lineIdx,
        originalLineText: targetLineText, originalCode: sourceCode,
        funcName, argStrs, origVals, startX: currentX, startY: currentY
      };
      setIsDragging(true);
    };

    if (clickedHandle) {
      if (['move', 'cp1', 'cp2'].includes(clickedHandle)) {
        startDrag('point', clickedHandle, selectedLine);
      } else {
        startDrag('resize', clickedHandle, selectedLine);
      }
    } else if (hoveredLines.length > 0) {
      const lineIdx = hoveredLines[0];
      setSelectedLine(lineIdx);
      startDrag('move', null, lineIdx);
    } else {
      setSelectedLine(null);
    }
  };

  const handleMouseUp = useCallback(() => {
    if (dragStateRef.current.active) {
      dragStateRef.current.active = false;
      setIsDragging(false);
      commitCodeChange(sourceCode);
    }
  }, [sourceCode, commitCodeChange]);

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseUp]);


  const startBottomResize = (e) => {
    e.preventDefault();
    layoutResizeRef.current = { ...layoutResizeRef.current, isResizingBottom: true, startY: e.clientY, startHeight: bottomHeight };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

  const startSidebarResize = (e) => {
    e.preventDefault();
    layoutResizeRef.current = { ...layoutResizeRef.current, isResizingSidebar: true, startX: e.clientX, startWidth: sidebarWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const { colorParams, otherParams } = useMemo(() => {
    const colors = [];
    const others = [];
    Object.entries(parsedParams).forEach(([key, value]) => {
      if (key === 'scale') return;
      const meta = paramMeta[key] || {};
      const hasOptions = Array.isArray(meta.options) && meta.options.length > 0;
      const isColor = !hasOptions && typeof value === 'string' && (value.startsWith('#') || value.startsWith('rgb'));

      if (isColor) colors.push([key, value]);
      else others.push([key, value]);
    });
    return { colorParams: colors, otherParams: others };
  }, [parsedParams, paramMeta]);

  const renderParamItem = (key, value) => {
    const isColor = typeof value === 'string' && (value.startsWith('#') || value.startsWith('rgb'));
    const isNumber = typeof value === 'number';
    const isBool = typeof value === 'boolean';
    const meta = paramMeta[key] || {};

    const hasOptions = Array.isArray(meta.options) && meta.options.length > 0;

    const minVal = meta.min !== undefined ? meta.min : -200;
    const maxVal = meta.max !== undefined ? meta.max : 255;

    const isActiveSearch = activeSearchParam === key;

    return (
      <div
        key={key}
        className={`flex items-center justify-between bg-slate-900 p-2 rounded border shadow-sm hover:border-blue-500/30 transition-colors group/item cursor-pointer ${isActiveSearch ? 'border-yellow-500/50 bg-slate-800' : 'border-slate-800'}`}
        onMouseEnter={() => { if (paramToLinesMap[key]) setHoveredLines(paramToLinesMap[key]); }}
        onMouseLeave={() => setHoveredLines([])}
        onClick={(e) => {
          if (e.target.closest('input, button, label')) return;
          if (paramToLinesMap[key] && paramToLinesMap[key].length > 0) {
            setActiveSearchParam(key);
            setSearchMatchIndex(0);
            scrollToLine(paramToLinesMap[key][0]);
          }
        }}
      >
        <span className={`text-[11px] font-mono truncate w-24 flex-shrink-0 transition-colors ${isActiveSearch ? 'text-yellow-300 font-bold' : 'text-slate-400 group-hover/item:text-blue-300'}`} title={`${key} (クリックでコード内を検索)`}>{key}</span>
        <div className="flex-1 flex flex-col items-end min-w-0 pl-2">

          {hasOptions && (
            <div className="w-full flex flex-wrap justify-end gap-1">
              {meta.options.map(opt => (
                <label key={opt} className={`cursor-pointer px-2 py-1 rounded text-[10px] font-bold transition-colors border flex items-center justify-center ${String(value) === String(opt) ? 'bg-blue-600 border-blue-500 text-white shadow-inner' : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
                  <input
                    type="radio"
                    className="hidden"
                    name={`radio-${key}`}
                    value={opt}
                    checked={String(value) === String(opt)}
                    onChange={() => {
                      let valToSet = opt;
                      if (typeof value === 'number' && !isNaN(Number(opt))) {
                        valToSet = Number(opt);
                      } else if (typeof value === 'boolean') {
                        valToSet = opt === 'true' || opt === true;
                      }
                      updateParam(key, valToSet);
                    }}
                  />
                  {String(opt)}
                </label>
              ))}
            </div>
          )}

          {!hasOptions && isColor && (() => {
            const { hex, alpha } = parseColorToHexAndAlpha(value);
            return (
              <div className="flex flex-col items-end gap-1.5 w-full py-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono text-slate-500 uppercase max-w-[85px] truncate" title={value}>{value}</span>
                  <input type="color" value={hex} onChange={(e) => updateParam(key, buildColorString(e.target.value, alpha, value))} className="w-5 h-5 rounded bg-transparent cursor-pointer border border-slate-700" />
                </div>
                <div className="flex items-center gap-2 w-full justify-end">
                  <span className="text-[8px] font-mono text-slate-500 font-bold">ALPHA</span>
                  <input type="range" min="0" max="1" step="0.01" value={alpha} onChange={(e) => updateParam(key, buildColorString(hex, parseFloat(e.target.value), value))} className="w-16 h-1.5 accent-blue-500 cursor-ew-resize" />
                </div>
              </div>
            );
          })()}

          {!hasOptions && isNumber && (
            <div className="w-full">
              <div className="flex justify-between items-center text-[8px] text-slate-600 font-mono mb-0.5">
                <span className="opacity-0 group-hover/item:opacity-100 transition-opacity">min:{minVal}</span>
                <span className="text-blue-400 font-bold bg-slate-950 px-1 rounded border border-slate-800/50">{Number.isInteger(value) ? value : value.toFixed(2)}</span>
                <span className="opacity-0 group-hover/item:opacity-100 transition-opacity">max:{maxVal}</span>
              </div>
              <input type="range" step={snapMode === 'integer' ? 1 : (snapMode === 'half' ? 0.5 : 0.01)} min={minVal} max={maxVal} value={value} onChange={(e) => updateParam(key, Number(e.target.value))} className="w-full h-3 accent-blue-500 cursor-ew-resize" />
            </div>
          )}
          {!hasOptions && isBool && (
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-mono font-bold ${value ? 'text-emerald-400' : 'text-slate-500'}`}>{value ? 'ON' : 'OFF'}</span>
              <input type="checkbox" checked={value} onChange={(e) => updateParam(key, e.target.checked)} className="w-3.5 h-3.5 accent-blue-500 cursor-pointer" />
            </div>
          )}

          {!hasOptions && !isColor && !isNumber && !isBool && (
            <input type="text" value={value} onChange={(e) => updateParam(key, e.target.value)} className="w-full bg-slate-950 text-slate-300 font-mono text-[10px] px-2 py-1 rounded border border-slate-800 outline-none focus:border-blue-500" />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">

      {/* ================= MODAL OVERLAY ================= */}
      {isHelpModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100">ショートカットキー</h3>
                  <p className="text-[10px] text-slate-400">Code Inspectorで使える便利なキーボード操作</p>
                </div>
              </div>
              <button onClick={() => setIsHelpModalOpen(false)} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-[100px_1fr] gap-4 items-center">
                <kbd className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs font-mono text-center text-slate-300 shadow-[0_2px_0_rgba(51,65,85,1)]">Ctrl + A</kbd>
                <span className="text-sm text-slate-300">コード全体を選択します</span>

                <kbd className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs font-mono text-center text-slate-300 shadow-[0_2px_0_rgba(51,65,85,1)]">Ctrl + X</kbd>
                <span className="text-sm text-slate-300">選択範囲を切り取ります</span>

                <kbd className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs font-mono text-center text-slate-300 shadow-[0_2px_0_rgba(51,65,85,1)]">Ctrl + C</kbd>
                <span className="text-sm text-slate-300">選択範囲をコピーします</span>

                <kbd className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs font-mono text-center text-slate-300 shadow-[0_2px_0_rgba(51,65,85,1)]">Ctrl + V</kbd>
                <span className="text-sm text-slate-300">コードを貼り付けてAI解析を自動実行します</span>

                <kbd className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs font-mono text-center text-slate-300 shadow-[0_2px_0_rgba(51,65,85,1)]">Ctrl + Z</kbd>
                <span className="text-sm text-slate-300">元に戻す (Undo)</span>

                <kbd className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs font-mono text-center text-slate-300 shadow-[0_2px_0_rgba(51,65,85,1)]">Ctrl + Y</kbd>
                <span className="text-sm text-slate-300">やり直し (Redo)</span>
              </div>
              <p className="text-xs text-slate-500 mt-4 border-t border-slate-800 pt-4">
                ※ Macの場合は <kbd className="px-1 bg-slate-800 rounded">Ctrl</kbd> の代わりに <kbd className="px-1 bg-slate-800 rounded">Cmd (⌘)</kbd> を使用してください。
              </p>
            </div>

            <div className="p-4 border-t border-slate-800 flex justify-end bg-slate-900/50">
              <button onClick={() => setIsHelpModalOpen(false)} className="px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded text-sm text-white font-medium transition-colors">
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= LEFT SECTION ================= */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* UPPER: Preview Canvas */}
        <div
          className="flex-1 relative overflow-hidden bg-slate-900 outline-none"
          ref={containerRef}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseLeave={() => setHoveredLines([])}
          tabIndex={0}
        >
          {/* ★追加: AI解析中のオーバーレイ表示 */}
          {isAiLoading && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/95 backdrop-blur-sm">
              <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
              <p className="text-sm font-bold text-indigo-300 tracking-wider">只今解析中！しばらくお待ちください。</p>
            </div>
          )}

          <div className="absolute top-0 left-0 right-0 p-2 flex items-center justify-between z-10 pointer-events-none">
            <div className="flex items-center gap-2 bg-slate-950/80 px-3 py-1.5 rounded-md backdrop-blur border border-slate-800/50 pointer-events-auto">
              <Play className="w-4 h-4 text-emerald-400" />
              <h2 className="text-xs font-bold tracking-wide">Preview</h2>

              <div className="flex items-center gap-2 ml-3 pl-3 border-l border-slate-700">
                <span className="text-[10px] font-bold text-slate-400">ZOOM</span>
                <input type="range" min="1" max="30" step="0.5" value={parsedParams.scale !== undefined ? parsedParams.scale : 6} onChange={(e) => updateParam('scale', Number(e.target.value))} className="w-20 accent-emerald-500 cursor-pointer" />
                <span className="text-[10px] font-mono text-slate-300 w-6 text-right">{parsedParams.scale !== undefined ? parsedParams.scale : 6}x</span>
              </div>
            </div>
            <div className="flex items-center gap-2 pointer-events-auto">

              <button
                onClick={() => setShowRuler(!showRuler)}
                className={`p-1.5 rounded border transition-colors ${showRuler ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700'}`}
                title="ルーラー(XY軸・10px方眼)を表示"
              >
                <Ruler className="w-4 h-4" />
              </button>

              {/* ★削除: ここにあった右上の小さな「AI解析中...」インジケーターを削除しました */}

              <div className="flex items-center bg-slate-800 rounded border border-slate-700 p-0.5 mr-1">
                {['integer', 'half', 'none'].map((m) => (
                  <button key={m} onClick={() => setSnapMode(m)} className={`px-2 py-1 rounded-sm text-[10px] font-bold transition-colors ${snapMode === m ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                    {{ integer: '1.0', half: '0.5', none: '0.01' }[m]}
                  </button>
                ))}
              </div>
              <button onClick={handleUndo} disabled={historyRef.current.past.length === 0} className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded border border-slate-700 text-slate-300" title="Undo"><Undo className="w-4 h-4" /></button>
              <button onClick={handleRedo} disabled={historyRef.current.future.length === 0} className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded border border-slate-700 text-slate-300" title="Redo"><Redo className="w-4 h-4" /></button>
              {errorMsg && <div className="flex items-center gap-2 text-red-400 text-xs bg-red-950/80 px-2 py-1.5 rounded max-w-[50%] truncate"><AlertCircle className="w-3 h-3 flex-shrink-0" /> <span className="truncate">{errorMsg}</span></div>}
            </div>
          </div>
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
          <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 bg-slate-900/80 backdrop-blur border border-slate-700 px-3 py-1.5 rounded-full text-xs text-slate-300 flex items-center gap-2 pointer-events-none shadow-lg whitespace-nowrap">
            <MousePointer2 className="w-3.5 h-3.5 text-blue-400" /> 多角形や曲線の頂点を直接クリックして編集できます。
          </div>
        </div>

        <div className="h-1 bg-slate-800 hover:bg-blue-500 cursor-row-resize z-20 shrink-0 transition-colors" onMouseDown={startBottomResize} />

        {/* LOWER: Code Viewer */}
        <div className="flex flex-col border-t border-slate-800 bg-[#0d1117]" style={{ height: `${bottomHeight}px`, minHeight: '100px' }}>
          <div className="flex items-center justify-between p-2 border-b border-slate-800 bg-slate-900 shadow-sm z-10 shrink-0">
            <div className="flex items-center gap-2 text-purple-400">
              <Box className="w-4 h-4" />
              <h2 className="text-xs font-bold tracking-wide">Code Inspector</h2>
              <span className="text-[10px] text-slate-500 font-normal ml-2 hidden sm:inline">(ダブルクリックで直接編集)</span>

              {activeSearchParam && paramToLinesMap[activeSearchParam] && paramToLinesMap[activeSearchParam].length > 0 && (
                <div className="flex items-center gap-1 ml-4 bg-slate-950 px-2 py-0.5 rounded border border-slate-700">
                  <span className="text-[10px] text-yellow-400 font-mono">
                    {activeSearchParam} <span className="text-slate-400 ml-1">({searchMatchIndex + 1}/{paramToLinesMap[activeSearchParam].length})</span>
                  </span>
                  <div className="flex items-center ml-1 border-l border-slate-700 pl-1 gap-0.5">
                    <button
                      className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded"
                      onClick={() => {
                        const matches = paramToLinesMap[activeSearchParam];
                        const prevIdx = (searchMatchIndex - 1 + matches.length) % matches.length;
                        setSearchMatchIndex(prevIdx);
                        scrollToLine(matches[prevIdx]);
                      }}
                      title="前へ (▲)"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded"
                      onClick={() => {
                        const matches = paramToLinesMap[activeSearchParam];
                        const nextIdx = (searchMatchIndex + 1) % matches.length;
                        setSearchMatchIndex(nextIdx);
                        scrollToLine(matches[nextIdx]);
                      }}
                      title="次へ (▼)"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    <button
                      className="p-1 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded ml-1"
                      onClick={() => setActiveSearchParam(null)}
                      title="検索をクリア"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setIsHelpModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-xs font-bold transition-all border border-slate-700"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Help
            </button>
          </div>

          <div ref={codeContainerRef} className="flex-1 overflow-y-auto custom-scrollbar p-1.5 font-mono text-xs leading-relaxed min-h-0">
            {sourceCode.split('\n').map((line, idx) => {
              const isHovered = hoveredLines.includes(idx);
              const isSelected = selectedLine === idx;
              const isEditing = editingLine === idx;

              const isSearchMatch = activeSearchParam && paramToLinesMap[activeSearchParam]?.includes(idx);
              const isCurrentSearchMatch = isSearchMatch && paramToLinesMap[activeSearchParam][searchMatchIndex] === idx;

              let rowStyle = 'border-transparent text-slate-400 hover:bg-slate-800/80';
              if (isAllSelected) {
                rowStyle = 'bg-blue-900/40 border-blue-500/40 text-blue-100';
              } else if (isEditing) {
                rowStyle = 'bg-slate-800 border-green-400 text-white shadow-inner';
              } else if (isSelected) {
                rowStyle = 'bg-indigo-900/60 border-indigo-400 text-white shadow-md shadow-indigo-900/20';
              } else if (isCurrentSearchMatch) {
                rowStyle = 'bg-yellow-900/40 border-yellow-400 text-yellow-100 shadow-md shadow-yellow-900/20';
              } else if (isSearchMatch) {
                rowStyle = 'bg-yellow-900/10 border-yellow-700/50 text-slate-300';
              } else if (isHovered) {
                rowStyle = 'bg-blue-900/70 border-blue-400 text-white font-medium shadow-md shadow-blue-900/20';
              }

              return (
                <div
                  key={idx}
                  className={`flex rounded px-1 transition-colors duration-75 group cursor-text border-l-2 ${rowStyle}`}
                  onClick={() => { if (!isEditing) { setSelectedLine(idx); } }}
                  onDoubleClick={() => { if (!isEditing) { setEditingLine(idx); setSelectedLine(idx); } }}
                >
                  <span className={`w-8 text-right select-none pr-2 flex-shrink-0 ${(isAllSelected || isHovered || isSelected || isEditing || isSearchMatch) ? (isSearchMatch && !isAllSelected ? 'text-yellow-500' : 'text-blue-300') : 'text-slate-600'}`}>{idx + 1}</span>
                  {isEditing ? (
                    <input type="text" className="flex-1 bg-transparent outline-none font-mono text-xs w-full text-green-300" value={line} autoFocus onChange={(e) => { const codeLines = sourceCode.split('\n'); codeLines[idx] = e.target.value; setSourceCode(codeLines.join('\n')); }} onBlur={() => { setEditingLine(null); commitCodeChange(sourceCode); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.target.blur(); }} />
                  ) : (
                    <span className="whitespace-pre overflow-x-hidden text-ellipsis flex-1">
                      {isSearchMatch && !isAllSelected ? highlightText(line, activeSearchParam) : (line || ' ')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="w-1 bg-slate-800 hover:bg-blue-500 cursor-col-resize z-20 shrink-0 transition-colors" onMouseDown={startSidebarResize} />

      {/* ================= RIGHT SECTION ================= */}
      <div className="flex flex-col border-l border-slate-800 bg-[#0d1117] shrink-0 min-h-0" style={{ width: `${sidebarWidth}px`, minWidth: '200px' }}>
        <div className="p-2 border-b border-slate-800 flex items-center justify-between cursor-pointer hover:bg-slate-800/50 select-none transition-colors shrink-0" onClick={() => setIsParamsOpen(!isParamsOpen)}>
          <div className="flex items-center gap-2 text-yellow-300"><Settings2 className="w-4 h-4" /> <h2 className="text-xs font-bold tracking-wide">PARAMETERS (JSON)</h2></div>
          {isParamsOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        </div>

        {isParamsOpen && (
          <div className="border-b border-slate-800 flex flex-col shrink-0 bg-[#0a0d14]">
            <div className="h-40 flex flex-col">
              <textarea className="flex-1 w-full p-2 bg-transparent text-yellow-300 font-mono text-xs outline-none resize-none custom-scrollbar leading-relaxed" spellCheck="false" value={paramsJson} onChange={handleJsonChange} />
            </div>
            <div className="p-2 border-t border-slate-800 flex justify-end bg-slate-900">
              <button onClick={() => runAiAnalysis(sourceCode, parsedParams)} disabled={isAiLoading || !sourceCode.trim()} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 rounded text-xs font-medium transition-colors disabled:opacity-50 w-full justify-center">
                {isAiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} AI解析・再実行
              </button>
            </div>
          </div>
        )}

        <div className="p-2 border-b border-slate-800 bg-slate-900/50 shrink-0"><h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">QUICK TWEAKS</h3></div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1.5 min-h-0">
          {isAiLoading ? (
            <div className="flex flex-col items-center justify-center h-40 text-indigo-400/60">
              <Loader2 className="w-8 h-8 animate-spin mb-3" />
              <p className="text-[11px] font-bold tracking-wider">AI解析中...</p>
              <p className="text-[9px] mt-1 opacity-70">パラメータを構築しています</p>
            </div>
          ) : (
            <>
              {colorParams.length > 0 && (
                <div className="mb-3 bg-slate-900/40 border border-slate-800 rounded-md overflow-hidden">
                  <div
                    className="p-2 flex items-center justify-between cursor-pointer hover:bg-slate-800/80 select-none transition-colors"
                    onClick={() => setIsColorTweakOpen(!isColorTweakOpen)}
                  >
                    <div className="flex items-center gap-2 text-pink-400">
                      <Palette className="w-3.5 h-3.5" />
                      <h3 className="text-[10px] font-bold tracking-wide">COLORS</h3>
                    </div>
                    {isColorTweakOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                  </div>
                  {isColorTweakOpen && (
                    <div className="p-1.5 pt-0 space-y-1.5 border-t border-slate-800/50 bg-slate-950/30">
                      {colorParams.map(([key, value]) => renderParamItem(key, value))}
                    </div>
                  )}
                </div>
              )}

              {otherParams.map(([key, value]) => renderParamItem(key, value))}

              {colorParams.length === 0 && otherParams.length === 0 && <p className="text-xs text-slate-500 p-2 text-center">描画パラメータが見つかりません</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}