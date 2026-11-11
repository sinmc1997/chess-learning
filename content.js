/* content.js — 國際象棋：項目、題目生成器。純邏輯、無 DOM，可以喺 Node 直接測試。
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
  function boardHtml(pcs) {
    var h = '<div class="board">';
    for (var r = 7; r >= 0; r--) {
      for (var f = 0; f < 8; f++) {
        var p = null;
        for (var i = 0; i < pcs.length; i++) if (pcs[i].f === f && pcs[i].r === r) { p = pcs[i].p; break; }
        var coord = (f === 0 ? '<span class="rk">' + (r + 1) + '</span>' : '') + (r === 0 ? '<span class="fl">' + FILES[f] + '</span>' : '');
        h += '<div class="sq ' + ((f + r) % 2 === 0 ? 'd' : 'l') + '" title="' + sqn(f, r) + '">' + coord + (p ? SYM[p] : '') + '</div>';
      }
    }
    return h + '</div>';
  }

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
      e: '易位係一步完成「王靠邊」＋「車入中」，但條件要全部符合。' }
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
    fork: { name: '叉（Fork）', cat: '戰術', mn: '一粒棋 → 同時攻擊兩個目標',
      features: ['一粒棋攻擊兩個目標', '最常用馬或兵', '對方通常只可以救一個'], principle: '對方救咗一個，你就吃另一個',
      fail: '叉嘅格可以被對方一吃就掉', tip: '先睇對方棋子之間嘅位置關係。', gens: [genFork, genConcept(6)] },
    pin: { name: '牽制（Pin）', cat: '戰術', mn: '擋住更重要嘅棋 → 郁唔得',
      features: ['對方棋擋住後面重要嘅棋（王或后）', '喺直線或斜線上', '郁咗會令後面嗰粒受攻擊'],
      principle: '對方唔可以郁，因為會令後面嘅王或后被攻擊', fail: '以為被牽制嘅棋一定輸',
      tip: '絕對牽制（後面係王）最難解。', gens: [genConcept(7)] },
    backrank: { name: '底線將死（Back-rank）', cat: '戰術', mn: '王喺底線、前面被自己嘅兵封住',
      features: ['王喺第 1 或第 8 排', '前面嘅兵冇郁', '車或后從底線將軍'], principle: '王冇格走',
      fail: '忘記留一個逃生格', tip: '兵走一步（例如 h3）就留咗逃生格。', gens: [genConcept(8)] },
    mate: { name: '將死（Checkmate）', cat: '基本概念', mn: '王被將，而且冇任何方法解決',
      features: ['王正受攻擊（將軍）', '擋、吃、逃三樣都做唔到'], principle: '將死即係贏咗一局',
      fail: '以為被將就輸', tip: '將軍唔等於將死。', gens: [genConcept(9)] },
    principle: { name: '開局原則', cat: '基本概念', mn: '中心、出子、王車易位',
      features: ['控制中心（e4 d4 e5 d5）', '出馬出象，早王車易位', '唔好多次郁同一粒棋'],
      principle: '發展子力通常比搶兵更重要', fail: '早出后搶兵', tip: '開局先顧發展，唔好貪吃。', gens: [genConcept(10)] },
    castle: { name: '王車易位（Castling）', cat: '特殊規則', mn: '王跳兩格，車跳到王旁',
      features: ['王同車都未郁過', '中間格冇棋', '王經過同落嘅格唔受攻擊', '王唔可以喺將軍中'],
      principle: '令王早啲安全', fail: '將軍中易位（唔合法）', tip: '易位後王喺角落，安全度大增。', gens: [genConcept(11)] }
  };

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
    title: '國際象棋學習',
    subtitle: '練方法，唔係背答案：每次題目都隨機生成',
    util: util,
    items: ITEMS,
    order: Object.keys(ITEMS),
    labels: {},
    makeQ: makeQ
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SITE;
  else root.SITE = SITE;
})(typeof window !== 'undefined' ? window : globalThis);
