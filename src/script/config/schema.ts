

import ByteBuf from './bright/serialization/ByteBuf'


export enum EDamageKind {
    /**
     * 物理
     */
    physical = 1,
    /**
     * 魔法
     */
    magic = 2,
    /**
     * 混合
     */
    mixed = 3,
    /**
     * 辅助
     */
    support = 4,
}

export enum EEnemyTier {
    /**
     * 普通
     */
    normal = 1,
    /**
     * 精英
     */
    elite = 2,
    /**
     * 首领
     */
    boss = 3,
}

export enum EEquipmentSlot {
    /**
     * 武器
     */
    weapon = 1,
    /**
     * 防具
     */
    armor = 2,
    /**
     * 饰品
     */
    accessory = 3,
}

export enum EItemKind {
    /**
     * 武器
     */
    weapon = 1,
    /**
     * 生命药
     */
    hp = 2,
    /**
     * 灵力药
     */
    mp = 3,
    /**
     * 双恢复药
     */
    mixed = 4,
    /**
     * 护盾药
     */
    shield = 5,
    /**
     * 修理补给
     */
    repair = 6,
    /**
     * 体力补给
     */
    stamina = 7,
    /**
     * 完整功法
     */
    book = 8,
    /**
     * 材料与收藏品
     */
    material = 9,
    /**
     * 纳虚器
     */
    container = 10,
    /**
     * 防具
     */
    armor = 11,
    /**
     * 饰品
     */
    accessory = 12,
}

export enum ELootFamily {
    /**
     * 生命药
     */
    hp = 1,
    /**
     * 灵力药
     */
    mp = 2,
    /**
     * 双恢复药
     */
    mixed = 3,
    /**
     * 护盾药
     */
    shield = 4,
    /**
     * 修理补给
     */
    repair = 5,
    /**
     * 体力补给
     */
    stamina = 6,
    /**
     * 草药
     */
    herb = 7,
    /**
     * 矿材
     */
    ore = 8,
    /**
     * 兽材
     */
    beast = 9,
    /**
     * 收藏品
     */
    relic = 10,
    /**
     * 完整功法
     */
    book = 11,
    /**
     * 纳虚器
     */
    container = 12,
    /**
     * 武器
     */
    weapon = 13,
    /**
     * 防具
     */
    armor = 14,
    /**
     * 饰品
     */
    accessory = 15,
}

export enum EMapNodeKind {
    /**
     * 出生
     */
    start = 1,
    /**
     * 普通战斗
     */
    normal = 2,
    /**
     * 精英战斗
     */
    elite = 3,
    /**
     * 首领战斗
     */
    boss = 4,
    /**
     * 搜索
     */
    search = 5,
    /**
     * 借法
     */
    borrow = 6,
    /**
     * 悟道
     */
    insight = 7,
    /**
     * 中转
     */
    transit = 8,
    /**
     * 恢复
     */
    recovery = 9,
    /**
     * 撤离
     */
    extract = 10,
}

export enum EPotionResource {
    /**
     * 生命
     */
    hp = 1,
    /**
     * 灵力
     */
    mp = 2,
    /**
     * 生命与灵力
     */
    mixed = 3,
    /**
     * 护盾
     */
    shield = 4,
}

export enum EQuality {
    /**
     * 无
     */
    none = 0,
    /**
     * 普通
     */
    normal = 1,
    /**
     * 优秀
     */
    excellent = 2,
    /**
     * 精良
     */
    fine = 3,
    /**
     * 稀有
     */
    rare = 4,
    /**
     * 史诗
     */
    epic = 5,
    /**
     * 传说
     */
    legendary = 6,
}

export enum EStat {
    /**
     * 生命
     */
    hp = 1,
    /**
     * 法力
     */
    mp = 2,
    /**
     * 物理攻击
     */
    a = 3,
    /**
     * 精神力
     */
    s = 4,
    /**
     * 护甲
     */
    armor = 5,
    /**
     * 速度
     */
    speed = 6,
}

export class Ibattle_parameterConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.code = _buf_.ReadString()
        this.value = _buf_.ReadFloat()
    }

    /**
     * 固定正整数编号
     */
    readonly id: number
    /**
     * 独立程序行为码
     */
    readonly code: string
    /**
     * 规则参数；布尔值0关闭1开启，数组索引从0开始
     */
    readonly value: number


}

export class Ibattle_ruleConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.player_hp = _buf_.ReadInt()
        this.player_mp = _buf_.ReadInt()
        this.base_attack = _buf_.ReadInt()
        this.base_spirit = _buf_.ReadInt()
        this.base_defense = _buf_.ReadInt()
        this.base_speed = _buf_.ReadInt()
        this.active_slots = _buf_.ReadInt()
        this.version = _buf_.ReadInt()
    }

    /**
     * 固定正整数编号
     */
    readonly id: number
    /**
     * 角色基础生命上限
     */
    readonly player_hp: number
    /**
     * 角色基础法力上限
     */
    readonly player_mp: number
    /**
     * 角色基础物理攻击
     */
    readonly base_attack: number
    /**
     * 角色基础精神力
     */
    readonly base_spirit: number
    /**
     * 角色基础护甲
     */
    readonly base_defense: number
    /**
     * 角色基础速度
     */
    readonly base_speed: number
    /**
     * 主动技能位数量
     */
    readonly active_slots: number
    /**
     * 战斗规则版本号
     */
    readonly version: number


}

export class Ibattle_start_skillConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.skill_id = _buf_.ReadInt()
    }

    /**
     * 固定正整数编号
     */
    readonly id: number
    /**
     * 关联技能编号
     */
    readonly skill_id: number


}

export class IcontainerConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.width = _buf_.ReadInt()
        this.height = _buf_.ReadInt()
        this.weight_limit = _buf_.ReadInt()
    }

    /**
     * 关联物品编号
     */
    readonly id: number
    /**
     * 内部容量宽
     */
    readonly width: number
    /**
     * 内部容量高
     */
    readonly height: number
    /**
     * 装备后提供的背包承重
     */
    readonly weight_limit: number


}

export class Ienemy_actionConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.enemy_id = _buf_.ReadInt()
        this.order = _buf_.ReadInt()
        this.code = _buf_.ReadString()
    }

    /**
     * 固定正整数编号
     */
    readonly id: number
    /**
     * 关联敌人编号
     */
    readonly enemy_id: number
    /**
     * 从1开始循环执行
     */
    readonly order: number
    /**
     * 独立程序行为码
     */
    readonly code: string


}

