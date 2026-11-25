from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


ITEM_IDS = [115, 116, 117, 118, 119, 120]
SOURCE = Path(
    r"C:\Users\Administrator\Downloads\_cosres_apps-ai-tools_nextimage_storage_out_user_1795572176385_85ea8516555449bfa6b3a8bf1a9d7ded.png"
)
FALLBACK_SOURCE = Path(
    r"C:\Users\Administrator\Downloads\_cosres_apps-ai-tools_nextimage_storage_out_user_2682_1795572176385_85ea8516555449bfa6b3a8bf1a9d7ded.png"
)
PROJECT_ROOT = Path(r"E:\NowChange\ItemChangeWorld")
REFERENCE_DIR = PROJECT_ROOT / "art" / "reference" / "equipment" / "houbei-saber"
RUNTIME_DIR = PROJECT_ROOT / "assets" / "ui" / "atlas" / "module" / "equipment"
OUTPUT_DIR = PROJECT_ROOT / "output" / "equipment" / "houbei-saber"


def choose_source() -> Path:
    if SOURCE.exists():
        return SOURCE
    if FALLBACK_SOURCE.exists():
        return FALLBACK_SOURCE
    raise FileNotFoundError("找不到厚背刀合图")


def connected_components(alpha: np.ndarray, threshold: int = 8):
    mask = (alpha > threshold).astype(np.uint8)
    count, labels, stats, centers = cv2.connectedComponentsWithStats(mask, 8)
    entries = []
    for label in range(1, count):
        x, y, width, height, area = stats[label]
        if area >= 500:
            entries.append(
                {
                    "label": label,
                    "area": int(area),
                    "bbox": (int(x), int(y), int(width), int(height)),
                    "center": (float(centers[label][0]), float(centers[label][1])),
                }
            )
    return labels, entries


def choose_main_components(entries):
    if len(entries) < 6:
        raise RuntimeError(f"透明主体不足六个，实际找到 {len(entries)} 个")
    main = sorted(entries, key=lambda item: item["area"], reverse=True)[:6]
    by_y = sorted(main, key=lambda item: item["center"][1])
    top = sorted(by_y[:3], key=lambda item: item["center"][0])
    bottom = sorted(by_y[3:], key=lambda item: item["center"][0])
    main = top + bottom
    return main


def assign_components(labels, entries, main):
    centers = np.array([item["center"] for item in main], dtype=np.float32)
    assignments = {item["label"]: index for index, item in enumerate(main)}
    for entry in entries:
        if entry["label"] in assignments:
            continue
        point = np.array(entry["center"], dtype=np.float32)
        assignments[entry["label"]] = int(np.argmin(np.sum((centers - point) ** 2, axis=1)))
    return assignments


def save_meta(path: Path):
    meta = {
        "uuid": str(uuid.uuid4()),
        "importer": {
            "textureType": 2,
            "sRGB": True,
            "premultiplyAlpha": True,
        },
    }
    path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def make_canvas(cutout: Image.Image, size=(196, 308), padding=8, angle=20):
    # 合图中的刀身横向展开，统一旋转后适配装备区的 2×3 竖向实体格。
    cutout = cutout.rotate(angle, expand=True, resample=Image.Resampling.BICUBIC)
    alpha_bbox = cutout.getchannel("A").getbbox()
    if alpha_bbox:
        left = max(0, alpha_bbox[0] - padding)
        top = max(0, alpha_bbox[1] - padding)
        right = min(cutout.width, alpha_bbox[2] + padding)
        bottom = min(cutout.height, alpha_bbox[3] + padding)
        cutout = cutout.crop((left, top, right, bottom))
    available = (size[0] - padding * 2, size[1] - padding * 2)
    scale = min(available[0] / cutout.width, available[1] / cutout.height)
    scaled_size = (
        max(1, round(cutout.width * scale)),
        max(1, round(cutout.height * scale)),
    )
    scaled = cutout.resize(scaled_size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    offset = ((size[0] - scaled.width) // 2, (size[1] - scaled.height) // 2)
    canvas.alpha_composite(scaled, offset)
    return canvas


def main():
    source = choose_source()
    REFERENCE_DIR.mkdir(parents=True, exist_ok=True)
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    image = Image.open(source).convert("RGBA")
    rgba = np.array(image)
    alpha = rgba[:, :, 3]
    labels, entries = connected_components(alpha)
    main_components = choose_main_components(entries)
    assignments = assign_components(labels, entries, main_components)

    preview_items = []
    for index, item_id in enumerate(ITEM_IDS):
        mask = np.zeros(alpha.shape, dtype=np.uint8)
        for label, owner in assignments.items():
            if owner == index:
                mask[labels == label] = 255

        ys, xs = np.where(mask > 0)
        if len(xs) == 0:
            raise RuntimeError(f"物品 {item_id} 未找到有效像素")
        left, right = max(0, int(xs.min()) - 12), min(image.width, int(xs.max()) + 13)
        top, bottom = max(0, int(ys.min()) - 12), min(image.height, int(ys.max()) + 13)
        cut = image.crop((left, top, right, bottom))
        cut.putalpha(Image.fromarray(mask[top:bottom, left:right], mode="L"))

        master_path = REFERENCE_DIR / f"icon_{item_id}.png"
        cut.save(master_path, "PNG", optimize=True)
        runtime_path = RUNTIME_DIR / f"icon_{item_id}.png"
        runtime = make_canvas(cut)
        runtime.save(runtime_path, "PNG", optimize=True)
        save_meta(runtime_path.with_suffix(".png.meta"))

        preview_items.append((runtime, index % 3 * 220, index // 3 * 330))
        print(
            f"{item_id}: source_bbox=({left},{top},{right-left},{bottom-top}) "
            f"runtime={runtime.size} alpha_bbox={runtime.getchannel('A').getbbox()}"
        )

    preview = Image.new("RGBA", (660, 660), (35, 35, 35, 255))
    for item, x, y in preview_items:
        preview.alpha_composite(item, (x + 12, y + 12))
    preview.save(OUTPUT_DIR / "preview.png", "PNG", optimize=True)
    (OUTPUT_DIR / "manifest.json").write_text(
        json.dumps(
            {
                "source": str(source),
                "items": ITEM_IDS,
                "runtime_dir": str(RUNTIME_DIR),
                "reference_dir": str(REFERENCE_DIR),
                "background": "transparent",
                "importer": "textureType=2, sRGB=true, premultiplyAlpha=true",
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
