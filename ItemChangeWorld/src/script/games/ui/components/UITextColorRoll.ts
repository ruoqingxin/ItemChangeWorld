const { regClass, property } = Laya;

@regClass()
export class UITextColorRoll extends Laya.Script {
    declare owner: Laya.GTextField;

    private _maskWidget: Laya.GWidget;
    private _maskText: Laya.Text;
    private _scrollBg: Laya.GImage;

    /**
     * 创建 UITextColorRoll 组件
     * @param owner Laya.Sprite
     * @returns UITextColorRoll
     */
    static create(owner: Laya.GTextField): UITextColorRoll {
        const script = owner.getComponent(UITextColorRoll);
        if (script) {
            // 触发刷新
            script.enabled = false;
            script.enabled = true;
            return script;
        }
        const newScript = owner.addComponent(UITextColorRoll);
        return newScript;
    }

    /**
     * 关闭 UITextColorRoll 组件
     * @param owner Laya.Sprite
     */
    static disable(owner: Laya.GTextField): void {
        const script = owner.getComponent(UITextColorRoll);
        if (script) {
            script.enabled = false;
        }
    }

    onEnable(): void {
        this.owner.textIns.typeset();

        // 1. 创建文字遮罩
        if (!this._maskWidget) {
            this._maskWidget = new Laya.GWidget();
            this._maskWidget.name = "maskWidget";
            this.owner.addChild(this._maskWidget);
        }
        this._maskWidget.size(this.owner.width, this.owner.height);
        this._maskWidget.pos(0, 0);
        this._maskWidget.visible = true;
        if (!this._maskText) {
            this._maskText = new Laya.Text();
            this._maskText.name = "mask";
            this._maskWidget.addChild(this._maskText);
            this.syncMaskText();
            this._maskText.pos(0, 0);
        }
        this._maskWidget.mask = this._maskText;

        // 2.创建遮罩背景
        if (!this._scrollBg) {
            const colorTextBg = `ui/texture/colorText/name_bg.png`;
            // 这里锁定资源，避免被垃圾回收
            const texture = Laya.loader.getRes(colorTextBg) as Laya.Texture;
            if (texture) {
                texture.lock = true;
            }
            this._scrollBg = new Laya.GImage();
            this._scrollBg.name = `bg`;
            this._scrollBg.src = colorTextBg;
            this._maskWidget.addChild(this._scrollBg);
            let subBg = new Laya.GImage();
            this._scrollBg.addChild(subBg);
            subBg.name = `subBg`;
            subBg.src = colorTextBg;
        }
        const width = this._maskWidget.width;
        const height = this._maskWidget.height;
        this._scrollBg.size(width, height);
        this._scrollBg.pos(0, 0);  // 相对于 field 的本地坐标
        this._scrollBg.getChildAt(0).size(width, height);
        this._scrollBg.getChildAt(0).pos(width, 0);
        this._scrollBg.visible = true;

        // 3. 隐藏真实的文本对象
        // 这里区分原始文本是否有描边
        if (this.owner.stroke > 0) {
            this.owner.textIns.visible = true;
        }
        else {
            this.owner.textIns.visible = false;
        }

        // 4. 启动滚动动画
        this.stopTween();
        this.startTween();
    }

    onDisable(): void {
        this.stopTween();
        // 清除遮罩关系
        if (this._maskWidget) {
            this._maskWidget.mask = null;
            this._maskWidget.visible = false;
        }
        // 不缓存mask节点，因为被自动设置成了位图，留着会内存占用
        if (this._maskText) {
            this._maskText.removeSelf();
            this._maskText.destroy();
            this._maskText = null;
        }
        if (this._scrollBg) {
            this._scrollBg.visible = false;
        }
        // 展示真实文本
        this.owner.textIns.visible = true;
    }

    /**
     * 同步遮罩文字
     * @param maskText 遮罩文字
     * @param field GTextField
     */
    private syncMaskText(): void {
        const maskText = this._maskText;
        maskText.text = this.owner.text;
        maskText.font = this.owner.font;
        maskText.fontSize = this.owner.fontSize;
        maskText.color = "#FFFFFF";
        maskText.bold = this.owner.bold;
        maskText.italic = this.owner.italic;
        maskText.align = this.owner.align;
        maskText.valign = this.owner.valign;
        maskText.width = this.owner.width;
        maskText.height = this.owner.height;
        maskText.overflow = this.owner.overflow;
        maskText.wordWrap = this.owner.wordWrap;
        maskText.leading = this.owner.leading;
        maskText.stroke = 0;
        if (this.owner.padding) {
            maskText.padding = this.owner.padding;
        }
    }

    /**
     * 播放tween动画
     */
    private startTween() {
        this._scrollBg.x = 0;
        Laya.Tween.to(this._scrollBg, { x: -this._scrollBg.width }, 1500, Laya.Ease.linearIn,
            Laya.Handler.create(this, this.startTween)
        );
    }

    /**
     * 停止tween动画
     */
    private stopTween() {
        Laya.Tween.clearAll(this._scrollBg);
    }
}