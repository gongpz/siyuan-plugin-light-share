// 端到端运行时验证：在 jsdom 里真实执行生成的静态页脚本，
// 验证限时/密码软校验三条关键路径。零外部服务依赖。
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(ROOT, "index.js"), "utf8");
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log("  PASS  " + name + (detail ? "  " + detail : "")); }
  else { fail++; console.log("  FAIL  " + name + (detail ? "  " + detail : "")); }
}

// 在沙箱里加载插件源码，拿到 gate/渲染函数
const stubPlugin = class {};
const sandbox = {
  exports: {}, module: { exports: {} }, console, setTimeout, clearTimeout,
  TextEncoder, TextDecoder, Uint8Array, Uint8ClampedArray, FormData: class {}, Blob: class {},
  Headers, fetch: function () {}, btoa, atob, navigator: {},
  window: { addEventListener: function () {}, removeEventListener: function () {} },
  document: {},
  require: function (name) {
    if (name !== "siyuan") throw new Error("unexpected require " + name);
    return { Plugin: stubPlugin, Dialog: class {}, showMessage: function () {}, fetchPost: function () {},
      getActiveEditor: function () {}, getAllEditor: function () { return []; },
      platformUtils: {}, Constants: { SIYUAN_APPID: "verify" } };
  }
};
vm.createContext(sandbox);
vm.runInContext(source + "\n;globalThis.__api={PAGE_CSS,PAGE_SKELETON,renderPage,pageResources,makeGate,gateHash,normalizeContent,tocHtml,qrMatrix,formatPageUrl};", sandbox);
const api = sandbox.__api;

const settings = { domain: "https://note.imask.cc", pathPrefix: "public", theme: "auto", staticDir: "_static",
  math: "off", highlight: "off", singleFile: false, toc: false, imageMode: "folder", imageLazy: false };
const content = '<p class="sy-doc__block">这是受保护的正文内容 SECRET_MARKER。</p>';

function buildHtml(gate, gated) {
  const res = api.pageResources(settings, {}, "https://note.imask.cc/public/demo/", gate, "demo");
  return api.renderPage({ title: "受保护文档", summary: "", author: "", pageUrl: "https://note.imask.cc/public/demo/",
    notebook: "", updatedAt: "2026-11-16", words: 10, tocHtml: "", head: res.head, scripts: res.scripts,
    content: content, gated: !!gated, theme: "auto" });
}

function runScripts(html) {
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://note.imask.cc/public/demo/" });
  const scripts = Array.from(dom.window.document.querySelectorAll("script"));
  let session = {};
  Object.defineProperty(dom.window, "sessionStorage", { value: {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(session, k) ? session[k] : null; },
    setItem: function (k, v) { session[k] = String(v); },
    removeItem: function (k) { delete session[k]; }
  }, configurable: true });
  for (const s of scripts) {
    if (!s.textContent || !s.textContent.trim()) continue;
    try { dom.window.eval(s.textContent); } catch (e) { /* 部分为外链脚本占位 */ }
  }
  // 触发 DOMContentLoaded（脚本用 ready 包装）
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded", { bubbles: true }));
  return { dom: dom, session: function () { return session; } };
}

console.log("\n[A] 密码保护页：错误密码不解锁，正确密码解锁");
const pin = "1357";
const gate = api.makeGate({ expireMode: "off", password: pin }, {});
const html = buildHtml(gate, true);
let env = runScripts(html);
let doc = env.dom.window.document;
check("初始出现密码遮罩", !!doc.querySelector(".sy-gate"));
check("初始正文仍在 template 未进 DOM", !doc.body.textContent.includes("SECRET_MARKER"));
check("初始 body 带 sy-locked", doc.body.classList.contains("sy-locked"));
// 输错密码
const input = doc.querySelector(".sy-gate__input");
const submit = doc.querySelector(".sy-gate__submit");
input.value = "0000";
submit.click();
check("错误密码：遮罩仍在", !!doc.querySelector(".sy-gate"));
check("错误密码：显示错误提示", (doc.querySelector(".sy-gate__error") || {}).textContent !== "");
// 输对密码
input.value = pin;
submit.click();
check("正确密码：遮罩移除", !doc.querySelector(".sy-gate"));
check("正确密码：正文搬入 DOM", doc.body.textContent.includes("SECRET_MARKER"));
check("正确密码：body 解除 sy-locked", !doc.body.classList.contains("sy-locked"));
check("正确密码：sessionStorage 记录通过态", Object.values(env.session()).length === 1);

console.log("\n[B] 密码保护页：sessionStorage 命中自动解锁");
let env2 = runScripts(html);
// 预置会话后重新执行
let session2 = {};
{
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://note.imask.cc/public/demo/" });
  session2 = {};
  Object.defineProperty(dom.window, "sessionStorage", { value: {
    getItem: function (k) { return session2[k] != null ? session2[k] : null; },
    setItem: function (k, v) { session2[k] = String(v); },
    removeItem: function (k) { delete session2[k]; }
  }, configurable: true });
  session2["ss_pass_demo"] = gate.passHash;
  for (const s of Array.from(dom.window.document.querySelectorAll("script"))) {
    if (s.textContent && s.textContent.trim()) { try { dom.window.eval(s.textContent); } catch (e) {} }
  }
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded", { bubbles: true }));
  check("会话已解锁：无遮罩", !dom.window.document.querySelector(".sy-gate"));
  check("会话已解锁：正文可见", dom.window.document.body.textContent.includes("SECRET_MARKER"));
}

