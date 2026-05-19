import { IitemConfig } from "src/script/config/schema";
import { UIUtils } from "src/script/games/utils/UIUtils";

/** 品质框资源最大档位（对应 itemQualityBg/ui_bg_djk_N） */
const MAX_ITEM_QUALITY = 7;

/**
 * 物品展示工具：品质框、图标路径
 */
export class ItemDisplayUtil {
    /**
     * 根据品质获取品质框图片路径
     */
    static getQualityBgUrl(quality: number): string {
        const q = Math.max(1, Math.min(MAX_ITEM_QUALITY, quality || 1));
        return UIUtils.getImageUrl("itemQualityBg", `ui_bg_djk_${q}`);
    }

    /**
     * 根据配置 icon 字段解析图标路径
     */
    static getItemIconUrl(icon: string): string {
        if (!icon) {
            return "";
        }
        if (icon.indexOf("/") >= 0) {
            return icon;
        }
        if (icon.endsWith(".png") || icon.endsWith(".jpg")) {
            return `ui/texture/${icon}`;
        }
        return UIUtils.getTextureUrl("item", icon);
    }

    /**
     * 将品质框、图标、数量渲染到格子节点（需含 img_quality、img_icon，可选 txt_count）
     */
    static applyItemCell(
        cell: Laya.GWidget,
        itemCfg: IitemConfig,
        count: number = 1
    ): void {
        const imgQuality = cell.getChildByName("img_quality") as Laya.GImage;
        const imgIcon = cell.getChildByName("img_icon") as Laya.GImage;
        const txtCount = cell.getChildByName("txt_count") as Laya.GTextField;

        if (imgQuality) {
            imgQuality.src = ItemDisplayUtil.getQualityBgUrl(itemCfg.quality);
        }
        if (imgIcon) {
            const iconUrl = ItemDisplayUtil.getItemIconUrl(itemCfg.icon);
            imgIcon.src = iconUrl;
            imgIcon.visible = !!iconUrl;
        }
        if (txtCount) {
            if (count > 1) {
                txtCount.text = count.toString();
                txtCount.visible = true;
            } else {
                txtCount.visible = false;
            }
        }
        cell.visible = true;
    }

    /**
     * 预加载常用品质框（1~7）
     */
    static getQualityBgUrls(): string[] {
        const urls: string[] = [];
        for (let i = 1; i <= MAX_ITEM_QUALITY; i++) {
            urls.push(ItemDisplayUtil.getQualityBgUrl(i));
        }
        return urls;
    }
}
