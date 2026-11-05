import { SkillBattlePresenter } from "./SkillBattlePresenter";
import type { SkillBattleEvent } from "../types/SkillBattleTypes";
import { SkillBattleManager } from "../manager/SkillBattleManager";
import { SkillBattleFormulaUtils } from "../utils/SkillBattleFormulaUtils";
import { ExpeditionManager } from "../../expedition/manager/ExpeditionManager";
import type { IExpeditionConfig } from "../../expedition/types/ExpeditionTypes";

const C = { bg: "#171d1b", surface: "#232b27", line: "#526054", text: "#e3e8de",
    muted: "#a3afa5", jade: "#9ac8ae", red: "#d58c80", gold: "#d4bc7e" };

/** A native Laya surface shared by the game form and the browser acceptance runner. */
export class SkillBattlePanel extends Laya.GWidget {
    readonly presenter: SkillBattlePresenter;
    readonly expedition: ExpeditionManager;
    private labels: { [key: string]: Laya.GTextField } = {};
    private buttons: { [key: string]: Laya.GWidget } = {};
    private player = new Laya.Sprite();
    private enemy = new Laya.Sprite();
    private numbers = new Laya.GTextField();
    private result = new Laya.GWidget();
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

    constructor(config: IExpeditionConfig) {
        super();
        this.expedition = new ExpeditionManager(config);
        this.presenter = new SkillBattlePresenter(SkillBattleManager.ins(), this.expedition);
        this.showHub = !this.expedition.active;
        this.size(720, 1280);
        this.mouseThrough = false;
        this.drawScene();
        this.addLabel("brand", "末法寻仙", 30, 20, 330, 46, 32);
        this.addLabel("round", "", 430, 24, 260, 38, 23, C.muted, "right");
        this.addLabel("upgrades", "", 30, 84, 470, 48, 21, C.gold);
        this.button("loot", "战利品", 530, 84, 160, 48, () => {
            if (!this.presenter.busy) { this.showLoot = true; this.refresh(); }
        });
        this.addLabel("enemyName", "", 30, 156, 440, 42, 30);
        this.addLabel("enemyBlock", "", 470, 164, 220, 32, 21, C.gold, "right");
        this.addLabel("enemyHp", "", 30, 218, 660, 32, 21, C.text, "center");
        this.addLabel("intent", "", 30, 266, 660, 38, 26, C.red, "center");
        this.addLabel("interrupt", "", 30, 308, 660, 30, 20, C.muted, "center");
        this.enemy.pos(360, 455);
        this.player.pos(360, 608);
        this.addChild(this.enemy);
        this.addChild(this.player);
        this.addLabel("event", "", 30, 556, 236, 30, 20, C.gold);
        this.addLabel("playerName", "散修", 30, 704, 220, 42, 28);
        this.addLabel("durability", "", 250, 710, 440, 28, 21, C.muted, "right");
        this.addLabel("playerHp", "", 30, 765, 350, 30, 22);
        this.addLabel("playerBlock", "", 430, 765, 260, 30, 22, C.gold, "right");
        this.addLabel("qi", "", 30, 806, 660, 30, 23, C.jade);
        this.button("skip", "跳过动画", 506, 804, 184, 36, () => this.skip());
        ["剑击", "守势", "贯虹", "破势"].forEach((name, i) => {
            const button = this.button(`skill${i + 1}`, "", 30 + i * 169, 852, 153, 76,
                () => { this.presenter.select(i + 1); this.refresh(); });
            const label = button.getChildAt(0) as Laya.GTextField;
            label.pos(40, 0); label.size(110, 76); label.fontSize = 22;
            const icon = new Laya.GImage();
            icon.pos(10, 23); icon.size(30, 30); icon.autoSize = false;
            icon.src = `ui/texture/skillBattle/skill-${i + 1}.png`;
            icon.mouseEnabled = false;
            button.addChild(icon);
        });
        for (let i = 0; i < 5; i++) {
            const button = this.button(`pouch${i}`, "", 30 + i * 134, 946, 124, 62,
                () => { this.presenter.selectPouch(i); this.refresh(); });
            const label = button.getChildAt(0) as Laya.GTextField;
            label.pos(34, 0); label.size(88, 62); label.fontSize = 20;
            const icon = new Laya.GImage();
            icon.pos(8, 19); icon.size(26, 26); icon.autoSize = false; icon.mouseEnabled = false;
            button.addChild(icon);
            this.pouchIcons.push(icon);
        }
        this.addLabel("previewTitle", "", 30, 1018, 660, 32, 24, C.jade);
        const preview = this.addLabel("preview", "", 30, 1060, 660, 124, 21);
        preview.wordWrap = true;
        preview.leading = 5;
        this.button("cancel", "取消", 30, 1190, 180, 60, () => {
            this.presenter.cancel(); this.refresh();
        });
        this.button("confirm", "确认行动", 226, 1190, 464, 60, () => this.confirm());
        this.numbers.size(214, 68);
        this.numbers.fontSize = 32;
        this.numbers.bold = true;
        this.numbers.align = "center";
        this.numbers.mouseEnabled = false;
        this.addChild(this.numbers);
        this.createResult();
    }

