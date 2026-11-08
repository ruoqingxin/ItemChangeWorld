import { SkillBattlePresenter } from "./SkillBattlePresenter";
import type { SkillBattleEvent } from "../types/SkillBattleTypes";
import { SkillBattleManager } from "../manager/SkillBattleManager";
import { SkillBattleFormulaUtils } from "../utils/SkillBattleFormulaUtils";
import { ExpeditionManager } from "../../expedition/manager/ExpeditionManager";
import type { IExpeditionConfig, IExpeditionState } from "../../expedition/types/ExpeditionTypes";
import type { IExpeditionBuildState } from "../../expedition/types/ExpeditionBuildTypes";
import { ExpeditionStatsUtils } from "../../expedition/utils/ExpeditionStatsUtils";
import type { UIBaseView } from "../../../games/ui/UIBaseView";

const C = { bg: "#111713", surface: "#17221c",
    line: "#637060", text: "#ece9dc", muted: "#aab4a7", jade: "#8fc7ae",
    red: "#d69884", gold: "#d8bd7c", ink: "#080d0b" };
const schoolLabel = (school: string): string =>
    ({ sword: "剑道", earth: "土道", universal: "通用" } as { [key: string]: string })[school] || school;
type SkillBattleScreen = "start" | "battle" | "map" | "settlement";
const OVERLAY_LABELS = [
    "overlayBrand", "currency", "resultTitle", "resultDetail", "section", "overlayMessage",
    "choiceTitle", "reportBody", "page",
];
const BATTLE_LABELS = [
    "brand", "round", "upgrades", "enemyName", "enemyBlock", "enemyHp", "intent", "interrupt",
    "event", "playerName", "durability", "playerHp", "playerBlock", "qi", "previewTitle", "preview",
];
const BATTLE_BUTTONS = [
    "battleReport", "loot", "skip", "cancel", "confirm", "previousPage", "nextPage",
    "continue", "extract", "hub", "lootClose", "build",
    "report", "summary", "actions", "olderReport", "newerReport", "reportClose",
    ...Array.from({ length: 4 }, (_, i) => `skill${i + 1}`),
    ...Array.from({ length: 5 }, (_, i) => `pouch${i}`),
    ...Array.from({ length: 3 }, (_, i) => `upgrade${i}`),
];
const START_BUTTONS = [
    "previousPage", "nextPage", "newRun", "reset", "resetYes", "resetNo",
    "report", "summary", "actions", "olderReport", "newerReport", "reportClose", "build",
    ...Array.from({ length: 6 }, (_, i) => `warehouse${i}`),
];
const SETTLEMENT_BUTTONS = [
    "lootClose", "hub", "report", "summary", "actions", "olderReport", "newerReport",
    "reportClose", "previousPage", "nextPage", "build",
];

/** Binds the skill-battle logic to nodes authored in the active Laya prefab. */
export class SkillBattlePanel {
    readonly presenter: SkillBattlePresenter;
    readonly expedition: ExpeditionManager;
    private labels: { [key: string]: Laya.GTextField } = {};
    private buttons: { [key: string]: Laya.GWidget } = {};
    private player: Laya.GWidget;
    private enemy: Laya.GWidget;
    private numbers: Laya.GTextField;
    private result: Laya.GWidget;
    private resultTitle: Laya.GTextField;
    private resultDetail: Laya.GTextField;
    private queue: SkillBattleEvent[] = [];
    private lastEvent = "";
    private pouchIcons: Laya.GImage[] = [];
    private showHub = false;
    private showLoot = false;
    private resetConfirm = false;
    private warehousePage = 0;
    private overlayButtons: string[] = [];
    private notice = "";
    private overlayCommandAt = 0;
    private showReport = false;
    private reportMode: "summary" | "actions" = "summary";
    private reportPage = 0;
    private reportIndex = 0;
    private showBuild = false;
    private replacementSkillId = 0;

    private root: Laya.GWidget;

