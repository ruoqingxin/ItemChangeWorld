import { ElemFinder } from "src/script/sfgames/utils/ElemFinder";
import { UIUtils } from "src/script/sfgames/utils/UIUtils";

/**
 * 模板式按钮
 * 需要拥有一个名为txt_title的文本子节点
 * 需要拥有一个名为redDot的红点子节点
 */
export class UIButton {
    private txt_title: Laya.GTextField;
    private redDot: Laya.GWidget;

    /**
     * 获取按钮是否可见
     */
    public get visible() {
        return this.rootNode.visible;
    }

    /**
     * 设置按钮置灰状态
     */
    public set grayed(value: boolean) {
        this.rootNode.grayed = value;
    }

    /**
     * 获取按钮置灰状态
     */
    public get grayed() {
        return this.rootNode.grayed;
    }

    /**
     * 获取红点是否显示
     */
    public get isRedDotVisible() {
        return this.redDot && this.redDot.visible;
    }

    constructor(public readonly rootNode: Laya.GWidget) {
        this.txt_title = ElemFinder.getText(rootNode, "txt_title");
        this.redDot = ElemFinder.getText(rootNode, "redDot") || ElemFinder.getText(rootNode, "redDotNum");
        this.setRedDotVisible(false);
    }

    /**
     * 设置按钮标题文本
     * @param value 标题
     */
    setTitle(value: string) {
        if (this.txt_title) {
            this.txt_title.text = value;
        }
    }


    /**
     * 设置红点是否显示
     * @param value 红点是否显示
     */
    setRedDotVisible(value: boolean) {
        if (this.redDot) {
            UIUtils.setActive(this.redDot, value);
        }
    }

    /**
     * 设置红点标题
     * @param value 标题
     */
    setRedDotTitle(value: string) {
        if (this.redDot) {
            const txt_title = ElemFinder.getText(this.redDot, "txt_title");
            if (txt_title) {
                txt_title.text = value;
            }
        }
    }

    /**
     * 设置按钮是否显示
     * @param value 显示标记
     */
    setVisible(value: boolean) {
        if (this.rootNode) {
            UIUtils.setActive(this.rootNode, value);
        }
    }
}