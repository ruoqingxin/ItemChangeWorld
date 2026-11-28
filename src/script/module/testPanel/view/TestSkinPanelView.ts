import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import { List } from "../../../games/uilib/List";
import { TestSkinItemCtrl } from "../ctrl/TestSkinItemCtrl";

interface ISkinOption {
    name: string;
    label: string;
    meta: string;
}

interface IWeaponVariantRecipe {
    name: string;
    label: string;
    sources: string[];
    color: [number, number, number, number];
}

interface IEnemyPreset {
    button: string;
    label: string;
    body: string;
    head: string;
    weapon: string;
}

const SPINE_SOURCE = "ui/resource/converted_spine/hero_01/hero_01.json";
const SKIN_ITEM_PREFAB = "ui/prefab/module/testPanel/TestSkinItem.lh";
const AUTO_INTERVAL = 900;
const WEAPON_VARIANTS: IWeaponVariantRecipe[] = [
    {
        name: "weapon_j/skin41",
        label: "青霜剑",
        sources: ["weapon_j/skin1", "weapon_j/skin30"],
        color: [0.62, 0.95, 1, 1],
    },
    {
        name: "weapon_j/skin42",
        label: "赤霄连刃",
        sources: ["weapon_j/skin13", "weapon_j/skin31"],
        color: [1, 0.55, 0.35, 1],
    },
    {
        name: "weapon_j/skin43",
        label: "鎏金月环",
        sources: ["weapon_j/skin11", "weapon_j/skin13"],
        color: [1, 0.82, 0.35, 1],
    },
    {
        name: "weapon_j/skin44",
        label: "碧血弯刀",
        sources: ["weapon_j/skin12", "weapon_j/skin30"],
        color: [0.42, 1, 0.62, 1],
    },
    {
        name: "weapon_j/skin45",
        label: "白虹剑",
        sources: ["weapon_j/skin1", "weapon_j/skin31"],
        color: [0.85, 0.92, 1, 1],
    },
    {
        name: "weapon_j/skin46",
        label: "紫曜毒刃",
        sources: ["weapon_j/skin12", "weapon_j/skin13"],
        color: [0.78, 0.42, 1, 1],
    },
    {
        name: "weapon_y/skin11",
        label: "玄冥令旗",
        sources: ["weapon_y/skin10", "weapon_j/skin11"],
        color: [0.68, 0.5, 1, 1],
    },
    {
        name: "weapon_y/skin12",
        label: "赤焰令旗",
        sources: ["weapon_y/skin10", "weapon_j/skin13"],
        color: [1, 0.4, 0.25, 1],
    },
];
const WEAPON_VARIANT_LABELS = new Map(WEAPON_VARIANTS.map((item) => [item.name, item.label]));
const ENEMY_PRESETS: IEnemyPreset[] = [
    { button: "btn_preset_shadow", label: "幽影刺客", body: "body/skin15", head: "head/skin15", weapon: "weapon_j/skin46" },
    { button: "btn_preset_flame", label: "赤焰妖将", body: "body/skin13", head: "head/skin57", weapon: "weapon_j/skin42" },
    { button: "btn_preset_frost", label: "玄冰守卫", body: "body/skin41", head: "head/skin31", weapon: "weapon_j/skin41" },
    { button: "btn_preset_gold", label: "金令尊者", body: "body/skin24", head: "head/skin13", weapon: "weapon_y/skin12" },
    { button: "btn_preset_verdant", label: "青木祭司", body: "body/skin47", head: "head/skin36", weapon: "weapon_j/skin11" },
    { button: "btn_preset_violet", label: "紫电魔修", body: "body/skin48", head: "head/skin11", weapon: "weapon_j/skin46" },
    { button: "btn_preset_phantom", label: "白发魅影", body: "body/skin55", head: "head/skin4", weapon: "weapon_j/skin45" },
    { button: "btn_preset_berserker", label: "赤发狂客", body: "body/skin61", head: "head/skin56", weapon: "weapon_j/skin42" },
    { button: "btn_preset_bamboo", label: "斗笠剑客", body: "body/skin39", head: "head/skin19", weapon: "weapon_j/skin41" },
    { button: "btn_preset_occultist", label: "黑袍术士", body: "body/skin10", head: "head/skin37", weapon: "weapon_y/skin11" },
];
const FACE_SLOT_NAMES = [
    "tou",
    "zui",
    "yanqiuR",
    "yanqiuL",
    "yankuangL",
    "yankuangR",
    "BY",
    "meimaoL",
    "meimaoR",
    "erduoR",
];
const FACE_SLOT_TINT: [number, number, number, number] = [1, 0.88, 0.78, 1];
const HAND_SKIN_SLOT_PATTERN = /(shou|xiaobi|gebo)/i;
const UNAVAILABLE_SKIN_NAMES = new Set([
    // 这些源资源的网格会散裂或贴图为空，测试页不参与组合。
    "body/skin5",
    "body/skin8",
    "body/skin9",
    "body/skin34",
    "body/skin63",
    "body/skin64",
    "body/skin65",
    "head/skin5",
    "head/skin8",
    "head/skin9",
    "head/skin34",
    "head/skin63",
    "head/skin64",
    "head/skin65",
]);

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
    private activePresetLabel = "";

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
        for (const preset of ENEMY_PRESETS) {
            this.addClickListener(this.getElement(preset.button), () => this.applyEnemyPreset(preset));
        }
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
            const skeletonData = loaded?.optimize?.data as spine.SkeletonData;
            if (!skeletonData) {
                throw new Error("Spine 模板未生成有效的骨骼数据");
            }
            this.templet = loaded;
            this.skeletonData = skeletonData;
            this.sanitizeWeaponSkins();
            this.createWeaponVariants();
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
        this.weaponOptions = this.weaponOptions.map((item) => {
            const label = WEAPON_VARIANT_LABELS.get(item.name);
            return label ? { ...item, label, meta: "新" } : item;
        });
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
            .filter((skin) => skin.name.startsWith(prefix) && !UNAVAILABLE_SKIN_NAMES.has(skin.name))
            .map((skin) => ({
                name: skin.name,
                label: skin.name.slice(prefix.length),
                meta: String(skin.getAttachments().length),
            }))
            .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }));
    }

    private sanitizeWeaponSkins(): void {
        const skin = this.skeletonData.findSkin("weapon_j/skin1");
        const groundSlot = this.skeletonData.findSlot("j_weapon10");
        if (!skin || !groundSlot) return;
        // 原资源在 j_weapon10 额外复制了一把落在地上的剑，只保留手持插槽。
        skin.removeAttachment(groundSlot.index, "j_weapon");
    }

    private createWeaponVariants(): void {
        const existingNames = new Set(this.skeletonData.skins.map((skin) => skin.name));
        for (const recipe of WEAPON_VARIANTS) {
            if (existingNames.has(recipe.name)) continue;
            const skin = new spine.Skin(recipe.name);
            const copiedAttachments = new Set<string>();
            for (const sourceName of recipe.sources) {
                const source = this.skeletonData.findSkin(sourceName);
                if (!source) continue;
                for (const entry of source.getAttachments()) {
                    const key = `${entry.slotIndex}/${entry.name}`;
                    if (copiedAttachments.has(key)) continue;
                    copiedAttachments.add(key);
                    const copy = entry.attachment.copy() as spine.MeshAttachment;
                    copy.color = new spine.Color(...recipe.color);
                    skin.setAttachment(entry.slotIndex, entry.name, copy);
                }
            }
            if (skin.getAttachments().length === 0) continue;
            this.skeletonData.skins.push(skin);
            existingNames.add(recipe.name);
        }
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
        this.activePresetLabel = "";
        const body = this.bodyOptions.findIndex((item) => item.name === bodyName);
        const head = this.headOptions.findIndex((item) => item.name === headName);
        const weapon = this.weaponOptions.findIndex((item) => item.name === weaponName);
        if (body >= 0) this.bodyIndex = body;
        if (head >= 0) this.headIndex = head;
        if (weapon >= 0) this.weaponIndex = weapon;
        this.refreshView();
    }

    private selectByList(list: List<TestSkinItemCtrl>, index: number): void {
        this.activePresetLabel = "";
        if (list === this.bodyList) this.bodyIndex = index;
        else if (list === this.headList) this.headIndex = index;
        else this.weaponIndex = index;
        this.refreshView();
    }

    private applyEnemyPreset(preset: IEnemyPreset): void {
        const bodyIndex = this.bodyOptions.findIndex((item) => item.name === preset.body);
        const headIndex = this.headOptions.findIndex((item) => item.name === preset.head);
        const weaponIndex = this.weaponOptions.findIndex((item) => item.name === preset.weapon);
        if (bodyIndex < 0 || headIndex < 0 || weaponIndex < 0) return;
        this.activePresetLabel = preset.label;
        this.bodyIndex = bodyIndex;
        this.headIndex = headIndex;
        this.weaponIndex = weaponIndex;
        this.stopAutoTest();
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

        const skeleton = this.preview.getSkeleton();
        const combinedSkin = new spine.Skin(body.name);
        const bodySkin = this.skeletonData.findSkin(body.name);
        const headSkin = this.skeletonData.findSkin(head.name);
        const weaponSkin = weapon.name ? this.skeletonData.findSkin(weapon.name) : null;
        combinedSkin.addSkin(bodySkin);
        combinedSkin.addSkin(headSkin);
        if (weaponSkin) combinedSkin.addSkin(weaponSkin);
        skeleton.setSkin(combinedSkin);
        skeleton.setSlotsToSetupPose();

        // 额外武器插槽没有默认附件名，组合后需要显式挂接。
        if (weaponSkin) {
            for (const entry of weaponSkin.getAttachments()) {
                skeleton.slots[entry.slotIndex].setAttachment(entry.attachment);
            }
        }
        this.applyFaceTint(skeleton);

        this.preview.play(animation, true, true, 0, 0, true);
        this.playing = true;
        this.playText.text = "暂停";
        this.updateLists(body, head, weapon);
        this.comboText.text = `${body.label} / ${head.label} / ${weapon.label}`;
        this.progressText.text = `${this.currentCombination() + 1} / ${this.combinationCount()}`;
        this.autoText.text = this.autoRunning ? "停止巡测" : "自动巡测";
        this.autoText.color = this.autoRunning ? "#f0d79c" : "#e7e1d4";
        this.animationText.text = `动画：${animation} ▸`;
        const presetPrefix = this.activePresetLabel ? `已应用「${this.activePresetLabel}」 · ` : "";
        this.statusText.text = `${presetPrefix}身体 ${body.name} · 头部 ${head.name} · 武器 ${weapon.name || "无"} · 当前动画 ${animation}`;
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

    private currentCombination(): number {
        return (this.bodyIndex * this.headOptions.length + this.headIndex) *
            this.weaponOptions.length + this.weaponIndex;
    }

    private applyFaceTint(skeleton: spine.Skeleton): void {
        for (const slotName of FACE_SLOT_NAMES) {
            const slot = skeleton.findSlot(slotName);
            if (slot) slot.color = new spine.Color(...FACE_SLOT_TINT);
        }
        // 手、前臂和上臂使用同一肤色，避免脸与手出现蓝皮色差。
        for (const slot of skeleton.slots) {
            if (HAND_SKIN_SLOT_PATTERN.test(slot.data.name)) {
                slot.color = new spine.Color(...FACE_SLOT_TINT);
            }
        }
    }

    private combinationCount(): number {
        return this.bodyOptions.length * this.headOptions.length * this.weaponOptions.length;
    }

    private stepCombination(delta: number): void {
        const count = this.combinationCount();
        if (count <= 0) return;
        this.activePresetLabel = "";
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
