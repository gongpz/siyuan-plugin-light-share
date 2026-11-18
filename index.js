"use strict";

const {
  Plugin,
  Dialog,
  showMessage,
  fetchPost,
  openTab,
  getActiveEditor,
  getAllEditor,
  platformUtils,
  Constants
} = require("siyuan");

const PLUGIN_NAME = "siyuan-static-share";
const PLUGIN_VERSION = "1.0.0";
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ASSET_NAME_RE = /^[a-zA-Z0-9._-]+$/;
// 进度浮层兜底时长：超过这个时间仍未完成，强制给出可关闭的错误浮层
const PROGRESS_HARD_TIMEOUT = 180000;
// 远程直传单次请求超时
const REMOTE_TIMEOUT = 60000;

// 静态页样式与骨架来自 design/ 目录，已内联以免运行时依赖插件目录内的文件读取
const PAGE_CSS = "/* ==========================================================================\n   思源笔记 · 静态分享页设计令牌 v1.1「杂志排版式 Editorial / Magazine」\n   --------------------------------------------------------------------------\n   方向：高对比黑白灰基底 + 单一编辑强调色（靛蓝）+ 大字号衬线标题 +\n         首字下沉 / 粗分割线 / 编辑式留白，强调图文层次与视觉冲击。\n   替换说明：本文件整体替换 v1.0「纸墨 Paper & Ink」，不做叠加。\n   --------------------------------------------------------------------------\n   依赖：无。不依赖思源内核 CSS、不依赖 /assets/ /stage/ /appearance/。\n   class 契约：全部沿用工程侧 index.js 生成逻辑中的 sy- 类名，未新增/改名。\n   新增 class：.sy-gate*（密码遮罩）、.sy-expired*（失效页），需工程侧在生成\n   HTML 时带上（详见 siyuan-share-components.md）。\n   --------------------------------------------------------------------------\n   对比度（脚本实算，非估算）：\n     正文 ink/paper 18.88:1 · muted/paper 8.88:1 · subtle/paper 6.03:1\n     强调 accent/paper 7.66:1 · 白字/accent 7.66:1\n     控件边界 border-control：浅色 paper 3.47 / surface 3.32 / sunken 3.04\n     深色 paper 3.71 / surface 3.44 / sunken 3.12（均 ≥3:1，满足 WCAG 1.4.11）\n   ========================================================================== */\n\n/* 0. 主题机制：默认跟随系统，手动切换锁定 data-theme */\n:root { color-scheme: light dark; }\n:root[data-theme=\"light\"] { color-scheme: light; }\n:root[data-theme=\"dark\"]  { color-scheme: dark; }\n\n/* 1. 颜色 · 语义层 */\n:root {\n  --sy-paper:        light-dark(#FFFFFF, #0E0E0F);\n  --sy-surface:      light-dark(#FAFAF8, #171719);\n  --sy-sunken:       light-dark(#F1F0ED, #202023);\n  --sy-overlay:      light-dark(rgba(17,17,17,.52), rgba(0,0,0,.70));\n\n  --sy-ink:          light-dark(#111111, #F5F5F3);      /* 18.88 / 17.68 */\n  --sy-ink-muted:    light-dark(#4A4A48, #B8B8B4);      /* 8.88  / 9.70  */\n  --sy-ink-subtle:   light-dark(#636360, #969692);      /* 6.03  / 6.50  */\n  --sy-ink-invert:   light-dark(#FFFFFF, #0E0E0F);\n\n  /* 装饰性分隔线（不受 WCAG 1.4.11 约束） */\n  --sy-border:        light-dark(#DEDDD9, #2E2E31);\n  --sy-border-strong: light-dark(#BFBEB9, #45454A);\n\n  /* 控件边界专用令牌，≥3:1（WCAG 1.4.11）\n     浅色 #8A8A85：paper 3.47 / surface 3.32 / sunken 3.04\n     深色 #6C6C74：paper 3.71 / surface 3.44 / sunken 3.12 */\n  --sy-border-control: light-dark(#8A8A85, #6C6C74);\n\n  /* 唯一彩色：编辑靛蓝 */\n  --sy-accent:        light-dark(#1B4DB1, #7EA8FF);     /* 7.66 / 8.21 */\n  --sy-accent-hover:  light-dark(#143B8C, #A4C0FF);\n  --sy-accent-soft:   light-dark(#EAF0FC, #16223B);\n  --sy-accent-border: light-dark(#C3D3F5, #2C3E63);\n\n  --sy-selection-bg:  light-dark(#D6E3FF, #26365C);\n  --sy-selection-ink: light-dark(#111111, #F5F5F3);\n\n  --sy-stripe:        light-dark(rgba(17,17,17,.025), rgba(245,245,243,.035));\n  --sy-stripe-strong: light-dark(rgba(17,17,17,.05), rgba(245,245,243,.06));\n\n  /* 代码高亮 token · 浅色（基于 --sy-sunken #F1F0ED） */\n  --sy-code-comment:  #6B6B66;   /* 4.62:1 */\n  --sy-code-keyword:  #9B2C7A;   /* 5.02:1 */\n  --sy-code-string:   #1E6E3C;   /* 4.83:1 */\n  --sy-code-number:   #135E9E;   /* 5.12:1 */\n  --sy-code-func:     #8A5200;   /* 5.07:1 */\n  --sy-code-tag:      #0E6636;   /* 6.31:1 */\n  --sy-code-attr:     #135E9E;\n  --sy-code-punct:    #636360;   /* 5.93:1 */\n  --sy-code-variable: #111111;\n  --sy-code-deleted:  #A12A1E;\n  --sy-code-inserted: #1E6E3C;\n}\n/* 代码高亮 token · 深色（基于 --sy-sunken #202023） */\n:root[data-theme=\"dark\"] {\n  --sy-code-comment: #9A9A96; --sy-code-keyword: #E79ACD; --sy-code-string: #8FD4A6;\n  --sy-code-number: #86C2FF; --sy-code-func: #E8C06A; --sy-code-tag: #7FE5A8;\n  --sy-code-attr: #86C2FF; --sy-code-punct: #B8B8B4; --sy-code-variable: #F5F5F3;\n  --sy-code-deleted: #F09A8C; --sy-code-inserted: #8FD4A6;\n}\n@media (prefers-color-scheme: dark) {\n  :root:not([data-theme=\"light\"]) {\n    --sy-code-comment: #9A9A96; --sy-code-keyword: #E79ACD; --sy-code-string: #8FD4A6;\n    --sy-code-number: #86C2FF; --sy-code-func: #E8C06A; --sy-code-tag: #7FE5A8;\n    --sy-code-attr: #86C2FF; --sy-code-punct: #B8B8B4; --sy-code-variable: #F5F5F3;\n    --sy-code-deleted: #F09A8C; --sy-code-inserted: #8FD4A6;\n  }\n}\n\n/* 语义提示框（Callout）· 6 种 */\n:root {\n  --sy-note-ink:    light-dark(#37506E, #A9C4E6); --sy-note-bg:     light-dark(#EDF1F6, #1A222D); --sy-note-border: light-dark(#CBD8E8, #2C3B4D);\n  --sy-info-ink:    light-dark(#1B4DB1, #93B8FF); --sy-info-bg:     light-dark(#EAF0FC, #151F35); --sy-info-border: light-dark(#C3D3F5, #2A3A5E);\n  --sy-tip-ink:     light-dark(#1C6650, #84D2B2); --sy-tip-bg:      light-dark(#E7F4EE, #12241C); --sy-tip-border:  light-dark(#BEDFD0, #244536);\n  --sy-success-ink: light-dark(#22632C, #92D69C); --sy-success-bg:  light-dark(#EAF4EB, #142415); --sy-success-border: light-dark(#C3DFC7, #28432A);\n  --sy-warning-ink: light-dark(#7A4B08, #E5B45E); --sy-warning-bg:  light-dark(#FBF2DF, #251D10); --sy-warning-border: light-dark(#EBD9AC, #45361C);\n  --sy-error-ink:   light-dark(#A12A1E, #F09A8C); --sy-error-bg:    light-dark(#FCEBE8, #271614); --sy-error-border: light-dark(#F0C9C1, #492723);\n}\n\n/* 2. 字体 —— 衬线标题 + 无衬线正文 + 等宽 */\n:root {\n  --sy-font-body: -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\",\n                  \"Hiragino Sans GB\", \"Microsoft YaHei UI\", \"Microsoft YaHei\",\n                  \"Source Han Sans SC\", \"Noto Sans SC\", \"WenQuanYi Micro Hei\", sans-serif;\n  --sy-font-display: \"Source Han Serif SC\", \"Noto Serif SC\", \"Songti SC\",\n                     \"STSong\", \"SimSun\", Georgia, \"Times New Roman\", serif;\n  --sy-font-mono: \"JetBrains Mono\", \"Cascadia Mono\", \"SFMono-Regular\", Menlo,\n                  Consolas, \"Liberation Mono\", \"Sarasa Mono SC\",\n                  \"Source Han Mono SC\", \"Noto Sans Mono CJK SC\", monospace;\n\n  /* 杂志式：放大标题级差，形成视觉冲击 */\n  --sy-fs-3xs: 0.6875rem; --sy-fs-2xs: 0.75rem;  --sy-fs-xs: 0.8125rem;\n  --sy-fs-sm:  0.9375rem; --sy-fs-md:  1.0625rem; --sy-fs-lg:  1.25rem;\n  --sy-fs-xl:  1.5rem;    --sy-fs-2xl: 1.875rem;  --sy-fs-3xl: 2.375rem;\n  --sy-fs-4xl: 3rem;      --sy-fs-5xl: 3.75rem;\n\n  --sy-lh-body: 1.78; --sy-lh-tight: 1.15; --sy-lh-heading: 1.25;\n  --sy-lh-code: 1.6;  --sy-lh-caption: 1.5;\n\n  --sy-w-regular: 400; --sy-w-medium: 500; --sy-w-semibold: 600; --sy-w-bold: 700;\n  --sy-track-body: -0.003em; --sy-track-heading: -0.022em;\n  --sy-track-display: -0.03em; --sy-track-label: 0.14em;\n}\n\n/* 3. 间距（4px 基准） */\n:root {\n  --sy-sp-1: 4px;  --sy-sp-2: 8px;  --sy-sp-3: 12px; --sy-sp-4: 16px;\n  --sy-sp-5: 20px; --sy-sp-6: 24px; --sy-sp-8: 32px; --sy-sp-10: 40px;\n  --sy-sp-12: 48px; --sy-sp-16: 64px; --sy-sp-20: 80px; --sy-sp-24: 96px;\n  --sy-para-gap: var(--sy-sp-5); --sy-block-gap: var(--sy-sp-8);\n}\n\n/* 4. 圆角 / 阴影 / 层级 —— 近乎直角，锐利编辑感 */\n:root {\n  --sy-r-xs: 2px; --sy-r-sm: 3px; --sy-r-md: 4px; --sy-r-lg: 6px; --sy-r-full: 999px;\n  --sy-shadow-1: 0 1px 2px light-dark(rgba(17,17,17,.07), rgba(0,0,0,.40));\n  --sy-shadow-2: 0 6px 24px light-dark(rgba(17,17,17,.12), rgba(0,0,0,.52));\n  --sy-shadow-3: 0 16px 48px light-dark(rgba(17,17,17,.16), rgba(0,0,0,.60));\n  --sy-z-base: 0; --sy-z-raised: 10; --sy-z-sticky: 100; --sy-z-toc: 110;\n  --sy-z-drawer: 200; --sy-z-modal: 300; --sy-z-toast: 400; --sy-z-tooltip: 500;\n}\n\n/* 5. 布局 */\n:root {\n  --sy-page-max: 1240px; --sy-measure: 700px; --sy-measure-wide: 980px;\n  --sy-toc-w: 220px; --sy-gutter: var(--sy-sp-12);\n  --sy-header-h: 60px; --sy-header-h-sm: 52px;\n}\n\n/* 6. 动效 */\n:root {\n  --sy-dur-fast: 120ms; --sy-dur-base: 200ms; --sy-dur-slow: 320ms;\n  --sy-ease: cubic-bezier(.2, .6, .3, 1);\n}\n\n/* 7. 基础样式 */\n*, *::before, *::after { box-sizing: border-box; }\nhtml {\n  -webkit-text-size-adjust: 100%; text-size-adjust: 100%; scroll-behavior: smooth;\n  scroll-padding-top: calc(var(--sy-header-h) + var(--sy-sp-6));\n}\nbody {\n  margin: 0; background: var(--sy-paper); color: var(--sy-ink);\n  font-family: var(--sy-font-body); font-size: var(--sy-fs-md);\n  line-height: var(--sy-lh-body); letter-spacing: var(--sy-track-body);\n  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;\n  text-rendering: optimizeLegibility;\n  font-variant-numeric: oldstyle-nums proportional-nums; overflow-wrap: break-word;\n}\n::selection { background: var(--sy-selection-bg); color: var(--sy-selection-ink); }\n:focus-visible { outline: 2px solid var(--sy-accent); outline-offset: 3px; border-radius: var(--sy-r-xs); }\n.sy-code__body[tabindex], .sy-table-wrap[tabindex], .sy-math[tabindex] { scrollbar-width: thin; }\n.sy-skip {\n  position: absolute; left: -9999px; top: 0; z-index: var(--sy-z-tooltip);\n  padding: var(--sy-sp-2) var(--sy-sp-4); background: var(--sy-surface);\n  color: var(--sy-ink); border: 1px solid var(--sy-border-control); border-radius: var(--sy-r-sm);\n}\n.sy-skip:focus { left: var(--sy-sp-4); top: var(--sy-sp-2); }\n\n/* 8. 排版 —— 杂志式核心 */\n.sy-doc { margin: 0; }\n.sy-doc > * + * { margin-top: var(--sy-para-gap); }\n\n/* 刊头：粗底边 + 大标题 + 宽字距元信息 */\n.sy-doc-head { border-bottom: 3px solid var(--sy-ink); padding-bottom: var(--sy-sp-8); margin-bottom: var(--sy-sp-12); }\n.sy-doc-head h1, .sy-doc h1 {\n  font-family: var(--sy-font-display); font-weight: var(--sy-w-bold);\n  color: var(--sy-ink); margin: 0; overflow-wrap: break-word;\n}\n.sy-doc-head h1 {\n  /* v1.4：正文字号收敛到 28px，避免杂志式大标题过于抢眼 */\n  font-size: 1.75rem; line-height: 1.32; letter-spacing: var(--sy-track-display);\n}\n.sy-doc-head__meta {\n  display: flex; flex-wrap: wrap; align-items: center; gap: var(--sy-sp-2) var(--sy-sp-3);\n  margin-top: var(--sy-sp-5); font-size: var(--sy-fs-2xs);\n  letter-spacing: var(--sy-track-label); text-transform: uppercase; color: var(--sy-ink-muted);\n}\n\n.sy-doc h1, .sy-doc h2, .sy-doc h3, .sy-doc h4, .sy-doc h5, .sy-doc h6 {\n  font-family: var(--sy-font-display); font-weight: var(--sy-w-bold);\n  color: var(--sy-ink); line-height: var(--sy-lh-heading);\n  letter-spacing: var(--sy-track-heading); margin: 0;\n  scroll-margin-top: calc(var(--sy-header-h) + var(--sy-sp-6));\n}\n.sy-doc h1 { font-size: 2rem; line-height: var(--sy-lh-tight); letter-spacing: var(--sy-track-display); }\n.sy-doc h2 { font-size: var(--sy-fs-3xl); line-height: var(--sy-lh-tight); }\n.sy-doc h3 { font-size: var(--sy-fs-2xl); }\n.sy-doc h4 { font-size: var(--sy-fs-xl); }\n.sy-doc h5 { font-size: var(--sy-fs-lg); }\n.sy-doc h6 { font-size: var(--sy-fs-md); color: var(--sy-ink-muted); }\n\n/* h2 上方编辑式粗短线，强化分栏感 */\n.sy-doc h2 { margin-top: var(--sy-sp-16); padding-top: var(--sy-sp-6); border-top: 2px solid var(--sy-ink); }\n.sy-doc h2 + * { margin-top: var(--sy-sp-4); }\n.sy-doc h3 { margin-top: var(--sy-sp-10); }\n.sy-doc h4 { margin-top: var(--sy-sp-8); }\n.sy-doc > h1:first-child { margin-top: 0; }\n.sy-doc p { margin: 0; }\n.sy-doc blockquote {\n  margin: var(--sy-block-gap) 0;\n  padding: var(--sy-sp-3) var(--sy-sp-5);\n  border-left: 3px solid var(--sy-ink);\n  background: var(--sy-sunken);\n  color: var(--sy-ink-muted);\n}\n.sy-doc blockquote p { margin: 0; }\n.sy-doc blockquote p + p { margin-top: var(--sy-sp-2); }\n\n/* 首字下沉：杂志式标志手法 */\n.sy-doc > p:first-child::first-letter {\n  float: left; font-family: var(--sy-font-display); font-size: 3.4em;\n  line-height: .82; font-weight: var(--sy-w-bold); color: var(--sy-ink);\n  padding: .08em .10em 0 0;\n}\n\n.sy-doc a {\n  color: var(--sy-accent); text-decoration: underline; text-decoration-thickness: 1px;\n  text-underline-offset: 3px;\n  text-decoration-color: color-mix(in srgb, var(--sy-accent) 40%, transparent);\n  transition: color var(--sy-dur-fast) var(--sy-ease), text-decoration-color var(--sy-dur-fast) var(--sy-ease);\n}\n.sy-doc a:hover { color: var(--sy-accent-hover); text-decoration-color: currentColor; }\n.sy-doc a[rel~=\"external\"]::after {\n  content: \"\\2197\"; display: inline-block; margin-left: 2px; font-size: .85em; vertical-align: 1px; opacity: .6;\n}\n.sy-doc ul, .sy-doc ol { margin: 0; padding-left: 1.7em; }\n.sy-doc li { margin: var(--sy-sp-1) 0; }\n.sy-doc li > ul, .sy-doc li > ol { margin-top: var(--sy-sp-1); }\n.sy-doc ul { list-style: disc; }\n.sy-doc ul ul { list-style: circle; }\n.sy-doc ol { list-style: decimal; }\n.sy-doc ul li::marker, .sy-doc ol li::marker { color: var(--sy-ink-subtle); }\n.sy-doc ol li::marker { font-variant-numeric: tabular-nums; }\n.sy-doc hr { border: 0; border-top: 1px solid var(--sy-border); margin: var(--sy-sp-12) 0; }\n.sy-doc strong { font-weight: var(--sy-w-bold); }\n.sy-doc em { font-style: normal; color: var(--sy-ink-muted); } /* 中文不用斜体 */\n.sy-doc mark { background: var(--sy-accent-soft); color: var(--sy-ink); padding: .08em .24em; border-radius: var(--sy-r-xs); }\n.sy-doc img { max-width: 100%; height: auto; display: block; border-radius: var(--sy-r-sm); background: var(--sy-sunken); }\n.sy-doc figure { margin: var(--sy-block-gap) 0; }\n.sy-doc figcaption {\n  margin-top: var(--sy-sp-2); font-size: var(--sy-fs-2xs); line-height: var(--sy-lh-caption);\n  color: var(--sy-ink-subtle); text-align: left; padding-left: var(--sy-sp-3); border-left: 2px solid var(--sy-accent);\n}\n.sy-doc :not(pre) > code {\n  font-family: var(--sy-font-mono); font-size: .87em; padding: .12em .34em;\n  border-radius: var(--sy-r-xs); background: var(--sy-sunken); border: 1px solid var(--sy-border); color: var(--sy-ink);\n}\n\n/* 9.1 引用块：粗竖线 + 大引号 */\n.sy-quote {\n  position: relative; margin: var(--sy-block-gap) 0;\n  padding: var(--sy-sp-2) 0 var(--sy-sp-2) var(--sy-sp-6);\n  border-left: 4px solid var(--sy-ink); color: var(--sy-ink-muted);\n}\n.sy-quote::before {\n  content: \"\\201C\"; position: absolute; left: var(--sy-sp-3); top: -6px;\n  font-family: var(--sy-font-display); font-size: 2.4em; line-height: 1; color: var(--sy-border-strong);\n}\n.sy-quote > *:first-child { margin-top: 0; }\n.sy-quote > *:last-child  { margin-bottom: 0; }\n.sy-quote cite, .sy-quote .sy-quote__src {\n  display: block; margin-top: var(--sy-sp-2); font-size: var(--sy-fs-2xs);\n  font-style: normal; letter-spacing: var(--sy-track-label); color: var(--sy-ink-subtle);\n}\n\n/* 9.2 提示框 Callout */\n.sy-callout {\n  --_ink: var(--sy-ink); --_bg: var(--sy-sunken); --_bd: var(--sy-border);\n  display: flex; gap: var(--sy-sp-3); margin: var(--sy-block-gap) 0;\n  padding: var(--sy-sp-4) var(--sy-sp-5);\n  border: 1px solid var(--_bd); border-left-width: 4px; border-radius: var(--sy-r-md);\n  background: var(--_bg); color: var(--sy-ink); font-size: var(--sy-fs-sm); line-height: 1.72;\n}\n.sy-callout__icon { flex: 0 0 auto; width: 18px; height: 18px; margin-top: 3px; color: var(--_ink); }\n.sy-callout__img  { flex: 0 0 auto; max-width: 40px; height: auto; }\n.sy-callout__body, .sy-callout__content { min-width: 0; flex: 1 1 auto; }\n.sy-callout__body > *, .sy-callout__content > * { margin: 0; }\n.sy-callout__body > * + *, .sy-callout__content > * + * { margin-top: var(--sy-sp-2); }\n.sy-callout__title {\n  font-weight: var(--sy-w-bold); color: var(--_ink);\n  letter-spacing: var(--sy-track-label); margin-bottom: var(--sy-sp-1) !important;\n}\n.sy-callout--note    { --_ink: var(--sy-note-ink);    --_bg: var(--sy-note-bg);    --_bd: var(--sy-note-border); }\n.sy-callout--info    { --_ink: var(--sy-info-ink);    --_bg: var(--sy-info-bg);    --_bd: var(--sy-info-border); }\n.sy-callout--tip     { --_ink: var(--sy-tip-ink);     --_bg: var(--sy-tip-bg);     --_bd: var(--sy-tip-border); }\n.sy-callout--success { --_ink: var(--sy-success-ink); --_bg: var(--sy-success-bg); --_bd: var(--sy-success-border); }\n.sy-callout--warning { --_ink: var(--sy-warning-ink); --_bg: var(--sy-warning-bg); --_bd: var(--sy-warning-border); }\n.sy-callout--error   { --_ink: var(--sy-error-ink);   --_bg: var(--sy-error-bg);   --_bd: var(--sy-error-border); }\n\n/* 9.3 代码块 */\n.sy-code {\n  margin: var(--sy-block-gap) 0; border: 1px solid var(--sy-border);\n  border-radius: var(--sy-r-md); background: var(--sy-sunken); overflow: hidden;\n}\n.sy-code__head {\n  display: flex; align-items: center; justify-content: space-between; gap: var(--sy-sp-3);\n  padding: var(--sy-sp-2) var(--sy-sp-2) var(--sy-sp-2) var(--sy-sp-4);\n  border-bottom: 1px solid var(--sy-border);\n  background: color-mix(in srgb, var(--sy-sunken) 65%, var(--sy-paper));\n}\n.sy-code__lang {\n  font-family: var(--sy-font-mono); font-size: var(--sy-fs-3xs);\n  letter-spacing: var(--sy-track-label); text-transform: uppercase; color: var(--sy-ink-subtle);\n}\n.sy-code__tools { display: flex; gap: var(--sy-sp-1); }\n.sy-code__btn {\n  display: inline-flex; align-items: center; justify-content: center;\n  min-width: 28px; min-height: 28px; padding: 0 var(--sy-sp-2);\n  font: inherit; font-size: var(--sy-fs-3xs); color: var(--sy-ink-subtle);\n  background: transparent; border: 1px solid transparent; border-radius: var(--sy-r-xs); cursor: pointer;\n  transition: background var(--sy-dur-fast) var(--sy-ease), color var(--sy-dur-fast) var(--sy-ease);\n}\n.sy-code__btn:hover { background: var(--sy-accent-soft); color: var(--sy-accent); }\n.sy-code__btn[data-state=\"done\"] { color: var(--sy-success-ink); }\n.sy-code__btn svg { width: 13px; height: 13px; }\n.sy-code__body {\n  margin: 0; padding: var(--sy-sp-4); overflow-x: auto; overscroll-behavior-x: contain;\n  font-family: var(--sy-font-mono); font-size: var(--sy-fs-xs);\n  line-height: var(--sy-lh-code); tab-size: 2; color: var(--sy-ink);\n}\n.sy-code__body code { font: inherit; background: none; border: 0; padding: 0; }\n.sy-code--wrap .sy-code__body { white-space: pre-wrap; overflow-wrap: anywhere; }\n.sy-code--numbered .sy-code__body code { counter-reset: sy-ln; }\n.sy-code--numbered .sy-code__body .sy-code__line { display: block; counter-increment: sy-ln; }\n.sy-code--numbered .sy-code__body .sy-code__line::before {\n  content: counter(sy-ln); display: inline-block; width: 2.2em; margin-right: 1em;\n  text-align: right; color: var(--sy-ink-subtle); opacity: .6; user-select: none;\n}\n.hljs-comment, .hljs-quote { color: var(--sy-code-comment); font-style: normal; }\n.hljs-keyword, .hljs-selector-tag, .hljs-literal { color: var(--sy-code-keyword); }\n.hljs-string, .hljs-regexp, .hljs-addition { color: var(--sy-code-string); }\n.hljs-number, .hljs-symbol { color: var(--sy-code-number); }\n.hljs-title, .hljs-title.function_, .hljs-section { color: var(--sy-code-func); }\n.hljs-tag, .hljs-name { color: var(--sy-code-tag); }\n.hljs-attr, .hljs-attribute { color: var(--sy-code-attr); }\n.hljs-punctuation, .hljs-operator { color: var(--sy-code-punct); }\n.hljs-variable, .hljs-params { color: var(--sy-code-variable); }\n.hljs-deletion { color: var(--sy-code-deleted); }\n\n/* 9.4 表格 */\n.sy-table-wrap {\n  margin: var(--sy-block-gap) 0; overflow-x: auto; overscroll-behavior-x: contain;\n  border: 1px solid var(--sy-border); border-radius: var(--sy-r-md); background: var(--sy-surface);\n}\n.sy-doc table, .sy-table-wrap table { width: 100%; border-collapse: collapse; font-size: var(--sy-fs-xs); line-height: 1.6; }\n.sy-doc th, .sy-doc td, .sy-table-wrap th, .sy-table-wrap td {\n  padding: var(--sy-sp-2) var(--sy-sp-3); text-align: left;\n  border-bottom: 1px solid var(--sy-border); vertical-align: top;\n}\n.sy-doc thead th, .sy-table-wrap thead th {\n  background: var(--sy-sunken); font-weight: var(--sy-w-bold); font-size: var(--sy-fs-3xs);\n  letter-spacing: var(--sy-track-label); text-transform: uppercase;\n  color: var(--sy-ink-muted); white-space: nowrap; border-bottom: 2px solid var(--sy-ink);\n}\n.sy-doc tbody tr:nth-child(even), .sy-table-wrap tbody tr:nth-child(even) { background: var(--sy-stripe); }\n.sy-doc tbody tr:hover, .sy-table-wrap tbody tr:hover { background: var(--sy-stripe-strong); }\n.sy-doc tbody tr:last-child td, .sy-table-wrap tbody tr:last-child td { border-bottom: 0; }\n.sy-doc td[data-numeric=\"true\"], .sy-doc th[data-numeric=\"true\"],\n.sy-table-wrap td[data-numeric=\"true\"], .sy-table-wrap th[data-numeric=\"true\"] {\n  text-align: right; font-variant-numeric: tabular-nums;\n}\n\n/* 9.5 图片 / 兜底 */\n.sy-figure { margin: var(--sy-block-gap) 0; }\n.sy-figure img {\n  width: 100%; border: 1px solid var(--sy-border); border-radius: var(--sy-r-sm);\n  background: var(--sy-sunken); box-shadow: var(--sy-shadow-1);\n}\n.sy-figure--plain img { border: 0; box-shadow: none; }\n.sy-figure__cap {\n  margin-top: var(--sy-sp-2); font-size: var(--sy-fs-2xs); line-height: var(--sy-lh-caption);\n  color: var(--sy-ink-subtle); text-align: left; padding-left: var(--sy-sp-3); border-left: 2px solid var(--sy-accent);\n}\n.sy-img-fallback {\n  display: flex; flex-direction: column; align-items: center; justify-content: center;\n  gap: var(--sy-sp-2); min-height: 140px; padding: var(--sy-sp-6);\n  border: 1px dashed var(--sy-border-control); border-radius: var(--sy-r-md);\n  background: var(--sy-sunken); color: var(--sy-ink-subtle); font-size: var(--sy-fs-xs); text-align: center;\n}\n.sy-img-fallback svg { width: 28px; height: 28px; opacity: .55; }\n.sy-img-fallback__name { color: var(--sy-ink-muted); word-break: break-all; }\n\n/* 9.6 公式 */\n.sy-math {\n  margin: var(--sy-block-gap) 0; padding: var(--sy-sp-5) var(--sy-sp-4);\n  overflow-x: auto; overscroll-behavior-x: contain; text-align: center;\n  background: var(--sy-sunken); border: 1px solid var(--sy-border);\n  border-left: 4px solid var(--sy-accent); border-radius: var(--sy-r-md); font-size: var(--sy-fs-md);\n}\n.sy-math--inline { display: inline-block; margin: 0; padding: 0 .35em; border: 0; background: none; text-align: left; }\n.sy-math .katex-display { margin: 0; }\n.sy-math .katex { font-size: 1.05em; }\n\n/* 9.7 徽章 */\n.sy-badge {\n  display: inline-flex; align-items: center; gap: 4px; height: 22px;\n  padding: 0 var(--sy-sp-2); font-size: var(--sy-fs-3xs); font-weight: var(--sy-w-bold);\n  line-height: 1; letter-spacing: var(--sy-track-label); text-transform: uppercase;\n  color: var(--sy-accent); background: var(--sy-accent-soft);\n  border: 1px solid var(--sy-accent-border); border-radius: var(--sy-r-full); white-space: nowrap;\n}\n.sy-badge--muted { color: var(--sy-ink-muted); background: var(--sy-sunken); border-color: var(--sy-border); }\n\n/* 9.8 内核结构适配后的组件：脚注 / 任务 / 块 */\n.sy-doc__block { margin: 0; }\n.sy-task { display: flex; align-items: flex-start; gap: var(--sy-sp-2); }\n.sy-task__box {\n  flex: 0 0 auto; width: 16px; height: 16px; margin-top: 4px;\n  display: inline-flex; align-items: center; justify-content: center;\n  border: 1px solid var(--sy-border-control); border-radius: var(--sy-r-xs);\n  background: var(--sy-paper); color: transparent; font-size: 11px; line-height: 1;\n}\n.sy-task__box--checked { background: var(--sy-accent); border-color: var(--sy-accent); color: var(--sy-ink-invert); }\n.sy-task__box--checked::after { content: \"\\2713\"; }\n.sy-task:has(.sy-task__box--checked) > *:not(.sy-task__box) { color: var(--sy-ink-subtle); }\n.sy-footnotes {\n  margin-top: var(--sy-sp-16); padding-top: var(--sy-sp-4);\n  border-top: 1px solid var(--sy-border); font-size: var(--sy-fs-xs); color: var(--sy-ink-muted);\n}\n.sy-footnotes__hr { border: 0; border-top: 2px solid var(--sy-ink); margin: 0 0 var(--sy-sp-4); width: 48px; }\n.sy-footnotes__list { margin: 0; padding-left: 1.6em; }\n.sy-footnotes__list li { margin: var(--sy-sp-1) 0; }\n.sy-footnotes__ref {\n  font-size: .72em; vertical-align: super; color: var(--sy-accent); text-decoration: none; padding: 0 1px;\n}\n.sy-footnotes__ref:hover { text-decoration: underline; }\n\n/* 10. 页眉 / 布局 / 目录 / 页脚 */\n.sy-header {\n  position: sticky; top: 0; z-index: var(--sy-z-sticky); height: var(--sy-header-h);\n  display: flex; align-items: center;\n  background: color-mix(in srgb, var(--sy-paper) 88%, transparent);\n  backdrop-filter: saturate(160%) blur(12px); -webkit-backdrop-filter: saturate(160%) blur(12px);\n  border-bottom: 1px solid transparent;\n  transition: border-color var(--sy-dur-base) var(--sy-ease);\n}\n.sy-header[data-scrolled=\"true\"] { border-bottom-color: var(--sy-border); }\n.sy-header__inner {\n  width: 100%; max-width: var(--sy-page-max); margin: 0 auto;\n  padding: 0 var(--sy-gutter); display: flex; align-items: center; gap: var(--sy-sp-4);\n}\n.sy-header__actions { display: flex; align-items: center; gap: var(--sy-sp-1); margin-left: auto; }\n.sy-iconbtn {\n  display: inline-flex; align-items: center; justify-content: center;\n  width: 36px; height: 36px; padding: 0; color: var(--sy-ink-muted);\n  background: transparent; border: 1px solid transparent; border-radius: var(--sy-r-sm); cursor: pointer;\n  transition: background var(--sy-dur-fast) var(--sy-ease), color var(--sy-dur-fast) var(--sy-ease);\n}\n.sy-iconbtn:hover { background: var(--sy-accent-soft); color: var(--sy-accent); }\n.sy-iconbtn svg { width: 17px; height: 17px; }\n\n.sy-layout {\n  max-width: var(--sy-page-max); margin: 0 auto;\n  padding: var(--sy-sp-12) var(--sy-gutter) var(--sy-sp-24);\n  display: grid; grid-template-columns: minmax(0, 1fr) var(--sy-toc-w);\n  gap: var(--sy-sp-16); align-items: start;\n}\n/* DOM 顺序为「正文 → 目录」，必须显式指定列位，避免 Grid 自动填充导致目录抢正文列 */\n.sy-main { grid-column: 1; grid-row: 1; min-width: 0; max-width: var(--sy-measure); }\n.sy-toc  { grid-column: 2; grid-row: 1; }\n.sy-toc {\n  position: sticky; top: calc(var(--sy-header-h) + var(--sy-sp-6)); z-index: var(--sy-z-toc);\n  max-height: calc(100vh - var(--sy-header-h) - var(--sy-sp-12));\n  overflow-y: auto; overscroll-behavior: contain; font-size: var(--sy-fs-xs);\n  scrollbar-width: thin; border-top: 2px solid var(--sy-ink); padding-top: var(--sy-sp-3);\n}\n.sy-toc__title {\n  margin: 0 0 var(--sy-sp-3); font-size: var(--sy-fs-3xs); font-weight: var(--sy-w-bold);\n  letter-spacing: var(--sy-track-label); text-transform: uppercase; color: var(--sy-ink-subtle);\n}\n.sy-toc__list { list-style: none; margin: 0; padding: 0; }\n.sy-toc__list li { margin: 0; }\n.sy-toc__link {\n  display: block; padding: 6px var(--sy-sp-2) 6px var(--sy-sp-3);\n  margin-left: calc(var(--sy-toc-indent, 0) * 12px);\n  color: var(--sy-ink-muted); text-decoration: none;\n  border-left: 2px solid var(--sy-border); line-height: 1.45; overflow-wrap: anywhere;\n  transition: color var(--sy-dur-fast) var(--sy-ease), border-color var(--sy-dur-fast) var(--sy-ease);\n}\n.sy-toc__link:hover { color: var(--sy-ink); }\n.sy-toc__link[aria-current=\"true\"] { color: var(--sy-accent); border-left-color: var(--sy-accent); font-weight: var(--sy-w-bold); }\n.sy-footer {\n  max-width: var(--sy-measure); margin: var(--sy-sp-16) auto 0;\n  padding-top: var(--sy-sp-6); border-top: 2px solid var(--sy-ink);\n  font-size: var(--sy-fs-2xs); line-height: var(--sy-lh-caption); color: var(--sy-ink-subtle);\n}\n.sy-footer__row { display: flex; flex-wrap: wrap; gap: var(--sy-sp-2) var(--sy-sp-4); }\n.sy-footer__meta { display: flex; flex-wrap: wrap; gap: var(--sy-sp-1) var(--sy-sp-3); }\n.sy-footer__sep { opacity: .5; }\n.sy-toc-toggle { display: none; }\n\n/* 11. 密码遮罩 .sy-gate —— 4 位数字 */\n.sy-gate {\n  position: fixed; inset: 0; z-index: var(--sy-z-modal);\n  display: flex; align-items: center; justify-content: center;\n  padding: var(--sy-sp-6); background: var(--sy-paper);\n}\n.sy-gate[hidden] { display: none; }\n.sy-gate__card {\n  width: min(440px, 100%); padding: var(--sy-sp-10) var(--sy-sp-8);\n  background: var(--sy-surface); border: 1px solid var(--sy-border-control);\n  border-top: 4px solid var(--sy-ink); box-shadow: var(--sy-shadow-3);\n}\n.sy-gate__kicker {\n  margin: 0 0 var(--sy-sp-3); font-size: var(--sy-fs-3xs); font-weight: var(--sy-w-bold);\n  letter-spacing: var(--sy-track-label); text-transform: uppercase; color: var(--sy-accent);\n}\n.sy-gate__title {\n  margin: 0 0 var(--sy-sp-3); font-family: var(--sy-font-display);\n  font-size: var(--sy-fs-3xl); line-height: var(--sy-lh-tight);\n  letter-spacing: var(--sy-track-display); color: var(--sy-ink);\n}\n.sy-gate__desc { margin: 0 0 var(--sy-sp-8); font-size: var(--sy-fs-sm); line-height: 1.7; color: var(--sy-ink-muted); }\n.sy-gate__fields { display: flex; gap: var(--sy-sp-2); margin: 0 0 var(--sy-sp-4); }\n.sy-gate__input {\n  flex: 1 1 0; min-width: 0; width: 100%; height: 60px; text-align: center;\n  font-family: var(--sy-font-mono); font-size: 26px; font-weight: var(--sy-w-bold);\n  color: var(--sy-ink); background: var(--sy-paper);\n  border: 1px solid var(--sy-border-control); border-bottom: 2px solid var(--sy-ink);\n  border-radius: var(--sy-r-sm); -moz-appearance: textfield;\n}\n.sy-gate__input::-webkit-inner-spin-button,\n.sy-gate__input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }\n.sy-gate__input:focus-visible { outline: 2px solid var(--sy-accent); outline-offset: 2px; }\n.sy-gate__error {\n  display: none; margin: 0 0 var(--sy-sp-4); font-size: var(--sy-fs-xs);\n  color: var(--sy-error-ink); min-height: 1.2em;\n}\n.sy-gate__error[data-show=\"true\"] { display: block; }\n.sy-gate__submit {\n  display: block; width: 100%; min-height: 44px; padding: var(--sy-sp-3) var(--sy-sp-6);\n  font: inherit; font-size: var(--sy-fs-sm); font-weight: var(--sy-w-bold);\n  letter-spacing: var(--sy-track-label); color: var(--sy-ink-invert);\n  background: var(--sy-accent); border: 1px solid var(--sy-accent);\n  border-radius: var(--sy-r-sm); cursor: pointer;\n  transition: background var(--sy-dur-fast) var(--sy-ease);\n}\n.sy-gate__submit:hover { background: var(--sy-accent-hover); }\n.sy-gate__notice {\n  margin: var(--sy-sp-5) 0 0; padding-top: var(--sy-sp-4);\n  border-top: 1px solid var(--sy-border); font-size: var(--sy-fs-2xs);\n  line-height: 1.6; color: var(--sy-ink-subtle);\n}\n\n/* 12. 链接失效页 .sy-expired */\n.sy-expired {\n  min-height: 70vh; display: flex; align-items: center; justify-content: center;\n  padding: var(--sy-sp-16) var(--sy-gutter); text-align: center;\n}\n.sy-expired__inner { max-width: 560px; }\n.sy-expired__code {\n  margin: 0 0 var(--sy-sp-4); font-family: var(--sy-font-mono);\n  font-size: var(--sy-fs-5xl); font-weight: var(--sy-w-bold);\n  line-height: 1; letter-spacing: var(--sy-track-display); color: var(--sy-accent);\n}\n.sy-expired__title {\n  margin: 0 0 var(--sy-sp-4); padding-top: var(--sy-sp-5);\n  border-top: 2px solid var(--sy-ink); font-family: var(--sy-font-display);\n  font-size: var(--sy-fs-3xl); line-height: var(--sy-lh-tight); color: var(--sy-ink);\n}\n.sy-expired__desc { margin: 0 0 var(--sy-sp-6); font-size: var(--sy-fs-sm); line-height: 1.75; color: var(--sy-ink-muted); }\n.sy-expired__contact {\n  margin: 0; padding: var(--sy-sp-4); background: var(--sy-sunken);\n  border-left: 4px solid var(--sy-accent); font-size: var(--sy-fs-xs);\n  line-height: 1.7; color: var(--sy-ink-muted); text-align: left; overflow-wrap: anywhere;\n}\n.sy-expired__notice { margin: var(--sy-sp-6) 0 0; font-size: var(--sy-fs-2xs); color: var(--sy-ink-subtle); line-height: 1.6; }\n\n/* 13. 响应式 · 六断点 */\n@media (min-width: 1440px) {\n  :root { --sy-gutter: var(--sy-sp-16); }\n  .sy-doc-head h1 { font-size: 1.75rem; }\n}\n@media (max-width: 1439px) {\n  :root { --sy-toc-w: 200px; --sy-gutter: var(--sy-sp-8); }\n}\n@media (max-width: 1023px) {\n  :root { --sy-gutter: var(--sy-sp-6); --sy-header-h: var(--sy-header-h-sm); }\n  body { font-size: var(--sy-fs-sm); }\n  .sy-layout { grid-template-columns: minmax(0, 1fr); gap: var(--sy-sp-6); padding-top: var(--sy-sp-8); }\n  .sy-main { grid-column: 1; grid-row: 1; max-width: none; }\n  .sy-toc {\n    grid-column: 1; grid-row: 1; position: fixed; inset: 0 auto 0 0;\n    z-index: var(--sy-z-drawer); width: min(320px, 84vw); max-height: none;\n    padding: var(--sy-sp-6); background: var(--sy-surface);\n    border-right: 1px solid var(--sy-border); box-shadow: var(--sy-shadow-3);\n    transform: translateX(-100%);\n    transition: transform var(--sy-dur-base) var(--sy-ease); overflow-y: auto;\n  }\n  .sy-toc[data-open=\"true\"] { transform: translateX(0); }\n  .sy-toc-toggle {\n    display: inline-flex; align-items: center; gap: var(--sy-sp-2); min-height: 36px;\n    padding: 0 var(--sy-sp-3); font: inherit; font-size: var(--sy-fs-xs);\n    color: var(--sy-ink-muted); background: var(--sy-surface);\n    border: 1px solid var(--sy-border-control); border-radius: var(--sy-r-sm); cursor: pointer;\n  }\n  .sy-scrim {\n    position: fixed; inset: 0; z-index: calc(var(--sy-z-drawer) - 1);\n    background: var(--sy-overlay); opacity: 0; pointer-events: none;\n    transition: opacity var(--sy-dur-base) var(--sy-ease);\n  }\n  .sy-scrim[data-open=\"true\"] { opacity: 1; pointer-events: auto; }\n  .sy-doc-head h1 { font-size: 1.5rem; }\n  .sy-doc h1 { font-size: 1.75rem; }\n  .sy-doc h2 { font-size: var(--sy-fs-2xl); margin-top: var(--sy-sp-12); }\n  .sy-doc h3 { font-size: var(--sy-fs-xl); }\n  .sy-code__body { padding: var(--sy-sp-3); }\n}\n@media (max-width: 767px) {\n  :root { --sy-gutter: var(--sy-sp-5); }\n  body { line-height: 1.72; }\n  .sy-layout { padding-bottom: var(--sy-sp-16); }\n  .sy-doc-head h1, .sy-doc h1 { font-size: 1.5rem; letter-spacing: var(--sy-track-heading); }\n  .sy-doc h2 { font-size: var(--sy-fs-xl); margin-top: var(--sy-sp-8); }\n  .sy-doc h3 { font-size: var(--sy-fs-lg); margin-top: var(--sy-sp-6); }\n  .sy-doc > p:first-child::first-letter { font-size: 2.8em; }\n  .sy-doc figure, .sy-doc .sy-code, .sy-doc .sy-table-wrap, .sy-doc .sy-math {\n    margin-left: calc(var(--sy-gutter) * -1); margin-right: calc(var(--sy-gutter) * -1);\n  }\n  .sy-doc .sy-code, .sy-doc .sy-math { border-radius: 0; border-left: 0; border-right: 0; }\n  .sy-code__body { font-size: var(--sy-fs-3xs); }\n  .sy-callout { padding: var(--sy-sp-3); }\n  .sy-footer { margin-top: var(--sy-sp-12); }\n  .sy-gate__card { padding: var(--sy-sp-8) var(--sy-sp-6); }\n  .sy-gate__title { font-size: var(--sy-fs-2xl); }\n  .sy-expired__code { font-size: var(--sy-fs-4xl); }\n  .sy-expired__title { font-size: var(--sy-fs-2xl); }\n}\n@media (max-width: 479px) {\n  :root { --sy-gutter: var(--sy-sp-4); }\n  .sy-gate__input { height: 52px; font-size: 22px; }\n}\n@media (pointer: coarse) {\n  .sy-code__btn { min-width: 44px; min-height: 44px; }\n  .sy-iconbtn { width: 44px; height: 44px; }\n  .sy-toc-toggle { min-height: 44px; }\n  .sy-footnotes__ref { padding: 8px 4px; margin: -8px -4px; }\n}\n\n/* 14. 打印 / 另存 PDF */\n@media print {\n  @page { margin: 18mm 16mm; }\n  :root, :root[data-theme=\"dark\"] {\n    color-scheme: light;\n    --sy-paper: #FFFFFF; --sy-surface: #FFFFFF; --sy-sunken: #F6F6F4;\n    --sy-ink: #111111; --sy-ink-muted: #44443F; --sy-ink-subtle: #5F5F59;\n    --sy-border: #D8D7D2; --sy-border-control: #8A8A85; --sy-accent: #1B4DB1;\n    --sy-accent-soft: #EAF0FC;\n    --sy-code-comment: #6B6B66; --sy-code-keyword: #9B2C7A; --sy-code-string: #1E6E3C;\n    --sy-code-number: #135E9E; --sy-code-func: #8A5200; --sy-code-tag: #0E6636;\n    --sy-code-attr: #135E9E; --sy-code-punct: #4A4A45; --sy-code-variable: #111111;\n  }\n  html, body { background: #fff !important; color: #111; }\n  body { font-size: 10.5pt; line-height: 1.7; }\n  .sy-header, .sy-toc, .sy-toc-toggle, .sy-scrim, .sy-code__tools,\n  .sy-header__actions, .sy-skip, .sy-no-print, .sy-gate, .sy-expired { display: none !important; }\n  .sy-layout { display: block; max-width: none; padding: 0; }\n  .sy-main, .sy-footer { max-width: none; margin: 0; }\n  .sy-code, .sy-figure, .sy-table-wrap, .sy-callout, .sy-math, .sy-footnotes {\n    break-inside: avoid; page-break-inside: avoid;\n  }\n  .sy-code--long { break-inside: auto; page-break-inside: auto; }\n  .sy-code--long .sy-code__body { overflow: visible; white-space: pre-wrap; }\n  .sy-doc h1, .sy-doc h2, .sy-doc h3, .sy-doc h4 { break-after: avoid; page-break-after: avoid; }\n  .sy-doc img { max-width: 100% !important; break-inside: avoid; }\n  .sy-doc thead { display: table-header-group; }\n  .sy-doc tr { break-inside: avoid; }\n  .sy-doc hr { margin: 12pt 0; }\n  .sy-print-url a[href^=\"http\"]::after { content: \" (\" attr(href) \")\"; font-size: 9pt; color: #5F5F59; }\n}\n\n/* 15. 动效克制 + reduced-motion */\n.sy-lazy { opacity: 0; transition: opacity var(--sy-dur-base) var(--sy-ease); }\n.sy-lazy[data-loaded=\"true\"] { opacity: 1; }\n@media (prefers-reduced-motion: reduce) {\n  html { scroll-behavior: auto; }\n  *, *::before, *::after {\n    animation-duration: .01ms !important; animation-iteration-count: 1 !important;\n    transition-duration: .01ms !important;\n  }\n}\n";
const PAGE_SKELETON = "<!DOCTYPE html>\n<html lang=\"zh-CN\" data-theme=\"auto\">\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n<meta name=\"color-scheme\" content=\"light dark\">\n<meta name=\"theme-color\" content=\"#FFFFFF\" media=\"(prefers-color-scheme: light)\">\n<meta name=\"theme-color\" content=\"#0E0E0F\" media=\"(prefers-color-scheme: dark)\">\n<meta name=\"referrer\" content=\"no-referrer-when-downgrade\">\n<meta name=\"sy-build\" content=\"{{BUILD_STAMP}}\">\n\n<!-- 标题占位符：插件用 data.name 替换 -->\n<title>{{DOC_TITLE}} · {{SITE_NAME}}</title>\n<meta name=\"description\" content=\"{{DOC_SUMMARY}}\">\n<meta name=\"author\" content=\"{{DOC_AUTHOR}}\">\n\n<!-- Open Graph / 社交卡片（外链分享的关键） -->\n<meta property=\"og:type\" content=\"article\">\n<meta property=\"og:title\" content=\"{{DOC_TITLE}}\">\n<meta property=\"og:description\" content=\"{{DOC_SUMMARY}}\">\n<meta property=\"og:url\" content=\"{{PAGE_URL}}\">\n<meta name=\"twitter:card\" content=\"summary_large_image\">\n\n<!-- 样式：令牌 + 组件，单文件内联，保证脱离思源也能独立打开 -->\n<style>\n/* ==========================================================================\n   思源笔记 · 静态分享页设计令牌 v1.1「杂志排版式 Editorial / Magazine」\n   --------------------------------------------------------------------------\n   方向：高对比黑白灰基底 + 单一编辑强调色（靛蓝）+ 大字号衬线标题 +\n         首字下沉 / 粗分割线 / 编辑式留白，强调图文层次与视觉冲击。\n   替换说明：本文件整体替换 v1.0「纸墨 Paper & Ink」，不做叠加。\n   --------------------------------------------------------------------------\n   依赖：无。不依赖思源内核 CSS、不依赖 /assets/ /stage/ /appearance/。\n   class 契约：全部沿用工程侧 index.js 生成逻辑中的 sy- 类名，未新增/改名。\n   新增 class：.sy-gate*（密码遮罩）、.sy-expired*（失效页），需工程侧在生成\n   HTML 时带上（详见 siyuan-share-components.md）。\n   --------------------------------------------------------------------------\n   对比度（脚本实算，非估算）：\n     正文 ink/paper 18.88:1 · muted/paper 8.88:1 · subtle/paper 6.03:1\n     强调 accent/paper 7.66:1 · 白字/accent 7.66:1\n     控件边界 border-control：浅色 paper 3.47 / surface 3.32 / sunken 3.04\n     深色 paper 3.71 / surface 3.44 / sunken 3.12（均 ≥3:1，满足 WCAG 1.4.11）\n   ========================================================================== */\n\n/* 0. 主题机制：默认跟随系统，手动切换锁定 data-theme */\n:root { color-scheme: light dark; }\n:root[data-theme=\"light\"] { color-scheme: light; }\n:root[data-theme=\"dark\"]  { color-scheme: dark; }\n\n/* 1. 颜色 · 语义层 */\n:root {\n  --sy-paper:        light-dark(#FFFFFF, #0E0E0F);\n  --sy-surface:      light-dark(#FAFAF8, #171719);\n  --sy-sunken:       light-dark(#F1F0ED, #202023);\n  --sy-overlay:      light-dark(rgba(17,17,17,.52), rgba(0,0,0,.70));\n\n  --sy-ink:          light-dark(#111111, #F5F5F3);      /* 18.88 / 17.68 */\n  --sy-ink-muted:    light-dark(#4A4A48, #B8B8B4);      /* 8.88  / 9.70  */\n  --sy-ink-subtle:   light-dark(#636360, #969692);      /* 6.03  / 6.50  */\n  --sy-ink-invert:   light-dark(#FFFFFF, #0E0E0F);\n\n  /* 装饰性分隔线（不受 WCAG 1.4.11 约束） */\n  --sy-border:        light-dark(#DEDDD9, #2E2E31);\n  --sy-border-strong: light-dark(#BFBEB9, #45454A);\n\n  /* 控件边界专用令牌，≥3:1（WCAG 1.4.11）\n     浅色 #8A8A85：paper 3.47 / surface 3.32 / sunken 3.04\n     深色 #6C6C74：paper 3.71 / surface 3.44 / sunken 3.12 */\n  --sy-border-control: light-dark(#8A8A85, #6C6C74);\n\n  /* 唯一彩色：编辑靛蓝 */\n  --sy-accent:        light-dark(#1B4DB1, #7EA8FF);     /* 7.66 / 8.21 */\n  --sy-accent-hover:  light-dark(#143B8C, #A4C0FF);\n  --sy-accent-soft:   light-dark(#EAF0FC, #16223B);\n  --sy-accent-border: light-dark(#C3D3F5, #2C3E63);\n\n  --sy-selection-bg:  light-dark(#D6E3FF, #26365C);\n  --sy-selection-ink: light-dark(#111111, #F5F5F3);\n\n  --sy-stripe:        light-dark(rgba(17,17,17,.025), rgba(245,245,243,.035));\n  --sy-stripe-strong: light-dark(rgba(17,17,17,.05), rgba(245,245,243,.06));\n\n  /* 代码高亮 token · 浅色（基于 --sy-sunken #F1F0ED） */\n  --sy-code-comment:  #6B6B66;   /* 4.62:1 */\n  --sy-code-keyword:  #9B2C7A;   /* 5.02:1 */\n  --sy-code-string:   #1E6E3C;   /* 4.83:1 */\n  --sy-code-number:   #135E9E;   /* 5.12:1 */\n  --sy-code-func:     #8A5200;   /* 5.07:1 */\n  --sy-code-tag:      #0E6636;   /* 6.31:1 */\n  --sy-code-attr:     #135E9E;\n  --sy-code-punct:    #636360;   /* 5.93:1 */\n  --sy-code-variable: #111111;\n  --sy-code-deleted:  #A12A1E;\n  --sy-code-inserted: #1E6E3C;\n}\n/* 代码高亮 token · 深色（基于 --sy-sunken #202023） */\n:root[data-theme=\"dark\"] {\n  --sy-code-comment: #9A9A96; --sy-code-keyword: #E79ACD; --sy-code-string: #8FD4A6;\n  --sy-code-number: #86C2FF; --sy-code-func: #E8C06A; --sy-code-tag: #7FE5A8;\n  --sy-code-attr: #86C2FF; --sy-code-punct: #B8B8B4; --sy-code-variable: #F5F5F3;\n  --sy-code-deleted: #F09A8C; --sy-code-inserted: #8FD4A6;\n}\n@media (prefers-color-scheme: dark) {\n  :root:not([data-theme=\"light\"]) {\n    --sy-code-comment: #9A9A96; --sy-code-keyword: #E79ACD; --sy-code-string: #8FD4A6;\n    --sy-code-number: #86C2FF; --sy-code-func: #E8C06A; --sy-code-tag: #7FE5A8;\n    --sy-code-attr: #86C2FF; --sy-code-punct: #B8B8B4; --sy-code-variable: #F5F5F3;\n    --sy-code-deleted: #F09A8C; --sy-code-inserted: #8FD4A6;\n  }\n}\n\n/* 语义提示框（Callout）· 6 种 */\n:root {\n  --sy-note-ink:    light-dark(#37506E, #A9C4E6); --sy-note-bg:     light-dark(#EDF1F6, #1A222D); --sy-note-border: light-dark(#CBD8E8, #2C3B4D);\n  --sy-info-ink:    light-dark(#1B4DB1, #93B8FF); --sy-info-bg:     light-dark(#EAF0FC, #151F35); --sy-info-border: light-dark(#C3D3F5, #2A3A5E);\n  --sy-tip-ink:     light-dark(#1C6650, #84D2B2); --sy-tip-bg:      light-dark(#E7F4EE, #12241C); --sy-tip-border:  light-dark(#BEDFD0, #244536);\n  --sy-success-ink: light-dark(#22632C, #92D69C); --sy-success-bg:  light-dark(#EAF4EB, #142415); --sy-success-border: light-dark(#C3DFC7, #28432A);\n  --sy-warning-ink: light-dark(#7A4B08, #E5B45E); --sy-warning-bg:  light-dark(#FBF2DF, #251D10); --sy-warning-border: light-dark(#EBD9AC, #45361C);\n  --sy-error-ink:   light-dark(#A12A1E, #F09A8C); --sy-error-bg:    light-dark(#FCEBE8, #271614); --sy-error-border: light-dark(#F0C9C1, #492723);\n}\n\n/* 2. 字体 —— 衬线标题 + 无衬线正文 + 等宽 */\n:root {\n  --sy-font-body: -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\",\n                  \"Hiragino Sans GB\", \"Microsoft YaHei UI\", \"Microsoft YaHei\",\n                  \"Source Han Sans SC\", \"Noto Sans SC\", \"WenQuanYi Micro Hei\", sans-serif;\n  --sy-font-display: \"Source Han Serif SC\", \"Noto Serif SC\", \"Songti SC\",\n                     \"STSong\", \"SimSun\", Georgia, \"Times New Roman\", serif;\n  --sy-font-mono: \"JetBrains Mono\", \"Cascadia Mono\", \"SFMono-Regular\", Menlo,\n                  Consolas, \"Liberation Mono\", \"Sarasa Mono SC\",\n                  \"Source Han Mono SC\", \"Noto Sans Mono CJK SC\", monospace;\n\n  /* 杂志式：放大标题级差，形成视觉冲击 */\n  --sy-fs-3xs: 0.6875rem; --sy-fs-2xs: 0.75rem;  --sy-fs-xs: 0.8125rem;\n  --sy-fs-sm:  0.9375rem; --sy-fs-md:  1.0625rem; --sy-fs-lg:  1.25rem;\n  --sy-fs-xl:  1.5rem;    --sy-fs-2xl: 1.875rem;  --sy-fs-3xl: 2.375rem;\n  --sy-fs-4xl: 3rem;      --sy-fs-5xl: 3.75rem;\n\n  --sy-lh-body: 1.78; --sy-lh-tight: 1.15; --sy-lh-heading: 1.25;\n  --sy-lh-code: 1.6;  --sy-lh-caption: 1.5;\n\n  --sy-w-regular: 400; --sy-w-medium: 500; --sy-w-semibold: 600; --sy-w-bold: 700;\n  --sy-track-body: -0.003em; --sy-track-heading: -0.022em;\n  --sy-track-display: -0.03em; --sy-track-label: 0.14em;\n}\n\n/* 3. 间距（4px 基准） */\n:root {\n  --sy-sp-1: 4px;  --sy-sp-2: 8px;  --sy-sp-3: 12px; --sy-sp-4: 16px;\n  --sy-sp-5: 20px; --sy-sp-6: 24px; --sy-sp-8: 32px; --sy-sp-10: 40px;\n  --sy-sp-12: 48px; --sy-sp-16: 64px; --sy-sp-20: 80px; --sy-sp-24: 96px;\n  --sy-para-gap: var(--sy-sp-5); --sy-block-gap: var(--sy-sp-8);\n}\n\n/* 4. 圆角 / 阴影 / 层级 —— 近乎直角，锐利编辑感 */\n:root {\n  --sy-r-xs: 2px; --sy-r-sm: 3px; --sy-r-md: 4px; --sy-r-lg: 6px; --sy-r-full: 999px;\n  --sy-shadow-1: 0 1px 2px light-dark(rgba(17,17,17,.07), rgba(0,0,0,.40));\n  --sy-shadow-2: 0 6px 24px light-dark(rgba(17,17,17,.12), rgba(0,0,0,.52));\n  --sy-shadow-3: 0 16px 48px light-dark(rgba(17,17,17,.16), rgba(0,0,0,.60));\n  --sy-z-base: 0; --sy-z-raised: 10; --sy-z-sticky: 100; --sy-z-toc: 110;\n  --sy-z-drawer: 200; --sy-z-modal: 300; --sy-z-toast: 400; --sy-z-tooltip: 500;\n}\n\n/* 5. 布局 */\n:root {\n  --sy-page-max: 1240px; --sy-measure: 700px; --sy-measure-wide: 980px;\n  --sy-toc-w: 220px; --sy-gutter: var(--sy-sp-12);\n  --sy-header-h: 60px; --sy-header-h-sm: 52px;\n}\n\n/* 6. 动效 */\n:root {\n  --sy-dur-fast: 120ms; --sy-dur-base: 200ms; --sy-dur-slow: 320ms;\n  --sy-ease: cubic-bezier(.2, .6, .3, 1);\n}\n\n/* 7. 基础样式 */\n*, *::before, *::after { box-sizing: border-box; }\nhtml {\n  -webkit-text-size-adjust: 100%; text-size-adjust: 100%; scroll-behavior: smooth;\n  scroll-padding-top: calc(var(--sy-header-h) + var(--sy-sp-6));\n}\nbody {\n  margin: 0; background: var(--sy-paper); color: var(--sy-ink);\n  font-family: var(--sy-font-body); font-size: var(--sy-fs-md);\n  line-height: var(--sy-lh-body); letter-spacing: var(--sy-track-body);\n  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;\n  text-rendering: optimizeLegibility;\n  font-variant-numeric: oldstyle-nums proportional-nums; overflow-wrap: break-word;\n}\n::selection { background: var(--sy-selection-bg); color: var(--sy-selection-ink); }\n:focus-visible { outline: 2px solid var(--sy-accent); outline-offset: 3px; border-radius: var(--sy-r-xs); }\n.sy-code__body[tabindex], .sy-table-wrap[tabindex], .sy-math[tabindex] { scrollbar-width: thin; }\n.sy-skip {\n  position: absolute; left: -9999px; top: 0; z-index: var(--sy-z-tooltip);\n  padding: var(--sy-sp-2) var(--sy-sp-4); background: var(--sy-surface);\n  color: var(--sy-ink); border: 1px solid var(--sy-border-control); border-radius: var(--sy-r-sm);\n}\n.sy-skip:focus { left: var(--sy-sp-4); top: var(--sy-sp-2); }\n\n/* 8. 排版 —— 杂志式核心 */\n.sy-doc { margin: 0; }\n.sy-doc > * + * { margin-top: var(--sy-para-gap); }\n\n/* 刊头：粗底边 + 大标题 + 宽字距元信息 */\n.sy-doc-head { border-bottom: 3px solid var(--sy-ink); padding-bottom: var(--sy-sp-8); margin-bottom: var(--sy-sp-12); }\n.sy-doc-head h1, .sy-doc h1 {\n  font-family: var(--sy-font-display); font-weight: var(--sy-w-bold);\n  color: var(--sy-ink); margin: 0; overflow-wrap: break-word;\n}\n.sy-doc-head h1 {\n  /* v1.4：正文字号收敛到 28px，避免杂志式大标题过于抢眼 */\n  font-size: 1.75rem; line-height: 1.32; letter-spacing: var(--sy-track-display);\n}\n.sy-doc-head__meta {\n  display: flex; flex-wrap: wrap; align-items: center; gap: var(--sy-sp-2) var(--sy-sp-3);\n  margin-top: var(--sy-sp-5); font-size: var(--sy-fs-2xs);\n  letter-spacing: var(--sy-track-label); text-transform: uppercase; color: var(--sy-ink-muted);\n}\n\n.sy-doc h1, .sy-doc h2, .sy-doc h3, .sy-doc h4, .sy-doc h5, .sy-doc h6 {\n  font-family: var(--sy-font-display); font-weight: var(--sy-w-bold);\n  color: var(--sy-ink); line-height: var(--sy-lh-heading);\n  letter-spacing: var(--sy-track-heading); margin: 0;\n  scroll-margin-top: calc(var(--sy-header-h) + var(--sy-sp-6));\n}\n.sy-doc h1 { font-size: 2rem; line-height: var(--sy-lh-tight); letter-spacing: var(--sy-track-display); }\n.sy-doc h2 { font-size: var(--sy-fs-3xl); line-height: var(--sy-lh-tight); }\n.sy-doc h3 { font-size: var(--sy-fs-2xl); }\n.sy-doc h4 { font-size: var(--sy-fs-xl); }\n.sy-doc h5 { font-size: var(--sy-fs-lg); }\n.sy-doc h6 { font-size: var(--sy-fs-md); color: var(--sy-ink-muted); }\n\n/* h2 上方编辑式粗短线，强化分栏感 */\n.sy-doc h2 { margin-top: var(--sy-sp-16); padding-top: var(--sy-sp-6); border-top: 2px solid var(--sy-ink); }\n.sy-doc h2 + * { margin-top: var(--sy-sp-4); }\n.sy-doc h3 { margin-top: var(--sy-sp-10); }\n.sy-doc h4 { margin-top: var(--sy-sp-8); }\n.sy-doc > h1:first-child { margin-top: 0; }\n.sy-doc p { margin: 0; }\n.sy-doc blockquote {\n  margin: var(--sy-block-gap) 0;\n  padding: var(--sy-sp-3) var(--sy-sp-5);\n  border-left: 3px solid var(--sy-ink);\n  background: var(--sy-sunken);\n  color: var(--sy-ink-muted);\n}\n.sy-doc blockquote p { margin: 0; }\n.sy-doc blockquote p + p { margin-top: var(--sy-sp-2); }\n\n/* 首字下沉：杂志式标志手法 */\n.sy-doc > p:first-child::first-letter {\n  float: left; font-family: var(--sy-font-display); font-size: 3.4em;\n  line-height: .82; font-weight: var(--sy-w-bold); color: var(--sy-ink);\n  padding: .08em .10em 0 0;\n}\n\n.sy-doc a {\n  color: var(--sy-accent); text-decoration: underline; text-decoration-thickness: 1px;\n  text-underline-offset: 3px;\n  text-decoration-color: color-mix(in srgb, var(--sy-accent) 40%, transparent);\n  transition: color var(--sy-dur-fast) var(--sy-ease), text-decoration-color var(--sy-dur-fast) var(--sy-ease);\n}\n.sy-doc a:hover { color: var(--sy-accent-hover); text-decoration-color: currentColor; }\n.sy-doc a[rel~=\"external\"]::after {\n  content: \"\\2197\"; display: inline-block; margin-left: 2px; font-size: .85em; vertical-align: 1px; opacity: .6;\n}\n.sy-doc ul, .sy-doc ol { margin: 0; padding-left: 1.7em; }\n.sy-doc li { margin: var(--sy-sp-1) 0; }\n.sy-doc li > ul, .sy-doc li > ol { margin-top: var(--sy-sp-1); }\n.sy-doc ul { list-style: disc; }\n.sy-doc ul ul { list-style: circle; }\n.sy-doc ol { list-style: decimal; }\n.sy-doc ul li::marker, .sy-doc ol li::marker { color: var(--sy-ink-subtle); }\n.sy-doc ol li::marker { font-variant-numeric: tabular-nums; }\n.sy-doc hr { border: 0; border-top: 1px solid var(--sy-border); margin: var(--sy-sp-12) 0; }\n.sy-doc strong { font-weight: var(--sy-w-bold); }\n.sy-doc em { font-style: normal; color: var(--sy-ink-muted); } /* 中文不用斜体 */\n.sy-doc mark { background: var(--sy-accent-soft); color: var(--sy-ink); padding: .08em .24em; border-radius: var(--sy-r-xs); }\n.sy-doc img { max-width: 100%; height: auto; display: block; border-radius: var(--sy-r-sm); background: var(--sy-sunken); }\n.sy-doc figure { margin: var(--sy-block-gap) 0; }\n.sy-doc figcaption {\n  margin-top: var(--sy-sp-2); font-size: var(--sy-fs-2xs); line-height: var(--sy-lh-caption);\n  color: var(--sy-ink-subtle); text-align: left; padding-left: var(--sy-sp-3); border-left: 2px solid var(--sy-accent);\n}\n.sy-doc :not(pre) > code {\n  font-family: var(--sy-font-mono); font-size: .87em; padding: .12em .34em;\n  border-radius: var(--sy-r-xs); background: var(--sy-sunken); border: 1px solid var(--sy-border); color: var(--sy-ink);\n}\n\n/* 9.1 引用块：粗竖线 + 大引号 */\n.sy-quote {\n  position: relative; margin: var(--sy-block-gap) 0;\n  padding: var(--sy-sp-2) 0 var(--sy-sp-2) var(--sy-sp-6);\n  border-left: 4px solid var(--sy-ink); color: var(--sy-ink-muted);\n}\n.sy-quote::before {\n  content: \"\\201C\"; position: absolute; left: var(--sy-sp-3); top: -6px;\n  font-family: var(--sy-font-display); font-size: 2.4em; line-height: 1; color: var(--sy-border-strong);\n}\n.sy-quote > *:first-child { margin-top: 0; }\n.sy-quote > *:last-child  { margin-bottom: 0; }\n.sy-quote cite, .sy-quote .sy-quote__src {\n  display: block; margin-top: var(--sy-sp-2); font-size: var(--sy-fs-2xs);\n  font-style: normal; letter-spacing: var(--sy-track-label); color: var(--sy-ink-subtle);\n}\n\n/* 9.2 提示框 Callout */\n.sy-callout {\n  --_ink: var(--sy-ink); --_bg: var(--sy-sunken); --_bd: var(--sy-border);\n  display: flex; gap: var(--sy-sp-3); margin: var(--sy-block-gap) 0;\n  padding: var(--sy-sp-4) var(--sy-sp-5);\n  border: 1px solid var(--_bd); border-left-width: 4px; border-radius: var(--sy-r-md);\n  background: var(--_bg); color: var(--sy-ink); font-size: var(--sy-fs-sm); line-height: 1.72;\n}\n.sy-callout__icon { flex: 0 0 auto; width: 18px; height: 18px; margin-top: 3px; color: var(--_ink); }\n.sy-callout__img  { flex: 0 0 auto; max-width: 40px; height: auto; }\n.sy-callout__body, .sy-callout__content { min-width: 0; flex: 1 1 auto; }\n.sy-callout__body > *, .sy-callout__content > * { margin: 0; }\n.sy-callout__body > * + *, .sy-callout__content > * + * { margin-top: var(--sy-sp-2); }\n.sy-callout__title {\n  font-weight: var(--sy-w-bold); color: var(--_ink);\n  letter-spacing: var(--sy-track-label); margin-bottom: var(--sy-sp-1) !important;\n}\n.sy-callout--note    { --_ink: var(--sy-note-ink);    --_bg: var(--sy-note-bg);    --_bd: var(--sy-note-border); }\n.sy-callout--info    { --_ink: var(--sy-info-ink);    --_bg: var(--sy-info-bg);    --_bd: var(--sy-info-border); }\n.sy-callout--tip     { --_ink: var(--sy-tip-ink);     --_bg: var(--sy-tip-bg);     --_bd: var(--sy-tip-border); }\n.sy-callout--success { --_ink: var(--sy-success-ink); --_bg: var(--sy-success-bg); --_bd: var(--sy-success-border); }\n.sy-callout--warning { --_ink: var(--sy-warning-ink); --_bg: var(--sy-warning-bg); --_bd: var(--sy-warning-border); }\n.sy-callout--error   { --_ink: var(--sy-error-ink);   --_bg: var(--sy-error-bg);   --_bd: var(--sy-error-border); }\n\n/* 9.3 代码块 */\n.sy-code {\n  margin: var(--sy-block-gap) 0; border: 1px solid var(--sy-border);\n  border-radius: var(--sy-r-md); background: var(--sy-sunken); overflow: hidden;\n}\n.sy-code__head {\n  display: flex; align-items: center; justify-content: space-between; gap: var(--sy-sp-3);\n  padding: var(--sy-sp-2) var(--sy-sp-2) var(--sy-sp-2) var(--sy-sp-4);\n  border-bottom: 1px solid var(--sy-border);\n  background: color-mix(in srgb, var(--sy-sunken) 65%, var(--sy-paper));\n}\n.sy-code__lang {\n  font-family: var(--sy-font-mono); font-size: var(--sy-fs-3xs);\n  letter-spacing: var(--sy-track-label); text-transform: uppercase; color: var(--sy-ink-subtle);\n}\n.sy-code__tools { display: flex; gap: var(--sy-sp-1); }\n.sy-code__btn {\n  display: inline-flex; align-items: center; justify-content: center;\n  min-width: 28px; min-height: 28px; padding: 0 var(--sy-sp-2);\n  font: inherit; font-size: var(--sy-fs-3xs); color: var(--sy-ink-subtle);\n  background: transparent; border: 1px solid transparent; border-radius: var(--sy-r-xs); cursor: pointer;\n  transition: background var(--sy-dur-fast) var(--sy-ease), color var(--sy-dur-fast) var(--sy-ease);\n}\n.sy-code__btn:hover { background: var(--sy-accent-soft); color: var(--sy-accent); }\n.sy-code__btn[data-state=\"done\"] { color: var(--sy-success-ink); }\n.sy-code__btn svg { width: 13px; height: 13px; }\n.sy-code__body {\n  margin: 0; padding: var(--sy-sp-4); overflow-x: auto; overscroll-behavior-x: contain;\n  font-family: var(--sy-font-mono); font-size: var(--sy-fs-xs);\n  line-height: var(--sy-lh-code); tab-size: 2; color: var(--sy-ink);\n}\n.sy-code__body code { font: inherit; background: none; border: 0; padding: 0; }\n.sy-code--wrap .sy-code__body { white-space: pre-wrap; overflow-wrap: anywhere; }\n.sy-code--numbered .sy-code__body code { counter-reset: sy-ln; }\n.sy-code--numbered .sy-code__body .sy-code__line { display: block; counter-increment: sy-ln; }\n.sy-code--numbered .sy-code__body .sy-code__line::before {\n  content: counter(sy-ln); display: inline-block; width: 2.2em; margin-right: 1em;\n  text-align: right; color: var(--sy-ink-subtle); opacity: .6; user-select: none;\n}\n.hljs-comment, .hljs-quote { color: var(--sy-code-comment); font-style: normal; }\n.hljs-keyword, .hljs-selector-tag, .hljs-literal { color: var(--sy-code-keyword); }\n.hljs-string, .hljs-regexp, .hljs-addition { color: var(--sy-code-string); }\n.hljs-number, .hljs-symbol { color: var(--sy-code-number); }\n.hljs-title, .hljs-title.function_, .hljs-section { color: var(--sy-code-func); }\n.hljs-tag, .hljs-name { color: var(--sy-code-tag); }\n.hljs-attr, .hljs-attribute { color: var(--sy-code-attr); }\n.hljs-punctuation, .hljs-operator { color: var(--sy-code-punct); }\n.hljs-variable, .hljs-params { color: var(--sy-code-variable); }\n.hljs-deletion { color: var(--sy-code-deleted); }\n\n/* 9.4 表格 */\n.sy-table-wrap {\n  margin: var(--sy-block-gap) 0; overflow-x: auto; overscroll-behavior-x: contain;\n  border: 1px solid var(--sy-border); border-radius: var(--sy-r-md); background: var(--sy-surface);\n}\n.sy-doc table, .sy-table-wrap table { width: 100%; border-collapse: collapse; font-size: var(--sy-fs-xs); line-height: 1.6; }\n.sy-doc th, .sy-doc td, .sy-table-wrap th, .sy-table-wrap td {\n  padding: var(--sy-sp-2) var(--sy-sp-3); text-align: left;\n  border-bottom: 1px solid var(--sy-border); vertical-align: top;\n}\n.sy-doc thead th, .sy-table-wrap thead th {\n  background: var(--sy-sunken); font-weight: var(--sy-w-bold); font-size: var(--sy-fs-3xs);\n  letter-spacing: var(--sy-track-label); text-transform: uppercase;\n  color: var(--sy-ink-muted); white-space: nowrap; border-bottom: 2px solid var(--sy-ink);\n}\n.sy-doc tbody tr:nth-child(even), .sy-table-wrap tbody tr:nth-child(even) { background: var(--sy-stripe); }\n.sy-doc tbody tr:hover, .sy-table-wrap tbody tr:hover { background: var(--sy-stripe-strong); }\n.sy-doc tbody tr:last-child td, .sy-table-wrap tbody tr:last-child td { border-bottom: 0; }\n.sy-doc td[data-numeric=\"true\"], .sy-doc th[data-numeric=\"true\"],\n.sy-table-wrap td[data-numeric=\"true\"], .sy-table-wrap th[data-numeric=\"true\"] {\n  text-align: right; font-variant-numeric: tabular-nums;\n}\n\n/* 9.5 图片 / 兜底 */\n.sy-figure { margin: var(--sy-block-gap) 0; }\n.sy-figure img {\n  width: 100%; border: 1px solid var(--sy-border); border-radius: var(--sy-r-sm);\n  background: var(--sy-sunken); box-shadow: var(--sy-shadow-1);\n}\n.sy-figure--plain img { border: 0; box-shadow: none; }\n.sy-figure__cap {\n  margin-top: var(--sy-sp-2); font-size: var(--sy-fs-2xs); line-height: var(--sy-lh-caption);\n  color: var(--sy-ink-subtle); text-align: left; padding-left: var(--sy-sp-3); border-left: 2px solid var(--sy-accent);\n}\n.sy-img-fallback {\n  display: flex; flex-direction: column; align-items: center; justify-content: center;\n  gap: var(--sy-sp-2); min-height: 140px; padding: var(--sy-sp-6);\n  border: 1px dashed var(--sy-border-control); border-radius: var(--sy-r-md);\n  background: var(--sy-sunken); color: var(--sy-ink-subtle); font-size: var(--sy-fs-xs); text-align: center;\n}\n.sy-img-fallback svg { width: 28px; height: 28px; opacity: .55; }\n.sy-img-fallback__name { color: var(--sy-ink-muted); word-break: break-all; }\n\n/* 9.6 公式 */\n.sy-math {\n  margin: var(--sy-block-gap) 0; padding: var(--sy-sp-5) var(--sy-sp-4);\n  overflow-x: auto; overscroll-behavior-x: contain; text-align: center;\n  background: var(--sy-sunken); border: 1px solid var(--sy-border);\n  border-left: 4px solid var(--sy-accent); border-radius: var(--sy-r-md); font-size: var(--sy-fs-md);\n}\n.sy-math--inline { display: inline-block; margin: 0; padding: 0 .35em; border: 0; background: none; text-align: left; }\n.sy-math .katex-display { margin: 0; }\n.sy-math .katex { font-size: 1.05em; }\n\n/* 9.7 徽章 */\n.sy-badge {\n  display: inline-flex; align-items: center; gap: 4px; height: 22px;\n  padding: 0 var(--sy-sp-2); font-size: var(--sy-fs-3xs); font-weight: var(--sy-w-bold);\n  line-height: 1; letter-spacing: var(--sy-track-label); text-transform: uppercase;\n  color: var(--sy-accent); background: var(--sy-accent-soft);\n  border: 1px solid var(--sy-accent-border); border-radius: var(--sy-r-full); white-space: nowrap;\n}\n.sy-badge--muted { color: var(--sy-ink-muted); background: var(--sy-sunken); border-color: var(--sy-border); }\n\n/* 9.8 内核结构适配后的组件：脚注 / 任务 / 块 */\n.sy-doc__block { margin: 0; }\n.sy-task { display: flex; align-items: flex-start; gap: var(--sy-sp-2); }\n.sy-task__box {\n  flex: 0 0 auto; width: 16px; height: 16px; margin-top: 4px;\n  display: inline-flex; align-items: center; justify-content: center;\n  border: 1px solid var(--sy-border-control); border-radius: var(--sy-r-xs);\n  background: var(--sy-paper); color: transparent; font-size: 11px; line-height: 1;\n}\n.sy-task__box--checked { background: var(--sy-accent); border-color: var(--sy-accent); color: var(--sy-ink-invert); }\n.sy-task__box--checked::after { content: \"\\2713\"; }\n.sy-task:has(.sy-task__box--checked) > *:not(.sy-task__box) { color: var(--sy-ink-subtle); }\n.sy-footnotes {\n  margin-top: var(--sy-sp-16); padding-top: var(--sy-sp-4);\n  border-top: 1px solid var(--sy-border); font-size: var(--sy-fs-xs); color: var(--sy-ink-muted);\n}\n.sy-footnotes__hr { border: 0; border-top: 2px solid var(--sy-ink); margin: 0 0 var(--sy-sp-4); width: 48px; }\n.sy-footnotes__list { margin: 0; padding-left: 1.6em; }\n.sy-footnotes__list li { margin: var(--sy-sp-1) 0; }\n.sy-footnotes__ref {\n  font-size: .72em; vertical-align: super; color: var(--sy-accent); text-decoration: none; padding: 0 1px;\n}\n.sy-footnotes__ref:hover { text-decoration: underline; }\n\n/* 10. 页眉 / 布局 / 目录 / 页脚 */\n.sy-header {\n  position: sticky; top: 0; z-index: var(--sy-z-sticky); height: var(--sy-header-h);\n  display: flex; align-items: center;\n  background: color-mix(in srgb, var(--sy-paper) 88%, transparent);\n  backdrop-filter: saturate(160%) blur(12px); -webkit-backdrop-filter: saturate(160%) blur(12px);\n  border-bottom: 1px solid transparent;\n  transition: border-color var(--sy-dur-base) var(--sy-ease);\n}\n.sy-header[data-scrolled=\"true\"] { border-bottom-color: var(--sy-border); }\n.sy-header__inner {\n  width: 100%; max-width: var(--sy-page-max); margin: 0 auto;\n  padding: 0 var(--sy-gutter); display: flex; align-items: center; gap: var(--sy-sp-4);\n}\n.sy-header__actions { display: flex; align-items: center; gap: var(--sy-sp-1); margin-left: auto; }\n.sy-iconbtn {\n  display: inline-flex; align-items: center; justify-content: center;\n  width: 36px; height: 36px; padding: 0; color: var(--sy-ink-muted);\n  background: transparent; border: 1px solid transparent; border-radius: var(--sy-r-sm); cursor: pointer;\n  transition: background var(--sy-dur-fast) var(--sy-ease), color var(--sy-dur-fast) var(--sy-ease);\n}\n.sy-iconbtn:hover { background: var(--sy-accent-soft); color: var(--sy-accent); }\n.sy-iconbtn svg { width: 17px; height: 17px; }\n\n.sy-layout {\n  max-width: var(--sy-page-max); margin: 0 auto;\n  padding: var(--sy-sp-12) var(--sy-gutter) var(--sy-sp-24);\n  display: grid; grid-template-columns: minmax(0, 1fr) var(--sy-toc-w);\n  gap: var(--sy-sp-16); align-items: start;\n}\n/* DOM 顺序为「正文 → 目录」，必须显式指定列位，避免 Grid 自动填充导致目录抢正文列 */\n.sy-main { grid-column: 1; grid-row: 1; min-width: 0; max-width: var(--sy-measure); }\n.sy-toc  { grid-column: 2; grid-row: 1; }\n.sy-toc {\n  position: sticky; top: calc(var(--sy-header-h) + var(--sy-sp-6)); z-index: var(--sy-z-toc);\n  max-height: calc(100vh - var(--sy-header-h) - var(--sy-sp-12));\n  overflow-y: auto; overscroll-behavior: contain; font-size: var(--sy-fs-xs);\n  scrollbar-width: thin; border-top: 2px solid var(--sy-ink); padding-top: var(--sy-sp-3);\n}\n.sy-toc__title {\n  margin: 0 0 var(--sy-sp-3); font-size: var(--sy-fs-3xs); font-weight: var(--sy-w-bold);\n  letter-spacing: var(--sy-track-label); text-transform: uppercase; color: var(--sy-ink-subtle);\n}\n.sy-toc__list { list-style: none; margin: 0; padding: 0; }\n.sy-toc__list li { margin: 0; }\n.sy-toc__link {\n  display: block; padding: 6px var(--sy-sp-2) 6px var(--sy-sp-3);\n  margin-left: calc(var(--sy-toc-indent, 0) * 12px);\n  color: var(--sy-ink-muted); text-decoration: none;\n  border-left: 2px solid var(--sy-border); line-height: 1.45; overflow-wrap: anywhere;\n  transition: color var(--sy-dur-fast) var(--sy-ease), border-color var(--sy-dur-fast) var(--sy-ease);\n}\n.sy-toc__link:hover { color: var(--sy-ink); }\n.sy-toc__link[aria-current=\"true\"] { color: var(--sy-accent); border-left-color: var(--sy-accent); font-weight: var(--sy-w-bold); }\n.sy-footer {\n  max-width: var(--sy-measure); margin: var(--sy-sp-16) auto 0;\n  padding-top: var(--sy-sp-6); border-top: 2px solid var(--sy-ink);\n  font-size: var(--sy-fs-2xs); line-height: var(--sy-lh-caption); color: var(--sy-ink-subtle);\n}\n.sy-footer__row { display: flex; flex-wrap: wrap; gap: var(--sy-sp-2) var(--sy-sp-4); }\n.sy-footer__meta { display: flex; flex-wrap: wrap; gap: var(--sy-sp-1) var(--sy-sp-3); }\n.sy-footer__sep { opacity: .5; }\n.sy-toc-toggle { display: none; }\n\n/* 11. 密码遮罩 .sy-gate —— 4 位数字 */\n.sy-gate {\n  position: fixed; inset: 0; z-index: var(--sy-z-modal);\n  display: flex; align-items: center; justify-content: center;\n  padding: var(--sy-sp-6); background: var(--sy-paper);\n}\n.sy-gate[hidden] { display: none; }\n.sy-gate__card {\n  width: min(440px, 100%); padding: var(--sy-sp-10) var(--sy-sp-8);\n  background: var(--sy-surface); border: 1px solid var(--sy-border-control);\n  border-top: 4px solid var(--sy-ink); box-shadow: var(--sy-shadow-3);\n}\n.sy-gate__kicker {\n  margin: 0 0 var(--sy-sp-3); font-size: var(--sy-fs-3xs); font-weight: var(--sy-w-bold);\n  letter-spacing: var(--sy-track-label); text-transform: uppercase; color: var(--sy-accent);\n}\n.sy-gate__title {\n  margin: 0 0 var(--sy-sp-3); font-family: var(--sy-font-display);\n  font-size: var(--sy-fs-3xl); line-height: var(--sy-lh-tight);\n  letter-spacing: var(--sy-track-display); color: var(--sy-ink);\n}\n.sy-gate__desc { margin: 0 0 var(--sy-sp-8); font-size: var(--sy-fs-sm); line-height: 1.7; color: var(--sy-ink-muted); }\n.sy-gate__fields { display: flex; gap: var(--sy-sp-2); margin: 0 0 var(--sy-sp-4); }\n.sy-gate__input {\n  flex: 1 1 0; min-width: 0; width: 100%; height: 60px; text-align: center;\n  font-family: var(--sy-font-mono); font-size: 26px; font-weight: var(--sy-w-bold);\n  color: var(--sy-ink); background: var(--sy-paper);\n  border: 1px solid var(--sy-border-control); border-bottom: 2px solid var(--sy-ink);\n  border-radius: var(--sy-r-sm); -moz-appearance: textfield;\n}\n.sy-gate__input::-webkit-inner-spin-button,\n.sy-gate__input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }\n.sy-gate__input:focus-visible { outline: 2px solid var(--sy-accent); outline-offset: 2px; }\n.sy-gate__error {\n  display: none; margin: 0 0 var(--sy-sp-4); font-size: var(--sy-fs-xs);\n  color: var(--sy-error-ink); min-height: 1.2em;\n}\n.sy-gate__error[data-show=\"true\"] { display: block; }\n.sy-gate__submit {\n  display: block; width: 100%; min-height: 44px; padding: var(--sy-sp-3) var(--sy-sp-6);\n  font: inherit; font-size: var(--sy-fs-sm); font-weight: var(--sy-w-bold);\n  letter-spacing: var(--sy-track-label); color: var(--sy-ink-invert);\n  background: var(--sy-accent); border: 1px solid var(--sy-accent);\n  border-radius: var(--sy-r-sm); cursor: pointer;\n  transition: background var(--sy-dur-fast) var(--sy-ease);\n}\n.sy-gate__submit:hover { background: var(--sy-accent-hover); }\n.sy-gate__notice {\n  margin: var(--sy-sp-5) 0 0; padding-top: var(--sy-sp-4);\n  border-top: 1px solid var(--sy-border); font-size: var(--sy-fs-2xs);\n  line-height: 1.6; color: var(--sy-ink-subtle);\n}\n\n/* 12. 链接失效页 .sy-expired */\n.sy-expired {\n  min-height: 70vh; display: flex; align-items: center; justify-content: center;\n  padding: var(--sy-sp-16) var(--sy-gutter); text-align: center;\n}\n.sy-expired__inner { max-width: 560px; }\n.sy-expired__code {\n  margin: 0 0 var(--sy-sp-4); font-family: var(--sy-font-mono);\n  font-size: var(--sy-fs-5xl); font-weight: var(--sy-w-bold);\n  line-height: 1; letter-spacing: var(--sy-track-display); color: var(--sy-accent);\n}\n.sy-expired__title {\n  margin: 0 0 var(--sy-sp-4); padding-top: var(--sy-sp-5);\n  border-top: 2px solid var(--sy-ink); font-family: var(--sy-font-display);\n  font-size: var(--sy-fs-3xl); line-height: var(--sy-lh-tight); color: var(--sy-ink);\n}\n.sy-expired__desc { margin: 0 0 var(--sy-sp-6); font-size: var(--sy-fs-sm); line-height: 1.75; color: var(--sy-ink-muted); }\n.sy-expired__contact {\n  margin: 0; padding: var(--sy-sp-4); background: var(--sy-sunken);\n  border-left: 4px solid var(--sy-accent); font-size: var(--sy-fs-xs);\n  line-height: 1.7; color: var(--sy-ink-muted); text-align: left; overflow-wrap: anywhere;\n}\n.sy-expired__notice { margin: var(--sy-sp-6) 0 0; font-size: var(--sy-fs-2xs); color: var(--sy-ink-subtle); line-height: 1.6; }\n\n/* 13. 响应式 · 六断点 */\n@media (min-width: 1440px) {\n  :root { --sy-gutter: var(--sy-sp-16); }\n  .sy-doc-head h1 { font-size: 1.75rem; }\n}\n@media (max-width: 1439px) {\n  :root { --sy-toc-w: 200px; --sy-gutter: var(--sy-sp-8); }\n}\n@media (max-width: 1023px) {\n  :root { --sy-gutter: var(--sy-sp-6); --sy-header-h: var(--sy-header-h-sm); }\n  body { font-size: var(--sy-fs-sm); }\n  .sy-layout { grid-template-columns: minmax(0, 1fr); gap: var(--sy-sp-6); padding-top: var(--sy-sp-8); }\n  .sy-main { grid-column: 1; grid-row: 1; max-width: none; }\n  .sy-toc {\n    grid-column: 1; grid-row: 1; position: fixed; inset: 0 auto 0 0;\n    z-index: var(--sy-z-drawer); width: min(320px, 84vw); max-height: none;\n    padding: var(--sy-sp-6); background: var(--sy-surface);\n    border-right: 1px solid var(--sy-border); box-shadow: var(--sy-shadow-3);\n    transform: translateX(-100%);\n    transition: transform var(--sy-dur-base) var(--sy-ease); overflow-y: auto;\n  }\n  .sy-toc[data-open=\"true\"] { transform: translateX(0); }\n  .sy-toc-toggle {\n    display: inline-flex; align-items: center; gap: var(--sy-sp-2); min-height: 36px;\n    padding: 0 var(--sy-sp-3); font: inherit; font-size: var(--sy-fs-xs);\n    color: var(--sy-ink-muted); background: var(--sy-surface);\n    border: 1px solid var(--sy-border-control); border-radius: var(--sy-r-sm); cursor: pointer;\n  }\n  .sy-scrim {\n    position: fixed; inset: 0; z-index: calc(var(--sy-z-drawer) - 1);\n    background: var(--sy-overlay); opacity: 0; pointer-events: none;\n    transition: opacity var(--sy-dur-base) var(--sy-ease);\n  }\n  .sy-scrim[data-open=\"true\"] { opacity: 1; pointer-events: auto; }\n  .sy-doc-head h1 { font-size: 1.5rem; }\n  .sy-doc h1 { font-size: 1.75rem; }\n  .sy-doc h2 { font-size: var(--sy-fs-2xl); margin-top: var(--sy-sp-12); }\n  .sy-doc h3 { font-size: var(--sy-fs-xl); }\n  .sy-code__body { padding: var(--sy-sp-3); }\n}\n@media (max-width: 767px) {\n  :root { --sy-gutter: var(--sy-sp-5); }\n  body { line-height: 1.72; }\n  .sy-layout { padding-bottom: var(--sy-sp-16); }\n  .sy-doc-head h1, .sy-doc h1 { font-size: 1.5rem; letter-spacing: var(--sy-track-heading); }\n  .sy-doc h2 { font-size: var(--sy-fs-xl); margin-top: var(--sy-sp-8); }\n  .sy-doc h3 { font-size: var(--sy-fs-lg); margin-top: var(--sy-sp-6); }\n  .sy-doc > p:first-child::first-letter { font-size: 2.8em; }\n  .sy-doc figure, .sy-doc .sy-code, .sy-doc .sy-table-wrap, .sy-doc .sy-math {\n    margin-left: calc(var(--sy-gutter) * -1); margin-right: calc(var(--sy-gutter) * -1);\n  }\n  .sy-doc .sy-code, .sy-doc .sy-math { border-radius: 0; border-left: 0; border-right: 0; }\n  .sy-code__body { font-size: var(--sy-fs-3xs); }\n  .sy-callout { padding: var(--sy-sp-3); }\n  .sy-footer { margin-top: var(--sy-sp-12); }\n  .sy-gate__card { padding: var(--sy-sp-8) var(--sy-sp-6); }\n  .sy-gate__title { font-size: var(--sy-fs-2xl); }\n  .sy-expired__code { font-size: var(--sy-fs-4xl); }\n  .sy-expired__title { font-size: var(--sy-fs-2xl); }\n}\n@media (max-width: 479px) {\n  :root { --sy-gutter: var(--sy-sp-4); }\n  .sy-gate__input { height: 52px; font-size: 22px; }\n}\n@media (pointer: coarse) {\n  .sy-code__btn { min-width: 44px; min-height: 44px; }\n  .sy-iconbtn { width: 44px; height: 44px; }\n  .sy-toc-toggle { min-height: 44px; }\n  .sy-footnotes__ref { padding: 8px 4px; margin: -8px -4px; }\n}\n\n/* 14. 打印 / 另存 PDF */\n@media print {\n  @page { margin: 18mm 16mm; }\n  :root, :root[data-theme=\"dark\"] {\n    color-scheme: light;\n    --sy-paper: #FFFFFF; --sy-surface: #FFFFFF; --sy-sunken: #F6F6F4;\n    --sy-ink: #111111; --sy-ink-muted: #44443F; --sy-ink-subtle: #5F5F59;\n    --sy-border: #D8D7D2; --sy-border-control: #8A8A85; --sy-accent: #1B4DB1;\n    --sy-accent-soft: #EAF0FC;\n    --sy-code-comment: #6B6B66; --sy-code-keyword: #9B2C7A; --sy-code-string: #1E6E3C;\n    --sy-code-number: #135E9E; --sy-code-func: #8A5200; --sy-code-tag: #0E6636;\n    --sy-code-attr: #135E9E; --sy-code-punct: #4A4A45; --sy-code-variable: #111111;\n  }\n  html, body { background: #fff !important; color: #111; }\n  body { font-size: 10.5pt; line-height: 1.7; }\n  .sy-header, .sy-toc, .sy-toc-toggle, .sy-scrim, .sy-code__tools,\n  .sy-header__actions, .sy-skip, .sy-no-print, .sy-gate, .sy-expired { display: none !important; }\n  .sy-layout { display: block; max-width: none; padding: 0; }\n  .sy-main, .sy-footer { max-width: none; margin: 0; }\n  .sy-code, .sy-figure, .sy-table-wrap, .sy-callout, .sy-math, .sy-footnotes {\n    break-inside: avoid; page-break-inside: avoid;\n  }\n  .sy-code--long { break-inside: auto; page-break-inside: auto; }\n  .sy-code--long .sy-code__body { overflow: visible; white-space: pre-wrap; }\n  .sy-doc h1, .sy-doc h2, .sy-doc h3, .sy-doc h4 { break-after: avoid; page-break-after: avoid; }\n  .sy-doc img { max-width: 100% !important; break-inside: avoid; }\n  .sy-doc thead { display: table-header-group; }\n  .sy-doc tr { break-inside: avoid; }\n  .sy-doc hr { margin: 12pt 0; }\n  .sy-print-url a[href^=\"http\"]::after { content: \" (\" attr(href) \")\"; font-size: 9pt; color: #5F5F59; }\n}\n\n/* 15. 动效克制 + reduced-motion */\n.sy-lazy { opacity: 0; transition: opacity var(--sy-dur-base) var(--sy-ease); }\n.sy-lazy[data-loaded=\"true\"] { opacity: 1; }\n@media (prefers-reduced-motion: reduce) {\n  html { scroll-behavior: auto; }\n  *, *::before, *::after {\n    animation-duration: .01ms !important; animation-iteration-count: 1 !important;\n    transition-duration: .01ms !important;\n  }\n}\n\n</style>\n{{HEAD_RESOURCES}}\n</head>\n<body>\n\n<a class=\"sy-skip\" href=\"#sy-main\">跳到正文</a>\n\n<!-- ========== 页眉 ========== -->\n<header class=\"sy-header\" data-scrolled=\"false\">\n  <div class=\"sy-header__inner\">\n    <!-- 窄屏目录抽屉开关（≥1024px 隐藏） -->\n    <button class=\"sy-toc-toggle\" type=\"button\" aria-controls=\"sy-toc\" aria-expanded=\"false\">\n      <svg width=\"15\" height=\"15\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linecap=\"round\" aria-hidden=\"true\">\n        <path d=\"M2.5 4h11M2.5 8h11M2.5 12h7\"/>\n      </svg>\n      目录\n    </button>\n\n    <div class=\"sy-header__actions\">\n      <!-- 主题切换：跟随系统 → 浅 → 深 循环 -->\n      <button class=\"sy-iconbtn\" type=\"button\" data-action=\"toggle-theme\" title=\"切换主题\" aria-label=\"切换主题\">\n        <svg data-icon=\"theme\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\">\n          <circle cx=\"8\" cy=\"8\" r=\"3.2\"/>\n          <path d=\"M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1M12.9 3.1l-1.1 1.1M4.2 11.8l-1.1 1.1M12.9 12.9l-1.1-1.1M4.2 4.2L3.1 3.1\"/>\n        </svg>\n      </button>\n\n      <!-- 复制本页链接 -->\n      <button class=\"sy-iconbtn\" type=\"button\" data-action=\"copy-link\" title=\"复制链接\" aria-label=\"复制链接\">\n        <svg viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\">\n          <path d=\"M6.5 9.5a2.8 2.8 0 0 0 4 0l2-2a2.83 2.83 0 0 0-4-4l-1 1\"/>\n          <path d=\"M9.5 6.5a2.8 2.8 0 0 0-4 0l-2 2a2.83 2.83 0 0 0 4 4l1-1\"/>\n        </svg>\n      </button>\n\n      <!-- 打印 / 另存 PDF -->\n      <button class=\"sy-iconbtn\" type=\"button\" data-action=\"print\" title=\"打印 / 另存为 PDF\" aria-label=\"打印\">\n        <svg viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\">\n          <path d=\"M4.5 6V2h7v4M4.5 12H3a1 1 0 0 1-1-1V7.5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1V11a1 1 0 0 1-1 1h-1.5\"/>\n          <path d=\"M4.5 9.5h7V14h-7z\"/>\n        </svg>\n      </button>\n    </div>\n  </div>\n</header>\n\n<!-- 窄屏目录遮罩 -->\n<div class=\"sy-scrim\" data-open=\"false\" aria-hidden=\"true\"></div>\n\n<!-- ========== 主体 ========== -->\n<!--\n  DOM 顺序为「正文 → 目录」：读屏与键盘 Tab 顺序应先走正文，目录作为辅助导航靠后。\n  视觉上目录仍在右侧——由 CSS .sy-main / .sy-toc 的 grid-column 显式指定列位实现，\n  不可依赖 Grid 的自动填充（自动填充会让 DOM 中靠前的目录抢占正文列）。\n-->\n<div class=\"sy-layout\">\n\n  <!-- 正文 -->\n  <main class=\"sy-main\" id=\"sy-main\" tabindex=\"0\" role=\"region\" aria-label=\"正文\">\n    <article class=\"sy-doc\">\n\n      <!-- 文档元信息条：分享页的信任锚点（不显示笔记本标签） -->\n      <header class=\"sy-doc-head\">\n        <h1>{{DOC_TITLE}}</h1>\n        <p class=\"sy-doc-head__meta\">\n          <span>更新于 {{UPDATED_AT}}</span>\n          <span class=\"sy-footer__sep\">·</span>\n          <span>约 {{READ_MINUTES}} 分钟读完</span>\n        </p>\n      </header>\n\n      <!--\n        正文内容注入点：\n        插件将 POST /api/export/exportHTML 返回的 data.content（正文 HTML 片段）\n        经过「类名归一化」后注入此处。归一化规则见规范文档 §7.2。\n        注意：data.content 不含 <html>/<head>/<style>/<script>，因此本模板必须自带全部样式。\n      -->\n      {{DOC_CONTENT}}\n\n    </article>\n\n    <!-- ========== 页脚 ========== -->\n    <footer class=\"sy-footer\" id=\"sy-footer\">\n      <div class=\"sy-footer__row\">\n        <div class=\"sy-footer__meta\">\n          <span>最后更新 {{UPDATED_AT}}</span>\n          <span class=\"sy-footer__sep\">·</span>\n          <span>{{WORD_COUNT}} 字</span>\n          <span class=\"sy-footer__sep\">·</span>\n          <span>{{FOOTER_BRAND}}</span>\n        </div>\n      </div>\n      <p style=\"margin:var(--sy-sp-4) 0 0\" id=\"sy-footer-note\">\n        {{FOOTER_NOTE}}\n      </p>\n    </footer>\n  </main>\n\n  <!-- 目录（≥1024px 常驻右侧，窄屏变为左侧抽屉） -->\n  <aside class=\"sy-toc\" id=\"sy-toc\" data-open=\"false\" aria-label=\"目录\">\n    <p class=\"sy-toc__title\">目录</p>\n    <ul class=\"sy-toc__list\">\n      {{TOC_ITEMS}}\n    </ul>\n  </aside>\n\n</div>\n\n<!-- ========== 脚本（可选；用于主题切换、复制、目录高亮、KaTeX 渲染） ========== -->\n<script>\n/* 主题：默认跟随系统；用户手动切换后写入 localStorage 并锁定 data-theme */\n(function () {\n  var KEY = 'siyuan-share-theme';\n  var saved = null;\n  try { saved = localStorage.getItem(KEY); } catch (e) {}\n  var root = document.documentElement;\n  if (saved === 'light' || saved === 'dark') root.setAttribute('data-theme', saved);\n  else root.removeAttribute('data-theme');\n\n  document.addEventListener('click', function (e) {\n    var btn = e.target.closest('[data-action=\"toggle-theme\"]');\n    if (!btn) return;\n    var cur = root.getAttribute('data-theme');\n    var next = cur === 'dark' ? 'light' : (cur === 'light' ? '' : 'dark');\n    if (next) { root.setAttribute('data-theme', next); } else { root.removeAttribute('data-theme'); }\n    try { if (next) localStorage.setItem(KEY, next); else localStorage.removeItem(KEY); } catch (e) {}\n  });\n})();\n\n/* 页眉滚动分隔线 */\n(function () {\n  var h = document.querySelector('.sy-header');\n  if (!h) return;\n  var onScroll = function () { h.setAttribute('data-scrolled', window.scrollY > 8 ? 'true' : 'false'); };\n  onScroll();\n  window.addEventListener('scroll', onScroll, { passive: true });\n})();\n\n/* 窄屏目录抽屉 */\n(function () {\n  var toc = document.getElementById('sy-toc');\n  var scrim = document.querySelector('.sy-scrim');\n  var toggle = document.querySelector('.sy-toc-toggle');\n  if (!toc || !toggle) return;\n  function setOpen(v) {\n    toc.setAttribute('data-open', String(v));\n    if (scrim) scrim.setAttribute('data-open', String(v));\n    toggle.setAttribute('aria-expanded', String(v));\n  }\n  toggle.addEventListener('click', function () { setOpen(toc.getAttribute('data-open') !== 'true'); });\n  if (scrim) scrim.addEventListener('click', function () { setOpen(false); });\n  toc.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });\n})();\n\n/* 复制链接 */\n(function () {\n  document.addEventListener('click', function (e) {\n    var btn = e.target.closest('[data-action=\"copy-link\"]');\n    if (!btn) return;\n    var url = location.href;\n    var done = function () {\n      btn.setAttribute('data-state', 'done');\n      btn.style.color = 'var(--sy-success-ink)';\n      setTimeout(function () { btn.removeAttribute('data-state'); btn.style.color = ''; }, 1400);\n    };\n    if (navigator.clipboard && navigator.clipboard.writeText) {\n      navigator.clipboard.writeText(url).then(done, function () {});\n    } else {\n      var ta = document.createElement('textarea');\n      ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';\n      document.body.appendChild(ta); ta.select();\n      try { document.execCommand('copy'); done(); } catch (e) {}\n      document.body.removeChild(ta);\n    }\n  });\n})();\n\n/* 打印 */\n(function () {\n  document.addEventListener('click', function (e) {\n    if (e.target.closest('[data-action=\"print\"]')) window.print();\n  });\n})();\n</script>\n\n\n{{BODY_SCRIPTS}}\n</body>\n</html>\n";

