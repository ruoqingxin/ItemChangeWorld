"""Deterministic 128px cutouts from the user's atmospheric atlas; no runtime writes."""

import hashlib
import importlib.util
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont


SOURCE = Path("E:/P3GyfXig.png")
OUT = Path(__file__).resolve().parent
PNG = OUT / "png128"
PREVIOUS = OUT.parent / "expedition-node-icons-v2/extract_nodes.py"
ENTRIES = [
    ("start", "入境处", (165, 22, 475, 310), (210, 50, 427, 282)),
    ("transit", "空节点图案", (490, 80, 815, 273), (511, 115, 790, 239)),
    ("enemy-normal", "普通敌人", (825, 15, 1120, 305), (880, 58, 1060, 278)),
    ("enemy-elite", "精英敌人", (1145, 15, 1455, 310), (1172, 45, 1426, 292)),
    ("enemy-boss", "首领", (1440, 12, 1845, 310), (1460, 42, 1812, 295)),
    ("supply", "补给处", (180, 310, 455, 550), (217, 330, 414, 532)),
    ("search", "搜索点", (500, 317, 810, 553), (525, 342, 778, 534)),
    ("borrow", "借法台", (840, 305, 1105, 558), (870, 320, 1068, 550)),
    ("insight", "悟道处", (1170, 290, 1435, 568), (1206, 310, 1385, 551)),
    ("recovery", "恢复点", (1480, 325, 1775, 554), (1516, 357, 1743, 535)),
    ("extract", "撤离点", (155, 551, 484, 810), (200, 577, 442, 787)),
    ("battle-loot", "战后遗藏", (515, 588, 811, 801), (545, 609, 784, 780)),
    ("herb", "药品采集处", (839, 565, 1110, 808), (856, 576, 1086, 798)),
    ("ore", "矿石采集处", (1168, 567, 1432, 803), (1192, 592, 1402, 786)),
    ("chest-common", "普通宝箱", (1486, 583, 1767, 807), (1510, 597, 1737, 793)),
    ("chest-refined", "精制宝箱", (183, 807, 478, 1059), (214, 835, 445, 1043)),
    ("chest-treasure", "珍藏宝箱", (512, 813, 806, 1056), (538, 839, 778, 1033)),
    ("cave", "洞府", (846, 805, 1123, 1059), (865, 815, 1107, 1045)),
    ("base", "通用底座", (1142, 810, 1460, 1053), (1170, 846, 1437, 1025)),
]

spec = importlib.util.spec_from_file_location("previous_node_extraction", PREVIOUS)
previous = importlib.util.module_from_spec(spec)
spec.loader.exec_module(previous)

ENEMY_OUTLINES = {
    "enemy-normal": [(889, 102), (895, 87), (914, 75), (944, 65), (969, 65),
        (979, 74), (1001, 67), (1025, 75), (1045, 91), (1055, 116), (1053, 160),
        (1048, 195), (1036, 226), (1015, 250), (985, 270), (969, 272),
        (943, 260), (923, 240), (908, 217), (899, 188), (892, 153)],
    "enemy-elite": [(1179, 120), (1183, 96), (1195, 66), (1208, 50), (1212, 75),
        (1208, 104), (1238, 118), (1256, 94), (1285, 84), (1310, 84),
        (1335, 95), (1353, 116), (1384, 105), (1382, 73), (1387, 50),
        (1401, 72), (1416, 110), (1418, 131), (1397, 151), (1369, 158),
        (1360, 204), (1348, 245), (1327, 271), (1300, 287), (1280, 284),
        (1257, 267), (1238, 241), (1228, 209), (1226, 165), (1194, 150)],
    "enemy-boss": [(1464, 142), (1484, 157), (1501, 161), (1533, 129),
        (1562, 116), (1575, 87), (1585, 69), (1605, 106), (1621, 66),
        (1633, 47), (1645, 79), (1654, 106), (1668, 75), (1681, 116),
        (1709, 123), (1730, 145), (1753, 158), (1777, 155), (1804, 145),
        (1787, 172), (1767, 182), (1740, 184), (1714, 167), (1700, 188),
        (1692, 236), (1675, 268), (1654, 285), (1636, 291), (1611, 279),
        (1591, 260), (1577, 225), (1570, 179), (1554, 167), (1527, 182),
        (1506, 185), (1486, 173), (1470, 158)],
}

