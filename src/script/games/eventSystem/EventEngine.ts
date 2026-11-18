

import { RedDotManager } from "../reddot/RedDotManager";

export default class EventEngine {
    static appName: string = "default";

    public static registerEvent(eventId: number, thiz: any, func: Function): void {
        asgard.events.EventsDispatcher.registerEventListener(this.appName, eventId, thiz, func);
    }

    public static unregisterEvent(eventId: number, thiz: any, func: Function): void {
        asgard.events.EventsDispatcher.unregisterEventListener(this.appName, eventId, thiz, func);
    }

    public static dispatchEvent(eventId: number, args?: any[]): void {
        asgard.events.EventsDispatcher.eventNotify(this.appName, eventId, args);
        RedDotManager.ins().onEvent(eventId);
    }

}