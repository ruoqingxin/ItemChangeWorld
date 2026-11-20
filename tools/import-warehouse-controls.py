"""裁切已确认的银灰控件与详情边框，去除光晕并生成精灵资源。"""

import argparse
import json
import shutil
import uuid
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFont


ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "assets/ui/atlas/module/warehouse/graphite"
OUTPUT = ROOT / "output/design/warehouse/graphite"
REFERENCE = ROOT / "art/reference/warehouse"
RESAMPLE = Image.Resampling.LANCZOS
ASSETS = [
    ("button-normal", (125, 173, 680, 340), (160, 48), [6, 38, 16, 38, 0]),
    ("button-pressed", (805, 173, 1360, 340), (160, 48), [6, 38, 16, 38, 0]),
    ("button-disabled", (1485, 173, 2045, 340), (160, 48), [6, 38, 16, 38, 0]),
    ("square-normal", (2278, 117, 2551, 393), (64, 64), [8, 18, 20, 18, 0]),
    ("square-pressed", (274, 502, 547, 777), (64, 64), [8, 18, 20, 18, 0]),
    ("square-disabled", (947, 502, 1221, 777), (64, 64), [8, 18, 20, 18, 0]),
    ("arrow-left", (1666, 528, 1819, 766), (64, 64), None),
    ("arrow-right", (2346, 528, 2500, 766), (64, 64), None),
    ("scroll-track", (386, 873, 433, 1158), (16, 128), [8, 4, 8, 4, 0]),
    ("scroll-normal", (1029, 888, 1125, 1136), (24, 72), [8, 6, 8, 6, 0]),
    ("scroll-pressed", (1698, 888, 1797, 1136), (24, 72), [8, 6, 8, 6, 0]),
    ("page-normal", (2229, 907, 2583, 1122), (120, 80), [10, 12, 10, 12, 0]),
    ("page-selected", (234, 1233, 590, 1449), (120, 80), [10, 12, 10, 12, 0]),
    ("page-locked", (905, 1233, 1265, 1449), (120, 80), [10, 12, 10, 12, 0]),
    ("close", (1630, 1247, 1848, 1443), (64, 64), None),
    ("sell", (2278, 1231, 2500, 1455), (64, 64), None),
]


