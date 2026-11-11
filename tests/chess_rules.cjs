// 獨立規則驗證：由題目棋盤 HTML 重新讀返棋子，用另一套寫法核對答案。
// 1) 將軍題：正解 = 真係將緊黑王嘅棋（計阻擋）
// 2) 底線一步殺：正解走完之後係將死；每個錯選項走完之後都唔係將死
// 用法：node tests/chess_rules.cjs
const SITE = require('../content.js');
const SYM = { '♔': 'K', '♕': 'Q', '♖': 'R', '♗': 'B', '♘': 'N', '♙': 'P', '♚': 'k', '♛': 'q', '♜': 'r', '♝': 'b', '♞': 'n', '♟': 'p' };
const F = 'abcdefgh';

function readBoard(html) {
  const b = {};
  const re = /title="([a-h][1-8])">(?:<span[^>]*>[^<]*<\/span>)*([♔-♟]?)<\/div>/g;
  let m;
  while ((m = re.exec(html))) if (m[2]) b[m[1]] = SYM[m[2]];
  return b;
}
const xy = s => [F.indexOf(s[0]), +s[1] - 1];
const sq = (x, y) => F[x] + (y + 1);
function hits(b, from, to) {
  const p = b[from].toUpperCase(), [fx, fy] = xy(from), [tx, ty] = xy(to);
  const dx = tx - fx, dy = ty - fy, ax = Math.abs(dx), ay = Math.abs(dy);
  if (!ax && !ay) return false;
  if (p === 'N') return ax * ay === 2;
  if (p === 'K') return Math.max(ax, ay) === 1;
  const line = ax === 0 || ay === 0, diag = ax === ay;
  if ((p === 'R' && !line) || (p === 'B' && !diag) || (p === 'Q' && !line && !diag) || p === 'P') return false;
  const sx = Math.sign(dx), sy = Math.sign(dy);
  for (let x = fx + sx, y = fy + sy; x !== tx || y !== ty; x += sx, y += sy) if (b[sq(x, y)]) return false;
  return true;
}
const whiteHits = (b, to) => Object.keys(b).filter(s => b[s] === b[s].toUpperCase() && hits(b, s, to));
function isMate(b) {
  const k = Object.keys(b).find(s => b[s] === 'k');
  if (!whiteHits(b, k).length) return false;
  const [kx, ky] = xy(k);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const x = kx + dx, y = ky + dy;
    if ((!dx && !dy) || x < 0 || x > 7 || y < 0 || y > 7) continue;
    const t = sq(x, y);
    if (b[t] && b[t] === b[t].toLowerCase()) continue; // 自己棋
    const nb = Object.assign({}, b); delete nb[k]; nb[t] = 'k';
    if (!whiteHits(nb, t).length) return false; // 有格逃
  }
  // 黑方只有王同兵（兵向下行、斜吃）：檢查兵可唔可以吃走將軍嘅棋
  const att = whiteHits(b, k);
  if (att.length === 1) {
    const [ax, ay] = xy(att[0]);
    for (const s of Object.keys(b)) if (b[s] === 'p') { const [px, py] = xy(s); if (py - 1 === ay && Math.abs(px - ax) === 1) return false; }
  }
  return true;
}

