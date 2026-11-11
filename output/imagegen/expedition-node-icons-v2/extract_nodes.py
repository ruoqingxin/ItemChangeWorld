"""Extract the approved painted atlas locally; never modify runtime assets."""

import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont


SOURCE = Path("E:/CjnxSQpp.png")
OUT = Path(__file__).resolve().parent
ENTRIES = [
    ("start", "入境处", (185, 30, 455, 295), 320, 280, "white"),
    ("transit", "空节点", (495, 90, 805, 255), 650, 238, None),
    ("enemy-normal", "普通敌人", (880, 35, 1060, 295), 970, 280, None),
    ("enemy-elite", "精英敌人", (1155, 30, 1445, 305), 1295, 288, None),
    ("enemy-boss", "首领", (1445, 25, 1830, 305), 1635, 288, None),
    ("supply", "补给处", (205, 315, 435, 550), 320, 533, None),
    ("search", "搜索点", (510, 330, 805, 560), 655, 545, None),
    ("borrow", "借法台", (850, 305, 1100, 570), 975, 548, "gold"),
    ("insight", "悟道处", (1180, 295, 1420, 565), 1295, 548, "gold"),
    ("recovery", "恢复点", (1490, 335, 1765, 550), 1635, 534, None),
    ("extract", "撤离点", (160, 560, 465, 805), 320, 787, "cyan"),
    ("battle-loot", "战后遗藏", (520, 590, 810, 795), 655, 775, None),
    ("herb", "药品采集处", (850, 560, 1105, 810), 975, 797, None),
    ("ore", "矿石采集处", (1170, 575, 1420, 810), 1295, 797, None),
    ("chest-common", "普通宝箱", (1490, 575, 1765, 810), 1635, 797, None),
    ("chest-refined", "精制宝箱", (200, 810, 465, 1055), 330, 1040, None),
    ("chest-treasure", "珍藏宝箱", (510, 815, 810, 1055), 660, 1040, None),
    ("cave", "洞府", (845, 800, 1120, 1055), 985, 1040, None),
    ("base", "通用底座", (1150, 820, 1435, 1045), 1295, 1022, None),
]


def background_model(rgb):
    gray = rgb.mean(axis=2)
    height, width = gray.shape
    # Clear top/left margins contain the actual checker transition profile.
    def checker_axis(values):
        row = values.astype(np.float32)[None, :]
        lo = cv2.erode(row, np.ones((1, 151), np.uint8))[0]
        hi = cv2.dilate(row, np.ones((1, 151), np.uint8))[0]
        midpoint = (hi + lo) / 2
        q = np.clip((values - midpoint) / np.maximum((hi - lo) / 2, 8), -1, 1)
        q[np.abs(q) > 0.75] = np.sign(q[np.abs(q) > 0.75])
        return q

    qx = checker_axis(np.median(gray[:10], axis=0))
    qy = checker_axis(np.median(gray[:, :10], axis=1))
    checker = qy[:, None] * qx[None, :]
    yy, xx = np.mgrid[:height, :width]
    x, y = xx / width, yy / height
    terms = [np.ones_like(x), x, y, x*x, x*y, y*y, x*x*x, x*x*y, x*y*y, y*y*y]
    features = np.stack(terms + [checker * t for t in terms[:6]], axis=2)
    neutral = rgb.max(axis=2) - rgb.min(axis=2) <= 1
    selected = neutral & (gray > 120) & (gray < 190)
    sampled = (xx % 5 == 0) & (yy % 5 == 0)
    for _ in range(5):
        fit = selected & sampled
        weights = np.linalg.lstsq(features[fit], gray[fit], rcond=None)[0]
        prediction = features @ weights
        selected = neutral & (np.abs(prediction - gray) < 3.5)
    errors = np.abs(prediction[selected] - gray[selected])
    return prediction.astype(np.float32), {
        "neutral_background_pixels": int(selected.sum()),
        "median_error": float(np.median(errors)),
        "p95_error": float(np.percentile(errors, 95)),
    }


