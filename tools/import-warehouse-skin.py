"""裁切用户确认的青玉仓库图集，保留透明轮廓并输出运行资源与预览。"""

import argparse
import json
import shutil
import uuid
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFont


ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "assets/ui/atlas/module/warehouse/jade"
OUTPUT = ROOT / "output/design/warehouse/jade"
SOURCE = ROOT / "art/reference/warehouse/warehouse-ui-sheet.png"
RESAMPLE = Image.Resampling.LANCZOS

# 范围对应原图上的独立零件，不按等分网格裁切，避免切断超出分区的边框。
ASSETS = [
    ("panel", (200, 40, 575, 414), (128, 128), [20, 20, 20, 20, 0]),
    ("title-bar", (790, 177, 1317, 281), (256, 44), [8, 24, 8, 24, 0]),
    ("cell", (1554, 66, 1883, 391), (108, 108), None),
    ("avatar-frame", (2181, 48, 2554, 411), (192, 192), None),
    ("hint-weapon", (290, 435, 503, 784), (96, 144), None),
    ("hint-armor", (877, 447, 1236, 778), (128, 128), None),
    ("hint-accessory", (1577, 473, 1858, 762), (128, 128), None),
    ("hint-container", (2228, 456, 2521, 768), (128, 128), None),
    ("page-normal", (151, 863, 625, 1043), (128, 64), [12, 12, 12, 12, 0]),
    ("page-selected", (814, 863, 1292, 1043), (128, 64), [12, 12, 12, 12, 0]),
    ("lock", (1594, 817, 1841, 1092), (64, 72), None),
    ("button-square", (2230, 815, 2525, 1088), (64, 64), [12, 12, 12, 12, 0]),
    ("arrow-up", (268, 1213, 506, 1430), (48, 48), None),
    ("arrow-down", (931, 1213, 1174, 1430), (48, 48), None),
    ("close", (1595, 1208, 1840, 1448), (48, 48), None),
    ("detail-panel", (2185, 1138, 2568, 1496), (128, 128), [18, 18, 18, 18, 0]),
]


def extract(source, bounds):
    data = np.array(source.crop(bounds))
    alpha = data[:, :, 3].astype(np.float32)
    # 清除透明区残存的光晕，仅在主体边缘保留抗锯齿。
    data[:, :, 3] = np.clip((alpha - 18) * 255 / (254 - 18), 0, 255).astype(np.uint8)
    opaque = data[:, :, 3] >= 128
    ys, xs = np.where(opaque)
    if not len(xs):
        raise ValueError(f"裁切范围内没有有效素材：{bounds}")
    rect = (max(0, xs.min() - 2), max(0, ys.min() - 2),
            min(data.shape[1], xs.max() + 3), min(data.shape[0], ys.max() + 3))
    data[data[:, :, 3] == 0, :3] = 0
    return Image.fromarray(data).crop(rect), rect


def prepare(image, name, size):
    if name.startswith("hint-"):
        alpha = image.getchannel("A")
        gray = ImageEnhance.Contrast(image.convert("L")).enhance(0.65)
        image = Image.merge("RGBA", (gray, gray, gray, alpha))
        image = ImageEnhance.Brightness(image).enhance(0.82)
    elif name == "cell":
        # 压暗空格和边框，避免铺满仓库后与品质框争夺视觉。
        image = ImageEnhance.Color(image).enhance(0.7)
        image = ImageEnhance.Brightness(image).enhance(0.56)
    elif name in ("panel", "detail-panel", "button-square", "page-normal"):
        image = ImageEnhance.Brightness(image).enhance(0.82)
    elif name == "page-selected":
        image = ImageEnhance.Color(image).enhance(0.72)
        image = ImageEnhance.Brightness(image).enhance(0.92)
    if name in ("panel", "detail-panel", "cell", "title-bar", "page-normal",
                "page-selected", "button-square"):
        return image.resize(size, RESAMPLE)
    image.thumbnail((size[0] - 4, size[1] - 4), RESAMPLE)
    canvas = Image.new("RGBA", size)
    canvas.alpha_composite(image, ((size[0] - image.width) // 2, (size[1] - image.height) // 2))
    return canvas


def save(image, name, grid):
    path = TARGET / f"{name}.png"
    image.save(path, optimize=True)
    meta = path.with_suffix(".png.meta")
    data = json.loads(meta.read_text(encoding="utf-8")) if meta.exists() else {"uuid": str(uuid.uuid4())}
    data["importer"] = {
        "textureType": 2, "sRGB": True, "premultiplyAlpha": True,
        "generateMipmap": False,
    }
    if grid:
        data["importer"]["sizeGrid"] = grid
    meta.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def previews(images):
    clean = Image.new("RGBA", (2048, 2048))
    check = Image.new("RGBA", clean.size, "#303a3d")
    draw = ImageDraw.Draw(check)
    for y in range(0, 2048, 32):
        for x in range(0, 2048, 32):
            if (x // 32 + y // 32) % 2:
                draw.rectangle((x, y, x + 31, y + 31), fill="#374245")
    font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 24)
    for i, (name, image) in enumerate(images.items()):
        display = image.resize((image.width * 2, image.height * 2), RESAMPLE)
        display.thumbnail((420, 384), RESAMPLE)
        x = i % 4 * 512 + (512 - display.width) // 2
        y = i // 4 * 512 + (448 - display.height) // 2
        clean.alpha_composite(display, (x, y))
        check.alpha_composite(display, (x, y))
        draw.text((i % 4 * 512 + 24, i // 4 * 512 + 460), name, font=font, fill="#dfd6bf")
    clean.save(OUTPUT / "warehouse-ui-clean.png", optimize=True)
    check.convert("RGB").save(OUTPUT / "warehouse-ui-preview.jpg", quality=93)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=SOURCE)
    args = parser.parse_args()
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    if args.source.resolve() != SOURCE.resolve():
        shutil.copy2(args.source, SOURCE)
    source = Image.open(SOURCE).convert("RGBA")
    if source.size != (2752, 1536):
        raise ValueError("此裁切方案只适用于已确认的 2752×1536 原图")
    TARGET.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    images, manifest = {}, []
    for name, bounds, size, grid in ASSETS:
        image, rect = extract(source, bounds)
        image = prepare(image, name, size)
        pixels = np.array(image)
        pixels[pixels[:, :, 3] == 0, :3] = 0
        image = Image.fromarray(pixels)
        save(image, name, grid)
        images[name] = image
        manifest.append({"name": name, "sourceBounds": bounds, "trimBounds": [int(v) for v in rect],
                         "size": size, "sizeGrid": grid})
    (OUTPUT / "asset-manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    previews(images)
    with zipfile.ZipFile(OUTPUT / "warehouse-ui-assets.zip", "w", zipfile.ZIP_DEFLATED) as archive:
        for name in images:
            archive.write(TARGET / f"{name}.png", f"{name}.png")
        archive.write(OUTPUT / "asset-manifest.json", "asset-manifest.json")
    print(f"已导出 {len(images)} 张透明素材：{TARGET}")


if __name__ == "__main__":
    main()
