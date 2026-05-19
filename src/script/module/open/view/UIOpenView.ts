import { ConfigLoader, ConfigUtil } from "src/script/config/ConfigUtil";
import { UIBaseView } from "src/script/games/ui/UIBaseView";
import { UILayer } from "src/script/games/ui/UILayer";
import { OpenSearchItemData } from "../data/OpenSearchItemData";
import { ItemDisplayUtil } from "../util/ItemDisplayUtil";
import { OPEN_ITEM_CELL_SIZE, UIOpenItemCell } from "./UIOpenItemCell";

/**
 * 搜打撤 - 物品搜索/开箱展示界面
 * 使用预制 UIOpenView.lh，品质框资源：ui/image/itemQualityBg/ui_bg_djk_{quality}.png
 */
export class UIOpenView extends UIBaseView {
    private static readonly COL_COUNT = 5;

    public get layer(): UILayer {
        return UILayer.Second;
    }

    public get path(): string {
        return "ui/prefab/module/open/UIOpenView.lh";
    }

    protected get dependencyRes(): string[] {
        return ItemDisplayUtil.getQualityBgUrls();
    }

    private box: Laya.GBox;
    private _cells: UIOpenItemCell[] = [];

    protected onConstruct(): void {
        this.box = this.getElement<Laya.GBox>("box");
        this.addClickListener(this.getElement("btn_close"), this.onClickClose);
        this._clearPlaceholderSlots();
    }

    /**
     * @param items 搜索到的物品列表；不传则取配置表前若干条做演示
     */
    onOpen(items?: OpenSearchItemData[]): void {
        const show = () => {
            const list = items && items.length > 0 ? items : this._buildDemoItems();
            this._refreshItems(list);
        };
        if (ConfigUtil.Tables?.item) {
            show();
            return;
        }
        ConfigLoader.loadAllConfig(Laya.Handler.create(this, (ok: boolean) => {
            if (!ok) {
                console.error("[UIOpenView] 配置加载失败");
                return;
            }
            show();
        }));
    }

    protected onClose(): void {
        this._clearCells();
    }

    private onClickClose(): void {
        this.close();
    }

    /** 移除预制里用于占位的静态图，改由代码动态生成格子 */
    private _clearPlaceholderSlots(): void {
        if (!this.box) {
            return;
        }
        const children = [...this.box._children];
        for (const child of children) {
            if (child.name.startsWith("img_")) {
                child.removeSelf();
                child.destroy();
            }
        }
    }

    private _refreshItems(items: OpenSearchItemData[]): void {
        this._clearCells();
        if (!this.box) {
            return;
        }

        const rowCount = Math.max(1, Math.ceil(items.length / UIOpenView.COL_COUNT));
        this.box.height = rowCount * OPEN_ITEM_CELL_SIZE;

        items.forEach((data, index) => {
            const cfg = ConfigUtil.Tables?.item?.get(data.itemId);
            if (!cfg) {
                console.warn(`[UIOpenView] 未找到物品配置: ${data.itemId}`);
                return;
            }
            const cell = new UIOpenItemCell(this.box, index);
            cell.bind(cfg, data.count ?? 1);
            this._cells.push(cell);
        });
    }

    private _clearCells(): void {
        for (const cell of this._cells) {
            cell.destroy();
        }
        this._cells.length = 0;
    }

    /** 配置未传入时，从物品表取前 12 条做展示 */
    private _buildDemoItems(): OpenSearchItemData[] {
        const table = ConfigUtil.Tables?.item;
        if (!table) {
            return [];
        }
        const list = table.getDataList();
        const max = Math.min(12, list.length);
        const result: OpenSearchItemData[] = [];
        for (let i = 0; i < max; i++) {
            const cfg = list[i];
            result.push({
                itemId: cfg.id,
                count: (i % 3) + 1,
            });
        }
        return result;
    }
}
