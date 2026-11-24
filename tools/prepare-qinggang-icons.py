"""整理六张独立青钢剑原画，导出透明素材及实际尺寸预览。"""

import argparse
import json
import math
import shutil
import uuid
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets/ui/atlas/module/equipment"
OUTPUT = ROOT / "output/equipment/qinggang"
NAMES = ["青钢剑", "精锻青钢剑", "百炼青钢剑", "青罡剑", "碧霄剑", "斩尘剑"]
QUALITIES = ["普通", "优秀", "精良", "稀有", "史诗", "传说"]
COLORS = ["#d2d6d9", "#77c985", "#78baff", "#be93f1", "#f2c65c", "#f1807d"]
RUNTIME_SIZE = (196, 308)
MASTER_SIZE = (784, 1232)
RESAMPLE = Image.Resampling.LANCZOS


def font(size):
    return ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", size)


def tight(image, margin=4):
    alpha = np.asarray(image)[:, :, 3]
    y, x = np.where(alpha > 8)
    if not len(x):
        raise ValueError("切图没有有效主体")
    return image.crop((
        max(0, int(x.min()) - margin), max(0, int(y.min()) - margin),
        min(image.width, int(x.max()) + margin + 1),
        min(image.height, int(y.max()) + margin + 1),
    ))


