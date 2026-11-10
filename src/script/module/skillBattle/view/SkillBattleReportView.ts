import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";

export interface SkillBattleReport {
    title: string;
    records: Array<{ title: string; lines: string[] }>;
    closed(): void;
}

export class SkillBattleReportView extends UIBaseView {
    get layer(): UILayer { return UILayer.Second; }
    get path(): string { return "ui/prefab/module/skillBattle/SkillBattleReportView.lh"; }
    private request: SkillBattleReport;
    private index = 0;
    private page = 0;

    protected onConstruct(): void {
        this.addClickListener(this.getElement("reportClose"), this.close);
        for (const key of ["previousPage", "nextPage", "olderReport", "newerReport"]) {
            this.addClickListener(this.getElement(key), () => {
                if (key === "previousPage") this.page--;
                if (key === "nextPage") this.page++;
                if (key === "olderReport") { this.index--; this.page = 0; }
                if (key === "newerReport") { this.index++; this.page = 0; }
                this.render();
            });
        }
    }

    onOpen(request: SkillBattleReport): void {
        this.request = request; this.index = Math.max(0, request.records.length - 1); this.page = 0;
        this.render();
    }

    private render(): void {
        const record = this.request.records[this.index], lines = record?.lines || [];
        const pages = Math.max(1, Math.ceil(lines.length / 10));
        this.page = Math.max(0, Math.min(this.page, pages - 1));
        this.getElement<Laya.GTextField>("reportTitle").text = this.request.title;
        this.getElement<Laya.GTextField>("reportSection").text = record?.title || "";
        this.getElement<Laya.GTextField>("reportBody").text =
            lines.slice(this.page * 10, this.page * 10 + 10).join("\n") || "暂无记录";
        this.getElement<Laya.GTextField>("page").text = `${this.page + 1}/${pages}`;
        for (const [key, enabled] of [
            ["previousPage", this.page > 0], ["nextPage", this.page + 1 < pages],
            ["olderReport", this.index > 0], ["newerReport", this.index + 1 < this.request.records.length],
        ] as const) {
            const node = this.getElement<Laya.GWidget>(key);
            node.mouseEnabled = enabled; node.alpha = enabled ? 1 : 0.4;
        }
    }

    protected onClose(): void {
        const request = this.request; this.request = null; request?.closed();
    }
}
