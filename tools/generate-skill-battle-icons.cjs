// Run with NODE_PATH pointing at a runtime containing lucide and sharp.
const { icons } = require("lucide");
const sharp = require("sharp");
const fs = require("node:fs");
const path = require("node:path");
const output = path.join(__dirname, "../assets/ui/texture/skillBattle");
fs.mkdirSync(output, { recursive: true });
const specs = ["Sword", "Shield", "Zap", "ShieldOff"].map((name, index) => [name, `skill-${index + 1}`, "#c5d5bd"]);
specs.push(["Flame", "fire_stone", "#e29c89"], ["Hexagon", "earth_stone", "#d4bc7e"], ["FlaskRound", "heal", "#9ac8ae"]);
Promise.all(specs.map(async ([name, file, color]) => {
    const nodes = icons[name].map(([tag, attributes]) =>
        `<${tag} ${Object.entries(attributes).map(([key, value]) => `${key}="${value}"`).join(" ")}/>`).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24"
        fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${nodes}</svg>`;
    await sharp(Buffer.from(svg)).png().toFile(path.join(output, `${file}.png`));
})).catch(error => { console.error(error); process.exitCode = 1; });
