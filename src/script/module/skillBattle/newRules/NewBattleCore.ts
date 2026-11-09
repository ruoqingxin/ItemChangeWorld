import type {
    NewBattleAction, NewBattleCarry, NewBattleEvent, NewBattlePreview, NewBattleResult,
    NewBattleSetup, NewBattleState, NewDamagePart, NewSwordPassive,
} from "./NewBattleTypes";

/** Resource values use integer hundredths. This module never touches scenes, clocks or storage. */
export class NewBattleCore {
    static readonly unit = 100;
    private static readonly main = [100, 110, 110, 120, 120, 130];
    private static readonly sub = [100, 100, 115, 115, 130, 145];
    private static readonly point = [100, 110, 120, 130, 140, 150];
    private static readonly enhancement = [100, 110, 120, 120, 130, 140];

    static clone<T>(value: T): T { return value === undefined ? value : JSON.parse(JSON.stringify(value)); }
    static format(value: number): string { return (value / this.unit).toFixed(2).replace(/\.?0+$/, ""); }
    static weaponAttributeRatio(durability: number): number { return durability > 0 ? 1 : 0.5; }

    static scale(value: number, percent: number, strength = 100): number {
        if (![value, percent, strength].every(n => Number.isSafeInteger(n) && n >= 0))
            throw new Error("战斗数值不是非负安全整数");
        const result = (BigInt(value) * BigInt(percent) * BigInt(strength) + BigInt(5000)) / BigInt(10000);
        if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("战斗数值超过安全范围");
        return Number(result);
    }

    static start(setup: NewBattleSetup, battleId: string, carry?: NewBattleCarry): NewBattleState {
        this.validateSetup(setup);
        if (!battleId) throw new Error("战斗标识无效");
        const state: NewBattleState = {
            version: 1, battleId, phase: "player_input", revision: 0, round: 1, mainActions: 0,
            player: { hp: carry?.hp ?? setup.player.maxHp, maxHp: setup.player.maxHp,
                mp: carry?.mp ?? setup.player.maxMp, maxMp: setup.player.maxMp, block: 0 },
            enemy: { hp: setup.enemy.maxHp, maxHp: setup.enemy.maxHp, block: 0, intentIndex: 0 },
            weapon: this.clone(carry ? carry.weapon : setup.weapon),
            pouch: carry ? this.clone(carry.pouch) : [null, null, null, null, null], potionUsed: false,
            sword: { momentum: 0, keen: false, enhancement: 100, firstBasicUsed: false,
                xifeng: false, previousAttack: null, mark: null },
        };
        this.validateState(setup, state);
        return state;
    }

    static attributes(setup: NewBattleSetup, state: NewBattleState): { attack: number; defense: number } {
        const weapon = state.weapon;
        const ratio = !weapon ? 0 : weapon.durability > 0 ? 100 : 50;
        return { attack: setup.player.baseAttack + this.scale(weapon?.attack || 0, ratio),
            defense: setup.player.baseDefense + this.scale(weapon?.defense || 0, ratio) };
    }