const DEFAULT_SETTINGS = {
  domain: "http://127.0.0.1:6806",
  pathPrefix: "public",
  slugStyle: "auto",
  slugPrefix: "",
  slugHash: "on",
  merge: false,
  toc: true,
  highlight: "shared",
  math: "shared",
  theme: "auto",
  showUpdated: true,
  imageMode: "folder",
  imageLazy: true,
  staticDir: "_static",
  autoCopyLink: true,
  autoOpenBrowser: false,
  notify: true,
  confirmOverwrite: true,
  singleFile: false,
  probeDir: "_probe",
  logLevel: "info",
  onboarded: false,
  password: "",
  linkFormat: "{domain}/{prefix}/{slug}/",
  footerBrand: "由思源笔记导出",
  footerNote: "本页面为静态快照，内容可能与源文档存在差异。",
  // v1.4 远程直传：把页面直接写到 VPS 上的思源（不再等 S3 同步）
  remotePublish: false,
  remoteBase: "",
  remoteToken: ""
};

const CLASS_REMAP = {
  "protyle-wysiwyg__block": "sy-doc__block",
  "protyle-action": "sy-task",
  "protyle-action--task": "sy-task__box",
  "protyle-action--task-checked": "sy-task__box--checked",
  "callout-title": "sy-callout__title",
  "callout-content": "sy-callout__content",
  "callout-icon": "sy-callout__icon",
  "callout-img": "sy-callout__img",
  "footnotes-defs-div": "sy-footnotes",
  "footnotes-defs-hr": "sy-footnotes__hr",
  "footnotes-defs-ol": "sy-footnotes__list",
  "vditor-footnotes__goto-ref": "sy-footnotes__ref"
};

