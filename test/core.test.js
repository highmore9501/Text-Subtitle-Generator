/**
 * test/core.test.js —— 核心逻辑验证（无框架断言）。
 * 运行：node test/core.test.js
 */
"use strict";

const assert = require("assert");
const srt = require("../src/srt-generator.js");

// 1. 时间戳格式化
assert.strictEqual(srt.formatTimestamp(0), "00:00:00,000");
assert.strictEqual(srt.formatTimestamp(1000), "00:00:01,000");
assert.strictEqual(srt.formatTimestamp(3661001), "01:01:01,001");

// 2. 断句：在字数上限处回找分隔符收尾；句尾分隔符标点被去掉
const text =
  "这是示例文本。它可以用来快速体验字幕生成功能，看看每句话是怎么按照字数上限和分隔符被切开的，中文的逗号、句号、问号都会作为断句依据。";
const sentences = srt.splitIntoSentences(text, 20);
assert.ok(sentences.length > 1, "应切出多句");
for (const s of sentences) {
  assert.ok(s.length > 0, "出现空句");
  assert.ok(s.length <= 20, "句子超过字数上限: " + s);
  assert.ok(
    !/[，。？！；：、…—～,.;:!?~–]$/.test(s),
    "句尾仍有分隔符标点: " + s,
  );
}

// 3. 整行都没有分隔符时，即使超过字数上限也直接采纳整句（用户反馈：不要在字数限制处截断）
const longWord = "啊".repeat(50);
const whole = srt.splitIntoSentences(longWord, 20);
assert.strictEqual(whole.length, 1);
assert.strictEqual(whole[0].length, 50);

// 4. SRT 格式与断句结果（limit=5 强制切分：第一句/第二句/第三句 各 3 字，句尾标点已去掉）
const out = srt.generateSrt("第一句。第二句？第三句！", {
  maxChars: 5,
  speed: 5,
  gapMs: 200,
});
const lines = out.split("\n");
assert.strictEqual(lines[0], "1");
assert.match(lines[1], /^\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}$/);
assert.strictEqual(lines[2], "第一句");
assert.strictEqual(lines[3], "");
assert.strictEqual(lines[4], "2");
assert.strictEqual(lines[5], "00:00:00,800 --> 00:00:01,400");
assert.strictEqual(lines[6], "第二句");
assert.strictEqual(lines[7], "");
assert.strictEqual(lines[8], "3");
assert.strictEqual(lines[9], "00:00:01,600 --> 00:00:02,200");
assert.strictEqual(lines[10], "第三句");

// 5. 时间轴累计与间隔
const out2 = srt.generateSrt("一二三四五，一二三四五。", {
  maxChars: 7,
  speed: 5,
  gapMs: 200,
});
assert.ok(out2.includes("00:00:00,000 --> 00:00:01,000"), out2);
assert.ok(out2.includes("00:00:01,200 --> 00:00:02,200"), out2);

// 6. 单条最小时长 500ms
const out3 = srt.generateSrt("嗨。", { maxChars: 20, speed: 5 });
assert.ok(out3.includes("00:00:00,000 --> 00:00:00,500"), out3);

// 7. 回归：冒号、破折号等标点也必须作为断句点（用户反馈“：”“——”处被硬切）
const s6 = srt.splitIntoSentences(
  "先讲清楚一个观念：我们为什么要手动去摆这些姿势？",
  20,
);
assert.deepStrictEqual(s6, [
  "先讲清楚一个观念",
  "我们为什么要手动去摆这些姿势",
]);

const s7 = srt.splitIntoSentences(
  "是为程序化动画设计的——动画是系统根据数据自动生成的，",
  20,
);
assert.deepStrictEqual(s7, [
  "是为程序化动画设计的",
  "动画是系统根据数据自动生成的",
]);

const s8 = srt.splitIntoSentences(
  '就是系统自动生成动画时的"参照物"：我们把关键的几帧摆好，剩下的千千万万帧，动画系统会自动补全中间帧。',
  20,
);
assert.deepStrictEqual(s8, [
  '就是系统自动生成动画时的"参照物"',
  "我们把关键的几帧摆好，剩下的千千万万帧",
  "动画系统会自动补全中间帧",
]);

// 8. 句尾分隔符标点被去掉（可连续多个），句中标点保留
const s9 = srt.splitIntoSentences("你好，世界。再见", 20);
assert.deepStrictEqual(s9, ["你好，世界", "再见"]);

const s10 = srt.splitIntoSentences("第一句。。第二句", 20);
assert.deepStrictEqual(s10, ["第一句", "第二句"]);

const s11 = srt.splitIntoSentences("Hello, world. Next", 20);
assert.deepStrictEqual(s11, ["Hello, world", "Next"]);

// 9. 回归：换行符也是分隔符（用户反馈：只把标点当分隔符，换行也应断句）
const s12 = srt.splitIntoSentences("第一行内容\n第二行内容", 20);
assert.deepStrictEqual(s12, ["第一行内容", "第二行内容"]);

// CRLF / 单独 CR 都归一化为换行分隔
const s13 = srt.splitIntoSentences("第一行内容\r\n第二行内容\r第三行内容", 20);
assert.deepStrictEqual(s13, ["第一行内容", "第二行内容", "第三行内容"]);

// 换行与标点混排：句尾换行不残留
const s14 = srt.splitIntoSentences("你好，世界。\n再见", 20);
assert.deepStrictEqual(s14, ["你好，世界", "再见"]);

// 连续空行跳过
const s15 = srt.splitIntoSentences("第一句。\n\n第二句", 20);
assert.deepStrictEqual(s15, ["第一句", "第二句"]);

// 10. 回归：无分隔符超长整句直接采纳（用户反馈：“…Blender版的大提琴手林尼”不能被硬切）
const s16 = srt.splitIntoSentences(
  "这一集我们来测试一下Blender版的大提琴手林尼",
  20,
);
assert.deepStrictEqual(s16, ["这一集我们来测试一下Blender版的大提琴手林尼"]);

// 行内后面还有分隔符时，仍按字数上限硬切，下一轮再按分隔符收尾
const s17 = srt.splitIntoSentences(
  "一二三四五六七八九十一二三四五六七八九十一二，三四五",
  20,
);
assert.deepStrictEqual(s17, [
  "一二三四五六七八九十一二三四五六七八九十",
  "一二",
  "三四五",
]);

// 11. 提取模式：去掉序号与时间轴，只保留字幕正文
const rawSrt =
  "1\n00:00:00,000 --> 00:00:01,200\n第一句\n\n" +
  "2\n00:00:01,300 --> 00:00:02,500\n第二句\n继续这一句\n\n" +
  "3\n00:00:02,700 --> 00:00:03,900\nThird line";
assert.strictEqual(
  srt.extractPlainText(rawSrt),
  "第一句\n第二句 继续这一句\nThird line",
);
assert.strictEqual(
  srt.generateSrt(rawSrt, { mode: "extract" }),
  "第一句\n第二句 继续这一句\nThird line",
);

console.log("core test: ALL PASS");
