"""Make a periodic ground tile using narrow, content-aware overlap seams."""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


def seam_cost(a, b, radius):
    difference = np.mean((a - b) ** 2, axis=2)
    padded = np.pad(difference, ((0, 0), (radius, radius)), mode="edge")
    sums = np.pad(np.cumsum(padded, axis=1), ((0, 0), (1, 0)))
    return (sums[:, 2 * radius + 1:] - sums[:, :-2 * radius - 1]) / (2 * radius + 1)


def minimum_seam(cost, margin, closed):
    height, width = cost.shape
    cost = cost.copy()
    cost[:, :margin] = np.inf
    cost[:, -margin:] = np.inf
    starts = np.arange(margin, width - margin, 12) if closed else None
    count = len(starts) if closed else 1
    parents = np.zeros((count, height, width), dtype=np.int8)
    previous = np.full((count, width), np.inf)
    if closed:
        previous[np.arange(count), starts] = cost[0, starts]
    else:
        previous[0] = cost[0]
    for row in range(1, height):
        left = np.pad(previous[:, :-1], ((0, 0), (1, 0)), constant_values=np.inf)
        right = np.pad(previous[:, 1:], ((0, 0), (0, 1)), constant_values=np.inf)
        choices = np.stack((left, previous, right))
        parents[:, row] = np.argmin(choices, axis=0).astype(np.int8) - 1
        previous = np.min(choices, axis=0) + cost[row]
    if closed:
        candidate = int(np.argmin(previous[np.arange(count), starts]))
        column = int(starts[candidate])
    else:
        candidate, column = 0, int(np.argmin(previous[0]))
    result = np.empty(height, dtype=np.int32)
    result[-1] = column
    for row in range(height - 1, 0, -1):
        column += int(parents[candidate, row, column])
        result[row - 1] = column
    if closed:
        assert result[0] == result[-1], "Second seam must close across the first axis."
    return result


def stitch_horizontal(image, overlap, feather, closed=False):
    width = image.shape[1] - overlap
    a, b = image[:, width:], image[:, :overlap]
    path = minimum_seam(seam_cost(a, b, feather), feather * 2, closed)
    fraction = np.clip(
        (np.arange(overlap)[None, :] - path[:, None] + feather) / (2 * feather), 0, 1
    )
    fraction = (fraction * fraction * (3 - 2 * fraction))[:, :, None]
    result = image[:, :width].copy()
    result[:, :overlap] = a * (1 - fraction) + b * fraction
    return result, path


def metrics(image):
    pixels = image.astype(np.float32)
    horizontal = np.mean(np.abs(pixels[:, 1:] - pixels[:, :-1]), axis=(0, 2))
    vertical = np.mean(np.abs(pixels[1:] - pixels[:-1]), axis=(1, 2))
    return {
        "left_right_mean_difference": float(np.mean(np.abs(pixels[:, 0] - pixels[:, -1]))),
        "top_bottom_mean_difference": float(np.mean(np.abs(pixels[0] - pixels[-1]))),
        "interior_horizontal_median": float(np.median(horizontal)),
        "interior_vertical_median": float(np.median(vertical)),
    }


def preview(image, file, size):
    image = image.copy()
    image.thumbnail((size, size), Image.Resampling.LANCZOS)
    image.save(file)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--overlap", type=int, default=256)
    parser.add_argument("--feather", type=int, default=8)
    args = parser.parse_args()
    source_hash = hashlib.sha256(args.source.read_bytes()).hexdigest()
    original = Image.open(args.source).convert("RGB")
    pixels = np.asarray(original).astype(np.float32)
    assert min(original.size) > args.overlap * 3
    assert args.overlap > args.feather * 8
    stitched, x_path = stitch_horizontal(pixels, args.overlap, args.feather)
    transposed, y_path = stitch_horizontal(
        stitched.transpose(1, 0, 2), args.overlap, args.feather, closed=True
    )
    repaired = np.clip(np.rint(transposed.transpose(1, 0, 2)), 0, 255).astype(np.uint8)
    image = Image.fromarray(repaired)
    core = repaired[args.overlap:, args.overlap:]
    assert np.array_equal(
        core, pixels[args.overlap:image.height, args.overlap:image.width]
    ), "The central artwork must remain byte-for-byte unchanged."
    output_metrics = metrics(repaired)
    for edge, interior in (
        ("left_right_mean_difference", "interior_horizontal_median"),
        ("top_bottom_mean_difference", "interior_vertical_median"),
    ):
        assert output_metrics[edge] <= 1.5 * output_metrics[interior], (
            f"{edge} is still stronger than typical neighboring pixel differences."
        )
    args.output.mkdir(parents=True, exist_ok=True)
    image.save(args.output / "ancient-sect-ground-seamless-v1.png")
    tiled = np.tile(repaired, (2, 2, 1))
    preview(Image.fromarray(tiled), args.output / "preview-2x2.png", 1440)
    offset = np.roll(repaired, (image.height // 2, image.width // 2), axis=(0, 1))
    preview(Image.fromarray(offset), args.output / "preview-offset.png", 1200)
    report = {
        "method": "Minimum-error overlap seams with 16px feather; no AI generation or mirroring.",
        "source": str(args.source.resolve()),
        "source_sha256": source_hash,
        "source_size": list(original.size),
        "output_size": list(image.size),
        "overlap": args.overlap,
        "feather": args.feather,
        "source_metrics": metrics(pixels),
        "output_metrics": output_metrics,
        "unmodified_core_fraction": core.shape[0] * core.shape[1] / (image.width * image.height),
        "validation": "Both wrap edges within 1.5x normal interior variation; central pixels unchanged.",
        "horizontal_cut_range": [int(x_path.min()), int(x_path.max())],
        "vertical_cut_range": [int(y_path.min()), int(y_path.max())],
    }
    (args.output / "repair-report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    assert hashlib.sha256(args.source.read_bytes()).hexdigest() == source_hash
    print(json.dumps(report, indent=2, ensure_ascii=True))


if __name__ == "__main__":
    main()
