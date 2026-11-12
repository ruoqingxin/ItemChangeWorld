import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";

export interface SkillBattleConfirmation {
    title: string;
    detail: string;
    confirmText?: string;
    confirm(): void;
    closed(): void;
}

export class SkillBattleConfirmView extends UIBaseView {
    get layer(): UILayer { return UILayer.MessageBox; }
    get path(): string { return "ui/prefab/module/skillBattle/SkillBattleConfirmView.lh"; }
    private request: SkillBattleConfirmation;
    private submitting = false;

    protected onConstruct(): void {
        this.addClickListener(this.getElement("dialogCancel"), this.close);
        this.addClickListener(this.getElement("dialogConfirm"), this.confirm);
    }

    onOpen(request: SkillBattleConfirmation): void {
        this.request = request; this.submitting = false;
        this.getElement<Laya.GTextField>("dialogTitle").text = request.title;
        this.getElement<Laya.GTextField>("dialogDetail").text = request.detail;
        this.getElement<Laya.GTextField>("dialogError").text = "";
        this.getElement<Laya.GTextField>("dialogConfirmText").text = request.confirmText || "确认";
    }

    private confirm(): void {
        if (this.submitting || !this.request) return;
        this.submitting = true;
        try {
            this.request.confirm();
            this.close();
        } catch (error) {
            this.getElement<Laya.GTextField>("dialogError").text = (error as Error).message;
        } finally { this.submitting = false; }
    }

    protected onClose(): void {
        const request = this.request;
        this.request = null;
        request?.closed();
    }
}
