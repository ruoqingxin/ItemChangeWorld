import { UIUtils } from "src/script/sfgames/utils/UIUtils";
import { ElementAdapater } from "./ElementAdapater";

const { regClass, classInfo, runInEditor, property } = Laya;
export enum MapperTypeEnum {
    None,
    /**
     * 遮罩-可点击关闭
     */
    MaskWithClose,
    /**
     * 遮罩-不可点击关闭
     */
    MaskWithoutClose,
    /**
     * 无遮罩-点击穿透
     */
    NoMaskWithThrough,
    /**
     * 全屏
     */
    Fullscreen
}
@regClass()
@classInfo({
    menu: "UI扩展",
    caption: "ElementMapper",
})
/**
 * 支持横竖屏切换，需要建立2个子节点 h_adapter v_adapter
 * 需要适配的节点挂载ElementAdapter组件，并设置target
 */
export class ElementMapper extends Laya.Script {
    declare owner: Laya.GWidget;
    @property({ type: Laya.GWidget })
    public adapter: Laya.GWidget;
    @property({ type: [Laya.Node] })
    public elements: Laya.Node[];
    @property({ type: [Laya.Prefab] })
    public prefabs: Laya.PrefabImpl[];

    //普通的枚举类型（可以类型简写），会显示为下拉框供用户选择
    @property(MapperTypeEnum)
    public mapperType: MapperTypeEnum = MapperTypeEnum.None;

    private v_adapter: Laya.GWidget;
    private h_adapter: Laya.GWidget;
    private adapterNodeList: AdapterNode[];

    /**
     * 顶部padding
     */
    public static TOP_PADDING = 85;

    /** 优先在 owner 下查找子节点，找不到再在 adapter 下查找；节点为空时不调用 findChild */
    private findAdapterChild(name: string): Laya.GWidget {
        return (this.owner?.findChild(name) || this.adapter?.findChild(name)) as Laya.GWidget;
    }

    onAwake(): void {
        if (!this.elements) {
            return;
        }

        this.v_adapter = this.findAdapterChild("v_adapter");
        this.h_adapter = this.findAdapterChild("h_adapter");
        if (!this.v_adapter || !this.h_adapter) {
            return;
        }
        this.v_adapter.mouseThrough = true;
        this.h_adapter.mouseThrough = true;
    }

    onEnable(): void {
        this.autoSize();
        this.owner.on(Laya.Event.RESIZE, this, this.autoSize);
    }

    onDisable(): void {
        this.owner.off(Laya.Event.RESIZE, this, this.autoSize);
    }

    /**
     * 设置UI方向
     * @param isHorizontal 是否横向
     * @param anim 是否过渡动画
     */
    setDirection(isHorizontal: boolean, anim: boolean) {
        if (!this.v_adapter || !this.h_adapter) {
            return;
        }
        if (!this.adapterNodeList) {
            this.h_adapter.pos(0, 0);
            // 默认支持竖屏模式
            const isHorizontal = false;
            this.v_adapter.visible = !isHorizontal;
            this.v_adapter.active = !isHorizontal;

            this.v_adapter.width = this.owner.width;
            this.v_adapter.height = this.owner.height;
            if(! this.adapter){
                this.adapter = this.v_adapter;
                this.autoSize();
            }
            this.h_adapter.width = this.owner.height;
            this.h_adapter.height = this.owner.width;

            this.h_adapter.visible = isHorizontal;
            this.h_adapter.active = isHorizontal;
            this.h_adapter.rotation = -90;
            this.h_adapter.y += this.owner.height;
            this.adapterNodeList = [];
            const adapterComList = UIUtils.getComponentsInChildren(this.v_adapter, ElementAdapater);
            for (const adapterCom of adapterComList) {
                const adapter = new AdapterNode();
                adapter.targetNode = adapterCom.owner;
                adapter.vInfo = new AdapterInfo();
                adapter.ignoreAnim = adapterCom.ingoreAnim;
                adapter.vInfo.fill(adapterCom.owner, null);
                adapter.hInfo = new AdapterInfo();
                adapter.hInfo.fill(adapterCom.target, adapterCom.owner);

                let parent = adapterCom.target.parent;
                while (parent != null && parent != this.owner) {
                    adapter.hInfo.rotation += parent.rotation;
                    parent = parent.parent;
                }
                this.adapterNodeList.push(adapter);
            }
        }
        // 遍历子节点进行过渡
        for (const adapter of this.adapterNodeList) {
            const info = isHorizontal ? adapter.hInfo : adapter.vInfo;

            if (anim && !adapter.ignoreAnim) {
                Laya.Tween.to(adapter.targetNode, {
                    x: info.x,
                    y: info.y,
                    rotation: info.rotation
                }, 800, Laya.Ease.backInOut);
            }
            else {
                adapter.targetNode.pos(info.x, info.y);
                adapter.targetNode.rotation = info.rotation;
            }
        }
    }

    public getAdapterInfo(target: Laya.GWidget, isHorizontal: boolean): AdapterInfo {
        if (!this.adapterNodeList) {
            return null;
        }
        for (const adapter of this.adapterNodeList) {
            if (adapter.targetNode == target) {
                return isHorizontal ? adapter.hInfo : adapter.vInfo;
            }
        }
        return null;
    }

    /**
     * 自动适配大小
     */
    private autoSize() {
        if (!this.adapter) {
            return;
        }
        let designWidth = Laya.stage.designWidth;
        let designHeight = Laya.stage.designHeight;
        let padding = 0;
        if (this.owner.width / this.owner.height > designWidth / designHeight) {

        }
        else {
            padding = Math.min(ElementMapper.TOP_PADDING, this.owner.height - designHeight);
        }
        this.adapter.y = padding;
        this.adapter.height = this.owner.height - padding;
    }
}
/**
 * 适配节点
 */
class AdapterNode {
    /**
     * 自动适配的目标节点
     */
    targetNode: Laya.GWidget;
    /**
     * 横向储存信息
     */
    hInfo: AdapterInfo;
    /**
     * 竖向储存信息
     */
    vInfo: AdapterInfo;
    /**
     * 是否忽略动画
     */
    ignoreAnim: boolean = false;
}
/**
 * 适配节点信息
 */
class AdapterInfo {
    /**
     * 适配位置X
     */
    x: number;
    /**
     * 适配位置Y
     */
    y: number;
    /**
     * 适配旋转
     */
    rotation: number;

    /**
     * 填充适配属性
     * @param node 目标节点
     * @param convertTo 坐标转换节点
     */
    fill(node: Laya.GWidget, convertTo: Laya.GWidget) {
        if (convertTo) {
            const pos = UIUtils.convertPos(node, convertTo);
            this.x = pos.x;
            this.y = pos.y;
        }
        else {
            this.x = node.x;
            this.y = node.y;
        }
        this.rotation = node.rotation;
    }
}