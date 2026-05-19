declare module asgard.events {
    class EventsDispatcher {
        /**
         * 初始化事件管理器。
         * @param appname 所属项目名称
         */
        static init(appname: string)
        /**
         * 清理这个app下的所有事件。
         * @param appname 所属项目名称
         */
        static clearData(appname: string)
        /**
         * 注册事件。
         * @param appname 所属项目名称
         * @param eventid 事件id。
         * @param listener 执行域(this)。
         * @param action 回调方法。
         */
        static registerEventListener(appname: string, eventid: number, listener: any, action: Function)

        /**
         * 注销事件。
         * @param appname 所属项目名称
         * @param eventid 事件id。
         * @param listener 执行域(this)。
         * @param action 回调方法。
         */
        static unregisterEventListener(appname: string, eventid: number, listener: any, action: Function)

        /**
         * 事件通知。
         * @param appname 所属项目名称
         * @param eventid 事件id。
         * @param arg 事件参数列表。
         */
        static eventNotify(appname: string, eventid: number, arg?: Array<any>)
    }
}

declare module asgard.message {
    export abstract class BaseMessage {
        protected _connectionFlag: number;
        protected _dataLength: number;
        protected _bytes: Laya.Byte;

        protected returnMsg: any;

        getreturnMsg(): any

        setConnectionFlag(connectionFlag: number): void

        connectionFlag: number

        encode(): Laya.Byte

        decode(byteArray: Laya.Byte): void

        getByteArray(): Laya.Byte

        abstract getMessageType(): number;

        //	abstract excute():void;

        onEncode(): void

        onDecode(): void

        /*
         * 写入数据区域 
         */
        protected writeBoolean(data: boolean): void

        protected writeByte(data: number): void

        protected writeShort(data: number): void

        protected writeInt(data: number): void

        protected writeLong(data: number): void

        protected writeFloat(data: number): void

        protected writeDouble(data: number): void

        protected writeString(data: string): void

        /*
        * 写入数据区域 
        */
        protected readBoolean(): boolean

        protected readByte(): number

        protected readShort(): number

        protected readInt(): number

        protected readInt64(): asgard.utils.Int64

        protected readFloat(): number

        protected readDouble(): number

        protected readString(): string
        toString(): string
    }
}

declare module asgard.message {
    export interface IMessageFactory {
        /**
         * 所属项目名称，区分大厅和子游戏用的。
         */
        getAppName(): string;
        /**
         * 消息的解析方法。
         */
        getMessage(msgId: number): asgard.utils.SimpleDelegate;
        /**
         * 消息的回调方法。
         */
        getHandler(msgId: number): asgard.utils.SimpleDelegate;
        /**
         * 注册所有的消息。
         */
        init(): void;
        /**
         * 清理所有的消息。
         */
        clearData(): void;
    }
}

declare module asgard.message {
    export class MessageDispatcher {
        /**
         * 初始化消息工厂。
         */
        static init(messageFactory: asgard.message.IMessageFactory): void
        /**
         * 清理消息工厂。
         * @param appname 所属项目名称
         */
        static clearData(appname: string): void
        /**
         * 服务器下行消息处理，包含解析消息和调用消息回调方法。
         */
        static _onMessageNotify(connectionFlag: string, msgId: number, msgData: Laya.Byte): void
    }
}

declare module asgard.module {
    export class BaseModule {
        protected _appName: string;
        protected _moduleId: number;

        /**
         * @private
         * @param appname 所属项目名称。
         * @param moduleId 数据类的ID。
         */
        constructor(appname: string, moduleId: number)

        /**
         * 所属项目名称，区分大厅和子游戏用的。
         */
        appName: string
        /**
         * 数据类ID。
         */
        moduleId: number

        /**
         * 清理数据。
         */
        clearData(): void
    }
}

declare module asgard.module {
    export interface IModuleFactory {
        /**
         * 所属项目名称，区分大厅和子游戏用的。
         */
        getAppName(): string;
        /**
         * 根据ID获取数据类。
         */
        getModule(moduleid: number): BaseModule;
    }
}

