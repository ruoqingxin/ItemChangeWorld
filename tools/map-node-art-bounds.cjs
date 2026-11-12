const assert = require("node:assert/strict");

function componentBounds(data, width, height, threshold = 224) {
    const seen = new Uint8Array(width * height), queue = new Int32Array(width * height);
    let largest;
    for (let start = 0; start < seen.length; start++) {
        if (seen[start] || data[start * 4 + 3] < threshold) continue;
        let count = 1, cursor = 0, left = width, top = height, right = 0, bottom = 0;
        queue[0] = start; seen[start] = 1;
        while (cursor < count) {
            const at = queue[cursor++], x = at % width, y = Math.floor(at / width);
            left = Math.min(left, x); top = Math.min(top, y);
            right = Math.max(right, x); bottom = Math.max(bottom, y);
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue;
                const next = (y + dy) * width + x + dx;
                if (seen[next] || data[next * 4 + 3] < threshold) continue;
                seen[next] = 1; queue[count++] = next;
            }
        }
        if (!largest || count > largest.count)
            largest = { left, top, width: right - left + 1, height: bottom - top + 1, count };
    }
    assert.ok(largest?.count > 100, "A substantial opaque subject is required");
    return largest;
}

module.exports = { componentBounds };
