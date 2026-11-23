import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import { UIManager } from "../../../games/ui/UIManager";
import { openSkillBattleScreen } from "../../gameplay/utils/GameplayNavigation";
import { LobbySettingsView } from "./LobbySettingsView";
import { GameplayManager } from "../../gameplay/manager/GameplayManager";

export class LobbyView extends UIBaseView {
    get layer(): UILayer { return UILayer.Base; }
    get path(): string { return "ui/prefab/module/lobby/LobbyView.lh"; }
    private scene: Laya.GWidget;
    private background: Laya.GImage;
    private notice: Laya.GWidget;
    private noticeText: Laya.GTextField;
    private opening = false;
    private readonly nameplates: Laya.GImage[] = [];
    private readonly facilities: {
        node: Laya.GWidget; artwork: Laya.GWidget; plate: Laya.GImage; label: Laya.GTextField;
        scale: number; centerOffset: number; bottomRatio: number;
    }[] = [];

    protected onConstruct(): void {
        this.scene = this.getElement("box_courtyard");
        this.background = this.getElement("img_courtyard");
        this.notice = this.getElement("box_notice");
        this.noticeText = this.getElement("txt_notice");
        const alchemy = this.getElement<Laya.GWidget>("btn_alchemy");
        const forge = this.getElement<Laya.GWidget>("btn_forge");
        const warehouse = this.getElement<Laya.GWidget>("btn_warehouse");
        const library = this.getElement<Laya.GWidget>("btn_library");
        const realm = this.getElement<Laya.GWidget>("btn_realm");
        const market = this.getElement<Laya.GWidget>("btn_market");
        this.addClickListener(alchemy, () => this.showNotice("炼丹炉尚未开放"));
        this.addClickListener(forge, () => {
            try{
                const session=GameplayManager.getMapTrial();
                session.inventoryCommand({type:"repairAll"});
                this.showNotice(`修理完成，剩余愿力 ${session.inventory.wish}`);
            }catch(e){this.showNotice((e as Error).message);}
        });
        this.addClickListener(warehouse, this.onClickWarehouse);
        this.addClickListener(library, () => this.showNotice("功法查阅与升级尚未开放"));
        this.addClickListener(realm, this.onClickRealm);
        this.addClickListener(market, () => this.showNotice("坊市交易尚未开放"));
        this.addClickListener(this.getElement("btn_settings"), this.onClickSettings);
        const facilities = [
            { node: alchemy, artwork: this.getElement<Laya.GWidget>("box_alchemy_art"),
                plate: this.getElement<Laya.GImage>("img_alchemy_plate"), label: this.getElement<Laya.GTextField>("txt_alchemy") },
            { node: forge, artwork: this.getElement<Laya.GWidget>("box_forge_art"),
                plate: this.getElement<Laya.GImage>("img_forge_plate"), label: this.getElement<Laya.GTextField>("txt_forge") },
            { node: warehouse, artwork: this.getElement<Laya.GWidget>("box_warehouse_art"),
                plate: this.getElement<Laya.GImage>("img_warehouse_plate"), label: this.getElement<Laya.GTextField>("txt_warehouse") },
            { node: library, artwork: this.getElement<Laya.GWidget>("box_library_art"),
                plate: this.getElement<Laya.GImage>("img_library_plate"), label: this.getElement<Laya.GTextField>("txt_library") },
            { node: realm, artwork: this.getElement<Laya.GWidget>("box_realm_art"),
                plate: this.getElement<Laya.GImage>("img_realm_plate"), label: this.getElement<Laya.GTextField>("txt_realm") },
            { node: market, artwork: this.getElement<Laya.GWidget>("box_market_art"),
                plate: this.getElement<Laya.GImage>("img_market_plate"), label: this.getElement<Laya.GTextField>("txt_market") },
        ];
        // 预制体保存建筑比例和落脚位置，名称牌与文字独立于建筑缩放。
        facilities.forEach(item => {
            const { node: button, plate } = item;
            this.facilities.push({
                ...item, scale: item.artwork.scaleX,
                centerOffset: button.x + button.width / 2 - 640,
                bottomRatio: (button.y + button.height) / 720,
            });
            this.nameplates.push(plate);
            button.on(Laya.Event.MOUSE_OVER, this, () => { plate.color = "#fff4cb"; });
            button.on(Laya.Event.MOUSE_OUT, this, () => { plate.color = "#ffffff"; });
        });
        this.view.on(Laya.Event.RESIZE, this, this.updateLayout);
    }

    onOpen(): void {
        this.opening = false;
        this.notice.visible = false;
        this.nameplates.forEach(plate => { plate.color = "#ffffff"; });
        LobbySettingsView.applySavedAudio();
        this.updateLayout();
    }

    private updateLayout(): void {
        const width = this.view.width, height = this.view.height;
        this.scene.size(width, height);
        // 背景独立覆盖，裁切不会带动建筑、名称牌和命中区域。
        const cover = Math.max(width / 1280, height / 720);
        this.background.size(1280 * cover, 720 * cover);
        this.background.pos((width - this.background.width) / 2, (height - this.background.height) / 2);
        // 宽屏适度拉开庭院间距，保留近大远小的比例和建筑之间的通路。
        const scale = Math.min(1.08, (width - 96) / 1184, (height - 112) / 608);
        const spread = Math.min((width - 96) / 1184, height / 720 * 1.15);
        for (const item of this.facilities) {
            const center = width / 2 + item.centerOffset * spread;
            const bottom = height * item.bottomRatio;
            const buildingScale = item.scale * scale;
            item.artwork.scale(buildingScale, buildingScale);
            item.node.size(item.artwork.width * buildingScale, item.artwork.height * buildingScale + item.plate.height + 2);
            item.node.pos(center - item.node.width / 2, bottom - item.node.height);
            item.plate.pos((item.node.width - item.plate.width) / 2, item.node.height - item.plate.height);
            item.label.pos((item.node.width - item.label.width) / 2,
                item.plate.y + (item.plate.height - item.label.height) / 2);
        }
    }

    private onClickRealm(): void { this.openPreparation("start"); }
    private onClickWarehouse(): void {
        try { openSkillBattleScreen("inventory"); }
        catch (error) { this.showNotice((error as Error).message); }
    }

    private openPreparation(screen: "start" | "inventory"): void {
        if (this.opening) return;
        this.opening = true;
        try { openSkillBattleScreen(screen); }
        catch (error) {
            this.opening = false;
            this.showNotice((error as Error).message);
        }
    }

    private onClickSettings(): void { UIManager.ins().openForm(LobbySettingsView); }

    private showNotice(text: string): void {
        this.noticeText.text = text;
        this.notice.visible = true;
        this.removeTimer(this.hideNotice);
        this.addOnceTimer(2400, this.hideNotice);
    }

    private hideNotice(): void { this.notice.visible = false; }

    protected onClose(): void {
        this.opening = false;
        this.notice.visible = false;
        UIManager.ins().closeForm(LobbySettingsView);
    }
}
