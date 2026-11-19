"""用当前大厅与用户提供的界面原画合成预览，不修改运行资源。"""

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
ASSETS = ROOT / "assets"
FONT = Path("C:/Windows/Fonts/simkai.ttf")
RESAMPLE = Image.Resampling.LANCZOS
FACILITIES = ("alchemy", "forge", "warehouse", "library", "realm", "market")


def cut_assets(source):
    sheet = Image.open(source).convert("RGBA")
    if sheet.size != (2752, 1536):
        raise ValueError("原画尺寸改变，需要重新核对切图区域。")
    regions = {
        "avatar-frame": (45, 75, 475, 505),
        "player-strip": (530, 150, 1760, 455),
        "currency-strip": (1780, 160, 2700, 430),
        "nameplate": (70, 550, 900, 795),
        "nameplate-highlight": (950, 550, 1790, 795),
        "nameplate-disabled": (1850, 550, 2700, 795),
        "notice": (40, 900, 1930, 1130),
        "button": (1960, 850, 2340, 1170),
        "button-pressed": (2360, 850, 2720, 1170),
        "wish": (90, 1230, 360, 1470),
        "settings": (360, 1220, 600, 1470),
    }
    result = {}
    for name, region in regions.items():
        image = sheet.crop(region)
        alpha = image.getchannel("A")
        mask = alpha.point(lambda value: 255 if value > 24 else 0)
        box = mask.getbbox()
        if box is None:
            raise ValueError(f"{name} 没有找到主体。")
        box = (max(0, box[0] - 4), max(0, box[1] - 4),
               min(image.width, box[2] + 4), min(image.height, box[3] + 4))
        # 保留原有抗锯齿和主体透明度，清理阈值之外的导出残留。
        edge = np.asarray(mask.filter(ImageFilter.MaxFilter(9)))
        pixels = np.array(image)
        pixels[:, :, 3] = np.where(edge > 0, np.minimum(
            pixels[:, :, 3].astype(np.float32) * 255 / 254, 255), 0).astype(np.uint8)
        image = Image.fromarray(pixels).crop(box)
        image.save(HERE / f"{name}.png")
        result[name] = image
        print(f"{name}: {image.width}x{image.height}")
    return result


def render(slices, width, height, output):
    # 与原生横屏适配保持相同设计尺寸，按当前预制体中的位置计算。
    stage_width = max(1280, width / height * 720)
    stage_height = max(720, height / width * 1280)
    factor = width / stage_width
    background = Image.open(ASSETS / "ui/texture/lobby/lobby-courtyard.png").convert("RGBA")
    canvas = ImageOps.fit(background, (width, height), method=RESAMPLE)
    nodes = {}

    def index(node):
        nodes[node.get("name")] = node
        for child in node.get("_$child", []):
            index(child)

    prefab = json.loads((ASSETS / "ui/prefab/module/lobby/LobbyView.lh").read_text(encoding="utf-8"))
    index(prefab)

    def paste(image, x, y, w, h):
        rect = tuple(round(v * factor) for v in (x, y, w, h))
        canvas.alpha_composite(image.resize((rect[2], rect[3]), RESAMPLE), rect[:2])

    def text(value, x, y, size, color="#fff0ce", anchor="mm"):
        draw = ImageDraw.Draw(canvas)
        font = ImageFont.truetype(str(FONT), round(size * factor))
        draw.text((round(x * factor), round(y * factor)), value, font=font, fill=color,
                  anchor=anchor, stroke_width=max(1, round(factor / 2)), stroke_fill=(29, 55, 44, 140))

    scale = min(1.08, (stage_width - 96) / 1184, (stage_height - 112) / 608)
    spread = min((stage_width - 96) / 1184, stage_height / 720 * 1.15)
    for name in FACILITIES:
        button = nodes[f"btn_{name}"]
        artwork = nodes[f"box_{name}_art"]
        art_scale = artwork["scaleX"] * scale
        center = stage_width / 2 + (button["x"] + button["width"] / 2 - 640) * spread
        bottom = stage_height * (button["y"] + button["height"]) / 720
        w, h = artwork["width"] * art_scale, artwork["height"] * art_scale
        x, y = center - w / 2, bottom - h - 42
        for child in artwork["_$child"]:
            image = Image.open(ASSETS / child["src"]).convert("RGBA")
            paste(image, x + child.get("x", 0) * art_scale, y + child.get("y", 0) * art_scale,
                  child["width"] * art_scale, child["height"] * art_scale)
        paste(slices["nameplate"], center - 76, bottom - 40, 152, 40)
        text(nodes[f"txt_{name}"]["text"], center, bottom - 20, 23)

    # 头像、信息底板和文本分别叠加；示意信息不写入游戏数据。
    paste(slices["player-strip"], 56, 20, 238, 60)
    portrait = Image.open(ASSETS / "ui/atlas/module/lobby/player-portrait.png").convert("RGBA")
    portrait = portrait.crop((6, 6, 138, 138))
    mask = Image.new("L", portrait.size)
    ImageDraw.Draw(mask).ellipse((0, 0, portrait.width - 1, portrait.height - 1), fill=255)
    portrait.putalpha(mask)
    paste(portrait, 22, 17, 64, 64)
    paste(slices["avatar-frame"], 16, 11, 76, 78)
    text("林澈", 112, 39, 27, anchor="lm")
    text("炼气一层", 113, 63, 16, color="#d5dfc8", anchor="lm")

    currency_x = stage_width - 306
    paste(slices["currency-strip"], currency_x, 21, 224, 54)
    paste(slices["wish"], currency_x + 9, 29, 37, 37)
    text("愿力", currency_x + 80, 48, 20, anchor="lm")
    text("1,280", currency_x + 200, 48, 22, anchor="rm")
    paste(slices["button"], stage_width - 70, 18, 54, 54)
    paste(slices["settings"], stage_width - 58, 30, 30, 30)

    canvas.convert("RGB").save(output, optimize=True)
    print(output)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("sheet", type=Path)
    args = parser.parse_args()
    HERE.mkdir(parents=True, exist_ok=True)
    slices = cut_assets(args.sheet)
    render(slices, 1920, 1080, HERE / "lobby-ui-preview-1920x1080.png")
    render(slices, 1688, 780, HERE / "lobby-ui-preview-mobile.png")


if __name__ == "__main__":
    main()