const LANG_LABEL = {
  js: "JavaScript", javascript: "JavaScript", ts: "TypeScript", typescript: "TypeScript",
  jsx: "JSX", tsx: "TSX", py: "Python", python: "Python", sh: "Shell", bash: "Shell",
  shell: "Shell", json: "JSON", yaml: "YAML", yml: "YAML", html: "HTML", css: "CSS",
  scss: "SCSS", less: "Less", sql: "SQL", go: "Go", rust: "Rust", java: "Java",
  c: "C", cpp: "C++", csharp: "C#", php: "PHP", ruby: "Ruby", swift: "Swift",
  kotlin: "Kotlin", markdown: "Markdown", md: "Markdown", diff: "Diff", ini: "INI",
  toml: "TOML", xml: "XML", dockerfile: "Dockerfile", text: "Text"
};

const SVG_WRAP = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M2 4h12M2 8h8a2 2 0 0 1 0 4H8M2 12h4"/></svg>';
const SVG_COPY = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="9" rx="1.2"/><path d="M10.5 3.5h-7a1 1 0 0 0-1 1v7"/></svg>';
const SVG_SHARE = '<svg class="b3-menu__icon" width="16" height="16" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin-right:8px" aria-hidden="true"><path d="M2.2 6.4 13.8 2.2 9.6 13.8 7.2 8.9 2.2 6.4Z"/><path d="M7.2 8.9 13.8 2.2"/></svg>';
const SVG_INFO = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 7.2v4M8 4.8v.6"/></svg>';