declare module asgard.module {
    export class ModuleManager {
        /**
         * 初始化数据工厂。
         */
        static init(moduleFactory: IModuleFactory): void
        /**
         * 清理这个app对应的数据工厂下的数据类的数据。
         * @param appname 所属项目名称。
         */
        static clearModuleData(appname: string): void
        /**
         * 清理这个app对应的数据工厂。
         * @param appname 所属项目名称。
         */
        static clearData(appname: string): void
        /**
         * 查找获取数据类。
         * @param appname 所属项目名称。
         * @param moduleId 数据类的ID。
         */
        static findModule(appname: string, moduleId: number): BaseModule
        /**
         * 生产并返回数据类。
         * @param appname 所属项目名称。
         * @param moduleId 数据类的ID。
         */
        static getModule(appname: string, moduleId: number): BaseModule
    }
}

declare module asgard.net {
    import Event = Laya.Event;
    import Byte = Laya.Byte;
    import SimpleDelegate = asgard.utils.SimpleDelegate;

    export class NetEvents {
        /**
         * @private
         */
        constructor()
        /**
         * 注册数据连接事件监听。
         * @param actionType 事件类型。
         * @param caller 执行域(this)。
         * @param listener 监听方法。
         */
        registerEventListener(actionType: string, caller: any, listener: Function): void
        /**
         * 注销数据连接事件监听。
         * @param actionType 事件类型。
         */
        unregisterEventListener(actionType: string): void
        /**
         * 数据连接通知。
         */
        connectedNotify(): void
        /**
         * 数据连接关闭通知。
         */
        closeNotify(): void
        /**
         * 数据连接错误通知。
         */
        errorNotify(): void
        /**
         * 数据连接消息返回通知。
         */
        messageReceivedNotify(cmd: number, msgdata: Byte): void

    }
}

declare module asgard.net {
    export class NetSession {
        /**
         * @private
         * @param connectionFlag 数据连接标识。
         */
        constructor(connectionFlag: string)
        /**
         * 获取数据连接。
         */
        ConnectionFlag: string
        /**
         * 判断是否已连接。
         */
        IsConnected: boolean
        /**
         * 设置连接回调
         * @param caller 执行域(this)。
         * @param handler 回调方法。
         */
        setConnectedNotify(caller: any, handler: Function): void
        /**
         * 设置处理消息回调
         * @param caller 执行域(this)。
         * @param handler 回调方法。
         */
        setMessageNotify(caller: any, handler: Function): void
        /**
         * 设置连接关闭回调
         * @param caller 执行域(this)。
         * @param handler 回调方法。
         */
        setCloseNotify(caller: any, handler: Function): void
        /**
         * 设置连接错误回调
         * @param caller 执行域(this)。
         * @param handler 回调方法。
         */
        setErrorNotify(caller: any, handler: Function): void
        /**
         * 连接服务器 WebSocket连接
         * @param svrAddress 连接地址。
         * @param svrPort 连接端口。
         */
        tryConnection(svrAddress: string, svrPort: number): void
        /**
         * 连接服务器 HTTP连接
         * @param url 连接地址。
         */
        tryConnectionByUrl(url: string): void
        /**
         * 连接回调
         */
        OnConnected(): void
        /**
         * 发送消息
         * @param msgID 消息ID。
         * @param arraybuffer 上发的消息内容。
         */
        sendMessage(msgID: number, arraybuffer: any): void
        /**
         * 消息处理回调
         * @param msgId 消息ID。
         * @param msgData 服务器下发的消息内容。
         */
        OnMsgReceive(msgId: number, msgData: Laya.Byte): void
        /**
         * 连接关闭
         */
        OnClose(): void
        /**
         * 连接错误
         */
        OnError(): void
    }

