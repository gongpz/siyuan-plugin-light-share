// 交付前自检：零依赖的结构/语法检查；装了 jsdom 时额外跑真实 DOM 归一化测试。
// 运行：node tools/selfcheck.js
// 可选 DOM 测试：NODE_PATH=<jsdom 所在目录>/node_modules node tools/selfcheck.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const cp = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const passed = [];
const failed = [];

function check(name, condition, detail) {
  if (condition) {
    passed.push(name);
    console.log("  PASS  " + name + (detail ? "  " + detail : ""));
  } else {
    failed.push(name);
    console.log("  FAIL  " + name + (detail ? "  " + detail : ""));
  }
}

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

console.log("\n[1] 清单与文件");
const manifest = JSON.parse(read("plugin.json"));
check("plugin.json 是合法 JSON", true);
check("name 等于目录名", manifest.name === path.basename(ROOT), manifest.name + " / " + path.basename(ROOT));
check("frontends 含 desktop 与 browser-desktop",
  manifest.frontends.indexOf("desktop") >= 0 && manifest.frontends.indexOf("browser-desktop") >= 0,
  manifest.frontends.join(","));
check("minAppVersion 为 3.1.0", manifest.minAppVersion === "3.1.0", manifest.minAppVersion);
["index.js", "index.css", "i18n/zh_CN.json", "i18n/en_US.json", "icon.png", "preview.png", "README.md"]
  .forEach(function (file) { check("存在 " + file, fs.existsSync(path.join(ROOT, file))); });