    constructor(view: UIBaseView, config: IExpeditionConfig, expedition?: ExpeditionManager,
        private readonly navigate?: (destination: SkillBattleScreen) => void,
        private readonly screen: SkillBattleScreen = "battle") {
        this.root = view.view;
        this.expedition = expedition || new ExpeditionManager(config);
        this.presenter = new SkillBattlePresenter(SkillBattleManager.ins(), this.expedition);
        this.showHub = !this.expedition.active;
        const element = <T extends Laya.Sprite>(name: string) => view.getElement<T>(name, false);
        const labelNames = (this.screen === "battle" ? BATTLE_LABELS.concat(OVERLAY_LABELS) : OVERLAY_LABELS)
            .concat(this.screen !== "start" ? Array.from({ length: 6 }, (_, i) => `lootSlot${i}`) : []);
        const labelColors: { [key: string]: string } = {
            round: C.muted, upgrades: C.gold, enemyBlock: C.gold, enemyHp: C.text, intent: C.red,
            interrupt: C.muted, event: C.gold, durability: C.muted, playerBlock: C.gold, qi: C.jade,
            previewTitle: C.jade, currency: C.gold, resultTitle: C.gold, resultDetail: C.text,
            section: C.jade, overlayMessage: C.red, choiceTitle: C.jade, reportBody: C.text, page: C.muted,
        };
        for (const name of labelNames) {
            const label = this.labels[name] = element<Laya.GTextField>(name);
            if (!label) throw new Error(`${this.screen} 预制缺少文本节点: ${name}`);
            label.color = labelColors[name] || C.text;
            if (name === "preview") label.fontSize = 16;
            label.textIns.color = label.color;
            label.textIns.bgColor = null as any;
            label.textIns.borderColor = null as any;
        }
        this.resultTitle = this.labels.resultTitle;
        this.resultDetail = this.labels.resultDetail;
        this.result = element<Laya.GWidget>("result");
        if (!this.result) throw new Error(`${this.screen} 预制缺少 result 节点`);
        if (this.screen === "battle") {
            this.player = element<Laya.GWidget>("player");
            this.enemy = element<Laya.GWidget>("enemy");
            this.numbers = element<Laya.GTextField>("numbers");
            if (!this.player || !this.enemy || !this.numbers) throw new Error("battle 预制缺少战斗场景节点");
            this.labels.brand.text = "末法寻仙";
            this.labels.playerName.text = "散修";
        }
        this.labels.overlayBrand.text = "末法寻仙";
        const buttonText: { [key: string]: string } = {
            battleReport: "战斗记录", loot: "战利品", skip: "跳过动画", cancel: "取消", confirm: "确认行动",
            continue: "继续深入", extract: "带上战利品撤离", hub: "返回据点", newRun: "开始新一局",
            lootClose: "返回据点", reset: "重置测试档", resetYes: "确认清空并补发测试物资",
            resetNo: "取消", report: "战斗记录", summary: "统计", actions: "行动日志",
            olderReport: "上一局", newerReport: "下一局", reportClose: "返回", build: "构筑",
        };

        const buttonNames = this.screen === "battle" ? BATTLE_BUTTONS
            : this.screen === "start" ? START_BUTTONS : SETTLEMENT_BUTTONS;
        for (const name of buttonNames) {
            this.buttons[name] = element<Laya.GWidget>(name);
            if (!this.buttons[name]) throw new Error(`${this.screen} 预制缺少按钮节点: ${name}`);
        }
        for (const name of buttonNames) {
            const text = this.buttons[name].getChildAt(0) as Laya.GTextField;
            if (!text) continue;
            if (buttonText[name]) text.text = buttonText[name];
            this.styleButton(this.buttons[name], false, true);
        }
        this.overlayButtons = buttonNames.filter(name => !["battleReport", "skip", "cancel", "confirm",
            "skill1", "skill2", "skill3", "skill4", "pouch0", "pouch1", "pouch2", "pouch3", "pouch4"].includes(name));
        this.overlayButtons.forEach(name => this.buttons[name].visible = false);
        if (this.buttons.cancel) this.buttons.cancel.visible = false;
        if (this.buttons.skip) this.buttons.skip.visible = false;
        OVERLAY_LABELS.forEach(name => this.labels[name].visible = false);
        for (let i = 0; i < 6; i++) if (this.labels[`lootSlot${i}`]) this.labels[`lootSlot${i}`].visible = false;
        if (this.screen === "battle")
            for (let i = 0; i < 5; i++) this.pouchIcons.push(element<Laya.GImage>(`pouchIcon${i}`));

        const bind = (key: string, click: () => void) => this.buttons[key]?.on(Laya.Event.CLICK, this, click);
        bind("battleReport", () => this.openReport());
        bind("build", () => this.openBuild());
        bind("loot", () => { if (!this.presenter.busy) { this.showLoot = true; this.refresh(); } });
        bind("skip", () => this.skip());
        bind("cancel", () => { this.presenter.cancel(); this.refresh(); });
        bind("confirm", () => this.confirm());
        for (let i = 0; i < 4; i++) bind(`skill${i + 1}`, () => { this.presenter.select(i + 1); this.refresh(); });
        for (let i = 0; i < 5; i++) bind(`pouch${i}`, () => { this.presenter.selectPouch(i); this.refresh(); });
        this.bindResultActions(bind);
        Object.assign(this.root as any, {
            skillBattleController: this, presenter: this.presenter, expedition: this.expedition,
            buttons: this.buttons, resultTitle: this.resultTitle,
        });
        if (this.buttons.confirm) this.styleButton(this.buttons.confirm, true, true);
    }

    openEncounter(): void {
        this.stopEffects();
        this.showBuild = false;
        this.replacementSkillId = 0;
        this.presenter.open(this.expedition.setup);
        this.lastEvent = "";
        this.drawActors(this.expedition.setup.encounterId);
        this.refresh();
    }

    openHubScreen(): void {
        this.stopEffects();
        this.showBuild = false;
        this.replacementSkillId = 0;
        this.presenter.open(this.expedition.setup);
        this.presenter.finishPlayback();
        this.showHub = true;
        this.showLoot = false;
        this.showReport = false;
        this.refresh();
    }

    startRun(): void {
        this.runCommand(() => {
            if (!this.expedition.active) {
                this.expedition.startNew();
                this.refresh();
                return;
            }
            if (!this.expedition.build?.activeSkills.length) {
                this.notice = "请先选择起始借法";
                this.refresh();
                return;
            }
            this.navigate?.(this.expedition.usesMap ? "map" : "battle");
        });
    }

    returnToStart(): void {
        this.navigate?.("start");
    }

    openSettlementScreen(): void {
        this.stopEffects();
        this.showBuild = false;
        this.replacementSkillId = 0;
        this.presenter.finishPlayback();
        this.showHub = false;
        this.showLoot = true;
        this.showReport = false;
        this.refresh();
    }

    resizeTo(view: Laya.GWidget): void {
        // UIBaseView keeps the root tied to its parent size. The stage handles
        // 1280x720 letterboxing, so the prefab root itself must stay at scale 1.
        this.root.pos(0, 0);
        this.root.scaleX = 1;
        this.root.scaleY = 1;
    }

    private continueNext(): void {
        if (this.presenter.busy || this.presenter.display.phase !== "victory") return;
        const setup = this.expedition.configuration.encounters[this.expedition.run.encounterIndex + 1];
        if (!this.presenter.continueTo(setup)) { this.notice = this.presenter.message; this.refresh(); return; }
        this.stopEffects();
        this.lastEvent = "";
        this.drawActors(setup.encounterId);
        this.refresh();
    }

    suspend(): void {
        this.stopEffects();
        this.presenter.finishPlayback();
    }

    skip(): void {
        if (!this.presenter.busy) return;
        this.stopEffects();
        this.presenter.finishPlayback();
        this.lastEvent = "";
        this.refresh();
    }

    private confirm(): void {
        const result = this.presenter.confirm();
        this.refresh();
        if (!result?.ok) return;
        this.queue = result.events.slice();
        this.nextEvent();
    }

