const { regClass, classInfo, runInEditor, property } = Laya;
/**
 * 等待文本组件，会自动播放。。。动画
 * 如果文本修改，建议删除脚本重新挂载
 */
@regClass()
@classInfo({
    menu: "UI扩展",
    caption: "UITextWaiting",
})
export class UITextWaiting extends Laya.Script {
    //declare owner : Laya.Sprite3D;
    //declare owner : Laya.Sprite;
    private _text: string;
    private _counter: number = 0;
    waitChar = '.';

    /**
     * 创建等待文本组件
     * @param node 文本节点
     * @returns 等待文本组件
     */
    static create(node: Laya.GTextField): UITextWaiting {
        const component = node.getComponent(UITextWaiting);
        if (component) {
            component.destroy();
        }
        return node.addComponent(UITextWaiting);
    }

    onAwake(): void {
        this._text = (this.owner as Laya.GTextField).text;
    }

    onEnable(): void {
        this.onTick();
        Laya.timer.loop(500, this, this.onTick);
    }

    onTick(): void {
        this._counter++;
        let pointText = "";
        for (let i = 0; i < this._counter; i++) {
            pointText += this.waitChar;
        }
        (this.owner as Laya.GTextField).text = this._text + pointText;
        if (this._counter >= 3) {
            this._counter = 0;
        }
    }
}