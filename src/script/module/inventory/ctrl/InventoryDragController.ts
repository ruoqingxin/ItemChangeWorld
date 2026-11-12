export interface InventoryDragCallbacks {
    begin(key: string, point: Laya.Point): boolean;
    move(point: Laya.Point): void;
    release(): void;
    cancel(): void;
    rotate(): void;
}

/** Captures one pointer; a second finger remains available for the rotate control. */
export class InventoryDragController {
    private pointer: number | null = null;
    private origin: Laya.Point;
    private key = "";
    active = false;
    private ignoreClickUntil = 0;
    constructor(private readonly root: Laya.GWidget, private readonly callbacks: InventoryDragCallbacks) {}
    arm(key: string, event: Laya.Event): void {
        if (this.pointer !== null || event.button === 2) return;
        this.pointer = event.touchId;
        this.origin = this.point(event);
        this.key = key;
        Laya.stage.on(Laya.Event.MOUSE_MOVE,this,this.move);
        Laya.stage.on(Laya.Event.MOUSE_UP,this,this.release);
        Laya.stage.on(Laya.Event.KEY_DOWN,this,this.keyDown);
        window.addEventListener("mousedown",this.rightDown,true);
        Laya.stage.on(Laya.Event.RESIZE,this,this.cancel);
        window.addEventListener("blur",this.cancel);
        window.addEventListener("touchcancel",this.cancelTouch,true);
        window.addEventListener("pointercancel",this.cancelPointer,true);
        document.addEventListener("visibilitychange",this.visibility);
        window.addEventListener("mouseup",this.outsideRelease);
        window.addEventListener("contextmenu",this.contextMenu);
    }
    suppressClick(): boolean { return Date.now() < this.ignoreClickUntil; }
    private point(event: Laya.Event): Laya.Point {
        return this.root.globalToLocal(new Laya.Point(event.touchPos.x,event.touchPos.y));
    }
    private move(event: Laya.Event): void {
        if (event.touchId !== this.pointer) return;
        const point = this.point(event);
        if (!this.active) {
            if (Math.hypot(point.x - this.origin.x,point.y - this.origin.y) < 6) return;
            if (!this.callbacks.begin(this.key,this.origin)) { this.detach(); return; }
            this.active = true;
            Laya.InputManager.cancelClick(this.pointer!);
        }
        this.callbacks.move(point);
    }
    private release(event: Laya.Event): void {
        if (event.touchId !== this.pointer) return;
        if (!this.active) { this.detach(); return; }
        this.callbacks.move(this.point(event));
        if (!this.active) return;
        Laya.InputManager.cancelClick(this.pointer!);
        this.ignoreClickUntil = Date.now() + 32;
        this.detach();
        this.callbacks.release();
    }
    private keyDown(event: Laya.Event): void {
        const key = (event.nativeEvent as KeyboardEvent)?.key;
        if (key === "Escape") this.cancel();
        else if (this.active && key?.toLowerCase() === "r" && !(event.nativeEvent as KeyboardEvent).repeat)
            this.callbacks.rotate();
    }
    private rightDown = (event: MouseEvent): void => {
        if (this.active && event.button === 2) { event.preventDefault(); this.callbacks.rotate(); }
    };
    private contextMenu = (event: Event): void => { if (this.active || this.pointer !== null) event.preventDefault(); };
    private visibility = (): void => { if (document.hidden) this.cancel(); };
    private cancelTouch = (event: TouchEvent): void => {
        if (Array.from(event.changedTouches).some(t => t.identifier === this.pointer)) this.cancel();
    };
    private cancelPointer = (event: PointerEvent): void => { if (event.pointerType !== "touch") this.cancel(); };
    private outsideRelease = (event: MouseEvent): void => {
        if (event.button === 0 && this.pointer !== null) this.cancel();
    };
    cancel = (): void => {
        const active = this.active;
        if (active) {
            Laya.InputManager.cancelClick(this.pointer!);
            this.ignoreClickUntil = Date.now() + 32;
        }
        this.detach();
        if (active) this.callbacks.cancel();
    };
    private detach(): void {
        this.pointer = null; this.active = false;
        Laya.stage.off(Laya.Event.MOUSE_MOVE,this,this.move);
        Laya.stage.off(Laya.Event.MOUSE_UP,this,this.release);
        Laya.stage.off(Laya.Event.KEY_DOWN,this,this.keyDown);
        window.removeEventListener("mousedown",this.rightDown,true);
        Laya.stage.off(Laya.Event.RESIZE,this,this.cancel);
        window.removeEventListener("blur",this.cancel);
        window.removeEventListener("touchcancel",this.cancelTouch,true);
        window.removeEventListener("pointercancel",this.cancelPointer,true);
        document.removeEventListener("visibilitychange",this.visibility);
        window.removeEventListener("mouseup",this.outsideRelease);
        window.removeEventListener("contextmenu",this.contextMenu);
    }
}
