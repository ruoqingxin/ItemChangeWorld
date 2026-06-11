import {
    EBlockClearTiming,
    ECardType,
    EEffectTarget,
    EEffectType,
    EIntentType,
    EStatusRemoveTiming,
    EStatusTickTiming,
} from "src/script/config/schema";
import BattleData from "../data/BattleData";
import {
    EBattleResult,
    EBattleSide,
    EBattleStatusId,
    IBattleCard,
    IBattleEnemy,
    IBattleIntent,
    IBattlePlayer,
    IBattleState,
    IBattleStatus,
    IBattleUnit,
    IEffectSpec,
} from "../types/BattleTypes";
import { BattleConfigUtils } from "../utils/BattleConfigUtils";

export class BattleEngine {
    private _cardUid: number = 1;

    startScenario(scenarioId: number): IBattleState {
        const scenarioCfg = BattleData.ins().getCombatScenario(scenarioId);

        if (!scenarioCfg || !BattleConfigUtils.isEnabled(scenarioCfg)) {
            throw new Error(`[BattleEngine] 战斗场景未启用：${scenarioId}`);
        }

        const ruleCfg = BattleData.ins().getBattleRule(
            BattleConfigUtils.toNumber(scenarioCfg.rule_id, 1),
        );

        if (!ruleCfg) {
            throw new Error(`[BattleEngine] 战斗规则不存在：${scenarioCfg.rule_id}`);
        }

        const weaponCfg = BattleData.ins().getWeapon(
            BattleConfigUtils.toNumber(scenarioCfg.weapon_id),
        );

        if (!weaponCfg) {
            throw new Error(`[BattleEngine] 武器配置不存在：${scenarioCfg.weapon_id}`);
        }

        const player = this.createPlayer(scenarioCfg, weaponCfg);
        const deck = this.createDeckByWeapon(weaponCfg);
        const enemies = this.createEnemies(scenarioId);

        const state: IBattleState = {
            scenarioId,
            scenarioCfg,
            ruleCfg,

            player,
            enemies,

            drawPile: this.shuffle(deck),
            hand: [],
            discardPile: [],
            exhaustPile: [],

            turnNo: 0,
            isPlayerTurn: false,
            result: EBattleResult.Running,

            logs: [],
        };

        this.log(state, `进入战斗场景：${scenarioId}`);
        this.startPlayerTurn(state, true);
        return state;
    }

    playCard(state: IBattleState, handIndex: number, targetEnemyIndex: number = 0): void {
        if (!this.canOperate(state)) {
            return;
        }

        const card = state.hand[handIndex];

        if (!card) {
            this.log(state, `手牌索引无效：${handIndex}`);
            return;
        }

        if (state.player.ap < card.costAp) {
            this.log(state, `行动点不足，无法打出：${card.name}`);
            return;
        }

        const selectedEnemy = this.getAliveEnemies(state)[targetEnemyIndex] || null;

        if (this.cardNeedEnemyTarget(card) && !selectedEnemy) {
            this.log(state, `没有可选择的敌人，无法打出：${card.name}`);
            return;
        }

        state.hand.splice(handIndex, 1);
        state.player.ap -= card.costAp;

        this.log(state, `玩家打出【${card.name}】，消耗 AP ${card.costAp}`);

        const isAttackAction = Number(card.cardType) === ECardType.attack;
        this.executeEffects(state, state.player, card.effects, selectedEnemy, isAttackAction);

        if (isAttackAction) {
            this.handleRemoveTiming(state, state.player, EStatusRemoveTiming.after_attack);
        }

        state.discardPile.push(card);

        this.checkBattleEnd(state);

        if (state.result === EBattleResult.Running) {
            this.printState(state);
        }
    }

    endPlayerTurn(state: IBattleState): void {
        if (!this.canOperate(state)) {
            return;
        }

        this.log(state, "玩家结束回合");

        while (state.hand.length > 0) {
            const card = state.hand.shift()!;
            state.discardPile.push(card);
        }

        if (this.getBlockClearTiming(state) === EBlockClearTiming.turn_end) {
            this.clearBlock(state, state.player);
        }

        state.isPlayerTurn = false;

        this.runEnemyTurn(state);

        if (state.result === EBattleResult.Running) {
            this.startPlayerTurn(state, false);
        }
    }

