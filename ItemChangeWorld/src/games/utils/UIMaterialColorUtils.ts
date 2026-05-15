import { ResLoader } from "../asset/ResLoader";

/**
 * 通过更改ui节点的材质球颜色修改节点颜色
 */
export class UIMaterialColorUtils {
    public static readonly shader_path = "shader/UIColor.shader";

    private static materilGray: Laya.Material;
    private static materilMap: { [color: string]: Laya.Material } = {};
    private static traverseAllNodes(node: Laya.Sprite, material: Laya.Material) {
        node.material = material;
        for (let i = 0; i < node.numChildren; i++) {
            this.traverseAllNodes(node.getChildAt(i), material);
        }
    }

    /**
     * 将ui的gray方法替换
     */
    static hookUIGray() {
        Object.defineProperty(Laya.GWidget.prototype, "grayed", {
            set: function (value) {
                value = !!value;
                if (this._grayed !== value) {
                    this._grayed = value;
                    UIMaterialColorUtils.setNodeFilterGray(this, value);
                }
            }
        });
    }

    /**
     * 设置节点颜色
     * 会自动修改子节点
     * @param node 节点
     * @param color 颜色
     * @returns 
     */
    public static setNodeFilterColor(node: Laya.GWidget, color: string) {
        if (!color) {
            this.traverseAllNodes(node, null);
            return;
        }
        if (color.length < 6 || (color.startsWith("#") && color.length < 7)) {
            return;
        }
        // 需要确保shader加载完毕
        const shader = ResLoader.getAssetSource(this.shader_path);
        if (!shader) {
            return;
        }
        let offset = 0;
        if (color.startsWith("#")) {
            offset = 1;
        }
        const str_r = color.substring(offset, offset + 2);
        const str_g = color.substring(offset + 2, offset + 4);
        const str_b = color.substring(offset + 4, offset + 6);
        const key = `${str_r}${str_g}${str_b}`.toLowerCase();
        if (key == `ffffff`) {
            this.traverseAllNodes(node, null);
        }
        else {
            let cacheMat = this.materilMap[key];
            if (!cacheMat) {
                cacheMat = new Laya.Material();
                cacheMat.lock = true;
                cacheMat.setShaderName("UIColor");

                let r = parseInt(str_r, 16) / 255;
                let g = parseInt(str_g, 16) / 255;
                let b = parseInt(str_b, 16) / 255;
                cacheMat.setColor("u_color", new Laya.Color(r, g, b));
                this.materilMap[key] = cacheMat;
            }
            this.traverseAllNodes(node, cacheMat);
        }
    }

    /**
     * 设置节点变灰（注意，该方法并不会将节点完全变成灰色，会保留一定原有颜色）
     * 会自动修改子节点
     * @param node 节点
     * @param gray 是否灰色
     * @returns 
     */
    public static setNodeFilterGray(node: Laya.GWidget, gray: boolean) {
        if (!gray) {
            this.traverseAllNodes(node, null);
            return;
        }
        if (!this.materilGray) {
            this.materilGray = new Laya.Material();
            this.materilGray.lock = true;
            this.materilGray.setShaderName("UIColor");
            this.materilGray.setFloat("u_grayScale", 0.9);
        }
        this.traverseAllNodes(node, this.materilGray);
    }
}