    private nextEvent(): void {
        const event = this.queue.shift();
        if (!event) {
            this.presenter.finishPlayback();
            this.lastEvent = "";
            this.resetActors();
            this.refresh();
            const phase = this.expedition.run?.phase;
            if (phase === "extracted" || phase === "failed") this.navigate?.("settlement");
            return;
        }
        this.presenter.applyEvent(event);
        let delay = 100;
        switch (event.type) {
            case "skill_used":
                this.lastEvent = event.name;
                if (this.presenter.setup.skills.find(skill => skill.id === event.skillId)?.damage)
                    this.lunge(this.player, -24);
                delay = 230;
                break;
            case "intent_executed":
                this.lastEvent = event.name;
                if (this.presenter.setup.enemy.intents.find(intent => intent.id === event.intentId)?.type === "attack")
                    this.lunge(this.enemy, 24);
                delay = 230;
                break;
            case "damage": {
                const actor = event.target === "enemy" ? this.enemy : this.player;
                this.showNumber(event.hpLoss ? `-${event.hpLoss}` : "格挡", actor, event.hpLoss ? C.red : C.gold);
                Laya.Tween.to(actor, { x: 368, alpha: 0.45 }, 70, null,
                    Laya.Handler.create(this, () => Laya.Tween.to(actor, { x: 360, alpha: 1 }, 100)));
                delay = 340;
                break;
            }
            case "block_gained":
                this.lastEvent = `护盾 +${event.amount}`;
                this.showNumber(`+${event.amount} 护盾`, event.target === "player" ? this.player : this.enemy, C.gold);
                delay = 270;
                break;
            case "intent_interrupted": this.lastEvent = `${event.name} · 已打断`; delay = 420; break;
            case "enchant_used":
                this.lastEvent = event.element === 4 ? "火行注灵" : "土行注灵";
                delay = 200;
                break;
            case "healed":
                this.lastEvent = `恢复生命 ${event.amount}`;
                this.showNumber(`+${event.amount}`, this.player, C.jade);
                delay = 320;
                break;
            case "burn_damage":
                this.lastEvent = `灼烧 · 失血 ${event.hpLoss}`;
                this.showNumber(`灼烧 -${event.hpLoss}`, this.enemy, C.red);
                delay = 340;
                break;
            case "keen_changed":
                this.lastEvent = event.active ? `锋意生成 · 兑现伤害 ${event.damage}` : "锋意已兑现";
                delay = 260;
                break;
            case "passive_triggered":
                this.lastEvent = `被动触发 · ${event.name}`;
                delay = 260;
                break;
            case "battle_ended":
                Laya.Tween.to(event.result === "victory" ? this.enemy : this.player, { alpha: 0 }, 280);
                delay = 340;
                break;
        }
        this.refresh();
        Laya.timer.once(delay, this, this.nextEvent);
    }

    private refresh(): void {
        if (this.screen !== "battle") {
            this.refreshResult();
            return;
        }
        const p = this.presenter, s = p.display;
        if (!s || !p.setup?.enemy) { this.refreshResult(); return; }
        const intent = p.setup.enemy.intents[s.enemyIntentIndex];
        const terminal = s.phase === "victory" || s.phase === "defeat";
        this.labels.round.text = `${p.setup.order} / 3 战 · ${s.round} 回合`;
        const config = this.expedition.configuration;
        this.labels.upgrades.text = `强化：${s.upgradeIds.map(id => config.upgrades.find(row => row.id === id)?.name).join(" · ") || "无"}`;
        this.styleButton(this.buttons.loot, false, !p.busy);
        this.styleButton(this.buttons.battleReport, false, !p.busy);
        this.labels.enemyName.text = `${p.setup.enemy.name} · ${["无", "金", "木", "水", "火", "土"][p.setup.enemy.element] || "无"}`;
        this.labels.enemyBlock.text = `护盾 ${s.enemy.block}`;
        this.labels.enemyHp.text = `${s.enemy.hp} / ${s.enemy.maxHp}`;
        this.labels.intent.text = terminal ? (s.phase === "victory" ? "敌人已倒下" : "战斗结束")
            : `${intent.name}  ·  ${intent.type === "charge" ? "蓄力" : intent.type === "block" ? `护盾 ${intent.block}` : `伤害 ${intent.damage}`}`;
        this.labels.interrupt.text = terminal ? "" : intent.interruptible ? "可被破势打断" : "不可打断";
        if (s.enemyBurn) this.labels.interrupt.text += ` · 灼烧 ${s.enemyBurn}`;
        this.labels.playerHp.text = `生命 ${s.player.hp} / ${s.player.maxHp}`;
        this.labels.playerBlock.text = `护盾 ${s.player.block}`;
        this.labels.durability.text = `破旧铁剑  ·  耐久 ${s.weaponDurability} / ${p.setup.weaponDurability}`;
        this.labels.qi.text = `剑势  ${"◆ ".repeat(s.swordQi)}${"◇ ".repeat(s.swordQiMax - s.swordQi)} ${s.swordQi}/${s.swordQiMax}`
            + (s.keen ? "  ·  锋意" : "");
        this.labels.event.text = this.lastEvent;
        this.bar(720, 226, 430, s.enemy.hp / s.enemy.maxHp, C.red);
        this.bar(30, 516, 390, s.player.hp / s.player.maxHp, C.jade);
        p.setup.skills.forEach(skill => {
            const b = this.buttons[`skill${skill.id}`];
            const cost = SkillBattleFormulaUtils.qiCost(p.setup, s, skill.id);
            this.setButtonText(b, `${skill.name}\n${cost} 剑势`);
            const available = s.swordQi >= cost;
            this.styleButton(b, p.selectedId === skill.id, !p.busy && !terminal && available);
            // Resource-short skills remain inspectable and return the exact rule error.
            b.mouseEnabled = !p.busy && !terminal;
        });
        s.pouchSlots.forEach((instance, i) => {
            const item = p.setup.items.find(row => row.itemId === instance?.itemId);
            const selected = p.selectedAction?.type === "use_item" ? p.selectedAction.itemUid
                : p.selectedAction?.stoneItemUid;
            const active = !!instance && selected === instance.itemUid;
            const button = this.buttons[`pouch${i}`];
            const available = !!item && (item.useType === "heal" ? s.player.hp < s.player.maxHp
                : s.weaponDurability >= item.durabilityCost && !!p.selectedId &&
                    !!p.setup.skills.find(skill => skill.id === p.selectedId)?.canEnchant);
            this.styleButton(button, active, !p.busy && !terminal && available);
            button.mouseEnabled = !!instance && !p.busy && !terminal;
            this.setButtonText(button, item
                ? `${item.useType === "heal" ? "疗伤丹" : item.useType === "fire_stone" ? "火石" : "土石"}\n${active ? (item.useType === "heal" ? "待用药" : "待附带") : item.useType === "heal" ? `恢复${item.healValue}` : "注灵"}`
                : p.setup.items.some(row => row.initialSlot === i + 1) ? "已消耗" : "空");
            const icon = this.pouchIcons[i];
            icon.visible = !!item;
            if (item) icon.src = `ui/texture/skillBattle/${item.useType}.png`;
        });
        this.buttons.skip.visible = p.busy;
        this.buttons.cancel.visible = !p.busy && !!p.selection;
        this.styleButton(this.buttons.confirm, true, !p.busy && !!p.selection?.ok);
        this.styleButton(this.buttons.cancel, false, !p.busy && !!p.selection);
        const selected = p.setup.skills.find(skill => skill.id === p.selectedId);
        const preview = p.selection?.preview;
        const selectedStoneUid = p.selectedAction?.type === "skill" ? p.selectedAction.stoneItemUid : null;
        const stone = selectedStoneUid
            ? p.setup.items.find(row => row.itemId === s.pouchSlots.find(item => item?.itemUid === selectedStoneUid)?.itemId)
            : null;
        this.labels.previewTitle.text = p.busy ? "交锋中" : selected
            ? `${selected.name}${stone ? stone.useType === "fire_stone" ? " · 火行注灵" : " · 土行注灵" : ""}`
            : p.selectedAction?.type === "use_item" ? "疗伤丹" : terminal ? "此战已决" : "待出招";
        this.labels.preview.text = p.busy ? this.lastEvent : p.message || (preview
            ? `${p.selectedAction?.type === "use_item" ? `恢复生命 ${preview.healAmount} · 占用本回合行动`
                : `伤害 ${preview.baseDamage}+${preview.enchantDamage} · 护盾吸收 ${preview.blockAbsorbed + preview.enchantBlockAbsorbed} · 失血 ${preview.enemyHpLoss + preview.enchantHpLoss} · 灼烧 ${preview.burnApplied}/${preview.burnDamage}`}\n`
                + `${preview.interrupted ? "打断意图" : `受伤 ${preview.playerHpLoss}`} · 护盾 +${preview.blockGained} · 反击 ${preview.counterHpLoss}`
                + ` · 剑势 ${preview.qiAfterAction}/${preview.qiCost} · 耐久/物品 -${preview.durabilityCost}/-${preview.consumedItemUid ? 1 : 0}`
            : "");
        this.refreshResult();
        if (!p.busy) {
            this.enemy.alpha = s.enemy.hp ? 1 : 0;
            this.player.alpha = s.player.hp ? 1 : 0;
        }
    }