    printState(state: IBattleState): void {
        // 控制台调试用
        const player = state.player;
        const handText = state.hand
            .map((card, index) => {
                return `[${index}]${card.name}(AP:${card.costAp})`;
            })
            .join(" | ");

        const enemyText = state.enemies
            .map((enemy, index) => {
                const intent = this.getCurrentIntent(enemy);
                const alive = this.isAlive(enemy);
                return `[${index}]${enemy.name} ${alive ? "" : "(死亡)"} HP:${enemy.hp}/${enemy.maxHp} 护盾:${enemy.block} 状态:${this.formatStatuses(enemy)} 意图:${intent ? intent.name : "无"}`;
            })
            .join("\n");

        console.log(
            [
                "========== Battle State ==========",
                `结果：${state.result}`,
                `回合：${state.turnNo}，当前：${state.isPlayerTurn ? "玩家回合" : "敌人回合"}`,
                `玩家 HP:${player.hp}/${player.maxHp} MP:${player.mp}/${player.maxMp} AP:${player.ap} 护盾:${player.block} 状态:${this.formatStatuses(player)}`,
                `牌堆：抽牌 ${state.drawPile.length} / 手牌 ${state.hand.length} / 弃牌 ${state.discardPile.length}`,
                `手牌：${handText || "无"}`,
                "敌人：",
                enemyText || "无",
                "==================================",
            ].join("\n"),
        );
    }

    private startPlayerTurn(state: IBattleState, isFirstTurn: boolean): void {
        if (state.result !== EBattleResult.Running) {
            return;
        }

        state.turnNo++;
        state.isPlayerTurn = true;

        if (this.getBlockClearTiming(state) === EBlockClearTiming.owner_turn_start) {
            this.clearBlock(state, state.player);
        }

        this.tickOwnerTurnStart(state, state.player);
        this.checkBattleEnd(state);

        if (state.result !== EBattleResult.Running) {
            return;
        }

        state.player.ap = BattleConfigUtils.toNumber(state.ruleCfg.ap_per_turn, 3);

        const drawCount = isFirstTurn
            ? BattleConfigUtils.toNumber(state.ruleCfg.first_draw, 5)
            : BattleConfigUtils.toNumber(state.ruleCfg.draw_per_turn, 5);

        this.drawCards(state, drawCount);

        this.log(state, `玩家回合开始：第 ${state.turnNo} 回合，抽 ${drawCount} 张牌，AP 恢复为 ${state.player.ap}`);

        this.printState(state);
    }

    private runEnemyTurn(state: IBattleState): void {
        for (const enemy of state.enemies) {
            if (!this.isAlive(enemy)) {
                continue;
            }

            if (this.getBlockClearTiming(state) === EBlockClearTiming.owner_turn_start) {
                this.clearBlock(state, enemy);
            }

            this.tickOwnerTurnStart(state, enemy);
            this.checkBattleEnd(state);

            if (state.result !== EBattleResult.Running) {
                return;
            }

            if (!this.isAlive(enemy)) {
                continue;
            }

            const intent = this.getCurrentIntent(enemy);

            if (!intent) {
                this.log(state, `${enemy.name} 没有可执行意图`);
                continue;
            }

            const skipped = this.tickBeforeAction(state, enemy);

            if (skipped) {
                this.log(state, `${enemy.name} 因控制状态跳过行动：${intent.name}`);
                this.advanceEnemyIntent(enemy);
                continue;
            }

            this.log(state, `${enemy.name} 执行意图：【${intent.name}】`);

            const isAttackAction =
                Number(intent.intentType) === EIntentType.attack ||
                Number(intent.intentType) === EIntentType.attack_debuff;

            this.executeEffects(state, enemy, intent.effects, state.player, isAttackAction);

            if (isAttackAction) {
                this.handleRemoveTiming(state, enemy, EStatusRemoveTiming.after_attack);
            }

            this.advanceEnemyIntent(enemy);

            if (this.getBlockClearTiming(state) === EBlockClearTiming.turn_end) {
                this.clearBlock(state, enemy);
            }

            this.checkBattleEnd(state);

            if (state.result !== EBattleResult.Running) {
                return;
            }
        }
    }

