import type {
    ISkillActionPreview, ISkillActionResolution, ISkillBattleAction, ISkillBattleCarry,
    ISkillBattleSetup, ISkillBattleState, ISkillIntentConfig, ISkillItemConfig,
    SkillBattleEvent, SkillBattleSide, SkillUpgradeEffect,
} from "../types/SkillBattleTypes";

export class SkillBattleFormulaUtils {
    static startBattle(setup: ISkillBattleSetup, battleId: string, carry?: ISkillBattleCarry): ISkillBattleState {
        if (carry) this.validateCarry(setup, carry);
        return {
            battleId, encounterId: setup.encounterId, phase: "player_input", revision: 0, round: 1,
            player: { hp: carry ? carry.playerHp : setup.playerMaxHp, maxHp: setup.playerMaxHp, block: 0 },
            enemy: { hp: setup.enemy.maxHp, maxHp: setup.enemy.maxHp, block: 0 },
            swordQi: setup.startQi, swordQiMax: setup.qiMax,
            enemyId: setup.enemy.id, enemyIntentIndex: 0, enemyBurn: 0,
            weaponId: setup.weaponId,
            weaponDurability: carry ? carry.weaponDurability : setup.weaponDurability,
            pouchSlots: carry ? carry.pouchSlots.map(item => item ? { ...item } : null) : [null, null, null, null, null],
            upgradeIds: carry?.upgradeIds?.slice() || [], nextSlashBonus: 0, keen: false,
        };
    }

    static cloneState(state: ISkillBattleState): ISkillBattleState {
        return { ...state, player: { ...state.player }, enemy: { ...state.enemy },
            pouchSlots: state.pouchSlots.map(item => item ? { ...item } : null),
            upgradeIds: state.upgradeIds.slice() };
    }

    static upgradeValue(setup: ISkillBattleSetup, state: ISkillBattleState, effect: SkillUpgradeEffect): number | undefined {
        return setup.upgrades?.find(row => row.effect === effect && state.upgradeIds.includes(row.id))?.value;
    }

    static qiCost(setup: ISkillBattleSetup, state: ISkillBattleState, skillId: number): number {
        const skill = setup.skills.find(row => row.id === skillId);
        return skillId === 3 ? this.upgradeValue(setup, state, "thrust_cost") ?? skill?.qiCost ?? 0 : skill?.qiCost || 0;
    }

    static currentIntent(setup: ISkillBattleSetup, state: ISkillBattleState): ISkillIntentConfig {
        return setup.enemy.intents[state.enemyIntentIndex];
    }

    static previewAction(setup: ISkillBattleSetup, snapshot: ISkillBattleState, action: ISkillBattleAction): ISkillActionResolution {
        return this.resolveAction(setup, snapshot, action);
    }

    static elementMultiplier(source: number, target: number): number {
        if (!source || !target) return 1;
        if (source === target) return 0.9;
        const controls: { [element: number]: number } = { 1: 2, 2: 5, 5: 3, 3: 4, 4: 1 };
        return controls[source] === target ? 1.2 : controls[target] === source ? 0.8 : 1;
    }

    /** Weapon-provided attributes are halved at zero durability. */
    static weaponAttributeMultiplier(state: ISkillBattleState): number {
        return state.weaponDurability <= 0 ? 0.5 : 1;
    }

