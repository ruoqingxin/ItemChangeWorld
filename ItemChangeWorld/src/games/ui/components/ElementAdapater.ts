const { regClass, classInfo, runInEditor, property } = Laya;

@regClass()
@classInfo({
    menu: "UI扩展",
    caption: "ElementAdapater",
})
/**
 * 自动适配脚本
 */
export class ElementAdapater extends Laya.Script {
    declare owner: Laya.GWidget;

    @property({ type: Laya.GWidget })
    public target: Laya.GWidget;

    @property({ type: Boolean, defaultValue: false, tips: "是否忽略动画" })
    public ingoreAnim: boolean = false;

}