    private executeEffects(
        state: IBattleState,
        source: IBattleUnit,
        effects: IEffectSpec[],
        selectedTarget: IBattleUnit | null,
        isAttackAction: boolean,
    ): void {
        for (const effect of effects) {
            const targets = this.resolveTargets(state, source, effect.target, selectedTarget);

            if (targets.length === 0) {
                this.log(state, `效果没有目标：effectId=${effect.effectId}`);
                continue;
            }

            for (const target of targets) {
                switch (Number(effect.effectId)) {
                    case EEffectType.damage:
                        this.applyDamage(state, source, target, effect.value, isAttackAction);
                        break;

                    case EEffectType.gain_block:
                        this.applyBlock(state, target, effect.value);
                        break;

                    case EEffectType.apply_status:
                        if (effect.param === undefined) {
                            this.log(state, "施加状态失败：缺少 status_id 参数");
                        } else {
                            this.applyStatus(state, target, effect.param, effect.value);
                        }
                        break;

                    case EEffectType.draw_card:
                        if (target.side === EBattleSide.Player) {
                            this.drawCards(state, effect.value);
                        }
                        break;

                    case EEffectType.gain_ap:
                        if (target.side === EBattleSide.Player) {
                            const player = target as IBattlePlayer;
                            player.ap += effect.value;
                            this.log(state, `玩家获得 ${effect.value} AP`);
                        }
                        break;

                    case EEffectType.heal:
                        this.applyHeal(state, target, effect.value);
                        break;

                    case EEffectType.lose_hp:
                        this.applyLoseHp(state, target, effect.value);
                        break;

                    case EEffectType.gain_mp:
                        if (target.side === EBattleSide.Player) {
                            const player = target as IBattlePlayer;
                            const before = player.mp;
                            player.mp = Math.min(player.maxMp, player.mp + effect.value);
                            this.log(state, `玩家恢复灵力 ${player.mp - before}`);
                        }
                        break;

                    default:
                        this.log(state, `暂未实现效果：effectId=${effect.effectId}`);
                        break;
                }
            }
        }
    }

    private applyDamage(
        state: IBattleState,
        source: IBattleUnit,
        target: IBattleUnit,
        baseValue: number,
        isAttackAction: boolean,
    ): void {
        if (!this.isAlive(target)) {
            return;
        }

        let damage = Math.max(0, Math.floor(baseValue));

        if (isAttackAction) {
            const power = this.getStatusStack(source, EBattleStatusId.Power);
            damage += power;

            const weak = this.getStatusStack(source, EBattleStatusId.Weak);
            if (weak > 0) {
                const weakCfg = this.getStatusCfg(source, EBattleStatusId.Weak);
                const percent = BattleConfigUtils.toNumber(weakCfg?.value_per_stack, 25);
                damage = Math.floor(damage * Math.max(0, 100 - percent) / 100);
            }

            const armorBreak = this.getStatusStack(target, EBattleStatusId.ArmorBreak);
            const realDef = Math.max(0, target.def - armorBreak);
            damage = Math.max(0, damage - realDef);

            const vulnerable = this.getStatusStack(target, EBattleStatusId.Vulnerable);
            if (vulnerable > 0) {
                const vulnerableCfg = this.getStatusCfg(target, EBattleStatusId.Vulnerable);
                const percent = BattleConfigUtils.toNumber(vulnerableCfg?.value_per_stack, 50);
                damage = Math.ceil(damage * (100 + percent) / 100);
            }
        }

        const beforeHp = target.hp;
        const beforeBlock = target.block;

        const blocked = Math.min(target.block, damage);
        target.block -= blocked;

        const realDamage = damage - blocked;
        target.hp = Math.max(0, target.hp - realDamage);

        this.log(
            state,
            `${source.name} 对 ${target.name} 造成 ${damage} 点伤害，护盾抵挡 ${blocked}，生命减少 ${beforeHp - target.hp}`,
        );

        if (beforeBlock !== target.block) {
            this.log(state, `${target.name} 护盾：${beforeBlock} -> ${target.block}`);
        }

        if (isAttackAction) {
            this.handleRemoveTiming(state, target, EStatusRemoveTiming.after_damaged);
        }
    }