    /** Validate all costs first, then compute a complete round on a detached copy. */
    static resolveAction(setup: ISkillBattleSetup, snapshot: ISkillBattleState, action: ISkillBattleAction): ISkillActionResolution {
        const reject = (reason: string): ISkillActionResolution => ({
            ok: false, reason, state: this.cloneState(snapshot), events: [], preview: null,
        });
        if (snapshot.phase !== "player_input") return reject("当前不是可行动阶段");
        if (snapshot.encounterId !== setup.encounterId || snapshot.enemyId !== setup.enemy.id ||
            snapshot.player.hp <= 0 || snapshot.enemy.hp <= 0) return reject("战斗快照与当前遭遇不匹配或战斗已结束");
        if (!action || (action.type !== "skill" && action.type !== "use_item")) return reject("无效行动");
        const skill = action.type === "skill" ? setup.skills.find(row => row.id === action.skillId) : null;
        if (action.type === "skill" && (!Number.isSafeInteger(action.skillId) || !skill)) return reject("当前武器没有这个招式");
        const qiCost = skill ? this.qiCost(setup, snapshot, skill.id) : 0;
        if (skill && snapshot.swordQi < qiCost)
            return reject(`剑势不足，需要 ${qiCost}，当前 ${snapshot.swordQi}`);
        const uid = action.type === "use_item" ? action.itemUid : (action.itemUid || action.stoneItemUid);
        let slot = -1;
        let item: ISkillItemConfig | undefined;
        let preparedSlot = -1;
        let preparedItem: ISkillItemConfig | undefined;
        if (action.type === "skill" && action.itemUid) {
            preparedSlot = snapshot.pouchSlots.findIndex(value => value?.itemUid === action.itemUid);
            if (preparedSlot < 0) return reject("该物品已消耗或不在法囊中");
            preparedItem = setup.items.find(row => row.itemId === snapshot.pouchSlots[preparedSlot]!.itemId);
            if (!preparedItem || preparedItem.useType !== "heal")
                return reject("主行动前只能准备回血/回蓝药品");
            if (snapshot.player.hp >= snapshot.player.maxHp)
                return reject("生命已满，不能使用疗伤丹");
        }
        if (action.type === "skill" && action.itemUid && action.stoneItemUid &&
            action.itemUid === action.stoneItemUid) {
            return reject("药品与属性石不能使用同一份物品");
        }
        if (action.type === "use_item" || (action.type === "skill" && "stoneItemUid" in action)) {
            const selectedUid = action.type === "use_item" ? action.itemUid : action.stoneItemUid;
            if (typeof selectedUid !== "string" || !selectedUid) return reject("物品实例无效");
            slot = snapshot.pouchSlots.findIndex(value => value?.itemUid === selectedUid);
            if (slot < 0) return reject("该物品已消耗或不在法囊中");
            item = setup.items.find(row => row.itemId === snapshot.pouchSlots[slot]!.itemId);
            if (!item) return reject("物品使用配置不存在");
            if (action.type === "use_item") {
                if ("stoneItemUid" in action) return reject("用药不能附带属性石");
                if (item.useType !== "heal") return reject("属性石需要附带攻击招式");
                if (snapshot.player.hp >= snapshot.player.maxHp) return reject("生命已满，不能使用疗伤丹");
            } else {
                if (!skill!.canEnchant || skill!.damage <= 0) return reject("该招式不可注灵");
                if (item.useType !== "fire_stone" && item.useType !== "earth_stone") return reject("只能附带火或土属性石");
                if (snapshot.weaponDurability < item.durabilityCost)
                    return reject(`耐久不足，注灵需要 ${item.durabilityCost}，当前 ${snapshot.weaponDurability}`);
            }
        }
        const intent = this.currentIntent(setup, snapshot);
        if (!intent) return reject("当前敌人意图不存在");
        const state = this.cloneState(snapshot);
        const events: SkillBattleEvent[] = [];
        const triggerUpgrade = (effect: SkillUpgradeEffect): number => {
            const upgrade = setup.upgrades?.find(row => row.effect === effect && state.upgradeIds.includes(row.id));
            if (!upgrade) return 0;
            events.push({ type: "passive_triggered", id: upgrade.id, name: upgrade.name, value: upgrade.value });
            return upgrade.value;
        };
        const preview: ISkillActionPreview = {
            token: { battleId: snapshot.battleId, revision: snapshot.revision },
            qiCost, qiAfterAction: state.swordQi,
            baseDamage: skill?.damage || 0, blockAbsorbed: 0, enemyHpLoss: 0,
            blockGained: skill?.block || 0, interrupted: false, enemyDamage: 0,
            playerBlockAbsorbed: 0, playerHpLoss: 0, enchantDamage: 0, enchantBlockAbsorbed: 0,
            enchantHpLoss: 0, burnApplied: 0, burnDamage: 0, healAmount: 0, durabilityCost: 0,
            consumedItemUid: uid || null,
            counterDamage: 0, counterHpLoss: 0,
            keenDamage: 0,
        };
        state.phase = "resolving";
        state.revision++;
        if (preparedItem) {
            const instance = state.pouchSlots[preparedSlot]!;
            state.pouchSlots[preparedSlot] = null;
            events.push({ type: "item_consumed", ...instance, slot: preparedSlot, name: preparedItem.name });
            preview.healAmount = Math.min(preparedItem.healValue, state.player.maxHp - state.player.hp);
            state.player.hp += preview.healAmount;
            events.push({ type: "healed", amount: preview.healAmount });
        }
        if (item) {
            const instance = state.pouchSlots[slot]!;
            state.pouchSlots[slot] = null;
            events.push({ type: "item_consumed", ...instance, slot, name: item.name });
        }
        if (skill) {
            events.push({ type: "skill_used", skillId: skill.id, name: skill.name });
            const beforeDurability = state.weaponDurability;
            state.weaponDurability = Math.max(0, state.weaponDurability - 1);
            preview.durabilityCost = 1;
            events.push({ type: "durability_changed", before: beforeDurability, after: state.weaponDurability });
            const beforeQi = state.swordQi;
            const availableQi = beforeQi - qiCost + skill.qiGain;
            state.swordQi = Math.min(state.swordQiMax, availableQi);
            preview.qiAfterAction = state.swordQi;
            events.push({ type: "qi_changed", before: beforeQi, after: state.swordQi, overflow: Math.max(0, availableQi - state.swordQiMax) });
            if (beforeQi < state.swordQiMax && state.swordQi === state.swordQiMax && !state.keen) {
                state.keen = true;
                events.push({ type: "keen_changed", active: true, damage: 3 });
            }
            if (item) {
                const before = state.weaponDurability;
                state.weaponDurability = Math.max(0, state.weaponDurability - item.durabilityCost);
                preview.durabilityCost += item.durabilityCost;
                events.push({ type: "durability_changed", before, after: state.weaponDurability });
            }
            if (skill.damage > 0) {
                if (skill.id === 1) {
                    preview.baseDamage += state.nextSlashBonus;
                    if (beforeQi === state.swordQiMax)
                        preview.baseDamage += triggerUpgrade("full_qi_slash");
                    state.nextSlashBonus = 0;
                }
                const hit = this.damage(state, "player", "enemy", preview.baseDamage);
                events.push(hit);
                preview.blockAbsorbed = hit.blockAbsorbed;
                preview.enemyHpLoss = hit.hpLoss;
                if (state.keen && qiCost > 0 && state.enemy.hp > 0) {
                    const keenHit = this.damage(state, "player", "enemy", 3);
                    preview.keenDamage = keenHit.hpLoss;
                    preview.enemyHpLoss += keenHit.hpLoss;
                    events.push(keenHit);
                    state.keen = false;
                    events.push({ type: "keen_changed", active: false, damage: 0 });
                }
            }
            if (skill.block > 0) {
                preview.blockGained = skill.id === 2
                    ? (setup.upgrades?.find(row => row.effect === "guard_block" && state.upgradeIds.includes(row.id))
                        ? triggerUpgrade("guard_block") : skill.block) : skill.block;
                this.gainBlock(state, "player", preview.blockGained, events);
            }
            if (item) {
                if (state.enemy.hp > 0) {
                    events.push({ type: "enchant_used", element: item.element, name: item.name });
                    preview.enchantDamage = Math.floor(skill.damage * item.damageRate / 100 *
                        this.elementMultiplier(item.element, setup.enemy.element));
                    const hit = this.damage(state, "player", "enemy", preview.enchantDamage);
                    events.push(hit);
                    preview.enchantBlockAbsorbed = hit.blockAbsorbed;
                    preview.enchantHpLoss = hit.hpLoss;
                    if (state.enemy.hp > 0 && item.burnStacks > 0) {
                        const before = state.enemyBurn;
                        state.enemyBurn = Math.min(20, before + item.burnStacks +
                            triggerUpgrade("fire_burn"));
                        preview.burnApplied = state.enemyBurn - before;
                        events.push({ type: "burn_changed", before, after: state.enemyBurn });
                    }
                }
                // Earth shielding is granted even when the direct strike is lethal.
                if (item.blockValue > 0) {
                    this.gainBlock(state, "player", item.blockValue, events);
                    preview.blockGained += item.blockValue;
                }
            }
        } else {
            preview.healAmount = Math.min(item!.healValue, state.player.maxHp - state.player.hp);
            state.player.hp += preview.healAmount;
            events.push({ type: "healed", amount: preview.healAmount });
        }
        if (state.enemy.hp === 0) {
            this.finish(state, events, "victory");
            return { ok: true, state, events, preview };
        }
        if (state.enemyBurn > 0) {
            const before = state.enemyBurn;
            const hpLoss = Math.min(state.enemy.hp, before);
            state.enemy.hp -= hpLoss;
            preview.burnDamage = hpLoss;
            events.push({ type: "burn_damage", amount: before, hpLoss });
            state.enemyBurn--;
            events.push({ type: "burn_changed", before, after: state.enemyBurn });
            if (state.enemy.hp === 0) {
                this.finish(state, events, "victory");
                return { ok: true, state, events, preview };
            }
        }
        preview.interrupted = !!skill?.interrupts && intent.interruptible;
        if (preview.interrupted) {
            events.push({ type: "intent_interrupted", intentId: intent.id, name: intent.name });
            state.nextSlashBonus = triggerUpgrade("interrupt_slash");
        }
        else {
            events.push({ type: "intent_executed", intentId: intent.id, name: intent.name });
            if (intent.type === "attack") {
                const hit = this.damage(state, "enemy", "player", intent.damage);
                events.push(hit);
                preview.enemyDamage = hit.amount;
                preview.playerBlockAbsorbed = hit.blockAbsorbed;
                preview.playerHpLoss = hit.hpLoss;
            } else if (intent.type === "block" && intent.block > 0) this.gainBlock(state, "enemy", intent.block, events);
        }
        if (state.player.hp === 0) {
            this.finish(state, events, "defeat");
            return { ok: true, state, events, preview };
        }
        const counter = this.upgradeValue(setup, state, "counter") || 0;
        if (skill?.id === 2 && preview.playerBlockAbsorbed > 0 && counter > 0) {
            triggerUpgrade("counter");
            const hit = this.damage(state, "player", "enemy", counter);
            events.push(hit);
            preview.counterDamage = hit.amount;
            preview.counterHpLoss = hit.hpLoss;
            if (state.enemy.hp === 0) {
                this.finish(state, events, "victory");
                return { ok: true, state, events, preview };
            }
        }
        // Shield cleanup is the final phase of a round.
        this.clearBlock(state, "enemy", events);
        this.clearBlock(state, "player", events);
        state.enemyIntentIndex = (state.enemyIntentIndex + 1) % setup.enemy.intents.length;
        state.round++;
        state.phase = "player_input";
        const next = this.currentIntent(setup, state);
        events.push({ type: "round_started", round: state.round, intentId: next.id, name: next.name });
        return { ok: true, state, events, preview };
    }

