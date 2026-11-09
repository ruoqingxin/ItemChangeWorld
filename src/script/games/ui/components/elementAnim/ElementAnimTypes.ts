export enum OutsideFromType {
    Top = 0,
    Right = 1,
    Bottom = 2,
    Left = 3,
}

export interface IElementAnimPlayable {
    playOnEnable: boolean;
    resetNode(): void;
    clearAllTweens(): void;
    play(onComplete?: () => void, isHor?: boolean): void;
}

/** UI 动画编辑器菜单分类，与 ElementAnimIn/Out/InHor 基类一一对应 */
export const ElementAnimMenuGroup = {
    /** 对应 ElementAnimInBase */
    In: "UI动画-入场",
    /** 对应 ElementAnimOutBase */
    Out: "UI动画-出场",
    /** 对应 ElementAnimInHorBase */
    InHor: "UI动画-横屏",
} as const;

/** 入场动画基类，供 form.getComponents 批量收集（勿直接挂到节点） */
export class ElementAnimInBase extends Laya.Script implements IElementAnimPlayable {
    playOnEnable: boolean = true;
    resetNode(): void { }
    clearAllTweens(): void { }
    play(_onComplete?: () => void, _isHor?: boolean): void { }
}

/** 出场动画基类 */
export class ElementAnimOutBase extends Laya.Script implements IElementAnimPlayable {
    playOnEnable: boolean = true;
    resetNode(): void { }
    clearAllTweens(): void { }
    play(_onComplete?: () => void, _isHor?: boolean): void { }
}

/** 横屏入场动画基类（与 ElementAnimInBase 分开收集，避免横竖屏重复播放） */
export class ElementAnimInHorBase extends Laya.Script implements IElementAnimPlayable {
    playOnEnable: boolean = true;
    resetNode(): void { }
    clearAllTweens(): void { }
    play(_onComplete?: () => void, _isHor?: boolean): void { }
}

export function collectElementAnimIn(form: Laya.Node): IElementAnimPlayable[] {
    return form.getComponents(ElementAnimInBase) as unknown as IElementAnimPlayable[];
}

export function collectElementAnimOut(form: Laya.Node): IElementAnimPlayable[] {
    return form.getComponents(ElementAnimOutBase) as unknown as IElementAnimPlayable[];
}

export function collectElementAnimInHor(form: Laya.Node): ElementAnimInHorBase {
    const list = form.getComponents(ElementAnimInHorBase) as unknown as ElementAnimInHorBase[];
    return list.length > 0 ? list[0] : null;
}

export interface ElementTargetInfo {
    node: Laya.Sprite;
    x: number;
    y: number;
}

export class ElementAnimHelper {
    /** 仅清理本脚本创建的 tween，避免误杀同节点上其他动画组件的 tween */
    public static clearTweens(lifecycleOwner: { destroyed: boolean }): void {
        Laya.Tween.killAll(lifecycleOwner);
    }

    public static asSprite(node: Laya.Node): Laya.Sprite {
        if (!node || !(node instanceof Laya.Sprite)) {
            return null;
        }
        return node;
    }

    public static asList(node: Laya.Node): Laya.GList {
        if (!node || !(node instanceof Laya.GList)) {
            return null;
        }
        return node;
    }

    public static getOutsidePos(node: Laya.Sprite, from: OutsideFromType, padding: number): Laya.Point {
        const parent = node.parent as Laya.Sprite;
        const parentWidth = parent?.width || Laya.stage.width;
        const parentHeight = parent?.height || Laya.stage.height;

        const nodeWidth = node.width || 0;
        const nodeHeight = node.height || 0;
        const pivotX = node.pivotX || 0;
        const pivotY = node.pivotY || 0;

        const targetX = node.x;
        const targetY = node.y;

        switch (from) {
            case OutsideFromType.Top:
                return new Laya.Point(targetX, pivotY - nodeHeight - padding);
            case OutsideFromType.Right:
                return new Laya.Point(parentWidth + pivotX + padding, targetY);
            case OutsideFromType.Bottom:
                return new Laya.Point(targetX, parentHeight + pivotY + padding);
            case OutsideFromType.Left:
                return new Laya.Point(pivotX - nodeWidth - padding, targetY);
            default:
                return new Laya.Point(targetX, targetY);
        }
    }

    public static restorePositionTargets(targetInfoList: ElementTargetInfo[]): void {
        for (let i = 0; i < targetInfoList.length; i++) {
            const info = targetInfoList[i];
            if (info.node.destroyed) continue;
            info.node.pos(info.x, info.y);
        }
    }

    public static restorePositionTargetsWithAlpha(targetInfoList: ElementTargetInfo[], alpha: number = 1): void {
        for (let i = 0; i < targetInfoList.length; i++) {
            const info = targetInfoList[i];
            if (info.node.destroyed) continue;
            info.node.pos(info.x, info.y);
            info.node.alpha = alpha;
        }
    }

    public static tweenTo(node: Laya.Sprite, lifecycleOwner: any, toX: number, toY: number, duration: number, delay: number, callback?: () => void): void {
        Laya.Tween.create(node, lifecycleOwner)
            .delay(delay)
            .duration(duration)
            .ease(Laya.Ease.strongOut)
            .to("x", toX)
            .to("y", toY)
            .then(() => {
                if (callback) {
                    callback();
                }
            });
    }
}
