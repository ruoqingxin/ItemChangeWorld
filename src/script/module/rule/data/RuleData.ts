
import { ConfigUtil } from "src/script/config/ConfigUtil";
import { BaseDataClass } from "src/script/games/common/BaseDataClass";

/**
 * 规则数据
 */
export default class RuleData extends BaseDataClass {

    /**
     * 获取规则配置列表
     * @returns 规则配置数组
     */
    public getRuleConfigList() {
        //return ConfigUtil.Tables.rule.getDataList();
    }

    /**
     * 根据ID获取规则配置
     * @param id 页签ID
     * @returns 规则配置
     */
    public getRuleConfigById(id: number) {
        //return ConfigUtil.Tables.rule.get(id);
    }
}