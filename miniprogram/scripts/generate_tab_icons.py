"""
生成小程序 tabBar 图标（81×81，与 app.json 中 color / selectedColor 对齐）。
依赖：Pillow。运行：python miniprogram/scripts/generate_tab_icons.py
"""
from __future__ import annotations

import os

from PIL import Image, ImageDraw

SIZE = 81
GRAY = "#8a8f99"
BLUE = "#2563eb"


def _hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def draw_home(color: str) -> Image.Image:
    """首页：IC 封装 + 上下引脚 + 内核走线，示意芯片 / 智能设备。"""
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = _hex_rgb(color)
    outline_w = 3
    thin = 2

    # 封装本体（圆角矩形）
    d.rounded_rectangle([18, 28, 63, 56], radius=6, outline=c, width=outline_w)

    # 上排引脚
    for x in (23, 30, 37, 44, 51, 58):
        d.line([(x, 20), (x, 28)], fill=c, width=thin)
    # 下排引脚
    for x in (23, 30, 37, 44, 51, 58):
        d.line([(x, 56), (x, 64)], fill=c, width=thin)

    # Pin1 圆点标记（左上内侧，示意封装方向）
    d.ellipse([23, 30, 28, 35], fill=c, outline=c)

    # 内核 / 晶粒
    d.rounded_rectangle([30, 35, 51, 49], radius=3, outline=c, width=thin)
    # 简易「走线」
    d.line([(40, 38), (40, 46)], fill=c, width=thin)
    d.line([(33, 42), (47, 42)], fill=c, width=thin)

    return img


def draw_mine(color: str) -> Image.Image:
    """我的：圆形头像 + 半圆肩线，常见「账户」轮廓。"""
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = _hex_rgb(color)
    w = 3
    d.ellipse([28, 12, 52, 36], outline=c, width=w)
    d.arc([14, 36, 66, 78], start=180, end=360, fill=c, width=w)
    return img


def main() -> None:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(root, "assets")
    os.makedirs(out, exist_ok=True)
    pairs = [
        ("tab-home.png", GRAY, draw_home),
        ("tab-home-active.png", BLUE, draw_home),
        ("tab-mine.png", GRAY, draw_mine),
        ("tab-mine-active.png", BLUE, draw_mine),
    ]
    for name, col, fn in pairs:
        path = os.path.join(out, name)
        fn(col).save(path, "PNG")
        print("wrote", path)


if __name__ == "__main__":
    main()