    export class NetManager {
        /**
         * 连接服务器 WebSocket连接
         * @param connectionFlag 数据连接标识。
         * @param svrAddress 连接地址。
         * @param svrPort 连接端口。
         * @param caller 执行域(this)。
         * @param onConnectedNotify 回调方法。
         */
        static tryConnect(connectionFlag: string, svrAddress: string, svrPort: number, caller: any, onConnectedNotify: Function): NetSession
        static close(connectionFlag: string): void;
        /**
         * 连接服务器 HTTP连接
         * @param connectionFlag 数据连接标识。
         * @param url 连接地址。
         * @param caller 执行域(this)。
         * @param onConnectedNotify 回调方法。
         */
        static tryConnectByUrl(connectionFlag: string, url: string, caller: any, onConnectedNotify: Function): NetSession
        /**
         * 连接关闭
         * @param connectionFlag 数据连接标识。
         * @param caller 执行域(this)。
         * @param onCloseNotify 回调方法。
         */
        static tryClose(connectionFlag: string, caller: any, onCloseNotify: Function): NetSession
        /**
         * 连接错误
         * @param connectionFlag 数据连接标识。
         * @param caller 执行域(this)。
         * @param onErrorNotify 回调方法。
         */
        static tryError(connectionFlag: string, caller: any, onErrorNotify: Function): NetSession
        /**
         * 发送消息
         * @param connectionFlag 数据连接标识。
         * @param msgID 消息ID。
         * @param arraybuffer 上发的消息内容。
         */
        static sendMessage(connectionFlag: string, msgID: number, arraybuffer: any): void
        /**
         * 判断是否已连接。
         * @param connectionFlag 数据连接标识。
         */
        static IsConnected(connectionFlag: string): boolean
    }
}

declare module asgard.net {
    export class SimpleHttp {
        /**
         * @private
         */
        constructor()
        /**
         * 错误处理回调。
         * @param caller 执行域(this)。
         * @param callback 回调方法。
         */
        errorHandling(caller: any, callback: Function)
        /**
         * 错误信息。
         */
        ResponseText(): string
        /**
         * 发送请求。
         * @param url 数据连接地址。
         * @param postdata 消息内容。
         * @param caller 执行域(this)。
         * @param callback 回调方法。
         * @param timeout 连接时间，超过时间则连接失败。
         * @param headers 连接前缀。
         */
        postRequest(url: string, postdata: string, caller: any, callback: Function, timeout: number, headers?: Array<any>): void
        /**
         * 获取请求。
         * @param url 数据连接地址。
         * @param caller 执行域(this)。
         * @param callback 回调方法。
         * @param timeout 连接时间，超过时间则连接失败。
         */
        getRequest(url: string, caller: any, callback: Function, timeout: number): void
        /**
         * @private
         */
        onHttpRequestError(e: any): void
        /**
         * @private
         */
        onHttpRequestProgress(e: any): void
        /**
         * @private
         */
        onHttpRequestComplete(e: any): void
    }
}

declare module asgard.net {
    import Event = Laya.Event;
    import Socket = Laya.Socket;
    import Byte = Laya.Byte;
    import SimpleDelegate = asgard.utils.SimpleDelegate;

    export class SimpleSocket {
        /**
         * @private
         */
        constructor()
        /**
         * 获取连接事件信息
         */
        getEvents(): NetEvents
        /**
         * 设置连接事件信息
         * @param nv 事件对象。
         */
        setEvents(nv: NetEvents): void
        /**
         * 是否为连接状态 
         */
        getConnected(): boolean
        /**
         * 开始连接。
         * @param host 数据连接地址。
         * @param port 连接端口。
         */
        connect(host: string, port: number): void
        /**
         * 开始连接。
         * @param url 数据连接地址。
         */
        connectByUrl(url: string): void
        /**
         * 使接口可用，并且客户端不主动断开连接 
         */
        close(): void
        /**
         * 发送消息 
         */
        sendPackage(cmd: number, body: Byte): void
        /**
         * 清空未解析完的消息 
         */
        clearRecvArray(): void
        /**
         * @private
         */
        init(): void
        /**
         * 重置网络连接
         * @private
         */
        resetConnect(): void
        /**
         * 数据连接回调
         * @private
         */
        connectHandler(e_: Event): void
        /**
         * 数据连接关闭回调
         * @private
         */
        closeHandler(e_: Event): void
        /**
         * 数据连接错误回调
         * @private
         */
        errorHandler(e_: Event): void
        /**
         * 消息下行解析处理
         * @private
         */
        socketDataHandler(msg: any): void

        sendAldEvent(obj: any): void

        gameLog(message, ...value): void
    }
}

declare module asgard.net {
    import Event = Laya.Event;
    import Browser = Laya.Browser;
    import Byte = Laya.Byte;
    import SimpleDelegate = asgard.utils.SimpleDelegate;

    export class TCPClient {
        protected _socket: SimpleSocket;

        /**
         * @private
         */
        constructor()

