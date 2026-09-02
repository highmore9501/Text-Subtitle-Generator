/**
 * app.js —— 页面交互逻辑
 * 负责：资源管理器选择保存路径、读取设置、调用 SrtGenerator 生成、
 *       预览显示、写入文件（File System Access API）或回退下载。
 */
(function () {
  "use strict";

  function $(id) {
    return document.getElementById(id);
  }

  var inputText = $("inputText");
  var srtPreview = $("srtPreview");
  var maxCharsInput = $("maxChars");
  var speedInput = $("speed");
  var gapMsInput = $("gapMs");
  var choosePathBtn = $("choosePath");
  var generateBtn = $("generateBtn");
  var loadSampleBtn = $("loadSample");
  var pathStatus = $("pathStatus");
  var resultStatus = $("resultStatus");
  var langMode = $("langMode");
  var maxCharsLabel = $("maxCharsLabel");
  var speedLabel = $("speedLabel");

  /** 当前选中的保存文件句柄（File System Access API） */
  var fileHandle = null;

  /**
   * zh / en 两种处理模式的参数默认值与文案。
   * 中文模式：字数上限 + 语速（字/秒）；英文模式：参考
   * docs/添加英文字幕参考信息.md —— 每条最大字符数（含空格）+ 字符耗时（秒/字符）。
   */
  var MODE_PROFILES = {
    zh: {
      maxCharsLabel: "每句字数上限",
      maxCharsTitle: "到达该字数位置后往回找分隔符断句",
      maxChars: 20,
      speedLabel: "语速（字/秒）",
      speedTitle: "每秒钟可读的字数，用于计算字幕时长",
      speed: 5,
      speedStep: 0.1,
      speedMin: 0.1,
      gapMs: 200,
    },
    en: {
      maxCharsLabel: "每条字幕最大字符数（含空格）",
      maxCharsTitle:
        "英文只在标点（. ! ? ; : , — 等）后切分，不切单词、不在空格处切，合并后不超过该字符数",
      maxChars: 100,
      speedLabel: "字符耗时（秒/字符）",
      speedTitle: "每个英文字符（含空格与标点）的朗读耗时，参考默认 0.055 秒",
      speed: 0.055,
      speedStep: 0.001,
      speedMin: 0.001,
      gapMs: 250,
    },
  };

  function currentMode() {
    return langMode.value;
  }

  /** 切换处理模式：联动标签文案、单位、步进与参数默认值 */
  function applyModeProfile(mode) {
    var p = MODE_PROFILES[mode] || MODE_PROFILES.zh;
    maxCharsLabel.textContent = p.maxCharsLabel;
    speedLabel.textContent = p.speedLabel;
    maxCharsInput.title = p.maxCharsTitle;
    speedInput.title = p.speedTitle;
    maxCharsInput.value = p.maxChars;
    speedInput.value = p.speed;
    speedInput.step = String(p.speedStep);
    speedInput.min = String(p.speedMin);
    gapMsInput.value = p.gapMs;
    setResult(
      "已切换到" + (mode === "en" ? "英文字幕" : "中文字幕") + "模式。",
      true,
    );
  }

  langMode.addEventListener("change", function () {
    applyModeProfile(langMode.value);
  });

  function readSettings() {
    var mode = currentMode();
    var profile = MODE_PROFILES[mode] || MODE_PROFILES.zh;
    var settings = {
      mode: mode,
      maxChars: Math.max(
        1,
        Math.floor(Number(maxCharsInput.value) || profile.maxChars),
      ),
      gapMs:
        Number(gapMsInput.value) >= 0
          ? Number(gapMsInput.value)
          : profile.gapMs,
    };
    var speed =
      Number(speedInput.value) > 0 ? Number(speedInput.value) : profile.speed;
    if (mode === "en") {
      settings.charSec = speed; // 秒/字符
    } else {
      settings.speed = speed; // 字/秒
    }
    return settings;
  }

  function setResult(text, ok) {
    resultStatus.textContent = text;
    resultStatus.className = ok ? "ok" : "err";
  }

  function setPath(text) {
    pathStatus.textContent = text;
  }

  /* ---------- 资源管理器：选择保存路径 ---------- */
  choosePathBtn.addEventListener("click", async function () {
    if (!window.showSaveFilePicker) {
      setPath(
        "当前浏览器不支持“选择保存位置”，点击“生成”将直接下载 SRT 文件。",
      );
      return;
    }
    try {
      fileHandle = await window.showSaveFilePicker({
        suggestedName: "字幕.srt",
        types: [
          {
            description: "SRT 字幕文件",
            accept: { "text/plain": [".srt"] },
          },
        ],
      });
      setPath("保存位置：" + fileHandle.name + "（已选择，生成后自动写入）");
      setResult("", true);
    } catch (err) {
      if (err.name !== "AbortError") {
        setPath("选择保存位置失败：" + err.message);
      }
    }
  });

  /* ---------- 写入文件或回退下载 ---------- */
  async function saveSrt(content) {
    if (fileHandle) {
      try {
        var writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        setResult("已保存到：" + fileHandle.name, true);
      } catch (err) {
        setResult("写入失败：" + err.message, false);
      }
      return;
    }

    // 回退方案：浏览器不支持保存对话框 / 未选择路径时直接下载
    var blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "字幕.srt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setResult("未选择保存位置，已触发下载“字幕.srt”。", true);
  }

  /* ---------- 生成 ---------- */
  function generate() {
    var text = inputText.value;
    if (!text.trim()) {
      setResult("请先在上方输入需要转换的文本。", false);
      return undefined;
    }
    var srt = window.SrtGenerator.generateSrt(text, readSettings());
    srtPreview.value = srt;
    return srt;
  }

  generateBtn.addEventListener("click", function () {
    var srt = generate();
    if (srt !== undefined) {
      saveSrt(srt);
    }
  });

  inputText.addEventListener("keydown", function (ev) {
    if (ev.ctrlKey && ev.key === "Enter") {
      ev.preventDefault();
      var srt = generate();
      if (srt !== undefined) {
        saveSrt(srt);
      }
    }
  });

  /* ---------- 载入示例文本 ---------- */
  loadSampleBtn.addEventListener("click", async function () {
    // 英文模式直接载入内置英文示例
    if (currentMode() === "en") {
      inputText.value =
        "When you are writing subtitle scripts, you need to consider many practical details. " +
        "The length of each subtitle line should not exceed 80 characters including spaces. " +
        "We split sentences only at punctuation marks, and calculate duration based on character count. " +
        "You can adjust the seconds per character parameter to make the playback speed feel more natural.";
      setResult("英文示例文本已载入，可点击“生成”。", true);
      return;
    }

    var sample =
      "这是示例文本。它可以用来快速体验字幕生成功能，看看每句话是怎么按照字数上限和分隔符被切开的，" +
      "中文的逗号、句号、问号都会作为断句依据。当然，英文标点也可以，比如 Hello, world. How are you? " +
      "准备好了就点“生成”按钮吧！";

    try {
      var res = await fetch("asset/字幕文件样本.srt");
      if (res.ok) {
        var lines = (await res.text()).split(/\r?\n/);
        // 从样本 SRT 中提取纯文本行（去掉序号、时间轴和空行）
        sample = lines
          .filter(function (line) {
            var t = line.trim();
            return t.length > 0 && !/^\d+$/.test(t) && t.indexOf("-->") === -1;
          })
          .join(" ");
      }
    } catch (e) {
      // file:// 打开时 fetch 不可用，使用内置示例
    }

    inputText.value = sample;
    setResult("示例文本已载入，可点击“生成”。", true);
  });
})();
