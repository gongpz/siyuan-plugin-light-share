// 开发维护用工具（插件运行不需要）：把 design/ 里的样式与骨架重新内联到 index.js。
// 当视觉设计师更新 siyuan-share-tokens.css 或 siyuan-share-skeleton.html 后运行：
//   node tools/refresh-design-assets.js
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const entry = path.join(root, "index.js");
const cssPath = path.join(root, "design", "siyuan-share-tokens.css");
const skeletonPath = path.join(root, "design", "siyuan-share-skeleton.html");

const css = fs.readFileSync(cssPath, "utf8");
let skeleton = fs.readFileSync(skeletonPath, "utf8");

const cssMarker = "/* >>> INLINE: siyuan-share-tokens.css 的完整内容 <<< */";
if (skeleton.indexOf(cssMarker) < 0) throw new Error("骨架中找不到样式内联标记");
skeleton = skeleton.replace(cssMarker, function () { return css; });

// 目录占位符替换成动态 TOC，并预留资源注入点
skeleton = skeleton.replace(/<ul class="sy-toc__list">[\s\S]*?<\/ul>/, function () {
  return '<ul class="sy-toc__list">\n      {{TOC_ITEMS}}\n    </ul>';
});
skeleton = skeleton.replace(/^[ \t]*<meta property="og:image"[^\n]*\n/m, "");
skeleton = skeleton.replace(/<!--\s*\n\s*KaTeX 与 highlight\.js 的落地说明[\s\S]*?-->/, "");
// 正文滚动区可聚焦（键盘用户可用方向键阅读长文）
skeleton = skeleton.replace('<main class="sy-main" id="sy-main">',
  '<main class="sy-main" id="sy-main" tabindex="0" role="region" aria-label="正文">');
skeleton = skeleton.replace("</head>", function () { return "{{HEAD_RESOURCES}}\n</head>"; });
skeleton = skeleton.replace("</body>", function () { return "{{BODY_SCRIPTS}}\n</body>"; });

const lines = fs.readFileSync(entry, "utf8").split("\n");
function setConstant(name, value) {
  const prefix = "const " + name + " = ";
  const index = lines.findIndex(function (line) { return line.indexOf(prefix) === 0; });
  if (index < 0) throw new Error("index.js 中找不到常量 " + name);
  lines[index] = prefix + JSON.stringify(value) + ";";
}
setConstant("PAGE_CSS", css);
setConstant("PAGE_SKELETON", skeleton);
fs.writeFileSync(entry, lines.join("\n"), "utf8");
console.log("已内联 CSS " + css.length + " 字符，骨架 " + skeleton.length + " 字符");
