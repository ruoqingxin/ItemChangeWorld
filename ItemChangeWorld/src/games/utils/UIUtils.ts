
import { UIMaterialColorUtils } from "./UIMaterialColorUtils";
import { UIClickListener } from "../ui/components/UIClickListener";
import { SoundManager } from "../sound/SoundManager";

declare type TNodeCopy<T> = T extends Laya.Prefab ? Laya.Sprite : T
/**
 * ui工具类
 */
export class UIUtils {
    /**
     * 临时point
     */
    private static readonly tempPoint: Laya.Point = new Laya.Point();
    private static _getComponentsInChildren<T extends Laya.Component>(node: Laya.Node, t: new () => T, comList: any[]) {
        let com = node.getComponent(t);
        if (com) {
            comList.push(com);
        }
        for (let i = 0, len = node.numChildren; i < len; i++) {
            let child = node.getChildAt(i);
            this._getComponentsInChildren(child, t, comList);
        }
    }

    /**
     * 获取子节点（包括自己）指定类型所有组件
     * @param node 节点
     * @param t 组件类型
     * @returns 
     */
    static getComponentsInChildren<T extends Laya.Component>(node: Laya.Node, t: new () => T): T[] {
        let comList: T[] = [];
        this._getComponentsInChildren(node, t, comList);
        return comList;
    }

    /**
     * 设置节点显示状态
     * @param node 节点
     * @param value 是否显示
     */
    static setActive(node: Laya.Sprite, value: boolean) {
        if (!node) {
            return;
        }
        node.active = value;
        node.visible = value;
    }

    /**
     * 设置节点controller状态
     * @param node 节点
     * @param index 状态下标
     * @param cname ctrl 名称， 默认 = c1
     */
    static setNodeCtrlStatus(node: Laya.GWidget, index: number, cname: string = "c1") {
        const ctrl = node.getController(cname);
        if (ctrl) {
            ctrl.selectedIndex = index;
        }
    }

    /**
     * 设置节点颜色
     * @param node 节点
     * @param color 颜色 RGB FFFFFF
     */
    static setNodeFilterColor(node: Laya.GWidget, color: string) {
        UIMaterialColorUtils.setNodeFilterColor(node, color);
    }


    /**
     * 自定义实现的对UI节点的拷贝
     * @param node 
     */
    static instantiateUINode<T extends Laya.GWidget | Laya.Prefab>(node: T): TNodeCopy<T> {
        if (node instanceof Laya.GWidget) {
            let __raw: any = (node as any).__raw;
            if (__raw) {
                return Laya.HierarchyParser.parse(__raw)[0] as TNodeCopy<T>;
            }
            else {
                console.error("节点拷贝失败，请检查是否添加到ElementMapper内");
                return null;
            }
        }
        else if (node instanceof Laya.Resource) {
            return node.create() as TNodeCopy<T>;
        }
        else {
            return Laya.HierarchyParser.parse(node)[0] as TNodeCopy<T>;

        }
    }

    /**
     * 获取相对于Image路径的图片url
     * @param imageFolder Image文件夹内部子文件夹名称
     * @param imageName 图片名称，不带后缀名
     * @param ext 后缀名 默认 = png
     */
    static getImageUrl(imageFolder: string, imageName: string, ext: string = 'png') {
        if (!imageName) {
            return "";
        }
        return `ui/image/${imageFolder}/${imageName}.${ext}`;
    }

    /**
     * 获取相对于Texture路径的图片url
     * @param imageFolder Texture文件夹内部子文件夹名称
     * @param imageName 图片名称，不带后缀名
     * @param ext 后缀名 默认 = png
     */
    static getTextureUrl(imageFolder: string, imageName: string, ext: string = 'png') {
        if (!imageName) {
            return "";
        }
        return `ui/texture/${imageFolder}/${imageName}.${ext}`;
    }

    /**
     * 获取一个url的html表示
     * @param url 资源路径
     * @param width 宽 默认 = 0
     * @param height 高 默认 = 0
     * @returns 
     */
    static getHtmlPath(url: string, width: number = 0, height: number = 0) {
        if (width == 0 || height == 0) {
            return `<img src='${url}'/>`;
        }
        else {
            return `<img src='${url}' width = ${width} height=${height}/>`;
        }
    }

    /**
     * 获取格式化文本。
     * @param str 待格式化文本。
     * @param color 颜色码，如ff0000
     * @param size 字号，0表示不设置
     */
    static getColorText(str: string, color: string, size: number = 0): string {
        if (null != color) {
            if (!color.startsWith("#")) {
                color = "#" + color;
            }
            if (size > 0) {
                str = `<font color=${color} size=${size}>${str}</font>`;
            }
            else {
                str = `<font color=${color}>${str}</font>`;
            }
        }
        return str;
    }

