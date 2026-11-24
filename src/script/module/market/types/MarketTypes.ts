export interface MarketGoods {
    id: number;
    itemId: number;
    price: number;
    limitCount: number;
    enabled: boolean;
}

export interface MarketPurchaseCount {
    goodsId: number;
    itemId: number;
    count: number;
}

export type MarketCategory = "weapon" | "armor" | "accessory" | "container" | "material";