        registerEventListener(actionType: string, caller: any, listener: Function): void

        unregisterEventListener(actionType: string): void

        init(): void
        /**
         * 开始连接。
         * @param host 数据连接地址。
         * @param port 连接端口。
         */
        connect(host: string, port: number): void
        /**
         * 开始连接。
         * @param url 数据连接地址。
         */
        connectByUrl(url: string): void

        connected: boolean

        sendMessages(cmd: number, body: Byte): void
        /**
         * 关闭连接。
         */
        close(): void
        /**
         *  废掉socket，再使用重新创建
         */
        unUseFul(): void

        hadSocket(): boolean

        /**
         * 清空未解析完的消息 
         */
        clearRecvArray(): void
        /**
         * 子类MessageManager重写了此方法
         */
        onConnect(): void
        /**
         * 子类MessageManager重写了此方法
         */
        onMessageReceived(messageType: number, bytes: Byte): void

        /**
         * 处理链接断开
         */
        onDisConnect(): void

        /**
         * 处理链接错误
         */
        onConnectError(): void

        /**
         * 失去焦点
         * @private
         */
        onBlur(): void
        /**
         *切换状态 
         * @private
         */
        onVisibilityReconnect(): void
        /**
         * 处理数据链接IO错误
         * @private
         */
        receiveIOError(): void
        /**
         * 显示连接失败信息
         * @private
         */
        showErrorMessageContent(): void
        /**
         * 连接断开
         * @private
         */
        onLoseConnectionWithServer(): void
    }
}

declare module asgard.stage {
    export class BaseStage {
        /** 所属项目名称 */
        protected _appName: string;
        /** 状态ID */
        protected _stageId: number;
        /**
         * @private
         * @param appname 所属项目名称。
         * @param stageId 状态ID。
         */
        constructor(appname: string, stageId: number)

        appName: string

        stageId: number

        onEnter(): void

        onFrame(curtime: number, delta: number)

        onExit(): void
    }
}

declare module asgard.stage {
    export interface IStageFactory {
        getAppName(): string;
        getStage(spriteType: number): BaseStage;
    }
}

declare module asgard.stage {
    export class StageManager {
        /**
         * 初始化状态工厂
         */
        static init(stageFactory: IStageFactory): void
        /**
         * 清理这个app对应的状态工厂。
         * @param appname 所属项目名称。
         */
        static clearData(appname: string): void
        /**
         * 上一个状态的ID
         */
        static LastStageId(appname: string): number
        /**
         * 当前状态
         */
        static CurStage(appname: string): BaseStage
        /**
         * 进入状态
         * @param appname 所属项目名称。
         * @param stageid 状态ID。
         */
        static enterStage(appname: string, stageid: number): void
        /**
         * 帧频
         */
        static onFrame(curtime: number, delta: number): void

        static gameLog(message, ...value): void
    }
}

declare module asgard.ui {
    export class BaseUIPanel {
        protected _appName: string;
        protected _name: string;
        protected _resReady: boolean;
        protected _visible: boolean;
        protected _uiView: Laya.View;
        protected showData: any;
        /**
         * @private
         * @param appname 所属项目名称。
         * @param name UI名字。
         */
        constructor(appname: string, name: string)

        getAppName(): string

        getName(): string

        getView(): Laya.View

        isVisible(): boolean

        isResReady(): boolean

        getDependenceRes(): Array<any>
        //龙骨动画资源
        getSpineRes(): Array<any>

        //fnt字体文件
        getFntRes(): Array<any>

        prepareView(): void

        openView(data?: any, isAlwaysTop?: boolean): void

        closeView(remove?: boolean): void

        onFrame(time: number, delta: number): void

        dispose(): void

        /**
         * 准备加载资源
         * @private
         */
        _prepareRes(): void

        /**
         * 资源加载完毕回调
         * @private
         */
        onResLoaded(): void
        /**
         * 显示界面
         * @private
         */
        _doShow()

        protected createView(): Laya.View

        protected onInit(): void

        protected onPrepared(): void

        protected onShow(): void

        protected onHide(): void

        startLoad(self, t, m, n)

        onAllResLoaded()
    }
}

declare module asgard.ui {
    export interface IUIFactory {
        getAppName(): string;

        getUI(viewname: string): BaseUI.BaseUIPanel;
    }
}