// 图片加载失败时的自绘兜底：不要用浏览器默认裂图 + alt 文字堆叠
const IMG_ONERROR = "this.onerror=null;var n=this.getAttribute('data-name')||'';this.outerHTML='<div class=\"sy-img-fallback\"><svg viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.4\"><rect x=\"1.5\" y=\"2.5\" width=\"13\" height=\"11\" rx=\"1.5\"/><path d=\"M1.5 10l3.5-3.5 3 3 3-2.5 3.5 3\"/><circle cx=\"5.5\" cy=\"5.5\" r=\"1\"/></svg><span>图片暂不可用</span><span class=\"sy-img-fallback__name\">'+n+'</span></div>'";

const KATEX_CDN = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/";
const HIGHLIGHT_CDN = "https://cdn.jsdelivr.net/npm/highlight.js@11.10.0/lib/";

const STAGE_HIGHLIGHT = [
  "/stage/protyle/js/highlight.js/highlight.min.js",
  "/stage/protyle/js/highlight/highlight.min.js",
  "/stage/build/lib/highlight.js/highlight.min.js",
  "/stage/build/lib/highlight.min.js"
];
const STAGE_KATEX_CSS = [
  "/stage/protyle/js/katex/katex.min.css",
  "/stage/build/lib/katex/katex.min.css",
  "/stage/protyle/js/katex.css"
];
const STAGE_KATEX_JS = [
  "/stage/protyle/js/katex/katex.min.js",
  "/stage/build/lib/katex/katex.min.js",
  "/stage/protyle/js/katex.js"
];
const STAGE_MHCHEM = [
  "/stage/protyle/js/katex/mhchem.min.js",
  "/stage/build/lib/katex/mhchem.min.js"
];

// ---------------------------------------------------------------- 通用工具

function fmt(template) {
  const args = Array.prototype.slice.call(arguments, 1);
  return String(template || "").replace(/\{(\d+)\}/g, function (match, index) {
    return typeof args[index] === "undefined" ? "" : String(args[index]);
  });
}

function esc(value) {
  return String(value === null || typeof value === "undefined" ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function baseName(path) {
  return String(path || "").split("/").pop() || "file";
}

function mimeOf(name) {
  const ext = String(name).split(".").pop().toLowerCase();
  const map = {
    html: "text/html", css: "text/css", js: "application/javascript", json: "application/json",
    svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", webp: "image/webp", woff2: "font/woff2", woff: "font/woff",
    ttf: "font/ttf"
  };
  return map[ext] || "application/octet-stream";
}

function bytesToBase64(bytes) {
  let out = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(out);
}

function decodeUtf8(bytes) {
  try { return new TextDecoder("utf-8").decode(bytes); }
  catch (e) { return ""; }
}

// 纯 JS MD5，用于 docID 末段过短时的稳定短哈希兜底
function md5Hex(input) {
  const source = new TextEncoder().encode(String(input));
  const bitLength = source.length * 8;
  const total = (((source.length + 8) >> 6) + 1) * 64;
  const buffer = new Uint8Array(total);
  buffer.set(source);
  buffer[source.length] = 0x80;
  const view = new DataView(buffer.buffer);
  view.setUint32(total - 8, bitLength >>> 0, true);
  view.setUint32(total - 4, Math.floor(bitLength / 4294967296), true);
  const shift = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const k = new Uint32Array(64);
  for (let i = 0; i < 64; i++) k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
  const rotl = function (x, n) { return (x << n) | (x >>> (32 - n)); };
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let off = 0; off < total; off += 64) {
    const m = new Uint32Array(16);
    for (let i = 0; i < 16; i++) m[i] = view.getUint32(off + i * 4, true);
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      f = (f + a + k[i] + m[g]) >>> 0;
      a = d; d = c; c = b;
      b = (b + rotl(f, shift[Math.floor(i / 16) * 4 + (i % 4)])) >>> 0;
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
  }
  const hex = function (n) {
    let s = "";
    for (let i = 0; i < 4; i++) s += ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, "0");
    return s;
  };
  return hex(a0) + hex(b0) + hex(c0) + hex(d0);
}

function shortHash(docId) {
  const parts = String(docId || "").split("-");
  let tail = (parts.length > 1 ? parts[parts.length - 1] : parts[0] || "")
    .toLowerCase().replace(/[^a-z0-9]/g, "0");
  if (tail.length < 4) tail = md5Hex(docId || "").slice(0, 6);
  return tail;
}

function makeSlug(title, docId, settings) {
  let base = String(title || "")
    .normalize("NFKC").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  let prefix = String(settings.slugPrefix || "")
    .normalize("NFKC").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (settings.slugStyle === "short") base = "";
  if (prefix) base = base ? prefix + "-" + base : prefix;
  const hash = shortHash(docId);
  if (settings.slugHash !== "off") base = base ? base + "-" + hash : hash;
  if (!base) base = hash;
  base = base.slice(0, 64).replace(/-+$/g, "");
  if (!SLUG_RE.test(base) || base.length > 64) base = hash;
  return base;
}

function validateSlug(value) {
  const slug = String(value || "").trim();
  if (!slug) return "empty";
  if (/\s/.test(slug)) return "space";
  if (!/^[a-z0-9-]+$/.test(slug)) return "chars";
  if (!SLUG_RE.test(slug) || slug.length > 64) return "chars";
  return "ok";
}

function isKernelPath(value) {
  return /^\/assets\/|\/stage\/|\/appearance\//.test(String(value || ""));
}

// fetchPost 已处理鉴权与 AppID，这里只包装回调风格为 Promise
function postAPI(url, data, timeout) {
  return new Promise(function (resolve, reject) {
    let settled = false;
    const timer = setTimeout(function () {
      if (!settled) { settled = true; reject(new Error("请求超时: " + url)); }
    }, timeout || 60000);
    const done = function (ok, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ok ? resolve(value) : reject(new Error((value && value.msg) || "请求失败: " + url));
    };
    try {
      fetchPost(url, data, function (res) { done(true, res); }, undefined, function (res) { done(false, res); });
    } catch (error) {
      done(false, { msg: error && error.message });
    }
  });
}

// 二进制走原生 fetch：fetchPost 会把非 JSON 响应当文本处理，图片会损坏。
// 这里只带 AppID 标识，不手写 Authorization（会话鉴权由浏览器/宿主处理）。
async function getBytes(url, init) {
  const options = Object.assign({}, init || {});
  const headers = new Headers(options.headers || {});
  if (Constants && Constants.SIYUAN_APPID) headers.set("X-SiYuan-App-ID", Constants.SIYUAN_APPID);
  options.headers = headers;
  options.credentials = "same-origin";
  const response = await fetch(url, options);
  if (response.status === 202 || !response.ok) throw new Error("HTTP " + response.status + " " + url);
  const type = response.headers.get("content-type") || "";
  if (type.indexOf("application/json") > -1) {
    const json = await response.json();
    throw new Error(json.msg || "读取失败 " + url);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function putBytes(path, content, isDir) {
  const form = new FormData();
  form.append("path", path);
  form.append("isDir", isDir ? "true" : "false");
  form.append("modTime", String(Date.now()));
  if (!isDir) {
    const name = baseName(path);
    const blob = content instanceof Uint8Array
      ? new Blob([content], { type: mimeOf(name) })
      : new Blob([String(content)], { type: mimeOf(name) });
    form.append("file", blob, name);
  }
  const response = await postAPI("/api/file/putFile", form);
  if (!response || response.code !== 0) {
    throw new Error((response && response.msg) || "写入失败 " + path);
  }
  return response;
}

async function removePath(path) {
  const response = await postAPI("/api/file/removeFile", { path: path });
  if (!response || response.code !== 0) {
    throw new Error((response && response.msg) || "删除失败 " + path);
  }
  return response;
}

// ---------------------------------------------------------------- 远程直传（v1.4）
// 背景：默认发布只写本机 data/public，外网要等 S3 同步到 VPS 才生效。
// 当 VPS 端同步暂停时，新链接会一直 404。远程直传把页面直接写到 VPS 的思源内核，
// 绕过同步链路；页面 URL、密码、页脚都不变。

function remoteBaseOf(settings) {
  const base = String((settings && (settings.remoteBase || settings.domain)) || "").trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(base) ? base : "";
}

function remoteEnabled(settings) {
  return !!(settings && settings.remotePublish && remoteBaseOf(settings) && settings.remoteToken);
}

function remoteAuthHeaders(settings) {
  const headers = {};
  if (settings && settings.remoteToken) headers.Authorization = "Token " + settings.remoteToken;
  try {
    if (Constants && Constants.SIYUAN_APPID) headers["X-SiYuan-App-ID"] = Constants.SIYUAN_APPID;
  } catch (e) { /* 宿主常量不可用时忽略 */ }
  return headers;
}

async function remoteFetch(settings, path, options, timeout) {
  const base = remoteBaseOf(settings);
  if (!base) throw new Error(t("remote.noBase"));
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(function () { controller.abort(); }, timeout || REMOTE_TIMEOUT) : null;
  const opts = Object.assign({ method: "GET", credentials: "omit", cache: "no-store" }, options || {});
  opts.headers = Object.assign(remoteAuthHeaders(settings), opts.headers || {});
  if (controller) opts.signal = controller.signal;
  try {
    return await fetch(base + path, opts);
  } catch (error) {
    const reason = error && error.name === "AbortError" ? t("remote.timeout") : ((error && error.message) || "");
    throw new Error(t("remote.unreachable", base, reason));
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function remotePost(settings, apiPath, data, timeout) {
  const response = await remoteFetch(settings, apiPath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data || {})
  }, timeout);
  if (!response.ok) throw new Error("HTTP " + response.status + " " + apiPath);
  const json = await response.json();
  if (!json || json.code !== 0) throw new Error((json && json.msg) || ("远程接口失败: " + apiPath));
  return json;
}

async function remotePutBytes(settings, path, content, isDir) {
  const form = new FormData();
  form.append("path", path);
  form.append("isDir", isDir ? "true" : "false");
  form.append("modTime", String(Date.now()));
  if (!isDir) {
    const name = baseName(path);
    const blob = content instanceof Uint8Array
      ? new Blob([content], { type: mimeOf(name) })
      : new Blob([String(content)], { type: mimeOf(name) });
    form.append("file", blob, name);
  }
  const response = await remoteFetch(settings, "/api/file/putFile", { method: "POST", body: form }, REMOTE_TIMEOUT);
  if (!response.ok) throw new Error("HTTP " + response.status + " " + path);
  const json = await response.json();
  if (!json || json.code !== 0) throw new Error((json && json.msg) || ("远程写入失败 " + path));
  return json;
}

async function remoteRemovePath(settings, path) {
  try {
    return await remotePost(settings, "/api/file/removeFile", { path: path });
  } catch (error) {
    // 远端目录不存在时不算失败
    return { code: 0, skipped: true, msg: String((error && error.message) || "") };
  }
}

// 用 build stamp 校验外网真的已经是这一版：比只看 200 更可靠
async function remoteVerifyPage(pageUrl, stamp, timeout) {
  if (!pageUrl) return { ok: false, error: "empty url" };
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(function () { controller.abort(); }, timeout || 12000) : null;
  try {
    const sep = pageUrl.indexOf("?") >= 0 ? "&" : "?";
    const response = await fetch(pageUrl + sep + "v=" + encodeURIComponent(stamp || String(Date.now())), {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      signal: controller ? controller.signal : undefined
    });
    if (!response.ok) return { ok: false, status: response.status, error: "HTTP " + response.status };
    const text = await response.text();
    if (stamp && text.indexOf(stamp) < 0) {
      return { ok: false, status: response.status, stale: true, error: t("remote.stale") };
    }
    return { ok: true, status: response.status };
  } catch (error) {
    const reason = error && error.name === "AbortError" ? t("remote.timeout") : ((error && error.message) || t("remote.verifyFail"));
    return { ok: false, error: reason };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function remoteProbe(settings) {
  const json = await remotePost(settings, "/api/notebook/lsNotebooks", {});
  const notebooks = (json && json.data && json.data.notebooks) || [];
  return Array.isArray(notebooks) ? notebooks.length : 0;
}

function buildStamp() {
  const d = new Date();
  const pad = function (n) { return String(n).padStart(2, "0"); };
  return String(d.getUTCFullYear()) + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) +
    "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) +
    "-" + Math.random().toString(36).slice(2, 8);
}

async function listDir(path) {
  const response = await postAPI("/api/file/readDir", { path: path });
  if (!response || response.code !== 0) return [];
  return response.data || [];
}

async function readText(path) {
  return decodeUtf8(await getBytes("/api/file/getFile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: path })
  }));
}

// 用系统浏览器打开外链：这是「访客视角」的验真动作。
// 当前内核的 platformUtils 没有 openLink，优先 window.open，再退回内核的 openByMobile。
function openExternal(url) {
  try {
    const tab = window.open(url, "_blank", "noopener,noreferrer");
    if (tab) return;
  } catch (e) { /* 弹出窗口被拦截时继续尝试其他方式 */ }
  try {
    if (platformUtils && typeof platformUtils.openByMobile === "function") {
      platformUtils.openByMobile(url);
      return;
    }
  } catch (e) { /* 忽略 */ }
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } catch (e) { /* 忽略 */ }
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
  }
  return Promise.resolve(legacyCopy(text));
}

