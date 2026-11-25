from __future__ import annotations

import json
import math
import shutil
import uuid
from pathlib import Path

import cv2
import numpy as np
from openpyxl import load_workbook
from PIL import Image, ImageDraw, ImageFont


ITEM_IDS = [121, 122, 123, 124, 125, 126]
NAMES = ["穿云枪", "精锻穿云枪", "百炼穿云枪", "凌云枪", "贯日枪", "九霄枪"]
SOURCE = Path(
    r"C:\Users\Administrator\Downloads\_cosres_apps-ai-tools_nextimage_storage_out_user_2682_1795583262945_97232d7fb8da431284387e1c301c515c.png"
)
PROJECT_ROOT = Path(r"E:\NowChange\ItemChangeWorld")
CONFIG_ROOT = Path(r"E:\NowChange\config")
REFERENCE_DIR = PROJECT_ROOT / "art" / "reference" / "equipment" / "chuan-yun-spear"
RUNTIME_DIR = PROJECT_ROOT / "assets" / "ui" / "atlas" / "module" / "equipment"
OUTPUT_DIR = PROJECT_ROOT / "output" / "equipment" / "chuan-yun-spear"
ITEM_BOOK = CONFIG_ROOT / "Datas" / "物品配置表.xlsx"
RUNTIME_SIZE = (196, 308)
MASTER_SIZE = (784, 1232)


def font(size: int):
    return ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", size)


def crop_cell(image: Image.Image, index: int) -> Image.Image:
    column, row = index % 3, index // 3
    left = round(column * image.width / 3)
    right = round((column + 1) * image.width / 3)
    top = round(row * image.height / 2)
    bottom = round((row + 1) * image.height / 2)
    cell = np.array(image.crop((left, top, right, bottom)).convert("RGBA"))
    alpha = cell[:, :, 3]
    # 合图含有半透明环境光，使用高透明度主体阈值去除黑灰、红蓝金背景光雾。
    keep = alpha >= 160
    count, labels, stats, _ = cv2.connectedComponentsWithStats(keep.astype(np.uint8), 8)
    component_sizes = stats[:, cv2.CC_STAT_AREA]
    keep_labels = {label for label in range(1, count) if component_sizes[label] >= 100}
    keep = np.isin(labels, list(keep_labels))
    cell[~keep, 0:3] = 0
    cell[:, :, 3] = np.where(keep, 255, 0).astype(np.uint8)
    result = Image.fromarray(cell, mode="RGBA")
    bbox = result.getchannel("A").getbbox()
    if bbox is None:
        raise RuntimeError(f"{ITEM_IDS[index]} 未找到有效主体")
    margin = 14
    return result.crop(
        (
            max(0, bbox[0] - margin),
            max(0, bbox[1] - margin),
            min(result.width, bbox[2] + margin),
            min(result.height, bbox[3] + margin),
        )
    )


def zero_transparent_rgb(image: Image.Image) -> Image.Image:
    pixels = np.array(image.convert("RGBA"))
    pixels[pixels[:, :, 3] == 0, :3] = 0
    return Image.fromarray(pixels, mode="RGBA")


def normalize(image: Image.Image, target_angle: float | None = None) -> tuple[Image.Image, Image.Image, float]:
    pixels = np.array(image.convert("RGBA"))
    alpha = pixels[:, :, 3]
    y, x = np.where(alpha > 8)
    if not len(x):
        raise RuntimeError("切图没有有效主体")
    _, axes = np.linalg.eigh(np.cov(np.stack([x, y])))
    direction = axes[:, -1]
    if direction[1] > 0:
        direction = -direction
    angle = math.degrees(math.atan2(direction[0], -direction[1]))
    padded = Image.new("RGBA", (image.width + 48, image.height + 48), (0, 0, 0, 0))
    padded.alpha_composite(image, (24, 24))
    if target_angle is None:
        rotated = padded
        applied_angle = 0.0
    else:
        applied_angle = angle - target_angle
        rotated = padded.rotate(applied_angle, resample=Image.Resampling.BICUBIC, expand=True)
    bbox = rotated.getchannel("A").getbbox()
    if bbox is None:
        raise RuntimeError("旋转后没有有效主体")
    rotated = rotated.crop((max(0, bbox[0] - 8), max(0, bbox[1] - 8), min(rotated.width, bbox[2] + 8), min(rotated.height, bbox[3] + 8)))
    # 以枪身主轴的中点定位，避免侧翼、流苏和光效把整件武器的视觉中心推偏。
    cropped_alpha = np.array(rotated.getchannel("A"), dtype=np.float32) / 255.0
    cy, cx = np.where(cropped_alpha > 0.03)
    points = np.column_stack((cx, cy)).astype(np.float32)
    center = points.mean(axis=0)
    _, axes = np.linalg.eigh(np.cov(points.T))
    body_axis = axes[:, -1]
    if np.dot(body_axis, direction) < 0:
        body_axis = -body_axis
    normal = np.array([-body_axis[1], body_axis[0]], dtype=np.float32)
    projections = (points - center) @ body_axis
    lateral = (points - center) @ normal
    axis_center = center + body_axis * ((projections.min() + projections.max()) * 0.5) + normal * np.median(lateral)
    scale = min((MASTER_SIZE[0] - 64) / rotated.width, (MASTER_SIZE[1] - 64) / rotated.height)
    resized = rotated.resize((round(rotated.width * scale), round(rotated.height * scale)), Image.Resampling.LANCZOS)
    master = Image.new("RGBA", MASTER_SIZE, (0, 0, 0, 0))
    scaled_axis_center = axis_center * scale
    paste_x = round(master.width * 0.5 - scaled_axis_center[0])
    paste_y = (master.height - resized.height) // 2
    master.alpha_composite(resized, (paste_x, paste_y))
    runtime = master.resize(RUNTIME_SIZE, Image.Resampling.LANCZOS)
    return zero_transparent_rgb(master), zero_transparent_rgb(runtime), applied_angle


