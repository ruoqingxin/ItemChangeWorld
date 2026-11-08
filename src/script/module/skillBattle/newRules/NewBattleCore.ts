export interface NewBattleState {
    phase: "player_input" | "victory" | "defeat";
    revision: number;
    hp: number;
    maxHp: number;
    mp: number;
    maxMp: number;
    block: number;
    enemyHp: number;
    enemyBlock: number;
    momentum: number;
    momentumMax: number;
    keen: boolean;
    weaponDurability: number;
    pouch: NewBattlePotion[];
}

export interface NewBattlePotion {
    uid: string;
    type: "hp" | "mp";
    amount: number;
}

/** Amounts are supplied by the caller until the approved formula table is wired in. */
export interface NewBattleTurnValues {
    basicDamage: number;
    guardBlock: number;
    enemyDamage: number;
    hasSwordSchool: boolean;
    hasWeapon: boolean;
}

export interface NewBattleAction {
    type: "basic" | "guard";
    potionUid?: string;
}

export type NewBattleTurnResult =
    | { ok: true; state: NewBattleState; events: string[] }
    | { ok: false; reason: string };

export class NewBattleCore {
    static weaponAttributeRatio(durability: number): number {
        return durability > 0 ? 1 : 0.5;
    }

    /** Pure calculation used by both preview and eventual transactional confirmation. */
    static resolve(state: NewBattleState, action: NewBattleAction, values: NewBattleTurnValues): NewBattleTurnResult {
        if (state.phase !== "player_input") return { ok: false, reason: "当前不能行动" };
        if (!action || (action.type !== "basic" && action.type !== "guard"))
            return { ok: false, reason: "不支持的行动" };
        const amounts = [values.basicDamage, values.guardBlock, values.enemyDamage];
        if (amounts.some(value => !Number.isSafeInteger(value) || value < 0))
            return { ok: false, reason: "战斗数值无效" };

        const next: NewBattleState = { ...state, pouch: state.pouch.map(item => ({ ...item })) };
        const events: string[] = [];
        if (action.potionUid !== undefined) {
            const index = next.pouch.findIndex(item => item.uid === action.potionUid);
            const potion = next.pouch[index];
            if (!potion || !Number.isSafeInteger(potion.amount) || potion.amount <= 0 ||
                (potion.type !== "hp" && potion.type !== "mp"))
                return { ok: false, reason: "药品无效" };
            if ((potion.type === "hp" && next.hp >= next.maxHp) ||
                (potion.type === "mp" && next.mp >= next.maxMp))
                return { ok: false, reason: "当前资源已满" };
            if (potion.type === "hp") next.hp = Math.min(next.maxHp, next.hp + potion.amount);
            else next.mp = Math.min(next.maxMp, next.mp + potion.amount);
            next.pouch.splice(index, 1);
            events.push("potion");
        }

        if (action.type === "basic") {
            const absorbed = Math.min(next.enemyBlock, values.basicDamage);
            next.enemyBlock -= absorbed;
            next.enemyHp = Math.max(0, next.enemyHp - (values.basicDamage - absorbed));
            events.push("basic");
        } else {
            next.block += values.guardBlock;
            events.push("guard");
        }
        if (values.hasWeapon && next.weaponDurability > 0) next.weaponDurability--;
        if (values.hasSwordSchool && next.momentum < next.momentumMax) {
            next.momentum++;
            if (next.momentum === next.momentumMax) {
                next.keen = true;
                events.push("keen");
            }
        }
        if (next.enemyHp === 0) {
            next.phase = "victory";
        } else {
            const absorbed = Math.min(next.block, values.enemyDamage);
            next.block -= absorbed;
            next.hp = Math.max(0, next.hp - (values.enemyDamage - absorbed));
            events.push("enemy");
            if (next.hp === 0) next.phase = "defeat";
        }
        next.block = 0;
        next.revision++;
        return { ok: true, state: next, events };
    }
}