export class IenemyConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.code = _buf_.ReadString()
        this.name = _buf_.ReadString()
        this.tier = _buf_.ReadInt()
        this.hp = _buf_.ReadInt()
        this.mp = _buf_.ReadInt()
        this.attack = _buf_.ReadInt()
        this.spirit = _buf_.ReadInt()
        this.armor = _buf_.ReadInt()
        this.speed = _buf_.ReadInt()
        this.heal_uses = _buf_.ReadInt()
        this.ward_uses = _buf_.ReadInt()
        this.purify_uses = _buf_.ReadInt()
    }

    /**
     * 固定正整数编号
     */
    readonly id: number
    /**
     * 独立程序行为码
     */
    readonly code: string
    /**
     * 中文名称
     */
    readonly name: string
    /**
     * 敌人级别
     */
    readonly tier: EEnemyTier
    /**
     * 生命上限
     */
    readonly hp: number
    /**
     * 法力上限
     */
    readonly mp: number
    /**
     * 物理攻击
     */
    readonly attack: number
    /**
     * 精神力
     */
    readonly spirit: number
    /**
     * 护甲
     */
    readonly armor: number
    /**
     * 速度
     */
    readonly speed: number
    /**
     * 每战治疗次数上限
     */
    readonly heal_uses: number
    /**
     * 每战护盾次数上限
     */
    readonly ward_uses: number
    /**
     * 每战净化次数上限
     */
    readonly purify_uses: number


}

export class Iequipment_bandConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.stat = _buf_.ReadInt()
        this.band = _buf_.ReadInt()
        this.main_min = _buf_.ReadInt()
        this.main_max = _buf_.ReadInt()
        this.sub_min = _buf_.ReadInt()
        this.sub_max = _buf_.ReadInt()
    }

    /**
     * 固定正整数编号
     */
    readonly id: number
    /**
     * 属性种类
     */
    readonly stat: EStat
    /**
     * 属性档位；1最低、6最高
     */
    readonly band: number
    /**
     * 主属性数值下限
     */
    readonly main_min: number
    /**
     * 主属性数值上限
     */
    readonly main_max: number
    /**
     * 副属性数值下限
     */
    readonly sub_min: number
    /**
     * 副属性数值上限
     */
    readonly sub_max: number


}

export class Iequipment_baseConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.code = _buf_.ReadString()
        this.name = _buf_.ReadString()
        this.slot = _buf_.ReadInt()
        this.main_stat = _buf_.ReadInt()
        this.durability = _buf_.ReadInt()
    }

    /**
     * 固定正整数编号
     */
    readonly id: number
    /**
     * 独立程序行为码
     */
    readonly code: string
    /**
     * 中文名称
     */
    readonly name: string
    /**
     * 装备部位
     */
    readonly slot: EEquipmentSlot
    /**
     * 主属性种类
     */
    readonly main_stat: EStat
    /**
     * 底材基础耐久上限
     */
    readonly durability: number


}

export class Iequipment_qualityConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.quality = _buf_.ReadInt()
        this.band_min = _buf_.ReadInt()
        this.band_max = _buf_.ReadInt()
        this.durability_bonus = _buf_.ReadInt()
        this.repair_price = _buf_.ReadInt()
    }

    /**
     * 固定正整数编号
     */
    readonly id: number
    /**
     * 装备品质
     */
    readonly quality: EQuality
    /**
     * 允许属性档位下限
     */
    readonly band_min: number
    /**
     * 允许属性档位上限
     */
    readonly band_max: number
    /**
     * 品质耐久加成
     */
    readonly durability_bonus: number
    /**
     * 每恢复1耐久消耗愿力
     */
    readonly repair_price: number


}

export class Iequipment_trait_rollConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.trait_id = _buf_.ReadInt()
        this.quality = _buf_.ReadInt()
        this.p_min = _buf_.ReadInt()
        this.p_max = _buf_.ReadInt()
        this.n_min = _buf_.ReadInt()
        this.n_max = _buf_.ReadInt()
    }

    /**
     * 固定正整数编号
     */
    readonly id: number
    /**
     * 关联装备特性编号
     */
    readonly trait_id: number
    /**
     * 装备品质
     */
    readonly quality: EQuality
    /**
     * 收益参数下限
     */
    readonly p_min: number
    /**
     * 收益参数上限
     */
    readonly p_max: number
    /**
     * 触发门槛下限；0表示无门槛
     */
    readonly n_min: number
    /**
     * 触发门槛上限；0表示无门槛
     */
    readonly n_max: number


}

export class Iequipment_traitConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.code = _buf_.ReadString()
        this.name = _buf_.ReadString()
        this.slot = _buf_.ReadInt()
        this.description = _buf_.ReadString()
    }

    /**
     * 固定正整数编号
     */
    readonly id: number
    /**
     * 独立程序行为码
     */
    readonly code: string
    /**
     * 中文名称
     */
    readonly name: string
    /**
     * 适用装备部位
     */
    readonly slot: EEquipmentSlot
    /**
     * 特性效果说明；收益参数与触发门槛见特性品质参数表
     */
    readonly description: string


}

export class IequipmentConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.base_id = _buf_.ReadInt()
    }

    /**
     * 关联物品编号
     */
    readonly id: number
    /**
     * 关联装备底材编号
     */
    readonly base_id: number


}

export class Iinventory_ruleConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.battle_width = _buf_.ReadInt()
        this.battle_height = _buf_.ReadInt()
        this.safe_width = _buf_.ReadInt()
        this.safe_height = _buf_.ReadInt()
        this.base_weight = _buf_.ReadInt()
        this.source_pages = _buf_.ReadInt()
    }

    /**
     * 固定规则编号
     */
    readonly id: number
    /**
     * 斗法宽
     */
    readonly battle_width: number
    /**
     * 斗法高
     */
    readonly battle_height: number
    /**
     * 归真宽
     */
    readonly safe_width: number
    /**
     * 归真高
     */
    readonly safe_height: number
    /**
     * 角色基础承重
     */
    readonly base_weight: number
    /**
     * 局内交互来源页数
     */
    readonly source_pages: number


}

export class Iinventory_startConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.item_id = _buf_.ReadInt()
        this.count = _buf_.ReadInt()
        this.durability = _buf_.ReadInt()
    }

    /**
     * 固定起始条目编号
     */
    readonly id: number
    /**
     * 关联物品编号
     */
    readonly item_id: number
    /**
     * 起始件数
     */
    readonly count: number
    /**
     * 武器初始耐久，其余为 0
     */
    readonly durability: number


}

