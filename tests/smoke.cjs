// 冒煙測試：用假 DOM 跑 engine.js，點擊各按鈕走一遍主流程，抓運行時錯誤。
// 用法：node tests/smoke.cjs（content.js 與 engine.js 要同一資料夾）
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(__dirname, '..');
const store = {};
let handler = null, keyHandler = null, html = '';
const app = { set innerHTML(v) { html = v; }, get innerHTML() { return html; } };
const elems = { app, toast: { textContent: '', className: '' }, imp: { click() {} }, guess: null, self: null, ans: { value: 'abc', focus() {} } };
const doc = {
  getElementById: id => elems[id] || null,
  querySelector: () => null,
  createElement: () => ({ click() {} }),
  addEventListener: (type, fn) => { if (type === 'click') handler = fn; if (type === 'keydown') keyHandler = fn; },
};
const ctx = {
  window: {}, document: doc, localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
  console, Date, Math, JSON, Set, Object, Array, String, Number, Blob: function () {}, URL: { createObjectURL() { return ''; } },
  confirm: () => true, FileReader: function () {}, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
};
ctx.window.scrollTo = () => {}; ctx.window.SITE = undefined;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(dir, 'content.js'), 'utf8'), ctx);
ctx.window.SITE = ctx.window.SITE || ctx.SITE;
vm.runInContext(fs.readFileSync(path.join(dir, 'engine.js'), 'utf8'), ctx);

const click = (act, arg) => handler({ target: { closest: () => ({ disabled: false, getAttribute: a => (a === 'data-act' ? act : arg) }) }, preventDefault() {} });
const fails = [];
const step = (name, fn) => { try { fn(); if (!html) fails.push(name + ': 空白畫面'); } catch (e) { fails.push(name + ': ' + e.message); } };

step('首頁', () => { if (!html.includes('智能建議')) throw new Error('缺建議'); });
step('學習課程', () => click('learnList'));
step('開課', () => click('learn', ctx.window.SITE.order[2]));
step('自評', () => click('recall', ctx.window.SITE.order[2] + '|5'));
step('練習 10 題', () => click('quiz'));
for (let i = 0; i < 20 && !html.includes('本輪'); i++) {
  step('答題 ' + i, () => { click('choose', '0'); click('submit'); click('next'); });
}
step('一輪完成頁', () => { if (!html.includes('本輪')) throw new Error('未見結果'); });
step('錯題本', () => click('mistakes'));
step('統計', () => click('stats'));
step('返主頁', () => click('home'));
if (ctx.window.SITE.levels) {
  step('關卡地圖', () => { click('levels'); if (!html.includes('第 1 關')) throw new Error('冇關卡'); });
  step('打第 1 關', () => { click('level', ctx.window.SITE.levels[0].id); for (let i = 0; i < 20 && !html.includes('關卡地圖'); i++) { click('choose', '0'); click('submit'); click('next'); } if (!html.includes('第 1 關')) throw new Error('關卡結果頁唔見'); });
}
if (ctx.window.SITE.guide) step('教學頁', () => { click('guide'); if (!html.includes('輸入法')) throw new Error('教學頁空'); });
if (ctx.window.SITE.timed) step('計時挑戰', () => {
  click('timed'); if (!html.includes('最佳')) throw new Error('冇模式選單');
  click('timedGo', ctx.window.SITE.timed.modes[0].id); if (!html.includes('tleft')) throw new Error('冇倒數');
  click('timedSubmit'); click('timedSubmit'); if (!html.includes('應該係')) throw new Error('打錯冇顯示正解');
  click('timedEnd'); if (!html.includes('再嚟一次')) throw new Error('冇結果頁');
  click('timedGo', ctx.window.SITE.timed.modes[1].id); click('home'); if (!html.includes('智能建議')) throw new Error('離開失敗');
});
// 製造一題錯題再重做
step('重做錯題', () => { if (ctx.window.SITE) click('quizKey', ctx.window.SITE.order[0]); click('choose', '1'); click('submit'); click('saveSelf'); click('next'); click('mistakes'); click('replay', '0'); });
const saved = JSON.parse(store[Object.keys(store)[0]]);
console.log('題數記錄：' + saved.hist.length + '，錯題：' + saved.mistakes.length + '，連續：' + saved.days.length);
if (fails.length) { console.log('失敗：\n' + fails.join('\n')); process.exit(1); }
console.log('冒煙測試通過');