function legacyCopy(text) {
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  try { document.execCommand("copy"); } catch (e) { /* 剪贴板不可用时静默降级 */ }
  document.body.removeChild(area);
}

function formatDateTime(timestamp) {
  const d = new Date(Number(timestamp) || 0);
  const pad = function (n) { return String(n).padStart(2, "0"); };
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
    " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

function relativeTime(timestamp, t) {
  const diff = Math.max(0, Date.now() - Number(timestamp || 0));
  if (diff < 60000) return t("manage.justNow");
  if (diff < 3600000) return t("manage.minutesAgo", Math.floor(diff / 60000));
  if (diff < 86400000) return t("manage.hoursAgo", Math.floor(diff / 3600000));
  return t("manage.daysAgo", Math.floor(diff / 86400000));
}

// v1.1：管理面板里的保护状态徽标（密码 / 限时剩余 / 已过期）
function protectBadge(page, t) {
  const parts = [];
  if (page && page.paused) parts.push('<span class="ss-badge ss-badge--expired">' + esc(t("manage.badgePaused")) + "</span>");
  if (page && page.protected) parts.push('<span class="ss-badge ss-badge--lock">' + esc(t("manage.badgePassword")) + "</span>");
  return parts.join("");
}

// 全局文案入口：i18n 未命中时回退到内置中文键名表
let I18N_FALLBACK = {};
let tImpl = function (key) { return I18N_FALLBACK[key] || key; };
function t(key) {
  const args = Array.prototype.slice.call(arguments, 1);
  // 注意：必须把参数继续传给 fmt，否则 {0}/{1} 会被替换成空串（v1.3 出现的“已写入 张图片”空白文案）
  return fmt.apply(null, [tImpl.apply(null, [key].concat(args))].concat(args));
}

// ---------------------------------------------------------------- 静态页正文归一化

function makeIconButton(doc, action, label, svg) {
  const button = doc.createElement("button");
  button.className = "sy-code__btn";
  button.setAttribute("type", "button");
  button.setAttribute("data-action", action);
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
  button.innerHTML = svg;
  return button;
}

function wrapCodeBlocks(root, doc) {
  const blocks = Array.from(root.querySelectorAll("pre"));
  blocks.forEach(function (pre) {
    if (pre.parentElement && pre.parentElement.classList && pre.parentElement.classList.contains("sy-code")) return;
    const code = pre.querySelector("code");
    let lang = "";
    const detect = function (value) {
      const match = /(?:^|\s)language-([A-Za-z0-9_+#.-]+)/.exec(String(value || ""));
      return match ? match[1] : "";
    };
    lang = code ? detect(code.className) : "";
    if (!lang) lang = detect(pre.className);
    const text = code || pre;
    const lines = String(text.textContent || "").split("\n").length;
    const wrapper = doc.createElement("div");
    wrapper.className = "sy-code" + (lines > 40 ? " sy-code--long" : "");
    wrapper.setAttribute("data-lang", lang || "text");

    const head = doc.createElement("div");
    head.className = "sy-code__head";
    const label = doc.createElement("span");
    label.className = "sy-code__lang";
    const lower = String(lang || "text").toLowerCase();
    label.textContent = LANG_LABEL[lower] || String(lang || "text").toUpperCase();
    const tools = doc.createElement("div");
    tools.className = "sy-code__tools";
    tools.appendChild(makeIconButton(doc, "toggle-wrap", "切换自动换行", SVG_WRAP));
    tools.appendChild(makeIconButton(doc, "copy-code", "复制代码", SVG_COPY));
    head.appendChild(label);
    head.appendChild(tools);

    const body = doc.createElement("pre");
    body.className = "sy-code__body";
    let target = code;
    if (!target) {
      target = doc.createElement("code");
      target.textContent = pre.textContent;
    }
    body.appendChild(target);
    wrapper.appendChild(head);
    wrapper.appendChild(body);
    pre.parentNode.replaceChild(wrapper, pre);
  });
}

function convertCallouts(root, doc) {
  const candidates = Array.from(root.querySelectorAll("div[class*='callout'], [data-type='callout']"));
  candidates.forEach(function (el) {
    if (!el.classList || Array.from(el.classList).some(function (c) { return /^sy-callout/.test(c); })) return;
    let type = "info";
    Array.from(el.classList).forEach(function (cls) {
      const match = /^callout-(note|info|tip|success|warning|error)$/.exec(cls);
      if (match) type = match[1];
    });
    const attrType = el.getAttribute("data-callout-type") || el.getAttribute("data-subtype");
    if (attrType && /^(note|info|tip|success|warning|error)$/.test(attrType)) type = attrType;

    const children = Array.from(el.children);
    const titleEl = children.find(function (ch) { return ch.classList && ch.classList.contains("callout-title"); });
    const contentEl = children.find(function (ch) { return ch.classList && ch.classList.contains("callout-content"); });
    const iconEl = children.find(function (ch) { return ch.classList && ch.classList.contains("callout-icon"); });
    const body = doc.createElement("div");
    body.className = "sy-callout__body";

    const sourced = contentEl ? Array.from(contentEl.children) : children;
    sourced.forEach(function (child) {
      if (child === titleEl || child === contentEl) return;
      if (child.classList && child.classList.contains("callout-icon")) return;
      body.appendChild(child);
    });
    if (titleEl) {
      titleEl.classList.remove("callout-title");
      titleEl.classList.add("sy-callout__title");
      body.insertBefore(titleEl, body.firstChild);
    }

    let svg = iconEl ? iconEl.querySelector("svg") : null;
    if (!svg) {
      svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "sy-callout__icon");
      svg.setAttribute("viewBox", "0 0 16 16");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "1.4");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      svg.setAttribute("aria-hidden", "true");
      svg.innerHTML = "<circle cx=\"8\" cy=\"8\" r=\"6\"/><path d=\"M8 7.2v4M8 4.8v.6\"/>";
    } else {
      svg.classList.add("sy-callout__icon");
      svg.setAttribute("aria-hidden", "true");
      svg.removeAttribute("width");
      svg.removeAttribute("height");
    }

    el.innerHTML = "";
    el.appendChild(svg);
    el.appendChild(body);
    el.classList.add("sy-callout", "sy-callout--" + type);
  });
}

function wrapMath(root, doc) {
  const nodes = Array.from(root.querySelectorAll('[data-type="math-block"], [data-type="inline-math"], [data-subtype="math"]'));
  nodes.forEach(function (el) {
    if (el.closest(".sy-code")) return;
    const inline = el.getAttribute("data-type") === "inline-math" || el.classList.contains("sy-math--inline");
    const wrapper = doc.createElement(inline ? "span" : "div");
    wrapper.className = "sy-math" + (inline ? " sy-math--inline" : "");
    el.parentNode.insertBefore(wrapper, el);
    wrapper.appendChild(el);
    if (!String(el.textContent || "").trim()) {
      const raw = String(el.getAttribute("data-content") || "").replace(/^\$\$?|\$\$?$/g, "").trim();
      el.textContent = raw;
    }
  });
}

function wrapTables(root, doc) {
  Array.from(root.querySelectorAll("table")).forEach(function (table) {
    if (table.parentElement && table.parentElement.classList && table.parentElement.classList.contains("sy-table-wrap")) return;
    const wrapper = doc.createElement("div");
    wrapper.className = "sy-table-wrap";
    table.parentNode.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  });
}

// 全部类名重映射与路径清理都走 DOM 遍历；文本节点从不改写，<pre>/<code> 内的示例文本因此完好。
function sanitizeTree(root) {
  const nodes = [root].concat(Array.from(root.querySelectorAll("*")));
  nodes.forEach(function (el) {
    if (!el || !el.classList) return;
    // 思源编辑器专用节点：属性条、悬浮工具、列表/任务标记（任务勾选框保留，后面会重映射）
    if (el.classList.contains("protyle-attr") || el.classList.contains("protyle-icons")) { el.remove(); return; }
    if (el.classList.contains("protyle-action") && !el.classList.contains("protyle-action--task")) { el.remove(); return; }
    const isKernelUrl = function (value) { return /^\/assets\/|\/stage\/|\/appearance\//.test(String(value || "")); };
    Array.from(el.attributes || []).forEach(function (attr) {
      const value = attr.value || "";
      if (attr.name === "style") {
        if (/\/assets\/|\/stage\/|\/appearance\//.test(value)) el.removeAttribute(attr.name);
        return;
      }
      if (isKernelUrl(value)) {
        const fixed = value.replace(/^\/assets\//, "assets/");
        if (attr.name === "src" || attr.name === "srcset" || attr.name === "data-src" || attr.name === "poster") {
          if (/^\/(stage|appearance)\//.test(value)) el.removeAttribute(attr.name);
          else el.setAttribute(attr.name, fixed);
        } else if (attr.name === "href" || attr.name === "xlink:href") {
          el.setAttribute(attr.name, /^\/(stage|appearance)\//.test(value) ? "#" : fixed);
        } else {
          el.removeAttribute(attr.name);
        }
      }
    });

    // 代码块内部的 class 保持原样（language-* 由高亮器使用，示例文本也不受影响）
    if (el.closest("pre, code")) return;
    const next = [];
    Array.from(el.classList).forEach(function (cls) {
      if (cls.indexOf("sy-") === 0 || cls.indexOf("hljs-") === 0 ||
          cls.indexOf("language-") === 0 || cls.indexOf("katex") === 0 || cls === "svg") {
        next.push(cls);
        return;
      }
      if (CLASS_REMAP[cls]) { next.push(CLASS_REMAP[cls]); return; }
      // 其余内核交互痕迹直接丢弃，静态页不依赖思源任何内部类名
    });
    if (el.getAttribute("data-type") === "tag" && next.indexOf("sy-badge") < 0) next.push("sy-badge");
    if (next.length) el.setAttribute("class", next.join(" "));
    else el.removeAttribute("class");
  });
}

// 思源导出的正文是 div 结构（NodeHeading / NodeParagraph / NodeBlockquote / NodeList）。
// 静态页需要真实语义标签，否则标题没有样式、目录抓不到、列表会变成一段段带大间距的 div。
function convertSemanticBlocks(root, doc) {
  Array.from(root.querySelectorAll("[data-type='NodeHeading']")).forEach(function (el) {
    const sub = String(el.getAttribute("data-subtype") || "").toLowerCase();
    const cls = Array.from(el.classList).find(function (c) { return /^h[1-6]$/.test(c); });
    const level = /^h[1-6]$/.test(sub) ? sub : (cls || "h2");
    const n = Number(level.charAt(1)) || 2;
    const h = doc.createElement("h" + n);
    const content = el.querySelector("[contenteditable='false']") || el;
    h.innerHTML = content.innerHTML;
    el.parentNode.replaceChild(h, el);
  });

  Array.from(root.querySelectorAll("[data-type='NodeParagraph']")).forEach(function (el) {
    const p = doc.createElement("p");
    const content = el.querySelector("[contenteditable='false']") || el;
    p.innerHTML = content.innerHTML;
    el.parentNode.replaceChild(p, el);
  });

  Array.from(root.querySelectorAll("[data-type='NodeBlockquote']")).forEach(function (el) {
    const bq = doc.createElement("blockquote");
    Array.from(el.childNodes).forEach(function (node) { bq.appendChild(node); });
    el.parentNode.replaceChild(bq, el);
  });

  // 从最深层开始，嵌套列表先转成 ul/ol
  Array.from(root.querySelectorAll("[data-type='NodeList']")).reverse().forEach(function (list) {
    const ordered = String(list.getAttribute("data-subtype") || "") === "o";
    const ul = doc.createElement(ordered ? "ol" : "ul");
    Array.from(list.children).forEach(function (item) {
      if (item.getAttribute("data-type") !== "NodeListItem") return;
      const li = doc.createElement("li");
      Array.from(item.childNodes).forEach(function (child) {
        if (child.nodeType !== 1) return;
        if (child.classList && (child.classList.contains("protyle-action") || child.classList.contains("protyle-attr"))) return;
        if (child.tagName === "P") {
          while (child.firstChild) li.appendChild(child.firstChild);
          return;
        }
        li.appendChild(child);
      });
      ul.appendChild(li);
    });
    list.parentNode.replaceChild(ul, list);
  });
}

// 思源把「独立图片」导出成段落里的行内 img 时，浏览器会按行盒排版，导致图片上方出现大片留白。
// 这里把「只包含图片」的段落提升为 figure 块，图片按块级排版。
function extractImageBlocks(root, doc) {
  Array.from(root.querySelectorAll("p, div[data-type='NodeParagraph']")).forEach(function (para) {
    if (!para || !para.parentNode) return;
    const imgs = Array.from(para.querySelectorAll("img"));
    if (!imgs.length) return;
    const text = String(para.textContent || "").replace(/[\u200b\s]/g, "");
    if (text) return;
    const figure = doc.createElement("figure");
    figure.className = "sy-figure";
    imgs.forEach(function (img) {
      img.removeAttribute("data-src");
      figure.appendChild(img);
      const alt = img.getAttribute("alt");
      if (alt) {
        const cap = doc.createElement("figcaption");
        cap.className = "sy-figure__cap";
        cap.textContent = alt;
        figure.appendChild(cap);
      }
    });
    para.parentNode.insertBefore(figure, para);
    para.parentNode.removeChild(para);
  });
}

function prepareImages(root, settings) {
  const images = new Set();
  Array.from(root.querySelectorAll("img")).forEach(function (img) {
    const src = img.getAttribute("src") || "";
    if (!src) return;
    if (src.indexOf("assets/") === 0) {
      const name = decodeURIComponent(src.slice(7).split(/[?#]/)[0]);
      if (name && ASSET_NAME_RE.test(name)) images.add(name);
      img.setAttribute("data-name", name || baseName(src));
    } else if (/^data:/.test(src)) {
      img.setAttribute("data-name", "内嵌图片");
    } else if (/^https?:\/\//.test(src)) {
      img.setAttribute("data-name", baseName(src));
    }
    img.setAttribute("decoding", "async");
    img.setAttribute("loading", settings.imageLazy ? "lazy" : "eager");
    img.setAttribute("onerror", IMG_ONERROR);
  });
  return images;
}

function buildToc(root, doc, settings) {
  if (!settings.toc) return [];
  return Array.from(root.querySelectorAll("h1, h2, h3")).map(function (heading, index) {
    const id = "sy-h-" + (index + 1);
    heading.id = id;
    heading.setAttribute("tabindex", "-1");
    return {
      id: id,
      level: Number(heading.tagName.substring(1)),
      text: String(heading.textContent || "").trim() || "未命名标题"
    };
  });
}

function markTasks(root) {
  Array.from(root.querySelectorAll(".sy-task__box")).forEach(function (el) {
    if (el.tagName === "INPUT") {
      el.setAttribute("disabled", "disabled");
      el.setAttribute("aria-disabled", "true");
    } else {
      el.setAttribute("role", "checkbox");
      el.setAttribute("aria-disabled", "true");
      el.setAttribute("tabindex", "-1");
    }
    const checked = el.classList.contains("sy-task__box--checked") || el.getAttribute("checked") === "checked";
    el.setAttribute("aria-checked", checked ? "true" : "false");
  });
}

function normalizeContent(content, settings) {
  const parser = new DOMParser();
  const source = "<!doctype html><html><body><div id=\"ss-root\">" + String(content || "") + "</div></body></html>";
  const parsed = parser.parseFromString(source, "text/html");
  const root = parsed.getElementById("ss-root");
  if (!root) return { html: "", images: [], toc: [], words: 0 };

  wrapCodeBlocks(root, parsed);
  convertCallouts(root, parsed);
  wrapMath(root, parsed);
  wrapTables(root, parsed);
  sanitizeTree(root);
  convertSemanticBlocks(root, parsed);
  extractImageBlocks(root, parsed);
  const images = prepareImages(root, settings);
  const toc = buildToc(root, parsed, settings);
  markTasks(root);

  return {
    root: root,
    html: root.innerHTML,
    images: Array.from(images),
    toc: toc,
    words: String(root.textContent || "").replace(/\s+/g, "").length
  };
}

// 正文里的第一个标题块若与文档标题完全相同，就是重复标题：页头已经显示过一次
function stripDuplicateTitle(normalized, title) {
  const root = normalized && normalized.root;
  const target = String(title || "").replace(/\s+/g, " ").trim();
  if (!root || !target) return false;
  const first = root.firstElementChild;
  if (!first) return false;
  const subtype = String(first.getAttribute("data-subtype") || "").toLowerCase();
  const type = String(first.getAttribute("data-type") || "");
  const isHeading = first.tagName === "H1" || first.tagName === "H2" ||
    subtype === "h1" || subtype === "h2" || type === "NodeHeading";
  if (!isHeading) return false;
  const text = String(first.textContent || "").replace(/\s+/g, " ").trim();
  if (!text || text !== target) return false;
  first.parentNode.removeChild(first);
  return true;
}

// ---------------------------------------------------------------- 共享资源

async function fetchFirstAvailable(paths) {
  for (let i = 0; i < paths.length; i++) {
    try {
      const bytes = await getBytes(paths[i], { method: "GET" });
      if (bytes && bytes.length > 128) return { bytes: bytes, path: paths[i] };
    } catch (e) { /* 继续尝试下一个候选路径 */ }
  }
  return null;
}

function fontUrlsFromCss(css) {
  const names = [];
  const re = /url\(\s*['"]?(fonts\/[A-Za-z0-9._-]+\.woff2?)['"]?\s*\)/g;
  let match;
  while ((match = re.exec(css)) !== null) {
    if (names.indexOf(match[1]) < 0) names.push(match[1]);
  }
  return names;
}

// 首次发布时把高亮与公式资源写到 public/_static/，后续页面只写自己的正文和图片
async function ensureSharedAssets(settings) {
  const root = "/data/public/" + settings.staticDir;
  const result = {
    ready: false, root: root, katex: false, highlight: false,
    katexCssBytes: null, katexJsBytes: null, mhchemBytes: null, highlightBytes: null, fonts: {}
  };
  try {
    const entries = await listDir(root);
    if (entries.some(function (item) { return item.name === "manifest.json"; })) {
      const manifest = JSON.parse(await readText(root + "/manifest.json"));
      if (manifest && manifest.version === PLUGIN_VERSION) {
        result.ready = result.katex = result.highlight = true;
        try {
          result.katexCssBytes = await getBytes(root + "/katex/katex.min.css", { method: "GET" });
          result.katexJsBytes = await getBytes(root + "/katex/katex.min.js", { method: "GET" });
          result.mhchemBytes = await getBytes(root + "/katex/mhchem.min.js", { method: "GET" });
          result.highlightBytes = await getBytes(root + "/highlight/highlight.min.js", { method: "GET" });
        } catch (e) { /* 单文件模式所需字节读取失败时按无资源降级 */ }
        result.mhchemKnown = !!result.mhchemBytes;
        return result;
      }
    }
  } catch (e) { /* 目录不存在时继续发布资源 */ }

  const katexCss = await fetchFirstAvailable(STAGE_KATEX_CSS);
  const katexJs = await fetchFirstAvailable(STAGE_KATEX_JS);
  const mhchem = await fetchFirstAvailable(STAGE_MHCHEM);
  const highlight = await fetchFirstAvailable(STAGE_HIGHLIGHT);

  result.katexCssBytes = katexCss ? katexCss.bytes : null;
  result.katexJsBytes = katexJs ? katexJs.bytes : null;
  result.mhchemBytes = mhchem ? mhchem.bytes : null;
  result.mhchemKnown = !!mhchem;
  result.highlightBytes = highlight ? highlight.bytes : null;

  try {
    await putBytes(root, "", true);
    if (katexCss) {
      await putBytes(root + "/katex", "", true);
      await putBytes(root + "/katex/katex.min.css", katexCss.bytes, false);
      const cssText = decodeUtf8(katexCss.bytes);
      const fonts = fontUrlsFromCss(cssText);
      for (const font of fonts) {
        const found = await fetchFirstAvailable([
          "/stage/protyle/js/katex/" + font,
          "/stage/build/lib/katex/" + font
        ]);
        if (found) {
          result.fonts[font] = found.bytes;
          await putBytes(root + "/katex/" + font, found.bytes, false);
        }
      }
      result.katex = true;
    }
    if (katexJs) { await putBytes(root + "/katex/katex.min.js", katexJs.bytes, false); result.katex = true; }
    if (mhchem) await putBytes(root + "/katex/mhchem.min.js", mhchem.bytes, false);
    if (highlight) {
      await putBytes(root + "/highlight", "", true);
      await putBytes(root + "/highlight/highlight.min.js", highlight.bytes, false);
      result.highlight = true;
    }
    await putBytes(root + "/manifest.json", JSON.stringify({
      version: PLUGIN_VERSION,
      katex: result.katex,
      highlight: result.highlight,
      createdAt: Date.now()
    }, null, 2), false);
    result.ready = true;
  } catch (error) {
    result.error = error && error.message ? error.message : String(error);
  }
  return result;
}

function inlineKatexCss(assets) {
  let css = decodeUtf8(assets.katexCssBytes || new Uint8Array(0));
  Object.keys(assets.fonts || {}).forEach(function (path) {
    const dataUri = "data:font/woff2;base64," + bytesToBase64(assets.fonts[path]);
    css = css.split(path).join(dataUri);
  });
  return css;
}

function pageResources(settings, assets, pageUrl, gate, slug) {
  let head = "";
  let scripts = "";
  const single = !!settings.singleFile;
  const useKatex = settings.math !== "off";
  const useHighlight = settings.highlight !== "off";

  if (useKatex && settings.math === "cdn" && !single) {
    head += '<link rel="stylesheet" href="' + KATEX_CDN + 'katex.min.css">\n';
    scripts += '<script defer src="' + KATEX_CDN + 'katex.min.js"><\/script>\n';
    scripts += '<script defer src="' + KATEX_CDN + 'contrib/mhchem.min.js"><\/script>\n';
  } else if (useKatex && single && assets.katexCssBytes && assets.katexJsBytes) {
    head += "<style>\n" + inlineKatexCss(assets) + "\n</style>\n";
    scripts += "<script>\n" + decodeUtf8(assets.katexJsBytes) + "\n<\/script>\n";
    if (assets.mhchemBytes) scripts += "<script>\n" + decodeUtf8(assets.mhchemBytes) + "\n<\/script>\n";
  } else if (useKatex && !single) {
    head += '<link rel="stylesheet" href="../' + esc(settings.staticDir) + '/katex/katex.min.css">\n';
    scripts += '<script defer src="../' + esc(settings.staticDir) + '/katex/katex.min.js"><\/script>\n';
    if (assets.mhchemKnown !== false) {
      scripts += '<script defer src="../' + esc(settings.staticDir) + '/katex/mhchem.min.js"><\/script>\n';
    }
  }

  if (useHighlight && settings.highlight === "cdn" && !single) {
    scripts += '<script defer src="' + HIGHLIGHT_CDN + 'common.min.js"><\/script>\n';
    scripts += '<script defer src="' + HIGHLIGHT_CDN + 'languages/typescript.min.js"><\/script>\n';
    scripts += '<script defer src="' + HIGHLIGHT_CDN + 'languages/javascript.min.js"><\/script>\n';
    scripts += '<script defer src="' + HIGHLIGHT_CDN + 'languages/python.min.js"><\/script>\n';
    scripts += '<script defer src="' + HIGHLIGHT_CDN + 'languages/bash.min.js"><\/script>\n';
    scripts += '<script defer src="' + HIGHLIGHT_CDN + 'languages/json.min.js"><\/script>\n';
  } else if (useHighlight && single && assets.highlightBytes) {
    scripts += "<script>\n" + decodeUtf8(assets.highlightBytes) + "\n<\/script>\n";
  } else if (useHighlight && !single) {
    scripts += '<script defer src="../' + esc(settings.staticDir) + '/highlight/highlight.min.js"><\/script>\n';
  }

  scripts += "<script>\n" + pageRuntimeScript(useKatex, useHighlight, pageUrl, gate, slug) + "\n<\/script>\n";
  return { head: head, scripts: scripts };
}

// v1.1 轻量保护：同步哈希（插件侧与静态页侧算法一致）。
// 仅用于避免密码明文出现在 HTML 中，不能防暴力破解——前端校验本质可绕过。
function gateHash(pin, salt) {
  const input = String(salt || "") + "|" + String(pin || "");
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

function randomSalt() {
  try {
    const bytes = new Uint8Array(4);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (b) { return b.toString(36); }).join("");
  } catch (e) {
    return String(Date.now()).slice(-6) + Math.floor(Math.random() * 1e6).toString(36);
  }
}

// 计算某篇文档的 gate 配置（v1.3：仅密码保护，限时分享已移除）。无有效密码时返回 null。
function makeGate(settings, doc) {
  // 注意：doc.password 为空字符串时不能遮蔽 settings.password（v1.2 取值 bug 修复）
  const docPin = doc && typeof doc.password === "string" && doc.password ? doc.password : "";
  const pin = docPin || settings.password;
  const validPin = /^\d{4}$/.test(String(pin || "")) ? String(pin) : "";
  if (!validPin) return null;
  const passSalt = randomSalt();
  return { passHash: gateHash(validPin, passSalt), passSalt: passSalt };
}

// 生成注入静态页的轻量校验脚本字符串（作为字符串数组元素，供 pageRuntimeScript 拼接）
function gateScriptLines(gate, slug) {
  if (!gate) return [];
  const lines = [];
  lines.push("    var gate = " + JSON.stringify(gate) + ";");
  lines.push("    var gateSlug = " + JSON.stringify(String(slug || "")) + ";");
  lines.push("    window.__syGatePassed = false;");
  lines.push("    function gateHashLocal(pin, salt) { var input = String(salt||'')+'|'+String(pin||''); var h=5381; for (var i=0;i<input.length;i++){ h=(((h<<5)+h+input.charCodeAt(i))>>>0); } return h.toString(36); }");
  // 密码判定：把正文先移入 template，显示单输入框遮罩
  lines.push("    if (gate.passHash) {");
  lines.push("      var passKey = 'ss_pass_' + gateSlug;");
  lines.push("      var unlocked = false;");
  lines.push("      try { unlocked = sessionStorage.getItem(passKey) === gate.passHash; } catch(e) {}");
  lines.push("      var gated = document.getElementById('sy-gated-content');");
  lines.push("      var article = document.getElementById('sy-article') || document.querySelector('.sy-doc');");
  lines.push("      function unlock() {");
  lines.push("        if (gated && article) { while (gated.content.firstChild) { var n = gated.content.firstChild; gated.content.removeChild(n); if (n.tagName === 'TEMPLATE') { while (n.content.firstChild) article.appendChild(n.content.firstChild); } else article.appendChild(n); } gated.parentNode && gated.parentNode.removeChild(gated); }");
  lines.push("        var mask = document.querySelector('.sy-gate'); if (mask && mask.parentNode) mask.parentNode.removeChild(mask);");
  lines.push("        document.body.classList.remove('sy-locked');");
  lines.push("        window.__syGatePassed = true;");
  lines.push("        if (window.__syRenderContent) window.__syRenderContent();");
  lines.push("      }");
  lines.push("      if (unlocked) { unlock(); } else {");
  lines.push("        document.body.classList.add('sy-locked');");
  lines.push("        var mask = document.createElement('div');");
  lines.push("        mask.className = 'sy-gate';");
  lines.push("        mask.setAttribute('role','dialog');");
  lines.push("        mask.setAttribute('aria-modal','true');");
  lines.push("        mask.setAttribute('aria-labelledby','sy-gate-title');");
  lines.push("        mask.innerHTML = '<div class=\"sy-gate__card\"><p class=\"sy-gate__kicker\">Protected Article</p><h1 class=\"sy-gate__title\" id=\"sy-gate-title\">这是一篇受保护的分享</h1><p class=\"sy-gate__desc\">请输入发布者提供的 4 位数字密码，继续阅读本文。</p><div class=\"sy-gate__fields\"><input class=\"sy-gate__input\" type=\"text\" inputmode=\"numeric\" maxlength=\"4\" pattern=\"[0-9]*\" autocomplete=\"off\" aria-label=\"4 位数字访问密码\" placeholder=\"····\"></div><p class=\"sy-gate__error\" role=\"alert\" aria-live=\"assertive\"></p><button class=\"sy-gate__submit\" type=\"button\">解锁阅读</button></div>';");
  lines.push("        document.body.appendChild(mask);");
  lines.push("        var input = mask.querySelector('.sy-gate__input');");
  lines.push("        var errBox = mask.querySelector('.sy-gate__error');");
  lines.push("        var submit = mask.querySelector('.sy-gate__submit');");
  lines.push("        var tryUnlock = function () {");
  lines.push("          var pin = input.value.replace(/\\D/g,'').slice(0,4);");
  lines.push("          input.value = pin;");
  lines.push("          if (pin.length !== 4) { errBox.textContent = '请输入 4 位数字密码'; return; }");
  lines.push("          if (gateHashLocal(pin, gate.passSalt) === gate.passHash) { try { sessionStorage.setItem(passKey, gate.passHash); } catch(e) {} unlock(); }");
  lines.push("          else { errBox.textContent = '密码错误，请重试'; input.value=''; input.focus(); }");
  lines.push("        };");
  lines.push("        input.addEventListener('input', function(){ input.value = input.value.replace(/\\D/g,'').slice(0,4); errBox.textContent=''; });");
  lines.push("        input.addEventListener('keydown', function(e){ if (e.key === 'Enter') tryUnlock(); });");
  lines.push("        submit.addEventListener('click', tryUnlock);");
  lines.push("        var focusTimer = setTimeout(function(){ input.focus(); }, 60);");
  lines.push("        return;");
  lines.push("      }");
  lines.push("    }");
  lines.push("    if (!gate.passHash) { window.__syGatePassed = true; }");
  return lines;
}

function pageRuntimeScript(useKatex, useHighlight, pageUrl, gate, slug) {
  const gateLines = gateScriptLines(gate, slug);
  return [
    "(function () {",
    "  function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }",
    "  ready(function () {",
    "    var renderDone = false;",
    "    window.__syRenderContent = function () {",
    "      if (renderDone) return; renderDone = true;",
    "    var tocLinks = Array.prototype.slice.call(document.querySelectorAll('.sy-toc__link'));",
    "    if ('IntersectionObserver' in window && tocLinks.length) {",
    "      var sections = tocLinks.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); }).filter(Boolean);",
    "      var observer = new IntersectionObserver(function (entries) {",
    "        entries.forEach(function (entry) {",
    "          if (!entry.isIntersecting) return;",
    "          tocLinks.forEach(function (a) {",
    "            if (a.getAttribute('href') === '#' + entry.target.id) a.setAttribute('aria-current', 'true');",
    "            else a.removeAttribute('aria-current');",
    "          });",
    "        });",
    "      }, { rootMargin: '-80px 0px -70% 0px' });",
    "      sections.forEach(function (section) { observer.observe(section); });",
    "    }",
    "    document.addEventListener('click', function (e) {",
    "      var btn = e.target.closest('[data-action=\"copy-code\"]');",
    "      if (btn) {",
    "        var code = btn.closest('.sy-code').querySelector('code');",
    "        var done = function () { btn.setAttribute('data-state', 'done'); setTimeout(function () { btn.removeAttribute('data-state'); }, 1400); };",
    "        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code.textContent).then(done, function () {});",
    "        else { var ta = document.createElement('textarea'); ta.value = code.textContent; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (err) {} document.body.removeChild(ta); }",
    "        return;",
    "      }",
    "      var wrapBtn = e.target.closest('[data-action=\"toggle-wrap\"]');",
    "      if (wrapBtn) { var box = wrapBtn.closest('.sy-code'); box.classList.toggle('sy-code--wrap'); wrapBtn.setAttribute('aria-pressed', box.classList.contains('sy-code--wrap') ? 'true' : 'false'); }",
    "    });",
    useHighlight
      ? "    if (window.hljs) { document.querySelectorAll('.sy-code__body code').forEach(function (block) { try { window.hljs.highlightElement(block); } catch (err) {} }); }"
      : "",
    useKatex
      ? "    if (window.katex) { document.querySelectorAll('[data-type=\"math-block\"], [data-type=\"inline-math\"], [data-subtype=\"math\"]').forEach(function (el) { try { window.katex.render(el.getAttribute('data-content') || el.textContent || '', el, { displayMode: el.getAttribute('data-type') !== 'inline-math', throwOnError: false }); } catch (err) {} }); }"
      : "",
    "    if (location.protocol === 'file:') { document.documentElement.setAttribute('data-offline', 'true'); }",
    "    };",
    "    window.__syGate = " + (gate ? "true" : "false") + ";"
  ].concat(gateLines).concat([
    "    if (!window.__syGate || window.__syGatePassed) { window.__syRenderContent(); }",
    "  });",
    "})();"
  ]).filter(Boolean).join("\n");
}

// ---------------------------------------------------------------- 二维码生成（离线、零依赖）
// QR Code Model 2，字节模式，纠错级别 M。仅用于把分享链接渲染成可扫码图形。
const QR_ECC_PER_BLOCK_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
const QR_NUM_BLOCKS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];

function qrUtf8Bytes(text) {
  if (typeof TextEncoder !== "undefined") return Array.from(new TextEncoder().encode(String(text)));
  const s = unescape(encodeURIComponent(String(text)));
  const out = [];
  for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xFF);
  return out;
}

function qrRawModules(ver) {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

function qrDataCodewords(ver) {
  return Math.floor(qrRawModules(ver) / 8) - QR_ECC_PER_BLOCK_M[ver] * QR_NUM_BLOCKS_M[ver];
}

function qrMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11D);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function qrDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = qrMul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = qrMul(root, 0x02);
  }
  return result;
}

function qrRemainder(data, divisor) {
  const result = new Array(divisor.length).fill(0);
  for (let k = 0; k < data.length; k++) {
    const factor = (data[k] ^ result[0]) & 0xFF;
    result.shift();
    result.push(0);
    for (let i = 0; i < result.length; i++) result[i] ^= qrMul(divisor[i], factor);
  }
  return result;
}

function qrChooseVersion(byteLength) {
  for (let ver = 1; ver <= 40; ver++) {
    const countBits = ver <= 9 ? 8 : 16;
    const needBits = 4 + countBits + byteLength * 8;
    if (needBits <= qrDataCodewords(ver) * 8) return ver;
  }
  return -1;
}

// 返回 {size, modules:boolean[][]}，供渲染与测试共用
function qrMatrix(text) {
  const data = qrUtf8Bytes(text);
  const ver = qrChooseVersion(data.length);
  if (ver < 0) throw new Error("QR 内容过长");
  const countBits = ver <= 9 ? 8 : 16;
  const bits = [];
  let bitLen = 0;
  function appendBits(value, length) {
    for (let i = length - 1; i >= 0; i--) {
      bits.push((value >>> i) & 1);
      bitLen++;
    }
  }
  appendBits(0b0100, 4);
  appendBits(data.length, countBits);
  for (let i = 0; i < data.length; i++) appendBits(data[i], 8);
  const capacity = qrDataCodewords(ver) * 8;
  appendBits(0, Math.min(4, capacity - bitLen));
  appendBits(0, (8 - (bitLen % 8)) % 8);
  for (let pad = 0xEC; bitLen < capacity; pad ^= 0xEC ^ 0x11) appendBits(pad, 8);
  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    codewords.push(b);
  }

  const numBlocks = QR_NUM_BLOCKS_M[ver];
  const eccLen = QR_ECC_PER_BLOCK_M[ver];
  const rawCodewords = Math.floor(qrRawModules(ver) / 8);
  const dataTotal = rawCodewords - eccLen * numBlocks;
  const blocksInGroup2 = rawCodewords % numBlocks;
  const blocksInGroup1 = numBlocks - blocksInGroup2;
  const dataGroup1 = Math.floor(dataTotal / numBlocks);
  const dataGroup2 = dataGroup1 + 1;
  const divisor = qrDivisor(eccLen);
  const blocks = [];
  let k = 0;
  let maxDataLen = 0;
  for (let i = 0; i < numBlocks; i++) {
    const len = i < blocksInGroup1 ? dataGroup1 : dataGroup2;
    const part = codewords.slice(k, k + len);
    k += len;
    if (len > maxDataLen) maxDataLen = len;
    blocks.push({ data: part, ecc: qrRemainder(part, divisor) });
  }
  // 交织：先按列放所有数据码字，再按列放所有纠错码字（两段独立循环）
  const all = [];
  for (let i = 0; i < maxDataLen; i++) {
    for (let j = 0; j < numBlocks; j++) {
      if (i < blocks[j].data.length) all.push(blocks[j].data[i]);
    }
  }
  for (let i = 0; i < eccLen; i++) {
    for (let j = 0; j < numBlocks; j++) all.push(blocks[j].ecc[i]);
  }

  const size = ver * 4 + 17;
  const modules = [];
  const isFunction = [];
  for (let y = 0; y < size; y++) {
    modules.push(new Array(size).fill(false));
    isFunction.push(new Array(size).fill(false));
  }
  function setFn(x, y, dark) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    modules[y][x] = dark;
    isFunction[y][x] = true;
  }
  function getBit(x, i) { return ((x >>> i) & 1) !== 0; }
  for (let i = 0; i < size; i++) {
    setFn(6, i, i % 2 === 0);
    setFn(i, 6, i % 2 === 0);
  }
  function finder(cx, cy) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        setFn(cx + dx, cy + dy, dist !== 2 && dist !== 4);
      }
    }
  }
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  const numAlign = Math.floor(ver / 7) + 2;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4 + numAlign * 2 + 1) / (numAlign * 2 - 2)) * 2;
  const alignPos = [];
  for (let i = 0, pos = 6; i < numAlign; i++) {
    alignPos.push(pos);
    pos = i === 0 ? size - 7 : pos - step;
  }
  for (let i = 0; i < numAlign; i++) {
    for (let j = 0; j < numAlign; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === numAlign - 1) || (i === numAlign - 1 && j === 0)) continue;
      const ax = alignPos[i], ay = alignPos[j];
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) setFn(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    const versionBits = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = getBit(versionBits, i);
      const a = size - 11 + (i % 3), b = Math.floor(i / 3);
      setFn(a, b, bit);
      setFn(b, a, bit);
    }
  }
  function formatBits(mask) {
    const d = mask;
    let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((d << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) setFn(8, i, getBit(bits, i));
    setFn(8, 7, getBit(bits, 6));
    setFn(8, 8, getBit(bits, 7));
    setFn(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++) setFn(14 - i, 8, getBit(bits, i));
    for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, getBit(bits, i));
    setFn(8, size - 8, true);
  }
  // 先放置一次格式信息：把格式区与固定黑点标记为功能位，避免数据位写入这些格子。
  // 掩码循环里会用最终 mask 重画格式位的值（此处仅用于占位/isFunction 标记）。
  formatBits(0);
  let idx = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && idx < all.length * 8) {
          modules[y][x] = getBit(all[idx >>> 3], 7 - (idx & 7));
          idx++;
        }
      }
    }
  }
  function applyMask(mask) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (isFunction[y][x]) continue;
        let inv = false;
        switch (mask) {
          case 0: inv = (x + y) % 2 === 0; break;
          case 1: inv = y % 2 === 0; break;
          case 2: inv = x % 3 === 0; break;
          case 3: inv = (x + y) % 3 === 0; break;
          case 4: inv = (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0; break;
          case 5: inv = (x * y) % 2 + (x * y) % 3 === 0; break;
          case 6: inv = ((x * y) % 2 + (x * y) % 3) % 2 === 0; break;
          case 7: inv = ((x + y) % 2 + (x * y) % 3) % 2 === 0; break;
        }
        if (inv) modules[y][x] = !modules[y][x];
      }
    }
  }
  function penalty() {
    let score = 0;
    for (let y = 0; y < size; y++) {
      let run = 1;
      for (let x = 1; x < size; x++) {
        if (modules[y][x] === modules[y][x - 1]) run++;
        else { if (run >= 5) score += 3 + (run - 5); run = 1; }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
    for (let x = 0; x < size; x++) {
      let run = 1;
      for (let y = 1; y < size; y++) {
        if (modules[y][x] === modules[y - 1][x]) run++;
        else { if (run >= 5) score += 3 + (run - 5); run = 1; }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = modules[y][x];
        if (modules[y][x + 1] === c && modules[y + 1][x] === c && modules[y + 1][x + 1] === c) score += 3;
      }
    }
    const p1 = [true, false, true, true, true, false, true, false, false, false, false];
    const p2 = [false, false, false, false, true, false, true, true, true, false, true];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x <= size - 11; x++) {
        let a = true, b = true;
        for (let i = 0; i < 11; i++) {
          if (modules[y][x + i] !== p1[i]) a = false;
          if (modules[y][x + i] !== p2[i]) b = false;
        }
        if (a) score += 40;
        if (b) score += 40;
      }
    }
    for (let x = 0; x < size; x++) {
      for (let y = 0; y <= size - 11; y++) {
        let a = true, b = true;
        for (let i = 0; i < 11; i++) {
          if (modules[y + i][x] !== p1[i]) a = false;
          if (modules[y + i][x] !== p2[i]) b = false;
        }
        if (a) score += 40;
        if (b) score += 40;
      }
    }
    let dark = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (modules[y][x]) dark++;
    const total = size * size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    score += k * 10;
    return score;
  }
  let bestMask = 0;
  let bestPenalty = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(mask);
    formatBits(mask);
    const p = penalty();
    if (p < bestPenalty) { bestPenalty = p; bestMask = mask; }
    applyMask(mask);
  }
  applyMask(bestMask);
  formatBits(bestMask);
  return { size: size, modules: modules };
}