    private bindResultActions(bind: (key: string, click: () => void) => void): void {
        for (let i = 0; i < 3; i++) {
            bind(`upgrade${i}`, () => this.runOverlayCommand(() => this.runCommand(() => {
                const build = this.expedition.run?.build;
                if (this.showBuild && build) {
                    this.selectBuildEntry(build, i);
                    return;
                }
                const id = this.expedition.run.pendingUpgradeChoices[i];
                this.expedition.chooseUpgrade(id);
            })));
        }
        for (let i = 0; i < 6; i++) {
            bind(`warehouse${i}`, () => this.runOverlayCommand(() => this.runCommand(() => {
                const build = this.expedition.run?.build;
                if (this.showBuild && build) {
                    this.selectBuildEntry(build, i);
                    return;
                }
                if (this.screen === "start" && build && !this.expedition.run?.settled &&
                    !build.activeSkills.length) {
                    const skillId = build.startCandidates[i];
                    if (skillId !== undefined) this.expedition.chooseStartingSkill(skillId);
                    return;
                }
                const item = this.expedition.snapshot.profile.warehouse[this.warehousePage * 6 + i];
                if (!item) return;
                const loot = this.expedition.configuration.loot.find(row => row.itemId === item.itemId);
                if (loot.useType === "collection") {
                    this.expedition.collectLoot(item.itemUid);
                    this.notice = "收藏成功：后续新局开放余势、破绽";
                } else this.notice = `打开获得 ${this.expedition.openLoot(item.itemUid)} 灵石`;
            })));
        }
        bind("previousPage", () => {
            if (this.showReport) this.reportPage--; else this.warehousePage--;
            this.refresh();
        });
        bind("nextPage", () => {
            if (this.showReport) this.reportPage++; else this.warehousePage++;
            this.refresh();
        });
        bind("continue", () => {
            if (this.expedition.run?.map) {
                this.runOverlayCommand(() => this.runCommand(() => {
                    this.expedition.returnToMap();
                    this.navigate?.("map");
                }));
                return;
            }
            this.continueNext();
            if (this.expedition.run?.phase === "battle") this.navigate?.("battle");
        });
        bind("extract", () => this.runOverlayCommand(() => this.runCommand(() => {
            this.expedition.extract();
            this.navigate?.("start");
        })));
        bind("hub", () => {
            this.showHub = true; this.notice = ""; this.refresh(); this.navigate?.("start");
        });
        bind("newRun", () => {
            if (this.screen === "start") {
                this.startRun();
                return;
            }
            this.runOverlayCommand(() => this.runCommand(() => {
                if (!this.expedition.active) this.expedition.startNew();
                this.showHub = false; this.notice = ""; this.navigate?.("battle");
            }));
        });
        bind("lootClose", () => {
            this.showLoot = false; this.refresh();
            if (this.screen === "settlement") this.navigate?.("start");
        });
        bind("reset", () => { this.resetConfirm = true; this.refresh(); });
        bind("resetYes", () => this.runOverlayCommand(() => this.runCommand(() => {
            this.expedition.resetTestProfile();
            this.resetConfirm = false; this.showHub = true; this.notice = ""; this.navigate?.("start");
        })));
        bind("resetNo", () => { this.resetConfirm = false; this.refresh(); });
        bind("report", () => {
            if (this.showBuild) {
                const build = this.expedition.run?.build;
                if (this.replacementSkillId) {
                    this.replacementSkillId = 0;
                    this.refresh();
                } else if (build?.pendingActiveCandidateIds.length) {
                    this.runOverlayCommand(() => this.runCommand(() => this.expedition.skipActiveChoice()));
                }
                return;
            }
            this.openReport();
        });
        bind("summary", () => {
            this.reportMode = "summary"; this.reportPage = 0; this.refresh();
        });
        bind("actions", () => {
            this.reportMode = "actions"; this.reportPage = 0; this.refresh();
        });
        bind("olderReport", () => {
            this.reportIndex--; this.reportPage = 0; this.refresh();
        });
        bind("newerReport", () => {
            this.reportIndex++; this.reportPage = 0; this.refresh();
        });
        bind("reportClose", () => {
            if (this.showBuild) {
                if (this.replacementSkillId) this.replacementSkillId = 0;
                else this.showBuild = false;
                this.refresh();
                return;
            }
            this.showReport = false; this.refresh();
        });
    }

    private openBuild(): void {
        const run = this.expedition.run;
        if (this.presenter.busy) return;
        if (!run?.build || run.settled) {
            this.notice = "当前没有可查看的局内构筑";
            this.refresh();
            return;
        }
        this.showBuild = true;
        this.replacementSkillId = 0;
        this.notice = "";
        if (!run.build.pendingActiveCandidateIds.length && run.build.pendingPassiveChoices > 0 &&
            !run.build.pendingPassiveCandidateIds.length) {
            try {
                this.expedition.passiveCandidates();
            } catch (error) {
                this.notice = (error as Error).message;
            }
        }
        this.refresh();
    }