    private applyBlock(state: IBattleState, target: IBattleUnit, value: number): void {
        const add = Math.max(0, Math.floor(value));
        target.block += add;
        this.log(state, `${target.name} 获得 ${add} 点护盾，当前护盾：${target.block}`);
    }

    private applyHeal(state: IBattleState, target: IBattleUnit, value: number): void {
        const before = target.hp;
        target.hp = Math.min(target.maxHp, target.hp + Math.max(0, value));
        this.log(state, `${target.name} 恢复生命 ${target.hp - before}`);
    }

    private applyLoseHp(state: IBattleState, target: IBattleUnit, value: number): void {
        const before = target.hp;
        target.hp = Math.max(0, target.hp - Math.max(0, value));
        this.log(state, `${target.name} 失去生命 ${before - target.hp}`);
    }

    private applyStatus(state: IBattleState, target: IBattleUnit, statusId: number, stack: number): void {
        const statusCfg = BattleData.ins().getStatus(statusId);

        if (!BattleConfigUtils.isEnabled(statusCfg)) {
            this.log(state, `状态未启用：${statusId}`);
            return;
        }

        const addStack = Math.max(0, Math.floor(stack));

        if (addStack <= 0) {
            return;
        }

        const old = target.statuses.get(statusId);
        const maxStack = BattleConfigUtils.toNumber(statusCfg.max_stack, 999);
        const stackRule = BattleConfigUtils.toNumber(statusCfg.stack_rule, 1);

        if (!old) {
            target.statuses.set(statusId, {
                statusId,
                name: statusCfg.name || `status_${statusId}`,
                stack: Math.min(addStack, maxStack),
                cfg: statusCfg,
            });

            this.log(state, `${target.name} 获得状态【${statusCfg.name}】${addStack} 层`);
            return;
        }

        switch (stackRule) {
            // 1 层数叠加
            case 1:
                old.stack = Math.min(maxStack, old.stack + addStack);
                break;

            // 2 刷新持续时间：第一阶段没有 duration，暂时按取较大层数处理
            case 2:
                old.stack = Math.max(old.stack, addStack);
                break;

            // 3 替换
            case 3:
                old.stack = Math.min(maxStack, addStack);
                break;

            // 4 取较大值
            case 4:
                old.stack = Math.max(old.stack, addStack);
                break;

            default:
                old.stack = Math.min(maxStack, old.stack + addStack);
                break;
        }

        this.log(state, `${target.name} 状态【${old.name}】当前 ${old.stack} 层`);
    }

    private tickOwnerTurnStart(state: IBattleState, unit: IBattleUnit): void {
        const statuses = Array.from(unit.statuses.values());

        for (const status of statuses) {
            const tickTiming = BattleConfigUtils.toNumber(status.cfg.tick_timing);

            if (tickTiming !== EStatusTickTiming.owner_turn_start) {
                continue;
            }

            const value = this.getStatusTickValue(status);
            const effectId = BattleConfigUtils.toNumber(status.cfg.tick_effect_id);

            switch (effectId) {
                case EEffectType.damage:
                    this.log(state, `${unit.name} 的【${status.name}】触发`);
                    this.applyDamage(state, unit, unit, value, false);
                    break;

                case EEffectType.lose_hp:
                    this.log(state, `${unit.name} 的【${status.name}】触发`);
                    this.applyLoseHp(state, unit, value);
                    break;

                default:
                    break;
            }

            if (BattleConfigUtils.toNumber(status.cfg.reduce_stack_on_tick) === 1) {
                this.reduceStatus(state, unit, status.statusId, 1);
            }
        }
    }