    private static validateCarry(setup: ISkillBattleSetup, carry: ISkillBattleCarry): void {
        const fail = () => { throw new Error("[SkillBattle] 跨战斗物资快照无效"); };
        if (carry.weaponId !== setup.weaponId || carry.playerMaxHp !== setup.playerMaxHp ||
            !Number.isSafeInteger(carry.playerHp) || carry.playerHp <= 0 || carry.playerHp > carry.playerMaxHp ||
            !Number.isSafeInteger(carry.weaponDurability) || carry.weaponDurability < 0 ||
            carry.weaponDurability > setup.weaponDurability || !Array.isArray(carry.pouchSlots) ||
            carry.pouchSlots.length !== 5) fail();
        if (carry.upgradeIds && (!Array.isArray(carry.upgradeIds) ||
            new Set(carry.upgradeIds).size !== carry.upgradeIds.length ||
            carry.upgradeIds.some(id => !setup.upgrades?.some(row => row.id === id)))) fail();
        const uids = new Set<string>();
        for (let slot = 0; slot < 5; slot++) {
            const item = carry.pouchSlots[slot];
            if (item === null) continue;
            if (!item || typeof item.itemUid !== "string" || !item.itemUid || uids.has(item.itemUid) ||
                !setup.items.some(row => row.itemId === item.itemId)) fail();
            uids.add(item.itemUid);
        }
    }

