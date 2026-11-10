import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const source = "E:/NowChange/config/Datas/N-新版战斗配置表.xlsx";
const output = "E:/NowChange/ItemChangeWorld/tmp/naxu-config-20261110";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(source));
if (process.argv.includes("--verify")) {
    const before = await SpreadsheetFile.importXlsx(await FileBlob.load(`${output}/source-before.xlsx`));
    for (let i = 0; i < 14; i++) {
        const sheet = workbook.worksheets.getItemAt(i), original = before.worksheets.getItemAt(i);
        assert.equal(sheet.name, original.name);
        if (["inventory_item", "inventory_fixture"].includes(sheet.name)) continue;
        assert.deepEqual(sheet.getUsedRange().values, original.getUsedRange().values, sheet.name);
        assert.deepEqual(sheet.getUsedRange().formulas, original.getUsedRange().formulas, sheet.name);
    }
    assert.deepEqual(workbook.worksheets.getItem("inventory_item").getRange("A5:N13").values,
        before.worksheets.getItem("inventory_item").getRange("A5:N13").values);
    assert.deepEqual(workbook.worksheets.getItem("inventory_fixture").getRange("A1:F29").values,
        before.worksheets.getItem("inventory_fixture").getRange("A1:F29").values);
    console.log("Saved workbook verified: 14 sheet names/order, 12 untouched tabs, original non-container cells and existing fixture rows unchanged.");
    process.exit(0);
}
const editing = process.argv.includes("--write");
if (!editing) {
    console.log((await workbook.inspect({kind: "sheet", include: "id,name", maxChars: 5000})).ndjson);
    for (const name of ["inventory_item", "inventory_fixture"]) {
        const sheet = workbook.worksheets.getItem(name);
        console.log(name, JSON.stringify(sheet.getUsedRange().values));
    }
    const preview = await workbook.render({sheetName: "inventory_item", range: "A1:N15", scale: 1, format: "png"});
    await fs.writeFile(`${output}/source-inventory.png`, new Uint8Array(await preview.arrayBuffer()));
    process.exit(0);
}

const items = [
    [10, "素麻囊", "pouch", 1, 4, 3],
    [12, "灰木匣", "box", 1, 4, 3],
    [13, "云纹佩", "pendant", 2, 4, 4],
    [14, "青藤葫", "gourd", 2, 4, 4],
    [15, "玄纹匣", "box", 3, 7, 3],
    [16, "青铜鼎", "cauldron", 3, 7, 3],
    [17, "云阙印", "seal", 4, 7, 4],
    [11, "玄玉戒", "ring", 4, 7, 4],
    [18, "金络葫", "gourd", 5, 6, 6],
    [19, "承虚镜", "mirror", 5, 6, 6],
    [20, "须弥珠", "orb", 6, 8, 6],
    [21, "太虚鼎", "cauldron", 6, 8, 6],
];
const snapshot = {};
for (let i = 0; i < 14; i++) {
    const sheet = workbook.worksheets.getItemAt(i), range = sheet.getUsedRange();
    snapshot[sheet.name] = {values: range.values, formulas: range.formulas};
}
await fs.copyFile(source, `${output}/source-before.xlsx`);
await fs.copyFile("E:/NowChange/ItemChangeWorld/assets/config/configbin.bin", `${output}/config-before.bin`);
const sheet = workbook.worksheets.getItem("inventory_item");
const original = sheet.getUsedRange().values;
sheet.unmergeCells("B16:N16");
sheet.getRange("O1:O4").copyFrom(sheet.getRange("M1:M4"), "all");
sheet.getRange("O1:O4").values = [["quality"], ["EQuality"], ["c"], ["品质"]];
sheet.getRange("O1:O26").format.columnWidth = 12;
sheet.getRange("O5:O13").values = Array.from({length: 9}, () => ["normal"]);
const quality = ["", "normal", "excellent", "fine", "rare", "epic", "legendary"];
for (let id = 10; id <= 21; id++) {
    const [itemId, name, family, tier, width, height] = items.find(t => t[0] === id);
    const row = id + 4;
    if (row > 15) sheet.getRange(`A${row}:O${row}`).copyFrom(sheet.getRange("A14:O14"), "all");
    sheet.getRange(`A${row}:O${row}`).values = [[null, itemId, name, "container", 2, 2, 1, 0, 0, 1, 0,
        width, height, `ui/image/naxu/naxu-${family}-q${tier}.png`, quality[tier]]];
}
sheet.getRange("A26:O26").copyFrom(sheet.getRange("A4:O4"), "all");
sheet.getRange("A26:O26").clear({applyTo: "contents"});
sheet.getRange("A26:B26").values = [["##", "2026-11-10 六品质容器；容量12/16/21/28/36/48格为可调测试起点，实体均2×2"]];
sheet.mergeCells("B26:O26");
sheet.getRange("A16:O26").format.rowHeight = 26;
// Only the expanded icon field needs a wider column; other sheets keep their layout.
sheet.getRange("N1:N26").format.columnWidth = 54;

const fixtures = workbook.worksheets.getItem("inventory_fixture");
fixtures.unmergeCells("B30:F30");
for (let i = 0; i < 10; i++) {
    const id = 12 + i, row = 30 + i;
    fixtures.getRange(`A${row}:F${row}`).copyFrom(fixtures.getRange("A15:F15"), "all");
    fixtures.getRange(`A${row}:F${row}`).values = [[null, 26 + i, id, 1, 0, 0]];
}
fixtures.getRange("A40:F40").copyFrom(fixtures.getRange("A4:F4"), "all");
fixtures.getRange("A40:F40").clear({applyTo: "contents"});
fixtures.getRange("A40:B40").values = [["##", "新增容器各1份仅供储物演练，不代表正式初赠或掉落"]];
fixtures.mergeCells("B40:F40");
fixtures.getRange("A30:F40").format.rowHeight = 26;
for (let i = 0; i < 14; i++) {
    const current = workbook.worksheets.getItemAt(i);
    if (["inventory_item", "inventory_fixture"].includes(current.name)) continue;
    assert.deepEqual(current.getUsedRange().values, snapshot[current.name].values, current.name);
    assert.deepEqual(current.getUsedRange().formulas, snapshot[current.name].formulas, current.name);
}
assert.deepEqual(sheet.getRange("A5:N13").values, original.slice(4, 13));
console.log((await workbook.inspect({kind: "table", range: "inventory_item!B14:O25",
    include: "values,formulas", tableMaxRows: 12, tableMaxCols: 14, maxChars: 6500})).ndjson);
console.log((await workbook.inspect({kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
    options: {useRegex: true, maxResults: 20}, maxChars: 2000})).ndjson);
const preview = await workbook.render({sheetName: "inventory_item", range: "B14:O25", scale: 1, format: "png"});
await fs.writeFile(`${output}/updated-inventory.png`, new Uint8Array(await preview.arrayBuffer()));
await fs.mkdir(`${output}/outputs`, {recursive: true});
const result = await SpreadsheetFile.exportXlsx(workbook);
await result.save(`${output}/outputs/N-新版战斗配置表.xlsx`);
await fs.writeFile(`${output}/items.json`, JSON.stringify(items, null, 2));
console.log("Exported workbook; source replacement is a separate verified step.");