def save_meta(path: Path):
    path.write_text(
        json.dumps(
            {
                "uuid": str(uuid.uuid4()),
                "importer": {"textureType": 2, "sRGB": True, "premultiplyAlpha": True},
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def update_item_config():
    workbook = load_workbook(ITEM_BOOK, data_only=False)
    sheet = workbook["item"]
    rows = {}
    for row in range(1, sheet.max_row + 1):
        item_id = sheet.cell(row, 2).value
        if item_id in ITEM_IDS:
            rows[item_id] = row
    if set(rows) != set(ITEM_IDS):
        raise RuntimeError(f"物品表缺少穿云枪 ID：{sorted(set(ITEM_IDS) - set(rows))}")
    for item_id in ITEM_IDS:
        sheet.cell(rows[item_id], 11).value = f"ui/atlas/module/equipment/icon_{item_id}.png"
    workbook.save(ITEM_BOOK)


def create_preview(icons: list[Image.Image]):
    result = Image.new("RGBA", (660, 660), (35, 35, 35, 255))
    draw = ImageDraw.Draw(result)
    for index, icon in enumerate(icons):
        x = (index % 3) * 220 + 12
        y = (index // 3) * 330 + 12
        result.alpha_composite(icon, (x, y))
        draw.text((x + 4, y + 312), f"ID {ITEM_IDS[index]}  {NAMES[index]}", font=font(14), fill="#f0f1ee")
    result.save(OUTPUT_DIR / "preview.png", "PNG", optimize=True)


def create_alpha_check(icons: list[Image.Image]):
    result = Image.new("RGBA", (660, 660), (242, 242, 238, 255))
    for index, icon in enumerate(icons):
        x = (index % 3) * 220 + 12
        y = (index // 3) * 330 + 12
        result.alpha_composite(icon, (x, y))
    result.save(OUTPUT_DIR / "alpha-check.png", "PNG", optimize=True)


def main():
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)
    REFERENCE_DIR.mkdir(parents=True, exist_ok=True)
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(SOURCE, REFERENCE_DIR / "source.png")
    image = Image.open(SOURCE).convert("RGBA")
    icons = []
    entries = []
    for index, item_id in enumerate(ITEM_IDS):
        source = crop_cell(image, index)
        # 保留可识别的斜向，但将倾角收窄，保证枪身纵向占位接近青钢剑和厚背刀。
        master, runtime, angle = normalize(source, target_angle=18)
        master_path = REFERENCE_DIR / f"icon_{item_id}.png"
        runtime_path = RUNTIME_DIR / f"icon_{item_id}.png"
        output_path = OUTPUT_DIR / f"icon_{item_id}.png"
        master.save(master_path, "PNG", optimize=True)
        runtime.save(runtime_path, "PNG", optimize=True)
        runtime.save(output_path, "PNG", optimize=True)
        save_meta(runtime_path.with_suffix(".png.meta"))
        shutil.copy2(runtime_path.with_suffix(".png.meta"), OUTPUT_DIR / f"icon_{item_id}.png.meta")
        bbox = runtime.getchannel("A").getbbox()
        if bbox is None or runtime.size != RUNTIME_SIZE:
            raise RuntimeError(f"{item_id} 运行图尺寸或主体为空")
        entries.append({
            "id": item_id,
            "name": NAMES[index],
            "sheet_cell": [index // 3, index % 3],
            "runtime_size": list(runtime.size),
            "alpha_bbox": list(bbox),
            "rotation_angle": round(angle, 2),
        })
        icons.append(runtime)
        print(f"{item_id}: runtime={runtime.size}, alpha_bbox={bbox}, angle={angle:.2f}")
    create_preview(icons)
    create_alpha_check(icons)
    (OUTPUT_DIR / "manifest.json").write_text(json.dumps({"source": str(SOURCE), "items": entries, "background": "transparent", "config_icon_column": "icon"}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    update_item_config()
    print(f"配置已更新：{ITEM_BOOK}")


if __name__ == "__main__":
    main()
