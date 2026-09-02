/**
 * server.js —— 零依赖静态文件服务，启动时自动打开浏览器。
 *
 * 用法：node server.js
 * 默认端口 8631，可通过环境变量 PORT 修改。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = Number(process.env.PORT) || 8631;
const ROOT = path.resolve(__dirname);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.srt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  } catch (e) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  if (urlPath === '/') {
    urlPath = '/index.html';
  }

  const filePath = path.resolve(ROOT, '.' + urlPath);

  // 防目录穿越：只允许访问项目根目录内的文件
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found: ' + urlPath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream'
    });
    res.end(data);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('端口 ' + PORT + ' 已被占用：可能已有一个字幕生成器实例在运行，或该端口被其他程序占用。');
    console.error('请先关闭占用该端口的程序，或用其他端口启动：PORT=' + (Number(PORT) + 1) + ' node server.js');
  } else {
    console.error('服务启动失败: ' + err.message);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  const url = 'http://127.0.0.1:' + PORT + '/';
  console.log('文本 → SRT 字幕生成器已启动: ' + url);
  console.log('按 Ctrl+C 停止服务。');

  // NO_OPEN=1 时不自动打开浏览器（供无人值守/测试场景使用）
  if (process.env.NO_OPEN) {
    return;
  }

  const cmd =
    process.platform === 'win32'
      ? 'start "" "' + url + '"'
      : process.platform === 'darwin'
        ? 'open "' + url + '"'
        : 'xdg-open "' + url + '"';

  exec(cmd, (err) => {
    if (err) {
      console.log('未能自动打开浏览器，请手动访问: ' + url);
    }
  });
});
