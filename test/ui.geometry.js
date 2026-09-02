/**
 * test/ui.geometry.js —— 通过 CDP 对真实渲染页面做布局几何核对（程序化目检）。
 *
 * 前置：Edge CDP 9222 已连接 http://127.0.0.1:8631/
 * 运行：node test/ui.geometry.js
 */
'use strict';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const page = list.find((t) => t.type === 'page' && t.url.includes('8631'));
  if (!page) throw new Error('no page target for 8631: ' + JSON.stringify(list));

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });

  let nextId = 1;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  };
  function send(method, params) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
  async function evalJs(expression) {
    const r = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails));
    return r.result.value;
  }

  await send('Runtime.enable');
  await sleep(500);

  const m = await evalJs(
    "(() => { const r = (el) => { const b = el.getBoundingClientRect();" +
      ' return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height),' +
      ' right: Math.round(b.right), bottom: Math.round(b.bottom) }; };' +
      ' const panes = [...document.querySelectorAll(".pane")].map(r);' +
      ' const actions = r(document.querySelector(".actions"));' +
      ' const choosePath = r(document.getElementById("choosePath"));' +
      ' const generate = r(document.getElementById("generateBtn"));' +
      ' const main = r(document.querySelector(".main"));' +
      ' const mainStyle = getComputedStyle(document.querySelector(".main"));' +
      ' const actionsStyle = getComputedStyle(document.querySelector(".actions"));' +
      ' return { vw: innerWidth, vh: innerHeight, panes, actions, choosePath, generate, main,' +
      ' mainDisplay: mainStyle.display, actionsDirection: actionsStyle.flexDirection }; })()'
  );

  console.log(JSON.stringify(m, null, 1));

  const [left, right] = m.panes;
  const failures = [];

  function check(name, cond, detail) {
    console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (cond ? '' : ' | ' + detail));
    if (!cond) failures.push(name);
  }

  check('主体为 flex 布局', m.mainDisplay === 'flex', 'mainDisplay=' + m.mainDisplay);
  check('中间按钮列上下排列', m.actionsDirection === 'column', 'actionsDirection=' + m.actionsDirection);
  check('左右两个面板都存在', m.panes.length === 2, 'panes=' + m.panes.length);
  check('左侧面板占据大部分宽度(>=30%)', left.w > m.vw * 0.3, 'w=' + left.w + ' vw=' + m.vw);
  check('右侧面板占据大部分宽度(>=30%)', right.w > m.vw * 0.3, 'w=' + right.w + ' vw=' + m.vw);
  check('左右面板高度占大部分视口(>=50%)', left.h > m.vh * 0.5 && right.h > m.vh * 0.5, 'left.h=' + left.h + ' right.h=' + right.h + ' vh=' + m.vh);
  check('按钮列位于左右面板之间', left.right <= m.choosePath.x && m.generate.right <= right.x,
    'left.right=' + left.right + ' choosePath.x=' + m.choosePath.x + ' generate.right=' + m.generate.right + ' right.x=' + right.x);
  check('资源管理器按钮在“生成”按钮上方', m.choosePath.y < m.generate.y,
    'choosePath.y=' + m.choosePath.y + ' generate.y=' + m.generate.y);
  check('按钮列在主体区域内垂直居中', Math.abs(m.actions.y - m.main.y) < m.main.h * 0.4,
    'actions.y=' + m.actions.y + ' main.y=' + m.main.y + ' main.h=' + m.main.h);

  ws.close();
  if (failures.length > 0) {
    console.error('geometry check FAILED: ' + failures.join(', '));
    process.exit(1);
  }
  console.log('geometry check: ALL PASS');
}

main().catch((err) => {
  console.error('geometry FAIL:', err.message);
  process.exit(1);
});