declare module asgard.ui {
    export class UIManager {
        /**
         * 初始化UI工厂
         */
        static init(uifactory: IUIFactory): void
        /**
         * 清理这个app对应的UI工厂。
         * @param appname 所属项目名称。
         */
        static clearData(appname: string): void
        /**
         * 查找界面
         * @param appname 所属项目名称。
         * @param uiname 界面名字。
         */
        static findUIPanel(appname: string, uiname: string): BaseUI.BaseUIPanel
        /**
         * 打开界面
         * @param appname 所属项目名称。
         * @param viewname 界面名字。
         */
        static openView(appname: string, viewname: string, showdata?: any, isAlwaysTop?: boolean): BaseUI.BaseUIPanel

        static prepareView(appname: string, viewname: string): BaseUI.BaseUIPanel
        /**
         * 关闭界面
         * @param appname 所属项目名称。
         * @param viewname 界面名字。
         */
        static closeView(appname: string, viewname: string): void
        /**
         * 帧频
         */
        static onFrame(time: number, delta: number): void

        /**
         * 显示顶部的界面
         * @param uiname 界面名字。
         */
        static showTopUIs(appname: string, exceptUiname: string): void
    }
}

declare module asgard.utils {
    export class DataUtil {
        static readBoolean(indata: Laya.Byte): boolean

        static readByte(indata: Laya.Byte): number

        static readShort(indata: Laya.Byte): number

        static readInt(indata: Laya.Byte): number

        static readInt64(indata: Laya.Byte): asgard.utils.Int64

        static readFloat(indata: Laya.Byte): number

        static readDouble(indata: Laya.Byte): number

        static readString(indata: Laya.Byte): string
    }
}

declare module asgard.utils {
    export class GameUtil {
        static findChildNodeByName(childName: string, rootNode: Laya.Node, recrusion: boolean): Laya.Node

        static fineNumber(v: number): string

        static fixedFormat(v: number, length: number): string

        static catchUrlImage(imgurl: string, w: number, h: number, callback: Function): void

        static dateOfDay(date: Date): number

        static weekdayOfDay(date: Date): number

        static _zeroDate: number;
        static dateOfDay2(date: Date): number

        static dayOfDate(day: number): Date

        static dateStrOfDate(date: number): string

        static formatTime(secondtime: number): string

        /**
         * int数组排序
         * @param tarArray 需要排序的数组。
         * @param isUp 是否升序，默认升序true。
         */
        static sortNew(tarArray: Array<number>, isUp?: boolean): Array<number>

        /**
         * 数组拷贝
         * @param tarArray 需要拷贝的数组。
         */
        static copyArrays(tarArray: Array<any>): Array<any>

        /**
         * 格式化字符串
         * @param str 需要格式化的字符串 包含{0}，{1}。。。格式的字符串
         * @param arg2 参数组
         * @return 格式化之后的字符串
         */
        static formatStr(str: string, ...arg2: any[]): string

        static countDown(time): string

        static formatTime(r: Date, e: string, i: string): string
    }
}

declare module asgard.utils {
    export class Int64 {
        low: number;
        high: number;
        /**
         * @private
         */
        constructor(low: number, high: number)

        equal(v: Int64): boolean

        isZero(): boolean

        toString(): string
    }
}

declare module asgard.utils {
    enum NodeTYpe {
        First,
        Data,
        Last
    }
    class LinkedNode {
        Data: any;
        PreNode: LinkedNode;
        NextNode: LinkedNode;
        /**
         * @private
         * @param nodetype 节点类型
         */
        constructor(nodetype: NodeTYpe)
        /**
         * 节点类型
         */
        NodeType: NodeTYpe
    }

    export class SimpleQueue {
        /**
         * @private
         */
        constructor()
        /**
         * 队列中节点个数
         */
        Count: number
        /**
         * 申请一个节点
         * @private
         */
        _applyFreeNode(): LinkedNode
        /**
         * 回收一个节点
         * @private
         */
        _reclaimNode(node: LinkedNode): void
        /**
         * 入队
         */
        enqueue(data: any): void
        /**
         * 出队
         */
        dequeue(): any
    }