    private tickBeforeAction(state: IBattleState, unit: IBattleUnit): boolean {
        const statuses = Array.from(unit.statuses.values());

        for (const status of statuses) {
            const tickTiming = BattleConfigUtils.toNumber(status.cfg.tick_timing);
            const tickEffectId = BattleConfigUtils.toNumber(status.cfg.tick_effect_id);

            if (
                tickTiming === EStatusTickTiming.before_action &&
                tickEffectId === EEffectType.skip_action
            ) {
                this.log(state, `${unit.name} 的【${status.name}】触发，跳过行动`);

                if (BattleConfigUtils.toNumber(status.cfg.reduce_stack_on_tick) === 1) {
                    this.reduceStatus(state, unit, status.statusId, 1);
                }

                return true;
            }
        }

        return false;
    }

    private handleRemoveTiming(
        state: IBattleState,
        unit: IBattleUnit,
        timing: EStatusRemoveTiming,
    ): void {
        const statuses = Array.from(unit.statuses.values());

        for (const status of statuses) {
            const removeTiming = BattleConfigUtils.toNumber(status.cfg.remove_timing);

            if (removeTiming !== timing) {
                continue;
            }

            const desc = String(status.cfg.desc || "");

            // 配置描述里写了“减少1层”的，按减少 1 层处理。
            // 比如虚弱、易伤、破甲。
            if (desc.indexOf("减少1层") >= 0) {
                this.reduceStatus(state, unit, status.statusId, 1);
            } else {
                // 比如力量作为蓄力效果，攻击后清掉。
                this.removeStatus(state, unit, status.statusId);
            }
        }
    }

    private reduceStatus(
        state: IBattleState,
        unit: IBattleUnit,
        statusId: number,
        count: number,
    ): void {
        const status = unit.statuses.get(statusId);

        if (!status) {
            return;
        }

        status.stack -= count;

        if (status.stack <= 0) {
            this.removeStatus(state, unit, statusId);
        } else {
            this.log(state, `${unit.name} 的【${status.name}】减少到 ${status.stack} 层`);
        }
    }

    private removeStatus(state: IBattleState, unit: IBattleUnit, statusId: number): void {
        const status = unit.statuses.get(statusId);

        if (!status) {
            return;
        }

        unit.statuses.delete(statusId);
        this.log(state, `${unit.name} 的【${status.name}】移除`);
    }

    private drawCards(state: IBattleState, count: number): void {
        const maxHandSize = BattleConfigUtils.toNumber(state.ruleCfg.max_hand_size, 10);
        const reshuffle = BattleConfigUtils.toNumber(state.ruleCfg.reshuffle_when_draw_empty, 1) === 1;

        for (let i = 0; i < count; i++) {
            if (state.hand.length >= maxHandSize) {
                this.log(state, `手牌已达上限 ${maxHandSize}，停止抽牌`);
                return;
            }

            if (state.drawPile.length <= 0) {
                if (!reshuffle || state.discardPile.length <= 0) {
                    this.log(state, "抽牌堆为空，且无法洗回弃牌堆");
                    return;
                }

                state.drawPile = this.shuffle(state.discardPile);
                state.discardPile = [];

                this.log(state, "抽牌堆为空，将弃牌堆洗回抽牌堆");
            }

            const card = state.drawPile.shift();

            if (card) {
                state.hand.push(card);
            }
        }
    }

    private resolveTargets(
        state: IBattleState,
        source: IBattleUnit,
        targetType: number,
        selectedTarget: IBattleUnit | null,
    ): IBattleUnit[] {
        switch (Number(targetType)) {
            case EEffectTarget.self:
            case EEffectTarget.source:
                return [source];

            case EEffectTarget.player:
                return [state.player];

            case EEffectTarget.selected_enemy:
            case EEffectTarget.target:
                return selectedTarget && this.isAlive(selectedTarget) ? [selectedTarget] : [];

            case EEffectTarget.all_enemies:
                return this.getAliveEnemies(state);

            case EEffectTarget.random_enemy: {
                const enemies = this.getAliveEnemies(state);
                if (enemies.length <= 0) {
                    return [];
                }

                const index = Math.floor(Math.random() * enemies.length);
                return [enemies[index]];
            }

            case EEffectTarget.all:
                return [
                    state.player,
                    ...this.getAliveEnemies(state),
                ];

            default:
                return [];
        }
    }

