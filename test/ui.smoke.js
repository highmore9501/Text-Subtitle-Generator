/**
 * test/ui.smoke.js —— 页面交互冒烟测试（通过 CDP 驱动真实无头 Edge）。
 *
 * 前置：server.js 已在 8631 端口运行；Edge 以 --remote-debugging-port=9222 启动并打开页面。
 * 运行：node test/ui.smoke.js
 */
'use strict';

const fs = require('fs');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  // 1. 找到页面 target
  const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const page = list.find((t) => t.type === 'page' && t.url.includes('8631'));
  if (!page) {
    throw new Error('未找到页面 target: ' + JSON.stringify(list));
  }

  // 2. 连接 CDP
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
    if (r.exceptionDetails) {
      throw new Error('页面脚本异常: ' + JSON.stringify(r.exceptionDetails));
    }
    return r.result.value;
  }

  async function screenshot(file) {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    console.log('screenshot saved:', file);
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await sleep(800);

  // 3. 基础信息与布局
  console.log('title:', await evalJs('document.title'));
  const layout = await evalJs(
    "({ panes: document.querySelectorAll('.pane').length," +
      " actionButtons: document.querySelectorAll('.actions .btn').length," +
      ' hasInput: !!document.getElementById("inputText"),' +
      ' hasPreview: !!document.getElementById("srtPreview"),' +
      ' hasChoosePath: !!document.getElementById("choosePath"),' +
      ' hasGenerate: !!document.getElementById("generateBtn") })'
  );
  console.log('layout:', JSON.stringify(layout));

  await screenshot('output/ui-initial.png');

  // 4. 载入示例
  await evalJs("document.getElementById('loadSample').click()");
  await sleep(700);
  const sampleLen = await evalJs("document.getElementById('inputText').value.length");
  console.log('载入示例后输入框长度:', sampleLen);
  if (sampleLen === 0) {
    throw new Error('载入示例未生效');
  }
  await screenshot('output/ui-sample.png');

  // 5. 点击“生成”
  await evalJs("document.getElementById('generateBtn').click()");
  await sleep(500);

  const preview = await evalJs("document.getElementById('srtPreview').value");
  const previewHead = preview.split('\n').slice(0, 4).join(' | ');
  const status = await evalJs("document.getElementById('resultStatus').textContent");
  const pathStatus = await evalJs("document.getElementById('pathStatus').textContent");
  console.log('preview head:', previewHead);
  console.log('resultStatus:', status);
  console.log('pathStatus:', pathStatus);

  if (!/^\d+\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\n.+/.test(preview)) {
    throw new Error('预览内容不是合法 SRT: ' + previewHead);
  }
  if (!status) {
    throw new Error('生成后状态栏为空');
  }
  await screenshot('output/ui-generated.png');

  ws.close();
  console.log('ui smoke: ALL PASS');
}

main().catch((err) => {
  console.error('ui smoke FAIL:', err.message);
  process.exit(1);
});
