import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import { List } from "../../../games/uilib/List";
import { TestSkinItemCtrl } from "../ctrl/TestSkinItemCtrl";

interface ISkinOption {
    name: string;
    label: string;
    meta: string;
}

const SPINE_SOURCE = "ui/resource/converted_spine/hero_01/hero_01.json";
const SKIN_ITEM_PREFAB = "ui/prefab/module/testPanel/TestSkinItem.lh";
const AUTO_INTERVAL = 900;

export class TestSkinPanelView extends UIBaseView {
    get layer(): UILayer { return UILayer.Second; }
    get path(): string { return "ui/prefab/module/testPanel/TestSkinPanelView.lh"; }

    private bodyCount: Laya.GTextField;
    private headCount: Laya.GTextField;
    private weaponCount: Laya.GTextField;
    private bodyList: List<TestSkinItemCtrl>;
    private headList: List<TestSkinItemCtrl>;
    private weaponList: List<TestSkinItemCtrl>;
    private previewBox: Laya.GWidget;
    private previewStatus: Laya.GTextField;
    private comboText: Laya.GTextField;
    private progressText: Laya.GTextField;
    private autoText: Laya.GTextField;
    private playText: Laya.GTextField;
    private animationText: Laya.GTextField;
    private statusText: Laya.GTextField;

    private templet: Laya.SpineTemplet;
    private preview: Laya.SpineSkeleton;
    private skeletonData: spine.SkeletonData;
    private bodyOptions: ISkinOption[] = [];
    private headOptions: ISkinOption[] = [];
    private weaponOptions: ISkinOption[] = [];
    private animationOptions: string[] = [];
    private bodyIndex = 0;
    private headIndex = 0;
    private weaponIndex = 0;
    private animationIndex = 0;
    private autoRunning = false;
    private playing = true;
    private loading = false;

    protected onConstruct(): void {
        this.bodyCount = this.getElement("txt_body_count");
        this.headCount = this.getElement("txt_head_count");
        this.weaponCount = this.getElement("txt_weapon_count");
        this.previewBox = this.getElement("box_spine_preview");
        this.previewStatus = this.getElement("txt_preview_status");
        this.comboText = this.getElement("txt_combo");
        this.progressText = this.getElement("txt_progress");
        this.autoText = this.getElement("txt_auto");
        this.playText = this.getElement("txt_play");
        this.animationText = this.getElement("txt_animation");
        this.statusText = this.getElement("txt_status");
        this.bodyList = this.elems.getList<TestSkinItemCtrl>("list_body");
        this.headList = this.elems.getList<TestSkinItemCtrl>("list_head");
        this.weaponList = this.elems.getList<TestSkinItemCtrl>("list_weapon");
        this.configureList(this.bodyList, 40);
        this.configureList(this.headList, 40);
        this.configureList(this.weaponList, 40);
        this.addClickListener(this.getElement("btn_prev"), this.onClickPrevious);
        this.addClickListener(this.getElement("btn_next"), this.onClickNext);
        this.addClickListener(this.getElement("btn_random"), this.onClickRandom);
        this.addClickListener(this.getElement("btn_auto"), this.onClickAuto);
        this.addClickListener(this.getElement("btn_play"), this.onClickPlay);
        this.addClickListener(this.getElement("btn_animation"), this.onClickAnimation);
        this.addClickListener(this.getElement("btn_close"), this.close);
    }