let bad = 0, n = 0;
const fail = (k, seed, msg) => { bad++; if (bad <= 15) console.log(k, seed, msg); };
for (let seed = 1; seed <= 3000; seed++) {
  // 將軍題
  let q = SITE.makeQ('check', seed);
  if (q.gi === 0) {
    n++;
    const b = readBoard(q.visual), k = Object.keys(b).find(s => b[s] === 'k');
    const real = whiteHits(b, k);
    const ok = q.options.find(o => o.ok).t;
    const expect = real.length ? real : [];
    if (expect.length > 1) fail('check', seed, '多過一粒將軍');
    else if (expect.length === 0 ? ok !== '冇棋將軍' : !ok.includes(expect[0])) fail('check', seed, `答案 ${ok}，實際 ${expect}`);
  }
  // 底線一步殺
  q = SITE.makeQ('backrank', seed);
  if (q.gi === 0) {
    n++;
    const b = readBoard(q.visual), r = Object.keys(b).find(s => b[s] === 'R');
    if (isMate(b)) fail('backrank', seed, '開局已經將死');
    for (const o of q.options) {
      const to = o.t.split('→ ')[1], nb = Object.assign({}, b); delete nb[r]; nb[to] = 'R';
      const mate = isMate(nb);
      if (o.ok && !mate) fail('backrank', seed, `正解 ${o.t} 唔係將死`);
      if (!o.ok && mate) fail('backrank', seed, `錯選項 ${o.t} 都係將死`);
    }
  }
}
// ---------- 3) 后殺／馬殺：用完整走法（另一套寫法）核對 ----------
const DIRN = { N: [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]] };
const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]], BISH = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const white = p => p === p.toUpperCase();
function attacked(b, target, byWhite) {
  const [tx, ty] = xy(target);
  for (const s of Object.keys(b)) {
    const p = b[s]; if (white(p) !== byWhite) continue;
    const u = p.toUpperCase(), [x, y] = xy(s), dx = tx - x, dy = ty - y;
    if (!dx && !dy) continue;
    if (u === 'P') { if (dy === (byWhite ? 1 : -1) && Math.abs(dx) === 1) return true; continue; }
    if (u === 'N') { if (Math.abs(dx * dy) === 2) return true; continue; }
    if (u === 'K') { if (Math.max(Math.abs(dx), Math.abs(dy)) === 1) return true; continue; }
    if (hits(Object.assign({}, b, { [s]: u }), s, target)) return true;
  }
  return false;
}
function movesOf(b, side) {
  const out = [];
  for (const s of Object.keys(b)) {
    const p = b[s]; if (white(p) !== side) continue;
    const u = p.toUpperCase(), [x, y] = xy(s);
    const push = (nx, ny) => { if (nx < 0 || nx > 7 || ny < 0 || ny > 7) return false; const t = sq(nx, ny); if (b[t] && white(b[t]) === side) return false; out.push([s, t]); return !b[t]; };
    if (u === 'P') {
      const d = side ? 1 : -1, t1 = sq(x, y + d);
      if (y + d >= 0 && y + d <= 7 && !b[t1]) { out.push([s, t1]); const t2 = sq(x, y + 2 * d); if (y === (side ? 1 : 6) && !b[t2]) out.push([s, t2]); }
      for (const ex of [x - 1, x + 1]) { if (ex < 0 || ex > 7) continue; const t = sq(ex, y + d); if (b[t] && white(b[t]) !== side) out.push([s, t]); }
    } else if (u === 'N' || u === 'K') {
      const ds = u === 'N' ? DIRN.N : ROOK.concat(BISH);
      for (const [a, c] of ds) push(x + a, y + c);
    } else {
      const ds = u === 'R' ? ROOK : u === 'B' ? BISH : ROOK.concat(BISH);
      for (const [a, c] of ds) for (let k = 1; k < 8 && push(x + a * k, y + c * k); k++);
    }
  }
  return out;
}
const play = (b, m) => { const nb = Object.assign({}, b); nb[m[1]] = nb[m[0]]; delete nb[m[0]]; return nb; };
const kingOf = (b, side) => Object.keys(b).find(s => b[s] === (side ? 'K' : 'k'));
const checked = (b, side) => attacked(b, kingOf(b, side), !side);
const legal = (b, side) => movesOf(b, side).filter(m => !checked(play(b, m), side));
const mated = b => checked(b, false) && legal(b, false).length === 0;
for (const key of ['qmate', 'nmate']) {
  const P = key === 'qmate' ? 'Q' : 'N';
  for (let seed = 1; seed <= 1500; seed++) {
    const q = SITE.makeQ(key, seed);
    if (q.gi === 2) continue;
    n++;
    const b = readBoard(q.visual), from = Object.keys(b).find(s => b[s] === P);
    if (checked(b, false)) fail(key, seed, '開局黑王已經被將');
    for (const o of q.options) {
      const to = o.t.match(/→ ([a-h][1-8])/)[1];
      if (!legal(b, true).some(m => m[0] === from && m[1] === to)) { fail(key, seed, `${o.t} 唔合法`); continue; }
      const m = mated(play(b, [from, to]));
      if (o.ok && !m) fail(key, seed, `正解 ${o.t} 唔係將死`);
      if (!o.ok && m) fail(key, seed, `錯選項 ${o.t} 都係將死`);
    }
  }
}

