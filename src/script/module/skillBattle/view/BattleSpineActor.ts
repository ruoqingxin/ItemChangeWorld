export const BATTLE_SPINE_SOURCE = "ui/resource/converted_spine/hero_01/hero_01.json";

export interface IBattleSpineAppearance {
    body: string;
    head: string;
    weapon: string;
}

export interface IBattleSpineOptions {
    width: number;
    height: number;
    facing: 1 | -1;
    idleAnimation: string;
    attackAnimation: string;
    skillAnimation: string;
    hitAnimation: string;
    faceTint?: [number, number, number, number];
}

const FACE_SLOT_NAMES = ["tou", "zui", "yanqiuR", "yanqiuL", "yankuangL", "yankuangR",
    "BY", "meimaoL", "meimaoR", "erduoR"];
const HAND_SLOT_PATTERN = /(shou|xiaobi|gebo)/i;
const DEFAULT_FACE_TINT: [number, number, number, number] = [1, 0.88, 0.78, 1];

/**
 * 战斗中的 Spine 角色封装。
 * 一个模板可供双方复用，角色本身只负责换装、定位和基础动作切换。
 */
export class BattleSpineActor {
    private static loading: Promise<Laya.SpineTemplet> | null = null;
    private static preparedTemplets = new WeakSet<Laya.SpineTemplet>();
    private readonly skeleton: Laya.SpineSkeleton;
    private readonly skeletonData: spine.SkeletonData;
    private readonly idleAnimation: string;
    private readonly attackAnimation: string;
    private readonly skillAnimation: string;
    private readonly hitAnimation: string;

    static loadTemplet(): Promise<Laya.SpineTemplet> {
        if (!this.loading) {
            this.loading = Laya.loader.load(BATTLE_SPINE_SOURCE, Laya.Loader.SPINE).then(
                (templet: Laya.SpineTemplet) => {
                    if (!templet?.optimize?.data) {
                        throw new Error("战斗 Spine 模板缺少有效骨骼数据");
                    }
                    this.prepareTemplet(templet);
                    return templet;
                },
                (error: unknown) => {
                    this.loading = null;
                    throw error;
                },
            );
        }
        return this.loading;
    }

    constructor(container: Laya.Sprite, templet: Laya.SpineTemplet,
        appearance: IBattleSpineAppearance, options: IBattleSpineOptions) {
        this.skeletonData = templet.optimize.data as spine.SkeletonData;
        this.idleAnimation = options.idleAnimation;
        this.attackAnimation = options.attackAnimation;
        this.skillAnimation = options.skillAnimation;
        this.hitAnimation = options.hitAnimation;

        const view = new Laya.Sprite();
        view.pos(-options.width / 2, -options.height);
        view.mouseEnabled = false;
        container.addChild(view);

        const aura = new Laya.Sprite();
        aura.mouseEnabled = false;
        aura.graphics.drawEllipse(options.width * 0.27, options.height - 8,
            options.width * 0.46, 20, "rgba(12, 22, 17, 0.58)", null, 0);
        aura.graphics.drawEllipse(options.width * 0.2, options.height - 4,
            options.width * 0.6, 14, "rgba(117, 175, 147, 0.14)", null, 0);
        view.addChild(aura);

        const direction = new Laya.Sprite();
        direction.mouseEnabled = false;
        direction.scaleX = options.facing;
        direction.x = options.facing < 0 ? options.width : 0;
        view.addChild(direction);

        this.skeleton = new Laya.SpineSkeleton();
        this.skeleton.skinName = appearance.body;
        this.skeleton.animationName = options.idleAnimation;
        this.skeleton.loop = true;
        this.skeleton.mouseEnabled = false;
        this.skeleton.templet = templet;
        const renderNode = (this.skeleton as any)._spineComponent as Laya.Spine2DRenderNode;
        renderNode.useFastRender = false;
        renderNode.setPremultipliedAlpha(true);
        renderNode.autoAdjust = true;
        direction.addChild(this.skeleton);

        const scale = Math.min(
            options.width * 0.92 / Math.max(1, templet.width),
            options.height * 0.92 / Math.max(1, templet.height),
        );
        this.skeleton.scale(scale, scale);
        this.skeleton.pos(
            (options.width - templet.width * scale) / 2 + this.skeleton.pivotX * scale,
            (options.height - templet.height * scale) / 2 + this.skeleton.pivotY * scale,
        );

        this.applyAppearance(appearance, options.faceTint || DEFAULT_FACE_TINT);
        this.playIdle();
    }

