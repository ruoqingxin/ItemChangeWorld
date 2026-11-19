"""将用户确认的青玉界面原画切图并输出大厅运行资源。"""

import argparse
import json
import uuid
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ATLAS = ROOT / "assets/ui/atlas/module/lobby"
REFERENCE = ROOT / "art/reference/lobby"
RESAMPLE = Image.Resampling.LANCZOS


def save_texture(image, name):
    target = ATLAS / f"{name}.png"
    image.save(target, optimize=True)
    meta = target.with_suffix(".png.meta")
    data = json.loads(meta.read_text(encoding="utf-8")) if meta.exists() else {"uuid": str(uuid.uuid4())}
    data["importer"] = {
        "textureType": 2,
        "sRGB": True,
        "premultiplyAlpha": True,
        "generateMipmap": False,
    }
    meta.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def cut(sheet, region):
    image = sheet.crop(region)
    alpha = image.getchannel("A")
    mask = alpha.point(lambda value: 255 if value > 24 else 0)
    box = mask.getbbox()
    if box is None:
        raise ValueError("切图区域没有找到主体。")
    box = (max(0, box[0] - 4), max(0, box[1] - 4),
           min(image.width, box[2] + 4), min(image.height, box[3] + 4))
    # 保留主体及抗锯齿，移除透明区的微弱残留，不按颜色抠图。
    edge = np.asarray(mask.filter(ImageFilter.MaxFilter(9)))
    pixels = np.array(image)
    pixels[:, :, 3] = np.where(edge > 0, np.minimum(
        pixels[:, :, 3].astype(np.float32) * 255 / 254, 255), 0).astype(np.uint8)
    return Image.fromarray(pixels).crop(box)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("sheet", nargs="?", type=Path, default=REFERENCE / "interface-sheet.png")
    args = parser.parse_args()
    sheet = Image.open(args.sheet).convert("RGBA")
    if sheet.size != (2752, 1536):
        raise ValueError("界面原画应为 2752x1536，尺寸变化时需重新核对切图区域。")
    ATLAS.mkdir(parents=True, exist_ok=True)
    regions = {
        "avatar-frame": ((45, 75, 475, 505), (304, 312)),
        "player-info-strip": ((530, 150, 1760, 455), (808, 216)),
        "currency-strip": ((1780, 160, 2700, 430), (832, 192)),
        "facility-nameplate": ((70, 550, 900, 795), (608, 160)),
        "notice-strip": ((40, 900, 1930, 1130), (1840, 160)),
        "icon-button": ((1960, 850, 2340, 1170), (192, 192)),
        "wish": ((90, 1230, 360, 1470), (128, 128)),
        "settings": ((360, 1220, 600, 1470), (120, 120)),
    }
    for name, (region, size) in regions.items():
        image = cut(sheet, region).resize(size, RESAMPLE)
        save_texture(image, name)
        print(f"{name}: {size[0]}x{size[1]}")

    # 头像原图单独留存，去掉旧边框后与新的独立头像框组合。
    portrait = Image.open(REFERENCE / "player-portrait-source.png").convert("RGBA").crop((6, 6, 138, 138))
    mask = Image.new("L", portrait.size)
    ImageDraw.Draw(mask).ellipse((0, 0, portrait.width - 1, portrait.height - 1), fill=255)
    portrait.putalpha(mask)
    save_texture(portrait.resize((256, 256), RESAMPLE), "player-portrait")
    print("已更新大厅界面素材，既有资源 UUID 保持不变。")


if __name__ == "__main__":
    main()
