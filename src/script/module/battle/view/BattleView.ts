import { UIBaseView } from "src/script/games/ui/UIBaseView";
import { UILayer } from "src/script/games/ui/UILayer";
import { BattleManager } from "../manager/BattleManager";
import {
    EBattleResult,
    IBattleCard,
    IBattleEnemy,
    IBattleState,
    IBattleStatus,
    IBattleUnit,
} from "../types/BattleTypes";

/**
 * 简单战斗操作界面。
 * 通过 BattleManager 驱动战斗逻辑，用于调试与基础交互。
 */
export class BattleView extends UIBaseView {
    private static readonly HAND_BTN_COUNT = 5;
    private static readonly ENEMY_BTN_COUNT = 3;
    private static readonly LOG_LINE_COUNT = 18;

    public get layer(): UILayer {
        return UILayer.Second;
    }

    public get path(): string {
        return "ui/prefab/module/battle/BattleView.lh";
    }

    private txt_status: Laya.GTextField;
    private txt_hand: Laya.GTextField;
    private txt_log: Laya.GTextField;

    private _scenarioId = 1;
    private _targetEnemyIndex = 0;
    private _handButtons: Laya.GWidget[] = [];
    private _enemyButtons: Laya.GWidget[] = [];

    protected onConstruct(): void {
        this.txt_status = this.getElement<Laya.GTextField>("txt_status");
        this.txt_hand = this.getElement<Laya.GTextField>("txt_hand");
        this.txt_log = this.getElement<Laya.GTextField>("txt_log");

        this.addClickListener(this.getElement("btn_close"), this.onClickClose);
        this.addClickListener(this.getElement("btn_start"), this.onClickStart);
        this.addClickListener(this.getElement("btn_end_turn"), this.onClickEndTurn);

        for (let i = 0; i < BattleView.HAND_BTN_COUNT; i++) {
            const btn = this.getElement<Laya.GWidget>(`btn_hand_${i}`, false);
            if (!btn) {
                continue;
            }
            this._handButtons.push(btn);
            this.addClickListener(btn, () => this.onPlayCard(i));
        }

        for (let i = 0; i < BattleView.ENEMY_BTN_COUNT; i++) {
            const btn = this.getElement<Laya.GWidget>(`btn_enemy_${i}`, false);
            if (!btn) {
                continue;
            }
            this._enemyButtons.push(btn);
            this.addClickListener(btn, () => this.onSelectEnemy(i));
        }
    }

    /**
     * @param scenarioId 战斗场景 id，默认 1
     * @param autoStart 打开后是否自动开始战斗，默认 true
     */
    onOpen(scenarioId: number = 1, autoStart: boolean = true): void {
        this._scenarioId = scenarioId;
        this._targetEnemyIndex = 0;

        if (autoStart && !BattleManager.ins().state) {
            this.startBattle();
            return;
        }

        this.refreshView();
    }

    protected onClose(): void {
    }

    public updateView(): void {
        this.refreshView();
    }

    private onClickClose(): void {
        this.close();
    }

    private onClickStart(): void {
        this.startBattle();
    }

    private onClickEndTurn(): void {
        const state = BattleManager.ins().state;
        if (!state || !this.canOperate(state)) {
            return;
        }

        BattleManager.ins().endTurn();
        this.refreshView();
    }

    private onSelectEnemy(index: number): void {
        const state = BattleManager.ins().state;
        if (!state) {
            return;
        }

        const enemy = state.enemies[index];
        if (!enemy || !this.isAlive(enemy)) {
            return;
        }

        this._targetEnemyIndex = index;
        this.refreshView();
    }

    private onPlayCard(handIndex: number): void {
        const state = BattleManager.ins().state;
        if (!state || !this.canOperate(state)) {
            return;
        }

        const card = state.hand[handIndex];
        if (!card) {
            return;
        }

        BattleManager.ins().playCard(handIndex, this._targetEnemyIndex);
        this.refreshView();
    }

    private startBattle(): void {
        BattleManager.ins().reset();
        BattleManager.ins().startScenario(this._scenarioId);
        this._targetEnemyIndex = this.getDefaultTargetIndex(BattleManager.ins().state);
        this.refreshView();
    }

    private refreshView(): void {
        const state = BattleManager.ins().state;
        if (!state) {
            this.txt_status.text = "未开始战斗，点击「开始战斗」";
            this.txt_hand.text = "";
            this.txt_log.text = "";
            this.updateHandButtons([], false);
            this.updateEnemyButtons([], -1);
            return;
        }

        if (this._targetEnemyIndex >= state.enemies.length || !this.isAlive(state.enemies[this._targetEnemyIndex])) {
            this._targetEnemyIndex = this.getDefaultTargetIndex(state);
        }

        this.txt_status.text = this.buildStatusText(state);
        this.txt_hand.text = this.buildHandText(state);
        this.txt_log.text = this.buildLogText(state);

        const canPlay = this.canOperate(state);
        this.updateHandButtons(state.hand, canPlay);
        this.updateEnemyButtons(state.enemies, this._targetEnemyIndex);
    }