// 生成二维码 SVG 字符串（白底黑块，含 4 格静区）
function qrSvg(text, scale) {
  const qr = qrMatrix(text);
  const border = 4;
  const dim = qr.size + border * 2;
  const px = dim * (scale || 4);
  let rects = "";
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.modules[y][x]) rects += '<rect x="' + (x + border) + '" y="' + (y + border) + '" width="1" height="1"/>';
    }
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + " " + dim + '" width="' + px + '" height="' + px +
    '" shape-rendering="crispEdges" role="img" aria-label="分享链接二维码"><rect width="' + dim + '" height="' + dim +
    '" fill="#FFFFFF"/><g fill="#0E0E0F">' + rects + "</g></svg>";
}

// 根据设置生成分享 URL（地址格式模板）
function formatPageUrl(settings, slug) {
  const domain = String((settings && settings.domain) || "").replace(/\/+$/, "");
  const prefix = String((settings && settings.pathPrefix) || "public").replace(/^\/+|\/+$/g, "") || "public";
  const tpl = String((settings && settings.linkFormat) || "{domain}/{prefix}/{slug}/");
  let url = tpl.replace(/\{domain\}/g, domain)
    .replace(/\{prefix\}/g, prefix)
    .replace(/\{slug\}/g, String(slug || ""));
  if (url.charAt(url.length - 1) !== "/") url += "/";
  return url;
}

function renderPage(options) {
  let html = PAGE_SKELETON;
  // v1.1：受密码保护时正文放入 <template>（不进 DOM、读屏器不读），解锁后由脚本搬入 .sy-doc
  const bodyContent = options.gated
    ? '<template id="sy-gated-content">' + options.content + "</template>"
    : options.content;
  const replacements = [
    ["{{DOC_TITLE}}", esc(options.title)],
    ["{{SITE_NAME}}", "轻态分享"],
    ["{{DOC_SUMMARY}}", esc(options.summary)],
    ["{{DOC_AUTHOR}}", esc(options.author)],
    ["{{PAGE_URL}}", esc(options.pageUrl)],
    ["{{NOTEBOOK_NAME}}", esc(options.notebook)],
    ["{{AUTHOR}}", esc(options.author)],
    ["{{UPDATED_AT}}", esc(options.updatedAt)],
    ["{{READ_MINUTES}}", String(Math.max(1, Math.ceil(options.words / 400)))],
    ["{{WORD_COUNT}}", String(options.words)],
    ["{{TOC_ITEMS}}", options.tocHtml],
    ["{{HEAD_RESOURCES}}", options.head],
    ["{{BODY_SCRIPTS}}", options.scripts],
    ["{{DOC_CONTENT}}", bodyContent],
    ["{{FOOTER_BRAND}}", esc(options.footerBrand || "")],
    ["{{FOOTER_NOTE}}", esc(options.footerNote || "")],
    ["{{BUILD_STAMP}}", esc(options.buildStamp || "")]
  ];
  replacements.forEach(function (pair) {
    // 使用函数式替换，避免正文里的 $& / $' 被当成替换模式
    html = html.split(pair[0]).join(pair[1]);
  });
  html = html.replace(/data-theme="auto"/, 'data-theme="' + esc(options.theme) + '"');
  return html;
}

function tocHtml(items) {
  if (!items.length) return "";
  return items.map(function (item) {
    return '<li><a class="sy-toc__link" href="#' + esc(item.id) + '" style="--sy-toc-indent:' +
      Math.max(0, item.level - 1) + '">' + esc(item.text) + "</a></li>";
  }).join("\n");
}

// ---------------------------------------------------------------- 插件主体

class StaticSharePlugin extends Plugin {
  constructor(options) {
    super(options);
    this.settings = Object.assign({}, DEFAULT_SETTINGS);
    this.state = { version: 1, pages: {}, slugs: {} };
    this.sharedAssets = null;
    this.toast = null;
    this.cancelled = false;
    this.lastTrigger = null;
    this.logs = [];
    this.onDocTreeMenu = this.onDocTreeMenu.bind(this);
    I18N_FALLBACK = this.i18n || {};
    tImpl = (function (self) {
      return function (key) {
        const value = self.i18n && self.i18n[key];
        if (typeof value === "string") return value;
        if (typeof I18N_FALLBACK[key] === "string") return I18N_FALLBACK[key];
        return key;
      };
    })(this);
  }

  async onload() {
    try {
      const saved = await this.loadData("settings");
      if (saved && typeof saved === "object") this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    } catch (e) { /* 首次安装尚无配置文件 */ }
    try {
      const state = await this.loadData("state");
      if (state && typeof state === "object") {
        this.state = Object.assign({ version: 1, pages: {}, slugs: {} }, state);
        this.state.pages = this.state.pages || {};
        this.state.slugs = this.state.slugs || {};
      }
    } catch (e) { /* 首次安装尚无发布清单 */ }
  }

  async onLayoutReady() {
    const self = this;
    this.addTopBar({
      id: "staticShare",
      icon: "iconShare",
      title: t("topbar.title"),
      position: "right",
      callback: function () { self.publishFromToolbar(); },
      contextMenu: function (menu) { self.buildTopbarMenu(menu); }
    });
    this.eventBus.on("open-menu-doctree", this.onDocTreeMenu);
    // v1.1：不再自动弹出引导窗口。引导改为在设置面板内手动触发。
  }

  onunload() {
    this.eventBus.off("open-menu-doctree", this.onDocTreeMenu);
    if (this.progressGuard) { clearTimeout(this.progressGuard); this.progressGuard = null; }
    if (this.toast && this.toast.parentNode) this.toast.parentNode.removeChild(this.toast);
    this.toast = null;
  }

  log(message) {
    this.logs.push(new Date().toISOString() + " " + message);
    if (this.logs.length > 200) this.logs.shift();
    if (this.settings.logLevel === "debug") console.debug("[static-share]", message);
  }

  async saveSettings() {
    await this.saveData("settings", this.settings);
  }

  async saveState() {
    await this.saveData("state", this.state);
  }

  // ------------------------------------------------------------ 入口与菜单

  onDocTreeMenu(event) {
    const detail = event.detail || {};
    const docs = this.docsFromDetail(detail);
    if (!docs.length) return;
    const menu = detail.menu;
    if (!menu || typeof menu.addItem !== "function") return;
    const self = this;
    const label = docs.length === 1
      ? t("menu.exportOne")
      : t("menu.exportMany", docs.length);
    menu.addItem({
      iconHTML: SVG_SHARE,
      label: label,
      click: function () { self.publishTargets(docs); }
    });
  }

  docsFromDetail(detail) {
    const type = detail.type || "";
    const items = Array.prototype.slice.call(detail.items || []);
    let docs;
    if (type === "doc" || type === "docs") docs = items;
    else if (type === "notebook" || type === "notebooks") docs = [];
    else {
      // 混合选中：文档项带 childrenSortMode 键或 .sy 路径；笔记本项没有
      docs = items.filter(function (item) {
        return item && (
          Object.prototype.hasOwnProperty.call(item, "childrenSortMode") ||
          (typeof item.path === "string" && /\.sy$/i.test(item.path)) ||
          (typeof item.id === "string" && item.id !== item.notebookId)
        );
      });
    }
    return docs.filter(function (item) { return item && item.id; }).map(function (item) {
      return { id: item.id, notebookId: item.notebookId || "", name: item.name || "" };
    });
  }

  buildTopbarMenu(menu) {
    if (!menu || typeof menu.addItem !== "function") return;
    const self = this;
    const current = this.currentDoc();
    menu.addItem({
      iconHTML: SVG_SHARE,
      label: t("menu.currentDoc"),
      disabled: !current,
      click: function () { if (current) self.publishTargets([current]); }
    });
    menu.addItem({ type: "separator" });
    menu.addItem({
      label: t("menu.manage"),
      click: function () { self.showManager(); }
    });
    menu.addItem({
      label: t("menu.verify"),
      click: function () { self.verifyAllLinks(); }
    });
    menu.addItem({
      label: t("menu.settings"),
      click: function () { self.showSettings(); }
    });
  }

  currentDoc() {
    let editor = null;
    try { editor = getActiveEditor && getActiveEditor(); } catch (e) { /* 无活动编辑器 */ }
    if (!editor) {
      try {
        const all = getAllEditor && getAllEditor() || [];
        editor = all.find(function (item) { return item && item.protyle && item.protyle.block && item.protyle.block.rootID; });
      } catch (e) { /* 忽略 */ }
    }
    const protyle = editor && editor.protyle;
    const rootID = protyle && protyle.block && protyle.block.rootID;
    if (!rootID) return null;
    let name = "";
    try {
      const title = protyle.title && protyle.title.element;
      name = title ? String(title.textContent || "").trim() : "";
    } catch (e) { /* 标题元素尚未就绪 */ }
    return { id: rootID, notebookId: (protyle.block && protyle.block.boxID) || "", name: name };
  }

  publishFromToolbar() {
    const current = this.currentDoc();
    if (!current) {
      showMessage(t("noDoc"), 6000, "info");
      this.log("顶栏触发但未找到当前文档");
      return;
    }
    this.publishTargets([current]);
  }


  // ------------------------------------------------------------ 发布主链路

  async publishTargets(docs) {
    const self = this;
    this.cancelled = false;
    this.progressStart = Date.now();
    this.lastTrigger = document.activeElement;
    this.showProgress(t("progress.prepare"));
    const results = [];
    for (let i = 0; i < docs.length; i++) {
      if (this.cancelled) break;
      try {
        const result = await this.publishOne(docs[i], i);
        results.push(result);
      } catch (error) {
        this.log("发布失败 " + (docs[i] && docs[i].id) + ": " + (error && error.message));
        results.push({ ok: false, doc: docs[i], error: error });
      }
    }
    if (this.cancelled) {
      const writtenImages = results.reduce(function (sum, item) {
        return sum + (item && item.writtenImages ? item.writtenImages : 0);
      }, 0);
      this.showCancelled(writtenImages);
      return;
    }
    // 成功/失败都要先撤掉进度浮层，否则它会一直停在页面上（v1.3 的“提示关不掉”）
    this.closeToast();
    if (this.progressGuard) { clearTimeout(this.progressGuard); this.progressGuard = null; }
    if (docs.length === 1) {
      const first = results[0];
      if (first && first.ok) this.showSharePanel(first);
      else this.showSingleResult(first);
    } else {
      this.showBatchResult(results, docs);
    }
    if (this.lastTrigger && this.lastTrigger.focus) {
      try { this.lastTrigger.focus(); } catch (e) { /* 焦点已失效 */ }
    }
  }

