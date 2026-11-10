import type { UIBaseView } from "../../../games/ui/UIBaseView";
import { ConfigUtil } from "../../../config/ConfigUtil";
import { NewBattleCore as Core } from "../newRules/NewBattleCore";
import { NewBattleConfigUtils } from "../newRules/NewBattleConfigUtils";
import { NewBuildConfigUtils } from "../newRules/NewBuildConfigUtils";
import { NewBuildRules } from "../newRules/NewBuildRules";
import { NewBuildSession } from "../newRules/NewBuildSession";
import { NewBattlePanel } from "./NewBattlePanel";
import type { SkillBattlePage } from "./SkillBattleUILayout";

const f = (n: number) => Core.format(n);
export type NewBuildPanelSession = Pick<NewBuildSession, "snapshot" | "flow" | "state" | "record" |
    "records" | "error" | "screen"> & import("./NewBattlePanel").NewBattlePanelSession & {
        start?: NewBuildSession["start"];
        dispatch(...args: Parameters<NewBuildSession["dispatch"]>): unknown;
    };

/** Construction projection for the independently managed build page. */
export class NewBuildPanel extends NewBattlePanel {
    private chosen = 0;
    private replaceId: number | undefined;
    private confirmForgo = false;
    private fixture = false;
    private page = 0;
    private upgradeId = 0;
    constructor(view: UIBaseView, readonly flowSession: NewBuildPanelSession,
        navigate: (screen: SkillBattlePage) => void, screen: "start" | "battle" | "settlement",
        page: SkillBattlePage = screen) {
        super(view, flowSession, NewBattleConfigUtils.defaults(), navigate, screen, page);
    }
    startRun(): void {
        this.run(() => {
            if (!this.flowSession.flow || this.flowSession.flow.phase === "ended") {
                const config = NewBuildConfigUtils.read(ConfigUtil.Tables);
                const seed = new Uint32Array(1);
                window.crypto.getRandomValues(seed);
                this.flowSession.start(config, NewBuildConfigUtils.profile(config, this.fixture), seed[0] || 1);
                this.chosen = 0; this.replaceId = undefined; this.upgradeId = 0;
            } else if (this.flowSession.flow.phase === "battle") this.navigate("battle");
            else if (!this.flowSession.flow.pending) {
                const flow = this.flowSession.flow;
                this.flowSession.dispatch({ type: flow.battles.length === this.flowSession.snapshot!.config.encounters.length ? "finish" : "battle" });
                this.navigate(this.flowSession.screen);
            }
        });
    }
    protected command(key: string): void {
        if (this.modalOpen) return;
        if (this.screen === "battle" || this.overlay) { super.command(key); return; }
        this.run(() => {
            if (this.resetConfirm) {
                if (key === "resetNo") this.resetConfirm = false;
                if (key === "resetYes") {
                    this.flowSession.resetConfirmed(); this.resetConfirm = false;
                    this.chosen = 0; this.confirmForgo = false;
                }
                return;
            }
            const flow = this.flowSession.flow, pending = flow?.pending;
            if (key === "reset") { this.resetConfirm = true; return; }
            if (key === "report") { this.openReport(); return; }
            if (key === "reportClose") {
                this.chosen = 0; this.replaceId = undefined; this.upgradeId = 0;
                this.confirmForgo = false; return;
            }
            if (key === "previousPage") { this.page = Math.max(0, this.page - 1); return; }
            if (key === "nextPage") { this.page++; return; }
            if (key === "actions" && flow?.phase === "ready" && !pending) {
                this.flowSession.dispatch({ type: "meditate" }); this.chosen = 0; return;
            }
            if (key === "warehouse0" && (!flow || flow.phase === "ended")) { this.fixture = !this.fixture; return; }
            const slot = /^warehouse[0-5]$/.test(key) ? Number(key.slice(9)) : -1;
            if (pending) {
                if (slot >= 0 && slot < 3 && pending.candidates[slot] !== undefined) {
                    this.chosen = pending.candidates[slot]; this.replaceId = undefined; this.confirmForgo = false;
                } else if (slot >= 3 && this.chosen && pending.kind === "active") {
                    this.replaceId = flow!.build.actives[slot - 3]?.skillId;
                }
                if (key === "summary" && pending.kind === "active") this.confirmForgo = true;
                if (key === "newRun") {
                    if (this.confirmForgo) this.flowSession.dispatch({ type: "forgo", source: pending.source });
                    else {
                        if (!this.chosen) throw new Error("请选择一项");
                        this.flowSession.dispatch({ type: "choose", source: pending.source, id: this.chosen, replaceId: this.replaceId });
                    }
                    this.chosen = 0; this.replaceId = undefined; this.confirmForgo = false;
                }
                return;
            }
            if (slot >= 0 && flow?.phase === "ready" && flow.build.actives[slot]) {
                this.upgradeId = flow.build.actives[slot].skillId; return;
            }
            if (key === "newRun") {
                if (this.upgradeId) {
                    this.flowSession.dispatch({ type: "upgrade", skillId: this.upgradeId }); this.upgradeId = 0;
                } else this.startRun();
            }
        });
    }
    protected timeText(): string { return this.flowSession.snapshot ? super.timeText() : "双道试炼"; }
    protected renderStart(): void {
        this.backdrop();
        const save = this.flowSession.snapshot, flow = save?.state, pending = flow?.pending;
        this.text("overlayBrand", "末法寻仙", 32, 18, 420, 44, 26, "#e3c98c");
        this.text("currency", this.timeText(), 1000, 22, 248, 40, 20, "#bac3b6");
        this.text("resultTitle", "剑土双道试炼", 170, 76, 940, 52, 30);
        this.text("overlayMessage", this.flowSession.error || this.notice, 170, 600, 940, 30, 16, "#efa797");
        const active = !!flow && flow.phase !== "ended";
        this.button("reset", active ? "放弃本次试炼" : "清除双道试炼档", 170, 634, 260);
        this.button("report", "战斗记录", 490, 634, 260, 54, !!flow?.battles.length);
        if (!flow || flow.phase === "ended") {
            const reason = flow?.endReason;
            const title = !flow ? "尚未入境" : reason === "complete" ? "流程演练完成" :
                reason === "timeout" ? "试炼超时" : reason === "defeat" ? "试炼失败" : "已放弃";
            this.text("resultDetail", `${title}${flow ? ` · 已战 ${flow.battles.length} 场` : ""}`, 170, 146, 940, 44, 22, "#a1d7ba");
            this.text("reportBody", "剑道 · 养锋\n土道 · 承岳\n阶段 2 流程夹具", 190, 230, 880, 160, 24);
            this.button("warehouse0", this.fixture ? "[x] 学书内容隔离夹具" : "[ ] 学书内容隔离夹具", 170, 430, 420, 64);
            this.button("newRun", "入境", 810, 634, 300, 54, !this.flowSession.error);
            return;
        }
        const exhausted = !NewBuildRules.passivePool(save!.config, save!.profile, flow).length;
        this.text("resultDetail", `剑道 · 土道    主动 ${flow.build.actives.length}/3    技能点 ${flow.points}    道韵 ${flow.daoyun}${exhausted ? " · 已悟尽" : ""}${save!.profile.fixture ? " · 学书隔离夹具" : ""}`,
            170, 138, 940, 44, 21, "#a1d7ba");
        if (flow.phase === "battle") {
            this.text("reportBody", "战斗进行中", 190, 250, 880, 160, 24);
            this.button("newRun", "返回战斗", 810, 634, 300);
            return;
        }
        if (pending) {
            this.text("section", pending.kind === "start" ? "起始借法 · 三选一" :
                pending.kind === "passive" ? "悟道 · 领取一项" : "途中借法", 170, 194, 940, 36, 22, "#e3c98c");
            pending.candidates.forEach((id, i) => {
                const content = pending.kind === "passive" ? save!.config.setup.passives : save!.config.setup.skills;
                const row = content.find(r => r.id === id)!;
                const school = (row.school || "sword") === "earth" ? "土道" : row.school === "common" ? "通用" : "剑道";
                this.button(`warehouse${i}`, `${row.name}\n${school}`, 170 + i * 320, 246, 300, 82, true, id === this.chosen);
            });
            if (pending.kind === "active" && this.chosen) {
                flow.build.actives.forEach((row, i) => {
                    const old = save!.config.setup.skills.find(r => r.id === row.skillId)!;
                    this.button(`warehouse${i + 3}`, `替换 ${old.name}\n${row.level ? `+${row.level}` : "基础"}`,
                        170 + i * 320, 342, 300, 64, true, row.skillId === this.replaceId);
                });
            }
            let detail = this.confirmForgo ? (NewBuildRules.full(flow) ? "三个主动均已满强，放弃不获得技能点。" : "放弃本次主动奖励，获得 2 个技能点。") : "";
            if (!detail && this.chosen) {
                if (pending.kind === "passive") detail = this.passiveDescription(this.chosen);
                else {
                    const level = flow.build.actives.find(r => r.skillId === this.replaceId)?.level || 0;
                    detail = this.skillDescription(this.chosen, level);
                    if (this.replaceId !== undefined) detail = `原：${this.skillDescription(this.replaceId, level)}\n新：${detail}`;
                    else if (flow.build.actives.length >= 3) detail += "\n主动已满，需选择替换对象。";
                }
            }
            this.text("reportBody", detail, 170, 424, 940, 124, 18);
            this.button("newRun", this.confirmForgo ? "确认放弃" : "确认领取", 810, 634, 300, 54,
                this.confirmForgo || !!this.chosen && (pending.kind !== "active" || flow.build.actives.length < 3 || this.replaceId !== undefined));
            this.button("reportClose", "返回候选", 810, 550, 300, 42, !!this.chosen || this.confirmForgo);
            if (pending.kind === "active") this.button("summary", NewBuildRules.full(flow) ? "放弃本次奖励" : "放弃换 2 点", 170, 550, 300, 42);
            return;
        }
        const current = this.flowSession.state;
        this.text("section", `战外构筑 · ${flow.battles.length}/${save!.config.encounters.length} 场${current ?
            ` · 生命 ${f(current.player.hp)} · 灵力 ${f(current.player.mp)} · 耐久 ${current.weapon?.durability ?? "无武器"}` : ""}`,
            170, 194, 940, 36, 20, "#e3c98c");
        flow.build.actives.forEach((row, i) => {
            const skill = save!.config.setup.skills.find(r => r.id === row.skillId)!;
            this.button(`warehouse${i}`, `${skill.name} ${row.level ? `+${row.level}` : "基础"}\n${row.level < 5 ? "强化 +1" : "已满强"}`,
                170 + i * 320, 246, 300, 82, flow.points > 0 && row.level < 5);
        });
        const descriptions = flow.build.actives.map(r => this.skillDescription(r.skillId, r.level));
        descriptions.push(...flow.build.passiveIds.map(id => this.passiveDescription(id)));
        const pages = Math.max(1, Math.ceil(descriptions.length / 4)); this.page = Math.min(this.page, pages - 1);
        const upgrade = flow.build.actives.find(r => r.skillId === this.upgradeId);
        this.text("reportBody", upgrade ?
            `当前：${this.skillDescription(upgrade.skillId, upgrade.level)}\n下一档：${this.skillDescription(upgrade.skillId, upgrade.level + 1)}` :
            descriptions.slice(this.page * 4, this.page * 4 + 4).join("\n"), 170, 354, 940, 176, 18);
        this.button("previousPage", "<", 650, 558, 90, 38, this.page > 0);
        this.button("nextPage", ">", 760, 558, 90, 38, this.page + 1 < pages);
        if (flow.battles.length >= 2 && !flow.sources.includes("meditation"))
            this.button("actions", exhausted ? "悟道 · 已悟尽" : "悟道", 170, 558, 260, 38, !exhausted);
        if (upgrade) this.button("reportClose", "取消强化", 910, 558, 200, 38);
        this.button("newRun", upgrade ? "确认强化 · 1 点" :
            flow.battles.length === save!.config.encounters.length ? "结束演练" : "进入下一战", 810, 634, 300);
    }
    protected renderReset(): void {
        super.renderReset();
    }
    private skillDescription(id: number, level: number): string {
        const save = this.flowSession.snapshot!, setup = Core.clone(save.config.setup);
        const skill = setup.skills.find(r => r.id === id)!;
        setup.build = { schools: ["sword", "earth"], actives: [{ skillId: id, level }], passiveIds: [] };
        if (this.flowSession.record) setup.weapon = Core.clone(this.flowSession.state!.weapon);
        const state = Core.start(setup, "description");
        state.enemy.hp = state.enemy.maxHp = setup.enemy.maxHp = 100000000;
        state.enemy.block = 100000;
        const result = Core.resolve(setup, state, { type: "skill", skillId: id });
        if (result.ok === false) return `${skill.name}：${result.reason}`;
        const p = result.preview, parts = [`${skill.name} ${level ? `+${level}` : "基础"} · 灵力 ${f(skill.mpCost)}`];
        if (p.body) parts.push(`本体 ${f(p.body)}`);
        if (p.shred) parts.push(`削盾 ${f(p.shred)}`);
        if (p.shield) parts.push(`盾 ${f(p.shield)}`);
        if (p.mark) parts.push(`剑痕 ${f(p.mark)}×2`);
        if (p.momentumGain) parts.push(`增势 ${p.momentumGain} · 锋意 ${p.keenEnhancement}%`);
        if (skill.kind === "hanyue") parts.push(`持磐劲本体另乘 ${(skill.conditionalPercent || 125) * [100,100,115,115,130,145][level] / 100}%`);
        if (skill.reductionPercent) parts.push(`本次减伤上限 ${f(Core.scale(Core.attributes(setup,state).defense,skill.reductionPercent,[100,100,115,115,130,145][level]))}`);
        if (skill.counterPercent) parts.push(`存活吸盾后反击 ${f(Core.scale(Core.attributes(setup,state).attack,skill.counterPercent,[100,110,110,120,120,130][level]))}`);
        return parts.join(" · ");
    }
    private passiveDescription(id: number): string {
        const row = this.flowSession.snapshot!.config.setup.passives.find(r => r.id === id)!;
        const text: Record<string, string> = {
            chuzhao:"首次普攻额外增势 1", xifeng:"兑现锋意后，下次普攻额外增势 1", difeng:"相邻异名攻击主动附伤 20% 基础攻击",
            bengjia:"攻击主动实际破盾得盾 50% 防御", lianmang:"兑现锋意得盾 50% 防御", guanxi:"剑道攻击应对蓄力附伤 20% 基础攻击",
            houlei:"岩甲/返震本体额外盾 25% 防御", lifeng:"磐劲普攻附伤 20% 基础攻击", yingxian:"攻击主动应对蓄力得盾 25% 防御",
            zhongyue:"磐劲土道攻击附伤 20% 基础攻击", jieshan:"磐劲另一道攻击附伤 20% 基础攻击",
            gumai:"首次有效战斗用药后，紧接岩甲/返震额外盾 50% 防御；其他主行动消耗标记",
            xianji:"每场首次攻击主行动附伤 20% 基础攻击", gushou:"每场首次通用防御额外盾 50% 防御",
            huming:"每场首次主行动开始血量不高于 30% 时得盾 100% 防御", yaoyin:"每场首次有效战斗用药得盾 50% 防御",
        };
        return `${row.name} · ${text[row.kind]}`;
    }
}