    /**数组打乱顺序 */
    public static shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }


    /**
    * 绑定按钮点击
    * @param element 节点
    * @param callthis 回调对象
    * @param callback 回调函数
    * @param clickSound 点击音效 默认 = SoundID.SYS_BTNCLICK
    */
    static addClickListener(element: Laya.Sprite, callthis: any, callback: (...args) => void, clickSound: string = SoundManager.COMMON_CLICK_SOUND, ...args) {
        if (element == null) {
            return null;
        }
        const listener = UIClickListener.create(element);
        listener.onClick = () => {
            if (clickSound) {
                SoundManager.ins().playSound(clickSound);
            }
            if (callback) {
                callback.apply(callthis, args);
            }
        }
        return listener;
    }

    /**
     * 限制文本长度并返回新的文本（中文 = 2字符）
     * @param str 原始字符串
     * @param length 目标长度
     * @returns 新文本
     */
    public static getCN_EN_Str(str: string, length: number = 12) {
        let j = 0;
        let strLists: number[] = [];
        let tmp: string = "";
        for (let i = 0; i < str.length; i++) {
            if (str.charCodeAt(i) > 127) {
                j += 2
            } else {
                j++
            }
            if (j > length) {
                break;
            }
            strLists.push(i);
        }
        for (let item in strLists) {
            tmp += str.charAt(strLists[item])
        }
        return tmp;
    }

    /**
     * 限制输入文本长度
     * @param input input
     * @param length 目标长度
     */
    public static limitInputLength(input: Laya.GTextInput, length: number) {
        input.textIns.on(Laya.Event.BLUR, this, () => {
            const str = this.getCN_EN_Str(input.text, length);
            input.text = str;
        });
    }

    /**
     * 输入框blur事件监听
     */
    public static addInputBlurListener(input: Laya.GTextInput, callthis: any, callback: (...args) => void) {
        input.textIns.on(Laya.Event.BLUR, callthis, callback);
    }

    /**
     * 输入框input事件监听
     */
    public static addInputInputListener(input: Laya.GTextInput, callthis: any, callback: (...args) => void) {
        input.textIns.on(Laya.Event.INPUT, callthis, callback);
    }

    /**
     * 设置图片的进度
     * @param image 目标图片节点
     * @param fillAmount 进度
     */
    public static setImageFillAmount(image: Laya.GImage, fillAmount: number) {
        const mesh: Laya.ProgressMesh = image.mesh as Laya.ProgressMesh;
        if (!mesh) {
            return;
        }
        mesh.amount = fillAmount;
        image.graphics?.repaint();
    }

    /**
     * 设置图片的进度(宽度)
     * @param image 目标图片节点
     * @param widthMax 最大宽度
     * @param fillAmount 进度
     * @returns 
     */
    public static setImageWidthFillAmount(image: Laya.GImage, widthMax: number, fillAmount: number) {
        image.width = widthMax * fillAmount;
    }

    /**
     * 设置图片水平翻转
     * @param image 目标图片节点
     * @param flip 是否翻转
     * @returns 
     */
    public static setImageFlipX(image: Laya.GImage, flip: boolean) {
        const mesh: Laya.FlipMesh = image.mesh as Laya.FlipMesh;
        if (!mesh) {
            return;
        }
        mesh.flipX = flip;
    }

    /**
     * 将两个点进行坐标转换
     * @param from 源节点
     * @param to 目标节点
     * @returns 
     */
    public static convertPos(from: Laya.GWidget, to: Laya.GWidget) {
        const point = new Laya.Point(from.width * from.anchorX, from.height * from.anchorY);
        from.localToGlobal(point, false);
        (to.parent || Laya.stage).globalToLocal(point, false);
        return point;
    }

    /**
     * 将屏幕坐标转到局部坐标
     * @param x x
     * @param y y
     * @param to 目标节点
     * @returns 
     */
    public static convertScreenPosToLocal(x: number, y: number, to: Laya.Sprite, out: Laya.Point) {
        if (!out) {
            out = new Laya.Point(x, y);
        }
        else {
            out.setTo(x, y);
        }
        (to?.parent || Laya.stage).globalToLocal(out, false);
    }

    /**3D空间位置转换为2d设计尺寸（1280 * 720）对应位置 */
    public static convertThreeD2TwoD(camera: Laya.Camera, position: Laya.Vector3, targetNode: Laya.Sprite, out: Laya.Vector2 = null): Laya.Vector2 {
        if (!out) {
            out = new Laya.Vector2();
        }
        camera.worldToViewportPoint(position, Laya.Vector4.TEMP);
        if (position) {
            camera.viewport.project(position, camera.projectionViewMatrix, Laya.Vector4.TEMP);
        }
        out.x = Laya.Vector4.TEMP.x / Laya.stage.clientScaleX;
        out.y = Laya.Vector4.TEMP.y / Laya.stage.clientScaleY;
        UIUtils.convertScreenPosToLocal(out.x, out.y, targetNode, this.tempPoint);
        out.x = this.tempPoint.x;
        out.y = this.tempPoint.y;
        return out;
    }
}