export class IitemConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.name = _buf_.ReadString()
        this.kind = _buf_.ReadInt()
        this.width = _buf_.ReadInt()
        this.height = _buf_.ReadInt()
        this.rotate = _buf_.ReadInt()
        this.battle = _buf_.ReadInt()
        this.safe = _buf_.ReadInt()
        this.stack = _buf_.ReadInt()
        this.icon = _buf_.ReadString()
        this.quality = _buf_.ReadInt()
        this.weight = _buf_.ReadInt()
        this.recycle_price = _buf_.ReadInt()
        this.enabled = _buf_.ReadInt()
    }

    /**
     * 固定物品编号；1至100预留货币
     */
    readonly id: number
    /**
     * 名称
     */
    readonly name: string
    /**
     * 类别
     */
    readonly kind: EItemKind
    /**
     * 宽格
     */
    readonly width: number
    /**
     * 高格
     */
    readonly height: number
    /**
     * 可旋转
     */
    readonly rotate: number
    /**
     * 可入斗法
     */
    readonly battle: number
    /**
     * 可入归真
     */
    readonly safe: number
    /**
     * 每份数量
     */
    readonly stack: number
    /**
     * 图片键
     */
    readonly icon: string
    /**
     * 品质
     */
    readonly quality: EQuality
    /**
     * 本体重量
     */
    readonly weight: number
    /**
     * 回收基价（愿力）
     */
    readonly recycle_price: number
    /**
     * 已投放 1，待投放 0
     */
    readonly enabled: number


}

export class Imap_nodeConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.key = _buf_.ReadString()
        this.kind = _buf_.ReadInt()
        this.name = _buf_.ReadString()
        this.pool_id = _buf_.ReadInt()
        this.main_order = _buf_.ReadInt()
        this.x = _buf_.ReadFloat()
        this.y = _buf_.ReadFloat()
    }

    /**
     * 固定节点编号
     */
    readonly id: number
    /**
     * 语义键
     */
    readonly key: string
    /**
     * 类别
     */
    readonly kind: EMapNodeKind
    /**
     * 功能名
     */
    readonly name: string
    /**
     * 掉落池编号；0 表示无
     */
    readonly pool_id: number
    /**
     * 主序号
     */
    readonly main_order: number
    /**
     * 横坐标
     */
    readonly x: number
    /**
     * 纵坐标
     */
    readonly y: number


}

export class Imap_pool_categoryConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.pool_id = _buf_.ReadInt()
        this.family = _buf_.ReadInt()
        this.weight = _buf_.ReadInt()
    }

    /**
     * 固定类别权重编号
     */
    readonly id: number
    /**
     * 关联掉落池编号
     */
    readonly pool_id: number
    /**
     * 掉落类别
     */
    readonly family: ELootFamily
    /**
     * 类别权重
     */
    readonly weight: number


}

export class Imap_pool_qualityConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.pool_id = _buf_.ReadInt()
        this.quality = _buf_.ReadInt()
        this.weight = _buf_.ReadInt()
    }

    /**
     * 固定品质权重编号
     */
    readonly id: number
    /**
     * 关联掉落池编号
     */
    readonly pool_id: number
    /**
     * 物品品质
     */
    readonly quality: EQuality
    /**
     * 品质权重
     */
    readonly weight: number


}

export class Imap_pool_weaponConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.dur_min = _buf_.ReadInt()
        this.dur_max = _buf_.ReadInt()
    }

    /**
     * 关联掉落池编号
     */
    readonly id: number
    /**
     * 武器初始耐久下限
     */
    readonly dur_min: number
    /**
     * 武器初始耐久上限
     */
    readonly dur_max: number


}

export class Imap_poolConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.code = _buf_.ReadString()
        this.min_count = _buf_.ReadInt()
        this.max_count = _buf_.ReadInt()
        this.min_weight = _buf_.ReadInt()
    }

    /**
     * 固定编号
     */
    readonly id: number
    /**
     * 来源标识
     */
    readonly code: string
    /**
     * 较少件数
     */
    readonly min_count: number
    /**
     * 较多件数
     */
    readonly max_count: number
    /**
     * 较少权重
     */
    readonly min_weight: number


}

export class Imap_ruleConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.map_version = _buf_.ReadString()
        this.limit_ms = _buf_.ReadInt()
        this.search_ms = _buf_.ReadInt()
        this.recovery_percent = _buf_.ReadInt()
        this.stamina_max = _buf_.ReadInt()
        this.move_cost = _buf_.ReadInt()
        this.normal_cost = _buf_.ReadInt()
        this.elite_cost = _buf_.ReadInt()
        this.boss_cost = _buf_.ReadInt()
        this.search_cost = _buf_.ReadInt()
        this.move_hp_percent = _buf_.ReadInt()
        this.search_hp_percent = _buf_.ReadInt()
        this.transit_min = _buf_.ReadInt()
        this.transit_max = _buf_.ReadInt()
        this.search_min = _buf_.ReadInt()
        this.search_max = _buf_.ReadInt()
        this.normal_min = _buf_.ReadInt()
        this.normal_max = _buf_.ReadInt()
        this.elite_min = _buf_.ReadInt()
        this.elite_max = _buf_.ReadInt()
        this.insight_min = _buf_.ReadInt()
        this.insight_max = _buf_.ReadInt()
        this.borrow_min = _buf_.ReadInt()
        this.borrow_max = _buf_.ReadInt()
    }

    /**
     * 固定规则编号
     */
    readonly id: number
    /**
     * 图版本
     */
    readonly map_version: string
    /**
     * 时限毫秒
     */
    readonly limit_ms: number
    /**
     * 每件毫秒
     */
    readonly search_ms: number
    /**
     * 恢复百分比
     */
    readonly recovery_percent: number
    /**
     * 体力上限
     */
    readonly stamina_max: number
    /**
     * 移动体力
     */
    readonly move_cost: number
    /**
     * 普通开战体力
     */
    readonly normal_cost: number
    /**
     * 精英开战体力
     */
    readonly elite_cost: number
    /**
     * 首领开战体力
     */
    readonly boss_cost: number
    /**
     * 首次来源搜索体力
     */
    readonly search_cost: number
    /**
     * 移动不足扣最大生命百分比
     */
    readonly move_hp_percent: number
    /**
     * 搜索不足扣最大生命百分比
     */
    readonly search_hp_percent: number
    /**
     * 中转点下限
     */
    readonly transit_min: number
    /**
     * 中转点上限
     */
    readonly transit_max: number
    /**
     * 独立搜索下限
     */
    readonly search_min: number
    /**
     * 独立搜索上限
     */
    readonly search_max: number
    /**
     * 普通战斗节点数量下限
     */
    readonly normal_min: number
    /**
     * 普通战斗节点数量上限
     */
    readonly normal_max: number
    /**
     * 精英战斗节点数量下限
     */
    readonly elite_min: number
    /**
     * 精英战斗节点数量上限
     */
    readonly elite_max: number
    /**
     * 悟道节点数量下限
     */
    readonly insight_min: number
    /**
     * 悟道节点数量上限
     */
    readonly insight_max: number
    /**
     * 借法节点数量下限
     */
    readonly borrow_min: number
    /**
     * 借法节点数量上限
     */
    readonly borrow_max: number


}