    private canOperate(state: IBattleState): boolean {
        return state.result === EBattleResult.Running && state.isPlayerTurn;
    }

    private getDefaultTargetIndex(state: IBattleState | null): number {
        if (!state) {
            return 0;
        }

        const aliveIndex = state.enemies.findIndex((enemy) => this.isAlive(enemy));
        return aliveIndex >= 0 ? aliveIndex : 0;
    }

    private buildStatusText(state: IBattleState): string {
        const player = state.player;
        const enemyLines = state.enemies.map((enemy, index) => {
            const intent = this.getEnemyIntent(enemy);
            const aliveText = this.isAlive(enemy) ? "" : " (死亡)";
            return `[${index}] ${enemy.name}${aliveText}\nHP ${enemy.hp}/${enemy.maxHp}  护盾 ${enemy.block}\n状态 ${this.formatStatuses(enemy)}  意图 ${intent}`;
        });

        return [
            `结果：${this.getResultText(state.result)}`,
            `回合 ${state.turnNo}  ${state.isPlayerTurn ? "玩家回合" : "敌人回合"}`,
            `玩家 HP ${player.hp}/${player.maxHp}  MP ${player.mp}/${player.maxMp}  AP ${player.ap}  护盾 ${player.block}`,
            `状态 ${this.formatStatuses(player)}`,
            `牌堆 抽 ${state.drawPile.length} / 手 ${state.hand.length} / 弃 ${state.discardPile.length}`,
            "",
            "敌人：",
            enemyLines.join("\n\n") || "无",
        ].join("\n");
    }

    private buildHandText(state: IBattleState): string {
        if (state.hand.length === 0) {
            return "手牌：无";
        }

        return state.hand
            .map((card, index) => `[${index}] ${card.name} (AP ${card.costAp})`)
            .join("   ");
    }

    private buildLogText(state: IBattleState): string {
        const logs = state.logs.slice(-BattleView.LOG_LINE_COUNT);
        return logs.length > 0 ? logs.join("\n") : "暂无战斗日志";
    }

    private updateHandButtons(hand: IBattleCard[], canPlay: boolean): void {
        for (let i = 0; i < this._handButtons.length; i++) {
            const btn = this._handButtons[i];
            const card = hand[i];
            const txt = btn.getChildByName("txt") as Laya.GTextField;

            if (!card) {
                btn.visible = false;
                btn.mouseEnabled = false;
                continue;
            }

            btn.visible = true;
            btn.mouseEnabled = canPlay;
            if (txt) {
                txt.text = `${card.name}\nAP${card.costAp}`;
                txt.color = canPlay ? "#ffffff" : "#888888";
            }
        }
    }

    private updateEnemyButtons(enemies: IBattleEnemy[], selectedIndex: number): void {
        for (let i = 0; i < this._enemyButtons.length; i++) {
            const btn = this._enemyButtons[i];
            const enemy = enemies[i];
            const txt = btn.getChildByName("txt") as Laya.GTextField;

            if (!enemy) {
                btn.visible = false;
                btn.mouseEnabled = false;
                continue;
            }

            const alive = this.isAlive(enemy);
            btn.visible = true;
            btn.mouseEnabled = alive;

            if (txt) {
                const selected = i === selectedIndex && alive;
                txt.text = `${selected ? "★ " : ""}${enemy.name}\n${enemy.hp}/${enemy.maxHp}`;
                txt.color = alive ? (selected ? "#ffd166" : "#ff9a9a") : "#666666";
            }
        }
    }

    private getEnemyIntent(enemy: IBattleEnemy): string {
        const intent = enemy.intents[enemy.intentCursor];
        return intent ? intent.name : "无";
    }

    private formatStatuses(unit: IBattleUnit): string {
        if (!unit.statuses || unit.statuses.size === 0) {
            return "无";
        }

        const parts: string[] = [];
        unit.statuses.forEach((status: IBattleStatus) => {
            parts.push(`${status.name}x${status.stack}`);
        });
        return parts.join(",");
    }

    private getResultText(result: EBattleResult): string {
        switch (result) {
            case EBattleResult.Win:
                return "胜利";
            case EBattleResult.Lose:
                return "失败";
            default:
                return "进行中";
        }
    }

    private isAlive(unit: { hp: number }): boolean {
        return unit.hp > 0;
    }
}
