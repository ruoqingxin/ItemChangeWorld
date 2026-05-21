(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
  var __decorateClass = (decorators, target, key, kind) => {
    var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
    for (var i = decorators.length - 1, decorator; i >= 0; i--)
      if (decorator = decorators[i])
        result = (kind ? decorator(target, key, result) : decorator(result)) || result;
    if (kind && result)
      __defProp(target, key, result);
    return result;
  };

  // src/module/UISocialInviteView.ts
  var INVITE_VIEW_RES = "res://6b229f5a-2129-47db-9200-9a8e6decad99";
  var _UISocialInviteView = class _UISocialInviteView extends Laya.Sprite {
    constructor(_onInviteUser, _onClose) {
      super();
      this._onInviteUser = _onInviteUser;
      this._onClose = _onClose;
      this._state = null;
      this._root = null;
      this._list = null;
      this._loaded = false;
      this._renderHandler = null;
      this.size(Laya.stage.width, Laya.stage.height);
      this.loadView();
    }
    setViewState(state) {
      this._state = state;
      this.refresh();
    }
    onHide() {
      this.visible = false;
    }
    loadView() {
      const loadTask = Laya.loader.load(INVITE_VIEW_RES);
      if (loadTask && typeof loadTask.then === "function") {
        loadTask.then(() => this.onViewLoaded()).catch(() => void 0);
        return;
      }
      Laya.loader.load(INVITE_VIEW_RES, Laya.Handler.create(this, this.onViewLoaded));
    }
    onViewLoaded() {
      const loader = Laya.loader;
      const root = typeof loader.createNodes === "function" ? loader.createNodes(INVITE_VIEW_RES) : null;
      if (!root) {
        return;
      }
      this._root = root;
      this.addChild(root);
      this._list = this.findNodeByName(this._root, "list_items");
      this.bindCloseButton();
      this._loaded = true;
      this.refresh();
    }
    refresh() {
      if (!this._loaded || !this._state) {
        return;
      }
      this.visible = true;
      this.refreshList(this._state.users);
    }
    refreshList(users) {
      var _a, _b;
      if (!this._list) {
        return;
      }
      if ("array" in this._list && "renderHandler" in this._list) {
        if (!this._renderHandler) {
          this._renderHandler = Laya.Handler.create(this, this.renderListItem, null, false);
        }
        this._list.renderHandler = this._renderHandler;
        this._list.array = users;
        if (typeof this._list.refresh === "function") {
          this._list.refresh();
        }
        return;
      }
      const count = typeof this._list.numChildren === "number" ? this._list.numChildren : 0;
      const max = Math.min(count, users.length);
      for (let i = 0; i < max; i++) {
        const item = (_b = (_a = this._list).getChildAt) == null ? void 0 : _b.call(_a, i);
        this.applyUserToItem(item, users[i]);
      }
    }
    renderListItem(arg0, arg1) {
      if (!this._state) {
        return;
      }
      let item = null;
      let index = 0;
      if (typeof arg0 === "number") {
        index = arg0;
        item = arg1;
      } else {
        item = arg0;
        index = Number(arg1 || 0);
      }
      const user = this._state.users[index];
      if (!user) {
        return;
      }
      this.applyUserToItem(item, user);
    }
    applyUserToItem(item, user) {
      if (!item || !user) {
        return;
      }
      const refs = this.getItemRefs(item);
      this.setText(refs.txtNick, user.nickName);
      this.setImageSource(refs.imgHead, user.avatarUrl);
      this.setText(refs.txtTitle, "邀请");
      this.bindInvite(refs.btnInvite, user);
    }
    bindInvite(btnInvite, user) {
      if (!btnInvite) {
        return;
      }
      btnInvite.__inviteOpenid = user.openid;
      btnInvite.mouseEnabled = true;
      btnInvite.grayed = false;
      btnInvite.touchable = true;
      if (btnInvite.__inviteBound) {
        return;
      }
      btnInvite.__inviteBound = true;
      if (typeof btnInvite.on === "function") {
        btnInvite.on(Laya.Event.CLICK, this, this.handleInviteClick);
      }
    }
    handleInviteClick(evt) {
      const btnInvite = evt.currentTarget;
      const openid = btnInvite == null ? void 0 : btnInvite.__inviteOpenid;
      if (openid) {
        this._onInviteUser(String(openid));
      }
    }
    bindCloseButton() {
      const btnClose = this.findNodeByName(this._root, "btn_close");
      if (!btnClose || btnClose.__closeBound) {
        return;
      }
      btnClose.__closeBound = true;
      if (typeof btnClose.on === "function") {
        btnClose.on(Laya.Event.CLICK, this, this._onClose);
      }
    }
    getItemRefs(item) {
      if (item.__inviteRefs) {
        return item.__inviteRefs;
      }
      const btnInvite = this.findNodeByName(item, "btn_invite");
      const refs = {
        txtNick: this.findNodeByName(item, "txt_nick"),
        imgHead: this.findNodeByName(item, "img_head"),
        btnInvite,
        txtTitle: this.findNodeByName(btnInvite, "txt_title")
      };
      item.__inviteRefs = refs;
      return refs;
    }
    setText(node, text) {
      if (!node) {
        return;
      }
      if ("text" in node) {
        node.text = text;
      } else if ("title" in node) {
        node.title = text;
      }
    }
    setImageSource(node, url) {
      if (!node) {
        return;
      }
      if ("url" in node) {
        node.url = url || "";
        return;
      }
      if ("src" in node) {
        node.src = url || "";
        return;
      }
      if ("skin" in node) {
        node.skin = url || "";
      }
    }
    findNodeByName(root, name) {
      if (!root || !name) {
        return null;
      }
      if (typeof root.getChildByName === "function") {
        const direct = root.getChildByName(name);
        if (direct) {
          return direct;
        }
      }
      if (typeof root.numChildren !== "number" || typeof root.getChildAt !== "function") {
        return null;
      }
      for (let i = 0; i < root.numChildren; i++) {
        const child = root.getChildAt(i);
        const result = this.findNodeByName(child, name);
        if (result) {
          return result;
        }
      }
      return null;
    }
  };
  __name(_UISocialInviteView, "UISocialInviteView");
  var UISocialInviteView = _UISocialInviteView;

  // src/opendata/InviteOpenDataModule.ts
  var OpenDataCommand = {
    ShowInviteFriend: "od:showInviteFriend",
    HideInviteFriend: "od:hideInviteFriend"
  };
  var _InviteOpenDataModule = class _InviteOpenDataModule {
    constructor(_stage, _bridge) {
      this._stage = _stage;
      this._bridge = _bridge;
      this._users = [];
      this._inviteView = null;
      this._isLoadingWxFriends = false;
      this._hasLoadedWxFriends = false;
      this._shareConfig = {
        roomId: 0,
        roomName: "",
        shareTxt: "",
        shareImageUrl: "",
        shareImageUrlId: ""
      };
    }
    handleMessage(message) {
      switch (message == null ? void 0 : message.type) {
        case OpenDataCommand.ShowInviteFriend:
          this.handleShowMessage(message);
          break;
        case OpenDataCommand.HideInviteFriend:
          this.hideInviteView();
          break;
        default:
          break;
      }
    }
    onStageResize() {
      if (!this._inviteView) {
        return;
      }
      this._inviteView.size(this._stage.width, this._stage.height);
    }
    handleShowMessage(message) {
      this.applyShareConfig(message);
      this.loadFriendListFromWx();
      this.showInviteView();
    }
    showInviteView() {
      if (!this._inviteView) {
        this._inviteView = new UISocialInviteView(
          this.handleInviteUser.bind(this),
          this.handleViewClose.bind(this)
        );
      }
      this.refreshInviteView();
      if (!this._inviteView.parent) {
        this._stage.addChild(this._inviteView);
      }
      this._inviteView.visible = true;
    }
    hideInviteView() {
      if (!this._inviteView) {
        return;
      }
      this._inviteView.onHide();
      this._inviteView.removeSelf();
    }
    refreshIfVisible() {
      if (!this._inviteView || !this._inviteView.parent) {
        return;
      }
      this.refreshInviteView();
    }
    handleInviteUser(openid) {
      this.shareToWxFriend(openid);
    }
    handleViewClose() {
      this.hideInviteView();
    }
    refreshInviteView() {
      if (!this._inviteView) {
        return;
      }
      this._inviteView.setViewState({
        users: this._users
      });
    }
    loadFriendListFromWx() {
      if (this._isLoadingWxFriends) {
        return;
      }
      if (this._hasLoadedWxFriends) {
        return;
      }
      this._isLoadingWxFriends = true;
      wx.getFriendCloudStorage({
        keyList: ["invite_tag"],
        success: (res) => {
          this._users = this.mapWxFriendList(Array.isArray(res == null ? void 0 : res.data) ? res.data : []);
          this._hasLoadedWxFriends = true;
          this.refreshIfVisible();
        },
        complete: () => {
          this._isLoadingWxFriends = false;
        }
      });
    }
    mapWxFriendList(list) {
      const result = [];
      const seen = /* @__PURE__ */ new Set();
      for (const item of list || []) {
        const openid = typeof (item == null ? void 0 : item.openid) === "string" ? item.openid.trim() : "";
        if (!openid || seen.has(openid)) {
          continue;
        }
        seen.add(openid);
        result.push({
          openid,
          nickName: this.pickDisplayName(item),
          avatarUrl: typeof (item == null ? void 0 : item.avatarUrl) === "string" ? item.avatarUrl : ""
        });
      }
      return result;
    }
    shareToWxFriend(openid) {
      const query = "room_id=" + encodeURIComponent(String(this._shareConfig.roomId)) + "&room_name=" + encodeURIComponent(this._shareConfig.roomName) + "&invite_openid=" + encodeURIComponent(openid);
      const sharePayload = {
        title: this._shareConfig.shareTxt,
        imageUrl: this._shareConfig.shareImageUrl,
        imageUrlId: this._shareConfig.shareImageUrlId,
        query
      };
      wx.shareAppMessage(sharePayload);
    }
    pickDisplayName(item) {
      const name = (item == null ? void 0 : item.nickName) || (item == null ? void 0 : item.nickname);
      return typeof name === "string" && name.trim() ? name : "微信好友";
    }
    applyShareConfig(message) {
      this._shareConfig = {
        roomId: Number(message.room_id),
        roomName: String(message.room_name),
        shareTxt: String(message.share_txt),
        shareImageUrl: String(message.share_image_url),
        shareImageUrlId: String(message.share_image_url_id)
      };
    }
  };
  __name(_InviteOpenDataModule, "InviteOpenDataModule");
  var InviteOpenDataModule = _InviteOpenDataModule;

  // src/opendata/OpenDataApp.ts
  var _OpenDataApp = class _OpenDataApp {
    constructor(_stage, _bridge) {
      this._stage = _stage;
      this._bridge = _bridge;
      this._started = false;
      this._inviteModule = new InviteOpenDataModule(this._stage, this._bridge);
      console.error("_OpenDataApp");
    }
    start() {
      if (this._started) {
        return;
      }
      this._started = true;
      this._bridge.onMessage(this._inviteModule.handleMessage.bind(this._inviteModule));
      this._stage.on(Laya.Event.RESIZE, this._inviteModule, this._inviteModule.onStageResize);
    }
  };
  __name(_OpenDataApp, "OpenDataApp");



  new OpenDataApp();

  // src/opendata/WxOpenDataBridge.ts
  var _WxOpenDataBridge = class _WxOpenDataBridge {
    onMessage(handler) {
      const wxApi = wx;
      if (!(wxApi == null ? void 0 : wxApi.onMessage)) {
        return;
      }
      wxApi.onMessage((data) => {
        const message = data && typeof data.type === "string" ? data : { type: "" };
        handler(message);
      });
    }
  };
  __name(_WxOpenDataBridge, "WxOpenDataBridge");
  var WxOpenDataBridge = _WxOpenDataBridge;

  // src/Main.ts
  var { regClass, property } = Laya;
  var Main = class extends Laya.Script {
    constructor() {
      super(...arguments);
      this._openDataApp = null;
    }
    onAwake() {
      if (Laya.Browser.onMiniGame) {
        this._openDataApp = new OpenDataApp(Laya.stage, new WxOpenDataBridge());
        this._openDataApp.start();
      }
    }
  };
  __name(Main, "Main");
  Main = __decorateClass([
    regClass("7bad1742-6eed-4d8d-81c0-501dc5bf03d6", "../src/Main.ts")
  ], Main);
})();
//# sourceMappingURL=bundle.js.map