    private selectBuildEntry(build: IExpeditionBuildState, index: number): void {
        if (!this.canManageBuild()) return;
        if (this.replacementSkillId) {
            const oldSkill = build.activeSkills[index];
            if (!oldSkill) return;
            this.expedition.replaceActive(oldSkill.skillId, this.replacementSkillId);
            this.replacementSkillId = 0;
            this.notice = "替换完成，强化档位已继承";
            return;
        }
        const activeCandidate = build.pendingActiveCandidateIds[index];
        if (activeCandidate !== undefined) {
            const slots = this.expedition.configuration.build?.activeSkillSlots ?? 3;
            if (build.activeSkills.length < slots) {
                this.expedition.claimActiveCandidate(activeCandidate);
                this.notice = "借法成功";
            } else this.replacementSkillId = activeCandidate;
            return;
        }
        const passiveCandidate = build.pendingPassiveCandidateIds[index];
        if (passiveCandidate !== undefined) {
            this.expedition.claimPassive(passiveCandidate);
            this.notice = "参悟成功";
            return;
        }
        const active = build.activeSkills[index];
        if (active) {
            this.expedition.strengthenActive(active.skillId);
            this.notice = "强化成功";
        }
    }

    private canManageBuild(): boolean {
        const run = this.expedition.run;
        return !!run && !run.settled && (run.phase !== "battle" || this.showHub);
    }

    private runOverlayCommand(command: () => void): void {
        const now = Date.now();
        if (now - this.overlayCommandAt < 250) return;
        this.overlayCommandAt = now;
        command();
    }

    private openReport(): void {
        if (this.presenter.busy) return;
        this.showBuild = false;
        this.replacementSkillId = 0;
        this.showReport = true; this.reportMode = "summary"; this.reportPage = 0;
        this.reportIndex = this.expedition.snapshot.history.length;
        this.refresh();
    }

    private refreshReport(): void {
        const save = this.expedition.snapshot, config = this.expedition.configuration;
        const reports = save.history.concat(save.run ? [save.run.report] : []);
        this.reportIndex = Math.max(0, Math.min(reports.length - 1, this.reportIndex));
        const report = reports[this.reportIndex], names = (ids: number[]) =>
            ids.map(id => config.upgrades.find(row => row.id === id).name).join("、") || "无";
        this.resultTitle.text = "战斗记录";
        this.resultDetail.text = report ? `第 ${this.reportIndex + 1} 份记录 · 种子 ${report.seed}\n`
            + `${report.outcome === "extracted" ? `第 ${report.exitEncounter} 战撤离` : report.outcome === "failed"
                ? `第 ${report.exitEncounter} 战失败` : "秘境进行中"}${report.partial ? " · 旧局记录不完整" : ""}` : "暂无战斗记录";
        let lines: string[] = [];
        if (report) {
            if (this.reportMode === "summary") {
                lines.push(`带出奖励：${report.broughtLoot.map(item => config.loot.find(row => row.itemId === item.itemId).name).join("、") || "无"}`,
                    `结算剩余物资：${report.outcome ? report.remainingPouch.filter(Boolean).length : "未结算"}`,
                    `本局带出收藏解锁：${report.collectionUnlockIds.length ? "成功" : "未解锁"}`);
                report.choices.forEach(choice => lines.push(`第 ${choice.encounterIndex + 1} 战候选：${names(choice.ids)}`,
                    `选择：${choice.selectedId === null ? "未选择" : names([choice.selectedId])}`));
            }
            for (const record of report.battles) {
                const setup = config.encounters.find(row => row.encounterId === record.initial.encounterId);
                const s = ExpeditionStatsUtils.battle(record, setup);
                lines.push(`【${setup.enemy.name}】${s.result === "victory" ? "胜利" : s.result === "defeat" ? "失败" : "进行中"}`);
                if (this.reportMode === "actions") lines.push(...s.logs);
                else lines.push(`敌人 ${s.enemyId} · 已记录 ${s.rounds} 回合`,
                    `生命 ${s.startHp} → ${s.endHp} · 强化 ${names(s.upgradeIds)}`,
                    `剑击/守势/贯虹/破势：${s.skillUses.join("/")}`,
                    `用药 ${s.medicineUses} · 恢复 ${s.healed} · 承伤 ${s.incomingDamage}`,
                    `格挡吸收 ${s.blockAbsorbed} · 打断 ${s.interrupts}`,
                    `实际伤害 ${s.damage} · 其中灼烧 ${s.burnDamage}`,
                    `剑势生成/消耗/溢出：${s.qiGenerated}/${s.qiSpent}/${s.qiOverflow}`,
                    `属性石 ${s.stonesUsed} · 耐久消耗 ${s.durabilitySpent}`);
            }
        }
        lines = lines.reduce<string[]>((all, line) => all.concat(line.match(/.{1,28}/g) || [""]), []);
        const pages = Math.max(1, Math.ceil(lines.length / 13));
        this.reportPage = Math.max(0, Math.min(pages - 1, this.reportPage));
        this.labels.reportBody.text = lines.slice(this.reportPage * 13, (this.reportPage + 1) * 13).join("\n");
        this.labels.reportBody.visible = true;
        this.labels.page.text = `${this.reportPage + 1} / ${pages}`;
        ["summary", "actions", "previousPage", "nextPage", "olderReport", "newerReport", "reportClose"]
            .forEach(key => this.buttons[key].visible = true);
        this.styleButton(this.buttons.summary, this.reportMode === "summary", true);
        this.styleButton(this.buttons.actions, this.reportMode === "actions", true);
        this.styleButton(this.buttons.previousPage, false, this.reportPage > 0);
        this.styleButton(this.buttons.nextPage, false, this.reportPage + 1 < pages);
        this.styleButton(this.buttons.olderReport, false, this.reportIndex > 0);
        this.styleButton(this.buttons.newerReport, false, this.reportIndex + 1 < reports.length);
    }

    private runCommand(command: () => unknown): void {
        if (this.presenter.busy) return;
        try { this.notice = ""; command(); }
        catch (error) { this.notice = (error as Error).message; }
        this.refresh();
    }

