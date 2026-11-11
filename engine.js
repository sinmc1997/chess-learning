/* engine.js — 通用學習引擎（兩個網站共用，內容由 content.js 提供）
   SM-2 間隔重複、Elo 掌握度、智能揀題、混淆矩陣、錯題本、學習路徑、備份還原。
   全部資料存 localStorage，唔使後端。 */
(function () {
  'use strict';
  var SITE = window.SITE, DAY = 86400000, MAXQ = 10;
  var app = document.getElementById('app');
  var KEY = SITE.id + ':state:v1';
  var R = null; // 目前練習回合

  // ---------- 儲存 ----------
  function fresh() {
    return { cards: {}, rating: {}, conf: {}, mistakes: [], learned: {}, hist: [], days: [], levels: {}, timed: {}, saved: '' };
  }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      return Object.assign(fresh(), raw ? JSON.parse(raw) : {});
    } catch (e) { return fresh(); }
  }
  var S = load();
  function save() {
    S.saved = new Date().toISOString();
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 私隱模式等情況：照常運作 */ }
  }

  // ---------- 小工具 ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ymd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function today() { return ymd(new Date()); }
  function touchDay() { var d = today(); if (S.days.indexOf(d) < 0) S.days.push(d); }
  function streak() {
    var d = new Date(), n = 0;
    if (S.days.indexOf(today()) < 0) d.setDate(d.getDate() - 1);
    while (S.days.indexOf(ymd(d)) >= 0) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function label(k) {
    return (SITE.items[k] && SITE.items[k].name) || SITE.labels[k] || k;
  }
  function itemOf(k) {
    if (SITE.items[k]) return k;
    return k.indexOf('MP:') === 0 ? 'mp' : null;
  }
  function attempts(k) { return S.hist.filter(function (h) { return h.key === k; }); }
  function acc(list) {
    return list.length ? list.filter(function (h) { return h.ok; }).length / list.length : 0;
  }
  function pct(v) { return Math.round(v * 100) + '%'; }
  function bar(v) {
    return '<span class="mbar"><i style="width:' + Math.round(v * 100) + '%"></i></span> ' + pct(v);
  }

  // ---------- 掌握度 / 間隔重複 ----------
  function rating(k) { return S.rating[k] == null ? 1000 : S.rating[k]; }
  function mastery(k) { return Math.max(0, Math.min(1, (rating(k) - 850) / 500)); }
  function elo(k, ok) {
    var r = rating(k), e = 1 / (1 + Math.pow(10, (1000 - r) / 400));
    S.rating[k] = r + 32 * ((ok ? 1 : 0) - e);
  }
  // q：0–5（<3 = 答錯，10 分鐘後再出；>=3 按 SM-2 拉長間隔）
  function review(k, q) {
    var c = S.cards[k] || { reps: 0, iv: 0, ef: 2.5, due: 0, lapses: 0 };
    if (q < 3) { c.reps = 0; c.iv = 0; c.lapses++; c.due = Date.now() + 10 * 60000; }
    else {
      c.reps++;
      c.iv = c.reps === 1 ? 1 : c.reps === 2 ? 3 : Math.round(c.iv * c.ef);
      c.due = Date.now() + c.iv * DAY;
    }
    c.ef = Math.max(1.3, c.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
    S.cards[k] = c;
  }
  function isDue(k) { var c = S.cards[k]; return !!c && c.due <= Date.now(); }

  // 智能揀項目：到期 > 剛答錯 > 未學 > 弱項；同上一題同項目重扣分（交錯練習）
  function pickKey(prev, pool) {
    var best = null, bs = -1e9;
    (pool || SITE.order).forEach(function (k) {
      var c = S.cards[k], s = 0;
      if (c && c.due <= Date.now()) s += 100;
      if (c && c.reps === 0 && c.lapses > 0 && c.due > Date.now()) s += 60;
      if (!S.learned[k]) s += 45;
      s += (1 - mastery(k)) * 50;
      s += Math.random() * 15;
      if (prev) {
        if (k === prev) s -= 1000;
        else if (SITE.items[k] && SITE.items[prev] && SITE.items[k].cat === SITE.items[prev].cat) s -= 30;
      }
      if (s > bs) { bs = s; best = k; }
    });
    return best;
  }

  // ---------- 練習回合 ----------
  function startQuiz(n, forceKey, pool, level) {
    var qs = [], prev = null;
    for (var i = 0; i < n; i++) {
      var k = forceKey || pickKey(prev, pool);
      prev = k;
      qs.push(SITE.makeQ(k, Math.floor(Math.random() * 1e9)));
    }
    R = { qs: qs, n: n, i: 0, sel: null, answered: false, res: [], level: level || null };
    render();
  }

  // ---------- 關卡 ----------
  function levelOf(id) { return (SITE.levels || []).filter(function (L) { return L.id === id; })[0]; }
  function levelOpen(i) { return i === 0 || ((S.levels[SITE.levels[i - 1].id] || {}).stars || 0) > 0; }
  function starText(n) { return '★★★'.slice(0, n) + '☆☆☆'.slice(0, 3 - n); }
  function startLevel(id) {
    var L = levelOf(id);
    if (!L) return home();
    startQuiz(L.n || 8, null, L.items, L.id);
  }
  function levelsView() {
    var h = '<div class="bar"><a href="#" class="lnk" data-act="home">← 主頁</a></div><h2>🎮 關卡挑戰</h2>' +
      '<p class="muted">每關答啱 80% 過關（★），90% ★★，全啱 ★★★。過咗先開下一關。關卡入面答錯唔會即時重出，似考試。</p><div class="grid">';
    SITE.levels.forEach(function (L, i) {
      var rec = S.levels[L.id], open = levelOpen(i);
      h += '<button class="tile' + (open ? '' : ' locked') + '"' + (open ? ' data-act="level" data-arg="' + L.id + '"' : ' disabled') + '>' +
        '<b>' + (open ? '' : '🔒 ') + '第 ' + (i + 1) + ' 關：' + esc(L.name) + '</b><span>' + esc(L.desc) + '（' + (L.n || 8) + ' 題）</span>' +
        '<span class="stars">' + starText(rec ? rec.stars : 0) + (rec ? '　最佳 ' + pct(rec.best) : '') + '</span></button>';
    });
    view(h + '</div>');
  }
  function levelDone() {
    var L = levelOf(R.level), res = R.res;
    var ok = res.filter(function (r) { return r.ok; }).length, n = res.length, p = n ? ok / n : 0;
    var stars = p >= 1 ? 3 : p >= 0.9 ? 2 : p >= (L.pass || 0.8) ? 1 : 0;
    var rec = S.levels[L.id] || { best: 0, stars: 0, tries: 0 };
    rec.tries++; if (p > rec.best) rec.best = p; if (stars > rec.stars) rec.stars = stars;
    S.levels[L.id] = rec; save();
    var idx = SITE.levels.indexOf(L), nx = SITE.levels[idx + 1];
    var h = '<div class="bar"><a href="#" class="lnk" data-act="levels">← 關卡地圖</a></div><div class="card">';
    h += '<h2>第 ' + (idx + 1) + ' 關：' + esc(L.name) + '</h2>';
    h += '<p class="bigstars">' + starText(stars) + '</p>';
    h += '<p><b>' + ok + ' / ' + n + '（' + pct(p) + '）</b>　' + (stars ? '🎉 過關！' : '未過關，要答啱 ' + pct(L.pass || 0.8) + '。') + '</p>';
    res.forEach(function (r, i) {
      if (!r.ok) h += '<div class="rrow bad">✘ 第 ' + (i + 1) + ' 題 · ' + esc(label(r.key)) + '<br><small>' + esc(r.prompt) + '</small><br>你答：' + esc(r.chosen) + '　正解：' + esc(r.correct) + '</div>';
    });
    h += '<div class="row">' + (stars && nx ? '<button class="primary" data-act="level" data-arg="' + nx.id + '">下一關 →</button>' : '') +
      '<button' + (stars ? '' : ' class="primary"') + ' data-act="level" data-arg="' + L.id + '">再挑戰</button>' +
      '<button data-act="levels">關卡地圖</button></div></div>';
    R = null;
    view(h);
  }
  function startReplay(m) {
    if (!m) return home();
    R = { qs: [SITE.makeQ(m.key, m.seed)], n: 1, i: 0, sel: null, answered: false, res: [], replay: true };
    render();
  }
  function choose(i) { if (R && !R.answered) { R.sel = i; render(); } }
  function submit() {
    if (!R || R.answered) return;
    var q = R.qs[R.i], opt, cor, guess = false, ok;
    if (q.input) {
      var el = document.getElementById('ans'), val = el ? String(el.value || '').trim() : '';
      if (!val) { toast('未打字'); return; }
      var res = q.check(val) || {};
      ok = !!res.ok;
      opt = { t: val, ok: ok, k: res.k || q.key };
      cor = { t: q.answerText, ok: true, k: q.key };
      R.typed = val; R.note = res.note || '';
    } else {
      if (R.sel == null) return;
      opt = q.options[R.sel];
      var g = document.getElementById('guess');
      guess = !!(g && g.checked); ok = !!opt.ok;
      cor = q.options.filter(function (o) { return o.ok; })[0];
    }
    R.ms = Date.now() - (R.t0 || Date.now());
    R.answered = true; R.ok = ok;
    touchDay();
    S.learned[q.key] = true;
    S.hist.push({ key: q.key, ok: ok, guess: guess, t: Date.now(), ms: R.ms, unit: q.unit || 0 });
    elo(q.key, ok);
    review(q.key, ok ? (guess ? 3 : 4) : 1);
    if (!ok) {
      if (cor.k !== opt.k) {
        var pk = [cor.k, opt.k].sort().join('|');
        S.conf[pk] = (S.conf[pk] || 0) + 1;
      }
      if (!R.replay) {
        R.lastM = { key: q.key, seed: q.seed, t: Date.now(), chosen: opt.t, correct: cor.t, expl: q.expl, self: '' };
        S.mistakes.push(R.lastM);
        // 即時重溫：同一項目換一題，隔 2 題再出（每輪最多加 3 題）
        if (!R.level && (R.extra || 0) < 3) {
          R.extra = (R.extra || 0) + 1;
          R.qs.splice(Math.min(R.i + 3, R.qs.length), 0, SITE.makeQ(q.key, Math.floor(Math.random() * 1e9)));
          R.n = R.qs.length;
          R.requeued = true;
        }
      }
    }
    R.res.push({ key: q.key, ok: ok, prompt: q.prompt, chosen: opt.t, correct: cor.t, expl: q.expl });
    save();
    render();
  }
  function next() { if (R) { R.i++; R.sel = null; R.answered = false; R.lastM = null; R.requeued = false; R.t0 = 0; R.typed = ''; R.note = ''; render(); } }

  // ---------- 計時挑戰（content 有 SITE.timed 先出現） ----------
  // SITE.timed = { title, desc, seconds, modes:[{id,name,desc}], makeQ(mode, seed) → 打字題（有 word、answerText、check） }
  var T = null, tTimer = null;
  function timedRec(id) { S.timed = S.timed || {}; return S.timed[id] || { best: 0, tries: 0, hist: [] }; }
  function timedMenu() {
    var TD = SITE.timed;
    var h = '<div class="bar"><a href="#" class="lnk" data-act="home">← 主頁</a></div><h2>' + esc(TD.title) + '</h2>' +
      '<p class="muted">' + TD.seconds + ' 秒內打得幾多個就幾多個。打完撳 Enter；打錯會顯示正解，直接跳去下一個。</p><div class="grid">';
    TD.modes.forEach(function (m) {
      var r = timedRec(m.id);
      h += '<button class="tile" data-act="timedGo" data-arg="' + m.id + '"><b>' + esc(m.name) + '</b><span>' + esc(m.desc) + '</span>' +
        '<span class="stars">最佳 ' + r.best + ' 個' + (r.tries ? '　玩咗 ' + r.tries + ' 次' : '') + '</span></button>';
    });
    h += '</div>';
    var all = [];
    TD.modes.forEach(function (m) { timedRec(m.id).hist.forEach(function (x) { all.push({ m: m.name, x: x }); }); });
    all.sort(function (a, b) { return b.x.t - a.x.t; });
    if (all.length) {
      h += '<h3>最近成績</h3><div class="scroll"><table><tr><th>日期</th><th>模式</th><th>啱</th><th>錯</th><th>每分鐘</th></tr>' +
        all.slice(0, 10).map(function (a) {
          return '<tr><td>' + new Date(a.x.t).toLocaleDateString() + '</td><td>' + esc(a.m) + '</td><td>' + a.x.ok + '</td><td>' + a.x.bad +
            '</td><td>' + (a.x.cpm != null ? a.x.cpm + ' 字' : '—') + '</td></tr>';
        }).join('') + '</table></div>';
    }
    view(h);
  }
  function stopTimer() { if (tTimer) { clearInterval(tTimer); tTimer = null; } }
  function timedStart(mode) {
    var TD = SITE.timed;
    stopTimer();
    R = null;
    T = { mode: mode, end: Date.now() + TD.seconds * 1000, t0: Date.now(), ok: 0, bad: 0, chars: 0, done: [], flash: '', last: -1 };
    timedNext();
    tTimer = setInterval(timedTick, 200);
  }
  function timedNext() {
    var q;
    for (var i = 0; i < 5; i++) { q = SITE.timed.makeQ(T.mode, Math.floor(Math.random() * 1e9)); if (q.word !== T.lastWord) break; }
    T.q = q; T.lastWord = q.word;
    timedRender();
  }
  function timedLeft() { return Math.max(0, Math.ceil((T.end - Date.now()) / 1000)); }
  function timedTick() {
    if (!T) return stopTimer();
    if (Date.now() >= T.end) return timedFinish();
    var el = document.getElementById('tleft');
    if (el) el.textContent = timedLeft();
  }
  function timedRender() {
    var q = T.q;
    var h = '<div class="bar"><span class="pill">' + esc(SITE.timed.title) + '</span><span>✔ ' + T.ok + '　✘ ' + T.bad + '</span>' +
      '<a href="#" class="lnk" data-act="home">× 離開</a></div>';
    h += '<div class="card"><div class="timer">⏱ <b id="tleft">' + timedLeft() + '</b> 秒</div>';
    h += '<div class="prompt">' + esc(q.prompt) + '</div>';
    if (q.visual) h += '<div class="visual">' + q.visual + '</div>';
    h += '<div class="row"><input id="ans" class="ans" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"' +
      ' lang="' + (q.lang || 'en') + '" placeholder="' + esc(q.placeholder || '') + '"></div>' +
      '<div class="row"><button class="primary" data-act="timedSubmit">提交（Enter）</button><button data-act="timedEnd">提早完成</button></div>';
    if (T.flash) h += '<div class="badbox">' + T.flash + '</div>';
    h += '</div>';
    view(h);
    var a = document.getElementById('ans'); if (a && a.focus) a.focus();
  }
  function timedSubmit() {
    if (!T) return;
    if (Date.now() >= T.end) return timedFinish();
    var el = document.getElementById('ans'), val = el ? String(el.value || '').trim() : '';
    if (!val) return;
    var q = T.q, res = q.check(val) || {};
    T.done.push({ word: q.word, ans: q.answerText, typed: val, ok: !!res.ok });
    if (res.ok) { T.ok++; T.chars += q.unit || q.word.length; T.flash = ''; }
    else { T.bad++; T.flash = '✘ 「' + esc(q.word) + '」應該係 <code>' + esc(q.answerText) + '</code>（你打咗 <code>' + esc(val) + '</code>）'; }
    timedNext();
  }
  function timedFinish() {
    if (!T) return;
    stopTimer();
    var TD = SITE.timed, m = TD.modes.filter(function (x) { return x.id === T.mode; })[0] || { name: T.mode };
    var used = Math.min(TD.seconds * 1000, Math.max(1000, Date.now() - T.t0));
    var cpm = Math.round(T.chars * 60000 / used);
    var r = timedRec(T.mode), isBest = T.ok > r.best;
    r.tries++; if (isBest) r.best = T.ok;
    r.hist.push({ t: Date.now(), ok: T.ok, bad: T.bad, cpm: cpm });
    if (r.hist.length > 30) r.hist = r.hist.slice(-30);
    S.timed[T.mode] = r; touchDay(); save();
    var n = T.ok + T.bad;
    var h = '<div class="bar"><a href="#" class="lnk" data-act="timed">← ' + esc(TD.title) + '</a></div><div class="card">';
    h += '<h2>' + esc(m.name) + '：' + T.ok + ' 個</h2>';
    h += '<p>' + (isBest ? '🎉 新紀錄！' : '最佳紀錄 ' + r.best + ' 個。') + '　準確率 ' + (n ? pct(T.ok / n) : '—') +
      '　約 ' + cpm + ' 字／分鐘（只計答啱）' + (used < TD.seconds * 1000 - 500 ? '　（提早完成，用咗 ' + Math.round(used / 1000) + ' 秒）' : '') + '</p>';
    T.done.forEach(function (d) {
      if (!d.ok) h += '<div class="rrow bad">✘ ' + esc(d.word) + '　你打：<code>' + esc(d.typed) + '</code>　正解：<code>' + esc(d.ans) + '</code></div>';
    });
    var okList = T.done.filter(function (d) { return d.ok; }).map(function (d) { return esc(d.word); });
    if (okList.length) h += '<p class="muted">✔ ' + okList.join('、') + '</p>';
    h += '<div class="row"><button class="primary" data-act="timedGo" data-arg="' + T.mode + '">再嚟一次</button>' +
      '<button data-act="timed">揀模式</button><button data-act="home">返主頁</button></div></div>';
    T = null;
    view(h);
  }

  // ---------- 讀音（只喺裝置有粵語語音時顯示） ----------
  function hkVoice() {
    if (!('speechSynthesis' in window)) return null;
    var vs = window.speechSynthesis.getVoices() || [];
    for (var i = 0; i < vs.length; i++) if (/^(zh[-_]HK|yue)/i.test(vs[i].lang)) return vs[i];
    return null;
  }
  function speak(text) {
    var v = hkVoice();
    if (!v || !text) return;
    var u = new SpeechSynthesisUtterance(text);
    u.voice = v; u.lang = v.lang; u.rate = 0.8;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }
  if ('speechSynthesis' in window) {
    // 打字題唔重畫（會清走打緊嘅字）
    window.speechSynthesis.onvoiceschanged = function () { if (R && R.i < R.qs.length && !R.qs[R.i].input) render(); };
  }

  function render() {
    if (!R) return home();
    if (R.i >= R.qs.length) return roundDone();
    var q = R.qs[R.i], it = SITE.items[q.key] || { name: label(q.key) };
    var h = '<div class="bar"><span class="pill">' + (R.replay ? '重做錯題' : '練習') + '</span>' +
      '<span>第 ' + (R.i + 1) + ' / ' + R.n + ' 題</span><span class="pill">' + esc(it.cat || '') + '</span>' +
      '<a href="#" class="lnk" data-act="home">× 離開</a></div>';
    h += '<div class="card"><div class="prompt">' + esc(q.prompt) + '</div>';
    if (q.visual) h += '<div class="visual">' + q.visual + '</div>';
    if (q.say && hkVoice()) h += '<div class="row center"><button data-act="say" data-arg="' + esc(q.say) + '">🔊 讀出嚟</button></div>';
    if (q.input) {
      // 打字題：自己打答案（生成效應）
      if (!R.answered) {
        h += '<div class="row"><input id="ans" class="ans" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"' +
          ' lang="' + (q.lang || 'en') + '" inputmode="' + (q.inputmode || 'text') + '" placeholder="' + esc(q.placeholder || '') + '"></div>' +
          '<div class="row"><button class="primary" data-act="submit">提交（Enter）</button></div>';
      }
    } else {
      h += '<div class="opts">';
      q.options.forEach(function (o, i) {
        var cls = 'opt';
        if (R.answered) { if (o.ok) cls += ' good'; else if (i === R.sel) cls += ' bad'; }
        else if (i === R.sel) cls += ' sel';
        h += '<button class="' + cls + '" data-act="choose" data-arg="' + i + '"' + (R.answered ? ' disabled' : '') +
          '><kbd>' + (i + 1) + '</kbd> ' + esc(o.t) + '</button>';
      });
      h += '</div>';
      if (!R.answered) {
        h += '<div class="row"><label class="guessbox"><input type="checkbox" id="guess"> 🎲 估（唔肯定）</label>' +
          '<button class="primary" data-act="submit"' + (R.sel == null ? ' disabled' : '') + '>提交</button></div>';
      }
    }
    if (R.answered) {
      var fb = '';
      if (q.input) fb += '你打：<code>' + esc(R.typed) + '</code>　正解：<code>' + esc(q.answerText) + '</code>' + (R.note ? '<br>' + esc(R.note) : '') + '<br>';
      if (q.unit && R.ms) fb += '⏱ ' + (R.ms / 1000).toFixed(1) + ' 秒（約 ' + Math.round(q.unit * 60000 / R.ms) + ' 字／分鐘）<br>';
      h += '<div class="' + (R.ok ? 'okbox' : 'badbox') + '"><b>' + (R.ok ? '✔ 啱' : '✘ 錯') + '</b><br>' + fb + esc(q.expl) +
        (R.requeued ? '<br><small>🔁 同一課會喺 2 題之後換一題再考你。</small>' : '') + '</div>';
      if (!R.ok && R.lastM) {
        h += '<label class="self">用自己嘅話寫點解錯（存入錯題本）<textarea id="self" rows="2">' + esc(R.lastM.self) + '</textarea></label>' +
          '<div class="row"><button data-act="saveSelf">保存解釋</button></div>';
      }
      h += '<div class="row"><button class="primary" data-act="next">' + (R.i + 1 < R.n ? '下一題 →' : '完成') + '</button></div>';
    }
    h += '</div>';
    if (!R.answered && !R.t0) R.t0 = Date.now();
    view(h);
    if (q.input && !R.answered) { var a = document.getElementById('ans'); if (a && a.focus) a.focus(); }
  }

  function advice(p) {
    if (p >= 0.8) return '做得好！可以去學下一課，或者揀更多題目練。';
    if (p >= 0.5) return '繼續練。睇下錯題本入面重複出現嘅混淆。';
    return '錯咗幾題係正常。去錯題本睇原因，寫低自己嘅解釋，再重做。';
  }
  function roundDone() {
    if (R.level) return levelDone();
    var res = R.res, ok = res.filter(function (r) { return r.ok; }).length, n = res.length;
    var h = '<div class="bar"><a href="#" class="lnk" data-act="home">← 主頁</a></div>';
    h += '<div class="card"><h2>本輪：' + ok + ' / ' + n + '（' + pct(n ? ok / n : 0) + '）</h2><p>' + advice(n ? ok / n : 0) + '</p>';
    res.forEach(function (r, i) {
      h += '<div class="rrow ' + (r.ok ? 'good' : 'bad') + '">' + (r.ok ? '✔' : '✘') + ' 第 ' + (i + 1) + ' 題 · ' +
        esc(label(r.key)) + '<br><small>' + esc(r.prompt) + '</small>' +
        (r.ok ? '' : '<br>你揀：' + esc(r.chosen) + '　正解：' + esc(r.correct)) + '</div>';
    });
    h += '<div class="row"><button class="primary" data-act="quiz">再來一輪</button><button data-act="home">返主頁</button></div></div>';
    R = null;
    view(h);
  }

  // ---------- 學習頁 ----------
  function learnView(k) {
    var it = SITE.items[k];
    if (!it) return home();
    var demo = SITE.makeQ(k, 7);
    S.learned[k] = true; save();
    var h = '<div class="bar"><a href="#" class="lnk" data-act="home">← 主頁</a></div>';
    h += '<div class="card"><h2>' + esc(it.name) + '</h2><span class="pill">' + esc(it.cat) + '</span>';
    h += '<p class="mn">💡 ' + esc(it.mn) + '</p>' + (it.diagram ? '<div class="visual diagram">' + it.diagram + '</div>' : '') + '<ul>' + it.features.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>';
    h += '<p><b>原理：</b>' + esc(it.principle) + '</p><p><b>常見失敗：</b>' + esc(it.fail) + '</p>';
    if (it.tip) h += '<div class="jlbox"><b>專家重點：</b>' + esc(it.tip) + '</div>';
    h += '<p class="muted">先自己諗 20 秒，再揭示示範（主動回憶）：</p>';
    h += '<details><summary>揭示示範</summary><div class="visual">' + (demo.visual || '') + '</div>' +
      '<div class="okbox">' + esc(demo.expl) + '</div></details>';
    h += '<p>學完自評（決定幾耐之後再出）：</p><div class="row">' +
      '<button data-act="recall" data-arg="' + k + '|0">唔記得</button>' +
      '<button data-act="recall" data-arg="' + k + '|3">勉強</button>' +
      '<button data-act="recall" data-arg="' + k + '|5">記得</button>' +
      '<button class="primary" data-act="quizKey" data-arg="' + k + '">做 5 題練呢個</button></div></div>';
    view(h);
  }
  function listView() {
    var h = '<div class="bar"><a href="#" class="lnk" data-act="home">← 主頁</a></div><h2>學習課程</h2><div class="grid">';
    SITE.order.forEach(function (k) {
      var it = SITE.items[k];
      h += '<button class="tile" data-act="learn" data-arg="' + k + '"><b>' + esc(it.name) + '</b><span>' +
        (S.learned[k] ? '已學' : '未學') + ' · ' + esc(it.cat) + ' · 掌握 ' + pct(mastery(k)) + '</span></button>';
    });
    view(h + '</div>');
  }

  // ---------- 錯題本 / 統計 ----------
  function mistakesView() {
    var h = '<div class="bar"><a href="#" class="lnk" data-act="home">← 主頁</a></div><div class="card"><h2>錯題本（' + S.mistakes.length + '）</h2>';
    if (!S.mistakes.length) h += '<p class="muted">暫時冇錯題。答錯嘅題會自動入嚟。</p>';
    for (var i = S.mistakes.length - 1; i >= 0; i--) {
      var m = S.mistakes[i];
      h += '<div class="rrow bad"><b>' + esc(label(m.key)) + '</b> · ' + new Date(m.t).toLocaleDateString() +
        '<br>你揀：' + esc(m.chosen) + '　正解：' + esc(m.correct) + '<br><small>' + esc(m.expl) + '</small>' +
        (m.self ? '<br><i>我嘅解釋：' + esc(m.self) + '</i>' : '') +
        '<div class="row"><button data-act="replay" data-arg="' + i + '">重做</button>' +
        '<button data-act="delMistake" data-arg="' + i + '">刪除</button></div></div>';
    }
    view(h + '</div>');
  }
  function topConf(n) {
    return Object.keys(S.conf).map(function (k) {
      var p = k.split('|');
      return { ka: p[0], kb: p[1], a: label(p[0]), b: label(p[1]), n: S.conf[k] };
    }).sort(function (x, y) { return y.n - x.n; }).slice(0, n);
  }
  function statsView() {
    var h = '<div class="bar"><a href="#" class="lnk" data-act="home">← 主頁</a></div><div class="card"><h2>統計</h2>';
    h += '<div class="scroll"><table><tr><th>項目</th><th>作答</th><th>正確率</th><th>掌握</th><th>到期</th></tr>';
    SITE.order.forEach(function (k) {
      var a = attempts(k);
      h += '<tr><td>' + esc(label(k)) + '</td><td>' + a.length + '</td><td>' + (a.length ? pct(acc(a)) : '—') +
        '</td><td>' + bar(mastery(k)) + '</td><td>' + (isDue(k) ? '是' : '') + '</td></tr>';
    });
    h += '</table></div>';
    var g = S.hist.filter(function (x) { return x.guess; }), ng = S.hist.filter(function (x) { return !x.guess; });
    h += '<p>🎲 估中率 ' + (g.length ? pct(acc(g)) : '—') + ' ｜ 唔估正確率 ' + (ng.length ? pct(acc(ng)) : '—') +
      '（兩者接近＝信心校準好）</p>';
    var typed = S.hist.filter(function (x) { return x.unit && x.ok && x.ms; });
    if (typed.length) {
      var units = typed.reduce(function (a, x) { return a + x.unit; }, 0), ms = typed.reduce(function (a, x) { return a + x.ms; }, 0);
      var last = typed.slice(-10), lu = last.reduce(function (a, x) { return a + x.unit; }, 0), lm = last.reduce(function (a, x) { return a + x.ms; }, 0);
      h += '<p>⌨️ 實戰打字速度：平均約 ' + Math.round(units * 60000 / ms) + ' 字／分鐘；最近 ' + last.length + ' 題約 ' +
        Math.round(lu * 60000 / lm) + ' 字／分鐘（只計答啱）</p>';
    }
    var top = topConf(8);
    h += '<h3>最常混淆（盲點）</h3>' + (top.length
      ? '<ol>' + top.map(function (c) { return '<li>' + esc(c.a) + ' ↔ ' + esc(c.b) + '：' + c.n + ' 次</li>'; }).join('') + '</ol>'
      : '<p class="muted">未有足夠資料。</p>');
    view(h + '</div>');
  }

  // ---------- 首頁 ----------
  function suggestions() {
    var out = [];
    var unl = SITE.order.filter(function (k) { return !S.learned[k]; });
    if (unl.length) out.push({ t: '先學：' + label(unl[0]), act: 'learn', arg: unl[0] });
    var dueN = SITE.order.filter(isDue).length;
    if (dueN) out.push({ t: '複習 ' + dueN + ' 個到期項目', act: 'quiz' });
    var tc = topConf(1)[0];
    if (tc && itemOf(tc.ka)) out.push({ t: '對比辨別：' + tc.a + ' ↔ ' + tc.b, act: 'learn', arg: itemOf(tc.ka) });
    var weak = SITE.order.filter(function (k) { return S.learned[k] && attempts(k).length; })
      .sort(function (a, b) { return mastery(a) - mastery(b); })[0];
    if (weak && mastery(weak) < 0.5) out.push({ t: '加強：' + label(weak) + '（掌握 ' + pct(mastery(weak)) + '）', act: 'quizKey', arg: weak });
    if (!out.length) out.push({ t: '開始一輪練習', act: 'quiz' });
    return out.slice(0, 3);
  }
  function pathSteps() {
    var n = SITE.order.length;
    var learnedN = SITE.order.filter(function (k) { return S.learned[k]; }).length;
    var last = S.hist.slice(-20), la = acc(last);
    var minM = Math.min.apply(null, SITE.order.map(mastery));
    return [
      { t: '學完所有項目', ok: learnedN === n, p: learnedN + ' / ' + n },
      { t: '最近 20 題正確率 ≥ 80%', ok: last.length >= 20 && la >= 0.8, p: last.length >= 20 ? pct(la) : last.length + ' / 20 題' },
      { t: '每項掌握度 ≥ 50%', ok: minM >= 0.5, p: pct(minM) + '（最低一項）' },
      { t: '每項掌握度 ≥ 80%（畢業）', ok: minM >= 0.8, p: pct(minM) + '（最低一項）' }
    ];
  }
  function card(act, t, d) { return '<button class="tile" data-act="' + act + '"><b>' + t + '</b><span>' + d + '</span></button>'; }
  function home() {
    R = null;
    var n = SITE.order.length;
    var avg = SITE.order.reduce(function (s, k) { return s + mastery(k); }, 0) / n;
    var dueN = SITE.order.filter(isDue).length;
    var todayN = S.hist.filter(function (h) { return ymd(new Date(h.t)) === today(); }).length;
    var h = '<header><h1>' + esc(SITE.title) + '</h1><p class="sub">' + esc(SITE.subtitle) + '</p></header>';
    h += '<div class="stats"><span>今日 ' + todayN + ' 題</span><span>連續 ' + streak() + ' 日</span><span>到期複習 ' + dueN +
      '</span><span>平均掌握 ' + pct(avg) + '</span></div>';
    h += '<div class="progress"><i style="width:' + Math.round(avg * 100) + '%"></i></div>';
    h += '<h3>🤖 智能建議</h3>';
    suggestions().forEach(function (s) {
      h += '<button class="sugg" data-act="' + s.act + '" data-arg="' + esc(s.arg || '') + '">' + esc(s.t) + '</button>';
    });
    h += '<h3>練習與工具</h3><div class="grid">' +
      (SITE.levels ? card('levels', '🎮 關卡挑戰', '一關一關過，攞星星') : '') +
      (SITE.timed ? card('timed', SITE.timed.title, SITE.timed.desc) : '') +
      (SITE.guide ? card('guide', SITE.guideTitle || '📱 教學', SITE.guideDesc || '') : '') +
      card('quiz', '📝 智能練習', '10 題一輪，系統揀最需要練嘅') +
      card('learnList', '📘 學習課程', '示範、要點、主動回憶') +
      card('mistakes', '❌ 錯題本（' + S.mistakes.length + '）', '重做錯題，寫低點解錯') +
      card('stats', '📊 統計', '正確率、掌握度、最常混淆') +
      card('export', '💾 下載備份', '匯出 JSON') +
      card('importClick', '📂 還原備份', '上載 JSON') +
      card('reset', '🗑 清除紀錄', '會刪除全部進度') +
      '</div>';
    h += '<h3>🗺️ 學習路徑</h3><ul class="path">' + pathSteps().map(function (p) {
      return '<li>' + (p.ok ? '☑' : '☐') + ' ' + esc(p.t) + ' <span class="muted">' + esc(p.p) + '</span></li>';
    }).join('') + '</ul>';
    h += '<input type="file" id="imp" accept="application/json" hidden>';
    h += '<p class="muted">上次儲存：' + (S.saved ? new Date(S.saved).toLocaleString() : '未有') + '</p>';
    view(h);
  }

  // ---------- 備份 ----------
  function exportJSON() {
    var blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = SITE.id + '-' + today() + '.json';
    a.click();
  }
  function importFile(file) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var o = JSON.parse(r.result);
        if (!o || typeof o !== 'object' || !o.cards) throw new Error('bad');
        S = Object.assign(fresh(), o); save(); toast('已還原'); home();
      } catch (e) { toast('檔案格式唔啱'); }
    };
    r.readAsText(file);
  }

  // ---------- 介面殼 ----------
  function view(html) { app.innerHTML = html; window.scrollTo(0, 0); }
  var tT = null;
  function toast(m) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = m; t.className = 'show';
    clearTimeout(tT); tT = setTimeout(function () { t.className = ''; }, 1800);
  }
  function act(a, g) {
    // 計時中撳其他嘢（離開、主頁…）＝放棄今局
    if (T && a !== 'timedSubmit' && a !== 'timedEnd') { stopTimer(); T = null; }
    switch (a) {
      case 'timed': timedMenu(); break;
      case 'timedGo': timedStart(g); break;
      case 'timedSubmit': timedSubmit(); break;
      case 'timedEnd': timedFinish(); break;
      case 'home': home(); break;
      case 'quiz': startQuiz(MAXQ); break;
      case 'quizKey': startQuiz(5, g); break;
      case 'learn': learnView(g); break;
      case 'learnList': listView(); break;
      case 'recall':
        var p = g.split('|'); touchDay(); review(p[0], +p[1]); save();
        toast('已記錄，間隔會按自評拉長'); home(); break;
      case 'choose': choose(+g); break;
      case 'submit': submit(); break;
      case 'next': next(); break;
      case 'saveSelf':
        var t = document.getElementById('self');
        if (R && R.lastM && t) { R.lastM.self = t.value.trim(); save(); toast('已保存解釋'); }
        break;
      case 'mistakes': mistakesView(); break;
      case 'replay': startReplay(S.mistakes[+g]); break;
      case 'delMistake': S.mistakes.splice(+g, 1); save(); mistakesView(); break;
      case 'stats': statsView(); break;
      case 'say': speak(g); break;
      case 'levels': levelsView(); break;
      case 'level': startLevel(g); break;
      case 'guide':
        view('<div class="bar"><a href="#" class="lnk" data-act="home">← 主頁</a></div><div class="card guide">' + (SITE.guide || '') + '</div>');
        break;
      case 'export': exportJSON(); break;
      case 'importClick': var f = document.getElementById('imp'); if (f) f.click(); break;
      case 'reset':
        if (confirm('真係清除全部紀錄？呢個動作無法復原。')) { S = fresh(); save(); home(); }
        break;
    }
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    e.preventDefault();
    act(el.getAttribute('data-act'), el.getAttribute('data-arg'));
  });
  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'imp' && e.target.files && e.target.files[0]) importFile(e.target.files[0]);
  });
  document.addEventListener('keydown', function (e) {
    if (e.isComposing || e.keyCode === 229) return; // 輸入法揀緊字，唔好當提交
    if (T) {
      if (e.key === 'Enter' && e.target.id === 'ans') { e.preventDefault(); timedSubmit(); }
      return;
    }
    if (!R || R.i >= R.qs.length) return;
    var tag = e.target.tagName;
    if (tag === 'TEXTAREA' || tag === 'BUTTON') return;
    if (tag === 'INPUT') {
      if (e.key === 'Enter' && e.target.id === 'ans') { e.preventDefault(); submit(); }
      return;
    }
    if (/^[1-9]$/.test(e.key) && !R.answered && +e.key <= R.qs[R.i].options.length) choose(+e.key - 1);
    else if (e.key === 'Enter') { if (R.answered) next(); else submit(); }
  });

  home();
})();
