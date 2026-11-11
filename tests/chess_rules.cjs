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
console.log(`規則驗證 ${n} 題，有問題 ${bad} 題`);
process.exit(bad ? 1 : 0);
