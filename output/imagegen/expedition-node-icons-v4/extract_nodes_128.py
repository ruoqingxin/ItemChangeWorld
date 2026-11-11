"""Slice the user's true-alpha atlas. Do not write runtime assets."""

import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

import numpy as np
from PIL import Image, ImageDraw, ImageFont


SOURCE = Path("C:/Users/Administrator/Downloads/8369bfcb-cc27-4822-b6dc-e8cec45b9833_0_84a5cffc.png")
OUT = Path(__file__).resolve().parent
PNG = OUT / "png128"
# Coordinates are measured on the 2048px-wide reference, then scaled to native pixels.
ENTRIES = [
    ("start", "入境处", (110, 0, 507, 337), (198, 45, 436, 304)),
    ("transit", "空节点图案", (460, 43, 875, 319), (515, 122, 830, 262)),
    ("enemy-normal", "普通敌人", (876, 0, 1190, 326), (941, 57, 1117, 293)),
    ("enemy-elite", "精英敌人", (1175, 0, 1550, 327), (1248, 44, 1528, 312)),
    ("enemy-boss", "首领", (1550, 0, 2048, 336), (1547, 40, 1943, 316)),
    ("supply", "补给处", (110, 324, 502, 610), (192, 354, 424, 584)),
    ("search", "搜索点", (496, 325, 876, 607), (532, 368, 817, 582)),
    ("borrow", "借法台", (876, 314, 1205, 609), (917, 343, 1150, 596)),
    ("insight", "悟道处", (1215, 317, 1550, 610), (1284, 331, 1486, 600)),
    ("recovery", "恢复点", (1550, 325, 2018, 610), (1620, 385, 1881, 583)),
    ("extract", "撤离点", (105, 610, 508, 880), (190, 618, 450, 849)),
    ("battle-loot", "战后遗藏", (516, 615, 876, 876), (551, 653, 837, 845)),
    ("herb", "药品采集处", (876, 607, 1227, 864), (903, 611, 1173, 861)),
    ("ore", "矿石采集处", (1227, 610, 1561, 880), (1277, 630, 1514, 851)),
    ("chest-common", "普通宝箱", (1568, 610, 1995, 884), (1617, 642, 1890, 860)),
    ("chest-refined", "精制宝箱", (105, 880, 508, 1150), (185, 894, 453, 1130)),
    ("chest-treasure", "珍藏宝箱", (508, 883, 876, 1150), (540, 898, 820, 1117)),
    ("cave", "洞府", (880, 863, 1227, 1150), (892, 868, 1199, 1132)),
    ("base", "通用底座", (1227, 883, 1620, 1150), (1259, 912, 1563, 1107)),
]


def bounds(mask):
    ys, xs = np.where(mask)
    return [int(xs.min()), int(ys.min()), int(xs.max()+1), int(ys.max()+1)]