def clean(image):
    pixels = np.array(image.convert("RGBA"))
    alpha = pixels[:, :, 3].astype(np.float32)
    # 原画已有透明通道，清除低透明度杂点，保留轮廓的柔和过渡。
    pixels[:, :, 3] = np.clip((alpha - 8) * 255 / 245, 0, 255).astype(np.uint8)
    subject = Image.fromarray((alpha > 32).astype(np.uint8) * 255)
    nearby = np.array(subject.filter(ImageFilter.MaxFilter(5))) > 0
    pixels[~nearby] = 0
    pixels[pixels[:, :, 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def finish_bottom_corner(image):
    pixels = np.array(image)
    alpha = pixels[:, :, 3]
    contacts = np.where(alpha[-1] > 128)[0]
    if not len(contacts):
        return image, 0
    if np.any(np.diff(contacts) != 1):
        raise ValueError("触底区域不连续，需要单独检查原画")
    height = image.height
    ys = np.arange(height - 8, height)
    edges = []
    for y in ys:
        xs = np.where(alpha[y] > 128)[0]
        edges.append((xs.min(), xs.max()))
    left_fit = np.polyfit(ys, np.array(edges)[:, 0], 1)
    right_fit = np.polyfit(ys, np.array(edges)[:, 1], 1)
    if left_fit[0] <= right_fit[0]:
        raise ValueError("触底形状没有收尖，不能按小角补齐")
    tip_y = (right_fit[1] - left_fit[1]) / (left_fit[0] - right_fit[0])
    extra = math.ceil(tip_y - height) + 3
    if not 1 <= extra <= 32:
        raise ValueError("原画缺失范围过大，不能按小角补齐")
    result = np.pad(pixels, ((0, extra), (0, 0), (0, 0)))
    old_left, old_right = contacts.min(), contacts.max()
    original_x = np.arange(old_left, old_right + 1)
    # 仅延续已被截断的小角，颜色取自原画末行，不改动现存像素。
    samples = [-0.375, -0.125, 0.125, 0.375]
    for y in range(height, height + extra):
        left, right = np.polyval(left_fit, y), np.polyval(right_fit, y)
        if left > right + 1:
            continue
        lo, hi = max(0, math.floor(left) - 1), min(image.width, math.ceil(right) + 2)
        xs = np.arange(lo, hi)
        coverage = np.zeros(len(xs))
        for dy in samples:
            l, r = np.polyval(left_fit, y + dy), np.polyval(right_fit, y + dy)
            for dx in samples:
                coverage += ((xs + dx >= l - 0.5) & (xs + dx <= r + 0.5)) / 16
        source_x = old_left + np.clip((xs - left) / max(right - left, 1), 0, 1) * (old_right - old_left)
        for channel in range(3):
            result[y, lo:hi, channel] = np.interp(
                source_x, original_x, pixels[-1, old_left:old_right + 1, channel]
            ).astype(np.uint8)
        result[y, lo:hi, 3] = np.round(coverage * 255).astype(np.uint8)
    return Image.fromarray(result), extra


def normalize(image):
    image = tight(image)
    y, x = np.where(np.asarray(image)[:, :, 3] > 160)
    _, axes = np.linalg.eigh(np.cov(np.stack([x, y])))
    direction = axes[:, -1]
    if direction[1] > 0:
        direction = -direction
    angle = math.degrees(math.atan2(direction[0], -direction[1]))
    # 透明画布上旋转，避免触边原画被旋转再次裁掉。
    padded = Image.new("RGBA", (image.width + 32, image.height + 32))
    padded.alpha_composite(image, (16, 16))
    rotated = tight(padded.convert("RGBa").rotate(
        angle - 22, resample=Image.Resampling.BICUBIC, expand=True
    ).convert("RGBA"))
    scale = min(720 / rotated.width, 1168 / rotated.height)
    resized = rotated.resize(
        (round(rotated.width * scale), round(rotated.height * scale)), RESAMPLE
    )
    master = Image.new("RGBA", MASTER_SIZE)
    master.alpha_composite(resized, (
        (master.width - resized.width) // 2, (master.height - resized.height) // 2
    ))
    runtime = master.resize(RUNTIME_SIZE, RESAMPLE)
    return master, runtime, angle


def verify(image):
    pixels = np.asarray(image)
    alpha = pixels[:, :, 3]
    y, x = np.where(alpha > 8)
    margin = min(x.min(), y.min(), image.width - 1 - x.max(), image.height - 1 - y.max())
    assert margin >= 6, "素材安全边距不足"
    assert alpha.max() == 255, "主体透明度不正确"
    assert np.count_nonzero(alpha == 0) > alpha.size * 0.5, "透明区域不正确"
    assert not np.any(pixels[alpha == 0, :3]), "透明区有颜色残留"
    return [int(x.min()), int(y.min()), int(x.max()), int(y.max())]


def zero_transparent_rgb(image):
    pixels = np.array(image)
    pixels[pixels[:, :, 3] == 0, :3] = 0
    return Image.fromarray(pixels)


def nine_slice(image, size, edge=8):
    width, height = image.size
    target = Image.new("RGBA", size)
    sx, sy = [0, edge, width - edge, width], [0, edge, height - edge, height]
    dx, dy = [0, edge, size[0] - edge, size[0]], [0, edge, size[1] - edge, size[1]]
    for row in range(3):
        for col in range(3):
            part = image.crop((sx[col], sy[row], sx[col + 1], sy[row + 1]))
            part = part.resize((dx[col + 1] - dx[col], dy[row + 1] - dy[row]), RESAMPLE)
            target.alpha_composite(part, (dx[col], dy[row]))
    return target


def item_preview(image, quality):
    frame = Image.open(ROOT / f"assets/ui/atlas/module/inventory/quality-{quality}.png").convert("RGBA")
    result = nine_slice(frame, (110, 166))
    icon = image.resize((98, 154), RESAMPLE)
    result.alpha_composite(icon, (6, 6))
    return result


def create_preview(masters, icons):
    result = Image.new("RGBA", (1100, 760), "#202326")
    draw = ImageDraw.Draw(result)
    draw.text((30, 24), "青钢剑系列 · 六品质透明素材", font=font(26), fill="#f0f1ee")
    draw.text((30, 70), "统一朝向与留边，保留原画形状及颜色", font=font(17), fill="#b7bdbf")
    for i, master in enumerate(masters):
        center = 105 + i * 176
        result.alpha_composite(master.resize((168, 264), RESAMPLE), (center - 84, 110))
        draw.text((center, 391), NAMES[i], font=font(18), fill="#edf0eb", anchor="mt")
        draw.text((center, 423), QUALITIES[i], font=font(15), fill=COLORS[i], anchor="mt")
    draw.line((30, 468, 1070, 468), fill="#464b4f")
    draw.text((30, 489), "背包实际尺寸 · 110×166 像素", font=font(18), fill="#b7bdbf")
    for i, icon in enumerate(icons):
        center = 105 + i * 176
        result.alpha_composite(item_preview(icon, i + 1), (center - 55, 540))
        draw.text((center, 723), f"ID {109 + i}", font=font(14), fill="#a7afb3", anchor="mt")
    result.convert("RGB").save(OUTPUT / "preview.png")


def check_backgrounds(masters):
    result = Image.new("RGB", (1100, 660), "#f2f2ef")
    draw = ImageDraw.Draw(result)
    draw.rectangle((0, 330, 1100, 660), fill="#16191c")
    for i, master in enumerate(masters):
        icon = master.resize((176, 277), RESAMPLE)
        result.paste(icon, (20 + i * 180, 20), icon)
        result.paste(icon, (20 + i * 180, 350), icon)
    result.save(OUTPUT / "alpha-check.png")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="包含 quality-1.png 至 quality-6.png 的原画目录")
    args = parser.parse_args()
    args.source = args.source.resolve()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "masters").mkdir(exist_ok=True)
    ASSETS.mkdir(parents=True, exist_ok=True)
    masters, icons, entries = [], [], []
    for i, name in enumerate(NAMES):
        source = args.source / f"quality-{i + 1}.png"
        original = Image.open(source).convert("RGBA")
        repaired, extra = finish_bottom_corner(clean(original))
        master, icon, angle = normalize(repaired)
        master, icon = zero_transparent_rgb(master), zero_transparent_rgb(icon)
        verify(master)
        bounds = verify(icon)
        filename = f"icon_{109 + i}.png"
        master.save(OUTPUT / "masters" / filename)
        icon.save(ASSETS / filename)
        meta = (ASSETS / filename).with_suffix(".png.meta")
        if not meta.exists():
            meta.write_text(json.dumps({
                "uuid": str(uuid.uuid4()),
                "importer": {"textureType": 2, "sRGB": True, "premultiplyAlpha": True},
            }, indent=2) + "\n", encoding="utf-8")
        settings = json.loads(meta.read_text(encoding="utf-8"))["importer"]
        assert settings["textureType"] == 2 and settings["sRGB"] and settings["premultiplyAlpha"]
        shutil.copy2(ASSETS / filename, OUTPUT / filename)
        shutil.copy2(meta, OUTPUT / meta.name)
        entries.append({
            "id": 109 + i, "name": name, "quality": i + 1,
            "source": source.relative_to(ROOT).as_posix(),
            "source_size": list(original.size), "bottom_corner_added_rows": extra,
            "original_angle": round(angle, 2), "target_angle": 22,
            "file": (ASSETS / filename).relative_to(ROOT).as_posix(),
            "runtime_size": list(icon.size), "master_size": list(master.size),
            "bounds": bounds, "uuid": json.loads(meta.read_text(encoding="utf-8"))["uuid"],
        })
        masters.append(master)
        icons.append(icon)
    create_preview(masters, icons)
    check_backgrounds(masters)
    (OUTPUT / "manifest.json").write_text(json.dumps({
        "processing": "保留原画造型与颜色，清理透明杂点，补齐两处被截断的小角，统一朝向，预先缩图。",
        "runtime_display_size": [98, 154], "inventory_cell_size": [110, 166],
        "entries": entries,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    archive = OUTPUT.parent / "qinggang-icons.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for file in sorted(OUTPUT.rglob("*")):
            if file.is_file():
                bundle.write(file, file.relative_to(OUTPUT))
    print(json.dumps(entries, ensure_ascii=False, indent=2))
    print(OUTPUT / "preview.png")
    print(archive)


if __name__ == "__main__":
    main()
