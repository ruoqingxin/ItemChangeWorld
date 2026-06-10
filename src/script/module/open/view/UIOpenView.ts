import { ConfigLoader, ConfigUtil } from "src/script/config/ConfigUtil";
import { IitemConfig } from "src/script/config/schema";
import { UIBaseView } from "src/script/games/ui/UIBaseView";
import { UILayer } from "src/script/games/ui/UILayer";
import { OpenSearchItemData } from "../data/OpenSearchItemData";
import { OpenGridUtil } from "../util/OpenGridUtil";
import { OpenSearchUtil } from "../util/OpenSearchUtil";
import { ItemDisplayUtil } from "../util/ItemDisplayUtil";
import { OPEN_ITEM_CELL_SIZE, UIOpenItemCell } from "./UIOpenItemCell";

interface OpenViewItemEntry {
    data: OpenSearchItemData;
    cfg: IitemConfig;
}

/**
 * 物品搜索/开箱展示界面
 * 使用预制 UIOpenView.lh，品质框资源：ui/image/itemQualityBg/ui_bg_djk_{quality}.png
 * 搜索时长由品质决定，占位格数由 bag_size 决定
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
    private _itemCellTemplate: Laya.GWidget;
    private _cells: UIOpenItemCell[] = [];
    private _searchEntries: OpenViewItemEntry[] = [];
    private _searching = false;

    protected onConstruct(): void {
        this.box = this.getElement<Laya.GBox>("box");
        this._itemCellTemplate = this.getElement<Laya.GWidget>("itemCell");
        if (this._itemCellTemplate) {
            this._itemCellTemplate.visible = false;
        }
        this.addClickListener(this.getElement("btn_close"), this.onClickClose);
    }

    /**
    * @param items 搜索到的物品列表；不传则取配置表若干条做演示
    */
    onOpen(items?: OpenSearchItemData[]): void {

        const list = items && items.length > 0 ? items : this._buildDemoItems();
        this._startSearch(list);
    }



    protected onClose(): void {
        this._stopSearch();
        this._clearCells();
    }



    private onClickClose(): void {
        this.close();
    }



    private _startSearch(items: OpenSearchItemData[]): void {
        this._stopSearch();
        this._clearCells();
        if (!this.box || !this._itemCellTemplate || items.length === 0) {
            return;
        }

        const entries = this._resolveEntries(items);
        if (entries.length === 0) {
            return;
        }

        const placements = OpenGridUtil.layoutItems(
            entries.map((e) => e.cfg.bag_size),
            UIOpenView.COL_COUNT
        );

        const rowCount = OpenGridUtil.getRequiredRowCount(placements);
        this.box.height = rowCount * OPEN_ITEM_CELL_SIZE;
        this._searchEntries = entries;
        this._searching = true;

        entries.forEach((entry, index) => {
            const cell = new UIOpenItemCell(this.box, placements[index], this._itemCellTemplate);
            cell.bind(entry.cfg, entry.data.count ?? 1);
            this._cells.push(cell);
        });

        this._searchNext(0);
    }

    /** 按顺序逐个搜索：当前格子动画完成并揭示后，再开始下一个 */
    private _searchNext(index: number): void {
        if (!this._searching || index >= this._cells.length) {
            if (index >= this._cells.length) {
                this._searching = false;
            }
            return;
        }

        const cell = this._cells[index];
        const entry = this._searchEntries[index];
        const duration = OpenSearchUtil.getSearchDurationMs(entry.cfg.quality);

        cell.playSearch(duration, () => {
            if (!this._searching) {
                return;
            }
            cell.reveal();
            this._searchNext(index + 1);
        });
    }



    private _resolveEntries(items: OpenSearchItemData[]): OpenViewItemEntry[] {
        const result: OpenViewItemEntry[] = [];
        for (const data of items) {
            const cfg = ConfigUtil.Tables?.item?.get(data.itemId);
            if (!cfg) {
                console.warn(`[UIOpenView] 未找到物品配置: ${data.itemId}`);
                continue;
            }
            result.push({ data, cfg });
        }
        return result;
    }

    private _stopSearch(): void {
        this._searching = false;
        this._searchEntries.length = 0;
        for (const cell of this._cells) {
            cell.stopSearch();
        }
    }

    private _clearCells(): void {
        for (const cell of this._cells) {
            cell.destroy();
        }
        this._cells.length = 0;
    }

    /** 配置未传入时，优先挑选不同 size/品质做演示 */
    private _buildDemoItems(): OpenSearchItemData[] {
        const table = ConfigUtil.Tables?.item;
        if (!table) {
            return [];
        }
        const list = table.getDataList();
        const picked: IitemConfig[] = [];
        const seenSize = new Set<number>();

        for (const cfg of list) {
            if (!seenSize.has(cfg.bag_size)) {
                seenSize.add(cfg.bag_size);
                picked.push(cfg);
            }

            if (picked.length >= 8) {
                break;
            }
        }

        if (picked.length < 8) {
            for (const cfg of list) {
                if (picked.indexOf(cfg) >= 0) {
                    continue;
                }
                picked.push(cfg);
                if (picked.length >= 8) {
                    break;
                }
            }
        }

        return picked.map((cfg, i) => ({
            itemId: cfg.item_id,
            count: (i % 3) + 1,
        }));
    }
}