    private cardNeedEnemyTarget(card: IBattleCard): boolean {
        return card.effects.some(effect => {
            return (
                Number(effect.target) === EEffectTarget.selected_enemy ||
                Number(effect.target) === EEffectTarget.target
            );
        });
    }

    private createPlayer(scenarioCfg: any, weaponCfg: any): IBattlePlayer {
        const maxHp = BattleConfigUtils.toNumber(scenarioCfg.player_hp, 100);
        const maxMp = BattleConfigUtils.toNumber(scenarioCfg.player_mp, 80);
        const maxDurability = BattleConfigUtils.toNumber(weaponCfg.max_durability, 0);

        return {
            uid: "player",
            side: EBattleSide.Player,
            cfgId: 0,
            name: "玩家",

            maxHp,
            hp: maxHp,
            def: BattleConfigUtils.toNumber(scenarioCfg.player_def, 0),
            block: 0,

            ap: 0,
            maxMp,
            mp: maxMp,

            weaponId: BattleConfigUtils.toNumber(weaponCfg.weapon_id),
            weaponDurability: maxDurability,
            maxWeaponDurability: maxDurability,
            weaponCfg,

            statuses: new Map(),
            cfg: scenarioCfg,
        };
    }

    private createEnemies(scenarioId: number): IBattleEnemy[] {
        const rows = BattleData.ins().getScenarioEnemies(scenarioId);

        return rows.map((row, index) => {
            const enemyId = BattleConfigUtils.toNumber(row.enemy_id);
            const enemyCfg = BattleData.ins().getEnemy(enemyId);

            if (!enemyCfg) {
                throw new Error(`[BattleEngine] 敌人配置不存在：${enemyId}`);
            }
            const hpRate = BattleConfigUtils.toNumber(row.hp_rate, 1);
            const maxHp = Math.ceil(BattleConfigUtils.toNumber(enemyCfg.hp, 1) * hpRate);
            const intentGroupId = BattleConfigUtils.toNumber(enemyCfg.intent_group_id);

            return {
                uid: `enemy_${index + 1}`,
                side: EBattleSide.Enemy,
                cfgId: enemyId,
                name: enemyCfg.name || `enemy_${enemyId}`,

                maxHp,
                hp: maxHp,
                def: BattleConfigUtils.toNumber(enemyCfg.def, 0),
                block: 0,

                order: BattleConfigUtils.toNumber(row.order, index + 1),
                level: BattleConfigUtils.toNumber(row.level, 1),
                intentGroupId,
                intents: this.createEnemyIntents(intentGroupId),
                intentCursor: 0,

                statuses: new Map(),
                cfg: enemyCfg,
            };
        });
    }

    private createEnemyIntents(intentGroupId: number): IBattleIntent[] {
        const rows = BattleData.ins().getEnemyIntents(intentGroupId);

        return rows.map(row => {
            return {
                intentGroupId,
                intentId: BattleConfigUtils.toNumber(row.intent_id),
                name: row.intent_name || `intent_${row.intent_id}`,
                intentType: BattleConfigUtils.toNumber(row.intent_type),
                effects: BattleConfigUtils.parseEffectGroup(row.effect_group),
                cfg: row,
            };
        });
    }

    private createDeckByWeapon(weaponCfg: any): IBattleCard[] {
        const deckId = BattleConfigUtils.toNumber(weaponCfg.base_deck_id);
        const deckRows = BattleData.ins().getDeckCards(deckId);
        const cards: IBattleCard[] = [];

        for (const row of deckRows) {
            const cardId = BattleConfigUtils.toNumber(row.card_id);
            const count = BattleConfigUtils.toNumber(row.count, 1);
            const cardCfg = BattleData.ins().getCard(cardId);

            if (!BattleConfigUtils.isEnabled(cardCfg)) {
                continue;
            }

            for (let i = 0; i < count; i++) {
                cards.push(this.createCard(cardCfg));
            }
        }

        if (cards.length <= 0) {
            throw new Error(`[BattleEngine] 武器基础牌组为空：deckId=${deckId}`);
        }

        return cards;
    }

