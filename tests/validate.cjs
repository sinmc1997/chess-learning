// 驗證每個生成器：每題剛好 1 個正解、冇重複選項、選項數 3–6、文字唔空。
// 用法：node tests/validate.cjs
const SITE = require('../content.js');
const N = 1500;
let problems = 0, checked = 0;
for (const k of SITE.order) {
  for (let seed = 1; seed <= N; seed++) {
    checked++;
    const p = [];
    let q;
    try { q = SITE.makeQ(k, seed); } catch (e) { p.push('throw: ' + e.message); }
    if (q) {
      const oks = q.options.filter(o => o.ok).length;
      if (oks !== 1) p.push('正解數 ' + oks);
      if (q.options.length < 3 || q.options.length > 6) p.push('選項數 ' + q.options.length);
      if (new Set(q.options.map(o => o.t)).size !== q.options.length) p.push('選項重複');
      if (!q.prompt || !q.expl) p.push('文字空');
      if (q.options.some(o => !o.k)) p.push('缺混淆 key');
    }
    if (p.length) {
      problems++;
      if (problems <= 20) console.log(`${k} seed=${seed}: ${p.join('; ')}`);
    }
  }
}
console.log(`檢查 ${checked} 題，有問題 ${problems} 題`);
process.exit(problems ? 1 : 0);