def subjects(rgb, bg, key, origin):
    chroma = rgb.max(axis=2) - rgb.min(axis=2)
    light = rgb.mean(axis=2)
    dark = rgb.min(axis=2) < bg - 18
    colored = (chroma > 14) & (light < bg + 28)
    candidate = (dark if key in ["start", "borrow", "insight", "extract"] else dark | colored).astype(np.uint8)
    candidate = cv2.morphologyEx(candidate, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    contours, _ = cv2.findContours(candidate, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    matte = np.zeros_like(candidate)
    if key.startswith("enemy-"):
        contours = [max(contours, key=cv2.contourArea)]
    for contour in contours:
        if cv2.contourArea(contour) >= 45:
            cv2.drawContours(matte, [contour], -1, 1, cv2.FILLED)
    # Painted light crosses some outlines. Restore only the existing solid material.
    patches = {
        "start": [
            [(241, 116), (276, 116), (276, 229), (241, 229)],
            [(355, 120), (395, 120), (395, 239), (355, 239)],
        ],
        "extract": [
            [(215, 593), (223, 590), (268, 605), (268, 740), (223, 755), (215, 753)],
            [(360, 605), (418, 587), (429, 591), (429, 755), (418, 758), (360, 740)],
            [(250, 752), (387, 752), (395, 764), (395, 775), (249, 775)],
        ],
    }
    for polygon in patches.get(key, []):
        points = np.array(polygon, dtype=np.int32)-np.array(origin, dtype=np.int32)
        cv2.fillPoly(matte, [points], 1)
    if key == "borrow":
        y0, y1 = 316-origin[1], 438-origin[1]
        x0, x1 = 900-origin[0], 1040-origin[0]
        jade = (rgb[y0:y1, x0:x1, 1]-rgb[y0:y1, x0:x1, 0] > 30) & (
            rgb[y0:y1, x0:x1, 1]-rgb[y0:y1, x0:x1, 2] > 8)
        yy, xx = np.where(jade)
        hull = cv2.convexHull(np.stack([xx+x0, yy+y0], axis=1).astype(np.int32))
        filled = np.zeros_like(matte)
        cv2.fillPoly(filled, [hull], 1)
        near_jade = cv2.dilate(filled, np.ones((9, 9), np.uint8))
        jade_region = np.zeros_like(matte)
        jade_region[y0:y1, x0:x1] = 1
        matte = np.where(jade_region, np.maximum(filled, matte*near_jade), matte).astype(np.uint8)
    # A source-coloured interior is retained by the enclosing painted outline.
    return matte


def edge_matte(rgb, bg, solid):
    core = cv2.erode(solid, np.ones((3, 3), np.uint8))
    _, labels = cv2.distanceTransformWithLabels(
        (1-core).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL
    )
    samples = np.zeros((int(labels.max()) + 1, 3), dtype=np.float32)
    samples[labels[core > 0]] = rgb[core > 0]
    nearest = samples[labels]
    background = bg[..., None]
    direction = nearest - background
    delta = rgb - background
    projection = np.sum(delta * direction, axis=2) / np.maximum(np.sum(direction**2, axis=2), 25)
    band = cv2.dilate(solid, np.ones((5, 5), np.uint8)) > 0
    alpha = np.where(core > 0, 1, np.where(band, np.clip(projection, 0, 1), 0))
    alpha[alpha < 0.045] = 0
    foreground = np.where(
        alpha[..., None] > 0,
        (rgb - (1-alpha[..., None]) * background) / np.maximum(alpha[..., None], 0.01),
        0,
    )
    return np.clip(foreground, 0, 255), alpha


def add_glow(rgb, bg, foreground, alpha, glow):
    colors = {"white": [245, 250, 248], "gold": [255, 239, 150], "cyan": [218, 250, 240]}
    color = np.array(colors[glow], dtype=np.float32)
    direction = color - bg[..., None]
    delta = rgb - bg[..., None]
    if glow == "gold":
        opacity = (rgb[..., 0]-rgb[..., 2]) / 105
    elif glow == "cyan":
        opacity = (rgb[..., 1]-rgb[..., 0]) / 32
    else:
        opacity = np.sum(delta * direction, axis=2) / np.maximum(np.sum(direction**2, axis=2), 1)
    # Isolate additive painted light, not the dark outlines or neutral background noise.
    opacity = np.clip((opacity - 0.035) / 0.965, 0, 1)
    if glow == "gold":
        opacity = np.where(opacity > 0.45,
                           cv2.GaussianBlur(opacity, (3, 3), 0.5),
                           cv2.GaussianBlur(opacity, (0, 0), 4))
    else:
        opacity = cv2.GaussianBlur(opacity, (0, 0), 4.5)
    yy, xx = np.mgrid[:opacity.shape[0], :opacity.shape[1]]
    edge = np.minimum.reduce([xx, yy, opacity.shape[1]-1-xx, opacity.shape[0]-1-yy])
    opacity *= np.clip(edge/10, 0, 1)
    opacity[opacity < 0.025] = 0
    outside = alpha == 0
    foreground[outside] = color
    alpha[outside] = opacity[outside]
    return foreground, alpha


def bbox(alpha):
    ys, xs = np.where(alpha > 0)
    return [int(xs.min()), int(ys.min()), int(xs.max()+1), int(ys.max()+1)]


def rgba(foreground, alpha):
    result = np.dstack([np.rint(foreground), np.rint(alpha*255)]).astype(np.uint8)
    result[result[..., 3] == 0, :3] = 0
    return Image.fromarray(result, "RGBA")


def clear_hidden_rgb(image):
    data = np.array(image)
    data[data[..., 3] == 0, :3] = 0
    return Image.fromarray(data, "RGBA")


def font(size):
    return ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", size)


def previews(paths):
    for theme, color in [("dark", "#27312f"), ("light", "#f1f2f3")]:
        sheet = Image.new("RGB", (1500, 1100), color)
        draw = ImageDraw.Draw(sheet)
        for i, (path, entry) in enumerate(zip(paths, ENTRIES)):
            x, y = (i % 5)*300, (i//5)*275
            icon = Image.open(path).convert("RGBA").resize((256, 256), Image.Resampling.LANCZOS)
            sheet.paste(icon, (x+22, y-4), icon)
            draw.text((x+150, y+252), f"{i+1:02} {entry[1]}", font=font(17),
                      fill="#e9eeec" if theme == "dark" else "#27312f", anchor="mm")
        sheet.save(OUT/f"preview-{theme}.png")
    small = Image.new("RGB", (19*90+20, 225), "#27312f")
    draw = ImageDraw.Draw(small)
    for i, path in enumerate(paths):
        for row, size in enumerate([84, 64]):
            icon = Image.open(path).resize((size, size), Image.Resampling.LANCZOS)
            small.paste(icon, (10+i*90+(84-size)//2, 5+row*112), icon)
            draw.text((10+i*90+42, 101+row*112), str(i+1), font=font(12),
                      fill="#dfe7e3", anchor="mm")
    small.save(OUT/"preview-small.png")


def main():
    source_bytes = SOURCE.read_bytes()
    rgb = np.array(Image.open(SOURCE).convert("RGB"), dtype=np.float32)
    bg, background_stats = background_model(rgb)
    Image.fromarray(np.uint8(np.clip(bg, 0, 255))).save(OUT/"background-model.png")
    records, paths = [], []
    for folder in ["native", "png512", "png128", "diagnostics"]:
        (OUT/folder).mkdir(exist_ok=True)
    for key, name, crop, center, baseline, glow in ENTRIES:
        x0, y0, x1, y1 = crop
        image, background = rgb[y0:y1, x0:x1], bg[y0:y1, x0:x1]
        if glow:
            diagnostic = Image.fromarray(np.uint8(image)).resize(
                (image.shape[1]*2, image.shape[0]*2), Image.Resampling.NEAREST)
            draw = ImageDraw.Draw(diagnostic)
            for x in range(((x0+19)//20)*20, x1, 20):
                dx = (x-x0)*2
                draw.line((dx, 0, dx, diagnostic.height), fill=(110, 80, 180), width=1)
                draw.text((dx+2, 0), str(x), font=font(10), fill="white")
            for y in range(((y0+19)//20)*20, y1, 20):
                dy = (y-y0)*2
                draw.line((0, dy, diagnostic.width, dy), fill=(110, 80, 180), width=1)
                draw.text((0, dy+2), str(y), font=font(10), fill="white")
            diagnostic.save(OUT/"diagnostics"/f"{key}-source-grid.png")
        mask = subjects(image, background, key, (x0, y0))
        foreground, alpha = edge_matte(image, background, mask)
        if glow:
            foreground, alpha = add_glow(image, background, foreground, alpha, glow)
        # Remove isolated sub-pixel fragments while keeping painted loose stones.
        count, components, stats, _ = cv2.connectedComponentsWithStats((alpha > 0).astype(np.uint8))
        for index in range(1, count):
            if stats[index, cv2.CC_STAT_AREA] < 8:
                alpha[components == index] = 0
        icon = rgba(foreground, alpha)
        bounds = bbox(np.array(icon)[..., 3])
        native = icon.crop(bounds)
        padded = Image.new("RGBA", (native.width+32, native.height+32))
        padded.paste(native, (16, 16))
        padded.save(OUT/"native"/f"node-{key}.png")
        # One shared scale and baseline preserves the three enemies' relative sizes.
        canvas = Image.new("RGBA", (512, 512))
        scaled = icon.resize((round(icon.width*1.2), round(icon.height*1.2)), Image.Resampling.LANCZOS)
        left = round(256-(center-x0)*1.2)
        top = round(440-(baseline-y0)*1.2)
        canvas.paste(scaled, (left, top))
        canvas = clear_hidden_rgb(canvas)
        file = OUT/"png512"/f"node-{key}.png"
        canvas.save(file)
        clear_hidden_rgb(canvas.resize((128, 128), Image.Resampling.LANCZOS)).save(OUT/"png128"/file.name)
        paths.append(file)
        check = np.array(canvas)
        report = {
            "key": key, "name": name, "file": file.name,
            "source_crop": list(crop), "source_subject_bounds": bounds,
            "alpha_bounds512": bbox(check[..., 3]),
            "transparent_pixels512": int(np.count_nonzero(check[..., 3] == 0)),
            "partial_pixels512": int(np.count_nonzero((check[..., 3] > 0) & (check[..., 3] < 255))),
        }
        records.append(report)
        Image.fromarray(np.uint8(mask*255)).save(OUT/"diagnostics"/f"{key}-solid.png")
        print(key, bounds, "partial", report["partial_pixels512"], flush=True)
    previews(paths)
    report = {
        "source": str(SOURCE), "source_sha256": hashlib.sha256(source_bytes).hexdigest(),
        "source_size": [rgb.shape[1], rgb.shape[0]], "source_has_alpha": False,
        "method": "Local checker-model subtraction, outline-filled masks, edge unmixing and light mattes; no generation API.",
        "shared_canvas_scale": 1.2, "shared_baseline512": 440,
        "note": "512 is an export canvas, not additional generated source detail. Existing game assets are unchanged.",
        "alpha_recovery": "Approximate: source is flattened RGB. Painted light directions are retained with reconstructed opacity and checker smoothing, not lossless alpha recovery.",
        "background_fit": background_stats, "files": records,
    }
    (OUT/"extraction-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    assert SOURCE.read_bytes() == source_bytes
    assert len(records) == 19 and len({r["file"] for r in records}) == 19
    for folder, size in [("native", None), ("png512", (512, 512)), ("png128", (128, 128))]:
        files = list((OUT/folder).glob("*.png"))
        assert len(files) == 19
        for file in files:
            image = Image.open(file)
            assert image.mode == "RGBA", file
            if size:
                assert image.size == size, file
            data = np.array(image)
            alpha = data[..., 3]
            assert alpha[0].max() == alpha[-1].max() == 0, file
            assert alpha[:, 0].max() == alpha[:, -1].max() == 0, file
            assert alpha.max() == 255 and np.count_nonzero((alpha > 0) & (alpha < 255)) > 0, file
            assert np.all(data[alpha == 0, :3] == 0), file
    names = {
        "native": [r["file"] for r in records],
        "png512": [r["file"] for r in records],
        "png128": [r["file"] for r in records],
    }
    with ZipFile(OUT/"map-node-transparent-pack.zip", "w", ZIP_DEFLATED) as archive:
        for folder, files in names.items():
            for name in files:
                archive.write(OUT/folder/name, f"{folder}/{name}")
        for name in ["README.md", "extraction-report.json", "extract_nodes.py",
                     "preview-dark.png", "preview-light.png", "preview-small.png"]:
            archive.write(OUT/name, name)
    with ZipFile(OUT/"map-node-transparent-pack.zip") as archive:
        assert archive.testzip() is None
        assert len(archive.namelist()) == 63
    print("PASS 57 RGBA files: sizes, transparent borders, opaque interiors, antialiasing, and ZIP integrity.")
    print("DONE", len(records), "icons", background_stats)


if __name__ == "__main__":
    main()
