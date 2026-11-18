import type { UIBaseView } from "../../../games/ui/UIBaseView";
import type { ExpeditionRunManager } from "../../expedition/manager/ExpeditionRunManager";
import { BattlePanel } from "../../skillBattle/view/BattlePanel";
import type { SkillBattlePage } from "../../gameplay/utils/GameplayLayout";
import { QingmingBuildRules } from "../utils/QingmingBuildRules";
import { QingmingRules } from "../../skillBattle/utils/QingmingRules";
import { QingmingConfig as C } from "../../skillBattle/utils/QingmingConfig";

export type BuildPanelSession = ExpeditionRunManager;

export class BuildPanel extends BattlePanel {
    private chosen = 0;
    private page = 0;
    constructor(view: UIBaseView, readonly flowSession: BuildPanelSession,
        navigate: (screen: SkillBattlePage) => void, screen: "start" | "battle" | "settlement",
        page: SkillBattlePage = screen) {
        super(view, flowSession, navigate, screen, page);
    }
    startRun(): void { this.navigate(this.flowSession.flow?.phase === "battle" ? "battle" : "map"); }
    protected command(key: string): void {
        if (this.modalOpen) return;
        if (this.screen === "battle" || this.overlay) { super.command(key); return; }
        this.run(() => {
            if (key === "reset") { this.resetConfirm = true; return; }
            if (key === "report") { this.openReport(); return; }
            if (key === "previousPage") { this.page = Math.max(0, this.page - 1); return; }
            if (key === "nextPage") { this.page++; return; }
            const pending = this.flowSession.flow?.pending;
            if (!pending) { if (key === "newRun") this.startRun(); return; }
            const slot = /^warehouse[0-2]$/.test(key) ? Number(key.slice(9)) : -1;
            if (slot >= 0) this.chosen = pending.candidates[slot] || 0;
            if (key === "newRun" && this.chosen) {
                this.flowSession.dispatch({type: "choose", source: pending.source, id: this.chosen});
                this.chosen = 0;
            }
        });
    }
    protected renderStart(): void {
        const flow = this.flowSession.flow;
        if (!flow?.qingming) { this.navigate("map"); return; }
        this.backdrop();
        const q = flow.qingming, pending = flow.pending, active = QingmingRules.build(q);
        this.text("overlayBrand", "末法寻仙", 32, 18, 420, 44, 26, "#e3c98c");
        this.text("currency", this.timeText(), 1000, 22, 248, 40, 20, "#bac3b6");
        this.text("resultTitle", "青冥剑典", 170, 76, 940, 52, 30);
        this.text("resultDetail", `已战 ${flow.battles.length} 场 · 获得 ${q.acquired.length} 项 · 生效 ${active.length} 项`,
            170, 138, 940, 44, 21, "#a1d7ba");
        this.text("overlayMessage", this.flowSession.error || this.notice, 170, 590, 940, 36, 17, "#efa797");
        this.button("reset", "放弃本局", 170, 634, 260);
        this.button("report", "战斗记录", 490, 634, 260, 54, !!flow.battles.length);
        if (pending) {
            this.text("section", "功法机缘 · 取其一", 170, 194, 940, 36, 22, "#e3c98c");
            if (!pending.candidates.includes(this.chosen)) this.chosen = 0;
            pending.candidates.forEach((id, i) => {
                const key = QingmingBuildRules.item(id), item = C.items[key], role = C.offerRoles[q.offerRoles[key]];
                this.button(`warehouse${i}`, `${item.name}\n${{passive: "被动", mutation: "改招", core: "核心"}[item.type]} · ${role}`,
                    170 + i * 320, 246, 300, 82, true, id === this.chosen);
            });
            const key = QingmingBuildRules.item(this.chosen), item = key && C.items[key];
            const old = item && (item.type === "core" ? q.core : item.slot ? q.mutations[item.slot] : null);
            const related = item ? QingmingRules.related(q, key) : [];
            this.text("reportBody", item ? `${item.name}\n${item.description}${old ? `\n替换：${C.items[old].name}` : ""}${
                related.length ? `\n联动：${related.map(k => C.items[k].name).join("、")}` : ""}` : "",
                170, 360, 940, 190, 20);
            this.button("newRun", "确认领取", 810, 634, 300, 54, !!item);
            return;
        }
        this.text("section", q.core ? `核心 · ${C.items[q.core].name}` : "基础四招", 170, 194, 940, 36, 22, "#e3c98c");
        const descriptions = [
            ...Object.values(C.skills).filter(s => s.cost > 0).map(s => `${s.name} · ${s.description} / ${s.cost}灵力`),
            ...active.map(k => `${C.items[k].name} · ${C.items[k].description}`),
        ];
        const pages = Math.max(1, Math.ceil(descriptions.length / 3)); this.page = Math.min(this.page, pages - 1);
        this.text("reportBody", descriptions.slice(this.page * 3, this.page * 3 + 3).join("\n\n"), 170, 246, 940, 286, 18);
        this.text("choiceTitle", `${this.page + 1} / ${pages}`, 540, 550, 120, 36, 18);
        this.button("previousPage", "<", 670, 550, 90, 38, this.page > 0);
        this.button("nextPage", ">", 780, 550, 90, 38, this.page + 1 < pages);
        this.button("newRun", flow.phase === "battle" ? "返回战斗" : "返回地图", 810, 634, 300);
    }
}
