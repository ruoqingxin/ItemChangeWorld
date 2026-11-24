import type { InventoryConfig, InventoryItem, InventoryLocation, InventoryState, InventoryWarehousePlacement } from "../../inventory/types/InventoryTypes";
import { InventoryRules } from "../../inventory/utils/InventoryRules";
import type { MarketCategory, MarketGoods } from "../types/MarketTypes";

export class MarketRules {
    static validateOffer(config: InventoryConfig, offer: MarketGoods): void {
        if (!offer || !Number.isSafeInteger(offer.id) || offer.id <= 0 ||
            !Number.isSafeInteger(offer.itemId) || !config.templates.some(t => t.id === offer.itemId) ||
            !Number.isSafeInteger(offer.price) || offer.price < 0 ||
            !Number.isSafeInteger(offer.limitCount) || offer.limitCount < 1 || offer.enabled !== true)
            throw new Error("商品已下架或配置无效");
    }

    static purchased(state: InventoryState, goodsId: number): number {
        return state.marketPurchases?.find(row => row.goodsId === goodsId)?.count ?? 0;
    }

    static remaining(state: InventoryState, offer: MarketGoods): number {
        return Math.max(0, offer.limitCount - this.purchased(state, offer.id));
    }

    static preview(config: InventoryConfig, state: InventoryState, offer: MarketGoods, seed: number): InventoryItem {
        this.validateOffer(config, offer);
        const count = Math.min(offer.limitCount, this.purchased(state, offer.id) + 1);
        return InventoryRules.createItem(config, offer.itemId, `${state.runId}:market:${offer.id}:${count}`,
            { space: "warehouse" }, seed);
    }

    static purchase(config: InventoryConfig, state: InventoryState, offer: MarketGoods, to: InventoryLocation, seed: number): void {
        this.validateOffer(config, offer);
        if (state.phase !== "preparation") throw new Error("坊市仅在局外开放");
        const record = state.marketPurchases?.find(row => row.goodsId === offer.id);
        if (record && record.itemId !== offer.itemId) throw new Error("商品编号关联的物品已改变");
        if (!this.remaining(state, offer)) throw new Error("该商品已达限购数量");
        if (state.wish < offer.price) throw new Error(`愿力不足，需要${offer.price}，当前${state.wish}`);
        if (!to || to.space !== "bag" || Object.keys(to).some(key => !["space", "x", "y", "rotated"].includes(key)))
            throw new Error("商品只能拖入当前背包购买");
        const projection = InventoryRules.bagProjection(config, state);
        if (projection.overflow.length) throw new Error("背包空间不足，请先取出待整理物品");
        const item = this.preview(config, state, offer, seed);
        if (state.items.some(existing => existing.uid === item.uid)) throw new Error("商品已购买，请刷新");
        this.applyBagProjection(state, projection.state);
        item.location = { ...to };
        state.items.push(item);
        // 背包落格、扣款和限购在同一条命令中校验并保存。
        state.wish -= offer.price;
        state.marketPurchases ||= [];
        if (record) record.count++;
        else state.marketPurchases.push({ goodsId: offer.id, itemId: offer.itemId, count: 1 });
    }

    static sell(config: InventoryConfig, state: InventoryState, uid: string, from: InventoryLocation): void {
        if (state.phase !== "preparation") throw new Error("坊市仅在局外开放");
        const item = InventoryRules.item(state, uid);
        if (item.location.space !== "bag" || from?.space !== "bag") throw new Error("只能出售当前背包内的物品");
        const projection = InventoryRules.bagProjection(config, state);
        const shown = InventoryRules.item(projection.state, uid);
        if (!InventoryRules.same(shown.location, from)) throw new Error("物品来源已改变，请重新拖动");
        if (!projection.overflow.length) this.applyBagProjection(state, projection.state);
        state.wish += InventoryRules.template(config, item).recyclePrice;
        item.location = { space: "consumed" };
        state.consumed.push(uid);
    }

    private static applyBagProjection(state: InventoryState, projected: InventoryState): void {
        for (const item of state.items.filter(row => row.location.space === "bag"))
            item.location = { ...InventoryRules.item(projected, item.uid).location };
        state.bagColumns = 7;
    }

    static category(kind: string): MarketCategory {
        return ["weapon", "armor", "accessory", "container"].includes(kind) ? kind as MarketCategory : "material";
    }

    static shelf(config: InventoryConfig, state: InventoryState, goods: readonly MarketGoods[],
        category: MarketCategory, seed: number): Array<{ offer: MarketGoods; item: InventoryItem; slot: InventoryWarehousePlacement }> {
        const selected = goods.filter(offer => offer.enabled &&
            this.category(config.templates.find(t => t.id === offer.itemId)?.kind ?? "") === category);
        const items = selected.map(offer => this.preview(config, state, offer, seed));
        const slots = InventoryRules.warehousePlacements(config, { ...state, items, warehouseLayout: undefined });
        return selected.map((offer, index) => ({ offer, item: items[index], slot: slots[index] }));
    }
}
