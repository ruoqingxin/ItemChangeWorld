

import ByteBuf from './bright/serialization/ByteBuf'


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
        this.id = _buf_.ReadString()
        this.value = _buf_.ReadInt()
        this.description = _buf_.ReadString()
    }

    /**
     * 规则键
     */
    readonly id: string
    /**
     * 整数值
     */
    readonly value: number
    /**
     * 可调整测试起点
     */
    readonly description: string


}

export class IbuildConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadString()
        this.name = _buf_.ReadString()
        this.type = _buf_.ReadString()
        this.family = _buf_.ReadString()
        this.slot = _buf_.ReadString()
        this.description = _buf_.ReadString()
    }

    /**
     * 构筑标识
     */
    readonly id: string
    /**
     * 名称
     */
    readonly name: string
    /**
     * 类型
     */
    readonly type: string
    /**
     * 机制方向
     */
    readonly family: string
    /**
     * 改招槽位
     */
    readonly slot: string
    /**
     * 效果
     */
    readonly description: string


}

export class IenemyConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadString()
        this.name = _buf_.ReadString()
        this.tier = _buf_.ReadString()
        this.opening = _buf_.ReadInt()
        this.hint = _buf_.ReadString()
    }

    /**
     * 敌人标识
     */
    readonly id: string
    /**
     * 名称
     */
    readonly name: string
    /**
     * 级别
     */
    readonly tier: string
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
        this.repair = _buf_.ReadInt()
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
     * 修补耐久
     */
    readonly repair: number
    /**
     * 角色基础承重
     */
    readonly base_weight: number
    /**
     * 局内交互来源页数
     */
    readonly source_pages: number


}

export class IitemConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.name = _buf_.ReadString()
        this.kind = _buf_.ReadString()
        this.width = _buf_.ReadInt()
        this.height = _buf_.ReadInt()
        this.rotate = _buf_.ReadInt()
        this.battle = _buf_.ReadInt()
        this.safe = _buf_.ReadInt()
        this.stack = _buf_.ReadInt()
        this.potion_id = _buf_.ReadInt()
        this.bag_width = _buf_.ReadInt()
        this.bag_height = _buf_.ReadInt()
        this.icon = _buf_.ReadString()
        this.quality = _buf_.ReadInt()
        this.weight = _buf_.ReadInt()
        this.weight_limit = _buf_.ReadInt()
        this.stamina_restore = _buf_.ReadInt()
    }

    /**
     * 物品ID
     */
    readonly id: number
    /**
     * 名称
     */
    readonly name: string
    /**
     * 类别
     */
    readonly kind: string
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
     * 药品效果ID
     */
    readonly potion_id: number
    /**
     * 容量宽
     */
    readonly bag_width: number
    /**
     * 容量高
     */
    readonly bag_height: number
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
     * 装备背包承重
     */
    readonly weight_limit: number
    /**
     * 战外体力恢复
     */
    readonly stamina_restore: number


}

export class Imap_nodeConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.key = _buf_.ReadString()
        this.kind = _buf_.ReadString()
        this.name = _buf_.ReadString()
        this.enemy = _buf_.ReadString()
        this.pool = _buf_.ReadString()
        this.main_order = _buf_.ReadInt()
        this.x = _buf_.ReadFloat()
        this.y = _buf_.ReadFloat()
        this.icon = _buf_.ReadString()
        this.search_min = _buf_.ReadInt()
        this.search_max = _buf_.ReadInt()
        this.search_weight = _buf_.ReadInt()
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
    readonly kind: string
    /**
     * 功能名
     */
    readonly name: string
    /**
     * 敌人键
     */
    readonly enemy: string
    /**
     * 来源池
     */
    readonly pool: string
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

    readonly icon: string

    readonly search_min: number

    readonly search_max: number

    readonly search_weight: number


}

export class Imap_poolConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadString()
        this.min_count = _buf_.ReadInt()
        this.max_count = _buf_.ReadInt()
        this.min_weight = _buf_.ReadInt()
        this.dur_min = _buf_.ReadInt()
        this.dur_max = _buf_.ReadInt()
        this.hp = _buf_.ReadInt()
        this.mp = _buf_.ReadInt()
        this.repair = _buf_.ReadInt()
        this.herb = _buf_.ReadInt()
        this.ore = _buf_.ReadInt()
        this.small = _buf_.ReadInt()
        this.book = _buf_.ReadInt()
        this.container = _buf_.ReadInt()
        this.weapon = _buf_.ReadInt()
        this.q1 = _buf_.ReadInt()
        this.q2 = _buf_.ReadInt()
        this.q3 = _buf_.ReadInt()
        this.q4 = _buf_.ReadInt()
        this.q5 = _buf_.ReadInt()
        this.q6 = _buf_.ReadInt()
    }

    /**
     * 来源池
     */
    readonly id: string
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
    /**
     * 耐久下限
     */
    readonly dur_min: number
    /**
     * 耐久上限
     */
    readonly dur_max: number

    readonly hp: number

    readonly mp: number

    readonly repair: number

    readonly herb: number

    readonly ore: number

    readonly small: number

    readonly book: number

    readonly container: number

    readonly weapon: number
    /**
     * 白
     */
    readonly q1: number
    /**
     * 绿
     */
    readonly q2: number
    /**
     * 蓝
     */
    readonly q3: number
    /**
     * 紫
     */
    readonly q4: number
    /**
     * 金
     */
    readonly q5: number
    /**
     * 红
     */
    readonly q6: number


}