    openEncounter(): void {
        this.stopEffects();
        this.presenter.open(this.expedition.setup);
        this.lastEvent = "";
        this.drawActors(this.expedition.setup.encounterId);
        this.refresh();
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
            case "battle_ended":
                Laya.Tween.to(event.result === "victory" ? this.enemy : this.player, { alpha: 0 }, 280);
                delay = 340;
                break;
        }
        this.refresh();
        Laya.timer.once(delay, this, this.nextEvent);
    }

    private refresh(): void {
        const p = this.presenter, s = p.display;
        if (!s) { this.refreshResult(); return; }
        const intent = p.setup.enemy.intents[s.enemyIntentIndex];
        const terminal = s.phase === "victory" || s.phase === "defeat";
        this.labels.round.text = `${p.setup.order} / 3 战 · ${s.round} 回合`;
        const config = this.expedition.configuration;
        this.labels.upgrades.text = `强化：${s.upgradeIds.map(id => config.upgrades.find(row => row.id === id)?.name).join(" · ") || "无"}`;
        this.styleButton(this.buttons.loot, false, !p.busy);
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
        this.labels.qi.text = `剑势  ${"◆ ".repeat(s.swordQi)}${"◇ ".repeat(s.swordQiMax - s.swordQi)} ${s.swordQi}/${s.swordQiMax}`;
        this.labels.event.text = this.lastEvent;
        this.bar(30, 204, 660, s.enemy.hp / s.enemy.maxHp, C.red);
        this.bar(30, 750, 660, s.player.hp / s.player.maxHp, C.jade);
        p.setup.skills.forEach(skill => {
            const b = this.buttons[`skill${skill.id}`];
            const cost = SkillBattleFormulaUtils.qiCost(p.setup, s, skill.id);
            (b.getChildAt(0) as Laya.GTextField).text = `${skill.name}\n${cost} 剑势`;
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
            (button.getChildAt(0) as Laya.GTextField).text = item
                ? `${item.useType === "heal" ? "疗伤丹" : item.useType === "fire_stone" ? "火石" : "土石"}\n${active ? (item.useType === "heal" ? "待用药" : "待附带") : item.useType === "heal" ? `恢复${item.healValue}` : "注灵"}`
                : p.setup.items.some(row => row.initialSlot === i + 1) ? "已消耗" : "空";
            const icon = this.pouchIcons[i];
            icon.visible = !!item;
            if (item) icon.src = `ui/texture/skillBattle/${item.useType}.png`;
        });
        this.buttons.skip.visible = p.busy;
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
                : `基础 ${preview.baseDamage} · 注灵 ${preview.enchantDamage} · 吸收 ${preview.blockAbsorbed + preview.enchantBlockAbsorbed} · 失血 ${preview.enemyHpLoss + preview.enchantHpLoss}`}\n`
                + `施加灼烧 ${preview.burnApplied} · 随后灼烧失血 ${preview.burnDamage}\n`
                + `${preview.interrupted ? "打断意图" : `承受伤害 ${preview.playerHpLoss}`} · 护盾 ${preview.blockGained} · 反击 ${preview.counterHpLoss} · 剑势 ${preview.qiAfterAction}\n`
                + `剑势消耗 ${preview.qiCost} · 耐久消耗 ${preview.durabilityCost} · 物品消耗 ${preview.consumedItemUid ? 1 : 0}`
            : "");
        this.refreshResult();
        if (!p.busy) {
            this.enemy.alpha = s.enemy.hp ? 1 : 0;
            this.player.alpha = s.player.hp ? 1 : 0;
        }
    }

    private createResult(): void {
        this.result.size(720, 1280);
        this.result.graphics.drawRect(0, 0, 720, 1280, C.bg);
        this.result.mouseThrough = false;
        this.addChild(this.result);
        this.addLabel("overlayBrand", "末法寻仙", 30, 32, 400, 46, 32, C.text, "left", this.result);
        this.addLabel("currency", "", 430, 40, 260, 36, 24, C.gold, "right", this.result);
        this.resultTitle = this.addLabel("resultTitle", "", 30, 150, 660, 64, 36, C.gold, "left", this.result);
        this.resultDetail = this.addLabel("resultDetail", "", 30, 230, 660, 110, 23, C.text, "left", this.result);
        this.resultDetail.wordWrap = true; this.resultDetail.leading = 8;
        this.addLabel("section", "", 30, 350, 660, 36, 24, C.jade, "left", this.result);
        this.addLabel("overlayMessage", "", 30, 1110, 660, 66, 21, C.red, "left", this.result).wordWrap = true;
        this.addLabel("choiceTitle", "", 30, 554, 660, 36, 24, C.jade, "left", this.result);
        const button = (key: string, text: string, x: number, y: number, w: number, h: number, click: () => void) => {
            this.overlayButtons.push(key);
            return this.button(key, text, x, y, w, h, () => {
                const now = Date.now();
                if (now - this.overlayCommandAt < 250) return;
                this.overlayCommandAt = now;
                click();
            }, this.result);
        };
        for (let i = 0; i < 3; i++) {
            const b = button(`upgrade${i}`, "", 30, 610 + i * 100, 660, 82, () => this.runCommand(() => {
                const id = this.expedition.run.pendingUpgradeChoices[i];
                this.expedition.chooseUpgrade(id);
            }));
            (b.getChildAt(0) as Laya.GTextField).fontSize = 22;
        }
        for (let i = 0; i < 6; i++) {
            this.addLabel(`lootSlot${i}`, "", 30 + (i % 3) * 224, 404 + Math.floor(i / 3) * 64,
                212, 58, 20, C.text, "left", this.result);
            const b = button(`warehouse${i}`, "", 30, 404 + i * 78, 660, 64, () => this.runCommand(() => {
                const item = this.expedition.snapshot.profile.warehouse[this.warehousePage * 6 + i];
                if (item) this.notice = `打开获得 ${this.expedition.openLoot(item.itemUid)} 灵石`;
            }));
            (b.getChildAt(0) as Laya.GTextField).fontSize = 22;
        }
        button("previousPage", "<", 30, 900, 70, 48, () => { this.warehousePage--; this.refresh(); });
        button("nextPage", ">", 620, 900, 70, 48, () => { this.warehousePage++; this.refresh(); });
        this.addLabel("page", "", 130, 900, 460, 48, 22, C.muted, "center", this.result);
        button("continue", "继续深入", 30, 954, 660, 60, () => this.continueNext());
        button("extract", "带上战利品撤离", 30, 1030, 660, 60, () => this.runCommand(() => this.expedition.extract()));
        button("hub", "返回据点", 30, 1010, 660, 64, () => {
            this.showHub = true; this.notice = ""; this.refresh();
        });
        button("newRun", "开始新一局", 30, 1010, 660, 64, () => this.runCommand(() => {
            this.expedition.startNew(); this.showHub = false; this.notice = ""; this.openEncounter();
        }));
        button("lootClose", "返回战斗", 30, 1010, 660, 64, () => { this.showLoot = false; this.refresh(); });
        button("reset", "重置测试档", 30, 1190, 660, 54, () => { this.resetConfirm = true; this.refresh(); });
        button("resetYes", "确认清空并补发测试物资", 30, 1010, 660, 64, () => this.runCommand(() => {
            this.expedition.resetTestProfile();
            this.resetConfirm = false; this.showHub = true; this.notice = ""; this.openEncounter();
        }));
        button("resetNo", "取消", 30, 1190, 660, 54, () => { this.resetConfirm = false; this.refresh(); });
    }

    private runCommand(command: () => unknown): void {
        if (this.presenter.busy) return;
        try { this.notice = ""; command(); }
        catch (error) { this.notice = (error as Error).message; }
        this.refresh();
    }

    private refreshResult(): void {
        const run = this.expedition.run, save = this.expedition.snapshot, config = this.expedition.configuration;
        this.result.visible = !this.presenter.busy && (this.showHub || this.showLoot ||
            !!this.expedition.error || !run || run.phase !== "battle");
        if (!this.result.visible) return;
        this.overlayButtons.forEach(key => this.buttons[key].visible = false);
        for (let i = 0; i < 6; i++) this.labels[`lootSlot${i}`].visible = false;
        this.labels.choiceTitle.text = ""; this.labels.page.text = "";
        this.labels.overlayMessage.text = this.notice;
        this.labels.currency.text = `灵石 ${save?.profile.currency || 0}`;
        this.labels.section.text = "";
        const show = (key: string) => { this.buttons[key].visible = true; };
        if (this.resetConfirm) {
            this.resultTitle.text = "确认重置测试档";
            this.resultDetail.text = "将清空秘境、灵石、入库物品和收藏标记。\n恢复铁剑耐久，并补发火石、土石、疗伤丹各一件。";
            show("resetYes"); show("resetNo"); return;
        }
        if (this.expedition.error) {
            this.resultTitle.text = "存档无法载入";
            this.resultDetail.text = "原存档已保留。";
            this.labels.overlayMessage.text = this.expedition.error;
            show("reset"); return;
        }
        if (this.showHub || !run) {
            const profile = save.profile;
            this.resultTitle.text = "散修据点";
            this.resultDetail.text = `破旧铁剑 · 耐久 ${profile.weaponDurability} / ${config.encounters[0].weaponDurability}\n`
                + `法囊：${profile.pouchSlots.filter(Boolean).map(item => {
                    const use = config.encounters[0].items.find(row => row.itemId === item.itemId).useType;
                    return use === "fire_stone" ? "火石" : use === "earth_stone" ? "土石" : "疗伤丹";
                }).join("、") || "空"}\n出发时生命全满`;
            this.labels.section.text = `入库物品 · ${profile.warehouse.length}`;
            const pages = Math.max(1, Math.ceil(profile.warehouse.length / 6));
            this.warehousePage = Math.max(0, Math.min(pages - 1, this.warehousePage));
            for (let i = 0; i < 6; i++) {
                const item = profile.warehouse[this.warehousePage * 6 + i];
                if (!item) continue;
                const loot = config.loot.find(row => row.itemId === item.itemId);
                const b = this.buttons[`warehouse${i}`];
                (b.getChildAt(0) as Laya.GTextField).text = `${loot.name}   ${loot.useType === "currency"
                    ? `${loot.currencyValue} 灵石   打开` : "已入库"}`;
                this.styleButton(b, false, loot.useType === "currency");
                show(`warehouse${i}`);
            }
            if (pages > 1) {
                this.labels.page.text = `${this.warehousePage + 1} / ${pages}`;
                show("previousPage"); show("nextPage");
                this.styleButton(this.buttons.previousPage, false, this.warehousePage > 0);
                this.styleButton(this.buttons.nextPage, false, this.warehousePage + 1 < pages);
            }
            show("newRun"); show("reset"); return;
        }
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
                (this.buttons[`upgrade${i}`].getChildAt(0) as Laya.GTextField).text = `${upgrade.name}\n${descriptions[upgrade.effect]}`;
                show(`upgrade${i}`);
            });
        } else if (run.phase === "decision") {
            this.labels.choiceTitle.text = `本局强化：${run.upgradeIds.map(id => config.upgrades.find(row => row.id === id).name).join(" · ") || "无"}`;
            show("continue"); show("extract");
        } else if (run.settled) show("hub");
    }

    private addLabel(key: string, text: string, x: number, y: number, w: number, h: number,
        size: number, color = C.text, align = "left", parent: Laya.GWidget = this): Laya.GTextField {
        const t = new Laya.GTextField();
        t.name = key;
        t.pos(x, y); t.size(w, h);
        t.font = "Microsoft YaHei";
        t.fontSize = size; t.color = color; t.align = align; t.valign = "middle";
        t.text = text; t.mouseEnabled = false;
        parent.addChild(t);
        this.labels[key] = t;
        return t;
    }

    private button(key: string, text: string, x: number, y: number, w: number, h: number,
        click: () => void, parent: Laya.GWidget = this): Laya.GWidget {
        const b = new Laya.GWidget();
        b.name = key; b.pos(x, y); b.size(w, h);
        b.mouseThrough = false;
        parent.addChild(b);
        this.addLabel(`${key}Text`, text, 0, 0, w, h, 23, C.text, "center", b);
        b.on(Laya.Event.CLICK, this, click);
        this.buttons[key] = b;
        this.styleButton(b, false, true);
        return b;
    }

    private styleButton(b: Laya.GWidget, selected: boolean, enabled: boolean): void {
        b.graphics.clear();
        b.graphics.drawRect(0, 0, b.width, b.height, selected ? "#35483b" : C.surface,
            selected ? C.jade : C.line, selected ? 2 : 1);
        b.alpha = enabled ? 1 : 0.45;
        b.mouseEnabled = enabled;
    }

    private bars: { [key: string]: Laya.Sprite } = {};
    private bar(x: number, y: number, w: number, ratio: number, color: string): void {
        const bar = this.bars[y] || (this.bars[y] = this.addChildAt(new Laya.Sprite(), 0));
        bar.graphics.clear();
        bar.graphics.drawRect(x, y, w, 8, "#39443c");
        if (ratio > 0) bar.graphics.drawRect(x, y, w * Math.min(1, ratio), 8, color);
    }

    private drawScene(): void {
        const g = this.graphics;
        g.drawRect(0, 0, 720, 1280, C.bg);
        g.drawRect(0, 136, 720, 620, "#202922");
        g.drawPoly(0, 0, [0, 390, 150, 345, 322, 380, 480, 330, 720, 372, 720, 760, 0, 760], "#28332b");
        g.drawPoly(0, 0, [0, 508, 240, 454, 465, 484, 720, 444, 720, 760, 0, 760], "#303930");
        for (let i = 0; i < 7; i++) {
            const y = 385 + i * 54;
            g.drawLine(0, y, 720, y + 28, "#3a4438", 1);
        }
        for (let i = 0; i < 6; i++) g.drawLine(i * 150 - 80, 360, i * 180 - 150, 760, "#3a4438", 1);
        g.drawLine(64, 462, 113, 484, "#17201a", 3);
        g.drawLine(113, 484, 101, 501, "#17201a", 3);
        g.drawLine(545, 651, 590, 629, "#17201a", 3);
        g.drawRect(0, 694, 720, 586, C.bg);
        g.drawLine(30, 844, 690, 844, C.line, 1);
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
        const y = actor === this.player ? 608 : 455;
        Laya.Tween.to(actor, { y: y + dy }, 100, null,
            Laya.Handler.create(this, () => Laya.Tween.to(actor, { y }, 110)));
    }

    private showNumber(text: string, actor: Laya.Sprite, color: string): void {
        Laya.Tween.clearAll(this.numbers);
        this.numbers.text = text; this.numbers.color = color;
        this.numbers.pos(466, actor.y - 55); this.numbers.alpha = 1;
        Laya.Tween.to(this.numbers, { y: actor.y - 85, alpha: 0 }, 360);
    }

    private resetActors(): void {
        this.player.pos(360, 608); this.enemy.pos(360, 455);
        this.player.alpha = this.enemy.alpha = 1;
    }

    private stopEffects(): void {
        Laya.timer.clearAll(this);
        [this.player, this.enemy, this.numbers].forEach(node => Laya.Tween.clearAll(node));
        this.queue = [];
        this.numbers.text = "";
        this.resetActors();
    }
}