export class Imap_searchConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.icon = _buf_.ReadString()
        this.min_count = _buf_.ReadInt()
        this.max_count = _buf_.ReadInt()
        this.weight = _buf_.ReadInt()
    }

    /**
     * 关联地图节点编号
     */
    readonly id: number
    /**
     * 搜索点图片键
     */
    readonly icon: string
    /**
     * 本类搜索点下限
     */
    readonly min_count: number
    /**
     * 本类搜索点上限
     */
    readonly max_count: number
    /**
     * 余量抽取权重
     */
    readonly weight: number


}

export class Imap_variantConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.family = _buf_.ReadInt()
        this.item_id = _buf_.ReadInt()
        this.weight = _buf_.ReadInt()
    }

    /**
     * 固定掉落条目编号
     */
    readonly id: number
    /**
     * 类别
     */
    readonly family: ELootFamily
    /**
     * 引用物品表固定编号
     */
    readonly item_id: number
    /**
     * 权重
     */
    readonly weight: number


}

export class Imarket_goodsConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.item_id = _buf_.ReadInt()
        this.price = _buf_.ReadInt()
        this.limit_count = _buf_.ReadInt()
        this.enabled = _buf_.ReadInt()
    }

    /**
     * 固定商品条目编号
     */
    readonly id: number
    /**
     * 关联物品编号
     */
    readonly item_id: number
    /**
     * 售价（愿力）；0为零售价
     */
    readonly price: number
    /**
     * 每个商品限购件数
     */
    readonly limit_count: number
    /**
     * 上架开关：0下架，1上架
     */
    readonly enabled: number


}

export class Ipotion_itemConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.potion_id = _buf_.ReadInt()
    }

    /**
     * 关联物品编号
     */
    readonly id: number
    /**
     * 关联药效编号
     */
    readonly potion_id: number


}

export class IpotionConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.resource = _buf_.ReadInt()
        this.amount = _buf_.ReadInt()
        this.secondary_amount = _buf_.ReadInt()
    }

    /**
     * 固定药效编号
     */
    readonly id: number
    /**
     * 恢复资源
     */
    readonly resource: EPotionResource
    /**
     * 固定恢复量（点）
     */
    readonly amount: number
    /**
     * 双恢复的灵力恢复量
     */
    readonly secondary_amount: number


}

export class IrepairConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.amount = _buf_.ReadInt()
    }

    /**
     * 关联物品编号
     */
    readonly id: number
    /**
     * 修理量，-1 表示修满
     */
    readonly amount: number


}

export class Iskill_effectConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.skill_id = _buf_.ReadInt()
        this.code = _buf_.ReadString()
        this.value = _buf_.ReadFloat()
    }

    /**
     * 固定正整数编号
     */
    readonly id: number
    /**
     * 关联技能编号
     */
    readonly skill_id: number
    /**
     * 独立程序行为码
     */
    readonly code: string
    /**
     * 独立效果参数；比例使用小数
     */
    readonly value: number


}

export class IskillConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.code = _buf_.ReadString()
        this.name = _buf_.ReadString()
        this.mp_cost = _buf_.ReadInt()
        this.cooldown = _buf_.ReadInt()
        this.kind = _buf_.ReadInt()
        this.uses = _buf_.ReadInt()
        this.description = _buf_.ReadString()
    }

    /**
     * 固定正整数编号
     */
    readonly id: number
    /**
     * 独立程序行为码
     */
    readonly code: string
    /**
     * 中文名称
     */
    readonly name: string
    /**
     * 施放法力消耗
     */
    readonly mp_cost: number
    /**
     * 冷却回合数
     */
    readonly cooldown: number
    /**
     * 伤害类别
     */
    readonly kind: EDamageKind
    /**
     * 每战使用次数；0表示不限
     */
    readonly uses: number
    /**
     * 具体技能效果
     */
    readonly description: string


}

export class IstaminaConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.amount = _buf_.ReadInt()
    }

    /**
     * 关联物品编号
     */
    readonly id: number
    /**
     * 战外体力恢复量
     */
    readonly amount: number


}

export class battle_rule {
    private _dataMap: Map<number, Ibattle_ruleConfig>

    private _dataList: Ibattle_ruleConfig[]
    private _loaded:boolean=false;
    private _buf: ByteBuf;
    constructor(_buf_: ByteBuf) {
        this._buf = _buf_;
        this._loaded = false;
    }

