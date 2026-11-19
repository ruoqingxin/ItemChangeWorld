

import ByteBuf from './bright/serialization/ByteBuf'


export enum EBuildFamily {
    /**
     * 飞剑
     */
    flying = 1,
    /**
     * 剑伤
     */
    wound = 2,
    /**
     * 御守
     */
    guard = 3,
    /**
     * 通用
     */
    neutral = 4,
}

export enum EBuildType {
    /**
     * 被动
     */
    passive = 1,
    /**
     * 改招
     */
    mutation = 2,
    /**
     * 核心
     */
    core = 3,
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

export class Ibattle_ruleConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.player_hp = _buf_.ReadInt()
        this.player_mp = _buf_.ReadInt()
        this.base_attack = _buf_.ReadInt()
        this.base_defense = _buf_.ReadInt()
        this.enemy_hp = _buf_.ReadInt()
        this.enemy_mp = _buf_.ReadInt()
        this.enemy_attack = _buf_.ReadInt()
        this.enemy_defense = _buf_.ReadInt()
        this.battle_rewards = _buf_.ReadInt()
        this.version = _buf_.ReadInt()
    }

    /**
     * 固定编号
     */
    readonly id: number
    /**
     * 生命上限
     */
    readonly player_hp: number
    /**
     * 灵力上限
     */
    readonly player_mp: number
    /**
     * 基础攻击
     */
    readonly base_attack: number
    /**
     * 基础防御
     */
    readonly base_defense: number
    /**
     * 敌人基础生命，按类型及战次调整
     */
    readonly enemy_hp: number
    /**
     * 敌人灵力
     */
    readonly enemy_mp: number
    /**
     * 敌人基础攻击
     */
    readonly enemy_attack: number
    /**
     * 敌人防御
     */
    readonly enemy_defense: number
    /**
     * 胜利后构筑奖励场数
     */
    readonly battle_rewards: number
    /**
     * 整数规则版本
     */
    readonly version: number


}

export class Ibuild_mutationConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.skill_id = _buf_.ReadInt()
    }

    /**
     * 构筑编号，引用 build.id
     */
    readonly id: number
    /**
     * 被替换技能编号，引用 skill.id
     */
    readonly skill_id: number


}

export class IbuildConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.code = _buf_.ReadString()
        this.name = _buf_.ReadString()
        this.type = _buf_.ReadInt()
        this.family = _buf_.ReadInt()
        this.description = _buf_.ReadString()
    }

    /**
     * 固定编号
     */
    readonly id: number
    /**
     * 程序行为码
     */
    readonly code: string
    /**
     * 名称
     */
    readonly name: string
    /**
     * 类型
     */
    readonly type: EBuildType
    /**
     * 机制方向
     */
    readonly family: EBuildFamily
    /**
     * 效果
     */
    readonly description: string


}

export class IcontainerConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.width = _buf_.ReadInt()
        this.height = _buf_.ReadInt()
        this.weight_limit = _buf_.ReadInt()
    }

    /**
     * 物品编号，引用 item.id
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

export class IenemyConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.code = _buf_.ReadString()
        this.name = _buf_.ReadString()
        this.tier = _buf_.ReadInt()
        this.opening = _buf_.ReadInt()
        this.hint = _buf_.ReadString()
    }

    /**
     * 固定编号
     */
    readonly id: number
    /**
     * 程序行为码
     */
    readonly code: string
    /**
     * 名称
     */
    readonly name: string
    /**
     * 级别
     */
    readonly tier: EEnemyTier
    /**
     * 初始护盾防御百分比
     */
    readonly opening: number
    /**
     * 行为提示
     */
    readonly hint: string


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
     * 规则ID
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
     * 引用 item.id
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
     * 固定编号；1–100 预留货币
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
     * 节点ID
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
     * 引用 map_pool.id
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
     * 引用 map_pool.id
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
     * 掉落池编号，引用 map_pool.id
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
     * 规则ID
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

    readonly normal_min: number

    readonly normal_max: number

    readonly elite_min: number

    readonly elite_max: number

    readonly insight_min: number

    readonly insight_max: number

    readonly borrow_min: number

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
     * 节点编号，引用 map_node.id
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

export class Ipotion_itemConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.potion_id = _buf_.ReadInt()
    }

    /**
     * 物品编号，引用 item.id
     */
    readonly id: number
    /**
     * 药效编号，引用 potion.id
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
     * 物品编号，引用 item.id
     */
    readonly id: number
    /**
     * 修理量，-1 表示修满
     */
    readonly amount: number


}

export class IskillConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.code = _buf_.ReadString()
        this.name = _buf_.ReadString()
        this.mp_cost = _buf_.ReadInt()
        this.description = _buf_.ReadString()
    }

    /**
     * 固定编号
     */
    readonly id: number
    /**
     * 程序行为码
     */
    readonly code: string
    /**
     * 名称
     */
    readonly name: string
    /**
     * 灵力消耗
     */
    readonly mp_cost: number
    /**
     * 效果
     */
    readonly description: string


}

export class IstaminaConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.amount = _buf_.ReadInt()
    }

    /**
     * 物品编号，引用 item.id
     */
    readonly id: number
    /**
     * 战外体力恢复量
     */
    readonly amount: number


}

export class IweaponConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.attack = _buf_.ReadInt()
        this.defense = _buf_.ReadInt()
        this.durability = _buf_.ReadInt()
    }

    /**
     * 物品编号，引用 item.id
     */
    readonly id: number
    /**
     * 武器攻击
     */
    readonly attack: number
    /**
     * 武器防御
     */
    readonly defense: number
    /**
     * 武器耐久上限
     */
    readonly durability: number


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

