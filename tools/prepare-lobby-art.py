"""将用户确认的大厅原画整理为游戏资源，不改动原图。"""

import argparse
import json
import uuid
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps
import numpy as np


def save_texture(image, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)
    meta = path.with_suffix(path.suffix + ".meta")
    data = json.loads(meta.read_text(encoding="utf-8")) if meta.exists() else {"uuid": str(uuid.uuid4())}
    data["importer"] = {
        "textureType": 2,
        "sRGB": True,
        "premultiplyAlpha": True,
        "generateMipmap": False,
    }
    meta.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def plaque(size):
    scale = 4
    width, height = size
    image = Image.new("RGBA", (width * scale, height * scale))
    draw = ImageDraw.Draw(image)
    for inset, fill in [(0, "#282e2b"), (1, "#ad8951"), (2, "#f2d89c"), (4, "#6a5b3c"), (5, "#263b37")]:
        x, y = inset * scale, inset * scale
        right, bottom = (width - inset) * scale - 1, (height - inset) * scale - 1
        tip = 13 * scale
        draw.polygon([(x + tip, y), (right - tip, y), (right, height * scale // 2),
                      (right - tip, bottom), (x + tip, bottom), (x, height * scale // 2)], fill=fill)
    for x in [12, width - 12]:
        y = height // 2
        draw.polygon([(x * scale, (y - 2) * scale), ((x + 2) * scale, y * scale),
                      (x * scale, (y + 2) * scale), ((x - 2) * scale, y * scale)], fill="#d7b873")
    return image.resize(size, Image.Resampling.LANCZOS)


def main():
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument("background", nargs="?", type=Path,
                        default=root / "art/reference/lobby/courtyard-background.png")
    parser.add_argument("--buildings", type=Path, default=root / "art/reference/lobby/building-sheet.png")
    args = parser.parse_args()
    texture = root / "assets/ui/texture/lobby"
    atlas = root / "assets/ui/atlas/module/lobby"
    # 背景只取原始颜色，去掉源文件误带的半透明，避免天空和地面发灰。
    source = Image.open(args.background).convert("RGB")
    save_texture(ImageOps.fit(source, (1920, 1080), method=Image.Resampling.LANCZOS),
                 texture / "lobby-courtyard.png")
    sheet = Image.open(args.buildings).convert("RGBA")
    if sheet.size != (2752, 1536):
        raise ValueError("建筑图尺寸应为 2752x1536，需重新核对六座建筑的分离区域。")
    alpha = sheet.getchannel("A")
    # 按透明轮廓分离连通主体，避免矩形裁切误带相邻建筑的屋檐。
    binary = alpha.point(lambda value: 255 if value > 8 else 0)
    seeds = {
        "alchemy": (450, 600), "realm": (1350, 500), "library": (2350, 600),
        "forge": (450, 1200), "warehouse": (1350, 1200), "market": (2350, 1200),
    }
    preview = Image.new("RGBA", (1152, 768), "#b7c8bb")
    for index, (name, seed) in enumerate(seeds.items()):
        filled = binary.copy()
        ImageDraw.floodfill(filled, seed, 128)
        mask = filled.point(lambda value: 255 if value == 128 else 0)
        if not mask.getbbox():
            raise ValueError(f"{name} 未找到透明轮廓。")
        # 只扩展轮廓两像素以保留抗锯齿，不按 RGB 去黑，不损伤烟雾与门内光效。
        mask = mask.filter(ImageFilter.MaxFilter(5))
        pixels = np.array(sheet)
        pixels[:, :, 3] = np.where(np.array(mask) > 0,
                                  np.minimum(np.array(alpha, dtype=np.float32) * 255 / 252, 255), 0)
        building = Image.fromarray(pixels).crop(mask.getbbox())
        building.thumbnail((768, 768), Image.Resampling.LANCZOS)
        building = ImageOps.expand(building, 4)
        save_texture(building, texture / f"building-{name}.png")
        tile = building.copy()
        tile.thumbnail((360, 340), Image.Resampling.LANCZOS)
        x, y = index % 3 * 384 + (384 - tile.width) // 2, index // 3 * 384 + 340 - tile.height
        preview.alpha_composite(tile, (x, y))
        print(f"{name}: {building.width}x{building.height}")
    export = root / "output/design/lobby/buildings-processed.png"
    export.parent.mkdir(parents=True, exist_ok=True)
    preview.convert("RGB").save(export)
    shadow = Image.new("RGBA", (512, 96))
    ImageDraw.Draw(shadow).ellipse((28, 24, 484, 72), fill=(34, 43, 33, 76))
    save_texture(shadow.filter(ImageFilter.GaussianBlur(12)), atlas / "building-shadow.png")
    # 控件素材首次生成后沿用现有资源，重新处理场景不会改动头像。
    for name, size in [("facility-nameplate", (152, 40)), ("hud-strip", (232, 62)),
                       ("icon-button", (64, 64))]:
        if not (atlas / f"{name}.png").exists():
            save_texture(plaque(size), atlas / f"{name}.png")
    if not (texture / "settings-panel.png").exists():
        save_texture(plaque((520, 352)), texture / "settings-panel.png")
    print("已输出不透明背景、六座独立透明建筑与落地阴影；原图保持不变。")


if __name__ == "__main__":
    main()
