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
      '開局：兵佔中心（e4，綠點係其他中心格）、出馬（c3、f3）、出象（c4）、王車易位（王去咗 g1）。'),
    qmate: diag([P2('h7', 'Q'), P2('e6', 'K'), P2('e8', 'k')], M({ h7: 'from', e7: 'dot', e8: 'hit' }),
      '「死亡之吻」：白后由 h7 行去 e7（綠點）貼身將軍，有白王 e6 保護。黑王吃唔到后，d8、f8、d7、f7 全部被控制 → 將死。'),
    nmate: diag([P2('g5', 'N'), P2('h8', 'k'), P2('g8', 'r'), P2('g7', 'p'), P2('h7', 'p'), P2('g1', 'K')], M({ g5: 'from', f7: 'dot', h8: 'hit' }),
      '悶殺：黑王 h8 被自己嘅車（g8）同兵（g7、h7）塞死。白馬跳去 f7（綠點）將軍，擋唔到、走唔到、吃唔到 → 將死。'),
    opposition: diag([P2('e4', 'K'), P2('e6', 'k')], M({ e4: 'from', e5: 'dot', e6: 'hit' }),
      '直接對立：白王 e4、黑王 e6，同一直線中間隔一格（e5）。如果輪到黑方行，黑王唔可以行 e5，只可以讓路。'),
    square: diag([P2('c4', 'P'), P2('f6', 'k')], M({ c4: 'from', c5: 'dot', c6: 'dot', c7: 'dot', c8: 'dot', d4: 'dot', d5: 'dot', d6: 'dot', d7: 'dot', d8: 'dot',
      e4: 'dot', e5: 'dot', e6: 'dot', e7: 'dot', e8: 'dot', f4: 'dot', f5: 'dot', f7: 'dot', f8: 'dot', g4: 'dot', g5: 'dot', g6: 'dot', g7: 'dot', g8: 'dot', f6: 'hit' }),
      '白兵 c4 要行 4 步先到 c8。由 c4 畫一個 5×5 正方形（c4–g4–g8–c8，綠點）。黑王 f6 喺方格入面 → 追得到。白先行時黑王要已經喺方格入面；黑先行就只要行一步入到方格。'),
    kpk: diag([P2('e5', 'P'), P2('e4', 'K'), P2('e8', 'k')], M({ e5: 'from', d6: 'dot', e6: 'dot', f6: 'dot', d7: 'dot', e7: 'dot', f7: 'dot' }),
      '白兵 e5 嘅關鍵格（綠點）：d6、e6、f6、d7、e7、f7。白王行到其中一格，唔理邊個先行都贏；黑王守住呢啲格就有機會和。')
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

  // ---------- 迷你規則引擎（一步殺用）----------
  // 棋盤：長度 64 陣列，index = r*8+f；大寫＝白、細寫＝黑、'' ＝空。唔計易位同吃過路兵（題目用唔著）。
  function I(f, r) { return r * 8 + f; }
  function isW(p) { return !!p && p === p.toUpperCase(); }
  function sqName(s) { return sqn(s % 8, s >> 3); }
  function emptyBoard() { var b = []; for (var i = 0; i < 64; i++) b.push(''); return b; }
  function toPcs(b) { var o = []; for (var s = 0; s < 64; s++) if (b[s]) o.push({ f: s % 8, r: s >> 3, p: b[s] }); return o; }
  // (f, r) 有冇被 white 方攻擊
  function attackedBy(b, f, r, white) {
    var i, d, x, y;
    for (i = 0; i < 8; i++) { d = DIRS.N[i]; x = f + d[0]; y = r + d[1]; if (inB(x, y) && b[I(x, y)] === (white ? 'N' : 'n')) return true; }
    for (i = 0; i < 8; i++) { d = DIRS.K[i]; x = f + d[0]; y = r + d[1]; if (inB(x, y) && b[I(x, y)] === (white ? 'K' : 'k')) return true; }
    var py = white ? r - 1 : r + 1, pp = white ? 'P' : 'p';
    if (inB(f - 1, py) && b[I(f - 1, py)] === pp) return true;
    if (inB(f + 1, py) && b[I(f + 1, py)] === pp) return true;
    for (i = 0; i < 8; i++) {
      d = DIRS.Q[i];
      var straight = d[0] === 0 || d[1] === 0;
      x = f + d[0]; y = r + d[1];
      while (inB(x, y)) {
        var q = b[I(x, y)];
        if (q) {
          if (isW(q) === white) { var u = q.toUpperCase(); if (u === 'Q' || (straight ? u === 'R' : u === 'B')) return true; }
          break;
        }
        x += d[0]; y += d[1];
      }
    }
    return false;
  }
  function pseudo(b, white) {
    var out = [];
    for (var s = 0; s < 64; s++) {
      var p = b[s];
      if (!p || isW(p) !== white) continue;
      var f = s % 8, r = s >> 3, u = p.toUpperCase();
      if (u === 'P') {
        var dy = white ? 1 : -1, y1 = r + dy;
        if (inB(f, y1) && !b[I(f, y1)]) {
          out.push([s, I(f, y1)]);
          if (r === (white ? 1 : 6) && !b[I(f, r + 2 * dy)]) out.push([s, I(f, r + 2 * dy)]);
        }
        for (var dx = -1; dx <= 1; dx += 2) {
          var cx = f + dx;
          if (inB(cx, y1) && b[I(cx, y1)] && isW(b[I(cx, y1)]) !== white) out.push([s, I(cx, y1)]);
        }
        continue;
      }
      var slide = u === 'R' || u === 'B' || u === 'Q';
      for (var k = 0; k < DIRS[u].length; k++) {
        var d = DIRS[u][k], x = f + d[0], y = r + d[1];
        while (inB(x, y)) {
          var t = b[I(x, y)];
          if (t && isW(t) === white) break;
          out.push([s, I(x, y)]);
          if (t || !slide) break;
          x += d[0]; y += d[1];
        }
      }
    }
    return out;
  }
  function applyMove(b, m) {
    var nb = b.slice(), p = nb[m[0]];
    nb[m[1]] = p; nb[m[0]] = '';
    if (p === 'P' && m[1] >> 3 === 7) nb[m[1]] = 'Q';
    if (p === 'p' && m[1] >> 3 === 0) nb[m[1]] = 'q';
    return nb;
  }
  function inCheck(b, white) { var k = b.indexOf(white ? 'K' : 'k'); return attackedBy(b, k % 8, k >> 3, !white); }
  function legalMoves(b, white) { return pseudo(b, white).filter(function (m) { return !inCheck(applyMove(b, m), white); }); }
  function isMated(b, white) { return inCheck(b, white) && legalMoves(b, white).length === 0; }

  // ---------- 生成器：一步殺（后殺／馬殺）----------
  // 隨機擺：黑王靠邊、身邊有自己嘅棋；白方王＋主角（后或馬）＋一粒幫手。
  // 條件：主角剛好得 1 步將死，另外至少 3 步唔係將死（錯選項盡量揀「將軍但唔係將死」）。
  function genMate1(X) {
    var HELP = X === 'Q' ? ['', 'R', 'B', 'N', 'P', ''] : ['Q', 'R', 'B', '', 'Q', 'R'];
    return function (rng) {
      for (var tries = 0; tries < 20000; tries++) {
        var b = emptyBoard(), kf, kr;
        if (rng() < 0.7) { kf = util.int(rng, 0, 7); kr = rng() < 0.8 ? 7 : 6; }
        else { kf = rng() < 0.5 ? 0 : 7; kr = util.int(rng, 2, 7); }
        b[I(kf, kr)] = 'k';
        var extra = 0;
        DIRS.K.forEach(function (d) {
          var x = kf + d[0], y = kr + d[1];
          if (!inB(x, y) || rng() > (X === 'N' ? 0.5 : 0.35)) return;
          if (y >= 1 && y <= 6 && y <= kr && rng() < 0.75) b[I(x, y)] = 'p';
          else if (extra < 2) { b[I(x, y)] = util.pick(rng, ['r', 'b', 'n']); extra++; }
        });
        var put = function (p, ok) {
          for (var t = 0; t < 30; t++) {
            var x = util.int(rng, 0, 7), y = util.int(rng, 0, 7);
            if (b[I(x, y)] || (ok && !ok(x, y))) continue;
            b[I(x, y)] = p; return true;
          }
          return false;
        };
        if (!put('K', function (x, y) { return Math.max(Math.abs(x - kf), Math.abs(y - kr)) >= 2; })) continue;
        if (!put(X)) continue;
        var hp = util.pick(rng, HELP);
        if (hp && !put(hp, hp === 'P' ? function (x, y) { return y >= 1 && y <= 6; } : null)) continue;
        if (inCheck(b, false) || inCheck(b, true)) continue;
        var mine = legalMoves(b, true).filter(function (m) { return b[m[0]] === X; });
        var mates = [], checks = [], quiet = [];
        mine.forEach(function (m) {
          var nb = applyMove(b, m);
          if (!inCheck(nb, false)) quiet.push(m);
          else if (legalMoves(nb, false).length === 0) mates.push(m);
          else checks.push(m);
        });
        if (mates.length !== 1 || checks.length + quiet.length < 3) continue;
        var lbl = function (m) { return NAME[X] + ' → ' + sqName(m[1]) + (b[m[1]] ? '（吃' + NAME[b[m[1]].toUpperCase()] + '）' : ''); };
        var bad = util.shuffle(checks, rng).slice(0, 2);
        bad = bad.concat(util.shuffle(quiet, rng).slice(0, 3 - bad.length));
        if (bad.length < 3) bad = bad.concat(util.shuffle(checks.slice(2), rng).slice(0, 3 - bad.length));
        var key = X === 'Q' ? 'qmate' : 'nmate';
        var good = lbl(mates[0]);
        return {
          prompt: '白先行。白' + NAME[X] + '一步將死黑王，應該行去邊格？',
          visual: boardHtml(toPcs(b)),
          options: [{ t: good, ok: true, k: key }].concat(bad.map(function (m) { return { t: lbl(m), ok: false, k: key }; })),
          expl: good + '：將軍之後，黑王冇格走、冇棋擋得住、亦冇棋吃得到 → 將死。' +
            (X === 'Q' ? '后貼身將軍要有保護（王、馬、象…），否則黑王會吃咗佢。' : '馬嘅將軍擋唔到（佢係跳），黑王身邊嘅格多數被自己嘅棋塞住。') +
            '其他走法：唔係將軍，或者黑王仲可以走、擋或者吃。'
        };
      }
      throw new Error('genMate1: 搵唔到合適局面');
    };
  }

  // ---------- 生成器：王嘅對立（Opposition）----------
  function genOpposition(rng) {
    for (var tries = 0; tries < 2000; tries++) {
      var bf = util.int(rng, 0, 7), br = util.int(rng, 1, 6), wf = util.int(rng, 0, 7), wr = util.int(rng, 0, 7);
      var cheb = function (f, r) { return Math.max(Math.abs(f - bf), Math.abs(r - br)); };
      var opp = function (f, r) { return (f === bf && Math.abs(r - br) === 2) || (r === br && Math.abs(f - bf) === 2); };
      if (cheb(wf, wr) < 2 || opp(wf, wr)) continue;
      var moves = reach('K', wf, wr).filter(function (t) { return cheb(t[0], t[1]) >= 2; });
      var good = moves.filter(function (t) { return opp(t[0], t[1]); });
      var bad = moves.filter(function (t) { return !opp(t[0], t[1]); });
      if (good.length !== 1 || bad.length < 3) continue;
      var g = good[0], mid = g[0] === bf ? sqn(bf, (g[1] + br) / 2) : sqn((g[0] + bf) / 2, br);
      return {
        prompt: '白先行。白王一步行去邊格，可以同黑王形成「直接對立」？',
        visual: boardHtml([{ f: wf, r: wr, p: 'K' }, { f: bf, r: br, p: 'k' }]),
        options: [{ t: '王 → ' + sqn(g[0], g[1]), ok: true, k: 'opposition' }].concat(util.shuffle(bad, rng).slice(0, 3).map(function (t) {
          return { t: '王 → ' + sqn(t[0], t[1]), ok: false, k: 'opposition' };
        })),
        expl: '王 → ' + sqn(g[0], g[1]) + '：同黑王喺同一直線（或橫線），中間隔住 ' + mid + ' 一格＝直接對立。' +
          '輪到黑方行，佢唔可以行入 ' + mid + '（貼住白王），只可以讓路。'
      };
    }
    throw new Error('genOpposition: 搵唔到');
  }

  // ---------- 生成器：方格法則（Rule of the square）----------
  // 兵要行 d 步先升變（起始排可以行兩格，當佢喺第 3 排計）。
  // 方格＝由兵到底線嘅正方形（邊長 d+1 格）。白先行：黑王要已經喺方格入面（到升變格 ≤ d 步）；
  // 黑先行：黑王行一步入到方格就得（≤ d+1 步）。候選格只用兵前面、唔貼住兵嘅格（貼住可以直接吃）。
  function squareInfo(pf, pr, wtm) {
    var d = pr === 1 ? 5 : 7 - pr;
    return { d: d, need: wtm ? d : d + 1, qsq: sqn(pf, 7) };
  }
  function genSquare(rng) {
    for (var tries = 0; tries < 2000; tries++) {
      var pf = util.int(rng, 0, 7), pr = util.int(rng, 1, 5), wtm = rng() < 0.35;
      var S = squareInfo(pf, pr, wtm);
      var inS = [], outS = [];
      for (var x = 0; x < 8; x++) for (var y = 0; y < 8; y++) {
        if (y <= pr || Math.max(Math.abs(x - pf), Math.abs(y - pr)) <= 1) continue; // 只要兵前面、唔貼住兵
        var dist = Math.max(Math.abs(x - pf), 7 - y);
        if (dist === S.need || dist === S.need - 1) inS.push([x, y, dist]);
        else if (dist === S.need + 1 || dist === S.need + 2) outS.push([x, y, dist]);
      }
      if (!inS.length || outS.length < 3) continue;
      var g = util.pick(rng, inS), bad = util.shuffle(outS, rng).slice(0, 3), marks = {};
      [g].concat(bad).forEach(function (t) { marks[sqn(t[0], t[1])] = 'dot'; });
      var ps = sqn(pf, pr), gs = sqn(g[0], g[1]);
      return {
        prompt: (wtm ? '白先行' : '黑先行') + '。白兵喺 ' + ps + '，黑王要追佢。黑王喺邊一格（綠點）先追得到，唔俾兵升變？',
        visual: boardHtml([{ f: pf, r: pr, p: 'P' }], marks),
        options: [{ t: '黑王喺 ' + gs, ok: true, k: 'square' }].concat(bad.map(function (t) {
          return { t: '黑王喺 ' + sqn(t[0], t[1]), ok: false, k: 'square' };
        })),
        expl: '白兵要行 ' + S.d + ' 步先到 ' + S.qsq + (pr === 1 ? '（起始排可以行兩格，當佢喺第 3 排計）' : '') +
          '。由兵畫一個正方形去到底線（' + (S.d + 1) + '×' + (S.d + 1) + ' 格）：' +
          (wtm ? '白先行，黑王要已經喺方格入面' : '黑先行，黑王行一步入到方格就得') +
          '（離升變格 ≤ ' + S.need + ' 步）。' + gs + ' 離 ' + S.qsq + ' 係 ' + g[2] + ' 步，追得到；其他三格要 ' + (S.need + 1) + ' 步或以上，追唔到。'
      };
    }
    throw new Error('genSquare: 搵唔到');
  }

  // ---------- 王兵對王（KPK）完整解：一次過計晒所有局面 ----------
  // W[i]／B[i] ＝ 1：白先行／黑先行，白方贏。i = (wk*64 + bk)*64 + p。
  var KPK = null;
  function cheb2(a, b) { return Math.max(Math.abs(a % 8 - b % 8), Math.abs((a >> 3) - (b >> 3))); }
  function pawnAtt(p, s) { return (s >> 3) === (p >> 3) + 1 && Math.abs(s % 8 - p % 8) === 1; }
  function kpkSolve() {
    if (KPK) return KPK;
    var KM = [];
    for (var s = 0; s < 64; s++) {
      KM.push(reach('K', s % 8, s >> 3).map(function (t) { return I(t[0], t[1]); }));
    }
    // 升變之後（黑先行）：后或車有一樣唔會即刻被吃、又唔係困斃 ＝ 贏
    function lineHit(q, t, wk, straightOnly) {
      var dx = t % 8 - q % 8, dy = (t >> 3) - (q >> 3);
      if (!dx && !dy) return false;
      var line = !dx || !dy, diag = Math.abs(dx) === Math.abs(dy);
      if (!(line || (!straightOnly && diag))) return false;
      var sx = Math.sign(dx), sy = Math.sign(dy), x = q % 8 + sx, y = (q >> 3) + sy;
      while (x !== t % 8 || y !== t >> 3) { if (I(x, y) === wk) return false; x += sx; y += sy; }
      return true;
    }
    function promoWin(wk, bk, q) {
      if (cheb2(bk, q) === 1 && cheb2(wk, q) > 1) return false; // 黑王吃咗新后／車
      for (var k = 0; k < 2; k++) {
        var ro = k === 1, chk = lineHit(q, bk, wk, ro), mv = false;
        for (var j = 0; j < KM[bk].length && !mv; j++) {
          var t = KM[bk][j];
          if (t === q || cheb2(t, wk) <= 1 || lineHit(q, t, wk, ro)) continue;
          mv = true;
        }
        if (mv || chk) return true;
      }
      return false;
    }
    var N = 262144, W = new Uint8Array(N), B = new Uint8Array(N), OK = new Uint8Array(N);
    for (var wk = 0; wk < 64; wk++) for (var bk = 0; bk < 64; bk++) for (var p = 8; p < 56; p++) {
      if (wk !== bk && wk !== p && bk !== p && cheb2(wk, bk) > 1) OK[(wk * 64 + bk) * 64 + p] = 1;
    }
    var changed = true;
    while (changed) {
      changed = false;
      for (var i = 0; i < N; i++) {
        if (!OK[i]) continue;
        p = i & 63; bk = (i >> 6) & 63; wk = i >> 12;
        var j, t;
        if (!W[i] && !pawnAtt(p, bk)) {
          var win = false;
          for (j = 0; j < KM[wk].length && !win; j++) {
            t = KM[wk][j];
            if (t !== p && cheb2(t, bk) > 1 && B[(t * 64 + bk) * 64 + p]) win = true;
          }
          var p1 = p + 8;
          if (!win && p1 !== wk && p1 !== bk) {
            if (p1 >> 3 === 7) win = promoWin(wk, bk, p1);
            else if (B[(wk * 64 + bk) * 64 + p1]) win = true;
            if (!win && p >> 3 === 1 && p + 16 !== wk && p + 16 !== bk && B[(wk * 64 + bk) * 64 + p + 16]) win = true;
          }
          if (win) { W[i] = 1; changed = true; }
        }
        if (!B[i]) {
          var any = false, all = true;
          for (j = 0; j < KM[bk].length && all; j++) {
            t = KM[bk][j];
            if (cheb2(t, wk) <= 1 || pawnAtt(p, t)) continue;
            any = true;
            if (t === p || !W[(wk * 64 + t) * 64 + p]) all = false;
          }
          if ((any && all) || (!any && pawnAtt(p, bk))) { B[i] = 1; changed = true; }
        }
      }
    }
    KPK = { W: W, B: B, OK: OK, KM: KM, promoWin: promoWin };
    return KPK;
  }
  // 白先行嘅所有走法同結果
  function kpkMoves(wk, bk, p) {
    var T = kpkSolve(), out = [];
    T.KM[wk].forEach(function (t) {
      if (t !== p && cheb2(t, bk) > 1) out.push({ t: '王 → ' + sqName(t), win: !!T.B[(t * 64 + bk) * 64 + p], king: t });
    });
    var p1 = p + 8;
    if (p1 !== wk && p1 !== bk) {
      out.push({ t: '兵 → ' + sqName(p1), win: p1 >> 3 === 7 ? T.promoWin(wk, bk, p1) : !!T.B[(wk * 64 + bk) * 64 + p1], pawn: p1 });
      if (p >> 3 === 1 && p + 16 !== wk && p + 16 !== bk) out.push({ t: '兵 → ' + sqName(p + 16), win: !!T.B[(wk * 64 + bk) * 64 + p + 16], pawn: p + 16 });
    }
    return out;
  }
  // 關鍵格（非車線兵）：白王行到其中一格，唔理邊個先行都贏
  function keySquares(p) {
    var f = p % 8, r = p >> 3, out = [], rows = r <= 3 ? [r + 2] : r <= 5 ? [r + 1, r + 2] : [r, r + 1];
    rows.forEach(function (y) {
      for (var x = f - 1; x <= f + 1; x++) if (inB(x, y) && !(y === r && x === f)) out.push(I(x, y));
    });
    return out;
  }
  function genKPK(rng) {
    var T = kpkSolve();
    for (var tries = 0; tries < 5000; tries++) {
      var pf = util.int(rng, 1, 6), pr = util.int(rng, 1, 4);
      var wf = pf + util.int(rng, -2, 2), wr = pr + util.int(rng, -1, 2), bf = pf + util.int(rng, -2, 2), br = pr + util.int(rng, 2, 4);
      if (!inB(wf, wr) || !inB(bf, br)) continue;
      var p = I(pf, pr), wk = I(wf, wr), bk = I(bf, br);
      if (!T.OK[(wk * 64 + bk) * 64 + p] || pawnAtt(p, bk)) continue;
      var mv = kpkMoves(wk, bk, p), wins = mv.filter(function (m) { return m.win; }), rest = mv.filter(function (m) { return !m.win; });
      if (wins.length !== 1 || rest.length < 3) continue;
      var g = wins[0], why;
      if (g.king != null && ((g.king % 8 === bk % 8 && Math.abs((g.king >> 3) - (bk >> 3)) === 2) || ((g.king >> 3) === (bk >> 3) && Math.abs(g.king % 8 - bk % 8) === 2))) {
        why = '白王同黑王形成直接對立（中間隔一格），輪到黑方要讓路，白王就可以行到關鍵格。';
      } else if (g.king != null && keySquares(p).indexOf(g.king) >= 0) {
        why = '白王行到「關鍵格」（兵前面兩排嘅格），之後唔理點行都護送到兵升變。';
      } else if (g.king != null && (g.king >> 3) > pr && (g.king >> 3) > (wk >> 3)) {
        why = '白王向前行到兵前面搶位（王行先、兵跟後），黑王就擋唔住。';
      } else if (g.pawn != null) {
        why = '呢度要推兵：白王已經控制好前面嘅格，推兵先保持對立或者令黑王追唔切。';
      } else {
        why = '呢步可以搶到更好嘅王位，之後取得對立或者佔關鍵格。';
      }
      return {
        prompt: '王兵殘局，白先行。邊一步先可以贏？（其他走法黑方都守得住，變和棋）',
        visual: boardHtml([{ f: pf, r: pr, p: 'P' }, { f: wf, r: wr, p: 'K' }, { f: bf, r: br, p: 'k' }]),
        options: [{ t: g.t, ok: true, k: 'kpk' }].concat(util.shuffle(rest, rng).slice(0, 3).map(function (m) { return { t: m.t, ok: false, k: 'kpk' }; })),
        expl: g.t + '：' + why + '（答案由完整殘局表計出：其他走法黑方都可以和棋。）'
      };
    }
    throw new Error('genKPK: 搵唔到');
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
      w: ['后 5、車 9、象 3、馬 3、兵 1', '后 9、車 3、象 5、馬 5、兵 1', '全部棋子價值一樣'], e: '用價值判斷交換值唔值得，例如用馬換車係賺 2 分。' },
    // 17–21：殘局、一步殺
    { k: 'opposition', q: '殘局入面「直接對立」係指？', c: '兩個王喺同一直線或橫線，中間隔一格；輪到對方行，佢就要讓路',
      w: ['兩個王喺同一斜線，貼住對方', '兩個王喺棋盤兩邊角落', '王同兵喺同一直線'], e: '王唔可以貼住王，所以「對立」時先要行嗰方一定要退或者橫行讓路。' },
    { k: 'square', q: '「方格法則」用嚟判斷乜嘢？', c: '冇其他棋幫手時，對方王追唔追到你嘅兵（唔俾佢升變）',
      w: ['馬幾多步可以去到某格', '象係咪控制到一條斜線', '王車易位合唔合法'], e: '由兵畫正方形去到底線：對方王（輪到佢行）喺方格入面就追得到。' },
    { k: 'kpk', q: '王兵對王，白方想贏，最重要係？', c: '白王行喺兵前面、搶佔關鍵格，用對立逼黑王讓路',
      w: ['白王留喺兵後面，淨係推兵', '一開始就推兵，越快越好', '白王越遠離兵越好'], e: '王行先、兵跟後：王喺兵前面兩格（關鍵格）通常就贏；兵喺 a、h 線多數和棋。' },
    { k: 'qmate', q: '用后貼身將軍黑王（例如「死亡之吻」），點先算將死？', c: '后要有保護（王或其他棋），黑王吃唔到；而且黑王旁邊冇格逃',
      w: ['后貼住黑王就一定係將死', '后同黑王隔得越遠越好', '后將軍一定要喺第 8 排'], e: '無保護嘅后一貼身就會被黑王吃，要有王或者其他棋喺後面撐住。' },
    { k: 'nmate', q: '「悶殺」（Smothered mate）係乜嘢？', c: '黑王被自己嘅棋包圍冇格走，馬一將軍就擋唔到、走唔到 → 將死',
      w: ['用兩粒車輪流將軍', '王喺中間被后同車夾死', '兵升變做馬之後即刻贏'], e: '經典例子：黑王 h8、車 g8、兵 g7 h7，白馬跳去 f7 將死。' }
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
      fail: '過咗一步先記起，已經唔得', tip: '你嘅兵要喺第 5 排（白）先有機會。', gens: [genConcept(13)] },
    qmate: { name: '后殺（一步殺）', cat: '一步殺', mn: '后貼身將軍＋有保護 → 將死',
      features: ['后可以控制好多格，黑王身邊嘅格一次封晒', '貼身將軍要有王或者其他棋保護', '先睇黑王有邊幾格可以逃'],
      principle: '將軍 → 再數逃生格、擋、吃三條路', fail: '后貼身但冇保護，被黑王吃咗',
      tip: '每次先數黑王身邊 8 格，再搵一步可以全部封住嘅將軍。', gens: [genMate1('Q'), genMate1('Q'), genConcept(20)] },
    nmate: { name: '馬殺（一步殺）', cat: '一步殺', mn: '黑王被自己嘅棋塞住 → 馬一將就死',
      features: ['馬嘅將軍擋唔到（佢係跳）', '黑王身邊塞滿自己嘅棋最危險（悶殺）', '通常要其他棋封住剩低嘅格'],
      principle: '馬將軍只可以靠走王或者吃馬解決', fail: '淨係睇住后同車，冇留意馬跳嘅格',
      tip: '見到黑王身邊塞滿自己嘅棋，就諗下馬可以跳去邊度將軍。', gens: [genMate1('N'), genMate1('N'), genConcept(21)] },
    opposition: { name: '王嘅對立（Opposition）', cat: '殘局', mn: '兩王同一線，中間隔一格 → 先行嗰方要讓路',
      features: ['同一直線或橫線，中間隔一格', '輪到對方行先叫「取得對立」', '王兵殘局嘅基本功'],
      principle: '王唔可以貼住王，所以對立時對方只可以退或者橫行', fail: '自己行入對立但輪到自己行（失咗對立）',
      tip: '數格：兩王之間隔單數格、輪到對方行，就係你有對立。', gens: [genOpposition, genOpposition, genConcept(17)] },
    square: { name: '方格法則（Rule of the square）', cat: '殘局', mn: '由兵畫正方形到底線：王喺入面就追得到',
      features: ['方格邊長＝兵升變要行嘅步數', '兵喺起始排：當佢喺第 3 排計（可以行兩格）', '白先行：黑王要已經喺方格入面；黑先行：行一步入到方格就得'],
      principle: '王同兵一齊數步數，唔使逐步計', fail: '忘記兵喺起始排可以行兩格',
      tip: '唔肯定就數：黑王到升變格要幾多步，同兵要幾多步比較。', gens: [genSquare, genSquare, genConcept(18)] },
    kpk: { name: '王兵殘局（王兵對王）', cat: '殘局', mn: '王行先、兵跟後；搶關鍵格、用對立',
      features: ['白王喺兵前面兩格（關鍵格）通常就贏', '用對立逼黑王讓路', '兵喺 a、h 線多數和棋'],
      principle: '黑王守住兵前面就和；白王搶到前面就贏', fail: '一開始就推兵，黑王擋喺前面變和棋',
      tip: '答案由完整殘局表計出，唔係估：多做幾題就會睇到「對立」出現好多次。', gens: [genKPK, genKPK, genConcept(19)] }
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
    { id: 'C12', name: '后殺同馬殺', desc: '一步將死：后貼身、悶殺', items: ['qmate', 'nmate'], n: 8 },
    { id: 'C13', name: '殘局：對立同方格', desc: '王嘅對立、方格法則', items: ['opposition', 'square'], n: 8 },
    { id: 'C14', name: '王兵殘局', desc: '搵唯一贏棋嘅一步', items: ['kpk'], n: 8 },
    { id: 'C15', name: '畢業考', desc: '全部混合', items: null, n: 15 }
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
    makeQ: makeQ,
    _chess: { kpkSolve: kpkSolve, kpkMoves: kpkMoves, keySquares: keySquares, I: I }
  };
  LEVELS[LEVELS.length - 1].items = SITE.order;
  SITE.order.forEach(function (k) { if (DIAG[k]) ITEMS[k].diagram = DIAG[k]; });

  if (typeof module !== 'undefined' && module.exports) module.exports = SITE;
  else root.SITE = SITE;
})(typeof window !== 'undefined' ? window : globalThis);
