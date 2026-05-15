import { ListItemCtrl } from "../uilib/ListItemCtrl";
import { List } from "../uilib/List";
import { UIButton } from "../ui/UIButton";

/**
 * 节点查找辅助类
 */
export class ElemFinder {
    private static _getVarOrPath(node: any, path: string) {
        if (!node) {
            return null;
        }
        let ispath = path.indexOf('/');
        if (ispath > 0) {
            let pathlist = path.split('/');
            let children = node;
            let p;
            let find = false;
            for (let i = 0, len = pathlist.length; i < len; i++) {
                p = pathlist[i];
                children = children._children;
                find = false;
                if (!children) {
                    break;
                }
                for (let child of children) {
                    if (child.name == p) {
                        children = child;
                        find = true;
                        break;
                    }
                }
                if (!find) {
                    children = null;
                    break;
                }
            }
            return children;
        }
        else if (node._children) {
            for (let child of node._children) {
                if (child.name == path) {
                    return child;
                }
            }
        }
        return null;
    }

    /**
     * 查找指定路径节点
     * @param node 目标节点
     * @param path 全路径
     */
    static getElement<T extends Laya.Sprite = Laya.Sprite>(node: Laya.Sprite, path: string): T {
        return this._getVarOrPath(node, path);
    }

    /**
     * 获取一个文本
     * @param node 目标节点
     * @param name 节点路径
     * @returns
     */
    static getText(node: Laya.Sprite, name: string): Laya.GTextField {
        return this.getElement(node, name);
    }

    /**
     * 获取一个ui节点
     * @param node 目标节点
     * @param name 节点路径
     * @returns
     */
    static getWidget(node: Laya.Sprite, name: string): Laya.GWidget {
        return this.getElement(node, name);
    }

    /**
     * 获取一个按钮
     * @param node 目标节点
     * @param name 节点路径
     * @returns
     */
    static getButton(node: Laya.Sprite, name: string): Laya.GButton {
        return this.getElement(node, name);
    }

    /**
     * 获取输入框
     * @param node 目标节点
     * @param name 节点路径
     * @returns
     */
    static getTextInput(node: Laya.Sprite, name: string): Laya.GTextInput {
        return this.getElement(node, name);
    }

    /**
     * 获取图片节点 
     * @param node 目标节点
     * @param name 节点路径
     * @returns 
     */
    static getImage(node: Laya.Sprite, name: string): Laya.GImage {
        return this.getElement(node, name);
    }

    /**
     * 获取加载器节点
     * @param node 目标节点
     * @param name 节点路径
     * @returns 
     */
    static getLoader(node: Laya.Sprite, name: string): Laya.GLoader {
        return this.getElement(node, name);
    }

    /**
     * 获取面板节点
     * @param node 目标节点
     * @param name 节点路径
     * @returns 
     */
    static getPanel(node: Laya.Sprite, name: string): Laya.GPanel {
        let panel = this.getElement(node, name) as Laya.GPanel;
        if (!panel) {
            return null;
        }
        return panel;
    }

    /**
     * 获取进度条节点
     * @param node 目标节点
     * @param name 节点路径
     * @returns 
     */
    static getSlider(node: Laya.Sprite, name: string): Laya.GSlider {
        return this.getElement(node, name);
    }

    /**
     * 获取list对象
     * @param node 目标节点
     * @param name 节点路径
     * @returns 
     */
    static getList<R extends ListItemCtrl>(node: Laya.Sprite, name: string): List<R> {
        let list = this.getElement(node, name) as Laya.GList;
        if (!list) {
            return null;
        }
        return new List(list);
    }

    /**
     * 获取自定义按钮
     * @param node 目标节点
     * @param name 节点路径
     * @returns 
     */
    static getUIButton(node: Laya.Sprite, name: string): UIButton {
        let btn = this.getElement(node, name) as Laya.GWidget;
        if (!btn) {
            return null;
        }
        return new UIButton(btn);
    }
}