def background_model(rgb):
    gray = rgb.mean(axis=2)
    h, w = gray.shape
    yy, xx = np.mgrid[:h, :w]
    qx = np.clip((np.median(gray[:10], axis=0)-145)/13, -1, 1)
    neutral = (rgb.max(axis=2)-rgb.min(axis=2) <= 1) & (gray > 120) & (gray < 177)
    reliable = neutral & (np.abs(gray-145) > 8) & (np.abs(qx)[None, :] > 0.8)
    votes = np.sign(gray-145)*qx[None, :]*reliable
    qy = votes.sum(axis=1) / np.maximum(reliable.sum(axis=1), 1)
    qy = np.clip(qy*1.6, -1, 1)
    qy[np.abs(qy) > 0.5] = np.sign(qy[np.abs(qy) > 0.5])
    checker = qy[:, None]*qx[None, :]
    x, y = xx/w, yy/h
    terms = [np.ones_like(x), x, y, x*x, x*y, y*y, x*x*x, x*x*y, x*y*y, y*y*y]
    features = np.stack(terms+[checker*t for t in terms[:6]], axis=2)
    selected = neutral.copy()
    sampled = (xx % 5 == 0) & (yy % 5 == 0)
    for _ in range(6):
        fit = selected & sampled
        coefficients = np.linalg.lstsq(features[fit], gray[fit], rcond=None)[0]
        prediction = features @ coefficients
        selected = neutral & (np.abs(gray-prediction) < 3.5)
    errors = np.abs(gray[selected]-prediction[selected])
    return prediction.astype(np.float32), {
        "neutral_background_pixels": int(selected.sum()),
        "median_error": float(np.median(errors)), "p95_error": float(np.percentile(errors, 95))}


def polygon(mask, points, origin, value=1):
    points = np.array(points, dtype=np.int32) - np.array(origin, dtype=np.int32)
    cv2.fillPoly(mask, [points], value)