def export(source, entry):
    key, name, region, body = entry
    ratio = source.width/2048
    crop = tuple(round(v*ratio) for v in region)
    crop = (crop[0], crop[1], min(crop[2], source.width), min(crop[3], source.height))
    image = source.crop(crop)
    raw = np.array(image)
    yy, xx = np.mgrid[:image.height, :image.width]
    fringe = np.minimum.reduce([xx, yy, image.width-1-xx, image.height-1-yy])
    raw[..., 3] = np.rint(raw[..., 3]*np.clip(fringe/(ratio*5), 0, 1)).astype(np.uint8)
    image = Image.fromarray(raw)
    bw, bh = (body[2]-body[0])*ratio, (body[3]-body[1])*ratio
    desired = {"enemy-normal": 100, "enemy-elite": 110, "enemy-boss": 116}.get(key, 112)
    scale = desired/max(bw, bh)
    # Fit around the subject, clipping only the remote diffuse halo, never the object.
    cx = (body[0]+body[2])*ratio/2-crop[0]
    cy = (body[1]+body[3])*ratio/2-crop[1]
    extent = 128/scale
    window = (cx-extent/2, cy-extent/2, cx+extent/2, cy+extent/2)
    image = image.transform((128, 128), Image.Transform.EXTENT, window, Image.Resampling.BICUBIC)
    raw = np.array(image)
    yy, xx = np.mgrid[:128, :128]
    edge = np.minimum.reduce([xx, yy, 127-xx, 127-yy]).astype(np.float32)
    # Fade only the outer glow fringe; central source color and alpha are unmodified.
    fade = np.clip(edge/7, 0, 1)
    raw[..., 3] = np.rint(raw[..., 3]*fade).astype(np.uint8)
    raw[raw[..., 3] == 0, :3] = 0
    result = Image.fromarray(raw)
    path = PNG/f"node-{key}.png"
    result.save(path)
    return {"key": key, "name": name, "file": path.name, "crop_native": crop,
            "body_bounds_reference": body, "body_long_axis128": desired,
            "alpha_bounds128": bounds(raw[..., 3] > 0),
            "source_alpha": "preserved centrally; resampled with crop fringe and outer 7px halo fade",
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def previews(records):
    font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 15)
    for name, color, ink in [("dark", "#33423c", "#f1f4f2"), ("light", "#eceff0", "#24332e")]:
        sheet = Image.new("RGB", (960, 720), color)
        draw = ImageDraw.Draw(sheet)
        for i, record in enumerate(records):
            x, y = i % 5*192, i//5*180
            icon = Image.open(PNG/record["file"])
            sheet.paste(icon, (x+32, y+10), icon)
            draw.text((x+96, y+158), record["name"], font=font, anchor="mm", fill=ink)
        sheet.save(OUT/f"preview-{name}.jpg", quality=95, subsampling=0)


def main():
    original = SOURCE.read_bytes()
    source = Image.open(SOURCE)
    assert source.mode == "RGBA"
    source_alpha = np.array(source.getchannel("A"))
    assert np.any(source_alpha == 0) and np.any((source_alpha > 0) & (source_alpha < 255))
    PNG.mkdir(parents=True, exist_ok=True)
    records = [export(source, entry) for entry in ENTRIES]
    previews(records)
    for record in records:
        im = Image.open(PNG/record["file"])
        a = np.array(im)
        assert im.size == (128, 128) and im.mode == "RGBA"
        assert not np.any(a[0, :, 3]) and not np.any(a[-1, :, 3])
        assert not np.any(a[:, 0, 3]) and not np.any(a[:, -1, 3])
        assert np.any(a[..., 3] > 200)
        assert np.all(a[a[..., 3] == 0, :3] == 0)
    assert len(list(PNG.glob("*.png"))) == len(records) == 19
    assert SOURCE.read_bytes() == original
    report = {"source": str(SOURCE), "source_size": source.size,
              "source_sha256": hashlib.sha256(original).hexdigest(), "source_mode": source.mode,
              "source_alpha_range": [int(source_alpha.min()), int(source_alpha.max())],
              "source_transparent_pixels": int((source_alpha == 0).sum()),
              "source_partial_pixels": int(((source_alpha > 0) & (source_alpha < 255)).sum()),
              "method": "Direct true-alpha slicing, subject-based fitting, outer halo edge fade; no AI generation or background removal.",
              "export_size": [128, 128], "count": 19, "runtime_replaced": False, "files": records}
    (OUT/"extraction-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    with ZipFile(OUT/"map-node-atmosphere-128.zip", "w", ZIP_DEFLATED) as archive:
        for record in records:
            archive.write(PNG/record["file"], record["file"])
    with ZipFile(OUT/"map-node-atmosphere-128.zip") as archive:
        assert archive.testzip() is None and len(archive.namelist()) == 19
    print("PASS: 19 true-alpha 128x128 sprites; source intact; transparent edges; ZIP valid.")


if __name__ == "__main__":
    main()