    private load():void{
        if(this._loaded){
            return;
        }
        let _buf_ = this._buf;
        if(!_buf_){
            console.error("_buf_ null");
            return;
        }
        this._dataMap = new Map<number, Ibattle_ruleConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: Ibattle_ruleConfig
            _v = new Ibattle_ruleConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, Ibattle_ruleConfig> {this.load(); return this._dataMap; }

    getDataList(): Ibattle_ruleConfig[] { this.load();return this._dataList; }

    get(key: number): Ibattle_ruleConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

export class battle_parameter {
    private _dataMap: Map<number, Ibattle_parameterConfig>

    private _dataList: Ibattle_parameterConfig[]
    private _loaded:boolean=false;
    private _buf: ByteBuf;
    constructor(_buf_: ByteBuf) {
        this._buf = _buf_;
        this._loaded = false;
    }

    private load():void{
        if(this._loaded){
            return;
        }
        let _buf_ = this._buf;
        if(!_buf_){
            console.error("_buf_ null");
            return;
        }
        this._dataMap = new Map<number, Ibattle_parameterConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: Ibattle_parameterConfig
            _v = new Ibattle_parameterConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, Ibattle_parameterConfig> {this.load(); return this._dataMap; }

    getDataList(): Ibattle_parameterConfig[] { this.load();return this._dataList; }

    get(key: number): Ibattle_parameterConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

export class battle_start_skill {
    private _dataMap: Map<number, Ibattle_start_skillConfig>

    private _dataList: Ibattle_start_skillConfig[]
    private _loaded:boolean=false;
    private _buf: ByteBuf;
    constructor(_buf_: ByteBuf) {
        this._buf = _buf_;
        this._loaded = false;
    }

    private load():void{
        if(this._loaded){
            return;
        }
        let _buf_ = this._buf;
        if(!_buf_){
            console.error("_buf_ null");
            return;
        }
        this._dataMap = new Map<number, Ibattle_start_skillConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: Ibattle_start_skillConfig
            _v = new Ibattle_start_skillConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, Ibattle_start_skillConfig> {this.load(); return this._dataMap; }

    getDataList(): Ibattle_start_skillConfig[] { this.load();return this._dataList; }

    get(key: number): Ibattle_start_skillConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

export class skill {
    private _dataMap: Map<number, IskillConfig>

    private _dataList: IskillConfig[]
    private _loaded:boolean=false;
    private _buf: ByteBuf;
    constructor(_buf_: ByteBuf) {
        this._buf = _buf_;
        this._loaded = false;
    }

    private load():void{
        if(this._loaded){
            return;
        }
        let _buf_ = this._buf;
        if(!_buf_){
            console.error("_buf_ null");
            return;
        }
        this._dataMap = new Map<number, IskillConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: IskillConfig
            _v = new IskillConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, IskillConfig> {this.load(); return this._dataMap; }

    getDataList(): IskillConfig[] { this.load();return this._dataList; }

    get(key: number): IskillConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

export class skill_effect {
    private _dataMap: Map<number, Iskill_effectConfig>

    private _dataList: Iskill_effectConfig[]
    private _loaded:boolean=false;
    private _buf: ByteBuf;
    constructor(_buf_: ByteBuf) {
        this._buf = _buf_;
        this._loaded = false;
    }

    private load():void{
        if(this._loaded){
            return;
        }
        let _buf_ = this._buf;
        if(!_buf_){
            console.error("_buf_ null");
            return;
        }
        this._dataMap = new Map<number, Iskill_effectConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: Iskill_effectConfig
            _v = new Iskill_effectConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, Iskill_effectConfig> {this.load(); return this._dataMap; }

    getDataList(): Iskill_effectConfig[] { this.load();return this._dataList; }

    get(key: number): Iskill_effectConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

export class enemy {
    private _dataMap: Map<number, IenemyConfig>

    private _dataList: IenemyConfig[]
    private _loaded:boolean=false;
    private _buf: ByteBuf;
    constructor(_buf_: ByteBuf) {
        this._buf = _buf_;
        this._loaded = false;
    }

    private load():void{
        if(this._loaded){
            return;
        }
        let _buf_ = this._buf;
        if(!_buf_){
            console.error("_buf_ null");
            return;
        }
        this._dataMap = new Map<number, IenemyConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: IenemyConfig
            _v = new IenemyConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, IenemyConfig> {this.load(); return this._dataMap; }

    getDataList(): IenemyConfig[] { this.load();return this._dataList; }

    get(key: number): IenemyConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

export class enemy_action {
    private _dataMap: Map<number, Ienemy_actionConfig>

    private _dataList: Ienemy_actionConfig[]
    private _loaded:boolean=false;
    private _buf: ByteBuf;
    constructor(_buf_: ByteBuf) {
        this._buf = _buf_;
        this._loaded = false;
    }

    private load():void{
        if(this._loaded){
            return;
        }
        let _buf_ = this._buf;
        if(!_buf_){
            console.error("_buf_ null");
            return;
        }
        this._dataMap = new Map<number, Ienemy_actionConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: Ienemy_actionConfig
            _v = new Ienemy_actionConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, Ienemy_actionConfig> {this.load(); return this._dataMap; }

    getDataList(): Ienemy_actionConfig[] { this.load();return this._dataList; }

    get(key: number): Ienemy_actionConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

export class item {
    private _dataMap: Map<number, IitemConfig>

    private _dataList: IitemConfig[]
    private _loaded:boolean=false;
    private _buf: ByteBuf;
    constructor(_buf_: ByteBuf) {
        this._buf = _buf_;
        this._loaded = false;
    }

    private load():void{
        if(this._loaded){
            return;
        }
        let _buf_ = this._buf;
        if(!_buf_){
            console.error("_buf_ null");
            return;
        }
        this._dataMap = new Map<number, IitemConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: IitemConfig
            _v = new IitemConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, IitemConfig> {this.load(); return this._dataMap; }

    getDataList(): IitemConfig[] { this.load();return this._dataList; }

    get(key: number): IitemConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

export class equipment {
    private _dataMap: Map<number, IequipmentConfig>

    private _dataList: IequipmentConfig[]
    private _loaded:boolean=false;
    private _buf: ByteBuf;
    constructor(_buf_: ByteBuf) {
        this._buf = _buf_;
        this._loaded = false;
    }

    private load():void{
        if(this._loaded){
            return;
        }
        let _buf_ = this._buf;
        if(!_buf_){
            console.error("_buf_ null");
            return;
        }
        this._dataMap = new Map<number, IequipmentConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: IequipmentConfig
            _v = new IequipmentConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, IequipmentConfig> {this.load(); return this._dataMap; }

    getDataList(): IequipmentConfig[] { this.load();return this._dataList; }

    get(key: number): IequipmentConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

export class equipment_base {
    private _dataMap: Map<number, Iequipment_baseConfig>

    private _dataList: Iequipment_baseConfig[]
    private _loaded:boolean=false;
    private _buf: ByteBuf;
    constructor(_buf_: ByteBuf) {
        this._buf = _buf_;
        this._loaded = false;
    }

    private load():void{
        if(this._loaded){
            return;
        }
        let _buf_ = this._buf;
        if(!_buf_){
            console.error("_buf_ null");
            return;
        }
        this._dataMap = new Map<number, Iequipment_baseConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: Iequipment_baseConfig
            _v = new Iequipment_baseConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, Iequipment_baseConfig> {this.load(); return this._dataMap; }

    getDataList(): Iequipment_baseConfig[] { this.load();return this._dataList; }

    get(key: number): Iequipment_baseConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

export class equipment_band {
    private _dataMap: Map<number, Iequipment_bandConfig>

    private _dataList: Iequipment_bandConfig[]
    private _loaded:boolean=false;
    private _buf: ByteBuf;
    constructor(_buf_: ByteBuf) {
        this._buf = _buf_;
        this._loaded = false;
    }

    private load():void{
        if(this._loaded){
            return;
        }
        let _buf_ = this._buf;
        if(!_buf_){
            console.error("_buf_ null");
            return;
        }
        this._dataMap = new Map<number, Iequipment_bandConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: Iequipment_bandConfig
            _v = new Iequipment_bandConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, Iequipment_bandConfig> {this.load(); return this._dataMap; }

    getDataList(): Iequipment_bandConfig[] { this.load();return this._dataList; }

    get(key: number): Iequipment_bandConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

export class equipment_quality {
    private _dataMap: Map<number, Iequipment_qualityConfig>

    private _dataList: Iequipment_qualityConfig[]
    private _loaded:boolean=false;
    private _buf: ByteBuf;
    constructor(_buf_: ByteBuf) {
        this._buf = _buf_;
        this._loaded = false;
    }

    private load():void{
        if(this._loaded){
            return;
        }
        let _buf_ = this._buf;
        if(!_buf_){
            console.error("_buf_ null");
            return;
        }
        this._dataMap = new Map<number, Iequipment_qualityConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: Iequipment_qualityConfig
            _v = new Iequipment_qualityConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, Iequipment_qualityConfig> {this.load(); return this._dataMap; }

    getDataList(): Iequipment_qualityConfig[] { this.load();return this._dataList; }

    get(key: number): Iequipment_qualityConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

export class equipment_trait {
    private _dataMap: Map<number, Iequipment_traitConfig>

    private _dataList: Iequipment_traitConfig[]
    private _loaded:boolean=false;
    private _buf: ByteBuf;
    constructor(_buf_: ByteBuf) {
        this._buf = _buf_;
        this._loaded = false;
    }

    private load():void{
        if(this._loaded){
            return;
        }
        let _buf_ = this._buf;
        if(!_buf_){
            console.error("_buf_ null");
            return;
        }
        this._dataMap = new Map<number, Iequipment_traitConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: Iequipment_traitConfig
            _v = new Iequipment_traitConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, Iequipment_traitConfig> {this.load(); return this._dataMap; }

    getDataList(): Iequipment_traitConfig[] { this.load();return this._dataList; }

    get(key: number): Iequipment_traitConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

export class equipment_trait_roll {
    private _dataMap: Map<number, Iequipment_trait_rollConfig>

    private _dataList: Iequipment_trait_rollConfig[]
    private _loaded:boolean=false;
    private _buf: ByteBuf;
    constructor(_buf_: ByteBuf) {
        this._buf = _buf_;
        this._loaded = false;
    }

    private load():void{
        if(this._loaded){
            return;
        }
        let _buf_ = this._buf;
        if(!_buf_){
            console.error("_buf_ null");
            return;
        }
        this._dataMap = new Map<number, Iequipment_trait_rollConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: Iequipment_trait_rollConfig
            _v = new Iequipment_trait_rollConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, Iequipment_trait_rollConfig> {this.load(); return this._dataMap; }

    getDataList(): Iequipment_trait_rollConfig[] { this.load();return this._dataList; }

    get(key: number): Iequipment_trait_rollConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

export class potion {
    private _dataMap: Map<number, IpotionConfig>

    private _dataList: IpotionConfig[]
    private _loaded:boolean=false;
    private _buf: ByteBuf;
    constructor(_buf_: ByteBuf) {
        this._buf = _buf_;
        this._loaded = false;
    }

    private load():void{
        if(this._loaded){
            return;
        }
        let _buf_ = this._buf;
        if(!_buf_){
            console.error("_buf_ null");
            return;
        }
        this._dataMap = new Map<number, IpotionConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: IpotionConfig
            _v = new IpotionConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, IpotionConfig> {this.load(); return this._dataMap; }

    getDataList(): IpotionConfig[] { this.load();return this._dataList; }

    get(key: number): IpotionConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

export class potion_item {
    private _dataMap: Map<number, Ipotion_itemConfig>

    private _dataList: Ipotion_itemConfig[]
    private _loaded:boolean=false;
    private _buf: ByteBuf;
    constructor(_buf_: ByteBuf) {
        this._buf = _buf_;
        this._loaded = false;
    }

    private load():void{
        if(this._loaded){
            return;
        }
        let _buf_ = this._buf;
        if(!_buf_){
            console.error("_buf_ null");
            return;
        }
        this._dataMap = new Map<number, Ipotion_itemConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: Ipotion_itemConfig
            _v = new Ipotion_itemConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, Ipotion_itemConfig> {this.load(); return this._dataMap; }

    getDataList(): Ipotion_itemConfig[] { this.load();return this._dataList; }

    get(key: number): Ipotion_itemConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

export class repair {
    private _dataMap: Map<number, IrepairConfig>

    private _dataList: IrepairConfig[]
    private _loaded:boolean=false;
    private _buf: ByteBuf;
    constructor(_buf_: ByteBuf) {
        this._buf = _buf_;
        this._loaded = false;
    }

    private load():void{
        if(this._loaded){
            return;
        }
        let _buf_ = this._buf;
        if(!_buf_){
            console.error("_buf_ null");
            return;
        }
        this._dataMap = new Map<number, IrepairConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: IrepairConfig
            _v = new IrepairConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, IrepairConfig> {this.load(); return this._dataMap; }

    getDataList(): IrepairConfig[] { this.load();return this._dataList; }

    get(key: number): IrepairConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

export class stamina {
    private _dataMap: Map<number, IstaminaConfig>

    private _dataList: IstaminaConfig[]
    private _loaded:boolean=false;
    private _buf: ByteBuf;
    constructor(_buf_: ByteBuf) {
        this._buf = _buf_;
        this._loaded = false;
    }

    private load():void{
        if(this._loaded){
            return;
        }
        let _buf_ = this._buf;
        if(!_buf_){
            console.error("_buf_ null");
            return;
        }
        this._dataMap = new Map<number, IstaminaConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: IstaminaConfig
            _v = new IstaminaConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, IstaminaConfig> {this.load(); return this._dataMap; }

    getDataList(): IstaminaConfig[] { this.load();return this._dataList; }

    get(key: number): IstaminaConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

export class container {
    private _dataMap: Map<number, IcontainerConfig>

    private _dataList: IcontainerConfig[]
    private _loaded:boolean=false;
    private _buf: ByteBuf;
    constructor(_buf_: ByteBuf) {
        this._buf = _buf_;
        this._loaded = false;
    }

    private load():void{
        if(this._loaded){
            return;
        }
        let _buf_ = this._buf;
        if(!_buf_){
            console.error("_buf_ null");
            return;
        }
        this._dataMap = new Map<number, IcontainerConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: IcontainerConfig
            _v = new IcontainerConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, IcontainerConfig> {this.load(); return this._dataMap; }

    getDataList(): IcontainerConfig[] { this.load();return this._dataList; }

    get(key: number): IcontainerConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

export class inventory_rule {
    private _dataMap: Map<number, Iinventory_ruleConfig>

    private _dataList: Iinventory_ruleConfig[]
    private _loaded:boolean=false;
    private _buf: ByteBuf;
    constructor(_buf_: ByteBuf) {
        this._buf = _buf_;
        this._loaded = false;
    }

    private load():void{
        if(this._loaded){
            return;
        }
        let _buf_ = this._buf;
        if(!_buf_){
            console.error("_buf_ null");
            return;
        }
        this._dataMap = new Map<number, Iinventory_ruleConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: Iinventory_ruleConfig
            _v = new Iinventory_ruleConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, Iinventory_ruleConfig> {this.load(); return this._dataMap; }

    getDataList(): Iinventory_ruleConfig[] { this.load();return this._dataList; }

    get(key: number): Iinventory_ruleConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

export class inventory_start {
    private _dataMap: Map<number, Iinventory_startConfig>

    private _dataList: Iinventory_startConfig[]
    private _loaded:boolean=false;
    private _buf: ByteBuf;
    constructor(_buf_: ByteBuf) {
        this._buf = _buf_;
        this._loaded = false;
    }

    private load():void{
        if(this._loaded){
            return;
        }
        let _buf_ = this._buf;
        if(!_buf_){
            console.error("_buf_ null");
            return;
        }
        this._dataMap = new Map<number, Iinventory_startConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: Iinventory_startConfig
            _v = new Iinventory_startConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, Iinventory_startConfig> {this.load(); return this._dataMap; }

    getDataList(): Iinventory_startConfig[] { this.load();return this._dataList; }

    get(key: number): Iinventory_startConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

export class map_node {
    private _dataMap: Map<number, Imap_nodeConfig>

    private _dataList: Imap_nodeConfig[]
    private _loaded:boolean=false;
    private _buf: ByteBuf;
    constructor(_buf_: ByteBuf) {
        this._buf = _buf_;
        this._loaded = false;
    }

    private load():void{
        if(this._loaded){
            return;
        }
        let _buf_ = this._buf;
        if(!_buf_){
            console.error("_buf_ null");
            return;
        }
        this._dataMap = new Map<number, Imap_nodeConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: Imap_nodeConfig
            _v = new Imap_nodeConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, Imap_nodeConfig> {this.load(); return this._dataMap; }

    getDataList(): Imap_nodeConfig[] { this.load();return this._dataList; }

    get(key: number): Imap_nodeConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

export class map_pool {
    private _dataMap: Map<number, Imap_poolConfig>

    private _dataList: Imap_poolConfig[]
    private _loaded:boolean=false;
    private _buf: ByteBuf;
    constructor(_buf_: ByteBuf) {
        this._buf = _buf_;
        this._loaded = false;
    }

    private load():void{
        if(this._loaded){
            return;
        }
        let _buf_ = this._buf;
        if(!_buf_){
            console.error("_buf_ null");
            return;
        }
        this._dataMap = new Map<number, Imap_poolConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: Imap_poolConfig
            _v = new Imap_poolConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, Imap_poolConfig> {this.load(); return this._dataMap; }

    getDataList(): Imap_poolConfig[] { this.load();return this._dataList; }

    get(key: number): Imap_poolConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

export class map_variant {
    private _dataMap: Map<number, Imap_variantConfig>

    private _dataList: Imap_variantConfig[]
    private _loaded:boolean=false;
    private _buf: ByteBuf;
    constructor(_buf_: ByteBuf) {
        this._buf = _buf_;
        this._loaded = false;
    }

    private load():void{
        if(this._loaded){
            return;
        }
        let _buf_ = this._buf;
        if(!_buf_){
            console.error("_buf_ null");
            return;
        }
        this._dataMap = new Map<number, Imap_variantConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: Imap_variantConfig
            _v = new Imap_variantConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, Imap_variantConfig> {this.load(); return this._dataMap; }

    getDataList(): Imap_variantConfig[] { this.load();return this._dataList; }

    get(key: number): Imap_variantConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

export class map_rule {
    private _dataMap: Map<number, Imap_ruleConfig>

    private _dataList: Imap_ruleConfig[]
    private _loaded:boolean=false;
    private _buf: ByteBuf;
    constructor(_buf_: ByteBuf) {
        this._buf = _buf_;
        this._loaded = false;
    }

    private load():void{
        if(this._loaded){
            return;
        }
        let _buf_ = this._buf;
        if(!_buf_){
            console.error("_buf_ null");
            return;
        }
        this._dataMap = new Map<number, Imap_ruleConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: Imap_ruleConfig
            _v = new Imap_ruleConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, Imap_ruleConfig> {this.load(); return this._dataMap; }

    getDataList(): Imap_ruleConfig[] { this.load();return this._dataList; }

    get(key: number): Imap_ruleConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

export class map_search {
    private _dataMap: Map<number, Imap_searchConfig>

    private _dataList: Imap_searchConfig[]
    private _loaded:boolean=false;
    private _buf: ByteBuf;
    constructor(_buf_: ByteBuf) {
        this._buf = _buf_;
        this._loaded = false;
    }

    private load():void{
        if(this._loaded){
            return;
        }
        let _buf_ = this._buf;
        if(!_buf_){
            console.error("_buf_ null");
            return;
        }
        this._dataMap = new Map<number, Imap_searchConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: Imap_searchConfig
            _v = new Imap_searchConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, Imap_searchConfig> {this.load(); return this._dataMap; }

    getDataList(): Imap_searchConfig[] { this.load();return this._dataList; }

    get(key: number): Imap_searchConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

export class map_pool_category {
    private _dataMap: Map<number, Imap_pool_categoryConfig>

    private _dataList: Imap_pool_categoryConfig[]
    private _loaded:boolean=false;
    private _buf: ByteBuf;
    constructor(_buf_: ByteBuf) {
        this._buf = _buf_;
        this._loaded = false;
    }

    private load():void{
        if(this._loaded){
            return;
        }
        let _buf_ = this._buf;
        if(!_buf_){
            console.error("_buf_ null");
            return;
        }
        this._dataMap = new Map<number, Imap_pool_categoryConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: Imap_pool_categoryConfig
            _v = new Imap_pool_categoryConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, Imap_pool_categoryConfig> {this.load(); return this._dataMap; }

    getDataList(): Imap_pool_categoryConfig[] { this.load();return this._dataList; }

    get(key: number): Imap_pool_categoryConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

export class map_pool_quality {
    private _dataMap: Map<number, Imap_pool_qualityConfig>

    private _dataList: Imap_pool_qualityConfig[]
    private _loaded:boolean=false;
    private _buf: ByteBuf;
    constructor(_buf_: ByteBuf) {
        this._buf = _buf_;
        this._loaded = false;
    }

    private load():void{
        if(this._loaded){
            return;
        }
        let _buf_ = this._buf;
        if(!_buf_){
            console.error("_buf_ null");
            return;
        }
        this._dataMap = new Map<number, Imap_pool_qualityConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: Imap_pool_qualityConfig
            _v = new Imap_pool_qualityConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, Imap_pool_qualityConfig> {this.load(); return this._dataMap; }

    getDataList(): Imap_pool_qualityConfig[] { this.load();return this._dataList; }

    get(key: number): Imap_pool_qualityConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

export class map_pool_weapon {
    private _dataMap: Map<number, Imap_pool_weaponConfig>

    private _dataList: Imap_pool_weaponConfig[]
    private _loaded:boolean=false;
    private _buf: ByteBuf;
    constructor(_buf_: ByteBuf) {
        this._buf = _buf_;
        this._loaded = false;
    }

    private load():void{
        if(this._loaded){
            return;
        }
        let _buf_ = this._buf;
        if(!_buf_){
            console.error("_buf_ null");
            return;
        }
        this._dataMap = new Map<number, Imap_pool_weaponConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: Imap_pool_weaponConfig
            _v = new Imap_pool_weaponConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, Imap_pool_weaponConfig> {this.load(); return this._dataMap; }

    getDataList(): Imap_pool_weaponConfig[] { this.load();return this._dataList; }

    get(key: number): Imap_pool_weaponConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

/**
 * 坊市商品
 */
export class market_goods {
    private _dataMap: Map<number, Imarket_goodsConfig>

    private _dataList: Imarket_goodsConfig[]
    private _loaded:boolean=false;
    private _buf: ByteBuf;
    constructor(_buf_: ByteBuf) {
        this._buf = _buf_;
        this._loaded = false;
    }

    private load():void{
        if(this._loaded){
            return;
        }
        let _buf_ = this._buf;
        if(!_buf_){
            console.error("_buf_ null");
            return;
        }
        this._dataMap = new Map<number, Imarket_goodsConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: Imarket_goodsConfig
            _v = new Imarket_goodsConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, Imarket_goodsConfig> {this.load(); return this._dataMap; }

    getDataList(): Imarket_goodsConfig[] { this.load();return this._dataList; }

    get(key: number): Imarket_goodsConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

type ByteBufLoader = (file: string) => ByteBuf

export class Tables {
    private _battle_rule: battle_rule
    get battle_rule(): battle_rule  { return this._battle_rule;}
    private _battle_parameter: battle_parameter
    get battle_parameter(): battle_parameter  { return this._battle_parameter;}
    private _battle_start_skill: battle_start_skill
    get battle_start_skill(): battle_start_skill  { return this._battle_start_skill;}
    private _skill: skill
    get skill(): skill  { return this._skill;}
    private _skill_effect: skill_effect
    get skill_effect(): skill_effect  { return this._skill_effect;}
    private _enemy: enemy
    get enemy(): enemy  { return this._enemy;}
    private _enemy_action: enemy_action
    get enemy_action(): enemy_action  { return this._enemy_action;}
    private _item: item
    get item(): item  { return this._item;}
    private _equipment: equipment
    get equipment(): equipment  { return this._equipment;}
    private _equipment_base: equipment_base
    get equipment_base(): equipment_base  { return this._equipment_base;}
    private _equipment_band: equipment_band
    get equipment_band(): equipment_band  { return this._equipment_band;}
    private _equipment_quality: equipment_quality
    get equipment_quality(): equipment_quality  { return this._equipment_quality;}
    private _equipment_trait: equipment_trait
    get equipment_trait(): equipment_trait  { return this._equipment_trait;}
    private _equipment_trait_roll: equipment_trait_roll
    get equipment_trait_roll(): equipment_trait_roll  { return this._equipment_trait_roll;}
    private _potion: potion
    get potion(): potion  { return this._potion;}
    private _potion_item: potion_item
    get potion_item(): potion_item  { return this._potion_item;}
    private _repair: repair
    get repair(): repair  { return this._repair;}
    private _stamina: stamina
    get stamina(): stamina  { return this._stamina;}
    private _container: container
    get container(): container  { return this._container;}
    private _inventory_rule: inventory_rule
    get inventory_rule(): inventory_rule  { return this._inventory_rule;}
    private _inventory_start: inventory_start
    get inventory_start(): inventory_start  { return this._inventory_start;}
    private _map_node: map_node
    get map_node(): map_node  { return this._map_node;}
    private _map_pool: map_pool
    get map_pool(): map_pool  { return this._map_pool;}
    private _map_variant: map_variant
    get map_variant(): map_variant  { return this._map_variant;}
    private _map_rule: map_rule
    get map_rule(): map_rule  { return this._map_rule;}
    private _map_search: map_search
    get map_search(): map_search  { return this._map_search;}
    private _map_pool_category: map_pool_category
    get map_pool_category(): map_pool_category  { return this._map_pool_category;}
    private _map_pool_quality: map_pool_quality
    get map_pool_quality(): map_pool_quality  { return this._map_pool_quality;}
    private _map_pool_weapon: map_pool_weapon
    get map_pool_weapon(): map_pool_weapon  { return this._map_pool_weapon;}
    private _market_goods: market_goods
    /**
     * 坊市商品
     */
    get market_goods(): market_goods  { return this._market_goods;}

    static getTableNames(): string[] {
        let names: string[] = [];
        names.push('battle_rule');
        names.push('battle_parameter');
        names.push('battle_start_skill');
        names.push('skill');
        names.push('skill_effect');
        names.push('enemy');
        names.push('enemy_action');
        names.push('item');
        names.push('equipment');
        names.push('equipment_base');
        names.push('equipment_band');
        names.push('equipment_quality');
        names.push('equipment_trait');
        names.push('equipment_trait_roll');
        names.push('potion');
        names.push('potion_item');
        names.push('repair');
        names.push('stamina');
        names.push('container');
        names.push('inventory_rule');
        names.push('inventory_start');
        names.push('map_node');
        names.push('map_pool');
        names.push('map_variant');
        names.push('map_rule');
        names.push('map_search');
        names.push('map_pool_category');
        names.push('map_pool_quality');
        names.push('map_pool_weapon');
        names.push('market_goods');
        return names;
    }

    constructor(loader: ByteBufLoader) {
        this._battle_rule = new battle_rule(loader('battle_rule'))
        this._battle_parameter = new battle_parameter(loader('battle_parameter'))
        this._battle_start_skill = new battle_start_skill(loader('battle_start_skill'))
        this._skill = new skill(loader('skill'))
        this._skill_effect = new skill_effect(loader('skill_effect'))
        this._enemy = new enemy(loader('enemy'))
        this._enemy_action = new enemy_action(loader('enemy_action'))
        this._item = new item(loader('item'))
        this._equipment = new equipment(loader('equipment'))
        this._equipment_base = new equipment_base(loader('equipment_base'))
        this._equipment_band = new equipment_band(loader('equipment_band'))
        this._equipment_quality = new equipment_quality(loader('equipment_quality'))
        this._equipment_trait = new equipment_trait(loader('equipment_trait'))
        this._equipment_trait_roll = new equipment_trait_roll(loader('equipment_trait_roll'))
        this._potion = new potion(loader('potion'))
        this._potion_item = new potion_item(loader('potion_item'))
        this._repair = new repair(loader('repair'))
        this._stamina = new stamina(loader('stamina'))
        this._container = new container(loader('container'))
        this._inventory_rule = new inventory_rule(loader('inventory_rule'))
        this._inventory_start = new inventory_start(loader('inventory_start'))
        this._map_node = new map_node(loader('map_node'))
        this._map_pool = new map_pool(loader('map_pool'))
        this._map_variant = new map_variant(loader('map_variant'))
        this._map_rule = new map_rule(loader('map_rule'))
        this._map_search = new map_search(loader('map_search'))
        this._map_pool_category = new map_pool_category(loader('map_pool_category'))
        this._map_pool_quality = new map_pool_quality(loader('map_pool_quality'))
        this._map_pool_weapon = new map_pool_weapon(loader('map_pool_weapon'))
        this._market_goods = new market_goods(loader('market_goods'))


    }
}