    playIdle(): void {
        Laya.timer.clearAll(this);
        this.skeleton.play(this.idleAnimation, true, true, 0, 0, true);
    }

    playAttack(skill = false): void {
        this.playOnce(skill ? this.skillAnimation : this.attackAnimation);
    }

    playHit(): void {
        this.playOnce(this.hitAnimation);
    }

    pause(): void {
        Laya.timer.clearAll(this);
        this.skeleton.paused();
    }

    resume(): void {
        this.playIdle();
    }

    private playOnce(animation: string): void {
        Laya.timer.clearAll(this);
        this.skeleton.play(animation, false, true, 0, 0, true);
        const dataAnimation = (this.skeletonData.animations as any[]).find(item => item.name === animation);
        const duration = Math.max(260, Number(dataAnimation?.duration || 0.8) * 1000);
        Laya.timer.once(duration - 20, this, this.playIdle);
    }

    private applyAppearance(appearance: IBattleSpineAppearance, faceTint: [number, number, number, number]): void {
        const skeleton = this.skeleton.getSkeleton();
        if (!skeleton) return;
        const body = this.skeletonData.findSkin(appearance.body);
        const head = this.skeletonData.findSkin(appearance.head);
        const weapon = appearance.weapon ? this.skeletonData.findSkin(appearance.weapon) : null;
        if (!body || !head) return;

        const combined = new spine.Skin(`${appearance.body}|${appearance.head}|${appearance.weapon}`);
        combined.addSkin(body);
        combined.addSkin(head);
        if (weapon) combined.addSkin(weapon);
        skeleton.setSkin(combined);
        skeleton.setSlotsToSetupPose();

        // 组合皮肤不会自动补上额外武器插槽，需要按插槽显式挂回武器。
        if (weapon) {
            for (const entry of weapon.getAttachments()) {
                skeleton.slots[entry.slotIndex].setAttachment(entry.attachment);
            }
        }
        for (const slotName of FACE_SLOT_NAMES) {
            const slot = skeleton.findSlot(slotName);
            if (slot) slot.color = new spine.Color(...faceTint);
        }
        for (const slot of skeleton.slots) {
            if (HAND_SLOT_PATTERN.test(slot.data.name)) slot.color = new spine.Color(...faceTint);
        }
    }

    private static prepareTemplet(templet: Laya.SpineTemplet): void {
        if (this.preparedTemplets.has(templet)) return;
        const data = templet.optimize.data as spine.SkeletonData;
        const groundWeapon = data.findSkin("weapon_j/skin1");
        const groundSlot = data.findSlot("j_weapon10");
        // 原资源在额外插槽中复制了一把落地武器，战斗场景只保留手持武器。
        if (groundWeapon && groundSlot) groundWeapon.removeAttachment(groundSlot.index, "j_weapon");

        const weaponSlots = new Set<number>();
        for (const skin of data.skins) {
            if (!skin.name.startsWith("weapon_")) continue;
            for (const entry of skin.getAttachments()) weaponSlots.add(entry.slotIndex);
        }
        for (const animation of data.animations) {
            const timelines = (animation as any).timelines as any[];
            (animation as any).timelines = timelines.filter((timeline: any) => {
                return !(timeline instanceof spine.AttachmentTimeline && weaponSlots.has(timeline.slotIndex));
            });
        }
        this.preparedTemplets.add(templet);
    }
}