    static validateSetup(setup: NewBattleSetup): void {
        const int = (n: number, min = 0) => Number.isSafeInteger(n) && n >= min && n <= 100000000;
        const unique = (rows: Array<{ id: number }>) => new Set(rows.map(row => row.id)).size === rows.length;
        if (!setup || typeof setup.rulesId !== "string" || !setup.rulesId || !setup.player ||
            ![setup.player.maxHp, setup.player.maxMp, setup.player.baseAttack, setup.player.baseDefense]
                .every(n => int(n, 1)) ||
            !Array.isArray(setup.skills) || !unique(setup.skills) ||
            !Array.isArray(setup.passives) || !unique(setup.passives) ||
            !Array.isArray(setup.potions) || new Set(setup.potions.map(row => row.itemId)).size !== setup.potions.length ||
            !setup.build || !Array.isArray(setup.build.schools) ||
            new Set(setup.build.schools).size !== setup.build.schools.length ||
            !setup.build.schools.every(value => typeof value === "string" && !!value) ||
            !Array.isArray(setup.build.actives) || setup.build.actives.length > 3 ||
            new Set(setup.build.actives.map(row => row.skillId)).size !== setup.build.actives.length ||
            !Array.isArray(setup.build.passiveIds) ||
            new Set(setup.build.passiveIds).size !== setup.build.passiveIds.length ||
            !setup.enemy || !int(setup.enemy.id, 1) || !int(setup.enemy.maxHp, 1) ||
            !Array.isArray(setup.enemy.intents) || !setup.enemy.intents.length)
            throw new Error("新版战斗配置无效");
        const skills = ["dianxing", "liejia", "huilan", "liuhen", "ningfeng"];
        const passives = ["chuzhao", "xifeng", "difeng", "bengjia", "lianmang", "guanxi"];
        if (new Set(setup.skills.map(row => row.kind)).size !== setup.skills.length ||
            new Set(setup.passives.map(row => row.kind)).size !== setup.passives.length ||
            setup.skills.some(row => !int(row.id, 1) || !row.name || !skills.includes(row.kind) ||
                ![row.mpCost, row.damagePercent, row.shieldPercent, row.shredPercent, row.markPercent].every(n => int(n)) ||
                !row.school) ||
            setup.passives.some(row => !int(row.id, 1) || !row.name || !passives.includes(row.kind) || !int(row.value)) ||
            setup.build.actives.some(row => !int(row.level) || row.level > 5 ||
                !setup.skills.some(skill => skill.id === row.skillId && setup.build.schools.includes(skill.school))) ||
            setup.build.passiveIds.some(id => !setup.passives.some(row => row.id === id)) ||
            setup.potions.some(row => !int(row.itemId, 1) || !row.name || !["hp", "mp"].includes(row.resource) ||
                !int(row.amount, 1)) ||
            setup.enemy.intents.some(row => !int(row.id, 1) || !row.name || !int(row.damage) ||
                !int(row.block) || typeof row.charging !== "boolean"))
            throw new Error("新版技能、物品或意图配置无效");
        if (setup.weapon) this.validateWeapon(setup.weapon);
    }

    private static validateWeapon(weapon: NonNullable<NewBattleState["weapon"]>): void {
        if (!weapon || !Number.isSafeInteger(weapon.id) || weapon.id < 1 || !weapon.name ||
            ![weapon.attack, weapon.defense, weapon.durability, weapon.maxDurability]
                .every(n => Number.isSafeInteger(n) && n >= 0 && n <= 100000000) ||
            weapon.durability > weapon.maxDurability || weapon.maxDurability === 0)
            throw new Error("武器属性或耐久无效");
    }

