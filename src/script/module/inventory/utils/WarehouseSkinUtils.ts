export class WarehouseSkinUtils {
    static configure(root: Laya.GWidget): void {
        const grids: Record<string, number[]> = {
            "graphite/panel": [20, 20, 20, 20, 0],
            "graphite/scroll-track": [8, 4, 8, 4, 0],
        };
        for (const state of ["normal", "pressed", "disabled"]) {
            grids[`graphite/button-${state}`] = [6, 38, 16, 38, 0];
            grids[`graphite/square-${state}`] = [8, 18, 20, 18, 0];
        }
        for (const state of ["normal", "selected", "locked"])
            grids[`graphite/page-${state}`] = [10, 12, 10, 12, 0];
        for (const state of ["normal", "pressed"])
            grids[`graphite/scroll-${state}`] = [8, 6, 8, 6, 0];
        // 原 PNG 预览和编辑器导入共用九宫参数，并提前准备选中纹理。
        for (const [name, grid] of Object.entries(grids)) {
            const texture = Laya.loader.getRes(`ui/atlas/module/warehouse/${name}.png`) as Laya.Texture;
            if (texture) texture._sizeGrid = grid;
        }
        const refresh = (node: Laya.GWidget): void => {
            if (node instanceof Laya.GImage && node.src.startsWith("ui/atlas/module/warehouse/")) {
                const src = node.src;
                node.src = "";
                node.src = src;
            }
            for (let i = 0; i < node.numChildren; i++) refresh(node.getChildAt(i) as Laya.GWidget);
        };
        refresh(root);
    }
}