export class Imap_ruleConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.map_version = _buf_.ReadString()
        this.limit_ms = _buf_.ReadInt()
        this.search_ms = _buf_.ReadInt()
        this.checkpoint_ms = _buf_.ReadInt()
        this.recovery_percent = _buf_.ReadInt()
        this.supply_hp = _buf_.ReadInt()
        this.supply_mp = _buf_.ReadInt()
        this.supply_repair = _buf_.ReadInt()
        this.book_sword = _buf_.ReadInt()
        this.book_earth = _buf_.ReadInt()
        this.book_common = _buf_.ReadInt()
        this.weapon_id = _buf_.ReadInt()
        this.container_id = _buf_.ReadInt()
        this.hp_id = _buf_.ReadInt()
        this.mp_id = _buf_.ReadInt()
        this.repair_id = _buf_.ReadInt()
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
     * 检查点毫秒
     */
    readonly checkpoint_ms: number
    /**
     * 恢复百分比
     */
    readonly recovery_percent: number
    /**
     * 补给血药权重
     */
    readonly supply_hp: number
    /**
     * 补给蓝药权重
     */
    readonly supply_mp: number
    /**
     * 补给修补权重
     */
    readonly supply_repair: number
    /**
     * 剑书权重
     */
    readonly book_sword: number
    /**
     * 土书权重
     */
    readonly book_earth: number
    /**
     * 通用书权重
     */
    readonly book_common: number
    /**
     * 夹具武器
     */
    readonly weapon_id: number
    /**
     * 夹具容器
     */
    readonly container_id: number
    /**
     * 夹具血药
     */
    readonly hp_id: number
    /**
     * 夹具蓝药
     */
    readonly mp_id: number
    /**
     * 夹具修补
     */
    readonly repair_id: number
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

export class Imap_variantConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.family = _buf_.ReadString()
        this.item_id = _buf_.ReadInt()
        this.weight = _buf_.ReadInt()
    }

    /**
     * 子项ID
     */
    readonly id: number
    /**
     * 类别
     */
    readonly family: string
    /**
     * 物品ID
     */
    readonly item_id: number
    /**
     * 权重
     */
    readonly weight: number


}

export class IpotionConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadInt()
        this.name = _buf_.ReadString()
        this.resource = _buf_.ReadString()
        this.amount = _buf_.ReadInt()
    }

    /**
     * 药品ID
     */
    readonly id: number
    /**
     * 名称
     */
    readonly name: string
    /**
     * 恢复资源
     */
    readonly resource: string
    /**
     * 恢复量
     */
    readonly amount: number


}

export class IskillConfig {

    constructor(_buf_: ByteBuf) {
        this.id = _buf_.ReadString()
        this.name = _buf_.ReadString()
        this.mp_cost = _buf_.ReadInt()
        this.description = _buf_.ReadString()
    }

    /**
     * 技能标识
     */
    readonly id: string
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

export class battle_rule {
    private _dataMap: Map<string, Ibattle_ruleConfig>

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
        this._dataMap = new Map<string, Ibattle_ruleConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: Ibattle_ruleConfig
            _v = new Ibattle_ruleConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<string, Ibattle_ruleConfig> {this.load(); return this._dataMap; }

    getDataList(): Ibattle_ruleConfig[] { this.load();return this._dataList; }

    get(key: string): Ibattle_ruleConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

export class skill {
    private _dataMap: Map<string, IskillConfig>

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
        this._dataMap = new Map<string, IskillConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: IskillConfig
            _v = new IskillConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<string, IskillConfig> {this.load(); return this._dataMap; }

    getDataList(): IskillConfig[] { this.load();return this._dataList; }

    get(key: string): IskillConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

export class build {
    private _dataMap: Map<string, IbuildConfig>

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
        this._dataMap = new Map<string, IbuildConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: IbuildConfig
            _v = new IbuildConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<string, IbuildConfig> {this.load(); return this._dataMap; }

    getDataList(): IbuildConfig[] { this.load();return this._dataList; }

    get(key: string): IbuildConfig | undefined {
		this.load();
        return this._dataMap.get(key);
    }

}

export class enemy {
    private _dataMap: Map<string, IenemyConfig>

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
        this._dataMap = new Map<string, IenemyConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: IenemyConfig
            _v = new IenemyConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<string, IenemyConfig> {this.load(); return this._dataMap; }

    getDataList(): IenemyConfig[] { this.load();return this._dataList; }

    get(key: string): IenemyConfig | undefined {
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
    private _dataMap: Map<string, Imap_poolConfig>

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
        this._dataMap = new Map<string, Imap_poolConfig>()
        this._dataList = []

        for(let n = _buf_.ReadInt(); n > 0; n--) {
            let _v: Imap_poolConfig
            _v = new Imap_poolConfig(_buf_)
            this._dataList.push(_v)
            this._dataMap.set(_v.id, _v)

        }
        this._loaded = true;
    }
    getDataMap(): Map<string, Imap_poolConfig> {this.load(); return this._dataMap; }

    getDataList(): Imap_poolConfig[] { this.load();return this._dataList; }

    get(key: string): Imap_poolConfig | undefined {
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


    }
}