export class build {
    private _dataMap: Map<number, IbuildConfig>

    private _dataList: IbuildConfig[]
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
        this._dataMap = new Map<number, IbuildConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: IbuildConfig
            _v = new IbuildConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, IbuildConfig> {this.load(); return this._dataMap; }

    getDataList(): IbuildConfig[] { this.load();return this._dataList; }

    get(key: number): IbuildConfig | undefined {
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

export class weapon {
    private _dataMap: Map<number, IweaponConfig>

    private _dataList: IweaponConfig[]
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
        this._dataMap = new Map<number, IweaponConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: IweaponConfig
            _v = new IweaponConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, IweaponConfig> {this.load(); return this._dataMap; }

    getDataList(): IweaponConfig[] { this.load();return this._dataList; }

    get(key: number): IweaponConfig | undefined {
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

export class build_mutation {
    private _dataMap: Map<number, Ibuild_mutationConfig>

    private _dataList: Ibuild_mutationConfig[]
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
        this._dataMap = new Map<number, Ibuild_mutationConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: Ibuild_mutationConfig
            _v = new Ibuild_mutationConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<number, Ibuild_mutationConfig> {this.load(); return this._dataMap; }

    getDataList(): Ibuild_mutationConfig[] { this.load();return this._dataList; }

    get(key: number): Ibuild_mutationConfig | undefined {
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

type ByteBufLoader = (file: string) => ByteBuf

export class Tables {
    private _battle_rule: battle_rule
    get battle_rule(): battle_rule  { return this._battle_rule;}
    private _skill: skill
    get skill(): skill  { return this._skill;}
    private _build: build
    get build(): build  { return this._build;}
    private _enemy: enemy
    get enemy(): enemy  { return this._enemy;}
    private _item: item
    get item(): item  { return this._item;}
    private _potion: potion
    get potion(): potion  { return this._potion;}
    private _inventory_rule: inventory_rule
    get inventory_rule(): inventory_rule  { return this._inventory_rule;}
    private _map_node: map_node
    get map_node(): map_node  { return this._map_node;}
    private _map_pool: map_pool
    get map_pool(): map_pool  { return this._map_pool;}
    private _map_variant: map_variant
    get map_variant(): map_variant  { return this._map_variant;}
    private _map_rule: map_rule
    get map_rule(): map_rule  { return this._map_rule;}
    private _weapon: weapon
    get weapon(): weapon  { return this._weapon;}
    private _potion_item: potion_item
    get potion_item(): potion_item  { return this._potion_item;}
    private _repair: repair
    get repair(): repair  { return this._repair;}
    private _stamina: stamina
    get stamina(): stamina  { return this._stamina;}
    private _container: container
    get container(): container  { return this._container;}
    private _build_mutation: build_mutation
    get build_mutation(): build_mutation  { return this._build_mutation;}
    private _map_search: map_search
    get map_search(): map_search  { return this._map_search;}
    private _map_pool_category: map_pool_category
    get map_pool_category(): map_pool_category  { return this._map_pool_category;}
    private _map_pool_quality: map_pool_quality
    get map_pool_quality(): map_pool_quality  { return this._map_pool_quality;}
    private _map_pool_weapon: map_pool_weapon
    get map_pool_weapon(): map_pool_weapon  { return this._map_pool_weapon;}
    private _inventory_start: inventory_start
    get inventory_start(): inventory_start  { return this._inventory_start;}

    static getTableNames(): string[] {
        let names: string[] = [];
        names.push('battle_rule');
        names.push('skill');
        names.push('build');
        names.push('enemy');
        names.push('item');
        names.push('potion');
        names.push('inventory_rule');
        names.push('map_node');
        names.push('map_pool');
        names.push('map_variant');
        names.push('map_rule');
        names.push('weapon');
        names.push('potion_item');
        names.push('repair');
        names.push('stamina');
        names.push('container');
        names.push('build_mutation');
        names.push('map_search');
        names.push('map_pool_category');
        names.push('map_pool_quality');
        names.push('map_pool_weapon');
        names.push('inventory_start');
        return names;
    }

    constructor(loader: ByteBufLoader) {
        this._battle_rule = new battle_rule(loader('battle_rule'))
        this._skill = new skill(loader('skill'))
        this._build = new build(loader('build'))
        this._enemy = new enemy(loader('enemy'))
        this._item = new item(loader('item'))
        this._potion = new potion(loader('potion'))
        this._inventory_rule = new inventory_rule(loader('inventory_rule'))
        this._map_node = new map_node(loader('map_node'))
        this._map_pool = new map_pool(loader('map_pool'))
        this._map_variant = new map_variant(loader('map_variant'))
        this._map_rule = new map_rule(loader('map_rule'))
        this._weapon = new weapon(loader('weapon'))
        this._potion_item = new potion_item(loader('potion_item'))
        this._repair = new repair(loader('repair'))
        this._stamina = new stamina(loader('stamina'))
        this._container = new container(loader('container'))
        this._build_mutation = new build_mutation(loader('build_mutation'))
        this._map_search = new map_search(loader('map_search'))
        this._map_pool_category = new map_pool_category(loader('map_pool_category'))
        this._map_pool_quality = new map_pool_quality(loader('map_pool_quality'))
        this._map_pool_weapon = new map_pool_weapon(loader('map_pool_weapon'))
        this._inventory_start = new inventory_start(loader('inventory_start'))


    }
}

