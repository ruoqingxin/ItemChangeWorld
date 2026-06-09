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
     * 将品质框、图标、数量渲染到 itemCell（img_item 品质框，可选 img_icon）
     */
    static applyItemCell(
        cell: Laya.GWidget,
        itemCfg: IitemConfig,
    ): void {
        const imgItem = cell.getChildByName("img_item") as Laya.GImage;
        let imgIcon = cell.getChildByName("img_icon") as Laya.GImage;

        const cellW = cell.width;
        const cellH = cell.height;

        if (imgItem) {
            imgItem.src = ItemDisplayUtil.getQualityBgUrl(itemCfg.quality);
        }

        const iconUrl = ItemDisplayUtil.getItemIconUrl(itemCfg.icon);
        if (iconUrl) {
            if (!imgIcon) {
                const iconSize = Math.floor(Math.min(cellW, cellH) * 0.72);
                imgIcon = new Laya.GImage();
                imgIcon.name = "img_icon";
                imgIcon.size(iconSize, iconSize);
                imgIcon.pos((cellW - iconSize) / 2, (cellH - iconSize) / 2);
                imgIcon.autoSize = false;
                cell.addChild(imgIcon);
            }
            imgIcon.src = iconUrl;
            imgIcon.visible = true;
        } else if (imgIcon) {
            imgIcon.visible = false;
        }
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
