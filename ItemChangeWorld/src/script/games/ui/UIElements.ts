import { Asset } from "../asset/Asset";
import { List } from "../uilib/List";
import { ListItemCtrl } from "../uilib/ListItemCtrl";
import { UIButton } from "./UIButton";
import { ElementMapper, MapperTypeEnum } from "./components/ElementMapper";


export class UIElements {
    root: Laya.Sprite;
    elementMapper: ElementMapper;
    private _prefabMap: { [key: number]: Laya.Prefab } = {};
    private _asset: Asset;
    private _mapperType: MapperTypeEnum;
    /**
     * mapper类型
     */
    public get mapperType() {
        return this._mapperType;
    }
    constructor(form: Laya.GWidget, asset: Asset) {
        this._asset = asset;
        this.root = form;
        const component = form.getComponent(ElementMapper);
        this.elementMapper = component;
        if (component) {
            this._mapperType = component.mapperType;
            if (component.elements) {
                const _emap = asset.getEMap();
                let eArray = []
                const comp = ((form as any).__raw)?._$comp ?? asset._res.data._$comp;
                for (let com of comp) {
                    if (com.elements) {
                        for (let element of com.elements) {
                            if (element) {
                                eArray.push(_emap[element._$ref]);
                            }
                        }
                        break;
                    }
                }
                let addIndex = 0;
                for (let c of component.elements) {
                    if (c) {
                        this[c.name] = c;
                        if (eArray) {
                            (c as any).__raw = eArray[addIndex];
                            addIndex++;
                        }
                    }
                }
            }
            if (component.prefabs) {
                for (let c of component.prefabs) {
                    if (c) {
                        this._prefabMap[c.data.name] = c;
                    }
                }
            }
        }
        else {
            console.warn("uielems必须挂载ElementMapper:" + form.name);
        }
    }

    /**
     * 获取关联的预制体
     * @param name 名称
     * @param errorTip 是否提示错误
     * @returns 
     */
    getPrefab(name: string, errorTip: boolean = true): Laya.PrefabImpl {
        let data = this._prefabMap[name];
        if (!data) {
            if (errorTip) {
                console.error("找不到节点：" + name);
            }
            return null;
        }
        return data;
    }

    /**
     * 获取ui节点
     * @param name 节点名称
     * @returns 
     */
    getUIElements(name: string): UIElements {
        let data = this[name];
        if (!data) {
            console.error("找不到节点：" + name);
            return null;
        }
        return new UIElements(data, this._asset);
    }
    /**
     * 获取ui元素
     * @param name 节点名称
     * @param errorTip 找不到节点提示
     * @returns
     */
    getElement<T extends Laya.Sprite = Laya.Sprite>(name: string, errorTip: boolean = true): T {
        let data = this[name];
        if (!data) {
            if (errorTip) {
                console.error("找不到节点：" + name);
            }
            return null;
        }
        return data;
    }

    /**
     * 获取一个文本
     * @param name 节点名称
     * @returns
     */
    getText(name: string): Laya.GTextField {
        return this.getElement(name);
    }

    /**
     * 获取一个ui节点
     * @param name 节点名称
     * @returns
     */
    getWidget(name: string): Laya.GWidget {
        return this.getElement(name);
    }

    /**
     * 获取一个按钮
     * @param name 节点名称
     * @returns
     */
    getButton(name: string): Laya.GButton {
        return this.getElement(name);
    }

    /**
     * 获取输入框
     * @param name 节点名称
     * @returns
     */
    getTextInput(name: string): Laya.GTextInput {
        return this.getElement(name);
    }

    /**
     * 获取图片节点 
     * @param name 节点名称
     * @returns 
     */
    getImage(name: string): Laya.GImage {
        return this.getElement(name);
    }

    /**
     * 获取加载器节点
     * @param name 节点名称
     * @returns 
     */
    getLoader(name: string): Laya.GLoader {
        return this.getElement(name);
    }

    /**
     * 获取面板节点
     * @param name 节点名称
     * @returns 
     */
    getPanel(name: string): Laya.GPanel {
        let panel = this.getElement(name) as Laya.GPanel;
        if (!panel) {
            return null;
        }
        return panel;
    }

    /**
     * 获取进度条节点
     * @param name 节点名称
     * @returns 
     */
    getSlider(name: string): Laya.GSlider {
        return this.getElement(name);
    }

    /**
     * 获取list对象
     * @param name 节点名称
     * @returns 
     */
    getList<R extends ListItemCtrl>(name: string): List<R> {
        let list = this.getElement(name) as Laya.GList;
        if (!list) {
            return null;
        }
        return new List(list);
    }

    /**
     * 获取自定义按钮
     * @param name 节点名称
     * @returns 
     */
    getUIButton(name: string): UIButton {
        let btn = this.getElement(name) as Laya.GWidget;
        if (!btn) {
            return null;
        }
        return new UIButton(btn);
    }
}