import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import { UIViewportLayout } from "../../../games/ui/UIViewportLayout";
import { UIManager } from "../../../games/ui/UIManager";
import { GameplayManager } from "../../gameplay/manager/GameplayManager";
import { openLobbyScreen, openSkillBattleScreen } from "../../gameplay/utils/GameplayNavigation";
import { SkillBattleConfirmView } from "../../gameplay/view/SkillBattleConfirmView";
import { TestSkinPanelView } from "../../testPanel/view/TestSkinPanelView";

export class LobbySaveView extends UIBaseView {
    get layer(): UILayer { return UILayer.Second; }
    get path(): string { return "ui/prefab/module/lobby/LobbySaveView.lh"; }
    private title: Laya.GTextField;
    private detail: Laya.GTextField;
    private status: Laya.GTextField;
    private errorText: Laya.GTextField;
    private confirmText: Laya.GTextField;
    private confirmButton: Laya.GWidget;
    private resetButton: Laya.GWidget;
    private resetConfirmation: SkillBattleConfirmView;
    private submitting = false;

    protected onConstruct(): void {
        this.title = this.getElement("txt_save_title");
        this.detail = this.getElement("txt_save_detail");
        this.status = this.getElement("txt_save_status");
        this.errorText = this.getElement("txt_save_error");
        this.confirmText = this.getElement("txt_save_confirm");
        this.confirmButton = this.getElement("btn_save_confirm");
        this.resetButton = this.getElement("btn_save_reset");
        UIViewportLayout.coverBackground(this.getElement("img_save_background"), this.view);
        this.addClickListener(this.confirmButton, this.onClickConfirm);
        this.addClickListener(this.resetButton, this.onClickReset);
        this.addClickListener(this.getElement("btn_skin_test"), () => {
            UIManager.ins().openForm(TestSkinPanelView);
        });
    }

    onOpen(): void {
        this.submitting = false;
        this.errorText.text = "";
        this.refreshSave();
    }

    private refreshSave(): void {
        const trial = GameplayManager.getActive(), state = trial.inventory;
        this.resetButton.visible = !!state || !!trial.error;
        this.confirmButton.x = this.resetButton.visible ? 268 : 150;
        if (trial.error) {
            this.title.text = "存档需要处理";
            this.detail.text = "本地存档暂时无法读取。\n原存档已保留，请先查看并处理。";
            this.status.text = "";
            this.errorText.text = trial.error;
            this.confirmText.text = "查看存档";
        } else if (state) {
            this.title.text = "发现存档";
            this.detail.text = "已读取本地存档。\n确认后继续上次的进度。";
            this.status.text = state.phase === "preparation" ? "仓库与随身物品已恢复" :
                state.phase === "ended" ? "上次探索已结束，待查看结算" : "上次探索尚未结束";
            this.confirmText.text = state.phase === "preparation" ? "进入大厅" :
                state.phase === "ended" ? "查看结算" : "继续探索";
        } else {
            this.title.text = "创建存档";
            this.detail.text = "尚未发现本地存档。\n创建后即可进入大厅。";
            this.status.text = "进度保存在当前设备\n初始仓库开放 1 页，共 56 格";
            this.confirmText.text = "创建存档并进入";
        }
    }

    private onClickConfirm(): void {
        if (this.submitting || this.resetConfirmation) return;
        this.submitting = true;
        try {
            const trial = GameplayManager.getActive();
            if (trial.error) {
                openSkillBattleScreen(trial.screen);
                return;
            }
            // 只有玩家确认后才建立真实整备档，读档不会重复发放初始物品。
            GameplayManager.createInitialSave();
            openLobbyScreen();
        } catch (error) {
            this.errorText.text = `未能进入游戏：${(error as Error).message}`;
        } finally { this.submitting = false; }
    }

    private onClickReset(): void {
        if (this.submitting || this.resetConfirmation || !this.resetButton.visible) return;
        this.resetConfirmation = UIManager.ins().openForm(SkillBattleConfirmView, {
            title: "重置存档",
            detail: "将清除当前进度、物品、愿力及购买记录，\n重新建立初始存档。此操作无法撤销。",
            confirmText: "重置并重新开始",
            confirm: () => {
                GameplayManager.resetSaveConfirmed();
                openLobbyScreen();
            },
            closed: () => { this.resetConfirmation = null; },
        });
    }

    protected onClose(): void {
        this.resetConfirmation?.close();
        this.resetConfirmation = null;
        this.submitting = false;
    }
}
