#!/usr/bin/env python3
"""站点缩略图（og:image / 分享预览图）第二步：合成 1200x630 品牌封面。

输入：.tmp/site-cover-raw.png（由 scripts/gen_site_cover.mjs 抓取的首页 2x 截图）
      assets/images/icon/icon.png（站点图标）
输出：assets/images/og/site-cover-1200x630.jpg

用法：python scripts/gen_site_cover.py
"""
from __future__ import annotations

import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

W, H = 1200, 630
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, ".tmp", "site-cover-raw.png")
ICON = os.path.join(ROOT, "assets", "images", "icon", "icon.png")
OUT_DIR = os.path.join(ROOT, "assets", "images", "og")
OUT = os.path.join(OUT_DIR, "site-cover-1200x630.jpg")

FONT_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
FONT_REG = r"C:\Windows\Fonts\msyh.ttc"

TITLE = "TA工具箱"
SUBTITLE = "技术美术在线工具箱 · 28+ 款免安装工具"
DETAIL = "AI 生图 / 贴图通道 / Shader 转换 / 3D 预览 / 视频处理 / TA 知识库"
DOMAIN = "tools.treasuregrove.art"
EN_TITLE = "TA Toolbox"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    for candidate in (path, FONT_REG):
        if os.path.exists(candidate):
            try:
                return ImageFont.truetype(candidate, size)
            except OSError:
                continue
    return ImageFont.load_default()


def cover_fit(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    """等比缩放并居中裁切，保证铺满目标尺寸。"""
    tw, th = size
    scale = max(tw / img.width, th / img.height)
    resized = img.resize((max(tw, int(img.width * scale + 0.5)), max(th, int(img.height * scale + 0.5))), Image.LANCZOS)
    left = (resized.width - tw) // 2
    top = (resized.height - th) // 2
    return resized.crop((left, top, left + tw, top + th))


def vignette(size: tuple[int, int], strength: float = 0.58) -> Image.Image:
    """整体压暗 + 四周渐晕，让居中的品牌文字清晰可读。"""
    w, h = size
    ys = np.linspace(-1, 1, h, dtype=np.float32)[:, None]
    xs = np.linspace(-1, 1, w, dtype=np.float32)[None, :]
    dist = np.sqrt((xs * 1.0) ** 2 + (ys * 1.15) ** 2)
    ramp = strength + (1 - strength) * 0.55 * np.clip(dist - 0.35, 0, 1.6)
    alpha = (np.clip(ramp, 0, 1) * 255).astype(np.uint8)
    scrim = Image.new("RGBA", (w, h), (5, 9, 20, 255))
    scrim.putalpha(Image.fromarray(alpha, mode="L"))
    return scrim


def rounded_icon(size: int) -> Image.Image:
    icon = Image.open(ICON).convert("RGBA")
    icon = cover_fit(icon, (size, size))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * 0.22), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(icon, (0, 0), mask)
    return out


def draw_center(draw: ImageDraw.ImageDraw, text: str, y: int, fnt: ImageFont.FreeTypeFont, fill) -> None:
    w = draw.textlength(text, font=fnt)
    draw.text(((W - w) / 2, y), text, font=fnt, fill=fill)


def main() -> int:
    if not os.path.exists(RAW):
        print(f"[cover] missing screenshot {RAW}; run `node scripts/gen_site_cover.mjs` first", file=sys.stderr)
        return 1

    shot = cover_fit(Image.open(RAW).convert("RGB"), (W, H))
    # 首页作为模糊底图，避免与封面文字互相干扰；提饱和保住品牌色调
    backdrop = shot.filter(ImageFilter.GaussianBlur(13))
    backdrop = ImageEnhance.Color(backdrop).enhance(1.45)
    backdrop = ImageEnhance.Brightness(backdrop).enhance(0.92)
    base = Image.alpha_composite(backdrop.convert("RGBA"), vignette((W, H), strength=0.52))

    icon_size = 148
    icon = rounded_icon(icon_size)
    icon_x, icon_y = (W - icon_size) // 2, 96
    glow = Image.new("RGBA", (icon_size + 60, icon_size + 60), (0, 0, 0, 0))
    ImageDraw.Draw(glow).rounded_rectangle(
        (30, 30, 30 + icon_size, 30 + icon_size), radius=int(icon_size * 0.22), fill=(120, 190, 255, 60)
    )
    base.alpha_composite(glow.filter(ImageFilter.GaussianBlur(16)), (icon_x - 30, icon_y - 30))
    base.alpha_composite(icon, (icon_x, icon_y))

    draw = ImageDraw.Draw(base)
    draw_center(draw, TITLE, 286, font(FONT_BOLD, 66), (255, 255, 255, 255))
    draw_center(draw, SUBTITLE, 372, font(FONT_REG, 28), (222, 234, 255, 255))
    draw_center(draw, DETAIL, 416, font(FONT_REG, 21), (163, 183, 214, 255))

    # 分隔线 + 域名
    draw.line(((W - 320) / 2, 486, (W + 320) / 2, 486), fill=(255, 255, 255, 60), width=2)
    draw_center(draw, DOMAIN, 516, font(FONT_REG, 23), (150, 205, 255, 240))
    draw_center(draw, EN_TITLE, 556, font(FONT_REG, 18), (140, 158, 188, 220))

    os.makedirs(OUT_DIR, exist_ok=True)
    base.convert("RGB").save(OUT, "JPEG", quality=90, optimize=True, progressive=True)
    print(f"[cover] wrote {os.path.relpath(OUT, ROOT)} ({os.path.getsize(OUT) / 1024:.1f} KB, {W}x{H})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