def clean(image):
    pixels = np.array(image.convert("RGBA"))
    alpha = pixels[:, :, 3].astype(np.float32)
    # 外围灰雾只有少量不透明度；重新映射透明通道，保留主体抗锯齿。
    pixels[:, :, 3] = np.clip((alpha - 24) * 255 / 230, 0, 255).astype(np.uint8)
    pixels[pixels[:, :, 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def trim(image):
    pixels = np.array(image)
    ys, xs = np.where(pixels[:, :, 3] > 160)
    if not len(xs):
        raise ValueError("裁切范围没有有效主体")
    return image.crop((max(0, int(xs.min()) - 1), max(0, int(ys.min()) - 1),
                       min(image.width, int(xs.max()) + 2), min(image.height, int(ys.max()) + 2)))


def unornamented(image):
    # 小页签只保留上半部边框并镜像到下半部，避免底部云纹挤占数字和锁。
    result = image.copy()
    half = image.height // 2
    top = image.crop((0, 0, image.width, half))
    result.paste(top.transpose(Image.Transpose.FLIP_TOP_BOTTOM), (0, image.height - half))
    return result


def compact_frame(image, corner=96):
    # 先压缩空白中心，再缩边角，避免整张大图等比缩小把细线压成半透明细丝。
    result = Image.new("RGBA", (128, 128))
    source_x = [0, corner, image.width - corner, image.width]
    source_y = [0, corner, image.height - corner, image.height]
    target = [0, 20, 108, 128]
    for row in range(3):
        for column in range(3):
            if row == column == 1:
                continue
            piece = image.crop((source_x[column], source_y[row],
                                source_x[column + 1], source_y[row + 1]))
            piece = piece.resize((target[column + 1] - target[column],
                                  target[row + 1] - target[row]), RESAMPLE)
            result.alpha_composite(piece, (target[column], target[row]))
    return result


def section_panel(image):
    source = trim(clean(image))
    # 按边框真实透明轮廓填充内部，保留切角，避免矩形底色露出边角。
    alpha = np.array(source)[:, :, 3] > 96
    horizontal = np.maximum.accumulate(alpha, axis=1) & np.maximum.accumulate(alpha[:, ::-1], axis=1)[:, ::-1]
    vertical = np.maximum.accumulate(alpha, axis=0) & np.maximum.accumulate(alpha[::-1], axis=0)[::-1]
    fill = np.zeros((source.height, source.width, 4), dtype=np.uint8)
    fill[horizontal & vertical] = (25, 28, 30, 255)
    frame = compact_frame(source, corner=144)
    frame = retone(frame, (29, 31, 32), (139, 137, 126), threshold=52, spread=130, texture=0.02)
    panel = compact_frame(Image.fromarray(fill), corner=144)
    panel.paste((25, 28, 30, 255), (20, 20, 108, 108))
    panel.alpha_composite(frame)
    return panel


def retone(image, body, edge, threshold=72, spread=100, texture=0.05):
    pixels = np.array(image.convert("RGBA"))
    luminance = np.array(image.convert("L"), dtype=np.float32)
    weight = np.clip((luminance - threshold) / spread, 0, 1)[:, :, None]
    # 压低底纹反差，保留原画轮廓、细边和必要的抗锯齿。
    base = np.array(body, dtype=np.float32) + (luminance[:, :, None] - 55) * texture
    pixels[:, :, :3] = np.clip(base * (1 - weight) + np.array(edge) * weight, 0, 255).astype(np.uint8)
    return Image.fromarray(pixels)


def style_control(image, name):
    if name == "page-selected":
        return retone(image, (38, 34, 26), (193, 169, 114), threshold=68, spread=110)
    if name == "page-locked":
        return retone(image, (21, 24, 26), (60, 65, 64), spread=90)
    if name.endswith("-disabled"):
        return retone(image, (25, 28, 29), (73, 78, 75), spread=100)
    if name.startswith(("button-", "square-", "page-")):
        pressed = name.endswith("-pressed")
        return retone(image, (23, 26, 27) if pressed else (31, 34, 35),
                      (173, 165, 143) if pressed else (145, 145, 132), spread=115)
    if name == "scroll-track":
        return retone(image, (18, 21, 22), (67, 73, 71), spread=95)
    if name == "scroll-normal":
        return retone(image, (51, 56, 55), (136, 140, 129), spread=105)
    if name == "scroll-pressed":
        return retone(image, (68, 61, 43), (193, 169, 114), spread=105)
    # 小图标稍偏暖白，与正文和银边协调，避免冷白高光突兀。
    pixels = np.array(image)
    pixels[:, :, :3] = (pixels[:, :, :3].astype(np.float32) * [1, 0.98, 0.93]).astype(np.uint8)
    return Image.fromarray(pixels)


def save(image, name, grid=None):
    pixels = np.array(image)
    pixels[pixels[:, :, 3] == 0, :3] = 0
    image = Image.fromarray(pixels)
    file = TARGET / f"{name}.png"
    image.save(file, optimize=True)
    meta = file.with_suffix(".png.meta")
    data = json.loads(meta.read_text(encoding="utf-8")) if meta.exists() else {"uuid": str(uuid.uuid4())}
    data["importer"] = {"textureType": 2, "sRGB": True, "premultiplyAlpha": True,
                        "generateMipmap": False}
    if grid:
        data["importer"]["sizeGrid"] = grid
    meta.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return image


def preview(images):
    sheet = Image.new("RGBA", (1280, ((len(images) + 3) // 4) * 200), "#202326")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 17)
    for index, (name, image) in enumerate(images.items()):
        tile = image.copy()
        tile.thumbnail((220, 142), RESAMPLE)
        x, y = index % 4 * 320, index // 4 * 200
        sheet.alpha_composite(tile, (x + (320 - tile.width) // 2, y + (160 - tile.height) // 2))
        draw.text((x + 24, y + 170), name, font=font, fill="#e6e4df")
    sheet.convert("RGB").save(OUTPUT / "controls-preview.jpg", quality=94)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--detail", type=Path, required=True)
    parser.add_argument("--panel", type=Path, required=True)
    args = parser.parse_args()
    for directory in (TARGET, OUTPUT, REFERENCE):
        directory.mkdir(parents=True, exist_ok=True)
    folder_meta = TARGET.with_suffix(".meta")
    if not folder_meta.exists():
        folder_meta.write_text(json.dumps({"uuid": str(uuid.uuid4())}, indent=2) + "\n", encoding="utf-8")
    for source, name in [(args.source, "warehouse-controls-sheet.png"),
                         (args.detail, "warehouse-detail-frame.png"),
                         (args.panel, "warehouse-section-frame.png")]:
        destination = REFERENCE / name
        if source.resolve() != destination.resolve():
            shutil.copy2(source, destination)
    source = Image.open(REFERENCE / "warehouse-controls-sheet.png").convert("RGBA")
    if source.size != (2752, 1536):
        raise ValueError("控件裁切方案适用于已确认的 2752×1536 图片")
    images, manifest = {}, []
    for name, bounds, size, grid in ASSETS:
        image = trim(clean(source.crop(bounds)))
        if name.startswith("page-"):
            image = unornamented(image)
        image = style_control(image, name)
        if grid:
            image = image.resize(size, RESAMPLE)
        else:
            image.thumbnail((size[0] - 4, size[1] - 4), RESAMPLE)
            canvas = Image.new("RGBA", size)
            canvas.alpha_composite(image, ((size[0] - image.width) // 2, (size[1] - image.height) // 2))
            image = canvas
        images[name] = save(image, name, grid)
        manifest.append({"name": name, "sourceBounds": bounds, "size": size, "sizeGrid": grid})
    # 新通用切角银框仍使用原有尺寸与切片，所有分区共享一张图。
    panel = section_panel(Image.open(REFERENCE / "warehouse-section-frame.png").convert("RGBA"))
    images["panel"] = save(panel, "panel", [20, 20, 20, 20, 0])
    cell = Image.open(ROOT / "assets/ui/atlas/module/warehouse/jade/cell.png").convert("RGBA")
    cell = retone(cell, (21, 24, 26), (100, 107, 100), threshold=64, spread=70, texture=0.025)
    images["cell"] = save(cell, "cell")
    detail = Image.open(REFERENCE / "warehouse-detail-frame.png").convert("RGBA")
    frame = compact_frame(trim(clean(detail)))
    frame = retone(frame, (26, 29, 30), (150, 151, 138), threshold=44, spread=120)
    images["detail-frame"] = save(frame, "detail-frame", [20, 20, 20, 20, 0])
    # 底色与边框分开，详情浮层使用约九成不透明的黑底。
    images["detail-fill"] = save(Image.new("RGBA", (8, 8), (8, 10, 12, 228)), "detail-fill")
    lock = Image.open(ROOT / "assets/ui/atlas/module/warehouse/jade/lock.png").convert("RGBA")
    images["lock"] = save(ImageEnhance.Color(lock).enhance(0), "lock")
    for name in ("panel", "cell", "detail-frame", "detail-fill", "lock"):
        meta = json.loads((TARGET / f"{name}.png.meta").read_text(encoding="utf-8"))
        manifest.append({"name": name, "size": images[name].size,
                         "sizeGrid": meta["importer"].get("sizeGrid")})
    preview(images)
    (OUTPUT / "asset-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with zipfile.ZipFile(OUTPUT / "warehouse-controls.zip", "w", zipfile.ZIP_DEFLATED) as archive:
        for name in images:
            archive.write(TARGET / f"{name}.png", f"{name}.png")
        archive.write(OUTPUT / "asset-manifest.json", "asset-manifest.json")
    print(f"已处理 {len(images)} 张资源：{TARGET}")


if __name__ == "__main__":
    main()