    private refreshBuild(run: IExpeditionState, config: IExpeditionConfig): void {
        const build = run.build!;
        const canManage = this.canManageBuild();
        const skillName = (id: number) => config.build?.skills.find(row => row.id === id)?.name || `技能 ${id}`;
        const passiveName = (id: number) => config.build?.passives.find(row => row.id === id)?.name || `被动 ${id}`;
        const level = (value: number) => value ? `+${value}` : "基础";
        const buildButton = (index: number) => this.buttons[`${this.screen === "battle" ? "upgrade" : "warehouse"}${index}`];
        const showBuildButton = (index: number) => this.showButton(
            `${this.screen === "battle" ? "upgrade" : "warehouse"}${index}`);
        const thresholds = config.build?.daoyunThresholds || [30, 40];
        const threshold = build.nextDaoyunThresholdIndex === 0 ? thresholds[0] : thresholds[1] ?? thresholds[0];
        this.resultTitle.text = "借法构筑";
        this.resultDetail.text = `本局大道：${build.schools.map(schoolLabel).join(" · ")}\n`
            + `主动 ${build.activeSkills.length} / ${config.build?.activeSkillSlots ?? 3} · 技能点 ${build.skillPoints}`
            + ` · 道韵 ${build.daoyun} / ${threshold}\n`
            + `被动：${build.passiveIds.map(passiveName).join("、") || "无"}`
            + (build.pendingPassiveChoices ? ` · 待参悟 ${build.pendingPassiveChoices}` : "");
        this.labels.section.text = build.activeSkills.map(active =>
            `${skillName(active.skillId)} ${level(active.level)}`).join(" · ") || "尚未装配主动";
        this.labels.choiceTitle.text = "";
        this.labels.page.text = "";
        this.labels.reportBody.visible = false;
        this.labels.overlayMessage.text = this.notice || (canManage ? "" : "战斗中仅可查看构筑，借法与强化需在战斗外进行");
        this.setButtonText(this.buttons.reportClose, this.replacementSkillId ? "取消替换" : "返回");
        this.styleButton(this.buttons.reportClose, false, true);
        this.showButton("reportClose");
        if (this.replacementSkillId) {
            this.labels.choiceTitle.text = `选择要替换的主动 · 新技能 ${skillName(this.replacementSkillId)}`;
            build.activeSkills.forEach((active, index) => {
                const button = buildButton(index);
                this.setButtonText(button, `${skillName(active.skillId)} ${level(active.level)}\n替换并继承档位`);
                this.styleButton(button, false, canManage);
                showBuildButton(index);
            });
            return;
        }
        if (build.pendingActiveCandidateIds.length) {
            this.labels.choiceTitle.text = build.activeSkills.length >= (config.build?.activeSkillSlots ?? 3)
                ? "借法台 · 主动已满，选择一项后指定替换对象"
                : "借法台 · 选择一项主动";
            build.pendingActiveCandidateIds.forEach((skillId, index) => {
                const button = buildButton(index);
                const full = build.activeSkills.length >= (config.build?.activeSkillSlots ?? 3);
                this.setButtonText(button, `${skillName(skillId)}\n${full ? "更换主动" : "借取主动"}`);
                this.styleButton(button, false, canManage);
                showBuildButton(index);
            });
            this.setButtonText(this.buttons.report, "放弃本次候选\n获得 2 技能点");
            this.styleButton(this.buttons.report, false, canManage);
            this.showButton("report");
            return;
        }
        if (build.pendingPassiveCandidateIds.length) {
            this.labels.choiceTitle.text = "参悟 · 选择一项被动";
            build.pendingPassiveCandidateIds.forEach((passiveId, index) => {
                const button = buildButton(index);
                this.setButtonText(button, `${passiveName(passiveId)}\n领取被动`);
                this.styleButton(button, false, canManage);
                showBuildButton(index);
            });
            return;
        }
        this.labels.choiceTitle.text = build.pendingPassiveChoices > 0
            ? "尚有道韵参悟机会待生成"
            : build.skillPoints > 0 ? "选择主动强化，每点提升一档" : "当前没有待处理构筑选择";
        build.activeSkills.forEach((active, index) => {
            const maxLevel = config.build?.maxSkillLevel ?? 5;
            const canStrengthen = canManage && build.skillPoints > 0 && active.level < maxLevel;
            const button = buildButton(index);
            this.setButtonText(button, `${skillName(active.skillId)} ${level(active.level)}\n`
                + (active.level >= maxLevel ? "已圆满" : canStrengthen ? "消耗 1 技能点强化" : "等待技能点"));
            this.styleButton(button, false, canStrengthen);
            showBuildButton(index);
        });
    }

    private showButton(key: string): void {
        const button = this.buttons[key];
        if (button) button.visible = true;
    }