console.log("\n[2] 入口与语法");
const source = read("index.js");
let syntaxOk = true;
let syntaxError = "";
try {
  cp.execFileSync(process.execPath, ["--check", path.join(ROOT, "index.js")], { stdio: "pipe" });
} catch (error) {
  // 受限环境（沙箱）不允许管道捕获子进程输出时会报 EPERM，此时用 ignore 再验证一次语法
  if (String(error.code || error.message).indexOf("EPERM") >= 0) {
    try {
      cp.execFileSync(process.execPath, ["--check", path.join(ROOT, "index.js")], { stdio: "ignore" });
    } catch (retry) {
      syntaxOk = false;
      syntaxError = String(retry.message || retry).split("\n")[0];
    }
  } else {
    syntaxOk = false;
    syntaxError = String(error.stderr || error.message).split("\n")[0];
  }
}
check("node --check index.js", syntaxOk, syntaxError);
check("CommonJS 引入 siyuan", /require\(["']siyuan["']\)/.test(source));
check("exports.default 导出类", /exports\.default\s*=\s*StaticSharePlugin/.test(source));
check("类 extends Plugin", /class\s+StaticSharePlugin\s+extends\s+Plugin/.test(source));
check("文档树右键事件走 eventBus.on", /eventBus\.on\(\s*"open-menu-doctree"/.test(source));
check("入口不是 dist/index.js", !/dist\/index\.js/.test(source));
check("未手写 Authorization 请求头", !/["']Authorization["']\s*:/.test(source));
check("未引用 /stage/ 作为页面资源", !/src="\/stage\//.test(source));
check("归一化使用 DOMParser", /new\s+DOMParser\(/.test(source));

console.log("\n[3] 图片尺寸");
function pngSize(file) {
  const buffer = fs.readFileSync(path.join(ROOT, file));
  if (buffer.toString("ascii", 1, 4) !== "PNG") return null;
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}
const iconSize = pngSize("icon.png");
const previewSize = pngSize("preview.png");
check("icon.png 为 160×160", !!iconSize && iconSize[0] === 160 && iconSize[1] === 160, JSON.stringify(iconSize));
check("preview.png 为 1024×768", !!previewSize && previewSize[0] === 1024 && previewSize[1] === 768, JSON.stringify(previewSize));

console.log("\n[4] i18n 完整性");
const zh = JSON.parse(read("i18n/zh_CN.json"));
const en = JSON.parse(read("i18n/en_US.json"));
const zhKeys = Object.keys(zh);
const enKeys = Object.keys(en);
check("中英文 key 数量一致", zhKeys.length === enKeys.length, zhKeys.length + " / " + enKeys.length);
check("中英文 key 集合一致", zhKeys.every(function (key) { return key in en; }) && enKeys.every(function (key) { return key in zh; }));
const usedKeys = [];
let match;
const keyPattern = /\bt\("([A-Za-z0-9_.]+)"/g;
while ((match = keyPattern.exec(source)) !== null) usedKeys.push(match[1]);
// fieldText/fieldSelect/fieldSwitch 的 label 与选项文案键是间接传给 t() 的
const fieldLabelPattern = /\.field(?:Text|Select|Switch)\(\s*"[^"]+",\s*"([A-Za-z0-9_.]+)"/g;
while ((match = fieldLabelPattern.exec(source)) !== null) usedKeys.push(match[1]);
const optionPattern = /\[\s*"[^"]*",\s*"([A-Za-z]+\.[A-Za-z0-9_.]+)"\s*\]/g;
while ((match = optionPattern.exec(source)) !== null) usedKeys.push(match[1]);
const missing = Array.from(new Set(usedKeys)).filter(function (key) { return !(key in zh || key in en); });
check("源码中全部文案 key（含间接引用）均存在", missing.length === 0, missing.join(","));

console.log("\n[5] 在沙箱中加载 index.js 并验证生成逻辑");
const stubPlugin = class {};
const sandbox = {
  exports: {},
  module: { exports: {} },
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  TextEncoder: TextEncoder,
  TextDecoder: TextDecoder,
  Uint8Array: Uint8Array,
  FormData: class {},
  Blob: class {},
  Headers: Headers,
  fetch: function () {},
  btoa: btoa,
  atob: atob,
  navigator: {},
  window: { addEventListener: function () {}, removeEventListener: function () {} },
  document: {},
  require: function (name) {
    if (name !== "siyuan") throw new Error("unexpected require: " + name);
    return {
      Plugin: stubPlugin, Dialog: class {}, showMessage: function () {}, fetchPost: function () {},
      getActiveEditor: function () {}, getAllEditor: function () { return []; },
      platformUtils: {}, Constants: { SIYUAN_APPID: "selfcheck" }
    };
  }
};
vm.createContext(sandbox);
vm.runInContext(
  source + "\n;globalThis.__t = {makeSlug, validateSlug, renderPage, pageResources, tocHtml, normalizeContent, PAGE_CSS, PAGE_SKELETON, md5Hex, gateHash, makeGate, gateScriptLines, pageRuntimeScript, protectBadge, qrMatrix, qrSvg, formatPageUrl, stripDuplicateTitle, remoteEnabled, buildStamp, fmt};",
  sandbox
);
const api = sandbox.__t;
check("沙箱可加载且导出类可用", typeof sandbox.exports.default === "function");

const slugCases = [
  ["My Weekly Note", "20260101120000-aa11bb"],
  ["我的周报", "20260101120000-cc22dd"],
  ["2026 年度总结", "20260101120000-ee33ff"],
  ["", "20260101120000-ff44gg"]
];
const settings = {
  domain: "https://note.imask.cc", pathPrefix: "public", slugStyle: "auto", slugPrefix: "",
  slugHash: "on", toc: true, theme: "auto", staticDir: "_static", math: "shared",
  highlight: "shared", imageMode: "folder", imageLazy: true, singleFile: false
};
const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
slugCases.forEach(function (item) {
  const slug = api.makeSlug(item[0], item[1], settings);
  check("slug 合规: " + JSON.stringify(item[0]), slugRe.test(slug) && slug.length <= 64, slug);
});
const slugA = api.makeSlug("My Weekly Note", "20260101120000-aa11bb", settings);
const slugB = api.makeSlug("My Weekly Note", "20260101120000-aa11bb", settings);
check("相同输入生成 slug 稳定且包含短哈希",
  slugA === slugB && slugA.indexOf("aa11bb") >= 0, slugA);
check("md5 兜底为 32 位十六进制", /^[0-9a-f]{32}$/.test(api.md5Hex("siyuan")), api.md5Hex("siyuan"));
check("手动 slug 空格被拒绝", api.validateSlug("my note") === "space");
check("手动 slug 大写被拒绝", api.validateSlug("MyNote") === "chars");
check("手动 slug 合法形态通过", api.validateSlug("my-note-a3f9c2") === "ok");

console.log("\n[6] 生成页静态检查");
let pageHtml = "";
let JSDOM = null;
try { JSDOM = require("jsdom").JSDOM; } catch (e) { /* 可选依赖 */ }

if (JSDOM) {
  sandbox.DOMParser = new JSDOM("").window.DOMParser;
  const sample = [
    '<div class="protyle-wysiwyg__block" data-type="paragraph">正文段落。</div>',
    '<div class="callout-warning"><div class="callout-title">注意</div><div class="callout-content"><p>内容</p></div></div>',
    '<pre><code class="language-html">const html = \'&lt;div class="callout-info"&gt;\';\nclass="protyle-wysiwyg__block" 必须保持不变;</code></pre>',
    '<p><img src="assets/diagram.png" data-src="assets/diagram.png" alt="示意图"></p>',
    '<span data-type="math-block" data-content="E=mc^2"></span>',
    '<table><tbody><tr><td>1</td></tr></tbody></table>'
  ].join("\n");
  const normalized = api.normalizeContent(sample, settings);
  check("DOM 归一化：内核块类被重映射", /class="sy-doc__block/.test(normalized.html));
  check("DOM 归一化：callout 被重映射", /class="sy-callout sy-callout--warning/.test(normalized.html));
  check("DOM 归一化：代码块被包装", /class="sy-code/.test(normalized.html));
  check("DOM 归一化：图片 src 零改写", /src="assets\/diagram\.png"/.test(normalized.html));
  check("DOM 归一化：表格被包裹", /class="sy-table-wrap"/.test(normalized.html));
  check("归一化未破坏 <pre> 文本", normalized.html.indexOf("class=\"protyle-wysiwyg__block\" 必须保持不变") >= 0);
  check("归一化未破坏 callout 示例文本", normalized.html.indexOf("class=\"callout-info\"") >= 0);

  const resources = api.pageResources(settings, { mhchemKnown: true }, "https://note.imask.cc/public/test/");
  pageHtml = api.renderPage({
    title: "测试文档", summary: "摘要", author: "", pageUrl: "https://note.imask.cc/public/test/",
    notebook: "测试本", updatedAt: "2026-11-16", words: 1234,
    tocHtml: api.tocHtml(normalized.toc), head: resources.head, scripts: resources.scripts,
    content: normalized.html, theme: "auto",
    footerBrand: "由思源笔记导出", footerNote: "本页面为静态快照，内容可能与源文档存在差异。"
  });
  check("生成页是完整 HTML 文档", /^<!DOCTYPE html>/i.test(pageHtml) && /<html[\s>]/.test(pageHtml) && /<head>/.test(pageHtml) && /<body>/.test(pageHtml));
  check("生成页含 assets/ 相对路径", pageHtml.indexOf('src="assets/diagram.png"') >= 0);
  check("生成页无占位符残留", !/\{\{[A-Z_]+\}\}/.test(pageHtml));
  const doc = new JSDOM(pageHtml).window.document;
  const forbidden = doc.querySelectorAll('[src^="/assets/"], [href^="/assets/"], [src^="/stage/"], [href^="/stage/"], [src^="/appearance/"], [href^="/appearance/"]');
  check("生成页无 /assets/ /stage/ /appearance/ 绝对引用", forbidden.length === 0, forbidden.length + " 个");
  check("生成页含内嵌设计令牌", pageHtml.indexOf("--sy-accent") >= 0);
  check("生成页含公开访问提示语义（footer）", /静态快照/.test(pageHtml));
  const dupNorm = api.normalizeContent('<div data-type="NodeHeading" data-subtype="h1"><div>重复标题</div></div><div data-type="NodeParagraph"><div>正文</div></div>', settings);
  const dupRemoved = api.stripDuplicateTitle(dupNorm, "重复标题");
  check("与文档标题相同的首个 H1 被移除", dupRemoved && dupNorm.root.querySelectorAll("h1,[data-subtype='h1']").length === 0);
} else {
  console.log("  SKIP  DOM 归一化与生成页检查（未找到 jsdom；安装后可重跑）");
}

console.log("\n[7] v1.1 入口与交互");
check("首启不自动弹引导窗", !/setTimeout\s*\(\s*function\s*\(\)\s*\{\s*self\.showGuide/.test(source));
check("设置面板内有向导入口", /data-ss-action="guide"/.test(source) && /settings\.guideEntryTitle/.test(source));
check("仅单一导出入口（无独立带保护通道）", !/publishProtected\(/.test(source) && !/menu\.exportProtected/.test(source));
check("杂志排版令牌已内联（靛蓝强调色）", source.indexOf("#1B4DB1") >= 0);
check("纸墨旧色已清除", source.indexOf("#A34A24") < 0 && source.indexOf("#FCFBF9") < 0);

console.log("\n[8] v1.3 密码软校验（限时分享已移除）");
const gateApi = api;
// 无密码：不产生 gate
check("无密码返回 null", gateApi.makeGate({ password: "" }, {}) === null);
// 仅密码：产生 passHash
const gatePin = gateApi.makeGate({ password: "1234" }, {});
check("仅密码：生成 passHash", !!(gatePin && gatePin.passHash && gatePin.passSalt));
check("明文密码不进入 gate 对象", gatePin && JSON.stringify(gatePin).indexOf("1234") < 0);
check("gate 哈希可复现", gatePin && gateApi.gateHash("1234", gatePin.passSalt) === gatePin.passHash);
// 文档级覆盖
const gateOverride = gateApi.makeGate({ password: "9999" }, { password: "1357" });
check("单文档密码覆盖设置默认值", gateOverride && gateApi.gateHash("1357", gateOverride.passSalt) === gateOverride.passHash);
// 空字符串 doc.password 不遮蔽设置默认值（v1.2 取值 bug 回归测试）
check("doc.password 空串回退设置默认值", (() => { const g = gateApi.makeGate({ password: "2468" }, { password: "" }); return !!g && gateApi.gateHash("2468", g.passSalt) === g.passHash; })());
// 无效密码被忽略
check("非 4 位数字密码被忽略", gateApi.makeGate({ password: "12a4" }, {}) === null);
// gate 脚本逻辑
const gateLines = gateApi.gateScriptLines(gatePin, "abc").join("\n");
check("限时逻辑已彻底移除", gateLines.indexOf("expireAt") < 0 && source.indexOf("expireMode") < 0);
check("gate 脚本含密码遮罩 sy-gate", /sy-gate/.test(gateLines));
check("密码输入是单输入框（非 4 格）", /sy-gate__input/.test(gateLines) && (gateLines.match(/maxlength=.4./g) || []).length === 1);
check("密码遮罩已移除轻量保护提示", gateLines.indexOf("轻量保护") < 0 && gateLines.indexOf("sy-gate__notice") < 0);
check("sessionStorage 只缓存密码通过态", /sessionStorage\.setItem\(passKey, gate\.passHash\)/.test(gateLines));
check("sessionStorage 不缓存过期判定", !/sessionStorage[^;]*expire/i.test(gateLines));
check("未过期正文渲染由 __syGatePassed 控制", /__syGatePassed/.test(gateLines) && /window\.__syGatePassed = true/.test(gateLines));
check("解锁后搬移 template 正文", /sy-gated-content/.test(gateLines) && /appendChild/.test(gateLines));
// renderPage template 包裹
const tplPage = gateApi.renderPage({
  title: "x", summary: "", author: "", pageUrl: "https://note.imask.cc/public/x/", notebook: "",
  updatedAt: "2026-11-16", words: 1, tocHtml: "", head: "", scripts: "",
  content: "<p>secret</p>", gated: true, theme: "auto"
});
check("受保护页正文写入 template（不进 DOM）", tplPage.indexOf('<template id="sy-gated-content">') >= 0);
const plainPage = gateApi.renderPage({
  title: "x", summary: "", author: "", pageUrl: "https://note.imask.cc/public/x/", notebook: "",
  updatedAt: "2026-11-16", words: 1, tocHtml: "", head: "", scripts: "",
  content: "<p>public</p>", gated: false, theme: "auto"
});
check("非保护页正文不进 template", plainPage.indexOf("sy-gated-content") < 0 && plainPage.indexOf("<p>public</p>") >= 0);

console.log("\n[9] v1.1 弹窗布局 CSS 契约");
const css = read("index.css");
check("CSS 已切换靛蓝主题", css.indexOf("#1B4DB1") >= 0 && css.indexOf("#A34A24") < 0);
check("表单标签在上（.ss-field 为 block）", /\.ss-field\s*\{[^}]*display:\s*block/.test(css));
const inputBlock = (css.match(/\.ss-input,\s*\.ss-select\s*\{[\s\S]*?\}/) || [""])[0];
check("输入框 box-sizing 与宽度约束", /box-sizing:\s*border-box/.test(inputBlock) && /width:\s*100%/.test(inputBlock) && /min-width:\s*0/.test(inputBlock));
check("flex 子项 min-width:0 保护", (css.match(/min-width:\s*0/g) || []).length >= 8);
check("提示框任意处换行", /overflow-wrap:\s*anywhere/.test(css));
check("错误提示 role=alert 样式", /\[role="alert"\]/.test(css));
check("新组件样式齐全", [".ss-notice", ".ss-guide-entry", ".ss-fs", ".ss-quick", ".ss-warn", ".ss-badge"].every(function (c) { return css.indexOf(c) >= 0; }));
check("保护状态徽标已接入管理列表", /protectBadge\(page, t\)/.test(source));

console.log("\n[10] v1.2 统一分享面板 / 二维码 / 页脚与地址");
check("分享面板方法存在", /showSharePanel\(result\)/.test(source) && /applyShareProtection\(result, overrides\)/.test(source));
check("二维码生成器零依赖（未 require 外部库）", !/require\(["'](?:qrcode|jsqr)["']\)/.test(source));
const qr1 = api.qrMatrix("https://note.imask.cc/public/abc/");
const qr2 = api.qrMatrix("https://note.imask.cc/public/abc/");
check("二维码矩阵确定性", qr1.size === qr2.size && JSON.stringify(qr1.modules) === JSON.stringify(qr2.modules));
check("二维码尺寸为 QR 标准 4V+17", (qr1.size - 17) % 4 === 0 && qr1.size >= 21);
check("二维码含功能图形（三角定位）",
  qr1.modules[0][0] && qr1.modules[0][1] && qr1.modules[0][6] &&
  qr1.modules[6][0] && qr1.modules[6][6] && qr1.modules[3][3]);
check("二维码 SVG 输出合法", /<svg[^>]*viewBox=/.test(api.qrSvg("https://note.imask.cc/public/abc/", 4)) && api.qrSvg("x").indexOf("<rect") > 0);
check("地址格式：默认模板", api.formatPageUrl({ domain: "https://note.imask.cc", pathPrefix: "public" }, "abc") === "https://note.imask.cc/public/abc/");
check("地址格式：自定义模板（补尾斜杠）",
  api.formatPageUrl({ domain: "https://note.imask.cc", pathPrefix: "share", linkFormat: "{domain}/p/{slug}" }, "abc") === "https://note.imask.cc/p/abc/");
check("地址格式：全部占位符",
  api.formatPageUrl({ domain: "https://x.cn/", pathPrefix: "pub/", linkFormat: "{domain}/{prefix}/{slug}/" }, "doc") === "https://x.cn/pub/doc/");
check("页脚字段已接入 DEFAULT_SETTINGS", /footerBrand:/.test(source) && /footerNote:/.test(source) && /linkFormat:/.test(source));
check("骨架页脚使用占位符", PAGE_SKELETON_CHECK());
function PAGE_SKELETON_CHECK() {
  return source.indexOf("{{FOOTER_BRAND}}") >= 0 && source.indexOf("{{FOOTER_NOTE}}") >= 0;
}
const footHtml = api.renderPage({
  title: "x", summary: "", author: "", pageUrl: "https://note.imask.cc/public/x/", notebook: "",
  updatedAt: "2026-11-16", words: 1, tocHtml: "", head: "", scripts: "", content: "<p>x</p>",
  theme: "auto", footerBrand: "自定义署名", footerNote: "自定义说明"
});
check("页脚自定义文本进入生成页", footHtml.indexOf("自定义署名") >= 0 && footHtml.indexOf("自定义说明") >= 0);
check("生成页无页脚占位符残留", footHtml.indexOf("{{FOOTER_BRAND}}") < 0 && footHtml.indexOf("{{FOOTER_NOTE}}") < 0);
const applyBlock = (source.match(/async applyShareProtection\([\s\S]*?\n  \}/) || [""])[0];
check("就地应用权限不重新导出（无 exportHTML 调用）", applyBlock.indexOf("putBytes") >= 0 && applyBlock.indexOf("exportHTML") < 0);
check("设置面板含地址格式与页脚分组", /settings\.groupFooter/.test(source) && /settings\.linkFormat/.test(source));
check("分享面板 CSS 存在", /\.ss-share__top/.test(css) && /\.ss-share__qrbox/.test(css));

console.log("\n[11] v1.3 后台管理 / 密码修复 / 官方设置齿轮");
check("重写 openSetting（齿轮入口指向后台管理）",
  /openSetting\(\)\s*\{/.test(source) && /openSetting\(\)\s*\{[\s\S]{0,120}showManager\(\)/.test(source));
check("限时分享已彻底移除", !/expireMode|expireQuick|protect\.1h|ss-share-expire/.test(source));
check("后台管理只做页面管理（页脚编辑留在设置面板）", !/ss-manage__footer/.test(source) && /applyFooterToAll/.test(source));
check("页脚应用走静默重导出", /publishOne\([^)]*,\s*\{\s*quiet:\s*true\s*\}\)/.test(source));
check("暂停/恢复操作存在", /pausePage\(/.test(source) && /resumePage\(/.test(source) && /renderPausedPage\(\)/.test(source));
const pausedBody = (source.match(/renderPausedPage\(\)\s*\{[\s\S]*?\n  \}/) || [""])[0];
check("暂停页不泄露文档标题", pausedBody.indexOf("sy-expired") >= 0 && pausedBody.indexOf("docName") < 0 && pausedBody.indexOf("{{DOC_TITLE}}") < 0);
check("暂停/恢复徽标存在", /badgePaused/.test(source));
check("重新发布沿用已存密码哈希（保护不丢失）", /prev\.passHash && prev\.passSalt/.test(source));
check("就地应用不再双重包裹 template", !/content:\s*gated\s*\?\s*'<template/.test(source));
check("解锁脚本兼容嵌套 template（防御性解包）", /n\.tagName === 'TEMPLATE'/.test(gateLines));
check("顶栏左上角标题已删除", PAGE_SKELETON_TOPBAR());
function PAGE_SKELETON_TOPBAR() {
  return api.PAGE_SKELETON.indexOf("sy-header__title") < 0;
}
check("正文大标题字号已下调（28px）", /\.sy-doc-head h1 \{[\s\S]{0,120}font-size: 1\.75rem;/.test(api.PAGE_CSS) && api.PAGE_CSS.indexOf("--sy-fs-5xl); line-height: var(--sy-lh-tight); letter-spacing: var(--sy-track-display)") < 0);
check("页面元信息不再显示笔记本标签", (function(){const m=(api.PAGE_SKELETON.match(/<p class="sy-doc-head__meta">[\s\S]*?<\/p>/)||[""])[0];return !!m && m.indexOf("sy-badge")<0 && m.indexOf("{{NOTEBOOK_NAME}}")<0;})());
check("分享页管理为弹窗且列表为三栏行布局", /showManager\(\)\s*\{[\s\S]{0,220}openDialog\(t\("manage\.title"\)/.test(source) && /ss-page__main/.test(source) && /ss-page__meta/.test(source) && /ss-page__actions/.test(source));
check("分享面板权限区仅剩密码表单", !/datetime-local" id="ss-share-exact/.test(source));

console.log("\n[12] v1.4 远程直传 / 文案插值 / 重复标题");
check("fmt 正确替换 {0}", api.fmt("已写入 {0} 张图片", 0) === "已写入 0 张图片");
check("远程直传需同时具备开关/地址/Token",
  api.remoteEnabled({ remotePublish: true, remoteBase: "https://note.imask.cc", remoteToken: "t" }) === true &&
  api.remoteEnabled({ remotePublish: true, remoteBase: "https://note.imask.cc", remoteToken: "" }) === false &&
  api.remoteEnabled({ remotePublish: false, remoteBase: "https://x", remoteToken: "t" }) === false);
check("build stamp 格式稳定", /^\d{8}T\d{6}-[a-z0-9]+$/.test(api.buildStamp()));
const stamped = api.renderPage({
  title: "x", summary: "", author: "", pageUrl: "https://note.imask.cc/public/x/", notebook: "",
  updatedAt: "2026-11-17", words: 1, tocHtml: "", head: "", scripts: "", content: "<p>x</p>",
  theme: "auto", buildStamp: "20261117T120000-abc123"
});
check("生成页带 sy-build 校验标记", /name="sy-build" content="20261117T120000-abc123"/.test(stamped));
check("默认设置含远程直传字段", /remotePublish: false/.test(source) && /remoteToken: ""/.test(source));
check("发布链路含远程写入与回读校验", /remotePutBytes\(settings, pageDir \+ "\/index.html"/.test(source) && /remoteVerifyPage\(pageUrl, stamp\)/.test(source));
check("进度浮层完成后关闭", /this\.closeToast\(\);[\s\S]{0,80}progressGuard/.test(source));
check("远程 Token 只在请求头使用", /Authorization = "Token " \+ settings\.remoteToken/.test(source));

console.log("\n结果：" + passed.length + " 通过 / " + failed.length + " 失败\n");
if (failed.length) process.exitCode = 1;
