/**
 * 怪物配置
 * 用于刷怪、战斗、经验与掉落关联
 */

export interface MonsterConfig {
    id: number;
    name: string;
    nameKey?: string;
    /** 资源路径（精灵/动画） */
    res: string;
    /** 生命值 */
    hp: number;
    /** 攻击力 */
    atk: number;
    /** 防御（可选，用于伤害公式） */
    def?: number;
    /** 击杀获得经验 */
    exp: number;
    /** 击杀获得金币（基础） */
    gold?: number;
    /** 关联的掉落表 ID，在 DropConfig 中配置 */
    dropTableId: number;
    /** 移动速度等扩展 */
    moveSpeed?: number;
}

export type MonsterConfigTable = Record<number, MonsterConfig>;

/** 示例怪物配置 */
export const DefaultMonsterConfigTable: MonsterConfigTable = {
    10001: {
        id: 10001,
        name: "野狼",
        res: "monster/wolf",
        hp: 30,
        atk: 5,
        def: 1,
        exp: 10,
        gold: 3,
        dropTableId: 1,
        moveSpeed: 80
    },
    10002: {
        id: 10002,
        name: "史莱姆",
        res: "monster/slime",
        hp: 15,
        atk: 2,
        def: 0,
        exp: 5,
        gold: 1,
        dropTableId: 2,
        moveSpeed: 40
    }
};