    private static damage(state: ISkillBattleState, source: SkillBattleSide, target: SkillBattleSide,
        amount: number): Extract<SkillBattleEvent, { type: "damage" }> {
        const unit = state[target];
        const blockAbsorbed = Math.min(unit.block, amount);
        const hpLoss = Math.min(unit.hp, amount - blockAbsorbed);
        unit.block -= blockAbsorbed;
        unit.hp -= hpLoss;
        return { type: "damage", source, target, amount, blockAbsorbed, hpLoss };
    }

    private static gainBlock(state: ISkillBattleState, target: SkillBattleSide, amount: number, events: SkillBattleEvent[]): void {
        state[target].block += amount;
        events.push({ type: "block_gained", target, amount });
    }

    private static clearBlock(state: ISkillBattleState, target: SkillBattleSide, events: SkillBattleEvent[]): void {
        if (state[target].block > 0) events.push({ type: "block_cleared", target, amount: state[target].block });
        state[target].block = 0;
    }

    private static finish(state: ISkillBattleState, events: SkillBattleEvent[], result: "victory" | "defeat"): void {
        state.phase = result;
        this.clearBlock(state, "player", events);
        this.clearBlock(state, "enemy", events);
        if (state.enemyBurn) events.push({ type: "burn_changed", before: state.enemyBurn, after: 0 });
        state.enemyBurn = 0;
        state.swordQi = 0;
        state.nextSlashBonus = 0;
        state.keen = false;
        events.push({ type: "battle_ended", result });
    }
}