  async publishOne(doc, index, opts) {
    const self = this;
    const settings = this.settings;
    const quiet = !!(opts && opts.quiet); // 静默模式：后台恢复/页脚批量应用时不弹进度、不复制、不通知
    const docId = doc.id;
    const existingSlug = this.state.slugs[docId];

    if (!quiet && existingSlug && settings.confirmOverwrite && this.state.pages[existingSlug]) {
      const decision = await this.askOverwrite(existingSlug, this.state.pages[existingSlug]);
      if (!decision || decision.value === "cancel") return { ok: false, doc: doc, cancelled: true };
      if (decision.value === "version") doc.newVersion = decision.newVersion;
    }

    if (!quiet) this.updateProgress(t("progress.exporting"));
    const response = await postAPI("/api/export/exportHTML", {
      id: docId,
      pdf: false,
      merge: !!settings.merge,
      keepFold: false,
      savePath: ""
    }, 120000);
    if (!response || response.code !== 0) {
      throw new Error((response && response.msg) || t("error.exportUnknown"));
    }
    const data = response.data || {};
    if (this.cancelled) throw new Error("cancelled");
    if (!String(data.content || "").replace(/<[^>]*>/g, "").trim()) {
      throw new Error(t("error.empty"));
    }

    const title = doc.name || data.name || "未命名文档";
    let slug;
    if (doc.newVersion) {
      slug = doc.newVersion;
    } else if (existingSlug) {
      slug = existingSlug;
    } else {
      slug = this.uniqueSlug(makeSlug(title, docId, settings), docId);
    }
    doc.modelSlug = slug;

    const normalized = normalizeContent(data.content, settings);
    if (!normalized.html.trim()) throw new Error(t("error.empty"));
    // 正文第一个块经常就是与页头相同的 H1（用户把标题又写成了一级标题），会与页头标题重复
    let dedupedTitle = false;
    while (stripDuplicateTitle(normalized, title)) dedupedTitle = true;
    if (dedupedTitle) {
      normalized.html = normalized.root.innerHTML;
      normalized.toc = (normalized.toc || []).filter(function (item) {
        return !(item.level === 1 && String(item.text || "").trim() === String(title || "").trim());
      });
    }

    if (!this.sharedAssets) {
      this.sharedAssets = await ensureSharedAssets(settings);
      if (this.sharedAssets.error) this.log("共享资源写入失败: " + this.sharedAssets.error);
    }

    const pageDir = "/data/public/" + slug;
    const remote = remoteEnabled(settings);
    const remoteErrors = [];
    const previous = this.state.pages[slug];
    if (previous && previous.docId === docId) {
      // 覆盖前删除旧 assets，避免已经从正文删掉的图片继续对外可见
      try { await removePath(pageDir + "/assets"); } catch (e) { this.log("旧 assets 清理失败: " + e.message); }
      if (remote) await remoteRemovePath(settings, pageDir + "/assets");
    }
    await putBytes(pageDir, "", true);
    if (remote) {
      try { await remotePutBytes(settings, pageDir, "", true); }
      catch (error) { remoteErrors.push((error && error.message) || String(error)); }
    }

    let missing = 0;
    let written = 0;
    const total = normalized.images.length;
    const inlineSources = {};
    if (!quiet && total > 3) this.updateProgress(t("progress.images", 0, total));
    for (const name of normalized.images) {
      if (this.cancelled) throw new Error("cancelled");
      try {
        const bytes = await getBytes("/api/file/getFile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: "/temp/export/" + data.folder + "/assets/" + name })
        });
        if (settings.imageMode === "inline") {
          // 单文件模式：只在 img 节点上改成 data URI，绝不对 HTML 字符串做全局替换，
          // 否则代码示例里出现的 assets/xxx.png 字样也会被误改。
          inlineSources[name] = "data:" + mimeOf(name) + ";base64," + bytesToBase64(bytes);
        } else {
          await putBytes(pageDir + "/assets/" + name, bytes, false);
          if (remote) {
            try { await remotePutBytes(settings, pageDir + "/assets/" + name, bytes, false); }
            catch (error) { remoteErrors.push(name + ": " + ((error && error.message) || error)); }
          }
        }
        written++;
      } catch (error) {
        missing++;
        this.log("图片落地失败 " + name + ": " + (error && error.message));
      }
      if (!quiet && total) this.updateProgress(t("progress.images", written + missing, total));
    }
    if (Object.keys(inlineSources).length) {
      Array.prototype.forEach.call(normalized.root.querySelectorAll("img"), function (img) {
        const src = img.getAttribute("src") || "";
        if (src.indexOf("assets/") !== 0) return;
        const name = decodeURIComponent(src.slice(7).split(/[?#]/)[0]);
        if (inlineSources[name]) {
          img.setAttribute("src", inlineSources[name]);
          img.removeAttribute("data-src");
        }
      });
      normalized.html = normalized.root.innerHTML;
    }
    if (this.cancelled) throw new Error("cancelled");

    if (!quiet) this.updateProgress(t("progress.writing"));
    const pageUrl = formatPageUrl(settings, slug);
    const stamp = buildStamp();
    // v1.3：仅密码保护。重新发布同一文档时，若本次没有显式新密码，
    // 沿用该 slug 已保存的密码哈希，避免覆盖后保护丢失（用户反馈的密码失效根因之一）。
    let gate = makeGate(settings, doc);
    if (!(gate && gate.passHash)) {
      const prev = this.state.pages[slug];
      if (prev && prev.passHash && prev.passSalt) gate = { passHash: prev.passHash, passSalt: prev.passSalt };
    }
    const resources = pageResources(settings, this.sharedAssets, pageUrl, gate, slug);
    const notebook = this.notebookName(doc.notebookId);
    const html = renderPage({
      title: title,
      summary: String(normalized.html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").slice(0, 150),
      author: "",
      pageUrl: pageUrl,
      notebook: notebook,
      updatedAt: new Date().toISOString().slice(0, 10),
      words: normalized.words,
      tocHtml: tocHtml(normalized.toc),
      head: resources.head,
      scripts: resources.scripts,
      content: normalized.html,
      gated: !!(gate && gate.passHash),
      theme: settings.theme === "auto" ? "auto" : settings.theme,
      footerBrand: settings.footerBrand,
      footerNote: settings.footerNote,
      buildStamp: stamp
    });

    try {
      await putBytes(pageDir + "/index.html", html, false);
    } catch (error) {
      throw new Error(t("error.disk") + " " + (error && error.message ? error.message : ""));
    }

    // 远程直传：先传图片，最后传 index.html，再回读校验，确保外网真的是这一版
    let remoteState = null;
    if (remote) {
      try {
        if (remoteErrors.length) throw new Error(remoteErrors[0]);
        await remotePutBytes(settings, pageDir + "/index.html", html, false);
        const verify = await remoteVerifyPage(pageUrl, stamp);
        remoteState = verify.ok
          ? { ok: true, status: verify.status, at: Date.now() }
          : { ok: false, status: verify.status || 0, stale: !!verify.stale, error: verify.error || t("remote.verifyFail"), at: Date.now() };
      } catch (error) {
        remoteState = { ok: false, error: (error && error.message) || String(error), at: Date.now() };
      }
      if (!remoteState.ok) this.log("远程直传失败: " + remoteState.error);
    }

    this.state.pages[slug] = {
      docId: docId,
      docName: title,
      publishedAt: previous && previous.publishedAt ? previous.publishedAt : Date.now(),
      updatedAt: Date.now(),
      images: written,
      missingImages: missing,
      bytes: html.length,
      reachable: null,
      url: pageUrl,
      protected: !!(gate && gate.passHash),
      passHash: gate && gate.passHash ? gate.passHash : "",
      passSalt: gate && gate.passSalt ? gate.passSalt : "",
      remote: remoteState ? !!remoteState.ok : null,
      remoteError: remoteState && !remoteState.ok ? remoteState.error : "",
      remoteAt: remoteState ? remoteState.at : 0,
      paused: false // 重新发布会解除暂停
    };
    this.state.slugs[docId] = slug;
    await this.saveState();

    if (quiet) {
      return {
        ok: true, doc: doc, slug: slug, url: pageUrl, title: title,
        missing: missing, writtenImages: written, html: html, remote: remoteState
      };
    }
    if (settings.autoCopyLink) {
      try { await copyText(pageUrl); } catch (e) { /* 剪贴板不可用时用户仍可手动复制 */ }
    }
    if (settings.autoOpenBrowser) openExternal(pageUrl);
    if (settings.notify && showMessage) {
      try { showMessage(t("result.title") + " · " + slug, 3000); } catch (e) { /* 忽略通知失败 */ }
    }

    return {
      ok: true, doc: doc, slug: slug, url: pageUrl, title: title,
      missing: missing, writtenImages: written, html: html, remote: remoteState,
      renderArgs: {
        title: title,
        summary: String(normalized.html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").slice(0, 150),
        notebook: notebook,
        updatedAt: new Date().toISOString().slice(0, 10),
        words: normalized.words,
        tocHtml: tocHtml(normalized.toc),
        content: normalized.html,
        pageUrl: pageUrl,
        theme: settings.theme === "auto" ? "auto" : settings.theme,
        footerBrand: settings.footerBrand,
        footerNote: settings.footerNote,
        buildStamp: stamp,
        slug: slug,
        pageDir: pageDir
      }
    };
  }

  uniqueSlug(base, docId) {
    const self = this;
    const owner = this.state.slugs[docId];
    if (owner && this.state.pages[owner]) return owner;
    if (!this.state.pages[base]) return base;
    let n = 2;
    while (self.state.pages[base + "-" + n]) n++;
    return base + "-" + n;
  }

  notebookName(notebookId) {
    try {
      const notebooks = (window.siyuan && window.siyuan.notebooks) || [];
      const found = notebooks.find(function (item) { return item.id === notebookId; });
      return found ? found.name : "";
    } catch (e) { return ""; }
  }

  // ------------------------------------------------------------ 浮层与弹窗

  ensureToast() {
    if (this.toast && this.toast.parentNode) return this.toast;
    const toast = document.createElement("div");
    toast.className = "ss-toast ss-plugin";
    toast.setAttribute("role", "status");
    toast.innerHTML = '<div class="ss-live" aria-live="polite"></div><div class="ss-toast__body"></div>';
    document.body.appendChild(toast);
    this.toast = toast;
    return toast;
  }

  setToast(state, titleHtml, bodyHtml) {
    const toast = this.ensureToast();
    toast.setAttribute("data-state", state);
    toast.querySelector(".ss-toast__body").innerHTML = bodyHtml;
    const live = toast.querySelector(".ss-live");
    live.textContent = String(titleHtml || "").replace(/<[^>]*>/g, "");
  }

  closeToast() {
    if (this.toast && this.toast.parentNode) this.toast.parentNode.removeChild(this.toast);
    this.toast = null;
  }

  showProgress(message) {
    this.cancelled = false;
    this.progressStart = Date.now();
    this.setToast("running", message,
      '<div class="ss-toast__head"><span class="ss-spinner" aria-hidden="true"></span>' +
      '<span class="ss-toast__title">' + esc(message) + '</span>' +
      '<button class="ss-toast__close" type="button" data-ss-action="cancel" aria-label="' + esc(t("action.cancel")) + '">×</button></div>' +
      '<p class="ss-toast__note">' + esc(t("progress.long")) + '</p>');
    const toast = this.toast;
    const button = toast.querySelector('[data-ss-action="cancel"]');
    if (button) button.onclick = () => {
      // 取消是协作式的，但浮层必须立刻可关闭，且不能被后续进度文案覆盖
      if (this.cancelled) { this.closeToast(); return; }
      this.cancelled = true;
      this.showCancelled(0);
    };
    // 兜底：内核请求卡死时，也不允许进度浮层永久停留
    if (this.progressGuard) clearTimeout(this.progressGuard);
    this.progressGuard = setTimeout(() => {
      if (!this.toast || this.toast.getAttribute("data-state") !== "running") return;
      this.showFailure(new Error(t("error.timeout")));
    }, PROGRESS_HARD_TIMEOUT);
  }

  updateProgress(message) {
    if (!this.toast || this.cancelled) return;
    if (this.toast.getAttribute("data-state") !== "running") return;
    const elapsed = Date.now() - (this.progressStart || (this.progressStart = Date.now()));
    let text = message;
    if (elapsed > 30000) text = t("progress.veryLong") + " · " + message;
    else if (elapsed > 10000) text = t("progress.long") + " · " + message;
    const title = this.toast.querySelector(".ss-toast__title");
    if (title) title.textContent = text;
  }

  showCancelled(count) {
    const written = Math.max(0, Number(count) || 0);
    const title = t("progress.cancelled", written);
    this.setToast("partial", title,
      '<div class="ss-toast__head"><span class="ss-toast__title">' + esc(title) + '</span>' +
      '<button class="ss-toast__close" type="button" data-ss-action="close" aria-label="' + esc(t("action.close")) + '">×</button></div>' +
      '<p class="ss-toast__note">' + esc(t("progress.cancelledNote")) + '</p>' +
      '<div class="ss-toast__actions"><button class="ss-btn" type="button" data-ss-action="close">' + esc(t("action.close")) + "</button></div>");
    this.bindClose();
  }

  // 统一分享面板：上半分享链接 + 二维码，下半分享权限（v1.3：仅密码，限时分享已移除）
  showSharePanel(result) {
    if (!result || !result.ok) return;
    const self = this;
    const slug = result.slug;
    const url = result.url || this.pageUrlFor(slug);
    const page = this.state.pages[slug] || {};

    const hasPassword = !!page.protected;

    const content =
      '<div class="ss-share">' +
      // ---- 上半：分享链接 + 二维码 ----
      '<div class="ss-share__top">' +
      '<div class="ss-share__left">' +
      '<div class="ss-share__label">' + esc(t("share.linkLabel")) + "</div>" +
      '<div class="ss-share__linkrow">' +
      '<input class="ss-input ss-share__url" type="text" readonly value="' + esc(url) + '">' +
      '<button class="ss-btn ss-btn--primary" type="button" data-ss-share="copy">' + esc(t("share.copy")) + "</button>" +
      "</div>" +
      '<div class="ss-share__linkacts">' +
      '<button class="ss-btn" type="button" data-ss-share="open">' + esc(t("share.openBrowser")) + "</button>" +
      '<button class="ss-btn" type="button" data-ss-share="preview">' + esc(t("result.openPreview")) + "</button>" +
      "</div>" +
      '<p class="ss-help">' + esc(t("notice.public")) + "</p>" +
      (result.missing ? '<p class="ss-help">' + esc(t("result.partial", result.missing)) + "</p>" : "") +
      (page.remote === true ? '<p class="ss-help">✓ ' + esc(t("share.remoteOk")) + "</p>" : "") +
      (page.remote === false ? '<p class="ss-warn">' + esc(t("share.remoteFail", page.remoteError || "")) + "</p>" : "") +
      "</div>" +
      '<div class="ss-share__qr"><div class="ss-share__qrbox" data-ss-share="qr" title="' + esc(t("share.qrHint")) + '">' + qrSvg(url, 5) + "</div>" +
      '<p class="ss-help">' + esc(t("share.qrHint")) + "</p></div>" +
      "</div>" +
      // ---- 下半：分享权限 ----
      '<div class="ss-share__bottom">' +
      '<h3 class="ss-group">' + esc(t("share.permTitle")) + "</h3>" +
      '<fieldset class="ss-fs"><legend>' + esc(t("protect.passLegend")) + "</legend>" +
      '<div class="ss-field"><label class="ss-label">' + esc(t("protect.password")) + '</label><div class="ss-control"><input class="ss-input" type="text" inputmode="numeric" maxlength="4" pattern="[0-9]*" id="ss-share-password" autocomplete="off" placeholder="····"' + (hasPassword ? ' value="••••"' : "") + "></div></div>" +
      '<p class="ss-help">' + esc(t("share.passwordKeepHint")) + "</p></fieldset>" +
      '<p class="ss-warn">' + esc(t("protect.disclaimer")) + "</p>" +
      "</div>" +
      '<div class="ss-actions">' +
      '<button class="ss-btn" type="button" data-ss-share="cancel">' + esc(t("action.close")) + "</button>" +
      '<button class="ss-btn ss-btn--primary" type="button" data-ss-share="apply">' + esc(t("share.apply")) + "</button>" +
      "</div></div>";

    const dialog = this.openDialog(t("share.title"), content, "min(620px, calc(100vw - 32px))");
    const el = dialog.element;
    const passInput = el.querySelector("#ss-share-password");

    if (passInput) passInput.oninput = function () { passInput.value = passInput.value.replace(/\D/g, "").slice(0, 4); };

    Array.prototype.forEach.call(el.querySelectorAll("[data-ss-share]"), function (btn) {
      btn.onclick = function () {
        const a = btn.getAttribute("data-ss-share");
        if (a === "copy") {
          copyText(url).then(function () { self.setButtonDone(btn, t("result.copied")); });
        } else if (a === "open") {
          openExternal(url);
        } else if (a === "preview") {
          self.showPreview(url, result.title);
        } else if (a === "qr") {
          self.showQrDialog(url);
        } else if (a === "cancel") {
          dialog.destroy();
        } else if (a === "apply") {
          const pinRaw = passInput ? passInput.value : "";
          const pin = pinRaw === "••••" ? "__KEEP__" : pinRaw.replace(/\D/g, "").slice(0, 4);
          if (pin !== "__KEEP__" && pin && !/^\d{4}$/.test(pin)) {
            showMessage(t("protect.passwordInvalid"), 4000, "error");
            return;
          }
          self.applyShareProtection(result, { password: pin }).then(function (ok) {
            if (ok) { dialog.destroy(); showMessage(t("share.applied"), 3000); }
          });
        }
      };
    });
  }

  // 就地重渲染：用缓存的正文 + 新密码状态重新生成页面，链接（slug）保持不变
  async applyShareProtection(result, overrides) {
    try {
      const args = result.renderArgs;
      if (!args) { showMessage(t("error.exportUnknown"), 4000, "error"); return false; }
      const settings = this.settings;
      const baseDoc = { id: (result.doc && result.doc.id) || "", name: result.title };
      const merged = Object.assign({}, baseDoc, overrides);
      if (overrides.password === "__KEEP__") {
        const page = this.state.pages[result.slug] || {};
        // 只有确实保存过哈希才视为“保留原密码”；否则清除，避免凭空生成新密码
        merged.password = (page.protected && page.passHash && page.passSalt) ? "0000" : "";
      }
      let gate = makeGate(settings, merged);
      // 保留原密码：用旧的 passHash/salt，避免掩码导致密码被换成新值。
      // 即使合并后 gate 为 null，也要重建 gate 以保留密码。
      if (overrides.password === "__KEEP__") {
        const old = this.state.pages[result.slug] || {};
        if (old.passHash && old.passSalt) {
          if (!gate) gate = { passHash: "", passSalt: "" };
          gate.passHash = old.passHash;
          gate.passSalt = old.passSalt;
        }
      }
      const gated = !!(gate && gate.passHash);
      const resources = pageResources(settings, this.sharedAssets, args.pageUrl, gate, result.slug);
      const stamp = buildStamp();
      // 注意：template 包裹由 renderPage 根据 gated 标志完成，这里传原始正文，避免双重包裹
      const html = renderPage({
        title: args.title, summary: args.summary, author: "", pageUrl: args.pageUrl,
        notebook: args.notebook, updatedAt: args.updatedAt, words: args.words,
        tocHtml: args.tocHtml, head: resources.head, scripts: resources.scripts,
        content: args.content,
        gated: gated, theme: args.theme, footerBrand: args.footerBrand, footerNote: args.footerNote,
        buildStamp: stamp
      });
      await putBytes(args.pageDir + "/index.html", html, false);
      let remoteState = null;
      if (remoteEnabled(settings)) {
        try {
          await remotePutBytes(settings, args.pageDir + "/index.html", html, false);
          const verify = await remoteVerifyPage(args.pageUrl, stamp);
          remoteState = verify.ok
            ? { ok: true, status: verify.status, at: Date.now() }
            : { ok: false, stale: !!verify.stale, error: verify.error || t("remote.verifyFail"), at: Date.now() };
        } catch (error) {
          remoteState = { ok: false, error: (error && error.message) || String(error), at: Date.now() };
        }
        if (!remoteState.ok) this.log("远程直传（权限）失败: " + remoteState.error);
      }
      const page = this.state.pages[result.slug];
      if (page) {
        page.protected = gated;
        page.bytes = html.length;
        page.updatedAt = Date.now();
        if (remoteState) {
          page.remote = !!remoteState.ok;
          page.remoteError = remoteState.ok ? "" : (remoteState.error || "");
          page.remoteAt = remoteState.at;
        }
        if (gate && gate.passHash) { page.passHash = gate.passHash; page.passSalt = gate.passSalt; }
        else { delete page.passHash; delete page.passSalt; }
      }
      await this.saveState();
      return true;
    } catch (error) {
      this.log("应用分享权限失败: " + (error && error.message));
      showMessage(t("error.title") + ": " + (error && error.message || ""), 5000, "error");
      return false;
    }
  }

  showQrDialog(url) {
    const content = '<div class="ss-qr-dialog">' + qrSvg(url, 8) +
      '<p class="ss-help">' + esc(t("share.qrHint")) + "</p>" +
      '<div class="ss-share__linkrow"><input class="ss-input ss-share__url" type="text" readonly value="' + esc(url) + '">' +
      '<button class="ss-btn ss-btn--primary" type="button" data-ss-share="copy">' + esc(t("share.copy")) + "</button></div></div>";
    const dialog = this.openDialog(t("share.qrTitle"), content, "min(360px, calc(100vw - 32px))");
    const btn = dialog.element.querySelector('[data-ss-share="copy"]');
    if (btn) btn.onclick = function () { copyText(url).then(function () { btn.textContent = t("result.copied"); }); };
  }

  showSingleResult(result) {
    if (!result) return;
    if (!result.ok) { this.showFailure(result.error); return; }
    const self = this;
    const body =
      '<div class="ss-toast__head"><span class="ss-status" aria-hidden="true">✓</span>' +
      '<span class="ss-toast__title">' + esc(t("result.title")) + '</span>' +
      '<button class="ss-toast__close" type="button" data-ss-action="close" aria-label="' + esc(t("action.close")) + '">×</button></div>' +
      '<div class="ss-toast__link">' + esc(result.url) + '</div>' +
      (result.missing ? '<p class="ss-toast__note">' + esc(t("result.partial", result.missing)) + "</p>" : "") +
      '<div class="ss-toast__actions">' +
      '<button class="ss-btn ss-btn--primary" type="button" data-ss-action="copy">' + esc(t("result.copyLink")) + '</button>' +
      '<button class="ss-btn" type="button" data-ss-action="preview">' + esc(t("result.openPreview")) + '</button>' +
      '<button class="ss-btn" type="button" data-ss-action="browser">' + esc(t("result.openBrowser")) + '</button>' +
      '<button class="ss-btn" type="button" data-ss-action="html">' + esc(t("result.exportHtml")) + '</button>' +
      "</div>" +
      '<p class="ss-toast__note">' + esc(t("notice.public")) + "</p>";
    this.setToast(result.missing ? "partial" : "success", t("result.title"), body);
    this.bindClose();
    const toast = this.toast;
    toast.querySelector('[data-ss-action="copy"]').onclick = function () {
      copyText(result.url).then(function () {
        self.setButtonDone(this, t("result.copied"));
      }.bind(this));
    };
    toast.querySelector('[data-ss-action="preview"]').onclick = function () { self.showPreview(result.url, result.title); };
    toast.querySelector('[data-ss-action="browser"]').onclick = function () {
      openExternal(result.url);
    };
    toast.querySelector('[data-ss-action="html"]').onclick = function () { self.downloadHtml(result.html, result.slug); };
  }

  showBatchResult(results, docs) {
    const ok = results.filter(function (r) { return r.ok; });
    const failed = results.filter(function (r) { return !r.ok; });
    const self = this;
    const links = ok.map(function (r) { return r.url; }).join("\n");
    const body =
      '<div class="ss-toast__head"><span class="ss-status" aria-hidden="true">✓</span>' +
      '<span class="ss-toast__title">' + esc(t("result.batchSummary", ok.length, failed.length)) + '</span>' +
      '<button class="ss-toast__close" type="button" data-ss-action="close" aria-label="' + esc(t("action.close")) + '">×</button></div>' +
      '<div class="ss-toast__links">' + ok.map(function (r) {
        return '<div class="ss-toast__link">' + esc(r.title) + "<br>" + esc(r.url) + "</div>";
      }).join("") + "</div>" +
      '<div class="ss-toast__actions">' +
      '<button class="ss-btn ss-btn--primary" type="button" data-ss-action="copyall">' + esc(t("result.copyAll")) + '</button>' +
      (failed.length ? '<button class="ss-btn" type="button" data-ss-action="retry">' + esc(t("result.retryFailed")) + "</button>" : "") +
      "</div>" +
      '<p class="ss-toast__note">' + esc(t("notice.public")) + "</p>";
    this.setToast(failed.length ? "partial" : "success", t("result.batchSummary", ok.length, failed.length), body);
    this.bindClose();
    this.toast.querySelector('[data-ss-action="copyall"]').onclick = function () {
      copyText(links).then(function () { self.setButtonDone(this, t("result.copied")); }.bind(this));
    };
    const retry = this.toast.querySelector('[data-ss-action="retry"]');
    if (retry) retry.onclick = function () {
      const retryDocs = failed.map(function (r) { return r.doc; }).filter(Boolean);
      self.publishTargets(retryDocs);
    };
  }

  showFailure(error) {
    const message = this.friendlyError(error);
    const self = this;
    const body =
      '<div class="ss-toast__head"><span class="ss-status" aria-hidden="true">!</span>' +
      '<span class="ss-toast__title">' + esc(t("error.title")) + '</span>' +
      '<button class="ss-toast__close" type="button" data-ss-action="close" aria-label="' + esc(t("action.close")) + '">×</button></div>' +
      '<p>' + esc(message) + '</p>' +
      '<div class="ss-toast__actions">' +
      '<button class="ss-btn" type="button" data-ss-action="log">' + esc(t("result.viewLog")) + '</button>' +
      '<button class="ss-btn ss-btn--primary" type="button" data-ss-action="close">' + esc(t("action.close")) + "</button></div>" +
      '<pre class="ss-toast__log" hidden>' + esc(this.logs.slice(-12).join("\n")) + "</pre>";
    this.setToast("error", t("error.title"), body);
    this.bindClose();
    this.toast.querySelector('[data-ss-action="log"]').onclick = function () {
      const log = self.toast.querySelector(".ss-toast__log");
      log.hidden = !log.hidden;
    };
  }

  friendlyError(error) {
    const message = String((error && error.message) || error || "");
    if (!message) return t("error.exportUnknown");
    if (message === "cancelled") return t("progress.cancelled", 0);
    if (/getDocInfo|not found|不存在/i.test(message)) return t("error.notFound");
    if (/permission|denied|putFile|写入/i.test(message)) return t("error.disk");
    if (/没有可导出|empty/i.test(message)) return t("error.empty");
    return message;
  }

  setButtonDone(button, text) {
    const original = button.textContent;
    button.textContent = text;
    button.setAttribute("data-state", "done");
    setTimeout(function () {
      button.textContent = original;
      button.removeAttribute("data-state");
    }, 2000);
  }

  bindClose() {
    const self = this;
    if (!this.toast) return;
    Array.prototype.forEach.call(this.toast.querySelectorAll('[data-ss-action="close"]'), function (button) {
      button.onclick = function () { self.closeToast(); };
    });
    if (this.toast.__closeBound) return;
    this.toast.__closeBound = true;
  }

  showPreview(url, title) {
    const iframe = document.createElement("iframe");
    iframe.src = url;
    iframe.style.width = "100%";
    iframe.style.height = "70vh";
    iframe.style.border = "0";
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups");
    iframe.setAttribute("title", title || "预览");
    const dialog = new Dialog({
      title: title || t("result.openPreview"),
      content: '<div class="b3-dialog__content">' + iframe.outerHTML + "</div>",
      width: "920px",
      height: "80vh"
    });
    return dialog;
  }

  downloadHtml(html, slug) {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = slug + ".html";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 5000);
  }

  openDialog(title, content, width) {
    return new Dialog({
      title: title,
      content: '<div class="b3-dialog__content ss-panel ss-plugin">' + content + "</div>",
      width: width || "560px",
      height: "auto"
    });
  }

  setDialogTitle(dialog, text) {
    const root = dialog && dialog.element;
    if (!root) return;
    const title = root.querySelector(".b3-dialog__title") ||
      root.querySelector(".b3-dialog__header") || root.querySelector("header");
    if (title) title.textContent = text;
  }

  askOverwrite(slug, page) {
    const self = this;
    return new Promise(function (resolve) {
      const decision = { value: "cancel" };
      let versionNumber = 2;
      while (self.state.pages[slug + "-v" + versionNumber]) versionNumber++;
      const version = slug + "-v" + versionNumber;
      const dialog = self.openDialog(t("confirm.overwriteTitle"),
        '<p>' + esc(fmt(t("confirm.overwriteBody"), page.docName || slug, relativeTime(page.publishedAt, t))) + "</p>" +
        '<label class="ss-switch-line"><input type="radio" name="ss-overwrite" value="overwrite" checked>' +
        esc(t("confirm.overwrite")) + "</label>" +
        '<label class="ss-switch-line"><input type="radio" name="ss-overwrite" value="version">' +
        esc(fmt(t("confirm.newVersion"), version)) + "</label>" +
        '<div class="ss-actions">' +
        '<button class="ss-btn" type="button" data-ss-decision="cancel">' + esc(t("action.cancel")) + "</button>" +
        '<button class="ss-btn ss-btn--primary" type="button" data-ss-decision="ok">' + esc(t("action.continue")) + "</button>" +
        "</div>");
      const element = dialog.element;
      const cancelButton = element.querySelector('[data-ss-decision="cancel"]');
      if (cancelButton) cancelButton.focus();
      Array.prototype.forEach.call(element.querySelectorAll("[data-ss-decision]"), function (button) {
        button.onclick = function () {
          if (button.getAttribute("data-ss-decision") === "ok") {
            const chosen = element.querySelector('input[name="ss-overwrite"]:checked');
            decision.value = chosen && chosen.value === "version" ? "version" : "overwrite";
            if (decision.value === "version") decision.newVersion = version;
          }
          dialog.destroy();
          resolve(decision);
        };
      });
    });
  }

  // ------------------------------------------------------------ 设置面板

  fieldSelect(key, label, options, current) {
    const html = options.map(function (option) {
      return '<option value="' + esc(option[0]) + '"' + (option[0] === current ? " selected" : "") + ">" +
        esc(t(option[1])) + "</option>";
    }).join("");
    return '<div class="ss-field"><label class="ss-label">' + esc(t(label)) + '</label><div class="ss-control">' +
      '<select class="ss-select" data-setting="' + key + '">' + html + "</select></div></div>";
  }

  fieldText(key, label, value) {
    return '<div class="ss-field"><label class="ss-label">' + esc(t(label)) + '</label><div class="ss-control">' +
      '<input class="ss-input" type="text" data-setting="' + key + '" value="' + esc(value) + '"></div></div>';
  }

  fieldSecret(key, label, value) {
    return '<div class="ss-field"><label class="ss-label">' + esc(t(label)) + '</label><div class="ss-control">' +
      '<input class="ss-input" type="password" autocomplete="off" spellcheck="false" data-setting="' + key +
      '" value="' + esc(value) + '"></div></div>';
  }

  fieldSwitch(key, label) {
    return '<div class="ss-field"><div class="ss-control"><label class="ss-switch-line">' +
      '<span class="ss-switch" data-on="' + (this.settings[key] ? "true" : "false") + '">' +
      '<input type="checkbox" data-setting="' + key + '"' + (this.settings[key] ? " checked" : "") + ' hidden>' +
      "</span><span>" + esc(t(label)) + "</span></label></div></div>";
  }

  // 官方设置入口：重写 openSetting 后，思源插件管理页的「配置」齿轮会自动出现，
  // 点击齿轮直接进入分享页面的后台管理（已核实内核 hasPluginSetting / openSetting 机制）
  openSetting() {
    this.showManager();
  }

  showSettings() {
    const self = this;
    const s = this.settings;
    const content =
      (!s.onboarded ? '<div class="ss-notice ss-dismissible" data-ss-action="dismissNotice"><span>' + esc(t("settings.firstHint")) + '</span><button class="ss-notice__x" type="button" data-ss-action="dismissNotice" aria-label="' + esc(t("action.close")) + '">×</button></div>' : "") +
      '<div class="ss-guide-entry"><div><strong>' + esc(t("settings.guideEntryTitle")) + "</strong><p class=\"ss-help\">" + esc(t("settings.guideEntryBody")) + "</p></div>" +
      '<button class="ss-btn" type="button" data-ss-action="guide">' + esc(t("settings.rerunGuide")) + "</button></div>" +
      "<section><h3 class=\"ss-group\">" + esc(t("settings.groupLink")) + "</h3>" +
      this.fieldText("domain", "settings.domain", s.domain) +
      this.fieldText("pathPrefix", "settings.prefix", s.pathPrefix) +
      this.fieldText("linkFormat", "settings.linkFormat", s.linkFormat || DEFAULT_SETTINGS.linkFormat) +
      '<p class="ss-help">' + esc(t("settings.linkFormatHint")) + "</p>" +
      '<p class="ss-help">' + esc(fmt(t("settings.linkHint"), formatPageUrl(s, "示例链接"))) + "</p></section>" +
      "<section><h3 class=\"ss-group\">" + esc(t("settings.groupRemote")) + "</h3>" +
      this.fieldSwitch("remotePublish", "settings.remotePublish") +
      this.fieldText("remoteBase", "settings.remoteBase", s.remoteBase || s.domain || "") +
      this.fieldSecret("remoteToken", "settings.remoteToken", s.remoteToken || "") +
      '<p class="ss-help">' + esc(t("settings.remoteHint")) + "</p>" +
      '<button class="ss-btn" type="button" data-ss-action="testRemote">' + esc(t("settings.remoteTest")) + "</button>" +
      '<p class="ss-help" data-remote-result hidden></p></section>' +
      "<section><h3 class=\"ss-group\">" + esc(t("settings.groupFooter")) + "</h3>" +
      this.fieldText("footerBrand", "settings.footerBrand", s.footerBrand || "") +
      this.fieldText("footerNote", "settings.footerNote", s.footerNote || "") +
      '<p class="ss-help">' + esc(t("settings.footerHint")) + "</p></section>" +
      "<section><h3 class=\"ss-group\">" + esc(t("settings.groupSlug")) + "</h3>" +
      this.fieldSelect("slugStyle", "settings.slugStyle", [["auto", "settings.opt.auto"], ["short", "settings.opt.short"]], s.slugStyle) +
      this.fieldText("slugPrefix", "settings.slugPrefix", s.slugPrefix) +
      this.fieldSelect("slugHash", "settings.slugHash", [["on", "settings.opt.on"], ["off", "settings.opt.off"]], s.slugHash) +
      '<p class="ss-help">' + esc(t("settings.slugHint")) + "</p></section>" +
      "<section><h3 class=\"ss-group\">" + esc(t("settings.groupContent")) + "</h3>" +
      this.fieldSwitch("merge", "settings.merge") +
      '<p class="ss-help">' + esc(t("settings.mergeHint")) + "</p>" +
      this.fieldSwitch("toc", "settings.toc") +
      this.fieldSelect("highlight", "settings.highlight", [["shared", "settings.opt.shared"], ["cdn", "settings.opt.cdn"], ["off", "settings.opt.off"]], s.highlight) +
      this.fieldSelect("math", "settings.math", [["shared", "settings.opt.shared"], ["cdn", "settings.opt.cdn"], ["off", "settings.opt.off"]], s.math) +
      this.fieldSelect("theme", "settings.theme", [["auto", "settings.opt.auto"], ["light", "settings.opt.light"], ["dark", "settings.opt.dark"]], s.theme) +
      this.fieldSwitch("showUpdated", "settings.showUpdated") + "</section>" +
      "<section><h3 class=\"ss-group\">" + esc(t("settings.groupAssets")) + "</h3>" +
      this.fieldSelect("imageMode", "settings.imageMode", [["folder", "settings.opt.folder"], ["inline", "settings.opt.inline"]], s.imageMode) +
      '<p class="ss-help">' + esc(t("settings.imageModeHint")) + "</p>" +
      this.fieldSwitch("imageLazy", "settings.imageLazy") +
      this.fieldText("staticDir", "settings.staticDir", s.staticDir) +
      this.fieldSwitch("singleFile", "settings.singleFile") +
      '<p class="ss-help">' + esc(t("settings.singleFileHint")) + "</p></section>" +
      "<section><h3 class=\"ss-group\">" + esc(t("settings.groupBehavior")) + "</h3>" +
      this.fieldSwitch("autoCopyLink", "settings.autoCopy") +
      this.fieldSwitch("autoOpenBrowser", "settings.autoOpen") +
      this.fieldSwitch("notify", "settings.notify") +
      this.fieldSwitch("confirmOverwrite", "settings.confirmOverwrite") + "</section>" +
      "<section><h3 class=\"ss-group\">" + esc(t("settings.groupProtect")) + "</h3>" +
      this.fieldText("password", "settings.passwordDefault", s.password ? "••••" : "") +
      '<p class="ss-help">' + esc(t("settings.protectHint")) + "</p>" +
      '<p class="ss-warn">' + esc(t("protect.disclaimer")) + "</p></section>" +
      "<section><h3 class=\"ss-group\">" + esc(t("settings.groupDiag")) + "</h3>" +
      this.fieldText("probeDir", "settings.probeDir", s.probeDir) +
      this.fieldSelect("logLevel", "settings.logLevel", [["info", "settings.opt.on"], ["debug", "settings.opt.inline"]], s.logLevel) +
      '<button class="ss-btn ss-btn--danger" type="button" data-ss-action="clean">' + esc(t("settings.clean")) + "</button>" +
      "</section>" +
      '<div class="ss-actions">' +
      '<button class="ss-btn" type="button" data-ss-action="cancel">' + esc(t("action.cancel")) + "</button>" +
      '<button class="ss-btn ss-btn--primary" type="button" data-ss-action="save">' + esc(t("action.save")) + "</button></div>";

    const dialog = this.openDialog(t("settings.title"), content, "620px");
    const element = dialog.element;
    const draft = Object.assign({}, s);

    Array.prototype.forEach.call(element.querySelectorAll("[data-setting]"), function (input) {
      const key = input.getAttribute("data-setting");
      if (input.type === "checkbox") {
        input.onchange = function () {
          draft[key] = input.checked;
          const track = input.parentElement;
          if (track && track.classList.contains("ss-switch")) track.setAttribute("data-on", input.checked ? "true" : "false");
        };
      } else {
        input.onchange = function () { draft[key] = input.value; };
      }
    });

    Array.prototype.forEach.call(element.querySelectorAll("[data-ss-action]"), function (button) {
      button.onclick = function () {
        const action = button.getAttribute("data-ss-action");
        if (action === "save") {
          if (draft.slugPrefix && validateSlug(String(draft.slugPrefix).trim()) !== "ok") {
            showMessage(t("slug.invalidChars"), 4000, "error");
            return;
          }
          // 密码字段显示的是掩码：••••=未改动保留原值；空=清除；4位数字=采用
          const passRaw = String(draft.password || "");
          if (passRaw === "••••") draft.password = s.password || "";
          else if (!passRaw) draft.password = "";
          else if (/^\d{4}$/.test(passRaw)) { /* 采用新密码 */ }
          else { showMessage(t("protect.passwordInvalid"), 4000, "error"); return; }
          const fmtRaw = String(draft.linkFormat || "").trim();
          if (!fmtRaw || fmtRaw.indexOf("{slug}") < 0) {
            showMessage(t("settings.linkFormatInvalid"), 4000, "error");
            return;
          }
          draft.linkFormat = fmtRaw;
          draft.remoteBase = String(draft.remoteBase || draft.domain || "").trim().replace(/\/+$/, "");
          draft.remoteToken = String(draft.remoteToken || "").trim();
          if (draft.remotePublish && (!/^https?:\/\//i.test(draft.remoteBase) || !draft.remoteToken)) {
            showMessage(t("settings.remoteNeedToken"), 5000, "error");
            return;
          }
          const prevFooterBrand = s.footerBrand;
          const prevFooterNote = s.footerNote;
          self.settings = Object.assign({}, DEFAULT_SETTINGS, draft);
          self.settings.domain = self.settings.domain.replace(/\/+$/, "");
          self.settings.pathPrefix = String(self.settings.pathPrefix || "public").replace(/^\/+|\/+$/g, "") || "public";
          self.settings.staticDir = String(self.settings.staticDir || "_static").replace(/[^a-zA-Z0-9_-]/g, "") || "_static";
          self.settings.linkFormat = String(self.settings.linkFormat || DEFAULT_SETTINGS.linkFormat).trim() || DEFAULT_SETTINGS.linkFormat;
          self.saveSettings().then(function () {
            showMessage(t("settings.saved"), 2500);
            dialog.destroy();
            // 页脚改了就立刻问“要不要应用到已发布页面”，避免“改了没效果”
            self.offerFooterApply(prevFooterBrand, prevFooterNote);
          });
        } else if (action === "testRemote") {
          const box = element.querySelector("[data-remote-result]");
          const probeSettings = {
            remoteBase: String(draft.remoteBase || draft.domain || "").trim().replace(/\/+$/, ""),
            remoteToken: String(draft.remoteToken || "").trim()
          };
          if (box) { box.hidden = false; box.textContent = t("settings.remoteTesting"); }
          remoteProbe(probeSettings).then(function (count) {
            if (box) box.textContent = t("settings.remoteOk", count);
            showMessage(t("settings.remoteOk", count), 3000);
          }).catch(function (error) {
            const msg = (error && error.message) || String(error);
            if (box) box.textContent = t("settings.remoteFail", msg);
            showMessage(msg, 5000, "error");
          });
        } else if (action === "dismissNotice") {
          self.settings.onboarded = true;
          self.saveSettings();
          element.querySelector(".ss-notice") && element.querySelector(".ss-notice").remove();
        } else if (action === "cancel") {
          dialog.destroy();
        } else if (action === "guide") {
          dialog.destroy();
          self.showGuide();
        } else if (action === "clean") {
          self.confirmClean();
        }
      };
    });
  }

  // ------------------------------------------------------------ 已发布页面管理（v1.3：后台管理）

  // 暂停提示页：复用失效页样式，不泄露文档标题
  renderPausedPage() {
    return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<meta name="robots" content="noindex">' +
      "<title>访问已暂停</title><style>" + PAGE_CSS + "</style></head>" +
      '<body data-theme="light">' +
      '<main style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px">' +
      '<div class="sy-expired"><div class="sy-expired__inner">' +
      '<span class="sy-expired__code">···</span>' +
      '<h1 class="sy-expired__title">此分享已暂停</h1>' +
      '<p class="sy-expired__desc">分享者已暂停该页面的公开访问。恢复访问后此链接将重新可用，链接地址不变。</p>' +
      "</div></div></main></body></html>";
  }

  // 「已发布页面管理」使用弹窗：只负责页面管理，页脚与插件设置留在设置面板
  showManager() {
    const dialog = this.openDialog(t("manage.title"), '<div class="ss-manager__host"></div>', "920px");
    this.renderManager(dialog.element.querySelector(".ss-manager__host"), { dialog: dialog });
  }

  managerMarkup() {
    return '<div class="ss-manage__tools">' +
      '<input class="ss-input" type="search" data-ss-search placeholder="' + esc(t("manage.search")) + '">' +
      '<button class="ss-btn" type="button" data-ss-action="refresh">' + esc(t("manage.refresh")) + "</button>" +
      '<button class="ss-btn" type="button" data-ss-action="verify">' + esc(t("manage.verifyAll")) + "</button>" +
      '<button class="ss-btn" type="button" data-ss-action="republish">' + esc(t("manage.republishAll")) + "</button>" +
      '<button class="ss-btn" type="button" data-ss-action="openSettings">' + esc(t("manage.openSettings")) + "</button></div>" +
      '<div class="ss-manage__list"></div>';
  }

  renderManager(container, opts) {
    const self = this;
    const dialog = opts && opts.dialog;
    container.innerHTML = '<div class="ss-manager__inner">' + this.managerMarkup() + "</div>";
    const root = container.querySelector(".ss-manager__inner");
    const list = root.querySelector(".ss-manage__list");
    const search = root.querySelector("[data-ss-search]");

    const render = function () {
      const keyword = (search.value || "").toLowerCase();
      const pages = Object.keys(self.state.pages).filter(function (slug) {
        const page = self.state.pages[slug];
        return !keyword || (page.docName || "").toLowerCase().indexOf(keyword) >= 0 || slug.indexOf(keyword) >= 0;
      }).sort(function (a, b) { return self.state.pages[b].updatedAt - self.state.pages[a].updatedAt; });
      if (!pages.length) {
        list.innerHTML = '<div class="ss-empty">' + esc(t("manage.empty")) + "</div>";
        return;
      }
      list.innerHTML = pages.map(function (slug) {
        const page = self.state.pages[slug];
        const url = page.url || self.pageUrlFor(slug);
        const reachable = typeof page.reachable === "boolean" ? String(page.reachable) : "unknown";
        const statusKey = reachable === "unknown" ? "manage.unknown" : (reachable === "true" ? "manage.reachable" : "manage.unreachable");
        const buttons =
          '<button class="ss-btn" type="button" data-ss-page="copy">' + esc(t("manage.copy")) + "</button>" +
          '<button class="ss-btn" type="button" data-ss-page="open">' + esc(t("manage.open")) + "</button>" +
          '<button class="ss-btn" type="button" data-ss-page="check">' + esc(t("manage.verify")) + "</button>" +
          '<button class="ss-btn" type="button" data-ss-page="rename">' + esc(t("manage.rename")) + "</button>" +
          '<button class="ss-btn" type="button" data-ss-page="regenerate">' + esc(t("manage.republish")) + "</button>" +
          (page.paused
            ? '<button class="ss-btn ss-btn--primary" type="button" data-ss-page="resume">' + esc(t("manage.resume")) + "</button>"
            : '<button class="ss-btn" type="button" data-ss-page="pause">' + esc(t("manage.pause")) + "</button>") +
          '<button class="ss-btn ss-btn--danger" type="button" data-ss-page="delete">' + esc(t("manage.delete")) + "</button>";
        return '<div class="ss-page' + (page.paused ? " ss-page--paused" : "") + '" data-slug="' + esc(slug) + '">' +
          '<div class="ss-page__main">' +
          '<div class="ss-page__title" title="' + esc(page.docName || slug) + '">' + esc(page.docName || slug) + "</div>" +
          '<div class="ss-page__url" title="' + esc(url) + '">' + esc(url) + "</div>" +
          "</div>" +
          '<div class="ss-page__meta">' +
          '<div class="ss-page__meta-row">' +
          '<span class="ss-page__dot" data-reachable="' + reachable + '" title="' + esc(t(statusKey)) + '"></span>' +
          '<span class="ss-page__time">' + esc(formatDateTime(page.publishedAt)) + "</span>" +
          "</div>" +
          '<div class="ss-page__meta-row">' +
          '<code class="ss-page__slug">' + esc(slug) + "</code>" +
          protectBadge(page, t) +
          (page.protected ? "" : '<span class="ss-badge ss-badge--muted">' + esc(t("manage.publicBadge")) + "</span>") +
          "</div></div>" +
          '<div class="ss-page__actions">' + buttons + "</div>" +
          "</div>";
      }).join("");
      Array.prototype.forEach.call(list.querySelectorAll(".ss-page"), function (row) {
        const slug = row.getAttribute("data-slug");
        const page = self.state.pages[slug];
        Array.prototype.forEach.call(row.querySelectorAll("[data-ss-page]"), function (button) {
          button.onclick = function () { self.pageAction(button.getAttribute("data-ss-page"), slug, page, render); };
        });
      });
    };

    search.oninput = render;
    Array.prototype.forEach.call(root.querySelectorAll("[data-ss-action]"), function (button) {
      button.onclick = function () {
        const action = button.getAttribute("data-ss-action");
        if (action === "refresh") {
          render();
          showMessage(t("manage.refreshed"), 1600);
        } else if (action === "verify") {
          self.verifyAllLinks().then(render);
        } else if (action === "republish") {
          const targets = Object.keys(self.state.pages).map(function (slug) {
            return { id: self.state.pages[slug].docId, name: self.state.pages[slug].docName };
          }).filter(function (doc) { return doc.id; });
          if (dialog) dialog.destroy();
          if (targets.length) self.publishTargets(targets);
        } else if (action === "openSettings") {
          if (dialog) dialog.destroy();
          self.showSettings();
        }
      };
    });
    render();
    return render;
  }

  // 把页脚署名/说明保存为全局默认，并逐页重新导出（静默，保持 slug 与密码不变）
  async applyFooterToAll(brand, note) {
    this.settings.footerBrand = String(brand || "");
    this.settings.footerNote = String(note || "");
    await this.saveSettings();
    const slugs = Object.keys(this.state.pages).filter(function (slug) {
      const page = this.state.pages[slug];
      return page.docId && !page.paused; // 暂停中的页面无需更新，恢复时自然带上新页脚
    }, this);
    let done = 0;
    let failed = 0;
    for (const slug of slugs) {
      const page = this.state.pages[slug];
      try {
        const result = await this.publishOne({ id: page.docId, name: page.docName }, 0, { quiet: true });
        if (result && result.ok) done++; else failed++;
      } catch (e) {
        failed++;
        this.log("页脚应用失败 " + slug + ": " + (e && e.message));
      }
    }
    return { done: done, failed: failed };
  }

  // 页脚设置保存后询问是否应用到已发布页面，避免“改了页脚但页面没变化”
  offerFooterApply(prevBrand, prevNote) {
    const brand = String(this.settings.footerBrand || "");
    const note = String(this.settings.footerNote || "");
    if (brand === String(prevBrand || "") && note === String(prevNote || "")) return;
    const slugs = Object.keys(this.state.pages).filter(function (slug) {
      const page = this.state.pages[slug];
      return page && page.docId && !page.paused;
    }, this);
    if (!slugs.length) return;
    const self = this;
    const dialog = this.openDialog(t("footer.applyTitle"),
      "<p>" + esc(fmt(t("footer.applyBody"), slugs.length)) + "</p>" +
      '<p class="ss-help">' + esc(t("footer.applyHint")) + "</p>" +
      '<div class="ss-actions">' +
      '<button class="ss-btn" type="button" data-footer-action="later">' + esc(t("footer.later")) + "</button>" +
      '<button class="ss-btn ss-btn--primary" type="button" data-footer-action="apply">' + esc(t("footer.apply")) + "</button>" +
      "</div>");
    const element = dialog.element;
    Array.prototype.forEach.call(element.querySelectorAll("[data-footer-action]"), function (button) {
      button.onclick = function () {
        const apply = button.getAttribute("data-footer-action") === "apply";
        dialog.destroy();
        if (!apply) return;
        showMessage(t("footer.applying"), 2500);
        self.applyFooterToAll(brand, note).then(function (summary) {
          showMessage(fmt(t("manage.footerApplied"), summary.done, summary.failed), 5000);
        });
      };
    });
  }

  async pausePage(slug, rerender) {
    const page = this.state.pages[slug];
    if (!page) return;
    try {
      const pausedHtml = renderPausedPage();
      await putBytes("/data/public/" + slug + "/index.html", pausedHtml, false);
      page.paused = true;
      if (remoteEnabled(this.settings)) {
        try {
          await remotePutBytes(this.settings, "/data/public/" + slug + "/index.html", pausedHtml, false);
          page.remote = true;
          page.remoteError = "";
        } catch (error) {
          page.remote = false;
          page.remoteError = (error && error.message) || String(error);
          this.log("远程暂停失败: " + page.remoteError);
          showMessage(t("share.remoteFail", page.remoteError), 6000, "error");
        }
      }
      await this.saveState();
      showMessage(t("manage.paused"), 2500);
    } catch (e) {
      showMessage(t("error.title") + ": " + (e && e.message || ""), 5000, "error");
    }
    if (rerender) rerender();
  }

  async resumePage(slug, rerender) {
    const page = this.state.pages[slug];
    if (!page) return;
    if (!page.docId) { showMessage(t("manage.resumeFail"), 5000, "error"); return; }
    try {
      // publishOne 会重建完整页面（含原密码保护），并把 paused 复位
      await this.publishOne({ id: page.docId, name: page.docName }, 0, { quiet: true });
      showMessage(t("manage.resumed"), 2500);
    } catch (e) {
      showMessage(t("error.title") + ": " + (e && e.message || ""), 5000, "error");
    }
    if (rerender) rerender();
  }

  pageUrlFor(slug) {
    return formatPageUrl(this.settings, slug);
  }

  async checkLink(slug) {
    const page = this.state.pages[slug];
    if (!page) return null;
    const url = page.url || this.pageUrlFor(slug);
    try {
      const response = await fetch(url + "?t=" + Date.now(), { method: "HEAD", cache: "no-store" });
      page.reachable = response.ok;
    } catch (e) {
      page.reachable = false;
    }
    await this.saveState();
    return page.reachable;
  }

  async verifyAllLinks() {
    const slugs = Object.keys(this.state.pages);
    for (const slug of slugs) await this.checkLink(slug);
    const unreachable = slugs.filter(function (slug) { return this.state.pages[slug].reachable === false; }, this);
    if (unreachable.length) showMessage(t("error.reachability"), 7000, "error");
    else if (slugs.length) showMessage(t("manage.reachable"), 2500);
    return slugs;
  }

  async pageAction(action, slug, page, rerender) {
    const self = this;
    const url = page.url || this.pageUrlFor(slug);
    if (action === "copy") {
      await copyText(url);
      showMessage(t("result.copied"), 2000);
    } else if (action === "open") {
      openExternal(url);
    } else if (action === "check") {
      await this.checkLink(slug);
      rerender();
    } else if (action === "regenerate") {
      this.publishTargets([{ id: page.docId, name: page.docName }]);
    } else if (action === "pause") {
      await this.pausePage(slug, rerender);
    } else if (action === "resume") {
      await this.resumePage(slug, rerender);
    } else if (action === "delete") {
      this.confirmDelete(slug, page, rerender);
    } else if (action === "rename") {
      this.confirmRename(slug, page, rerender);
    }
  }

  confirmation(title, body, danger, onConfirm) {
    const self = this;
    const dialog = this.openDialog(title,
      "<p>" + body + '</p><div class="ss-actions">' +
      '<button class="ss-btn" type="button" data-ss-confirm="no">' + esc(t("action.cancel")) + "</button>" +
      '<button class="ss-btn ' + (danger ? "ss-btn--danger" : "ss-btn--primary") + '" type="button" data-ss-confirm="yes">' +
      esc(danger ? t("confirm.deleteBtn") : t("action.continue")) + "</button></div>");
    const cancel = dialog.element.querySelector('[data-ss-confirm="no"]');
    if (cancel) cancel.focus();
    Array.prototype.forEach.call(dialog.element.querySelectorAll("[data-ss-confirm]"), function (button) {
      button.onclick = function () {
        const yes = button.getAttribute("data-ss-confirm") === "yes";
        dialog.destroy();
        if (yes) onConfirm();
      };
    });
    return dialog;
  }

  confirmDelete(slug, page, rerender) {
    const self = this;
    this.confirmation(t("confirm.deleteTitle"), esc(t("confirm.deleteBody")), true, async function () {
      try {
        await removePath("/data/public/" + slug);
      } catch (error) {
        showMessage(t("error.disk") + " " + error.message, 7000, "error");
        return;
      }
      if (remoteEnabled(self.settings)) await remoteRemovePath(self.settings, "/data/public/" + slug);
      delete self.state.pages[slug];
      await self.saveState();
      rerender();
    });
  }

  confirmRename(slug, page, rerender) {
    const self = this;
    const content = "<p>" + esc(t("confirm.renameBody")) + "</p>" +
      '<div class="ss-field"><label class="ss-label">' + esc(t("manage.rename")) + '</label><div class="ss-control">' +
      '<input class="ss-input" type="text" value="' + esc(slug) + '" data-ss-new-slug></div></div>' +
      '<div class="ss-validate"></div>' +
      '<p class="ss-help">' + esc(fmt(t("confirm.renameOld"), self.pageUrlFor(slug))) + "</p>" +
      '<p class="ss-help" data-ss-new-url></p>' +
      '<div class="ss-actions">' +
      '<button class="ss-btn" type="button" data-ss-confirm="no">' + esc(t("action.cancel")) + "</button>" +
      '<button class="ss-btn ss-btn--primary" type="button" data-ss-confirm="yes">' + esc(t("action.continue")) + "</button></div>";
    const dialog = this.openDialog(t("confirm.renameTitle"), content);
    const input = dialog.element.querySelector("[data-ss-new-slug]");
    const validate = dialog.element.querySelector(".ss-validate");
    const preview = dialog.element.querySelector("[data-ss-new-url]");
    let valid = false;
    const check = function () {
      const value = input.value.trim();
      const state = validateSlug(value);
      valid = state === "ok" && (value === slug || !self.state.pages[value]);
      let hint = "";
      if (state === "space") hint = t("slug.space");
      else if (state === "chars" || state === "empty") hint = t("slug.invalidChars");
      else if (!valid) hint = t("slug.taken");
      else hint = t("slug.ok");
      validate.textContent = hint;
      validate.setAttribute("data-ok", valid ? "true" : "false");
      preview.textContent = fmt(t("confirm.renameNew"), self.pageUrlFor(value));
    };
    input.oninput = check;
    check();
    input.focus();
    Array.prototype.forEach.call(dialog.element.querySelectorAll("[data-ss-confirm]"), function (button) {
      button.onclick = async function () {
        if (button.getAttribute("data-ss-confirm") !== "yes") { dialog.destroy(); return; }
        if (!valid) return;
        const next = input.value.trim();
        if (next === slug) { dialog.destroy(); return; }
        try {
          const response = await postAPI("/api/file/renameFile", {
            path: "/data/public/" + slug,
            newPath: "/data/public/" + next
          });
          if (!response || response.code !== 0) throw new Error((response && response.msg) || t("error.disk"));
        } catch (error) {
          showMessage(error.message, 7000, "error");
          return;
        }
        if (remoteEnabled(self.settings)) {
          try {
            await remotePost(self.settings, "/api/file/renameFile", {
              path: "/data/public/" + slug,
              newPath: "/data/public/" + next
            });
          } catch (error) {
            self.log("远程重命名失败: " + ((error && error.message) || error));
          }
        }
        const moved = self.state.pages[slug];
        delete self.state.pages[slug];
        Object.keys(self.state.slugs).forEach(function (docId) {
          if (self.state.slugs[docId] === slug) self.state.slugs[docId] = next;
        });
        moved.url = self.pageUrlFor(next);
        self.state.pages[next] = moved;
        await self.saveState();
        dialog.destroy();
        rerender();
      };
    });
  }

  confirmClean() {
    const self = this;
    this.confirmation(t("confirm.cleanTitle"), esc(t("confirm.cleanBody")), true, async function () {
      const entries = await listDir("/data/public");
      const reserved = [self.settings.staticDir, self.settings.probeDir];
      let removed = 0;
      for (const entry of entries) {
        if (!entry.isDir || reserved.indexOf(entry.name) >= 0 || self.state.pages[entry.name]) continue;
        try { await removePath("/data/public/" + entry.name); removed++; }
        catch (e) { self.log("清理失败 " + entry.name + ": " + e.message); }
      }
      showMessage(fmt(t("settings.cleaned"), removed), 3000);
    });
  }

  // ------------------------------------------------------------ 首次引导

  async runProbe(domain, prefix) {
    const dir = "/data/public/" + this.settings.probeDir;
    const marker = "siyuan-share-probe:" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    const url = domain.replace(/\/+$/, "") + "/" + prefix + "/" + this.settings.probeDir + "/?t=" + Date.now();
    let result = "timeout";
    try {
      await putBytes(dir, "", true);
      await putBytes(dir + "/index.html", "<!doctype html><html><body>" + marker + "</body></html>", false);
      const response = await fetch(url, { method: "GET", cache: "no-store" });
      if (response.status === 403) result = "forbidden";
      else if (response.status === 404) result = "notfound";
      else {
        const text = await response.text();
        result = text.indexOf(marker) >= 0 ? "ok" : "notfound";
      }
    } catch (e) {
      result = /403/.test(e && e.message) ? "forbidden" : "timeout";
      this.log("探针失败: " + (e && e.message));
    }
    try { await removePath(dir); } catch (e) { /* 探针目录清理失败不阻断引导 */ }
    return result;
  }

  showGuide() {
    const self = this;
    let step = 1;
    const draft = {
      domain: this.settings.domain,
      pathPrefix: this.settings.pathPrefix
    };
    const dialog = this.openDialog(fmt(t("guide.step"), 1),
      '<div class="ss-guide"></div>', "560px");
    const body = dialog.element.querySelector(".ss-guide");

    const actions = function (html) {
      body.innerHTML = html;
      Array.prototype.forEach.call(body.querySelectorAll("[data-ss-guide]"), function (button) {
        button.onclick = function () { handle(button.getAttribute("data-ss-guide")); };
      });
    };

    const finish = async function () {
      self.settings.domain = draft.domain.replace(/\/+$/, "");
      self.settings.pathPrefix = draft.pathPrefix.replace(/^\/+|\/+$/g, "") || "public";
      self.settings.onboarded = true;
      await self.saveSettings();
      dialog.destroy();
    };

    const handle = async function (action) {
      if (action === "skip") {
        await finish();
        return;
      }
      if (action === "next") {
        const domainInput = body.querySelector("[data-guide-domain]");
        const prefixInput = body.querySelector("[data-guide-prefix]");
        if (domainInput) draft.domain = domainInput.value.trim();
        if (prefixInput) draft.pathPrefix = prefixInput.value.trim();
        if (!/^https?:\/\//.test(draft.domain)) {
          showMessage(t("guide.failTimeout", draft.domain || "-"), 5000, "error");
          return;
        }
        step = 2;
        self.setDialogTitle(dialog, fmt(t("guide.step"), 2));
        actions(
          "<h3>" + esc(t("guide.testTitle")) + "</h3>" +
          "<p>" + esc(t("guide.testBody")) + "</p>" +
          '<p class="ss-guide__result" data-guide-status><span class="ss-spinner"></span> ' + esc(t("guide.testing")) + "</p>" +
          '<div class="ss-actions">' +
          '<button class="ss-btn" type="button" data-ss-guide="skipandcontinue">' + esc(t("guide.skipContinue")) + "</button>" +
          '<button class="ss-btn ss-btn--primary" type="button" data-ss-guide="done" disabled>' + esc(t("guide.done")) + "</button></div>"
        );
        const result = await self.runProbe(draft.domain, draft.pathPrefix);
        const status = body.querySelector("[data-guide-status]");
        const done = body.querySelector('[data-ss-guide="done"]');
        if (done) done.disabled = false;
        if (result === "ok") {
          if (status) status.innerHTML = "<strong>✓ " + esc(t("guide.okTitle")) + "</strong>";
          body.__probeOk = true;
        } else {
          const message = result === "notfound" ? t("guide.fail404")
            : result === "forbidden" ? t("guide.fail403") : t("guide.failTimeout", draft.domain);
          if (status) status.innerHTML = '<span style="color:var(--ss-warning)">' + esc(message) + "</span>";
          body.__probeOk = false;
        }
        return;
      }
      if (action === "skipandcontinue") {
        step = 3;
        self.setDialogTitle(dialog, fmt(t("guide.step"), 3));
        actions(stepThree(self.pageUrlFor(self.settings.probeDir), false));
        return;
      }
      if (action === "done") {
        if (step === 2) {
          step = 3;
          self.setDialogTitle(dialog, fmt(t("guide.step"), 3));
          actions(stepThree(self.pageUrlFor(self.settings.probeDir), !!body.__probeOk));
        } else {
          await finish();
        }
      }
    };

    const stepThree = function (probeUrl, ok) {
      return '<h3>' + (ok ? "✓ " + esc(t("guide.okTitle")) : esc(t("guide.title"))) + "</h3>" +
        (ok ? "<p>" + esc(fmt(t("guide.okBody"), probeUrl)) + "</p>" : "") +
        '<p class="ss-guide__result">' + esc(t("guide.nextSteps")).replace(/\n/g, "<br>") + "</p>" +
        '<p class="ss-guide__warn">' + esc(t("guide.warn")) + "</p>" +
        '<div class="ss-actions">' +
        '<button class="ss-btn" type="button" data-ss-guide="skip">' + esc(t("guide.later")) + "</button>" +
        '<button class="ss-btn ss-btn--primary" type="button" data-ss-guide="done">' + esc(t("guide.tryIt")) + "</button></div>";
    };

    actions(
      "<h3>" + esc(t("guide.title")) + "</h3>" +
      "<p class=\"ss-guide__intro\">" + esc(t("guide.intro")) + "</p>" +
      '<div class="ss-guide__field ss-field"><label class="ss-label">' + esc(t("settings.domain")) + "</label>" +
      '<div class="ss-control"><input class="ss-input" type="text" data-guide-domain value="' + esc(draft.domain) + '"></div></div>' +
      '<div class="ss-guide__field ss-field"><label class="ss-label">' + esc(t("settings.prefix")) + "</label>" +
      '<div class="ss-control"><input class="ss-input" type="text" data-guide-prefix value="' + esc(draft.pathPrefix) + '"></div></div>' +
      '<p class="ss-guide__warn">' + esc(t("guide.warn")) + "</p>" +
      '<div class="ss-actions">' +
      '<button class="ss-btn" type="button" data-ss-guide="skip">' + esc(t("guide.skip")) + "</button>" +
      '<button class="ss-btn ss-btn--primary" type="button" data-ss-guide="next">' + esc(t("guide.next")) + "</button></div>"
    );
  }
}

exports.default = StaticSharePlugin;