    private createCard(cardCfg: any): IBattleCard {
        return {
            uid: this._cardUid++,
            cardId: BattleConfigUtils.toNumber(cardCfg.card_id),
            name: cardCfg.name || `card_${cardCfg.card_id}`,
            icon: cardCfg.icon || "",
            cardType: BattleConfigUtils.toNumber(cardCfg.card_type),
            costAp: BattleConfigUtils.toNumber(cardCfg.cost_ap),
            canEnchant: BattleConfigUtils.toNumber(cardCfg.can_enchant) === 1,
            effects: BattleConfigUtils.parseEffectGroup(cardCfg.effect_group),
            cfg: cardCfg,
        };
    }

    private getCurrentIntent(enemy: IBattleEnemy): IBattleIntent | null {
        if (!enemy.intents || enemy.intents.length <= 0) {
            return null;
        }

        return enemy.intents[enemy.intentCursor % enemy.intents.length];
    }

    private advanceEnemyIntent(enemy: IBattleEnemy): void {
        if (!enemy.intents || enemy.intents.length <= 0) {
            return;
        }

        enemy.intentCursor = (enemy.intentCursor + 1) % enemy.intents.length;
    }

    private checkBattleEnd(state: IBattleState): void {
        if (state.player.hp <= 0) {
            state.result = EBattleResult.Lose;
            this.log(state, "战斗失败：玩家死亡");
            return;
        }

        const hasAliveEnemy = state.enemies.some(enemy => this.isAlive(enemy));

        if (!hasAliveEnemy) {
            state.result = EBattleResult.Win;
            this.log(state, "战斗胜利：所有敌人已被击败");
        }
    }

    private canOperate(state: IBattleState): boolean {
        if (!state) {
            return false;
        }

        if (state.result !== EBattleResult.Running) {
            console.warn(`[BattleEngine] 战斗已结束：${state.result}`);
            return false;
        }

        if (!state.isPlayerTurn) {
            console.warn("[BattleEngine] 当前不是玩家回合");
            return false;
        }

        return true;
    }

    private getAliveEnemies(state: IBattleState): IBattleEnemy[] {
        return state.enemies.filter(enemy => this.isAlive(enemy));
    }

    private isAlive(unit: IBattleUnit): boolean {
        return unit.hp > 0;
    }

    private getBlockClearTiming(state: IBattleState): EBlockClearTiming {
        return BattleConfigUtils.toNumber(
            state.ruleCfg.block_clear_timing,
            EBlockClearTiming.owner_turn_start,
        ) as EBlockClearTiming;
    }

    private clearBlock(state: IBattleState, unit: IBattleUnit): void {
        if (unit.block > 0) {
            this.log(state, `${unit.name} 护盾清空：${unit.block} -> 0`);
            unit.block = 0;
        }
    }

    private getStatusStack(unit: IBattleUnit, statusId: number): number {
        return unit.statuses.get(statusId)?.stack || 0;
    }

    private getStatusCfg(unit: IBattleUnit, statusId: number): any {
        return unit.statuses.get(statusId)?.cfg || null;
    }

    private getStatusTickValue(status: IBattleStatus): number {
        const mode = BattleConfigUtils.toNumber(status.cfg.effect_mode);
        const valuePerStack = BattleConfigUtils.toNumber(status.cfg.value_per_stack, 0);

        // 2 = 按层数计算
        if (mode === 2) {
            return status.stack * valuePerStack;
        }

        return valuePerStack;
    }

    private formatStatuses(unit: IBattleUnit): string {
        const list = Array.from(unit.statuses.values());

        if (list.length <= 0) {
            return "无";
        }

        return list
            .map(status => `${status.name}x${status.stack}`)
            .join(",");
    }

    private shuffle<T>(arr: T[]): T[] {
        const list = arr.concat();

        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = list[i];
            list[i] = list[j];
            list[j] = tmp;
        }

        return list;
    }

    private log(state: IBattleState, msg: string): void {
        state.logs.push(msg);
        console.log(`[Battle] ${msg}`);
    }
}