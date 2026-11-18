"""打包思源插件为可直接安装的 zip。

生成的 zip 内含顶层 siyuan-static-share/ 目录，解压后把该目录整体
放入 <workspace>/data/plugins/ 即可。运行：python tools/pack.py
"""
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGIN = "siyuan-static-share"
OUT = os.path.join(os.path.dirname(ROOT), "siyuan-static-share.zip")

EXCLUDE_DIRS = {"node_modules", "__pycache__", ".git"}
EXCLUDE_FILES = {"build-magazine-test.js", "package-lock.json", "package.json"}
EXCLUDE_EXT_IN_DESIGN = set()  # design 目录全部保留（规范/令牌/骨架/预览）

count = 0
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        rel_dir = os.path.relpath(dirpath, ROOT)
        for name in filenames:
            if name in EXCLUDE_FILES:
                continue
            full = os.path.join(dirpath, name)
            rel = name if rel_dir == "." else os.path.join(rel_dir, name)
            arc = os.path.join(PLUGIN, rel.replace(os.sep, "/"))
            zf.write(full, arc)
            count += 1

print("packed", count, "files ->", OUT)
print("size:", os.path.getsize(OUT), "bytes")
