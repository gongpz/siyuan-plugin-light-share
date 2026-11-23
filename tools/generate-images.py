# 开发维护用工具：生成 icon.png（160×160）与 preview.png（1024×768）。
# 运行：python tools/generate-images.py
from PIL import Image, ImageDraw, ImageFont, ImageFilter

import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICON_LARGE = os.path.join(ROOT, "design", "icon-large.png")
ICON_FULL = os.path.join(ROOT, "design", "icon-full.png")

PAPER = "#FCFBF9"
SURFACE = "#FFFFFF"
SUNKEN = "#F4F1EC"
INK = "#24211E"
MUTED = "#5F5952"
SUBTLE = "#6F675C"
BORDER = "#E5E0D8"
BORDER_STRONG = "#D2CABE"
ACCENT = "#A34A24"
ACCENT_SOFT = "#F5EAE3"
ACCENT_BORDER = "#E8CFC3"
SUCCESS = "#3A6633"

F_REG = "C:/Windows/Fonts/msyh.ttc"
F_BOLD = "C:/Windows/Fonts/msyhbd.ttc"
F_MONO = "C:/Windows/Fonts/consola.ttf"


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()


def rounded(draw, box, radius, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def make_icon():
    """主图标来自 design/icon-full.png，保留原图 alpha，不添加背景、不加透明边距。"""
    icon = Image.open(ICON_FULL).convert("RGBA").resize((160, 160), Image.Resampling.LANCZOS)
    icon.save(os.path.join(ROOT, "icon.png"))


def paste_intro_icon(image, size, center):
    """把圆角方卡图标贴到介绍图左侧，带柔和投影。"""
    icon = Image.open(ICON_LARGE).convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)
    pad = 40
    shadow = Image.new("RGBA", (size + pad * 2, size + pad * 2), (0, 0, 0, 0))
    alpha = icon.getchannel("A").point(lambda a: int(a * 0.18))
    layer = Image.new("RGBA", icon.size, (0, 0, 0, 255))
    layer.putalpha(alpha)
    shadow.paste(layer, (pad, pad + 10), layer)
    shadow = shadow.filter(ImageFilter.GaussianBlur(12))
    image.alpha_composite(shadow, (center[0] - size // 2 - pad, center[1] - size // 2 - pad))
    image.alpha_composite(icon, (center[0] - size // 2, center[1] - size // 2))


def make_preview():
    w, h = 1024, 768
    image = Image.new("RGBA", (w, h), PAPER)
    draw = ImageDraw.Draw(image)

    # 纸张纹理：极淡的横向细线
    for y in range(28, h, 36):
        draw.line((48, y, w - 48, y), fill="#F7F4F0", width=1)

    # 顶部朱砂短线
    draw.rounded_rectangle((70, 56, 118, 62), radius=3, fill=ACCENT)

    # 左侧主图标（新版圆角方卡纸飞机，稍微缩小避免顶天立地）
    paste_intro_icon(image, 210, (236, 270))

    # 右侧文案
    draw.text((472, 120), "SIYUAN NOTE  /  LIGHT SHARE", font=font(F_REG, 17), fill=SUBTLE)
    draw.text((468, 160), "轻态分享", font=font(F_BOLD, 62), fill=INK)
    draw.text((472, 246), "一篇文档，一个可公开访问的独立网页", font=font(F_REG, 25), fill=MUTED)

    features = [
        "文档树右键 / 顶栏按钮，一键发布",
        "图片与样式随页落地，脱离思源也能打开",
        "链接保持稳定，重新发布不换地址",
    ]
    for i, line in enumerate(features):
        y = 300 + i * 34
        draw.ellipse((474, y + 8, 482, y + 16), fill=ACCENT)
        draw.text((494, y), line, font=font(F_REG, 18), fill=SUBTLE)

    # 外链示意（通用示例域名）
    rounded(draw, (468, 414, 958, 464), 10, fill=SURFACE, outline=BORDER, width=2)
    draw.ellipse((486, 434, 496, 444), fill=SUCCESS)
    draw.text((508, 428), "https://example.com/public/my-note-a3f9c2/",
              font=font(F_MONO, 16), fill=ACCENT)

    # 使用环境说明：不依赖 VPS / 域名，IP:端口也能分享
    draw.text((472, 478), "环境：思源 3.1+；桌面端开启「网络伺服」，或 Docker 部署",
              font=font(F_REG, 13), fill=MUTED)
    draw.text((472, 500), "无 VPS、无域名：局域网用 IP:6806 访问；公网需端口映射或内网穿透",
              font=font(F_REG, 13), fill=MUTED)

    # 底部浏览器示意
    rounded(draw, (70, 532, 958, 700), 14, fill=SURFACE, outline=BORDER, width=2)
    draw.line((72, 568, 956, 568), fill=BORDER, width=2)
    for i, color in enumerate(["#E8CFC3", "#E5E0D8", "#D2CABE"]):
        x = 94 + i * 20
        draw.ellipse((x, 546, x + 10, 556), fill=color)
    rounded(draw, (150, 544, 620, 560), 8, fill=SUNKEN)
    draw.text((160, 544), "example.com/public/my-note-a3f9c2/",
              font=font(F_MONO, 11), fill=SUBTLE)

    # 模拟正文
    draw.text((104, 586), "我的周报", font=font(F_BOLD, 20), fill=INK)
    for i, end in enumerate([500, 420, 470]):
        draw.rounded_rectangle((104, 618 + i * 14, end, 622 + i * 14), radius=2, fill=BORDER_STRONG)
    # 代码块
    rounded(draw, (560, 586, 920, 662), 8, fill=SUNKEN, outline=BORDER, width=1)
    draw.line((560, 606, 920, 606), fill=BORDER, width=1)
    draw.text((576, 590), "TYPESCRIPT", font=font(F_MONO, 10), fill=SUBTLE)
    draw.rounded_rectangle((576, 618, 700, 622), radius=2, fill="#A34A24")
    draw.rounded_rectangle((576, 634, 856, 638), radius=2, fill=BORDER_STRONG)
    draw.rounded_rectangle((576, 650, 780, 654), radius=2, fill=BORDER_STRONG)

    path_text = "data/public/<slug>/index.html"
    path_font = font(F_MONO, 13)
    draw.text((72, 716), path_text, font=path_font, fill=SUBTLE)
    draw.text((72 + draw.textlength(path_text, font=path_font) + 14, 716),
              "· 无需登录即可访问（/public/ 为内核免鉴权路由）", font=font(F_REG, 13), fill=SUBTLE)

    image.convert("RGB").save(os.path.join(ROOT, "preview.png"))

if __name__ == "__main__":
    make_icon()
    make_preview()
    for name in ("icon.png", "preview.png"):
        im = Image.open(os.path.join(ROOT, name))
        print(name, im.size, im.mode)