    onOpen(bodyName: string = "body/skin1", headName: string = "head/skin1", weaponName: string = ""): void {
        if (this.templet) {
            this.applyRequestedSkin(bodyName, headName, weaponName);
            this.previewStatus.visible = false;
            this.resumePreview();
            return;
        }
        if (this.loading) {
            return;
        }

        this.loading = true;
        this.previewStatus.visible = true;
        this.previewStatus.color = "#d9dfda";
        this.previewStatus.text = "正在加载完整 Spine 部件资源…";
        this.statusText.text = SPINE_SOURCE;
        Laya.loader.load(SPINE_SOURCE, Laya.Loader.SPINE).then((loaded: Laya.SpineTemplet) => {
            this.loading = false;
            if (!this.isOpened) {
                return;
            }
            this.templet = loaded;
            (this.templet as any)._premultipliedAlpha = true;
            this.skeletonData = (this.templet as any).skeletonData as spine.SkeletonData;
            this.prepareOptions();
            this.removeWeaponAttachmentTimelines();
            this.preparePreview();
            this.applyRequestedSkin(bodyName, headName, weaponName);
            this.previewStatus.visible = false;
            this.statusText.text = "滚轮浏览列表；点击列表选择部件，上一组/下一组按全部组合顺序遍历。";
        }).catch((error: Error) => {
            this.loading = false;
            this.previewStatus.text = `加载失败：${error?.message || "未知错误"}`;
            this.previewStatus.color = "#ff9f8b";
            this.statusText.text = "请确认 hero_01.json、hero_01.atlas 和全部 PNG 均已加载。";
        });
    }

    private configureList(list: List<TestSkinItemCtrl>, step: number): void {
        list.itemCtrl = TestSkinItemCtrl;
        list.isVirtual = true;
        list.autoSelectOnChange = false;
        const scroller = new Laya.Scroller();
        scroller.direction = Laya.ScrollDirection.Vertical;
        scroller.barDisplay = Laya.ScrollBarDisplay.Hidden;
        scroller.touchEffect = Laya.ScrollTouchEffect.On;
        scroller.bouncebackEffect = Laya.ScrollBounceBackEffect.Off;
        scroller.mouseWheelDisabled = false;
        scroller.step = step;
        list.rootNode.scroller = scroller;
        list.rootNode.itemTemplate = Laya.loader.getRes(SKIN_ITEM_PREFAB) as Laya.Prefab;
        list.setClickListener(this, (index: number) => this.selectByList(list, index));
    }

    private prepareOptions(): void {
        const skins = this.skeletonData.skins;
        this.bodyOptions = this.collectSkins(skins, "body/");
        this.headOptions = this.collectSkins(skins, "head/");
        this.weaponOptions = [
            { name: "", label: "无武器", meta: "空" },
            ...this.collectSkins(skins, "weapon_j/"),
            ...this.collectSkins(skins, "weapon_y/"),
        ];
        this.animationOptions = this.skeletonData.animations.map((animation) => animation.name);
        this.animationIndex = Math.max(0, this.animationOptions.indexOf("idle_y"));
        this.bodyIndex = Math.max(0, this.bodyOptions.findIndex((item) => item.name === "body/skin1"));
        this.headIndex = Math.max(0, this.headOptions.findIndex((item) => item.name === "head/skin1"));
        this.weaponIndex = 0;
        this.bodyCount.text = `0 / ${this.bodyOptions.length}`;
        this.headCount.text = `0 / ${this.headOptions.length}`;
        this.weaponCount.text = `0 / ${this.weaponOptions.length}`;
        this.animationText.text = `动画：${this.animationOptions[this.animationIndex]} ▸`;
    }

