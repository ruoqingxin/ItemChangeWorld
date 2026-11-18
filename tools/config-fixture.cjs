const fs = require("node:fs"), path = require("node:path");
const root = path.resolve(__dirname, "..");
const build = path.resolve(process.argv[2] || path.join(root, "bin/gameplay-tests"));
global.Laya = {Resource: class {}, Byte: class {
    constructor(b) { this.bytes = Buffer.from(b); this.pos = 0; }
    readUTFBytes(n) { const s = this.bytes.toString("utf8", this.pos, this.pos + n); this.pos += n; return s; }
}};
const load = p => require(path.join(build, "script", p));
const {Tables} = load("config/schema.js");
const ByteBuf = load("config/bright/serialization/ByteBuf.js").default;
const bytes = fs.readFileSync(path.join(root, "assets/config/configbin.bin")), blocks = {};
let offset = 4;
for (let i = 0; i < bytes.readInt32LE(0); i++) {
    const size = bytes.readInt32LE(offset); offset += 4;
    const name = bytes.toString("utf8", offset, offset + size); offset += size;
    const length = bytes.readInt32LE(offset); offset += 4;
    blocks[name] = bytes.subarray(offset, offset + length); offset += length;
}
if (offset !== bytes.length) throw new Error("配置包长度不正确");
const tables = new Tables(name => new ByteBuf(new Uint8Array(blocks[name])));
const {ExpeditionRunConfigUtils} = load("module/expedition/utils/ExpeditionRunConfigUtils.js");
module.exports = {root, build, load, blocks, tables, config: ExpeditionRunConfigUtils.read(tables)};
