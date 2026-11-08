const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const source = path.join(__dirname, "../document/UI参考");
const output = path.join(__dirname, "../bin/ui-reference");
const files = fs.readdirSync(source).filter(name => /\.(jpe?g|png)$/i.test(name)).sort();
const columns = 5, rows = 2, width = 300, height = 169, gap = 12;

async function main() {
    fs.mkdirSync(output, { recursive: true });
    for (let page = 0; page * columns * rows < files.length; page++) {
        const subset = files.slice(page * columns * rows, (page + 1) * columns * rows);
        const canvas = sharp({
            create: {
                width: columns * width + (columns + 1) * gap,
                height: rows * height + (rows + 1) * gap,
                channels: 3,
                background: "#111713",
            },
        });
        const layers = [];
        for (let index = 0; index < subset.length; index++) {
            const sourceIndex = page * columns * rows + index;
            const x = gap + index % columns * (width + gap);
            const y = gap + Math.floor(index / columns) * (height + gap);
            const image = await sharp(path.join(source, subset[index]))
                .resize(width, height, { fit: "cover" })
                .toBuffer();
            layers.push({ input: image, left: x, top: y });
            const label = Buffer.from(`<svg width="${width}" height="32">
                <rect x="0" y="0" width="54" height="28" fill="#0b100d" fill-opacity="0.85"/>
                <text x="8" y="20" font-size="17" font-family="Arial" fill="#f0df9a">${sourceIndex + 1}</text>
            </svg>`);
            layers.push({ input: label, left: x, top: y + height - 32 });
        }
        await canvas.composite(layers).jpeg({ quality: 90 })
            .toFile(path.join(output, `references-${page + 1}.jpg`));
    }
    console.log(JSON.stringify(files.map((name, index) => ({ index: index + 1, name })), null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
