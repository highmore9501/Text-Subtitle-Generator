/**
 * cli.js —— 命令行方式：文本文件 → SRT 文件（复用同一套核心逻辑）。
 *
 * 用法：
 *   node cli.js 输入.txt 输出.srt [--maxChars 20] [--speed 5] [--gapMs 200] [--startMs 0]
 *
 * 示例：
 *   node cli.js speech.txt 字幕.srt --maxChars 18 --speed 4
 */
'use strict';

const fs = require('fs');
const path = require('path');
const srt = require('./src/srt-generator.js');

function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const m = /^--([a-zA-Z]+)(?:=(.*))?$/.exec(arg);
    if (m) {
      const value = m[2] !== undefined ? m[2] : argv[++i];
      options[m[1]] = value;
    } else {
      positional.push(arg);
    }
  }
  return { positional, options };
}

function main() {
  const { positional, options } = parseArgs(process.argv.slice(2));
  if (positional.length < 2) {
    console.error(
      '用法: node cli.js 输入.txt 输出.srt [--maxChars 20] [--speed 5] [--gapMs 200] [--startMs 0]'
    );
    process.exit(1);
  }

  const [inputPath, outputPath] = positional;
  const text = fs.readFileSync(inputPath, 'utf8');

  const settings = {
    maxChars: options.maxChars !== undefined ? Number(options.maxChars) : 20,
    speed: options.speed !== undefined ? Number(options.speed) : 5,
    gapMs: options.gapMs !== undefined ? Number(options.gapMs) : 200,
    startMs: options.startMs !== undefined ? Number(options.startMs) : 0
  };

  const out = srt.generateSrt(text, settings);
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, out, 'utf8');
  console.log('已生成: ' + path.resolve(outputPath));
  console.log('参数: ' + JSON.stringify(settings));
}

main();
