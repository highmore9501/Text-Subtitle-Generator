/**
 * srt-generator.js —— 文本 → SRT 字幕生成核心逻辑
 *
 * 纯 JS 实现，无 DOM 依赖，可在浏览器（window.SrtGenerator）与 Node.js（module.exports）中运行。
 *
 * 处理流程（中文模式，mode='zh' 或省略）：
 *   1. 将整段文字按"每句字数上限 + 分隔符回找"切成句子：
 *        换行符是硬分隔符，先按行拆分；行内从 start+maxChars 的位置
 *        往回找第一个标点分隔符，句子在分隔符处收尾；
 *        若整行都没有分隔符，直接采纳整句（可超过字数上限）；
 *        若只是窗口内没有、行内后面还有分隔符，则在字数上限处硬切。
 *        断句后去掉句尾的分隔符标点（字幕更整洁），句中标点保留。
 *   2. 按每句字数与预设语速（字/秒）计算时长，生成带时间轴的 SRT 文本。
 *
 * 英文模式（mode='en'，见 docs/添加英文字幕参考信息.md）走 generateEnglishSrt：
 *   1. 在 . ! ? ; : 、英文逗号 , 及破折号/省略号（— – …）之后切分片段
 *      （保留句尾标点）；不切单词、不在空格处强切；
 *   2. 片段按顺序合并，每条字幕不超过 maxChars（默认 100）个字符（含空格）；
 *      相邻断句点之间的内容若本身超过上限（罕见），整条保留、允许略超——
 *      不切词也不在空格处切；
 *   3. 按字符耗时（charSec，默认 0.057 秒/字符）计时，时长钳位在
 *      [minDurationMs=1200, maxDurationMs=6000] 毫秒，字幕间隔 gapMs=250 毫秒。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SrtGenerator = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /**
   * 分隔符集合：中英文逗号、句号、问号、感叹号、分号、冒号、顿号、
   * 省略号、破折号、波浪号等常用标点（含“：”“——”等容易漏掉的断句点）。
   * 换行符是硬分隔符，已在 splitIntoSentences 中先按行拆分，不在此集合内。
   * 如需严格只留“，。？, . ?”，删除下方对应字符即可。
   */
  var DELIMITERS = new Set([
    "，",
    "。",
    "？",
    "！",
    "；",
    "：",
    "、",
    "…",
    "—",
    "～",
    ",",
    ".",
    "?",
    "!",
    ";",
    ":",
    "–",
    "~",
  ]);

  function isDelimiter(ch) {
    return DELIMITERS.has(ch);
  }

  /**
   * 将整段文字切成句子。
   * @param {string} text      原始文本
   * @param {number} maxChars  每句字数上限（>=1）
   * @returns {string[]} 句子数组（已 trim，不含空串）
   */
  function splitIntoSentences(text, maxChars) {
    var limit = Math.max(1, Math.floor(Number(maxChars) || 20));
    // 换行符天然也是分隔符：先把 CRLF / 单独 CR 统一归一化为 \n，
    // 再按 \n 拆成行——每行是一个硬边界，行内再按标点回找断句，
    // 保证字幕文本里永远不会残留换行（SRT 内嵌换行会破坏格式）。
    var normalized = String(text == null ? "" : text)
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");

    var sentences = [];
    var lines = normalized.split("\n");

    lines.forEach(function (line) {
      var n = line.length;
      var start = 0;

      while (start < n) {
        // 跳过句子开头的空白，避免切出前导空格或空行
        while (start < n && /\s/.test(line[start])) {
          start++;
        }
        if (start >= n) {
          break;
        }

        var end = Math.min(start + limit, n);

        // 从限制位置往回找第一个分隔符
        var cut = -1;
        for (var i = end - 1; i >= start; i--) {
          if (isDelimiter(line[i])) {
            cut = i;
            break;
          }
        }

        var sentence;
        if (cut >= start + 1) {
          sentence = line.slice(start, cut + 1);
          start = cut + 1;
        } else {
          // 窗口内没有分隔符（或分隔符就在句首，避免切出孤立的标点符号）。
          // 若整行都没有分隔符，直接采纳整句——宁可超过字数上限，
          // 也不能把词劈开（如“…Blender版的大提琴手林尼”不能截成“…Blender版的大/提琴手林尼”）；
          // 若只是窗口内没有、行内后面还有分隔符，则在字数上限处硬切，下一轮再按分隔符收尾。
          var hasDelimiterInLine = false;
          for (var j = end; j < n; j++) {
            if (isDelimiter(line[j])) {
              hasDelimiterInLine = true;
              break;
            }
          }
          if (!hasDelimiterInLine) {
            sentence = line.slice(start);
            start = n;
          } else {
            sentence = line.slice(start, end);
            start = end;
          }
        }

        sentence = sentence.trim();

        // 去掉句尾的分隔符标点（可连续多个，如“观念：”→“观念”、
        // “设计的——”→“设计的”），让字幕显示更整洁；句中的标点不受影响。
        while (
          sentence.length > 0 &&
          isDelimiter(sentence[sentence.length - 1])
        ) {
          sentence = sentence.slice(0, -1);
        }
        sentence = sentence.trim();

        if (sentence.length > 0) {
          sentences.push(sentence);
        }
      }
    });

    return sentences;
  }

  /**
   * 英文断句标点集合：. ! ? ; : 、英文逗号 , 以及破折号/省略号（— – …）。
   * 参考 docs/添加英文字幕参考信息.md；逗号为按产品要求补充的断句点。
   * 注意：连字符 - 不在此集合（well-known 这类复合词不会被切开），
   * 空格也不作为断句点。片段以这些标点收尾并保留该标点，合并时不切开单词。
   */
  var EN_PUNCTUATION = new Set([".", "!", "?", ";", ":", ",", "—", "–", "…"]);

  function isEnPunctuation(ch) {
    return EN_PUNCTUATION.has(ch);
  }

  /**
   * 把整段英文按标点切成“句子/从句片段”（片段以标点结尾，保留句尾标点）。
   * 断句点：. ! ? ; : , — – … 之后且后面跟空白（含换行）时断开，空白被吞掉。
   * 任何情况下都不会切开单词，也不会在空格处强行断句。
   * @param {string} text 原始英文文本
   * @returns {string[]} 非空片段数组
   */
  function splitEnglishByPunct(text) {
    var src = String(text == null ? "" : text)
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");

    var fragments = [];
    var buffer = "";
    var n = src.length;
    var i = 0;

    while (i < n) {
      var ch = src[i];
      if (isEnPunctuation(ch) && i + 1 < n && /\s/.test(src[i + 1])) {
        buffer += ch;
        var frag = buffer.trim();
        if (frag.length > 0) {
          fragments.push(frag);
        }
        buffer = "";
        i += 1;
        // 吞掉标点后面的整段空白（含换行），等价于 Python 的 \s+
        while (i < n && /\s/.test(src[i])) {
          i++;
        }
        continue;
      }
      buffer += ch;
      i++;
    }
    if (buffer.trim().length > 0) {
      fragments.push(buffer.trim());
    }
    return fragments;
  }

  /**
   * 把句子片段顺序合并成字幕：拼接后总字符数不超过 maxChars 即合并成一条，
   * 超过则在上一个片段边界断开。片段只以标点为边界，所以永远不会切单词，
   * 也不会在空格处断句。
   * 若相邻两个断句点之间的内容本身就超过 maxChars（例如逗号到句号之间有一
   * 段很长、内部再无标点的文字），该片段整条保留、允许略超上限——因为既
   * 不能切单词，也不能在空格处切，这是唯一可行的选择。
   * @param {string[]} fragments 标点切分后的片段
   * @param {number} maxChars    每条字幕最大字符数（含空格）
   * @returns {string[]} 字幕文本数组
   */
  function mergeEnglishFragments(fragments, maxChars) {
    var result = [];
    var buffer = "";
    fragments.forEach(function (frag) {
      if (!buffer) {
        buffer = frag;
        return;
      }
      var combined = buffer + " " + frag;
      if (combined.length <= maxChars) {
        buffer = combined;
      } else {
        result.push(buffer);
        buffer = frag;
      }
    });
    if (buffer.length > 0) {
      result.push(buffer);
    }
    return result;
  }

  /**
   * 毫秒 → SRT 时间戳 HH:MM:SS,mmm
   * @param {number} ms
   * @returns {string}
   */
  function formatTimestamp(ms) {
    var total = Math.max(0, Math.round(Number(ms) || 0));
    var h = Math.floor(total / 3600000);
    var m = Math.floor((total % 3600000) / 60000);
    var s = Math.floor((total % 60000) / 1000);
    var milli = total % 1000;
    function pad(v, len) {
      return String(v).padStart(len, "0");
    }
    return pad(h, 2) + ":" + pad(m, 2) + ":" + pad(s, 2) + "," + pad(milli, 3);
  }

  /**
   * 从字幕文本中提取纯文本（去掉序号、时间轴、空行）。
   * 支持常见 SRT/VTT 时间轴格式，只保留真正的字幕内容行。
   * @param {string} subtitleText 原始字幕文本
   * @returns {string} 纯文本（按字幕块逐行输出）
   */
  function extractPlainText(subtitleText) {
    var normalized = String(subtitleText == null ? "" : subtitleText)
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");

    var blocks = normalized.split(/\n\s*\n/);
    var lines = [];

    blocks.forEach(function (block) {
      var rows = block
        .split("\n")
        .map(function (line) {
          return line.trim();
        })
        .filter(function (line) {
          return line.length > 0;
        });

      if (rows.length === 0) {
        return;
      }

      var textRows = rows.filter(function (line) {
        // 纯数字序号
        if (/^\d+$/.test(line)) {
          return false;
        }
        // SRT/VTT 常见时间轴行
        if (line.indexOf("-->") !== -1) {
          return false;
        }
        // VTT 头信息与注释块
        if (/^(WEBVTT|NOTE)$/i.test(line)) {
          return false;
        }
        return true;
      });

      if (textRows.length > 0) {
        lines.push(textRows.join(" "));
      }
    });

    return lines.join("\n");
  }

  /**
   * 生成 SRT 文本。
   * @param {string} text 原始文本
   * @param {object} [options]
   *   maxChars      每句字数上限，默认 20
   *   speed         语速（字/秒），默认 5
   *   gapMs         相邻字幕间隔（毫秒），默认 200
   *   minDurationMs 单条字幕最小时长（毫秒），默认 500
   *   startMs       第一条字幕起始时间（毫秒），默认 0
   * @returns {string} SRT 内容
   */
  function generateSrt(text, options) {
    var opts = options || {};
    if (opts.mode === "extract") {
      return extractPlainText(text);
    }
    if (opts.mode === "en") {
      return generateEnglishSrt(text, opts);
    }
    var maxChars = Math.max(1, Math.floor(Number(opts.maxChars) || 20));
    var speed = Number(opts.speed) > 0 ? Number(opts.speed) : 5;
    var gapMs = Number(opts.gapMs) >= 0 ? Number(opts.gapMs) : 200;
    var minDurationMs =
      Number(opts.minDurationMs) >= 0 ? Number(opts.minDurationMs) : 500;
    var startMs = Number(opts.startMs) > 0 ? Number(opts.startMs) : 0;

    var sentences = splitIntoSentences(text, maxChars);
    var out = "";
    var cursor = startMs;

    sentences.forEach(function (sentence, i) {
      var durationMs = Math.max(
        minDurationMs,
        Math.round((sentence.length / speed) * 1000),
      );
      var start = cursor;
      var end = start + durationMs;

      out += i + 1 + "\n";
      out += formatTimestamp(start) + " --> " + formatTimestamp(end) + "\n";
      out += sentence + "\n\n";

      cursor = end + gapMs;
    });

    return out;
  }

  /**
   * 生成英文模式 SRT 文本（参考 docs/添加英文字幕参考信息.md）。
   * 规则：标点处切分 → 合并到 maxChars（含空格）→ 按字符耗时计时 →
   * 时长钳位 [minDurationMs, maxDurationMs] → 顺序累加时间轴。
   * @param {string} text 原始英文文本
   * @param {object} [options]
   *   mode          传 'en' 时由 generateSrt 分发到本函数
   *   maxChars      每条字幕最大字符数（含空格），默认 100
   *   charSec       字符耗时（秒/字符），默认 0.057
   *   gapMs         字幕间隔（毫秒），默认 250
   *   minDurationMs 单条最小时长（毫秒），默认 1200
   *   maxDurationMs 单条最大时长（毫秒），默认 6000
   *   startMs       第一条字幕起始时间（毫秒），默认 0
   * @returns {string} SRT 内容
   */
  function generateEnglishSrt(text, options) {
    var opts = options || {};
    var maxChars = Math.max(1, Math.floor(Number(opts.maxChars) || 100));
    var charSec = Number(opts.charSec) > 0 ? Number(opts.charSec) : 0.057;
    var gapMs = Number(opts.gapMs) >= 0 ? Number(opts.gapMs) : 250;
    var minDurationMs =
      Number(opts.minDurationMs) >= 0 ? Number(opts.minDurationMs) : 1200;
    var maxDurationMs =
      Number(opts.maxDurationMs) > 0 ? Number(opts.maxDurationMs) : 6000;
    var startMs = Number(opts.startMs) > 0 ? Number(opts.startMs) : 0;

    var fragments = splitEnglishByPunct(text);
    var segments = mergeEnglishFragments(fragments, maxChars);
    var out = "";
    var cursor = startMs;

    segments.forEach(function (seg, i) {
      var durationMs = Math.round(seg.length * charSec * 1000);
      durationMs = Math.max(minDurationMs, Math.min(durationMs, maxDurationMs));
      var start = cursor;
      var end = start + durationMs;

      out += i + 1 + "\n";
      out += formatTimestamp(start) + " --> " + formatTimestamp(end) + "\n";
      out += seg + "\n\n";

      cursor = end + gapMs;
    });

    return out;
  }

  return {
    DELIMITERS: DELIMITERS,
    EN_PUNCTUATION: EN_PUNCTUATION,
    splitIntoSentences: splitIntoSentences,
    splitEnglishByPunct: splitEnglishByPunct,
    mergeEnglishFragments: mergeEnglishFragments,
    formatTimestamp: formatTimestamp,
    extractPlainText: extractPlainText,
    generateSrt: generateSrt,
    generateEnglishSrt: generateEnglishSrt,
  };
});