console.log("\n[C] 无密码 gate：正文直接可见（限时分享已移除，暂停页由插件侧整体替换）");
const okGate = null;
const okHtml = buildHtml(okGate, false);
const env4 = runScripts(okHtml);
check("无密码页正文可见", env4.dom.window.document.body.textContent.includes("SECRET_MARKER"));
check("无密码页无遮罩", !env4.dom.window.document.querySelector(".sy-gate"));

console.log("\n[E] 二维码可被标准解码器识别（jsQR 交叉验证）");
let jsQR = null;
try { jsQR = require("jsqr"); } catch (e) { /* 可选依赖：未安装则跳过 */ }
if (jsQR) {
  function toImage(text) {
    const m = api.qrMatrix(text), q = 4, S = 8, dim = (m.size + q * 2) * S;
    const data = new Uint8ClampedArray(dim * dim * 4);
    for (let y = 0; y < dim; y++) {
      for (let x = 0; x < dim; x++) {
        const mx = Math.floor(x / S) - q, my = Math.floor(y / S) - q;
        const dark = mx >= 0 && mx < m.size && my >= 0 && my < m.size && m.modules[my][mx];
        const i = (y * dim + x) * 4, v = dark ? 0 : 255;
        data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
      }
    }
    return { data: data, w: dim, h: dim };
  }
  const urls = [
    "https://note.imask.cc/public/abc123/",
    "https://note.imask.cc/public/my-weekly-note-2026/",
    "https://example.com/s/中文路径/"
  ];
  urls.forEach(function (u) {
    const img = toImage(u);
    const decoded = jsQR(img.data, img.w, img.h);
    check("二维码解码一致: " + u, !!decoded && decoded.data === u, decoded ? decoded.data : "no decode");
  });
} else {
  console.log("  SKIP  jsQR 未安装（npm install jsqr --no-save 后可重跑）");
}

console.log("\n[F] 就地应用分享权限：正文保留 / 链接不变 / 状态正确");
{
  let src2 = source.replace(/async function putBytes\(path, content, isDir\) \{[\s\S]*?\n\}/,
    "async function putBytes(path, content, isDir) { if (!isDir) globalThis.__written[path]=content; return true; }\n");
  const written = {};
  const sb2 = {
    exports: {}, module: { exports: {} }, console, setTimeout, clearTimeout,
    TextEncoder, TextDecoder, Uint8Array, Uint8ClampedArray, FormData: class {}, Blob: class {},
    Headers, fetch: function () {}, btoa, atob, navigator: {}, __written: written,
    window: { addEventListener: function () {}, removeEventListener: function () {} }, document: {},
    require: function (name) {
      if (name !== "siyuan") throw new Error(name);
      return { Plugin: class {}, Dialog: class {}, showMessage: function () {}, fetchPost: function () {},
        getActiveEditor: function () {}, getAllEditor: function () { return []; },
        platformUtils: {}, Constants: { SIYUAN_APPID: "verify" } };
    }
  };
  vm.createContext(sb2);
  vm.runInContext(src2 + "\n;globalThis.__cls=StaticSharePlugin;", sb2);
  const P = sb2.__cls, inst = Object.create(P.prototype);
  inst.settings = { domain: "https://note.imask.cc", pathPrefix: "public", theme: "auto",
    footerBrand: "署名", footerNote: "说明", password: "",
    singleFile: false, math: "off", highlight: "off", staticDir: "_static" };
  inst.state = { pages: { abc: { docId: "d1", docName: "测试", protected: false, updatedAt: 1 } }, slugs: { d1: "abc" } };
  inst.sharedAssets = {}; inst.log = function () {}; inst.saveState = function () { return Promise.resolve(); };
  const result = { ok: true, slug: "abc", url: "https://note.imask.cc/public/abc/", title: "测试", doc: { id: "d1", name: "测试" },
    renderArgs: { title: "测试", summary: "", notebook: "", updatedAt: "2026-11-16", words: 10, tocHtml: "",
      content: "<p>正文标记 SECRET</p>", pageUrl: "https://note.imask.cc/public/abc/", theme: "auto",
      footerBrand: "署名", footerNote: "说明", slug: "abc", pageDir: "/data/public/abc" } };
  (async function () {
    const ok1 = await inst.applyShareProtection(result, { password: "1357" });
    const html = written["/data/public/abc/index.html"] || "";
    const pg = inst.state.pages.abc;
    check("应用权限返回成功", ok1 === true);
    check("正文保留（未重新导出）", html.indexOf("SECRET") >= 0);
    check("受保护正文进单层 template（无双包裹）",
      html.indexOf("sy-gated-content") >= 0 && (html.match(/<template id="sy-gated-content">/g) || []).length === 1);
    check("页脚字段随就地重渲染保留", html.indexOf("署名") >= 0 && html.indexOf("说明") >= 0);
    check("state 标记已设密码", pg.protected === true);
    check("state 保存哈希与盐", !!(pg.passHash && pg.passSalt));
    check("链接 slug 不变", result.url === "https://note.imask.cc/public/abc/");
    const ok2 = await inst.applyShareProtection(result, { password: "" });
    const html2 = written["/data/public/abc/index.html"] || "";
    check("清除保护后正文直接可见", ok2 && html2.indexOf("sy-gated-content") < 0 && html2.indexOf("SECRET") >= 0);
    check("清除后 state 标记复位", inst.state.pages.abc.protected === false);
    finish();
  })();
  return; // 异步段由 finish() 输出最终结果
}

function finish() {
  console.log("\n结果：" + pass + " 通过 / " + fail + " 失败\n");
  if (fail) process.exitCode = 1;
}