    private refreshResult(): void {
        const run = this.expedition.run, save = this.expedition.snapshot, config = this.expedition.configuration;
        const resultVisible = !this.presenter.busy && (this.showHub || this.showLoot || this.showReport || this.showBuild ||
            !!this.expedition.error || !run || run.phase !== "battle");
        this.result.visible = resultVisible;
        ["overlayBrand", "currency", "resultTitle", "resultDetail", "section", "overlayMessage", "choiceTitle", "page"]
            .forEach(key => this.labels[key].visible = this.result.visible);
        if (this.screen === "battle") this.setCombatChromeVisible(!resultVisible);
        if (!this.result.visible) return;
        this.overlayButtons.forEach(key => this.buttons[key].visible = false);
        for (let i = 0; i < 6; i++) if (this.labels[`lootSlot${i}`]) this.labels[`lootSlot${i}`].visible = false;
        this.labels.choiceTitle.text = ""; this.labels.page.text = "";
        this.labels.reportBody.visible = false;
        this.labels.overlayMessage.text = this.notice;
        this.labels.currency.text = `灵石 ${save?.profile.currency || 0}`;
        this.labels.section.text = "";
        this.setButtonText(this.buttons.report, "战斗记录");
        this.setButtonText(this.buttons.reportClose, "返回");
        const show = (key: string) => {
            const button = this.buttons[key];
            if (button) button.visible = true;
        };
        if (this.resetConfirm) {
            this.resultTitle.text = "确认重置测试档";
            this.resultDetail.text = "将清空秘境、灵石、入库物品和收藏标记。\n恢复铁剑耐久，并补发火石、土石、疗伤丹各一件。";
            show("resetYes"); show("resetNo"); return;
        }
        if (this.expedition.error && this.screen === "start") {
            this.resultTitle.text = "存档无法载入";
            this.resultDetail.text = "原存档已保留。";
            this.labels.overlayMessage.text = this.expedition.error;
            show("reset"); return;
        }
        if (this.expedition.error) {
            this.resultTitle.text = "存档无法载入";
            this.resultDetail.text = "原存档已保留，请返回据点处理。";
            this.labels.overlayMessage.text = this.expedition.error;
            show("hub"); return;
        }
        if (this.showBuild && run?.build) { this.refreshBuild(run, config); return; }
        if (this.showReport) { this.refreshReport(); return; }
        show("report");
        if (this.showHub || !run) {
            const profile = save.profile;
            if (run?.build && !run.settled && !run.build.activeSkills.length) {
                this.resultTitle.text = "起始借法";
                this.resultDetail.text = `本局大道：${run.build.schools.map(schoolLabel).join(" · ")}\n请选择一项主动，选择后才能入战。`;
                this.labels.section.text = "三选一";
                run.build.startCandidates.forEach((skillId, i) => {
                    const skill = config.encounters[0].skills.find(row => row.id === skillId);
                    const button = this.buttons[`warehouse${i}`];
                    this.setButtonText(button, skill ? `${skill.name}\n选择` : "候选无效");
                    this.styleButton(button, false, !!skill);
                    show(`warehouse${i}`);
                });
                this.setButtonText(this.buttons.newRun, "确认入战");
                this.styleButton(this.buttons.newRun, false, !!run.build.activeSkills.length);
                show("newRun");
                show("reset");
                return;
            }
            if (run?.map && config.map) {
                const currentNode = config.map.nodes.find(node => node.id === run.map!.currentNodeId);
                this.resultTitle.text = "局内整备";
                this.resultDetail.text = `当前位置：${currentNode?.name || "未知节点"}\n`
                    + `生命 ${run.battle.player.hp} / ${run.battle.player.maxHp} · 耐久 ${run.battle.weaponDurability}\n`
                    + `主动 ${run.build?.activeSkills.length || 0} / 3 · 技能点 ${run.build?.skillPoints || 0} · 道韵 ${run.build?.daoyun || 0}`;
                this.labels.section.text = run.build?.activeSkills.map(active => {
                    const skill = config.build?.skills.find(row => row.id === active.skillId);
                    return `${skill?.name || active.skillId} ${active.level ? `+${active.level}` : "基础"}`;
                }).join(" · ") || "尚未装配主动";
                this.setButtonText(this.buttons.newRun, "返回地图");
                this.styleButton(this.buttons.newRun, false, true);
                show("newRun"); show("build");
                return;
            }
            this.resultTitle.text = "散修据点";
            this.resultDetail.text = `破旧铁剑 · 耐久 ${profile.weaponDurability} / ${config.encounters[0].weaponDurability}\n`
                + `法囊：${profile.pouchSlots.filter(Boolean).map(item => {
                    const use = config.encounters[0].items.find(row => row.itemId === item.itemId).useType;
                    return use === "fire_stone" ? "火石" : use === "earth_stone" ? "土石" : "疗伤丹";
                }).join("、") || "空"}\n试炼剑诀：${profile.collectionIds.includes(1) ? "已收藏 · 余势、破绽开放" : "未收藏"}`;
            this.labels.section.text = `入库物品 · ${profile.warehouse.length}`;
            const pages = Math.max(1, Math.ceil(profile.warehouse.length / 6));
            this.warehousePage = Math.max(0, Math.min(pages - 1, this.warehousePage));
            for (let i = 0; i < 6; i++) {
                const item = profile.warehouse[this.warehousePage * 6 + i];
                if (!item) continue;
                const loot = config.loot.find(row => row.itemId === item.itemId);
                const b = this.buttons[`warehouse${i}`];
            this.setButtonText(b, `${loot.name}   ${loot.useType === "currency"
                    ? `${loot.currencyValue} 灵石   打开` : profile.collectionIds.includes(loot.collectionId)
                        ? "已收藏 · 重复残卷留存" : "收藏"}`);
                this.styleButton(b, false, true);
                show(`warehouse${i}`);
            }
            if (pages > 1) {
                this.labels.page.text = `${this.warehousePage + 1} / ${pages}`;
                show("previousPage"); show("nextPage");
                this.styleButton(this.buttons.previousPage, false, this.warehousePage > 0);
                this.styleButton(this.buttons.nextPage, false, this.warehousePage + 1 < pages);
            }
            this.setButtonText(this.buttons.newRun,
                run?.build?.activeSkills.length ? (run.map ? "返回地图" : "进入探索") : "开始新一局");
            this.styleButton(this.buttons.newRun, false, true);
            show("newRun"); show("reset");
            if (run?.build) show("build");
            return;
        }
        show("loot");
        const s = run.battle;
        this.resultTitle.text = this.showLoot ? "本局战利品" : run.phase === "reward" ? "此战告捷"
            : run.phase === "decision" ? "去留之间" : run.phase === "extracted" ? "平安归来" : "力竭落败";
        this.resultDetail.text = `${run.encounterIndex + 1} / 3 战 · 剩余生命 ${s.player.hp} / ${s.player.maxHp}\n`
            + `铁剑耐久 ${s.weaponDurability} · 法囊 ${run.phase === "failed" ? 0 : s.pouchSlots.filter(Boolean).length} / 5`;
        this.labels.section.text = run.settled ? (run.phase === "failed" ? "战利品与剩余法囊已丢失" : "战利品已入库") : `暂存战利品 · ${run.loot.length} / 6`;
        if (!run.settled) for (let i = 0; i < 6; i++) {
            const item = run.loot[i], loot = config.loot.find(row => row.itemId === item?.itemId);
            this.labels[`lootSlot${i}`].text = loot ? `${loot.name}\n${loot.currencyValue ? `${loot.currencyValue} 灵石` : "残卷"}` : "空";
            this.labels[`lootSlot${i}`].visible = true;
        }
        if (this.showLoot) { show("lootClose"); return; }
        if (run.phase === "reward") {
            this.labels.choiceTitle.text = "选择本局强化";
            run.pendingUpgradeChoices.forEach((id, i) => {
                const upgrade = config.upgrades.find(row => row.id === id);
                const descriptions = {
                    counter: `守势吸收攻击后，存活则反击 ${upgrade.value}`,
                    full_qi_slash: `满剑势出剑击，基础伤害 +${upgrade.value}`,
                    thrust_cost: `贯虹消耗降至 ${upgrade.value} 剑势`,
                    interrupt_slash: `成功打断后，下一次剑击 +${upgrade.value}`,
                    guard_block: `守势获得 ${upgrade.value} 护盾`,
                    fire_burn: `火石施加的灼烧 +${upgrade.value}`,
                };
                this.setButtonText(this.buttons[`upgrade${i}`], `${upgrade.name}\n${descriptions[upgrade.effect]}`);
                show(`upgrade${i}`);
            });
            if (run.build) show("build");
        } else if (run.phase === "decision") {
            this.labels.choiceTitle.text = `本局强化：${run.upgradeIds.map(id => config.upgrades.find(row => row.id === id).name).join(" · ") || "无"}`;
            this.setButtonText(this.buttons.continue, run.map ? "返回地图" : "继续深入");
            show("continue");
            if (!run.map) show("extract");
            if (run.build) show("build");
        } else if (run.settled) show("hub");
    }