    export class SimpleList {
        /**
         * @private
         */
        constructor()
        /**
         * 清理链表
         */
        clear(): void
        /**
         * 获取链表节点个数
         */
        Count: number
        /**
         * 申请一个节点
         * @private
         */
        _applyFreeNode(): LinkedNode
        /**
         * 回收一个节点
         * @private
         */
        _reclaimNode(node: LinkedNode): void
        /**
         * 增加一个数据
         */
        add(data: any): void
        /**
         * 获取第一个节点的数据
         */
        getFirstData(): any
        /**
         * 获取最后一个节点的数据
         */
        getLastData(): any
        /**
         * 根据索引获取某一个节点的数据
         */
        getDataAt(idx: number): any
        /**
         * 根据索引删除某一个节点
         */
        removeAt(idx: number): any
        /**
         * 遍历链表，并执行回调（回调函数中返回节点的数据data），并回收节点
         * @param caller 执行域(this)。
         * @param procss 回调方法。
         */
        scan(caller: any, procss: Function): void
        /**
         * 遍历链表，找到需要的数据并回调（回调函数中返回节点的数据data和回传的参数）
         * @param caller 执行域(this)。
         * @param procss 回调方法。
         * @param param 回传的参数。
         */
        search(caller: any, procss: Function, param: any): any
        /**
         * 反向遍历链表，找到需要的数据并回调（回调函数中返回节点的数据）
         * @param caller 执行域(this)。
         * @param procss 回调方法。
         */
        reverseSearch(caller: any, procss: Function): any
    }
}

declare module asgard.utils {
    export class MathUtils {
        /** 浮点数大小比对精度 */
        static EPSILON: number;
        /** 弧度转角度的系数 */
        static Rad2Deg: number;
        /** 角度转弧度的系数 */
        static Deg2Rad: number;
        /** 180度对应的弧度 */
        static PI: number;
        /** 360度对应的弧度 */
        static TWO_PI: number;
        /** 90度对应的弧度 */
        static HALF_PI: number;
        /** 270度对应的弧度 */
        static ONE_HALF_PI: number;
        /**
         * 洗牌
         * @param objects 牌堆。
         * @param num 洗几次。
         * @return 返回洗好的牌堆
         */
        static shuffle<T>(objects: any[], num: number): any[]
        /**
         * 开方
         */
        static sqrt(w: number): number
        /**
         * 有效偏移判断
         * @param p1x
         * @param p1y
         * @param p2x
         * @param p2y
         * @param scopex
         * @param scopey
         * @return
         */
        static inScope(p1x: number, p1y: number, p2x: number, p2y: number, scopex: number, scopey: number): boolean
        /**
         * 两点之间快速距离计算
         * @param p1x
         * @param p1y
         * @param p2x
         * @param p2y
         * @return
         */
        static fastApproxDistance(p1x: number, p1y: number, p2x: number, p2y: number): number
        /**
         * 两点之间快速距离计算
         * @param p1x
         * @param p1y
         * @param p2x
         * @param p2y
         * @return
         */
        static fastApproxDeltaDistance(deltax: number, deltay: number): number
        /**
         * 计算atan2角度
         * @param deltax
         * @param deltay
         * @return
         */
        static atan2(deltax: number, deltay: number): number
        /**
         * from到to之间插值，
         * @param from 起始值
         * @param to 最大值
         * @param factor 插值比，0-1之间
         * @return
         */
        static LerpFloat(from: number, to: number, factor: number): number
        /**
         * current到to之间按帧间隔时间内移动的距离插值
         * @param current 起始值
         * @param to 最大值
         * @param speed 速度
         * @param deltaTime 帧间隔时间
         * @return
         */
        static lerp(current: number, to: number, speed: number, deltaTime: number): number
        /**
         * current到to之间按帧间隔时间内移动的距离插值
         * @param current 起始值
         * @param to 最大值
         * @param delta 帧间隔时间内移动的距离
         * @return
         */
        static lerpDelta(current: number, to: number, delta: number): number
        /**
         * 弧度矫正，矫正到0-2PI内
         * @param direction 方向（弧度）
         * @return
         */
        static regularDirection(direction: number): number
        /**
         * 判断f1与f2是否近似，精度为MathUtils.EPSILON
         */
        static approximately(f1: number, f2: number): boolean
        /**
         * 判断v3与px，py，pz组成的3维数据是否近似，精度为MathUtils.EPSILON
         */
        static approximatelyVector3(v3: Laya.Vector3, px: number, py: number, pz: number): boolean
        /**
         * 拷贝src的数据到target
         */
        static copyVector3(src: Laya.Vector3, target: Laya.Vector3): void
        /**
         * 输出log src的x，y，z
         */
        static exportVector3Log(src: Laya.Vector3): void
        /**
         * curv加step是否是否逼近targetv
         */
        static approaching(curv: number, targetv: number, step: number): number
    }
}