    private collectSkins(source: spine.Skin[], prefix: string): ISkinOption[] {
        return source
            .filter((skin) => skin.name.startsWith(prefix))
            .map((skin) => ({
                name: skin.name,
                label: skin.name.slice(prefix.length),
                meta: String(skin.getAttachments().length),
            }))
            .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }));
    }

    private removeWeaponAttachmentTimelines(): void {
        const weaponSlotIndices = new Set<number>();
        for (const skin of this.skeletonData.skins) {
            if (!skin.name.startsWith("weapon_")) continue;
            for (const entry of skin.getAttachments()) {
                weaponSlotIndices.add(entry.slotIndex);
            }
        }
        for (const animation of this.skeletonData.animations) {
            const timelines = (animation as any).timelines as any[];
            (animation as any).timelines = timelines.filter((timeline) => {
                return !(timeline instanceof spine.AttachmentTimeline && weaponSlotIndices.has(timeline.slotIndex));
            });
        }
    }

    private preparePreview(): void {
        this.preview = new Laya.SpineSkeleton();
        // SpineSkeleton 绑定模板时会立即读取皮肤和动画名，必须先写入有效值。
        this.preview.skinName = this.bodyOptions[this.bodyIndex].name;
        this.preview.animationName = this.animationOptions[this.animationIndex];
        this.preview.loop = true;
        this.preview.templet = this.templet;
        this.preview.mouseEnabled = false;
        const renderNode = (this.preview as any)._spineComponent as Laya.Spine2DRenderNode;
        renderNode.useFastRender = false;
        renderNode.setPremultipliedAlpha(true);
        renderNode.autoAdjust = true;
        this.previewBox.addChild(this.preview);
        const scale = Math.min(
            (this.previewBox.width - 24) / Math.max(1, this.templet.width),
            (this.previewBox.height - 16) / Math.max(1, this.templet.height),
        );
        this.preview.scale(scale, scale);
        this.preview.pos(
            (this.previewBox.width - this.templet.width * scale) / 2 + this.preview.pivotX * scale,
            (this.previewBox.height - this.templet.height * scale) / 2 + this.preview.pivotY * scale,
        );
    }

    private applyRequestedSkin(bodyName: string, headName: string, weaponName: string): void {
        const body = this.bodyOptions.findIndex((item) => item.name === bodyName);
        const head = this.headOptions.findIndex((item) => item.name === headName);
        const weapon = this.weaponOptions.findIndex((item) => item.name === weaponName);
        if (body >= 0) this.bodyIndex = body;
        if (head >= 0) this.headIndex = head;
        if (weapon >= 0) this.weaponIndex = weapon;
        this.refreshView();
    }

    private selectByList(list: List<TestSkinItemCtrl>, index: number): void {
        if (list === this.bodyList) this.bodyIndex = index;
        else if (list === this.headList) this.headIndex = index;
        else this.weaponIndex = index;
        this.refreshView();
    }

    private refreshView(): void {
        if (!this.templet || !this.preview) {
            return;
        }

        const body = this.bodyOptions[this.bodyIndex];
        const head = this.headOptions[this.headIndex];
        const weapon = this.weaponOptions[this.weaponIndex];
        const animation = this.animationOptions[this.animationIndex] || "idle_y";
        this.preview.skinName = body.name;

        const externalSkins: Laya.ExternalSkin[] = [this.createExternalSkin(head.name)];
        if (weapon.name) {
            externalSkins.push(this.createExternalSkin(weapon.name));
        }
        this.preview.externalSkins = externalSkins;
        this.preview.skinName = body.name;
        this.preview.play(animation, true, true, 0, 0, true);
        externalSkins.forEach((skin) => skin.flush());
        this.playing = true;
        this.playText.text = "暂停";
        this.updateLists(body, head, weapon);
        this.comboText.text = `${body.label} / ${head.label} / ${weapon.label}`;
        this.progressText.text = `${this.currentCombination() + 1} / ${this.combinationCount()}`;
        this.autoText.text = this.autoRunning ? "停止巡测" : "自动巡测";
        this.autoText.color = this.autoRunning ? "#f0d79c" : "#e7e1d4";
        this.animationText.text = `动画：${animation} ▸`;
        this.statusText.text = `身体 ${body.name} · 头部 ${head.name} · 武器 ${weapon.name || "无"} · 当前动画 ${animation}`;
    }

    private updateLists(body: ISkinOption, head: ISkinOption, weapon: ISkinOption): void {
        this.bodyCount.text = `${String(this.bodyIndex + 1).padStart(2, "0")} / ${this.bodyOptions.length}`;
        this.headCount.text = `${String(this.headIndex + 1).padStart(2, "0")} / ${this.headOptions.length}`;
        this.weaponCount.text = `${String(this.weaponIndex + 1).padStart(2, "0")} / ${this.weaponOptions.length}`;
        this.bodyList.array = this.bodyOptions.map((item, index) => ({
            label: item.label, meta: item.meta, width: 216, selected: index === this.bodyIndex,
        }));
        this.headList.array = this.headOptions.map((item, index) => ({
            label: item.label, meta: item.meta, width: 332, selected: index === this.headIndex,
        }));
        this.weaponList.array = this.weaponOptions.map((item, index) => ({
            label: item.label, meta: item.meta, width: 332, selected: index === this.weaponIndex,
        }));
        this.bodyList.selected = this.bodyIndex;
        this.headList.selected = this.headIndex;
        this.weaponList.selected = this.weaponIndex;
        this.bodyList.scrollToSelected(false);
        this.headList.scrollToSelected(false);
        this.weaponList.scrollToSelected(false);
        this.comboText.text = `${body.label} / ${head.label} / ${weapon.label}`;
    }

    private createExternalSkin(skinName: string): Laya.ExternalSkin {
        const source = this.skeletonData.findSkin(skinName);
        const external = new Laya.ExternalSkin();
        external.templet = this.templet;
        external.items = source.getAttachments().map((entry) => {
            const item = new Laya.ExternalSkinItem();
            item.skin = skinName;
            item.slot = this.skeletonData.slots[entry.slotIndex].name;
            item.attachment = entry.name;
            return item;
        });
        return external;
    }

    private currentCombination(): number {
        return (this.bodyIndex * this.headOptions.length + this.headIndex) *
            this.weaponOptions.length + this.weaponIndex;
    }

    private combinationCount(): number {
        return this.bodyOptions.length * this.headOptions.length * this.weaponOptions.length;
    }

    private stepCombination(delta: number): void {
        const count = this.combinationCount();
        if (count <= 0) return;
        const next = (this.currentCombination() + delta + count) % count;
        const weaponLen = this.weaponOptions.length;
        const perBody = this.headOptions.length * weaponLen;
        this.bodyIndex = Math.floor(next / perBody);
        const inBody = next % perBody;
        this.headIndex = Math.floor(inBody / weaponLen);
        this.weaponIndex = inBody % weaponLen;
        this.refreshView();
    }

    private onClickPrevious(): void { this.stepCombination(-1); }
    private onClickNext(): void { this.stepCombination(1); }
    private onClickRandom(): void {
        const count = this.combinationCount();
        if (count <= 0) return;
        const random = Math.floor(Math.random() * count);
        this.stepCombination(random - this.currentCombination());
    }

    private onClickAuto(): void {
        if (this.autoRunning) {
            this.stopAutoTest();
        } else {
            this.autoRunning = true;
            this.addLoopTimer(AUTO_INTERVAL, this.onAutoTick, "skin-combination-auto");
            this.refreshView();
        }
    }

    private onAutoTick(): void { this.stepCombination(1); }

    private stopAutoTest(): void {
        if (!this.autoRunning) return;
        this.removeTimer(this.onAutoTick);
        this.autoRunning = false;
        if (this.templet) this.refreshView();
    }

    private onClickPlay(): void {
        if (!this.preview) return;
        if (this.playing) {
            this.preview.paused();
            this.playText.text = "播放";
        } else {
            this.preview.resume();
            this.playText.text = "暂停";
        }
        this.playing = !this.playing;
    }

    private onClickAnimation(): void {
        if (this.animationOptions.length === 0) return;
        this.animationIndex = (this.animationIndex + 1) % this.animationOptions.length;
        this.refreshView();
    }

    private resumePreview(): void {
        if (!this.preview) return;
        this.preview.resume();
        this.playing = true;
        this.playText.text = "暂停";
    }

    protected onClose(): void {
        this.stopAutoTest();
        this.preview?.paused();
        this.playing = false;
    }
}