// ---------- 4) 方格法則：逐步搜尋王追兵（唔用方格公式）----------
// 回傳 true ＝ 黑王追得到（兵冇安全升變）
const memo = new Map();
function race(kx, ky, px, py, wtm) {
  const id = [kx, ky, px, py, wtm].join(',');
  if (memo.has(id)) return memo.get(id);
  let res;
  if (wtm) {
    const steps = [];
    if (!(kx === px && ky === py + 1)) steps.push(py + 1);
    if (py === 1 && !(kx === px && (ky === 2 || ky === 3))) steps.push(3);
    if (!steps.length) res = true; // 兵行唔到（困斃／被擋）
    else res = steps.every(ny => ny === 7 ? Math.max(Math.abs(kx - px), Math.abs(ky - 7)) === 1 : race(kx, ky, px, ny, false));
  } else {
    if (Math.max(Math.abs(kx - px), Math.abs(ky - py)) === 1) res = true; // 吃兵
    else {
      res = false;
      for (let dx = -1; dx <= 1 && !res; dx++) for (let dy = -1; dy <= 1 && !res; dy++) {
        const x = kx + dx, y = ky + dy;
        if ((!dx && !dy) || x < 0 || x > 7 || y < 0 || y > 7) continue;
        if (y === py + 1 && Math.abs(x - px) === 1) continue; // 兵控制嘅格
        if (race(x, y, px, py, true)) res = true;
      }
    }
  }
  memo.set(id, res);
  return res;
}
for (let seed = 1; seed <= 1500; seed++) {
  const q = SITE.makeQ('square', seed);
  if (q.gi === 2) continue;
  n++;
  const b = readBoard(q.visual), p = Object.keys(b).find(s => b[s] === 'P'), [px, py] = xy(p);
  const wtm = q.prompt.startsWith('白先行');
  for (const o of q.options) {
    const [kx, ky] = xy(o.t.match(/([a-h][1-8])$/)[1]);
    const caught = race(kx, ky, px, py, wtm);
    if (o.ok !== caught) fail('square', seed, `${o.t} ${wtm ? '白先' : '黑先'} 兵 ${p}：搜尋結果 ${caught ? '追到' : '追唔到'}`);
  }
}

// ---------- 5) 王兵殘局：殘局表用經典局面核對 ----------
const C = SITE._chess, T = C.kpkSolve(), ii = s => C.I(F.indexOf(s[0]), +s[1] - 1);
const at = (w, b, p) => (ii(w) * 64 + ii(b)) * 64 + ii(p);
[['e5', 'e7', 'e4', 0, 1], ['e6', 'e8', 'e5', 1, 1], ['a6', 'a8', 'a5', 0, 0], ['e6', 'e8', 'e7', 1, 0]].forEach(([w, b, p, ew, eb]) => {
  n++;
  if (T.W[at(w, b, p)] !== ew || T.B[at(w, b, p)] !== eb) fail('kpk', `${w}/${b}/${p}`, '經典局面判錯');
});
for (let seed = 1; seed <= 1500; seed++) {
  const q = SITE.makeQ('kpk', seed);
  if (q.gi === 2) continue;
  n++;
  const b = readBoard(q.visual), k = (c) => Object.keys(b).find(s => b[s] === c);
  const mv = C.kpkMoves(ii(k('K')), ii(k('k')), ii(k('P')));
  for (const o of q.options) {
    const m = mv.find(x => x.t === o.t);
    if (!m || m.win !== o.ok) fail('kpk', seed, `${o.t} 同殘局表唔對`);
  }
}

console.log(`規則驗證 ${n} 題，有問題 ${bad} 題`);
process.exit(bad ? 1 : 0);
