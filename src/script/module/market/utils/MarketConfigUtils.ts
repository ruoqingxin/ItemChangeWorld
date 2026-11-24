import type { Tables } from "../../../config/schema";
import { byConfigId } from "../../../config/ConfigRows";
import type { MarketGoods } from "../types/MarketTypes";

export class MarketConfigUtils {
    static read(tables: Tables): MarketGoods[] {
        return byConfigId(tables.market_goods.getDataList(), "商品表").map(row => {
            const item = tables.item.get(row.item_id);
            if (!item || !Number.isSafeInteger(row.price) || row.price < 0 ||
                !Number.isSafeInteger(row.limit_count) || row.limit_count < 1 ||
                ![0, 1].includes(row.enabled) || row.enabled === 1 && item.enabled !== 1)
                throw new Error(`商品 ${row.id} 的物品引用、售价、限购或上架配置无效`);
            return { id: row.id, itemId: row.item_id, price: row.price,
                limitCount: row.limit_count, enabled: row.enabled === 1 };
        });
    }
}