declare module asgard.utils {
    export class SimpleDelegate {
        /**
         * @private
         * @param caller 执行域(this)。
         * @param method 回调方法。
         */
        constructor(caller: any, method: Function)
        /**
         * 设置代理
         * @param caller 执行域(this)。
         * @param method 回调方法。
         */
        setMethod(caller: any, method: Function): void
        /**
         * 判断是否是同一个代理
         * @param caller 执行域(this)。
         * @param method 回调方法。
         */
        isSameMethod(caller: any, method: Function): boolean
        /**
         * 执行回调
         * @param args 回传参数。
         */
        apply(args?: Array<any>): any
    }
}

declare module asgard.utils {
    export class SimpleDelegates {
        /**
         * @private
         */
        constructor()
        /**
         * 删除所有代理
         */
        clearAll()
        /**
         * 获取代理总个数
         */
        getCount(): number
        /**
         * 根据索引获取代理
         * @param index 索引。
         */
        getItem(index: number): SimpleDelegate
        /**
         * 添加代理
         * @param caller 执行域(this)。
         * @param process 回调方法。
         */
        tryAddDelegate(caller: any, process: Function): boolean
        /**
         * 删除代理
         * @param caller 执行域(this)。
         * @param process 回调方法。
         */
        removeDelegate(caller: any, process: Function): void
        /**
         * 执行代理
         * @param arg 回传参数。
         */
        invokeDelegate(arg?: Array<any>): void
    }
}

declare module asgard.utils {
    export class Vector2 {
        x: number;
        y: number;
        /**
         * @private
         * @param x 
         * @param y
         */
        constructor(x: number, y: number)
    }

    export class Vector3 {
        x: number;
        y: number;
        z: number;
        /**
         * @private
         * @param x 
         * @param y
         * @param z
         */
        constructor(x: number, y: number, z: number)
    }
}

declare module asgard.data {
    import DataUtil = asgard.utils.DataUtil;
    class BaseStaticData {
        Id: number;
        getDataType(): number;
        initialize(soudata: Laya.Byte): boolean;
        initReference(): void;
        initTextBlock(): void;
        protected readBoolean(indata: Laya.Byte): boolean;
        protected readByte(indata: Laya.Byte): number;
        protected readShort(indata: Laya.Byte): number;
        protected readInt(indata: Laya.Byte): number;
        protected readInt64(indata: Laya.Byte): asgard.utils.Int64;
        protected readFloat(indata: Laya.Byte): number;
        protected readDouble(indata: Laya.Byte): number;
        protected readString(indata: Laya.Byte): string;
    }

    class BaseTextBlockData {
        protected _textSource: string;
        constructor(source: string);
        initData(): void;
        textSource: string;
    }

    interface IStaticDataFactory {
        createStaticData(datatype: number): BaseStaticData;
    }

    class StaticDataManager {
        static getSheet(datatype: number): StaticDataSheet;
        static getSheetDatas(datatype: number): Array<BaseStaticData>;
        static appendSheet(sheetId: number): StaticDataSheet;
        static findData(sheetId: number, dataId: number): BaseStaticData;
        static loadStaticData(souData: Laya.Byte, dataFactory: IStaticDataFactory): void;
    }
    class StaticDataSheet {
        constructor();
        initDataFactory(dataFactory: IStaticDataFactory): void;
        SheetId: number;
        SheetName: String;
        getData(dataId: number): BaseStaticData;
        getSheetDatas(): Array<BaseStaticData>;
        loadSheetData(inStream: Laya.Byte): void;
        loadReferenceData(): void;
        loadTextBlockData(): void;
        Count: number;
        getDataAt(idx: number): BaseStaticData;
    }
}

declare module BaseUI {
    export class BaseUIPanel extends Laya.View { }
}