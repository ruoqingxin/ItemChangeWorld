import type { BattleAction, BattleCarry, BattleEvent, BattlePreview, BattleResult, BattleSetup, BattleState } from "../types/BattleTypes";
import { QingmingRules as R } from "./QingmingRules";
import { QingmingConfig as C } from "./QingmingConfig";
import { GuzongEnemyRules as E } from "./GuzongEnemyRules";


export class QingmingBattleAdapter {
    static start(setup: BattleSetup, battleId: string, carry: BattleCarry | undefined,
        attributes: { attack: number; defense: number }): BattleState {
        const q = setup.qingming;
        const combat = R.start({
            player: { hp: setup.player.maxHp, mp: setup.player.maxMp, ...attributes },
            enemy: { hp: setup.enemy.maxHp, mp: q.enemyMp, attack: q.enemyAttack, defense: q.enemyDefense },
            seed: q.seed, battles: 1, style: "guzong", pressure: "relaxed", enemyId: q.enemyId,
            healPotions: 0, manaPotions: 0,
        });
        combat.enemy.hp = combat.enemy.maxHp = setup.enemy.maxHp;
        combat.enemy.attack = q.enemyAttack;
        combat.player.hp = carry?.hp ?? setup.player.maxHp;
        combat.player.mp = carry?.mp ?? setup.player.maxMp;
        combat.fightStart = { hp: combat.player.hp, mp: combat.player.mp };
        Object.assign(combat,R.clone(q.loadout));
        combat.logs = [`[回1] ${E.title(combat)}；生命${setup.enemy.maxHp}，攻击${q.enemyAttack}`];
        const state: BattleState = {
            version: 1, battleId, phase: "player_input", revision: 0, round: 1, mainActions: 0,
            player: { hp: 0, mp: 0, maxHp: setup.player.maxHp, maxMp: setup.player.maxMp, block: 0 },
            enemy: { hp: 0, maxHp: setup.enemy.maxHp, block: 0 },
            weapon: R.clone(carry ? carry.weapon : setup.weapon), pouch: R.clone(carry?.pouch || [null,null,null,null,null]),
            potionUsed: false, qingming: combat,
        };
        this.sync(state);
        this.validateState(setup,state);
        return state;
    }
    private static sync(s: BattleState): void {
        const q = s.qingming;
        s.player = { hp: q.player.hp, mp: q.player.mp, maxHp: q.player.maxHp, maxMp: q.player.maxMp, block: q.player.shield };
        s.enemy = { hp: q.enemy.hp, maxHp: q.enemy.maxHp, block: q.enemy.shield };
        s.phase = q.phase === "fighting" ? "player_input" : q.phase === "complete" ? "victory" : "defeat";
        s.round = q.round; s.potionUsed = q.potionUsed; s.revision = q.revision;
    }
    static validateSetup(setup: BattleSetup): void {
        const q = setup.qingming;
        if (!q || !E.enemies[q.enemyId] || E.enemies[q.enemyId].name !== setup.enemy.name ||
            !Number.isInteger(q.seed) || q.seed < 1 || q.seed > 2147483646 ||
            ![q.enemyMp,q.enemyAttack,q.enemyDefense].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 1000000) ||
            !q.loadout || q.loadout.offers.length || Object.keys(q.loadout.offerRoles).length ||
            q.loadout.acquired.some(k => !C.items[k]))
            throw new Error("青冥战斗配置无效");
        R.validateLoadout(q.loadout);
    }
    static validateState(setup: BattleSetup, s: BattleState): void {
        const q = s?.qingming;
        if (!q) throw new Error("青冥战斗快照缺失");
        R.validateState(q);
        R.validateLoadout(q);
        const phase = q.phase === "fighting" ? "player_input" : q.phase === "complete" ? "victory" : "defeat";
        if (s.version !== 1 || !s.battleId || s.phase !== phase || !["fighting","complete","defeat"].includes(q.phase) ||
            s.revision !== q.revision || s.round !== q.round || s.mainActions !== q.totals.actions ||
            s.potionUsed !== q.potionUsed || s.player.hp !== q.player.hp || s.player.mp !== q.player.mp ||
            s.player.block !== q.player.shield || s.enemy.hp !== q.enemy.hp || s.enemy.block !== q.enemy.shield ||
            s.player.maxHp !== setup.player.maxHp || s.player.maxMp !== setup.player.maxMp ||
            q.player.maxHp !== setup.player.maxHp || q.player.maxMp !== setup.player.maxMp ||
            q.enemy.maxHp !== setup.enemy.maxHp || s.enemy.maxHp !== setup.enemy.maxHp ||
            q.foe.id !== setup.qingming.enemyId ||
            JSON.stringify(R.build(q)) !== JSON.stringify(R.build(setup.qingming.loadout)) ||
            !Array.isArray(s.pouch) || s.pouch.length !== 5 ||
            new Set(s.pouch.filter(Boolean).map(p => p.itemUid)).size !== s.pouch.filter(Boolean).length ||
            s.pouch.some(p => p && (!p.itemUid || !setup.potions.some(t => t.itemId === p.itemId))))
            throw new Error("青冥战斗与资源快照不一致");
        if (s.weapon ? !setup.weapon || s.weapon.id !== setup.weapon.id ||
            s.weapon.attack !== setup.weapon.attack || s.weapon.defense !== setup.weapon.defense ||
            s.weapon.maxDurability !== setup.weapon.maxDurability ||
            !Number.isInteger(s.weapon.durability) || s.weapon.durability < 0 ||
            s.weapon.durability > s.weapon.maxDurability : setup.weapon !== null)
            throw new Error("青冥武器快照无效");
    }
    static resolve(setup: BattleSetup, snapshot: BattleState, action: BattleAction,
        attributes: { attack: number; defense: number }): BattleResult {
        const reject = (reason: string): BattleResult =>
            ({ ok: false, state: R.clone(snapshot), events: [], preview: null, reason });
        try {
            this.validateSetup(setup); this.validateState(setup,snapshot);
            if (snapshot.phase !== "player_input") throw new Error("战斗已结束");
            const s = R.clone(snapshot), old = s.qingming, events: BattleEvent[] = [];
            const preview: BattlePreview = {
                token: {battleId:s.battleId,revision:s.revision}, name: "", mpCost: 0, durabilityCost: 0, body: 0,
                enemyHpLoss: 0, playerHpLoss: 0, shield: 0, recovery: 0, resource: null, potion: false,
            };
            if (action?.type === "potion") {
                if (s.potionUsed) throw new Error("本回合药品机会已使用");
                const slot = s.pouch.findIndex(p => p?.itemUid === action.itemUid);
                const potion = setup.potions.find(p => p.itemId === s.pouch[slot]?.itemId);
                if (slot < 0 || !potion) throw new Error("药品不在斗法匣或已消耗");
                const key = potion.resource, actor = old.player, max = key === "hp" ? actor.maxHp : actor.maxMp;
                const gain = Math.min(potion.amount,max-actor[key]);
                if (gain <= 0) throw new Error("当前资源已满");
                preview.name = potion.name; preview.potion = true; preview.resource = key; preview.recovery = gain;
                events.push({type:"potion",itemUid:action.itemUid,itemId:potion.itemId,slot},
                    {type:"resource",resource:key,before:actor[key],after:actor[key]+gain});
                actor[key] += gain; old.potionUsed = true; old.revision++;
                const count = key === "hp" ? "healUsed" : "manaUsed";
                old.fight[count]++; old.totals[count]++;
                s.pouch[slot] = null;
                old.logs.push(`[回${old.round}] ${potion.name} +${gain}`);
                if(old.logs.length>400)old.logs.shift();
            } else {
                const move = action?.type === "qingming" ? action.move :
                    action?.type === "basic" ? "basic" : action?.type === "guard" ? "guard" : null;
                if (!["basic","guard","edge","wind","guide","fall","end"].includes(move))
                    throw new Error("本战斗仅可使用青冥四招及通用行动");
                old.player.attack = attributes.attack; old.player.defense = attributes.defense;
                const result = R.resolve(old,{move,enemyAction:action.type==="qingming"?action.enemyAction:undefined});
                if (!result.ok) throw new Error(result.reason);
                s.qingming = result.state;
                preview.name = C.moves[move];
                preview.mpCost = result.state.totals.mpSpent-old.totals.mpSpent;
                preview.body = result.state.totals.damage-old.totals.damage;
                preview.shield = result.state.totals.shield-old.totals.shield;
                preview.playerHpLoss = Math.max(0,snapshot.player.hp-result.state.player.hp);
                preview.enemyHpLoss = Math.max(0,snapshot.enemy.hp-result.state.enemy.hp);
                if (move !== "end") {
                    s.mainActions++;
                    if (s.weapon?.durability > 0) {
                        const before = s.weapon.durability;
                        s.weapon.durability--; preview.durabilityCost = 1;
                        events.push({type:"durability",before,after:s.weapon.durability});
                    }
                }
                if (preview.body) events.push({type:"damage",target:"enemy",part:"body",amount:preview.body,absorbed:0,hpLoss:preview.enemyHpLoss});
                if (preview.playerHpLoss) events.push({type:"damage",target:"player",part:"enemy",
                    amount:preview.playerHpLoss,absorbed:0,hpLoss:preview.playerHpLoss});
            }
            this.sync(s);
            if (s.phase !== "player_input") events.push({type:"ended",result:s.phase});
            events.unshift({type:"action",name:preview.name});
            this.validateState(setup,s);
            return {ok:true,state:s,events,preview};
        } catch (error) { return reject((error as Error).message); }
    }
}
