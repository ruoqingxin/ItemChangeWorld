import { FuncChecker } from "../FuncChecker";
import { TabItemCtrl } from "./TabCtrl";
import { UITabSubView } from "./UITabView";

/**
 * tab构造器
 */
export class TabConstructor {
    /**
     * tab节点名称 默认 = list_tab
     */
    tabListName: string = "list_tab";
    /**
     * 子界面根节点名称
     * 改节点会被自动改为全屏，保持子界面与主界面设计区域一致
     */
    subViewRootName: string = "subViewRoot";
    /**
     * 自动隐藏节点名称
     * 部分子界面会隐藏父界面的信息展示自己的内容
     * 需要开启该特性的子节点
     */
    autoHideRootName: string = "autoHideRoot";
    /**
     * 页签是否显示的检查回调，默认 = 功能是否开启判定
     */
    visibleCheckFunc: (id: number, data: any) => boolean = TabConstructor.defaultCheckFunc;

    /**
     * tab页签界面列表
     */
    viewClassList: ({
        /**
         * 界面功能id，或者唯一性id
         */
        id: number;
        /**
         * 界面class，如果不同id使用了相同界面模板，则会重用资源，注意数据清理
         * 子界面可通过id获取当前界面唯一性
         */
        viewClass: new () => UITabSubView,
        /**
         * tab数据，比如字符串，如果使用了注册方式构造的tab，data默认 = id
         */
        data: any,
        /**
         * 是否自动隐藏父节点autoHideRootName
         */
        autoHideParentRoot?: boolean
    })[];
    /**
     * tab控制器
     */
    tabCtrl: new () => TabItemCtrl;

    static defaultCheckFunc(id: number, data: any) {
        return FuncChecker.isFuncAvailable(id);
    }
}