    static validateState(setup: NewBattleSetup, state: NewBattleState): void {
        const int = (n: number, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(n) && n >= 0 && n <= max;
        const p = state?.player, e = state?.enemy, s = state?.sword;
        if (!state || state.version !== 1 || typeof state.battleId !== "string" || !state.battleId || !p || !e || !s ||
            !["player_input", "victory", "defeat"].includes(state.phase) ||
            p.maxHp !== setup.player.maxHp || p.maxMp !== setup.player.maxMp || e.maxHp !== setup.enemy.maxHp ||
            !int(p.hp, p.maxHp) || !int(p.mp, p.maxMp) || !int(p.block) ||
            !int(e.hp, e.maxHp) || !int(e.block) || !int(e.intentIndex, setup.enemy.intents.length - 1) ||
            !int(state.revision) || !int(state.mainActions) || !int(state.round) ||
            state.round !== state.mainActions + (state.phase === "player_input" ? 1 : 0) ||
            state.revision < state.mainActions || state.revision > state.mainActions * 2 + 1 ||
            typeof state.potionUsed !== "boolean" || !int(s.momentum, 3) || typeof s.keen !== "boolean" ||
            s.keen !== (s.momentum === 3) || ![100, 110, 120, 130, 140].includes(s.enhancement) ||
            typeof s.firstBasicUsed !== "boolean" || typeof s.xifeng !== "boolean" ||
            (s.previousAttack !== null && !setup.skills.some(row => row.id === s.previousAttack && row.kind !== "ningfeng")) ||
            (s.mark !== null && (!int(s.mark.damage) || !int(s.mark.ticks, 2) || s.mark.ticks < 1)) ||
            !Array.isArray(state.pouch) || state.pouch.length !== 5 ||
            new Set(state.pouch.filter(Boolean).map(row => row!.itemUid)).size !== state.pouch.filter(Boolean).length ||
            state.pouch.some(row => row !== null && (!row || typeof row.itemUid !== "string" || !row.itemUid ||
                !setup.potions.some(potion => potion.itemId === row.itemId))))
            throw new Error("新版战斗快照无效");
        if (state.weapon) {
            this.validateWeapon(state.weapon);
            if (!setup.weapon || state.weapon.id !== setup.weapon.id || state.weapon.attack !== setup.weapon.attack ||
                state.weapon.defense !== setup.weapon.defense || state.weapon.maxDurability !== setup.weapon.maxDurability)
                throw new Error("武器快照与配置不符");
        } else if (setup.weapon !== null) throw new Error("武器快照缺失");
        if (state.phase === "player_input" ? p.hp <= 0 || e.hp <= 0 :
            state.phase === "victory" ? e.hp !== 0 || p.hp <= 0 : p.hp !== 0 || e.hp <= 0)
            throw new Error("战斗生死状态无效");
        if (state.phase !== "player_input" &&
            (p.block || e.block || s.momentum || s.keen || s.enhancement !== 100 || s.xifeng || s.mark || s.previousAttack !== null))
            throw new Error("战斗结束仍残留临时效果");
        if (!setup.build.schools.includes("sword") &&
            (s.momentum || s.keen || s.enhancement !== 100 || s.xifeng))
            throw new Error("未借剑道不能养锋");
    }

    static resolve(setup: NewBattleSetup, snapshot: NewBattleState, action: NewBattleAction): NewBattleResult {
        const reject = (reason: string): NewBattleResult =>
            ({ ok: false, reason, state: this.clone(snapshot), events: [], preview: null });
        try { this.validateSetup(setup); this.validateState(setup, snapshot); }
        catch (error) { return reject((error as Error).message); }
        if (snapshot.phase !== "player_input") return reject("战斗已结束");
        if (!action || !["basic", "guard", "skill", "potion"].includes(action.type)) return reject("无效行动");
        const active = action.type === "skill" ? setup.build.actives.find(row => row.skillId === action.skillId) : null;
        const skill = active ? setup.skills.find(row => row.id === active.skillId)! : null;
        if (action.type === "skill" && !skill) return reject("该主动尚未借取");
        if (skill && snapshot.player.mp < skill.mpCost) return reject(`灵力不足，需要 ${this.format(skill.mpCost)}`);
        if (skill?.kind === "ningfeng" && snapshot.sword.momentum >= 3) return reject("剑势已满，凝锋无实际收益");
        const state = this.clone(snapshot), events: NewBattleEvent[] = [];
        const preview: NewBattlePreview = {
            token: { battleId: state.battleId, revision: state.revision },
            name: skill?.name || (action.type === "basic" ? "普攻" : action.type === "guard" ? "防御" : "用药"),
            mpCost: 0, durabilityCost: 0, shred: 0, body: 0, keen: 0, difeng: 0, guanxi: 0,
            mark: 0, markTicks: 0, enemyHpLoss: 0, playerHpLoss: 0, shield: 0,
            recovery: 0, resource: null, potion: action.type === "potion",
            momentumGain: 0, keenEnhancement: 100,
        };
        const result = (): NewBattleResult => {
            this.validateState(setup, state);
            return { ok: true, state, events, preview };
        };
        if (action.type === "potion") {
            if (state.potionUsed) return reject("本回合药品机会已使用");
            const slot = state.pouch.findIndex(row => row?.itemUid === action.itemUid);
            const potion = setup.potions.find(row => row.itemId === state.pouch[slot]?.itemId);
            if (!potion || slot < 0) return reject("药品不在斗法匣或已消耗");
            const max = potion.resource === "hp" ? state.player.maxHp : state.player.maxMp;
            const before = state.player[potion.resource];
            if (before >= max) return reject(potion.resource === "hp" ? "生命已满" : "灵力已满");
            const after = Math.min(max, before + potion.amount);
            state.player[potion.resource] = after; state.pouch[slot] = null;
            state.potionUsed = true; state.revision++;
            preview.name = potion.name; preview.resource = potion.resource; preview.recovery = after - before;
            events.push({ type: "action", name: potion.name },
                { type: "potion", itemUid: action.itemUid, itemId: potion.itemId, slot },
                { type: "resource", resource: potion.resource, before, after });
            return result();
        }
        const { attack, defense } = this.attributes(setup, snapshot);
        const level = active?.level || 0, sword = state.sword;
        const hasSword = setup.build.schools.includes("sword");
        const passive = (kind: NewSwordPassive) => hasSword
            ? setup.passives.find(row => row.kind === kind && setup.build.passiveIds.includes(row.id)) : undefined;
        const trigger = (kind: NewSwordPassive): number => {
            const row = passive(kind);
            if (row) events.push({ type: "passive", id: row.id, name: row.name });
            return row?.value || 0;
        };
        const shield = (amount: number, source: string) => {
            if (amount <= 0) return;
            state.player.block += amount; preview.shield += amount;
            events.push({ type: "shield", target: "player", amount, source });
        };
        const clear = (target: "player" | "enemy") => {
            if (state[target].block) events.push({ type: "shield_cleared", target, amount: state[target].block });
            state[target].block = 0;
        };
        const finish = (phase: "victory" | "defeat") => {
            state.phase = phase; clear("player"); clear("enemy");
            state.sword = { momentum: 0, keen: false, enhancement: 100, firstBasicUsed: false,
                xifeng: false, previousAttack: null, mark: null };
            events.push({ type: "ended", result: phase });
        };
        const damagingSkill = !!skill && skill.kind !== "ningfeng";
        let broke = false;
        const breakShield = (before: number) => {
            if (damagingSkill && !broke && before > 0 && state.enemy.block === 0 && state.enemy.hp > 0 && passive("bengjia")) {
                broke = true; shield(this.scale(defense, trigger("bengjia")), "崩甲");
            }
        };
        const damage = (target: "player" | "enemy", amount: number, part: NewDamagePart, canBreak = false) => {
            const unit = state[target], before = unit.block;
            const absorbed = Math.min(before, amount), hpLoss = Math.min(unit.hp, amount - absorbed);
            unit.block -= absorbed; unit.hp -= hpLoss;
            events.push({ type: "damage", part, target, amount, absorbed, hpLoss });
            if (target === "enemy") preview.enemyHpLoss += hpLoss; else preview.playerHpLoss += hpLoss;
            if (unit.hp === 0) { finish(target === "enemy" ? "victory" : "defeat"); return true; }
            if (canBreak) breakShield(before);
            return false;
        };
        events.push({ type: "action", name: preview.name });
        state.revision++; state.mainActions++;
        preview.mpCost = skill?.mpCost || 0;
        if (preview.mpCost) {
            const before = state.player.mp;
            state.player.mp -= preview.mpCost;
            events.push({ type: "resource", resource: "mp", before, after: state.player.mp });
        }
        if (state.weapon && state.weapon.durability > 0) {
            const before = state.weapon.durability--;
            preview.durabilityCost = 1; events.push({ type: "durability", before, after: state.weapon.durability });
        }
        const cashKeen = hasSword && damagingSkill && skill!.school === "sword" && sword.keen;
        const keenDamage = cashKeen ? this.scale(setup.player.baseAttack, 50, sword.enhancement) : 0;
        if (cashKeen) {
            sword.keen = false; sword.momentum = 0; sword.enhancement = 100;
            events.push({ type: "keen", active: false, amount: keenDamage });
        }
        if (skill?.shredPercent) {
            const before = state.enemy.block;
            preview.shred = Math.min(before, this.scale(attack, skill.shredPercent, this.sub[level]));
            state.enemy.block -= preview.shred; breakShield(before);
        }
        preview.body = action.type === "basic" ? attack : skill
            ? this.scale(attack, skill.damagePercent,
                skill.kind === "dianxing" ? this.point[level] : skill.kind === "liuhen" ? this.sub[level] : this.main[level]) : 0;
        if (preview.body && damage("enemy", preview.body, "body", true)) return result();
        if (action.type === "guard") shield(this.scale(defense, 150), "防御");
        if (skill?.shieldPercent) shield(this.scale(defense, skill.shieldPercent, this.sub[level]), skill.name);
        if (cashKeen) {
            preview.keen = keenDamage;
            if (damage("enemy", keenDamage, "keen", true)) return result();
            if (passive("lianmang")) shield(this.scale(defense, trigger("lianmang")), "敛芒");
            if (passive("xifeng")) { trigger("xifeng"); sword.xifeng = true; }
        }
        if (damagingSkill && sword.previousAttack !== null && sword.previousAttack !== skill!.id && passive("difeng")) {
            preview.difeng = this.scale(setup.player.baseAttack, trigger("difeng"));
            if (damage("enemy", preview.difeng, "difeng")) return result();
        }
        const intent = setup.enemy.intents[state.enemy.intentIndex];
        if (damagingSkill && skill!.school === "sword" && intent.charging && passive("guanxi")) {
            preview.guanxi = this.scale(setup.player.baseAttack, trigger("guanxi"));
            if (damage("enemy", preview.guanxi, "guanxi")) return result();
        }
        if (hasSword) {
            let gain = action.type === "basic" || action.type === "guard" ? 1 : 0;
            if (action.type === "basic") {
                if (!sword.firstBasicUsed && passive("chuzhao")) gain += trigger("chuzhao");
                sword.firstBasicUsed = true;
                if (sword.xifeng) { gain += trigger("xifeng"); sword.xifeng = false; }
            }
            if (skill?.kind === "ningfeng") {
                gain = level >= 3 ? 3 : 2;
                sword.enhancement = Math.max(sword.enhancement, this.enhancement[level]);
                preview.keenEnhancement = sword.enhancement;
            }
            if (gain && sword.momentum < 3) {
                const before = sword.momentum;
                sword.momentum = Math.min(3, before + gain);
                preview.momentumGain = sword.momentum - before;
                events.push({ type: "momentum", before, after: sword.momentum });
                if (sword.momentum === 3) {
                    sword.keen = true;
                    events.push({ type: "keen", active: true, amount: this.scale(setup.player.baseAttack, 50, sword.enhancement) });
                }
            }
        }
        if (skill?.markPercent) {
            preview.mark = this.scale(attack, skill.markPercent, this.main[level]); preview.markTicks = 2;
            sword.mark = { damage: preview.mark, ticks: 2 }; events.push({ type: "mark", ...sword.mark });
        }
        sword.previousAttack = damagingSkill ? skill!.id : null;
        clear("enemy");
        events.push({ type: "intent", id: intent.id, name: intent.name });
        if (intent.damage && damage("player", intent.damage, "enemy")) return result();
        if (intent.block) {
            state.enemy.block += intent.block;
            events.push({ type: "shield", target: "enemy", amount: intent.block, source: intent.name });
        }
        if (sword.mark) {
            const mark = sword.mark;
            if (damage("enemy", mark.damage, "mark")) return result();
            mark.ticks--; events.push({ type: "mark", damage: mark.damage, ticks: mark.ticks });
            if (!mark.ticks) sword.mark = null;
        }
        clear("player");
        state.enemy.intentIndex = (state.enemy.intentIndex + 1) % setup.enemy.intents.length;
        state.round++; state.potionUsed = false; events.push({ type: "round", round: state.round });
        return result();
    }
}
