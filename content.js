/* content.js — 西洋棋（國際象棋）：項目、題目生成器。純邏輯、無 DOM，可以喺 Node 直接測試。
   每個生成器 gen(rng) 回傳 {prompt, visual, options:[{t, ok, k}], expl}。
   k = 混淆矩陣用嘅項目 key。makeQ(key, seed) 確定性：同一個 seed 永遠出同一題。 */
(function (root) {
  'use strict';

  // ---------- 亂數 / 工具 ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var util = {
    mulberry: mulberry32,
    int: function (rng, a, b) { return a + Math.floor(rng() * (b - a + 1)); },
    pick: function (rng, arr) { return arr[Math.floor(rng() * arr.length)]; },
    shuffle: function (arr, rng) {
      for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(rng() * (i + 1)), t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    }
  };

  // ---------- 棋盤 ----------
  var FILES = 'abcdefgh';
  var NAME = { R: '車', B: '象', N: '馬', Q: '后', K: '王', P: '兵' };
  var ITEM_OF = { R: 'rook', B: 'bishop', N: 'knight', Q: 'queen', K: 'king', P: 'pawn' };
  var SYM = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  var RULE = {
    R: '直線（橫或直），任意格數，中間唔可以有棋',
    B: '斜線，任意格數，格色唔會變',
    Q: '直線或斜線，任意格數',
    N: 'L 形：兩格加一格，可以跳過其他棋',
    K: '周圍八格其中一格',
    P: '向前一格（起始排可以行兩格）'
  };
  var DIRS = {
    R: [[1, 0], [-1, 0], [0, 1], [0, -1]],
    B: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
    Q: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]],
    N: [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]],
    K: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
  };
  function sqn(f, r) { return FILES[f] + (r + 1); }
  function inB(f, r) { return f >= 0 && f < 8 && r >= 0 && r < 8; }

  // 空棋盤上，一步可以到達嘅格（白兵向上，唔計吃子）
  function reach(p, f, r) {
    var out = [];
    if (p === 'P') {
      if (r + 1 < 8) out.push([f, r + 1]);
      if (r === 1) out.push([f, 3]);
      return out;
    }
    var slide = p === 'R' || p === 'B' || p === 'Q';
    DIRS[p].forEach(function (d) {
      var x = f + d[0], y = r + d[1];
      while (inB(x, y)) {
        out.push([x, y]);
        if (!slide) break;
        x += d[0]; y += d[1];
      }
    });
    return out;
  }
  function knightHits(ax, ay, bx, by) {
    var dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
    return (dx === 1 && dy === 2) || (dx === 2 && dy === 1);
  }
  function boardHtml(pcs, marks) {
    marks = marks || {};
    var h = '<div class="board">';
    for (var r = 7; r >= 0; r--) {
      for (var f = 0; f < 8; f++) {
        var p = null;
        for (var i = 0; i < pcs.length; i++) if (pcs[i].f === f && pcs[i].r === r) { p = pcs[i].p; break; }
        var coord = (f === 0 ? '<span class="rk">' + (r + 1) + '</span>' : '') + (r === 0 ? '<span class="fl">' + FILES[f] + '</span>' : '');
        h += '<div class="sq ' + ((f + r) % 2 === 0 ? 'd' : 'l') + (marks[sqn(f, r)] ? ' ' + marks[sqn(f, r)] : '') + '" title="' + sqn(f, r) + '">' + coord + (p ? SYM[p] : '') + '</div>';
      }
    }
    return h + '</div>';
  }

  // ---------- 圖解（學習頁示意圖） ----------
  // 標記：dot＝可以去、hit＝被攻擊／目標、from＝主角
  function S2(s) { return { f: FILES.indexOf(s[0]), r: +s[1] - 1 }; }
  function P2(s, p) { var o = S2(s); o.p = p; return o; }
  function M(obj) { return obj; }
  function diag(pcs, marks, cap) {
    return boardHtml(pcs, marks) + '<div class="legend"><span class="lg dot"></span>可以去　<span class="lg hit"></span>目標／受攻擊　<span class="lg from"></span>主角</div><div class="cap">' + cap + '</div>';
  }
  function moveDiag(p) {
    var f = 3, r = 3, m = {};
    reach(p, f, r).forEach(function (t) { m[sqn(t[0], t[1])] = 'dot'; });
    m[sqn(f, r)] = 'from';
    return diag([{ f: f, r: r, p: p }], m, '白' + NAME[p] + '喺 d4：綠點＝一步可以去嘅格。' + RULE[p] + '。');
  }
  var DIAG = {
    rook: moveDiag('R'), bishop: moveDiag('B'), knight: moveDiag('N'), queen: moveDiag('Q'), king: moveDiag('K'),
    pawn: diag([P2('e2', 'P'), P2('f3', 'n')], M({ e2: 'from', e3: 'dot', e4: 'dot', f3: 'hit' }),
      '白兵喺 e2（起始排）：可以行一格去 e3 或者兩格去 e4；斜前 f3 有黑棋就可以吃（紅框）。'),
    value: '<div class="mat">♕ 后 9　♖ 車 5<br>♗ 象 3　♘ 馬 3　♙ 兵 1</div><div class="cap">交換之前先計分：用馬（3）換車（5）＝賺 2 分。</div>',
    check: diag([P2('e1', 'R'), P2('e8', 'k')], M({ e1: 'from', e2: 'dot', e3: 'dot', e4: 'dot', e5: 'dot', e6: 'dot', e7: 'dot', e8: 'hit' }),
      '白車沿 e 線將軍黑王。黑方三個方法：走王、喺 e2–e7 之間擋、或者吃車。'),
    fork: diag([P2('c7', 'N'), P2('e8', 'k'), P2('a8', 'r')], M({ c7: 'from', e8: 'hit', a8: 'hit' }),
      '白馬喺 c7 同時攻擊黑王（e8）同黑車（a8）：黑王一定要走，白馬就吃車。'),
    pin: diag([P2('b5', 'B'), P2('c6', 'n'), P2('e8', 'k')], M({ b5: 'from', c6: 'hit', d7: 'dot', e8: 'hit' }),
      '白象喺 b5 牽制黑馬（c6）：黑馬一郁，後面嘅黑王（e8）就被將，所以佢郁唔得（前細後大）。'),
    skewer: diag([P2('a4', 'R'), P2('e4', 'k'), P2('h4', 'q')], M({ a4: 'from', e4: 'hit', h4: 'hit' }),
      '白車將軍黑王（e4）。黑王避開之後，白車就吃後面嘅黑后（h4）＝串擊（前大後細）。'),
    backrank: diag([P2('a8', 'R'), P2('g8', 'k'), P2('f7', 'p'), P2('g7', 'p'), P2('h7', 'p'), P2('g1', 'K')], M({ a8: 'from', g8: 'hit' }),
      '白車去咗 a8 將軍：黑王前面被自己三粒兵封住，f8、h8 又被車控制 → 將死。'),
    mate: diag([P2('g7', 'Q'), P2('h8', 'k'), P2('f6', 'K')], M({ g7: 'from', h8: 'hit' }),
      '白后喺 g7 將軍，有白王（f6）保護：黑王冇格逃、又吃唔到后 → 將死。'),
    castle: diag([P2('e1', 'K'), P2('h1', 'R')], M({ e1: 'from', h1: 'from', g1: 'dot', f1: 'dot' }),
      '短易位：王由 e1 行兩格去 g1，車由 h1 跳去 f1（綠點）。長易位就係王去 c1、車去 d1。'),
    promote: diag([P2('e7', 'P')], M({ e7: 'from', e8: 'dot' }),
      '白兵行到 e8（最後一排）即刻升變，通常變做后。'),
    enpassant: diag([P2('e5', 'P'), P2('d5', 'p')], M({ e5: 'from', d5: 'hit', d6: 'dot' }),
      '黑兵啱啱由 d7 一步行兩格到 d5，停喺白兵（e5）隔籬：白兵下一步可以斜行去 d6，吃走 d5 嘅黑兵。'),
    principle: diag([P2('e4', 'P'), P2('f3', 'N'), P2('c3', 'N'), P2('c4', 'B'), P2('g1', 'K'), P2('f1', 'R')], M({ d4: 'dot', d5: 'dot', e5: 'dot', e4: 'from' }),
      '開局：兵佔中心（e4，綠點係其他中心格）、出馬（c3、f3）、出象（c4）、王車易位（王去咗 g1）。')
  };

  // ---------- 生成器：走法（一步可以去邊格） ----------
  function genMove(p) {
    return function (rng) {
      var f = util.int(rng, 0, 7);
      var r = p === 'P' ? util.int(rng, 1, 6) : util.int(rng, 0, 7);
      var legal = reach(p, f, r).map(function (t) { return sqn(t[0], t[1]); });
      var others = [];
      for (var x = 0; x < 8; x++) for (var y = 0; y < 8; y++) {
        var s = sqn(x, y);
        if (!(x === f && y === r) && legal.indexOf(s) < 0) others.push(s);
      }
      var good = util.pick(rng, legal);
      var bad = util.shuffle(others, rng).slice(0, 3);
      return {
        prompt: '白' + NAME[p] + ' 喺 ' + sqn(f, r) + '，下面邊個格可以一步行到？（空棋盤，唔計其他棋）',
        visual: boardHtml([{ f: f, r: r, p: p }]),
        options: [{ t: good, ok: true, k: ITEM_OF[p] }].concat(bad.map(function (s) { return { t: s, ok: false, k: ITEM_OF[p] }; })),
        expl: '白' + NAME[p] + '：' + RULE[p] + '。由 ' + sqn(f, r) + ' 一步可以去 ' + good + '。'
      };
    };
  }

  // ---------- 生成器：馬嘅落點數目 ----------
  function genKnightCount(rng) {
    var f = util.int(rng, 0, 7), r = util.int(rng, 0, 7);
    var n = reach('N', f, r).length;
    var wrong = util.shuffle([2, 3, 4, 6, 8].filter(function (x) { return x !== n; }), rng).slice(0, 3);
    return {
      prompt: '白馬喺 ' + sqn(f, r) + '，空棋盤上一步有幾多個合法落點？',
      visual: boardHtml([{ f: f, r: r, p: 'N' }]),
      options: [n].concat(wrong).map(function (v) { return { t: v + ' 個', ok: v === n, k: 'knight' }; }),
      expl: '馬喺 ' + sqn(f, r) + ' 有 ' + n + ' 個落點：' +
        reach('N', f, r).map(function (t) { return sqn(t[0], t[1]); }).join('、') + '。角落最少，中間最多。'
    };
  }

  // ---------- 生成器：叉（Fork）— 搵唯一一個同時攻擊兩粒黑子嘅馬位 ----------
  function genFork(rng) {
    for (var tries = 0; tries < 500; tries++) {
      var a = [util.int(rng, 0, 7), util.int(rng, 0, 7)];
      var b = [util.int(rng, 0, 7), util.int(rng, 0, 7)];
      if (a[0] === b[0] && a[1] === b[1]) continue;
      var F = [], one = [];
      for (var x = 0; x < 8; x++) for (var y = 0; y < 8; y++) {
        if ((x === a[0] && y === a[1]) || (x === b[0] && y === b[1])) continue;
        var ha = knightHits(x, y, a[0], a[1]), hb = knightHits(x, y, b[0], b[1]);
        if (ha && hb) F.push([x, y]);
        else if (ha || hb) one.push([x, y]);
      }
      // 答案必須唯一：只有一格可以同時攻擊兩粒
      if (F.length !== 1 || one.length < 3) continue;
      var good = sqn(F[0][0], F[0][1]);
      var bad = util.shuffle(one.slice(), rng).slice(0, 3).map(function (s) { return sqn(s[0], s[1]); });
      return {
        prompt: '白馬（♘）應該放喺邊格，先可以一步同時攻擊黑車（♜）同黑后（♛）？',
        visual: boardHtml([{ f: a[0], r: a[1], p: 'r' }, { f: b[0], r: b[1], p: 'q' }]),
        options: [{ t: good, ok: true, k: 'fork' }].concat(bad.map(function (s) { return { t: s, ok: false, k: 'fork' }; })),
        expl: '白馬放喺 ' + good + ' 會跳到黑車同黑后，即係叉。其他格最多只攻擊一粒。'
      };
    }
    throw new Error('genFork: 搵唔到唯一答案');
  }

  // ---------- 攻擊判斷（計阻擋） ----------
  function attacks(p, f, r, tf, tr, occ) {
    var adx = Math.abs(tf - f), ady = Math.abs(tr - r);
    if (adx === 0 && ady === 0) return false;
    if (p === 'N') return knightHits(f, r, tf, tr);
    if (p === 'K') return Math.max(adx, ady) === 1;
    if (p === 'P') return tr === r + 1 && adx === 1;
    var straight = adx === 0 || ady === 0, diag = adx === ady;
    if (p === 'R' && !straight) return false;
    if (p === 'B' && !diag) return false;
    if (p === 'Q' && !(straight || diag)) return false;
    var dx = Math.sign(tf - f), dy = Math.sign(tr - r), x = f + dx, y = r + dy;
    while (!(x === tf && y === tr)) { if (occ(x, y)) return false; x += dx; y += dy; }
    return true;
  }
  function occOf(pcs) {
    return function (x, y) { return pcs.some(function (q) { return q.f === x && q.r === y; }); };
  }

  // ---------- 生成器：邊粒棋將緊軍？（有其他棋阻擋） ----------
  function genCheck(rng) {
    var want = rng() < 0.25 ? 0 : 1;
    for (var tries = 0; tries < 2000; tries++) {
      var k = { f: util.int(rng, 0, 7), r: util.int(rng, 0, 7), p: 'k' };
      var types = util.shuffle(['R', 'B', 'N', 'Q'], rng).slice(0, 3);
      var pcs = [k], okPos = true;
      types.forEach(function (t) {
        var f = util.int(rng, 0, 7), r = util.int(rng, 0, 7);
        if (pcs.some(function (q) { return q.f === f && q.r === r; })) okPos = false;
        pcs.push({ f: f, r: r, p: t });
      });
      if (!okPos) continue;
      var occ = occOf(pcs), whites = pcs.slice(1);
      var hit = whites.filter(function (w) { return attacks(w.p, w.f, w.r, k.f, k.r, occ); });
      if (hit.length !== want) continue;
      // 三粒白棋入面，剛好 want 粒將緊軍（其他被擋或者唔喺線上）
      var lbl = function (w) { return '白' + NAME[w.p] + '（' + sqn(w.f, w.r) + '）'; };
      var opts = whites.map(function (w) { return { t: lbl(w), ok: hit.indexOf(w) >= 0, k: 'check' }; });
      opts.push({ t: '冇棋將軍', ok: want === 0, k: 'check' });
      return {
        prompt: '黑王（♚）喺 ' + sqn(k.f, k.r) + '。而家邊一粒白棋正在將軍？（要計其他棋阻擋）',
        visual: boardHtml(pcs),
        options: opts,
        expl: want === 0
          ? '冇棋將軍：三粒白棋都唔喺攻擊線上，或者被其他棋擋住。'
          : lbl(hit[0]) + ' 將緊黑王（' + RULE[hit[0].p] + '）。其他白棋唔喺攻擊線上，或者中間有棋擋住。'
      };
    }
    throw new Error('genCheck: 搵唔到合適局面');
  }

  // ---------- 生成器：底線將死（一步殺） ----------
  function genBackRank(rng) {
    var mirror = rng() < 0.5;
    var F = function (f) { return mirror ? 7 - f : f; };
    var rf = F(util.int(rng, 0, 4)), rr = util.int(rng, 0, 5);
    var pcs = [
      { f: F(6), r: 7, p: 'k' }, { f: F(5), r: 6, p: 'p' }, { f: F(6), r: 6, p: 'p' }, { f: F(7), r: 6, p: 'p' },
      { f: F(7), r: 0, p: 'K' }, { f: rf, r: rr, p: 'R' }
    ];
    var occ = occOf(pcs);
    var moves = [];
    DIRS.R.forEach(function (d) {
      var x = rf + d[0], y = rr + d[1];
      while (inB(x, y) && !occ(x, y)) { moves.push(sqn(x, y)); x += d[0]; y += d[1]; }
    });
    var good = sqn(rf, 7);
    var bad = util.shuffle(moves.filter(function (m) { return m !== good; }), rng).slice(0, 3);
    return {
      prompt: '白先行。白車一步將死黑王，應該行去邊格？',
      visual: boardHtml(pcs),
      options: [{ t: '車 → ' + good, ok: true, k: 'backrank' }].concat(bad.map(function (m) { return { t: '車 → ' + m, ok: false, k: 'backrank' }; })),
      expl: '車 → ' + good + '：沿第 8 排將軍。黑王前面被自己三粒兵封住，旁邊嘅格又被車控制，冇棋可以擋或者吃 → 底線將死。'
    };
  }

  // ---------- 生成器：子力計數（計算題） ----------
  var VAL = { Q: 9, R: 5, B: 3, N: 3, P: 1 };
  function genValue(rng) {
    function side() {
      return { Q: util.int(rng, 0, 1), R: util.int(rng, 0, 2), B: util.int(rng, 0, 2), N: util.int(rng, 0, 2), P: util.int(rng, 1, 8) };
    }
    function sum(s) { return Object.keys(VAL).reduce(function (a, k) { return a + VAL[k] * s[k]; }, 0); }
    function txt(s, black) {
      return Object.keys(VAL).filter(function (k) { return s[k]; })
        .map(function (k) { return SYM[black ? k.toLowerCase() : k] + '×' + s[k]; }).join('　');
    }
    var w = side(), b = side(), d = sum(w) - sum(b);
    var wrong = util.shuffle([d - 3, d - 2, d - 1, d + 1, d + 2, d + 3], rng).slice(0, 3);
    return {
      prompt: '按子力價值（后 9、車 5、象 3、馬 3、兵 1），白方比黑方多幾多分？（負數 ＝ 白方少）',
      visual: '<div class="mat"><div>白：' + txt(w, false) + '</div><div>黑：' + txt(b, true) + '</div></div>',
      options: [d].concat(wrong).map(function (v) { return { t: (v > 0 ? '+' : '') + v, ok: v === d, k: 'value' }; }),
      expl: '白 ' + sum(w) + ' 分，黑 ' + sum(b) + ' 分，相差 ' + (d > 0 ? '+' : '') + d + '。'
    };
  }

  // ---------- 概念題庫（文字題） ----------
  var QB = [
    { k: 'rook', q: '車（Rook）嘅走法係？', c: '直線（橫或直），任意格數，唔可以越過其他棋子',
      w: ['斜線，任意格數', 'L 形：一次跳兩格加一格', '任何方向，只可以行一格'], e: '車只走直線；斜線係象，L 形係馬。' },
    { k: 'bishop', q: '象（Bishop）嘅走法係？', c: '斜線，任意格數；一粒象一世只留喺同一種格色',
      w: ['直線，任意格數', '周圍八格任何一格', 'L 形跳躍'], e: '象只走斜線，所以格色永遠唔變。' },
    { k: 'knight', q: '馬（Knight）嘅特點係？', c: 'L 形（兩格加一格），可以跳過其他棋子',
      w: ['直線任意格數，但唔可以跳', '斜線任意格數', '只可以向前行'], e: '馬係唯一可以跳過其他棋子嘅棋，所以特別適合做叉。' },
    { k: 'queen', q: '后（Queen）嘅走法係？', c: '車加象：直線同斜線都得，任意格數',
      w: ['只得斜線', 'L 形加斜線', '只可以行一格'], e: '后最強，但太早出會被對方趕走。' },
    { k: 'king', q: '王（King）一步可以去邊？', c: '周圍八格其中一格（唔可以行入被攻擊嘅格）',
      w: ['任意格數嘅直線', '只可以斜行一格', 'L 形跳躍'], e: '王一格一格行，而且唔可以送入攻擊範圍。' },
    { k: 'pawn', q: '兵（Pawn）點樣行同吃子？', c: '向前一格（起始排可行兩格）；吃子係斜前一格',
      w: ['向前任意格；吃子係直前', '斜行任意格；吃子直前一格', '橫向任意格；吃子係斜前一格'], e: '兵唔可以後退，吃子同行路唔同。' },
    { k: 'fork', q: '叉（Fork）係指？', c: '一粒棋同時攻擊兩粒或以上嘅對方棋子',
      w: ['一粒棋被兩粒對方棋包圍，無路可走', '兩粒己方棋互相保護', '直接將死對方王'], e: '叉令對方只可以救一粒，另一粒就會被吃。' },
    { k: 'pin', q: '牽制（Pin）係指？', c: '對方一粒棋擋住同一線上更重要嘅棋（例如王）；郁咗會令後者受攻擊',
      w: ['同時攻擊兩粒棋', '將死對手', '用兵換一粒后'], e: '被牽制嘅棋唔可以隨便郁，否則後面嗰粒會被攻擊。' },
    { k: 'backrank', q: '底線將死（Back-rank mate）通常發生喺乜情況？', c: '王喺底線，前面被自己嘅兵封住；車或后從底線將軍，王冇格可以逃',
      w: ['王走到棋盤中央被將', '雙方兵同時升變', '車吃咗對方所有兵'], e: '預防方法：早啲留一格逃生（例如兵走一步 h3）。' },
    { k: 'mate', q: '將死（Checkmate）嘅定義係？', c: '王正被將，而且擋、吃掉攻擊棋、逃走都做唔到',
      w: ['對方少一粒棋', '王被將一次就算', '雙方同意和棋'], e: '將軍唔等於將死。將死係冇解決方法。' },
    { k: 'principle', q: '開局嘅基本原則係？', c: '控制中心、出馬出象、早王車易位，唔好多次郁同一粒棋',
      w: ['早出后搶兵', '先吃兵，王留喺中央', '隨便郁，只要快就得'], e: '發展子力通常比搶兵更重要。' },
    { k: 'castle', q: '王車易位（Castling）嘅條件，以下邊個正確？',
      c: '王同用嚟易位嘅車都未郁過；中間格冇棋；王經過同落嘅格唔受攻擊；王唔喺將軍中',
      w: ['王只要未被將過，車郁過都可以易位', '易位後王會跳到車嘅位置，車留低喺原位', '只可以喺開局前 10 步內易位'],
      e: '易位係一步完成「王靠邊」＋「車入中」，但條件要全部符合。' },
    { k: 'promote', q: '兵行到對方最後一排會點？', c: '必須升變做后、車、象或者馬（通常揀后）',
      w: ['留喺原位，之後唔可以再郁', '變做王', '自動拎走，離開棋盤'], e: '升變係兵嘅最大威脅，殘局經常靠佢贏。' },
    { k: 'enpassant', q: '「吃過路兵」（En passant）幾時先可以做？', c: '對方兵由起始排一步行兩格，停喺你嘅兵隔籬；你下一步即刻斜前吃佢',
      w: ['任何時候都可以吃隔籬嘅兵', '只可以用后吃兵', '對方兵行一格之後都得，冇時限'], e: '只可以喺對方行完兩格之後嘅「下一步」做，過咗就冇。' },
    { k: 'skewer', q: '串擊（Skewer）同牽制有咩分別？', c: '串擊係前面嗰粒更重要（例如王），佢一避開就會吃到後面嗰粒',
      w: ['串擊係同時攻擊兩個唔同方向嘅目標', '串擊只可以用馬做', '兩者完全一樣'], e: '牽制：前面細、後面大；串擊：前面大、後面細。同時攻擊兩個方向係「叉」。' },
    { k: 'check', q: '被將軍之後，可以點應對？', c: '走王避開、用棋擋住、或者吃掉將軍嗰粒棋',
      w: ['可以唔理，繼續行其他棋', '只可以王車易位', '一定要用后吃返對方'], e: '三種方法：走、擋、吃。三樣都做唔到就係將死。' },
    { k: 'value', q: '一般子力價值，以下邊個最準？', c: '后 9、車 5、象 3、馬 3、兵 1',
      w: ['后 5、車 9、象 3、馬 3、兵 1', '后 9、車 3、象 5、馬 5、兵 1', '全部棋子價值一樣'], e: '用價值判斷交換值唔值得，例如用馬換車係賺 2 分。' }
  ];
  function genConcept(i) {
    return function () {
      var q = QB[i];
      return {
        prompt: q.q,
        visual: '',
        options: [{ t: q.c, ok: true, k: q.k }].concat(q.w.map(function (t) { return { t: t, ok: false, k: q.k }; })),
        expl: q.e
      };
    };
  }

  // ---------- 項目（12 課） ----------
  var ITEMS = {
    rook: { name: '車（Rook）', cat: '走法', mn: '車 = 直線：橫、直，格數任意',
      features: ['橫、直兩個方向', '格數任意', '唔可以越過棋子'], principle: '直線走法，長距離最有力',
      fail: '誤以為車會斜行（斜行係象）', tip: '底線將死嘅主力：車 + 王喺底線。', gens: [genMove('R'), genConcept(0)] },
    bishop: { name: '象（Bishop）', cat: '走法', mn: '象 = 斜線：永遠留喺同一種格色',
      features: ['四個斜方向', '格數任意', '一世只會留喺同一色格'], principle: '斜線走法',
      fail: '以為象可以直行', tip: '一對象一黑一白，可以覆蓋唔同色格。', gens: [genMove('B'), genConcept(1)] },
    knight: { name: '馬（Knight）', cat: '走法', mn: '馬 = L 形：兩格加一格',
      features: ['最多 8 個落點', '可以跳過其他棋', '每步換一種格色'], principle: 'L 形跳躍，所以唔受阻擋',
      fail: '數錯落點（角落最少，中間最多）', tip: '叉（Fork）最常由馬做。', gens: [genMove('N'), genKnightCount, genConcept(2)] },
    queen: { name: '后（Queen）', cat: '走法', mn: '后 = 車 + 象',
      features: ['直線加斜線', '格數任意', '最強大嘅棋子'], principle: '全方位長射程',
      fail: '太早出后，容易被趕走', tip: '開局早出后係常見錯誤。', gens: [genMove('Q'), genConcept(3)] },
    king: { name: '王（King）', cat: '走法', mn: '王 = 周圍一格',
      features: ['八個方向各一格', '唔可以行入被攻擊嘅格', '被將時必須解決'], principle: '王要保護好，殘局先要主動',
      fail: '忽略王嘅安全', tip: '殘局中，王係有力嘅主動棋子。', gens: [genMove('K'), genConcept(4)] },
    pawn: { name: '兵（Pawn）', cat: '走法', mn: '兵 = 向前一格，吃子斜前',
      features: ['向前一格', '起始排可以兩格', '吃子係斜前一格', '唔可以後退'], principle: '兵係唯一唔可以後退嘅棋',
      fail: '以為兵可以直吃', tip: '兵走咗就唔可以收返，要諗清楚。', gens: [genMove('P'), genConcept(5)] },
    value: { name: '子力價值', cat: '基本概念', mn: '后 9、車 5、象 3、馬 3、兵 1',
      features: ['用分數比較交換值唔值得', '王冇分（輸咗就成局輸）', '位置好嘅棋價值會高啲'], principle: '交換前先計數',
      fail: '用車換馬（蝕 2 分）', tip: '只差 1–2 分時，位置同主動權可能更重要。', gens: [genValue, genConcept(16)] },
    check: { name: '將軍（Check）', cat: '基本概念', mn: '王受攻擊 → 走、擋、吃',
      features: ['直線／斜線棋子會被中間嘅棋擋住', '馬嘅將軍擋唔到（佢係跳）', '被將一定要即刻解決'], principle: '睇攻擊線有冇被擋',
      fail: '冇留意中間有棋擋住', tip: '先睇馬（擋唔到），再睇直線同斜線。', gens: [genCheck, genConcept(15)] },
    fork: { name: '叉（Fork）', cat: '戰術', mn: '一粒棋 → 同時攻擊兩個目標',
      features: ['一粒棋攻擊兩個目標', '最常用馬或兵', '對方通常只可以救一個'], principle: '對方救咗一個，你就吃另一個',
      fail: '叉嘅格可以被對方一吃就掉', tip: '先睇對方棋子之間嘅位置關係。', gens: [genFork, genConcept(6)] },
    pin: { name: '牽制（Pin）', cat: '戰術', mn: '擋住更重要嘅棋 → 郁唔得',
      features: ['對方棋擋住後面重要嘅棋（王或后）', '喺直線或斜線上', '郁咗會令後面嗰粒受攻擊'],
      principle: '對方唔可以郁，因為會令後面嘅王或后被攻擊', fail: '以為被牽制嘅棋一定輸',
      tip: '絕對牽制（後面係王）最難解。', gens: [genConcept(7)] },
    skewer: { name: '串擊（Skewer）', cat: '戰術', mn: '前大後細：大嘅避開，細嘅被吃',
      features: ['同一直線或斜線上有兩粒對方棋', '前面嗰粒價值較高（王或后）', '前面避開之後吃後面'], principle: '同牽制方向相反',
      fail: '同牽制搞亂', tip: '車、象、后先做到串擊（要直線或斜線）。', gens: [genConcept(14)] },
    backrank: { name: '底線將死（Back-rank）', cat: '戰術', mn: '王喺底線、前面被自己嘅兵封住',
      features: ['王喺第 1 或第 8 排', '前面嘅兵冇郁', '車或后從底線將軍'], principle: '王冇格走',
      fail: '忘記留一個逃生格', tip: '兵走一步（例如 h3）就留咗逃生格。', gens: [genBackRank, genConcept(8)] },
    mate: { name: '將死（Checkmate）', cat: '基本概念', mn: '王被將，而且冇任何方法解決',
      features: ['王正受攻擊（將軍）', '擋、吃、逃三樣都做唔到'], principle: '將死即係贏咗一局',
      fail: '以為被將就輸', tip: '將軍唔等於將死。', gens: [genConcept(9)] },
    principle: { name: '開局原則', cat: '基本概念', mn: '中心、出子、王車易位',
      features: ['控制中心（e4 d4 e5 d5）', '出馬出象，早王車易位', '唔好多次郁同一粒棋'],
      principle: '發展子力通常比搶兵更重要', fail: '早出后搶兵', tip: '開局先顧發展，唔好貪吃。', gens: [genConcept(10)] },
    castle: { name: '王車易位（Castling）', cat: '特殊規則', mn: '王跳兩格，車跳到王旁',
      features: ['王同車都未郁過', '中間格冇棋', '王經過同落嘅格唔受攻擊', '王唔可以喺將軍中'],
      principle: '令王早啲安全', fail: '將軍中易位（唔合法）', tip: '易位後王喺角落，安全度大增。', gens: [genConcept(11)] },
    promote: { name: '兵升變（Promotion）', cat: '特殊規則', mn: '兵到底 → 變后（或車、象、馬）',
      features: ['兵行到對方最後一排', '必須即刻升變', '通常揀后，間中揀馬（叉／將軍）'], principle: '兵係未來嘅后',
      fail: '以為只可以變返被吃咗嘅棋', tip: '殘局數兵：邊個先升變通常就贏。', gens: [genConcept(12)] },
    enpassant: { name: '吃過路兵（En passant）', cat: '特殊規則', mn: '對方兵行兩格擦身而過 → 下一步即刻斜吃',
      features: ['只限兵吃兵', '對方兵由起始排行兩格', '只可以喺下一步做'], principle: '防止兵行兩格避開對方兵',
      fail: '過咗一步先記起，已經唔得', tip: '你嘅兵要喺第 5 排（白）先有機會。', gens: [genConcept(13)] }
  };

  // ---------- 關卡 ----------
  var LEVELS = [
    { id: 'C1', name: '車同象', desc: '直線同斜線', items: ['rook', 'bishop'], n: 8 },
    { id: 'C2', name: '馬', desc: 'L 形跳躍', items: ['knight'], n: 8 },
    { id: 'C3', name: '后同王', desc: '最強同最重要', items: ['queen', 'king'], n: 8 },
    { id: 'C4', name: '兵', desc: '行法、升變、吃過路兵', items: ['pawn', 'promote', 'enpassant'], n: 8 },
    { id: 'C5', name: '走法大混戰', desc: '六種棋子混合', items: ['rook', 'bishop', 'knight', 'queen', 'king', 'pawn'], n: 10 },
    { id: 'C6', name: '子力價值', desc: '計分、判斷交換', items: ['value'], n: 8 },
    { id: 'C7', name: '將軍', desc: '邊粒將緊軍（計阻擋）', items: ['check'], n: 8 },
    { id: 'C8', name: '叉', desc: '一粒攻擊兩粒', items: ['fork'], n: 8 },
    { id: 'C9', name: '牽制同串擊', desc: '前細後大／前大後細', items: ['pin', 'skewer'], n: 8 },
    { id: 'C10', name: '一步殺', desc: '底線將死、將死', items: ['backrank', 'mate'], n: 8 },
    { id: 'C11', name: '規則同開局', desc: '易位、升變、過路兵、開局原則', items: ['castle', 'promote', 'enpassant', 'principle'], n: 8 },
    { id: 'C12', name: '畢業考', desc: '全部混合', items: null, n: 15 }
  ];

  // ---------- 出題（確定性） ----------
  function makeQ(k, seed) {
    var it = ITEMS[k];
    var rng = util.mulberry(seed);
    var gi = seed % it.gens.length;
    var q = it.gens[gi](rng);
    q.options = util.shuffle(q.options.slice(), rng);
    q.key = k; q.seed = seed; q.gi = gi;
    return q;
  }

  var SITE = {
    id: 'chess-learning-v1',
    title: '西洋棋學習',
    subtitle: '練方法，唔係背答案：每次題目都隨機生成',
    util: util,
    items: ITEMS,
    order: Object.keys(ITEMS),
    labels: {},
    levels: LEVELS,
    makeQ: makeQ
  };
  LEVELS[LEVELS.length - 1].items = SITE.order;
  SITE.order.forEach(function (k) { if (DIAG[k]) ITEMS[k].diagram = DIAG[k]; });

  if (typeof module !== 'undefined' && module.exports) module.exports = SITE;
  else root.SITE = SITE;
})(typeof window !== 'undefined' ? window : globalThis);