def body_mask(rgb, bg, key, origin, body):
    dark = ((rgb.mean(axis=2) < bg - 24) & (rgb.mean(axis=2) < 112)).astype(np.uint8)
    region = np.zeros_like(dark)
    x0, y0, x1, y1 = body
    region[max(0, y0-origin[1]):y1-origin[1], max(0, x0-origin[0]):x1-origin[0]] = 1
    dark *= region
    dark = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    contours, _ = cv2.findContours(dark, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    mask = np.zeros_like(dark)
    for contour in contours:
        if cv2.contourArea(contour) > 50:
            cv2.drawContours(mask, [contour], -1, 1, cv2.FILLED)
    if key in ENEMY_OUTLINES:
        mask[:] = 0
        polygon(mask, ENEMY_OUTLINES[key], origin)
    if key == "start":
        polygon(mask, [(273, 112), (371, 112), (367, 246), (277, 251)], origin, 0)
        polygon(mask, [(235, 113), (270, 114), (269, 249), (233, 249)], origin)
        polygon(mask, [(376, 115), (407, 111), (402, 250), (369, 251)], origin)
    if key == "borrow":
        polygon(mask, [(920, 426), (1000, 326), (1025, 332), (1018, 352), (945, 442)], origin)
    if key == "extract":
        polygon(mask, [(209, 585), (227, 584), (270, 601), (271, 740), (220, 763), (208, 757)], origin)
        polygon(mask, [(363, 606), (422, 585), (434, 584), (434, 758), (418, 768), (363, 743)], origin)
        polygon(mask, [(250, 752), (391, 750), (401, 767), (394, 780), (247, 780)], origin)
        polygon(mask, [(275, 610), (356, 610), (357, 742), (278, 742)], origin, 0)
    return mask


def atmosphere(rgb, bg, solid, key):
    # Chroma cancels the locally distorted gray checker without copying its edges.
    high, low = rgb.max(axis=2), rgb.min(axis=2)
    chroma = high-low
    enemy = key.startswith("enemy-")
    span = 65 if enemy else 85
    colored = np.clip((chroma-3)/span, 0, 1)
    white = np.clip((low-178)/77, 0, 1)
    opacity = np.maximum(colored, white)
    opacity[opacity < 0.028] = 0
    h, w = opacity.shape
    yy, xx = np.mgrid[:h, :w]
    edge = np.minimum.reduce([xx, yy, w-1-xx, h-1-yy])
    opacity *= np.clip(edge / 9, 0, 1)
    luminance = np.where(white > colored, 255, 80 if enemy else 255)
    foreground = luminance[..., None] - (high[..., None]-rgb) / np.maximum(opacity[..., None], 0.01)
    foreground = np.clip(foreground, 0, 255)
    # The atlas has opaque painted geometry and flattened, partially transparent effects.
    body_rgb, body_alpha = previous.edge_matte(rgb, bg, solid)
    use_body = body_alpha > 0
    foreground[use_body] = body_rgb[use_body]
    opacity[use_body] = body_alpha[use_body]
    count, labels, stats, _ = cv2.connectedComponentsWithStats((opacity > 0).astype(np.uint8))
    for index in range(1, count):
        if stats[index, cv2.CC_STAT_AREA] < 4:
            opacity[labels == index] = 0
    return previous.rgba(foreground, opacity)


def fit128(image, solid, key):
    data = np.array(image)
    body = previous.bbox(solid)
    meaningful = previous.bbox(data[..., 3] > 15)
    full = previous.bbox(data[..., 3])
    bw, bh = body[2]-body[0], body[3]-body[1]
    desired = {"enemy-normal": 100, "enemy-elite": 110, "enemy-boss": 116}.get(key, 114)
    scale = min(desired / max(bw, bh),
                122 / max(meaningful[2]-meaningful[0], meaningful[3]-meaningful[1]),
                126 / max(full[2]-full[0], full[3]-full[1]))
    cropped = image.crop(full)
    size = (max(1, round(cropped.width*scale)), max(1, round(cropped.height*scale)))
    resized = cropped.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (128, 128))
    canvas.paste(resized, ((128-size[0])//2, (128-size[1])//2))
    canvas = previous.clear_hidden_rgb(canvas)
    raw = np.array(canvas)
    return canvas, {"body_bounds_source": body, "effect_bounds_source": full,
        "body_long_axis128": round(max(bw, bh)*scale, 2), "scale": scale,
        "alpha_bounds128": previous.bbox(raw[..., 3]),
        "partial_pixels": int(np.count_nonzero((raw[..., 3] > 0) & (raw[..., 3] < 255)))}


def previews(records):
    font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 15)
    for name, color, ink in [("dark", "#33423c", "#f1f4f2"), ("light", "#eceff0", "#24332e")]:
        sheet = Image.new("RGB", (960, 720), color)
        draw = ImageDraw.Draw(sheet)
        for index, record in enumerate(records):
            x, y = index % 5 * 192, index // 5 * 180
            icon = Image.open(PNG/record["file"])
            sheet.paste(icon, (x+32, y+10), icon)
            draw.text((x+96, y+158), record["name"], font=font, anchor="mm", fill=ink)
        sheet.save(OUT/f"preview-{name}.jpg", quality=95, subsampling=0)


def main():
    original = SOURCE.read_bytes()
    source = Image.open(SOURCE)
    rgb = np.array(source.convert("RGB"), dtype=np.float32)
    bg, stats = background_model(rgb)
    PNG.mkdir(parents=True, exist_ok=True)
    records = []
    for key, name, crop, body in ENTRIES:
        x0, y0, x1, y1 = crop
        pixels, background = rgb[y0:y1, x0:x1], bg[y0:y1, x0:x1]
        solid = body_mask(pixels, background, key, (x0, y0), body)
        rgba = atmosphere(pixels, background, solid, key)
        icon, record = fit128(rgba, solid, key)
        file = f"node-{key}.png"
        icon.save(PNG/file)
        record.update(key=key, name=name, file=file, source_crop=crop,
                      sha256=hashlib.sha256((PNG/file).read_bytes()).hexdigest())
        records.append(record)
        print(key, record["body_long_axis128"], record["alpha_bounds128"], flush=True)
    previews(records)
    report = {"source": str(SOURCE), "source_sha256": hashlib.sha256(original).hexdigest(),
        "source_size": list(source.size), "source_mode": source.mode, "source_has_alpha": False,
        "method": "Opaque material masks, checker-independent chroma and highlight atmosphere extraction; no generation API.",
        "limitations": "Flattened RGB source: reconstructed smoke/glow alpha is approximate, not a lossless recovery.",
        "export_size": [128, 128], "count": len(records), "runtime_replaced": False,
        "sizing": "Subject-based fitting with 1-3px outer effect guard; common icons target 114px solid long axis.",
        "background_fit": stats, "files": records}
    (OUT/"extraction-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    assert SOURCE.read_bytes() == original
    assert len(list(PNG.glob("*.png"))) == len(records) == 19
    for record in records:
        image = Image.open(PNG/record["file"])
        assert image.mode == "RGBA" and image.size == (128, 128)
        a = np.array(image)
        assert not np.any(a[0, :, 3]) and not np.any(a[-1, :, 3])
        assert not np.any(a[:, 0, 3]) and not np.any(a[:, -1, 3])
        assert np.any(a[..., 3] == 255) and record["partial_pixels"] > 0
        assert np.all(a[a[..., 3] == 0, :3] == 0)
        assert record["body_long_axis128"] >= 74, record["key"]
    with ZipFile(OUT/"map-node-atmosphere-128.zip", "w", ZIP_DEFLATED) as archive:
        for record in records:
            archive.write(PNG/record["file"], record["file"])
    with ZipFile(OUT/"map-node-atmosphere-128.zip") as archive:
        assert archive.testzip() is None and len(archive.namelist()) == 19
    print("PASS 19 RGBA sprites, 128px only, transparent borders, solid bodies, partial atmosphere and ZIP integrity.")


if __name__ == "__main__":
    main()
