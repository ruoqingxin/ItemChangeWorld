/*
 * @Author: GaryJy 1035465291@qq.com
 * @Date: 2024-04-30 17:08:16
 * @LastEditors: GaryJy 1035465291@qq.com
 * @LastEditTime: 2024-04-30 17:08:20
 * @FilePath: \minigame3.0\src\script\Event\EventEngine.ts
 * @Description: 
 */
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