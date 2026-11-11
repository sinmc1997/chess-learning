// 驗證每個生成器（選擇題＋打字題）。用法：node tests/validate.cjs
// 選擇題：剛好 1 個正解、冇重複、3–6 個選項
// 打字題：正解一定判啱；亂打一定判錯；有 answerText 同 check
const SITE = require('../content.js');
const N = 1500;
let problems = 0, checked = 0;
const report = (k, seed, p) => { problems++; if (problems <= 20) console.log(`${k} seed=${seed}: ${p.join('; ')}`); };
for (const k of SITE.order) {
  for (let seed = 1; seed <= N; seed++) {
    checked++;
    const p = [];
    let q;
    try { q = SITE.makeQ(k, seed); } catch (e) { p.push('throw: ' + e.message); }
    if (q) {
      if (!q.prompt || !q.expl) p.push('文字空');
      if (q.input) {
        if (!q.answerText || typeof q.check !== 'function') p.push('打字題缺 answerText／check');
        else {
          if (!q.check(q.answerText).ok) p.push('正解判錯：' + q.answerText);
          const wrong = q.check('qqq');
          if (wrong.ok) p.push('亂打判啱');
          if (!wrong.note) p.push('錯咗冇說明');
        }
      } else {
        const oks = q.options.filter(o => o.ok).length;
        if (oks !== 1) p.push('正解數 ' + oks);
        if (q.options.length < 3 || q.options.length > 6) p.push('選項數 ' + q.options.length);
        if (new Set(q.options.map(o => o.t)).size !== q.options.length) p.push('選項重複');
        if (q.options.some(o => !o.k)) p.push('缺混淆 key');
      }
    }
    if (p.length) report(k, seed, p);
  }
}
// 關卡：每關嘅項目都要存在
(SITE.levels || []).forEach(L => (L.items || []).forEach(k => { if (!SITE.items[k]) report('LEVEL', L.id, ['冇呢個項目 ' + k]); }));
// 粵拼網站專用：資料一致性
if (SITE._data) {
  const D = SITE._data;
  D.WORDS.forEach(w => { if (w[0].length !== w[1].split(' ').length) report('WORDS', w[0], ['字數同音節數唔對']); });
  D.SENTS.forEach(s => s.forEach(w => { if (w[0].length !== w[1].split(' ').length) report('SENTS', w[0], ['字數同音節數唔對']); }));
  const all = D.CHARS.map(x => x.jp).concat(...D.WORDS.map(w => w[1].split(' ')));
  all.forEach(jp => { if (!/^[a-z]+[1-6]$/.test(jp)) report('JP', jp, ['格式唔啱']); });
  // 詞語：唔打聲調都要判啱
  D.WORDS.forEach(w => {
    let check = null;
    for (let seed = 1; seed < 400 && !check; seed++) { const x = SITE.makeQ('type_word', seed); if (x.answerText === w[1]) check = x.check; }
    if (check && !check(w[1].replace(/[0-9 ]/g, '')).ok) report('type_word', w[0], ['唔打聲調判錯']);
  });
  // 診斷：錯邊部分要講啱
  if (D.diagSyl('nei3', 'nei5').k !== 'ERR:tone') report('diag', 'nei3', ['診斷錯']);
  if (D.diagSyl('lei5', 'nei5').k !== 'ERR:ini') report('diag', 'lei5', ['診斷錯']);
  if (D.diagSyl('nei', 'nei5').k !== 'ERR:notone') report('diag', 'nei', ['診斷錯']);
}
console.log(`檢查 ${checked} 題，有問題 ${problems} 題`);
process.exit(problems ? 1 : 0);
