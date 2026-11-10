/** Viewport backgrounds follow the chess client's cover-and-center layout. */
export class UIViewportLayout {
    private static readonly backgrounds = new WeakMap<Laya.GImage, {
        viewport: Laya.GWidget; parent: Laya.Sprite; width: number; height: number; resize: () => void;
    }>();

    static coverBackground(image: Laya.GImage, viewport: Laya.GWidget): void {
        const previous = this.backgrounds.get(image);
        const width = previous?.width ?? image.width;
        const height = previous?.height ?? image.height;
        if (width <= 0 || height <= 0) return;
        if (previous) {
            previous.viewport.off(Laya.Event.RESIZE, image, previous.resize);
            previous.parent.off(Laya.Event.MOVED, image, previous.resize);
        }
        image.autoSize = false;
        image.clearRelations();
        const resize = () => {
            if (image.destroyed || !image.parent) return;
            const scale = Math.max(viewport.width / width, viewport.height / height);
            const center = new Laya.Point(viewport.width / 2, viewport.height / 2);
            viewport.localToGlobal(center, false);
            image.parent.globalToLocal(center, false);
            image.scale(scale, scale);
            image.pos(center.x + (image.anchorX - 0.5) * width * scale,
                center.y + (image.anchorY - 0.5) * height * scale);
        };
        this.backgrounds.set(image, { viewport, parent: image.parent, width, height, resize });
        viewport.on(Laya.Event.RESIZE, image, resize);
        // A background nested in a centered adapter must follow its final offset.
        image.parent.on(Laya.Event.MOVED, image, resize);
        resize();
    }
}