    private setCombatChromeVisible(visible: boolean): void {
        if (visible) this.overlayButtons.forEach(key => {
            if (key !== "loot" && key !== "build") this.buttons[key].visible = false;
        });
        BATTLE_LABELS.forEach(key => {
            if (this.labels[key]) this.labels[key].visible = visible;
        });
        [this.player, this.enemy].forEach(node => {
            if (node) node.visible = visible;
        });
        if (this.numbers) this.numbers.visible = visible;
        Object.values(this.bars).forEach(bar => {
            if (bar) bar.visible = visible;
        });

        const combatButtons = ["battleReport", "loot", "build", "confirm",
            ...Array.from({ length: 4 }, (_, i) => `skill${i + 1}`),
            ...Array.from({ length: 5 }, (_, i) => `pouch${i}`)];
        combatButtons.forEach(key => {
            if (this.buttons[key]) this.buttons[key].visible = visible;
        });
        if (!visible) {
            if (this.buttons.skip) this.buttons.skip.visible = false;
            if (this.buttons.cancel) this.buttons.cancel.visible = false;
        } else {
            if (this.buttons.skip) this.buttons.skip.visible = this.presenter.busy;
            if (this.buttons.cancel) this.buttons.cancel.visible = !this.presenter.busy && !!this.presenter.selection;
        }
    }

    private styleButton(b: Laya.GWidget, selected: boolean, enabled: boolean): void {
        b.graphics.clear();
        const cut = Math.min(8, b.width * 0.08, b.height * 0.2);
        const fill = selected ? "#263c31" : (enabled ? C.surface : "#202824");
        const border = selected ? C.jade : (enabled ? C.line : "#3c463f");
        b.graphics.drawPoly(0, 0, [
            cut, 0, b.width - cut, 0, b.width, cut,
            b.width, b.height - cut, b.width - cut, b.height,
            cut, b.height, 0, b.height - cut, 0, cut,
        ], fill, border, selected ? 2 : 1);
        b.graphics.drawLine(10, 1, b.width - 10, 1, selected ? C.gold : (enabled ? "#31483b" : "#303a33"), 1);
        b.graphics.drawRect(0, cut + 3, 3, b.height - cut * 2 - 6,
            selected ? C.gold : (enabled ? "#466858" : "#343e37"));
        b.alpha = enabled ? 1 : 0.45;
        b.mouseEnabled = enabled;
    }

    private setButtonText(button: Laya.GWidget, value: string): void {
        const label = button?.getChildAt(0) as Laya.GTextField;
        if (!label) {
            console.warn(`button text node missing: ${button?.name}`);
            return;
        }
        label.text = value;
    }

    private bars: { [key: string]: Laya.GWidget } = {};
    private bar(x: number, y: number, w: number, ratio: number, color: string): void {
        const key = y < 400 ? "enemyHpBar" : "playerHpBar";
        const bar = this.bars[key] || (this.bars[key] = this.root.findChild(key) as Laya.GWidget);
        if (!bar) return;
        bar.graphics.clear();
        bar.graphics.drawRect(0, 0, w, 8, "#39443c");
        if (ratio > 0) bar.graphics.drawRect(0, 0, w * Math.min(1, ratio), 8, color);
    }

    private drawActors(encounterId: number): void {
        const p = this.player.graphics, e = this.enemy.graphics;
        p.clear(); e.clear();
        p.drawEllipse(-61, 64, 122, 22, "#18201a", null, 0);
        p.drawPoly(0, 0, [-22,-34, 19,-34, 49,61, 13,70, -43,62], "#a9b9aa", "#e0e7d7", 2);
        p.drawPoly(0, 0, [-18,-27, 10,-24, 29,60, -10,64], "#465f51");
        p.drawCircle(0, -49, 20, "#c4c9b4");
        p.drawPoly(0, 0, [-23,-49, -17,-72, 13,-74, 24,-51, 9,-56, -4,-43], "#17211c");
        p.drawLine(24, 5, 88, -65, "#d9e3d4", 6);
        p.drawLine(40, -3, 21, -21, C.gold, 5);
        p.drawLine(-28, 4, -52, 35, "#d1dac8", 12);
        e.drawEllipse(-78, 61, 156, 24, "#18201a", null, 0);
        if (encounterId === 3) {
            e.drawPoly(0, 0, [-50,-42, 37,-47, 67,22, 37,59, -46,59, -68,13], "#798374", "#b3baa2", 3);
            e.drawPoly(0, 0, [-30,-50, -24,-86, 27,-84, 38,-50, 16,-27], "#909783", "#b3baa2", 2);
            e.drawLine(-12, -62, 17, -62, C.red, 5);
            e.drawLine(-4, -18, -15, 21, "#3c4b3e", 4);
            e.drawLine(-15, 21, 13, 36, "#3c4b3e", 4);
            e.drawLine(58, -3, 99, 34, "#b4b99e", 15);
        } else {
            e.drawPoly(0, 0, [-77,25, -45,-23, 20,-38, 66,-4, 81,33, 27,55, -48,49],
                encounterId === 1 ? "#72826b" : "#9c9c88", "#b7bda5", 2);
            if (encounterId === 2) {
                e.drawPoly(0, 0, [-17,-29, -32,-102, -17,-112, 4,-37], "#a8ad96", "#c3c6b0", 2);
                e.drawPoly(0, 0, [13,-35, 21,-111, 39,-104, 34,-28], "#a8ad96", "#c3c6b0", 2);
            } else {
                e.drawCircle(-20, -33, 22, "#89967a", "#b7bda5", 2);
                e.drawLine(-68, 25, -111, 9, "#9a9b80", 5);
            }
            e.drawCircle(37, -6, 5, "#e19b87");
            e.drawPoly(0, 0, [60,6, 92,21, 61,27], "#c6bba1");
            e.drawLine(-35, 44, -51, 63, "#aab49a", 8);
            e.drawLine(36, 44, 55, 60, "#aab49a", 8);
        }
        this.resetActors();
    }

    private lunge(actor: Laya.Sprite, dy: number): void {
        const x = actor === this.player ? 250 : 970;
        Laya.Tween.to(actor, { x: x + dy }, 100, null,
            Laya.Handler.create(this, () => Laya.Tween.to(actor, { x }, 110)));
    }

    private showNumber(text: string, actor: Laya.Sprite, color: string): void {
        Laya.Tween.clearAll(this.numbers);
        this.numbers.text = text; this.numbers.color = color;
        this.numbers.pos(actor.x - 30, actor.y - 105); this.numbers.alpha = 1;
        Laya.Tween.to(this.numbers, { y: actor.y - 135, alpha: 0 }, 360);
    }

    private resetActors(): void {
        if (!this.player || !this.enemy) return;
        this.player.pos(250, 350); this.enemy.pos(970, 370);
        this.player.alpha = this.enemy.alpha = 1;
    }

    private stopEffects(): void {
        Laya.timer.clearAll(this);
        [this.player, this.enemy, this.numbers].filter(Boolean).forEach(node => Laya.Tween.clearAll(node));
        this.queue = [];
        if (this.numbers) this.numbers.text = "";
        this.resetActors();
    }
}
