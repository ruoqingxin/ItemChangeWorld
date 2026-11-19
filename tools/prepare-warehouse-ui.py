"""从大厅已确认的青玉素材制作仓库面板与定尺寸控件。"""

import json
import uuid
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance


ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "assets/ui/atlas/module/warehouse"
LOBBY = ROOT / "assets/ui/atlas/module/lobby"
RESAMPLE = Image.Resampling.LANCZOS
JADE = Image.open(LOBBY / "player-info-strip.png").convert("RGBA")


def save(image, name):
    TARGET.mkdir(parents=True, exist_ok=True)
    path = TARGET / f"{name}.png"
    image.save(path, optimize=True)
    meta = path.with_suffix(".png.meta")
    data = json.loads(meta.read_text(encoding="utf-8")) if meta.exists() else {"uuid": str(uuid.uuid4())}
    data["importer"] = {
        "textureType": 2, "sRGB": True, "premultiplyAlpha": True, "generateMipmap": False,
    }
    meta.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def surface(size, brightness, strength=1):
    image = JADE.crop((130, 24, 635, 148)).resize(size, RESAMPLE)
    image.putalpha(255)
    image = ImageEnhance.Brightness(image).enhance(brightness)
    return Image.blend(Image.new("RGBA", size, "#222827"), image, strength)


def frame(image, bright=False):
    draw = ImageDraw.Draw(image)
    w, h = image.size
    draw.rounded_rectangle((1, 1, w - 2, h - 2), radius=5,
                           outline="#c4b58a" if bright else "#8a896a", width=1)
    draw.rounded_rectangle((4, 4, w - 5, h - 5), radius=3, outline="#3b5850", width=1)
    # 短角线与大厅的古铜包边呼应，不挤占物品格。
    for x, y, sx, sy in ((7, 7, 1, 1), (w - 8, 7, -1, 1),
                         (7, h - 8, 1, -1), (w - 8, h - 8, -1, -1)):
        draw.line((x, y + sy * 9, x, y, x + sx * 9, y), fill="#b9aa80", width=1)


def rule(image, y):
    draw = ImageDraw.Draw(image)
    draw.line((16, y, image.width - 17, y), fill="#52665a")
    draw.line((16, y + 1, image.width - 17, y + 1), fill="#172e29")


def panel(name, size, lines):
    image = surface(size, 0.48, 0.28)
    image.alpha_composite(surface((size[0] - 12, 40), 0.62, 0.65), (6, 6))
    frame(image)
    # 原画云纹只留在无操作内容的右下角，透明叠加保持低对比。
    cloud = JADE.crop((590, 118, 775, 205)).resize((132, 62), RESAMPLE)
    # 按亮度只保留浅色纹线，避免把原图的矩形底色一起叠上去。
    mask = cloud.convert("L").point(lambda value: max(0, min(40, int((value - 92) * 0.45))))
    cloud.putalpha(mask)
    image.alpha_composite(cloud, (size[0] - 147, size[1] - 80))
    for y in lines:
        rule(image, y)
    save(image, name)


def button(name, size, primary=False):
    image = surface(size, 0.95 if primary else 0.62)
    frame(image, primary)
    draw = ImageDraw.Draw(image)
    draw.line((12, 6, size[0] - 13, 6), fill="#d0c295" if primary else "#657b68")
    save(image, name)


def main():
    image = surface((1184, 608), 0.5, 0.35)
    frame(image, True)
    draw = ImageDraw.Draw(image)
    draw.line((678, 20, 678, 588), fill="#64725c")
    draw.line((679, 20, 679, 588), fill="#152823")
    save(image, "popup-frame")
    for name, size in (
        ("popup-equipment", (432, 242)), ("popup-safe", (200, 320)),
        ("popup-battle", (432, 92)), ("popup-bag", (480, 230)),
        ("popup-backpack", (152, 174)),
        ("popup-source", (480, 576)),
    ):
        image = surface(size, 0.45, 0.17)
        draw = ImageDraw.Draw(image)
        draw.line((12, 39, size[0] - 13, 39), fill="#526456")
        save(image, name)
    button("button-square", (44, 44))
    button("button-close", (144, 44))
    panel("carry-panel", (294, 524), (46, 274, 378))
    panel("bag-panel", (460, 524), (46, 390))
    panel("source-panel", (480, 524), (45, 472))
    for name, size, primary in (
        ("button-action", (134, 54), False),
        ("button-cancel", (108, 54), False),
        ("button-confirm", (226, 54), True),
        ("button-primary", (238, 54), True),
        ("button-rotate", (56, 54), False),
        ("button-page", (64, 38), False),
        ("tab", (100, 28), False),
        ("tab-wide", (124, 28), False),
        ("button-back", (144, 40), False),
    ):
        button(name, size, primary)
    # 横向条带只沿水平方向延展，避免饰纹被拉高。
    for name, size in (("header-band", (1280, 64)), ("footer-band", (1280, 92))):
        image = surface(size, 0.46, 0.55)
        draw = ImageDraw.Draw(image)
        edge = size[1] - 1 if name == "header-band" else 0
        draw.line((0, edge, size[0], edge), fill="#6d7860")
        save(image, name)
    print("仓库面板、按钮与条带已生成。")


if __name__ == "__main__":
    main()
