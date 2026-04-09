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
    """首页：圆角开关面板 + 拨键 + 状态灯（智能开关元素）。"""
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = _hex_rgb(color)
    w = 3
    d.rounded_rectangle([14, 16, 66, 66], radius=10, outline=c, width=w)
    d.ellipse([22, 24, 32, 34], outline=c, width=2)
    d.rounded_rectangle([42, 30, 58, 54], radius=4, outline=c, width=w)
    d.line([(50, 34), (50, 50)], fill=c, width=3)
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
