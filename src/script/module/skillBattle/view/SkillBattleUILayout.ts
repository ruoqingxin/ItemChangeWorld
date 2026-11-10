import type { UIBaseView } from "../../../games/ui/UIBaseView";

export type SkillBattlePage = "start" | "battle" | "settlement" | "inventory" | "build" | "map";

/** Positions in the 1280x720 design space, independent of authored region parents. */
export function pagePosition(node: Laya.GWidget, root: Laya.GWidget): Laya.Point {
    const point = new Laya.Point(node.x, node.y);
    let parent = node.parent as Laya.GWidget;
    while (parent && parent !== root) {
        point.x += parent.x; point.y += parent.y;
        parent = parent.parent as Laya.GWidget;
    }
    return point;
}

export function placeInPage(node: Laya.GWidget, root: Laya.GWidget, x: number, y: number): void {
    const origin = node.parent === root ? new Laya.Point() : pagePosition(node.parent as Laya.GWidget, root);
    node.pos(x - origin.x, y - origin.y);
}

/** Region containers stay visible; renderers control only their mapped content. */
export function visitRegion(view: UIBaseView, root: Laya.GWidget,
    visit: (node: Laya.GWidget) => boolean | void): void {
    for (let i = 0; i < root.numChildren; i++) {
        const node = root.getChildAt(i) as Laya.GWidget;
        if (!view.getElement(node.name, false)) continue;
        if (node.name === "adapter" || node.name.endsWith("Area")) visitRegion(view, node, visit);
        else if (visit(node) !== false) visitRegion(view, node, visit);
    }
}
