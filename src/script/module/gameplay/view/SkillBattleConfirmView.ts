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
    get path(): string { return "ui/prefab/module/gameplay/SkillBattleConfirmView.lh"; }
    private request: SkillBattleConfirmation;
    private submitting = false;
    private title: Laya.GTextField;
    private detail: Laya.GTextField;
    private error: Laya.GTextField;
    private confirmText: Laya.GTextField;

    protected onConstruct(): void {
        this.title = this.getElement("dialogTitle");
        this.detail = this.getElement("dialogDetail");
        this.error = this.getElement("dialogError");
        this.confirmText = this.getElement("dialogConfirmText");
        this.addClickListener(this.getElement("dialogCancel"), this.close);
        this.addClickListener(this.getElement("dialogConfirm"), this.confirm);
    }

    onOpen(request: SkillBattleConfirmation): void {
        this.request = request; this.submitting = false;
        this.title.text = request.title;
        this.detail.text = request.detail;
        this.error.text = "";
        this.confirmText.text = request.confirmText || "确认";
    }

    private confirm(): void {
        if (this.submitting || !this.request) return;
        this.submitting = true;
        try {
            this.request.confirm();
            this.close();
        } catch (error) {
            this.error.text = (error as Error).message;
        } finally { this.submitting = false; }
    }

    protected onClose(): void {
        const request = this.request;
        this.request = null;
        request?.closed();
    }
}
