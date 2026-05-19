Function.prototype.getName = function () {
    return this.name || this.toString().match(/function\s*([^(]*)\(/)[1]
}
var asgard = window.asgard = {};
var Dictionary = (function () {
    function Dictionary() {
        this._values = [];
        this._keys = [];
    }
    //__class(Dictionary, 'laya.utils.Dictionary');
    __un = function (obj, name, value) {
        value || (value = obj[name]);
        var p = { writable: true, enumerable: false, configurable: true };
        p.value = value;
        Object.defineProperty(obj, name, p);
        return value;
    },
        __getset = function (isStatic, o, name, getfn, setfn) {
            if (!isStatic) {
                getfn && __un(o, '_$get_' + name, getfn);
                setfn && __un(o, '_$set_' + name, setfn);
            }
            else {
                getfn && (o['_$GET_' + name] = getfn);
                setfn && (o['_$SET_' + name] = setfn);
            }
            if (getfn && setfn)
                Object.defineProperty(o, name, { get: getfn, set: setfn, enumerable: false, configurable: true });
            else {
                getfn && Object.defineProperty(o, name, { get: getfn, enumerable: false, configurable: true });
                setfn && Object.defineProperty(o, name, { set: setfn, enumerable: false, configurable: true });
            }
        }
    var __proto = Dictionary.prototype;
    /**
    *给指定的键名设置值。
    *@param key 键名。
    *@param value 值。
    */
    __proto.set = function (key, value) {
        var index = this.indexOf(key);
        if (index >= 0) {
            this._values[index] = value;
            return;
        }
        this._keys.push(key);
        this._values.push(value);
    }

    /**
    *获取指定对象的键名索引。
    *@param key 键名对象。
    *@return 键名索引。
    */
    __proto.indexOf = function (key) {
        var index = this._keys.indexOf(key);
        if (index >= 0) return index;
        key = ((typeof key == 'string')) ? Number(key) : (((typeof key == 'number')) ? key.toString() : key);
        return this._keys.indexOf(key);
    }

    /**
    *返回指定键名的值。
    *@param key 键名对象。
    *@return 指定键名的值。
    */
    __proto.get = function (key) {
        var index = this.indexOf(key);
        return index < 0 ? null : this._values[index];
    }

    /**
    *移除指定键名的值。
    *@param key 键名对象。
    *@return 是否成功移除。
    */
    __proto.remove = function (key) {
        var index = this.indexOf(key);
        if (index >= 0) {
            this._keys.splice(index, 1);
            this._values.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
    *清除此对象的键名列表和键值列表。
    */
    __proto.clear = function () {
        this._values.length = 0;
        this._keys.length = 0;
    }
    // __proto.values = function () {
    //     return this._values;
    // }
    // __proto.keys = function () {
    //     return this._keys;
    // }
    /**
    *获取所有的子元素列表。
    */
    __getset(0, __proto, 'values', function () {
        return this._values;
    });

    /**
    *获取所有的子元素键名列表。
    */
    __getset(0, __proto, 'keys', function () {
        return this._keys;
    });

    return Dictionary;
})()

!function (t) {
    !function (t) {
        var e = function () {
            return function (t, e) {
                this.x = 0, this.y = 0, this.x = t, this.y = e;
            };
        }();
        t.Vector2 = e;
        var n = function () {
            return function (t, e, n) {
                this.x = 0, this.y = 0, this.z = 0, this.x = t, this.y = e, this.z = n;
            };
        }();
        t.Vector3 = n;
    }(t.utils || (t.utils = {}));
}(asgard || (asgard = {})), function (t) {
    !function (t) {
        var e = function () {
            function e() {
                this._delegates = new Array();
            }
            return e.prototype.clearAll = function () {
                this._delegates.splice(0);
            }, e.prototype.getCount = function () {
                return this._delegates.length;
            }, e.prototype.getItem = function (t) {
                return t >= 0 && t < this._delegates.length ? this._delegates[t] : null;
            }, e.prototype.tryAddDelegate = function (e, n) {
                if (!e || !n) return !1;
                for (var o, i = this._delegates.length, r = 0; r < i; r++) if ((o = this._delegates[r]) && o.isSameMethod(e, n)) return !1;
                o = new t.SimpleDelegate(e, n), this._delegates.push(o);
            }, e.prototype.removeDelegate = function (t, e) {
                if (t && e) {
                    for (var n, o = -1, i = this._delegates.length, r = 0; r < i && o < 0; r++) (n = this._delegates[r]) && n.isSameMethod(t, e) && (o = r);
                    o >= 0 && this._delegates.splice(o, 1);
                }
            }, e.prototype.invokeDelegate = function (t) {
                var cloneArr1 = this._delegates.slice()
                for (var e, n = cloneArr1.length, o = 0; o < n; o++) (e = cloneArr1[o]) && (t ? e.apply(t) : e.apply());
            }, e;
        }();
        t.SimpleDelegates = e;
    }(t.utils || (t.utils = {}));
}(asgard || (asgard = {})), function (t) {
    !function (t) {
        var e = function () {
            function t(t, e) {
                this._caller = t, this._method = e;
            }
            return t.prototype.setMethod = function (t, e) {
                this._caller = t, this._method = e;
            }, t.prototype.isSameMethod = function (t, e) {
                return this._caller && this._caller == t && this._method && this._method == e;
            }, t.prototype.apply = function (t) {
                return this._method ? this._method.apply(this._caller, t) : null;
            }, t;
        }();
        t.SimpleDelegate = e;
    }(t.utils || (t.utils = {}));
}(asgard || (asgard = {})), function (t) {
    !function (t) {
        var e = function () {
            function t() { }
            return t.shuffle = function (t, e) {
                var n, o, i, r = t.length;
                -1 == e && (e = r);
                for (var s = 0; s < e; s++) (n = Math.random() * r) != (o = Math.random() * r) && (i = t[n],
                    t[n] = t[o], t[o] = i);
                return t;
            }, t.sqrt = function (t) {
                var e, n, o = .25 * t;
                do {
                    (e = (o = .5 * (o + (n = t / o))) - n) < 0 && (e = -e);
                } while (e > 1e-5);
                return o;
            }, t.inScope = function (t, e, n, o, i, r) {
                return Math.abs(t - n) < i && Math.abs(e - o) < r;
            }, t.fastApproxDistance = function (t, e, n, o) {
                return t = t > n ? t - n : n - t, e = e > o ? e - o : o - e, t > e ? t + .43 * e : e + .43 * t;
            }, t.fastApproxDeltaDistance = function (t, e) {
                return t = t > 0 ? t : -t, e = e > 0 ? e : -e, t > e ? t + .43 * e : e + .43 * t;
            }, t.atan2 = function (e, n) {
                return Math.abs(e) > t.EPSILON ? Math.atan2(n, e) : n > 0 ? t.HALF_PI : -t.HALF_PI;
            }, t.LerpFloat = function (t, e, n) {
                return n < 0 ? t : n >= 1 ? e : t + (e - t) * n;
            }, t.lerp = function (e, n, o, i) {
                return (e - n > t.EPSILON || n - e > t.EPSILON) && (i *= o, n > e ? (i > 0 ? e += i : e -= i,
                    n - e < t.EPSILON && (e = n)) : (i > 0 ? e -= i : e += i, e - n < t.EPSILON && (e = n))),
                    e;
            }, t.lerpDelta = function (e, n, o) {
                return (e - n > t.EPSILON || n - e > t.EPSILON) && (n > e ? (o > 0 ? e += o : e -= o,
                    n - e < t.EPSILON && (e = n)) : (o > 0 ? e -= o : e += o, e - n < t.EPSILON && (e = n))),
                    e;
            }, t.regularDirection = function (e) {
                if (e >= t.TWO_PI) for (; e >= t.TWO_PI;) e -= t.TWO_PI; else if (e < 0) for (; e < 0;) e += t.TWO_PI;
                return e;
            }, t.approximately = function (e, n) {
                return Math.abs(e - n) < t.EPSILON;
            }, t.approximatelyVector3 = function (e, n, o, i) {
                return Math.abs(e.x - n) < t.EPSILON && Math.abs(e.y - o) < t.EPSILON && Math.abs(e.z - i) < t.EPSILON;
            }, t.copyVector3 = function (t, e) {
                t && e && (e.x = t.x, e.y = t.y, e.z = t.z);
            }, t.exportVector3Log = function (t) {
                console.log("vector3 x=" + t.x + ",y=" + t.y + ",z=" + t.z);
            }, t.approaching = function (e, n, o) {
                return o < 0 && (o = -o), n > e ? (e += o, Math.abs(e - n) < t.EPSILON && (e = n)) : n < e && (e -= o,
                    Math.abs(e - n) < t.EPSILON && (e = n)), e;
            }, t.EPSILON = 1e-5, t.Rad2Deg = 180 / Math.PI, t.Deg2Rad = Math.PI / 180, t.PI = Math.PI,
                t.TWO_PI = 2 * Math.PI, t.HALF_PI = .5 * Math.PI, t.ONE_HALF_PI = 1.5 * Math.PI,
                t;
        }();
        t.MathUtils = e;
    }(t.utils || (t.utils = {}));
}(asgard || (asgard = {})), function (t) {
    !function (t) {
        var e;
        !function (t) {
            t[t.First = 0] = "First", t[t.Data = 1] = "Data", t[t.Last = 2] = "Last";
        }(e || (e = {}));
        var n = function () {
            function t(t) {
                this._nodeType = t, this.Data = null, this.PreNode = null, this.NextNode = null;
            }
            return Object.defineProperty(t.prototype, "NodeType", {
                get: function () {
                    return this._nodeType;
                },
                enumerable: !0,
                configurable: !0
            }), t;
        }(), o = function () {
            function t() {
                this._firstNode = new n(e.First), this._lastNode = new n(e.Last), this._firstNode.NextNode = this._lastNode,
                    this._lastNode.PreNode = this._firstNode, this._count = 0, this._pool = new Array(t._POOL_SIZE),
                    this._poolCount = 0;
            }
            return Object.defineProperty(t.prototype, "Count", {
                get: function () {
                    return this._count;
                },
                enumerable: !0,
                configurable: !0
            }), t.prototype._applyFreeNode = function () {
                for (var o = null, i = 0; !o && i < t._POOL_SIZE; i++) this._pool[i] && (o = this._pool[i],
                    this._pool[i] = null, this._poolCount--);
                return o || (o = new n(e.Data)), o;
            }, t.prototype._reclaimNode = function (e) {
                if (e && !(this._poolCount >= t._POOL_SIZE)) {
                    e.Data = null, e.NextNode = null, e.PreNode = null;
                    for (var n = 0; e && n < t._POOL_SIZE; n++) this._pool[n] || (this._pool[n] = e,
                        this._poolCount++, e = null);
                }
            }, t.prototype.enqueue = function (t) {
                if (t) {
                    var e = this._applyFreeNode();
                    e.Data = t, e.PreNode = this._lastNode.PreNode, e.NextNode = this._lastNode, this._lastNode.PreNode.NextNode = e,
                        this._lastNode.PreNode = e, this._count++;
                }
            }, t.prototype.dequeue = function () {
                if (!(this._count <= 0)) {
                    var t = this._firstNode.NextNode, e = t.Data;
                    return t.NextNode.PreNode = this._firstNode, this._firstNode.NextNode = t.NextNode,
                        this._count--, this._reclaimNode(t), e;
                }
            }, t._POOL_SIZE = 4, t;
        }();
        t.SimpleQueue = o;
        var i = function () {
            function t() {
                this._firstNode = new n(e.First), this._lastNode = new n(e.Last), this._firstNode.NextNode = this._lastNode,
                    this._lastNode.PreNode = this._firstNode, this._count = 0, this._pool = new Array(t._POOL_SIZE),
                    this._poolCount = 0;
            }
            return t.prototype.clear = function () {
                for (var t, n = this._firstNode.NextNode; n.NodeType != e.Last;) (t = n.NextNode).PreNode = n.PreNode,
                    n.PreNode.NextNode = t, this._reclaimNode(n), this._count--, n = t;
            }, Object.defineProperty(t.prototype, "Count", {
                get: function () {
                    return this._count;
                },
                enumerable: !0,
                configurable: !0
            }), t.prototype._applyFreeNode = function () {
                for (var o = null, i = 0; !o && i < t._POOL_SIZE; i++) this._pool[i] && (o = this._pool[i],
                    this._pool[i] = null, this._poolCount--);
                return o || (o = new n(e.Data)), o;
            }, t.prototype._reclaimNode = function (e) {
                if (e && !(this._poolCount >= t._POOL_SIZE)) {
                    e.Data = null, e.NextNode = null, e.PreNode = null;
                    for (var n = 0; e && n < t._POOL_SIZE; n++) this._pool[n] || (this._pool[n] = e,
                        this._poolCount++, e = null);
                }
            }, t.prototype.add = function (t) {
                if (t) {
                    var e = this._applyFreeNode();
                    e.Data = t, e.PreNode = this._lastNode.PreNode, e.NextNode = this._lastNode, this._lastNode.PreNode.NextNode = e,
                        this._lastNode.PreNode = e, this._count++;
                }
            }, t.prototype.getFirstData = function () {
                return this._count > 0 ? this._firstNode.NextNode.Data : null;
            }, t.prototype.getLastData = function () {
                return this._count > 0 ? this._lastNode.PreNode.Data : null;
            }, t.prototype.getDataAt = function (t) {
                if (t < 0 || t >= this._count) return null;
                for (var e = this._firstNode.NextNode; t > 0;) e = e.NextNode, t--;
                return e.Data;
            }, t.prototype.removeAt = function (t) {
                if (t < 0 || t >= this._count) return null;
                for (var e = this._firstNode.NextNode; t > 0;) e = e.NextNode, t--;
                var n = e.Data;
                return e.NextNode.PreNode = e.PreNode, e.PreNode.NextNode = e.NextNode, this._count--,
                    this._reclaimNode(e), n;
            }, t.prototype.scan = function (t, n) {
                if (!(this._count <= 0)) for (var o, i = new Array(1), r = this._firstNode.NextNode; r.NodeType == e.Data;) i[0] = r.Data,
                    n.apply(t, i) ? o = r : (o = r.PreNode, r.NextNode.PreNode = r.PreNode, r.PreNode.NextNode = r.NextNode,
                        this._count--, this._reclaimNode(r)), r = o.NextNode;
            }, t.prototype.search = function (t, n, o) {
                if (this._count <= 0) return null;
                for (var i = null, r = new Array(2), s = this._firstNode.NextNode; !i && s.NodeType == e.Data;) r[0] = s.Data,
                    r[1] = o, n.apply(t, r) && (i = s.Data), s = s.NextNode;
                return i;
            }, t.prototype.reverseSearch = function (t, n) {
                if (this._count <= 0) return null;
                for (var o = null, i = new Array(1), r = this._lastNode.PreNode; !o && r.NodeType == e.Data;) i[0] = r.Data,
                    n.apply(t, i) && (o = r.Data), r = r.PreNode;
                return o;
            }, t._POOL_SIZE = 4, t;
        }();
        t.SimpleList = i;
    }(t.utils || (t.utils = {}));
}(asgard || (asgard = {})), function (t) {
    !function (t) {
        var e = function () {
            function t(t, e) {
                void 0 === t && (t = 0), void 0 === e && (e = 0), this.low = 0, this.high = 0, this.low = t,
                    this.high = e;
            }
            return t.prototype.equal = function (t) {
                return !!t && t.low == this.low && t.high == this.high;
            }, t.prototype.isZero = function () {
                return 0 == this.low && 0 == this.high;
            }, t.prototype.toString = function () {
                return "high:0x" + this.high.toString(16) + " low:0x" + this.low.toString(16);
            }, t;
        }();
        t.Int64 = e;
    }(t.utils || (t.utils = {}));
}(asgard || (asgard = {})), function (t) {
    !function (e) {
        var n = function () {
            function e() { }
            return e.findChildNodeByName = function (t, n, o) {
                if (void 0 === o && (o = !1), !t || !n) return null;
                if (o) {
                    for (var i = null, r = 0; !i && r < n.numChildren; r++) {
                        var s = n.getChildAt(r);
                        i = s.name == t ? s : e.findChildNodeByName(t, s, o);
                    }
                    return i;
                }
                return n.getChildByName(t);
            }, e.fineNumber = function (t) {
                if (!t) t = 0;
                var oldT = t;
                if (t < 0) t = -t;
                var r = (!t || t < 0 ? "0" : t < 900 ? Math.floor(t).toFixed(0) : t < 1e5 ? (t *= .001).toFixed(2) + "K" : t < 9e5 ? (t *= .001).toFixed(1) + "k" : t < 1e8 ? (t *= 1e-6).toFixed(2) + "M" : t < 9e8 ? (t *= 1e-6).toFixed(1) + "M" : (t *= 1e-9).toFixed(2) + "G");
                if (oldT < 0) {
                    r = "-" + r;
                }
                return r;
            }, e.fixedFormat = function (t, e) {
                for (var n = t ? t.toString() : ""; n.length < e;) n = "0" + n;
                return n;
            }, e.catchUrlImage = function (t, e, n, o) {
                var i = new Laya.Sprite();
                i.loadImage(t, 0, 0, e, n), new Laya.Handler(), i.drawToCanvas(e, n, 0, 0).toBase64("image/png", .92, o);
            }, e.dateOfDay = function (t) {
                return Math.floor(t.getTime() / 864e5);
            }, e.weekdayOfDay = function (t) {
                return Math.floor(t.getTime() / 6048e5);
            }, e.dateOfDay2 = function (t) {
                return Math.floor(t.getTime() / 864e5) - e._zeroDate;
            }, e.dayOfDate = function (t) {
                var n = new Date();
                return n.setTime(864e5 * (t + e._zeroDate + 1)), n;
            }, e.dateStrOfDate = function (e) {
                var n = t.utils.GameUtil.dayOfDate(e);
                return n.getFullYear() + "/" + (n.getMonth() + 1) + "/" + n.getDate();
            }, e.formatTime = function (e) {
                if (e > 36e5) {
                    var n = Math.floor(e / 36e5), o = Math.floor((e - 36e5 * n) / 6e4), i = Math.floor((e - 36e5 * n - 6e4 * o) / 1e3);
                    return t.utils.GameUtil.fixedFormat(n, 2) + ":" + t.utils.GameUtil.fixedFormat(o, 2) + ":" + t.utils.GameUtil.fixedFormat(i, 2);
                }
                if (e > 6e4) {
                    var o = Math.floor(e / 6e4), i = Math.floor((e - 6e4 * o) / 1e3);
                    return t.utils.GameUtil.fixedFormat(o, 2) + ":" + t.utils.GameUtil.fixedFormat(i, 2);
                }
                return i = Math.floor(e / 1e3), "00:" + t.utils.GameUtil.fixedFormat(i, 2);
            }, e.sortNew = function (t, e) {
                if (void 0 === e && (e = !0), t) return e ? t.sort(this.sortCompareOne) : t.sort(this.sortCompareTwo),
                    t;
            }, e.sortCompareOne = function (t, e) {
                return t < e ? -1 : 1;
            }, e.sortCompareTwo = function (t, e) {
                return t > e ? -1 : 1;
            }, e.copyArrays = function (t) {
                for (var e = new Array(), n = 0, o = t; n < o.length; n++) {
                    var i = o[n];
                    e.push(i);
                }
                return e;
            }, e.countDown = function (times) {
                var day = 0, hour = 0, minute = 0, second = 0;//时间默认值
                if (times > 0) {
                    day = Math.floor(times / (60 * 60 * 24));
                    hour = Math.floor(times / (60 * 60)) - (day * 24);
                    minute = Math.floor(times / 60) - (day * 24 * 60) - (hour * 60);
                    second = Math.floor(times) - (day * 24 * 60 * 60) - (hour * 60 * 60) - (minute * 60);
                }
                // if (day <= 9) day = '0' + day;
                // if (hour <= 9) hour = '0' + hour;
                if (minute <= 9) minute = '0' + minute;
                if (second <= 9) second = '0' + second;

                return minute + ":" + second;
            }, e.formatStr = function (t) {
                for (var e = [], n = 1; n < arguments.length; n++) e[n - 1] = arguments[n];
                var o = new Array();
                if (o.push.apply(o, e), o.length > 0) for (var i = 0; i < o.length; i++) {
                    var r = "{" + i + "}";
                    t.indexOf(r) >= 0 && (t = t.replace(r, o[i]));
                }
                return t;
            }, e.formatTime = function (r, e, i) {
                var a = {};
                return a.M = r.getMonth() + 1, a.H = r.getHours(), a.s = r.getSeconds(), a.m = r.getMinutes(),
                    a.Y = r.getFullYear(), a.D = r.getDate(), a.d = r.getDay(), a.d = this.formatZero(a.d),
                    a.H = this.formatZero(a.H), a.M = this.formatZero(a.M), a.D = this.formatZero(a.D),
                    a.s = this.formatZero(a.s), a.m = this.formatZero(a.m), "date" == e ? i.indexOf(":") > -1 ? (a.Y = a.Y.toString().substr(2, 2),
                        a.Y + "/" + a.M + "/" + a.D) : i.indexOf("/") > -1 ? a.Y + "/" + a.M + "/" + a.D : i.indexOf("-") > -1 ? a.Y + "-" + a.M + "-" + a.D : i.indexOf("-") > -1 ? a.Y + "-" + a.M + "-" + a.D : a.Y + a.M + a.D : i.indexOf(":") > -1 ? (a.Y = a.Y.toString().substr(2, 2),
                            a.Y + "/" + a.M + "/" + a.D + " " + a.H + ":" + a.m + ":" + a.s) : i.indexOf("/") > -1 ? a.Y + "/" + a.M + "/" + a.D + " " + a.H + "/" + a.m + "/" + a.s : i.indexOf("-") > -1 ? a.Y + "-" + a.M + "-" + a.D + " " + a.H + "-" + a.m + "-" + a.s : i.indexOf("-") > -1 ? a.Y + "-" + a.M + "-" + a.D + " " + a.H + "-" + a.m + "-" + a.s : a.Y + a.M + a.D + a.H + a.m + a.s;
            }, e.formatZero = function (r) {
                return (r = r.toString()).length < 2 && (r = "0" + r), r;
            }, e._zeroDate = Math.floor(new Date(2018, 0, 1, 0, 0, 0).getTime() / 864e5), e;
        }();
        e.GameUtil = n;
    }(t.utils || (t.utils = {}));
}(asgard || (asgard = {})), function (t) {
    !function (e) {
        var n = function () {
            function e() { }
            return e.readBoolean = function (t) {
                return t.getByte() > .1;
            }, e.readByte = function (t) {
                return t.getByte();
            }, e.readShort = function (t) {
                return t.getInt16();
            }, e.readInt = function (t) {
                return t.getInt32();
            }, e.readInt64 = function (e) {
                var n = e.getInt32(), o = e.getInt32();
                return new t.utils.Int64(n, o);
            }, e.readFloat = function (t) {
                return t.getFloat32();
            }, e.readDouble = function (t) {
                return t.getFloat64();
            }, e.readString = function (t) {
                return t.getUTFString();
            }, e;
        }();
        e.DataUtil = n;
    }(t.utils || (t.utils = {}));
}(asgard || (asgard = {})), function (t) {
    !function (t) {
        var e = function () {
            function t() { }
            return t.init = function (t) {
                t && this._uifactory.indexOf(t.getAppName()) < 0 && this._uifactory.set(t.getAppName(), t);
            }, t.clearData = function (t) {
                this._uifactory.indexOf(t) >= 0 && this._uifactory.remove(t), this._uiPanels.indexOf(t) >= 0 && this._uiPanels.remove(t);
            }, t.findUIPanel = function (t, e) {
                var n = null;
                if (this._uiPanels.indexOf(t) >= 0) {
                    var o = this._uiPanels.get(t);
                    if (o.indexOf(e) >= 0) {
                        var i = o.get(e);
                        i && i.getName() == e && i.getAppName() == t && (n = i);
                    }
                }
                return n;
            }, t.showTopUIs = function (t, e) {
                if (this._uiPanels.indexOf(t) >= 0) {
                    var o = this._uiPanels.get(t);
                    var arr = o.values;
                    for (var i = 0; i < arr.length; i++) {
                        var item = arr[i];
                        //console.log("item0=====", item.isAlwaysTop(), item.isVisible(), item.getName(), e)
                        if (item && item.isAlwaysTop() && item.isShowing() && item.getName() != e) {
                            Laya.stage.addChild(item.getView())
                        }
                    }
                }
            }, t.openView = function (t, e, data, isAlwaysTop) {
                var n = this.findUIPanel(t, e);
                if (!n) {
                    var o = this._uifactory.get(t);
                    if (o && (n = o.getUI(e))) if (this._uiPanels.indexOf(t) >= 0) (i = this._uiPanels.get(t)).set(e, n); else {
                        var i = new Dictionary();
                        i.set(e, n), this._uiPanels.set(t, i);
                    }
                }
                return n && n.openView(data, isAlwaysTop), n;
            }, t.prepareView = function (t, e) {
                var n = this.findUIPanel(t, e);
                if (!n) {
                    var o = this._uifactory.get(t);
                    if (o && (n = o.getUI(e))) if (this._uiPanels.indexOf(t) >= 0) (i = this._uiPanels.get(t)).set(e, n); else {
                        var i = new Dictionary();
                        i.set(e, n), this._uiPanels.set(t, i);
                    }
                }
                return n && n.prepareView(), n;
            }, t.closeView = function (t, e) {
                var n = this.findUIPanel(t, e);
                n && n.closeView(!0);
            }, t.onFrame = function (t, e) {
                for (var n = 0, o = this._uiPanels.values; n < o.length; n++) for (var i = 0, r = o[n].values; i < r.length; i++) {
                    var s = r[i];
                    s && s.isShowing() && s.onFrame(t, e);
                }
            }, t._uifactory = new Dictionary(), t._uiPanels = new Dictionary(), t;
        }();
        t.UIManager = e;
    }(t.ui || (t.ui = {}));
}(asgard || (asgard = {})), function (t) {
    !function (t) {
        var e = function () {
            function t(t, e) {
                this._appName = t, this._name = e, this._resReady = !1;
                this.showData = {}
            }
            return t.prototype.getAppName = function () {
                return this._appName;
            }, t.prototype.getName = function () {
                return this._name;
            }, t.prototype.getView = function () {
                return this._uiView || (this._uiView = this.createView(), this._uiView && (this._uiView.name = this._name,
                    this.onInit())), this.setSize(), this._uiView;
            }, t.prototype.setSize = function () {
                this._uiView.width = Laya.stage.width; this._uiView.height = Laya.stage.height;
                this._uiView.y = (Laya.stage.height - this._uiView.height) / 2;
                Laya.stage.on(Laya.Event.RESIZE, this, this.onResize);
            }, t.prototype.onResize = function () {
                this._uiView && (this._uiView.y = (Laya.stage.height - this._uiView.height) / 2)
            }, t.prototype.isVisible = function () {
                return this._visible;
            }, t.prototype.isShowing = function () {//是否在显示
                if (this._uiView && this._uiView.parent) { return true } else { return false };
            }, t.prototype.isAlwaysTop = function () {
                return this._isAlwaysTop;
            }, t.prototype.isResReady = function () {
                return this._resReady;
            }, t.prototype.getDependenceRes = function () {
                return null;
            }, t.prototype.getSpineRes = function () {
                return null;
            }, t.prototype.getFntRes = function () {
                return null;
            }, t.prototype.createView = function () {
                return null;
            }, t.prototype._prepareRes = function () {
                if (this._resReady) this._doShow(); else {
                    var t = this.getDependenceRes();
                    var t = this.getDependenceRes();
                    t && t.length > 0 ? (Laya.loader.load(t, Laya.Handler.create(this, this.onAllResLoaded), Laya.Handler.create(this, this._onLoadResProcess, null, false))) : this.onAllResLoaded();
                }
            }, t.prototype.startLoad = function (self, t, m, n) { //在ts里覆盖该方法
                //console.log("t.prototype.startLoad")
                //new ddz.LoadResLogic().startLoad(this.getName(),Laya.Handler.create(this, this.onAllResLoaded), null, true, t, m, n)
            }, t.prototype.prepareView = function () {
                this._visible = !1, this._prepareRes();
            }, t.prototype.openView = function (data, isAlwaysTop) {
                this.showData = data;
                this._isAlwaysTop = isAlwaysTop;
                this._visible = !0, this._prepareRes();
            }, t.prototype.closeView = function (t) {
                this._visible = !1;
                if (this._uiView == null) return;
                this._uiView.visible = !1, this.onHide(), t && this._uiView && this._uiView.removeSelf() && Laya.stage.off(Laya.Event.RESIZE, this, this.onResize);
            }, t.prototype.onAllResLoaded = function () {
                this._resReady = !0, this.onPrepared(), this._visible && this._doShow();
            }, t.prototype._doShow = function () {
                var t = this.getView();
                //this._visible && t && (t.visible = !0, Laya.stage.addChild(this._uiView), 
                if (this._visible && t) {
                    t.visible = !0;
                    Laya.stage.addChild(this._uiView);
                    if (this._isAlwaysTop) {
                        //asgard.ui.UIManager.showTopUIs(this._appName, this._name);
                        this.onShow();
                    } else {
                        this.onShow();
                        asgard.ui.UIManager.showTopUIs(this._appName, this._name);
                    }
                }
            }, t.prototype.onFrame = function (t, e) { }, t.prototype.onInit = function () { },
                t.prototype.onPrepared = function () { }, t.prototype.onShow = function () { }, t.prototype.onHide = function () { },
                t.prototype.dispose = function () { }, t;
        }();
        t.BaseUIPanel = e;
    }(t.ui || (t.ui = {}));
}(asgard || (asgard = {})), function (t) {
    !function (t) {
        var e = function () {
            function t() { }
            return t.init = function (t) {
                t && this._stageFactory.indexOf(t.getAppName()) < 0 && this._stageFactory.set(t.getAppName(), t);
            }, t.clearData = function (t) {
                this._stageFactory.indexOf(t) >= 0 && this._stageFactory.remove(t), this._curStage.indexOf(t) >= 0 && this._curStage.remove(t),
                    this._lastStageId.indexOf(t) >= 0 && this._lastStageId.remove(t);
            }, t.LastStageId = function (t) {
                return this._lastStageId.get(t);
            }, t.CurStage = function (t) {
                return this._curStage.get(t);
            }, t.enterStage = function (t, e) {
                var n = this._curStage.get(t);
                if (n && n.stageId == e && n.reEnter) { n.reEnter(); return }
                n && (this._lastStageId.set(t, n.stageId), n.onExit(), this._curStage.set(t, null));
                var o = this._stageFactory.get(t);
                if (o) {
                    var i = o.getStage(e);
                    this._curStage.set(t, i), i && i.onEnter();
                }
            }, t.onFrame = function (t, e) {
                for (var n = 0, o = this._curStage.values; n < o.length; n++) o[n].onFrame(t, e);
            }, t.gameLog = function (message) {//在ts里覆盖该方法
                console.log(message)
            }, t._curStage = new Dictionary(), t._stageFactory = new Dictionary(),
                t._lastStageId = new Dictionary(), t;
        }();
        t.StageManager = e;
    }(t.stage || (t.stage = {}));
}(asgard || (asgard = {})), function (t) {
    !function (t) {
        var e = function () {
            function t(t, e) {
                this._appName = t, this._stageId = e;
            }
            return Object.defineProperty(t.prototype, "appName", {
                get: function () {
                    return this._appName;
                },
                enumerable: !0,
                configurable: !0
            }), Object.defineProperty(t.prototype, "stageId", {
                get: function () {
                    return this._stageId;
                },
                enumerable: !0,
                configurable: !0
            }), t.prototype.onEnter = function () { }, t.prototype.onFrame = function (t, e) { },
                t.prototype.onExit = function () { }, t;
        }();
        t.BaseStage = e;
    }(t.stage || (t.stage = {}));
}(asgard || (asgard = {})), function (t) {
    !function (t) {
        var e = Laya.Browser, n = function () {
            function n() {
                this._events = new t.NetEvents(), this.init();
            }
            return n.prototype.registerEventListener = function (t, e, n) {
                this._events.registerEventListener(t, e, n);
            }, n.prototype.unregisterEventListener = function (t) {
                this._events.unregisterEventListener(t);
            }, n.prototype.onBlur = function () {
                console.log("失去焦点");
            }, n.prototype.onVisibilityReconnect = function () {
                console.log("可见性变化"), Laya.stage.isVisibility && (this._socket.getConnected() || e.window.location.reload());
            }, n.prototype.init = function () {
                this._socket = new t.SimpleSocket(), this._socket.setEvents(this._events);
            }, n.prototype.connect = function (t, e) {
                this._socket || this.init(), this._socket.getConnected() || this._socket.connect(t, e);
            }, n.prototype.connectByUrl = function (t) {
                this._socket || this.init(), this._socket.getConnected() || this._socket.connectByUrl(t);
            }, Object.defineProperty(n.prototype, "connected", {
                get: function () {
                    return !!this._socket && this._socket.getConnected();
                },
                enumerable: !0,
                configurable: !0
            }), n.prototype.sendMessages = function (t, e, i) {
                if (i) {
                    //忽略平台是否展现
                    this._socket && this._socket.getConnected() ? this._socket.sendPackage(t, e) : this._socket && this._socket.getConnected();
                } else {
                    this._socket && this._socket.getConnected() ? Laya.stage.isVisibility && this._socket.sendPackage(t, e) : this._socket && this._socket.getConnected();
                }
            }, n.prototype.close = function () {
                this._socket && this._socket.getConnected() && this._socket.close();
            }, n.prototype.unUseFul = function () {
                close(), this._socket = null;
            }, n.prototype.hadSocket = function () {
                return !!this._socket;
            }, n.prototype.clearRecvArray = function () {
                this._socket && this._socket.clearRecvArray();
            }, n.prototype.onConnect = function () {
                this._events.connectedNotify();
            }, n.prototype.onMessageReceived = function (t, e) {
                this._events.messageReceivedNotify(t, e);
            }, n.prototype.onDisConnect = function () {
                this.onLoseConnectionWithServer();
            }, n.prototype.onConnectError = function () {
                this.showErrorMessageContent(), this.receiveIOError();
            }, n.prototype.receiveIOError = function () {
                close(), this.onLoseConnectionWithServer();
            }, n.prototype.showErrorMessageContent = function () { }, n.prototype.onLoseConnectionWithServer = function () {
                Laya.stage.isVisibility && (this._socket.getConnected() || (console.log("连接断开"),
                    e.window.location.reload()));
            }, n;
        }();
        t.TCPClient = n;
    }(t.net || (t.net = {}));
}(asgard || (asgard = {})), function (t) {
    !function (t) {
        var e = Laya.Event, n = Laya.Socket, o = Laya.Byte, i = function () {
            function t() {
                this.init();
            }
            return t.prototype.getEvents = function () {
                return this._events;
            }, t.prototype.setEvents = function (t) {
                this._events = t;
            }, t.prototype.getConnected = function () {
                return this.socket.connected;
            }, t.prototype.connect = function (t, e) {
                console.log("GameSocket.connect " + this.socket["_uid"]), this.resetConnect(), this.socket.connect(t, e);
            }, t.prototype.connectByUrl = function (t) {
                this._url = t;
                console.log("GameSocket.connectByUrl()", this._url, +this.socket["_uid"]), this.resetConnect(), this.socket.connectByUrl(t);
            }, t.prototype.close = function () {
                console.warn("GameSocket.close " + this.socket["_uid"]);
                this.socket && this.socket.connected && this.socket.offAllCaller(this) && this.socket.close();
            }, t.prototype.init = function () {
                this.socket = new n(), this.socket.endian = t.BYTE_ORDER, this.socket.on(e.OPEN, this, this.connectHandler),
                    this.socket.on(e.CLOSE, this, this.closeHandler), this.socket.on(e.MESSAGE, this, this.socketDataHandler),
                    this.socket.on(e.ERROR, this, this.errorHandler), this.outputBuffer = new o(), this.outputBuffer.endian = t.BYTE_ORDER,
                    this.inputBuffer = new o(), this.inputBuffer.endian = t.BYTE_ORDER, this.msgBuffer = new o(),
                    this.msgBuffer.endian = t.BYTE_ORDER;
                this.socket["_uid"] = Date.now();
            }, t.prototype.resetConnect = function () {
                this.socket.off(e.OPEN, this, this.connectHandler), this.socket.off(e.CLOSE, this, this.closeHandler),
                    this.socket.off(e.ERROR, this, this.errorHandler), this.socket.off(e.MESSAGE, this, this.socketDataHandler),
                    this.socket = null, this.outputBuffer = null, this.inputBuffer = null, this.msgBuffer = null,
                    this.init();
            }, t.prototype.sendPackage = function (t, e) {//head
                // this.socket.connected ? (e.pos = 0, this.outputBuffer.clear(), this.outputBuffer.writeInt16(29099), this.outputBuffer.writeInt16(e.length + 8), this.outputBuffer.writeInt16(0),
                //     this.outputBuffer.writeInt16(t), this.outputBuffer.writeArrayBuffer(e.buffer),
                //     this.outputBuffer.pos = 0, t != 5 && asgard.stage.StageManager.gameLog("Send cmd = " + t + ", bytes.leng = " + e.length),
                //     this.socket.output.writeArrayBuffer(this.outputBuffer.buffer), this.socket.flush(),
                //     this.outputBuffer.clear()) : console.log("GameSocket.sendPackage(), 无连接");

                this.socket.connected ? (e.pos = 0, this.outputBuffer.clear(), this.outputBuffer.writeArrayBuffer(e.buffer),
                    this.socket.output.writeArrayBuffer(this.outputBuffer.buffer), this.socket.flush()) : console.log("GameSocket.sendPackage(), 无连接");
            }, t.prototype.connectHandler = function (t) {
                console.log("GameSocket connectHandler", this.socket["_uid"])
                this._events.connectedNotify();
            }, t.prototype.closeHandler = function (t) {
                console.log("GameSocket.closeHandler " + this.socket["_uid"])
                this._events && this._events.closeNotify();
            }, t.prototype.errorHandler = function (t) {
                console.error("GameSocket errorHandler==", t, this.socket["_uid"])
                this._events && this._events.errorNotify();
                var obj = {}
                if (t && t.message) {
                    obj.msg = t.message;
                    if (typeof (obj.msg) == "string" && this._url) {
                        obj.msg = obj.msg + ":" + this._url;
                    }
                }
                this.sendAldEvent(obj);
            }, t.prototype.sendAldEvent = function (obj) {//在ts里覆盖该方法
                // if(ddz.ddzGame.playerModule.PlayerInfo.IsNew && ddz.ddzGame.playerModule.PlayerInfo.playCoinGameNum == 0){
                //     rare.PlatForm.GetInstance().sendEvent("新用户数_失败_第一次连接socket", obj);
                // }else{
                //     rare.PlatForm.GetInstance().sendEvent("失败_连接socket", obj);
                // }
            }, t.prototype.clearRecvArray = function () {
                this.inputBuffer && (this.inputBuffer.clear(), this.inputBuffer = new o()), this.msgBuffer && (this.msgBuffer.clear(),
                    this.msgBuffer = new o());
            }, t.prototype.socketDataHandler = function (t) {
                // console.log("socketDataHandler byteLength= ", t.byteLength);
                this.inputBuffer.writeArrayBuffer(t);
                this.inputBuffer.pos = 0;
                var l = this.inputBuffer.length;
                this.msgBuffer.clear();
                this.msgBuffer.writeArrayBuffer(this.inputBuffer.buffer, this.inputBuffer.pos, l);
                this.inputBuffer.length = 0, this.msgBuffer.pos = 0;
                this._events && this._events.messageReceivedNotify(1, this.msgBuffer), this.msgBuffer.clear();

                //try {
                // var e = void 0, n = void 0, o = void 0, i = void 0, l = void 0, c = void 0;
                // for (this.inputBuffer.writeArrayBuffer(t), this.inputBuffer.pos = 0; this.inputBuffer.bytesAvailable >= 8;) {
                //     e = this.inputBuffer.getInt16()
                //     if (e != 29099) return this.inputBuffer.length = 0, console.log("数据长度为0了 , 协议号为： " + n);
                //     l = this.inputBuffer.getInt16();
                //     if (!(l - 8 <= this.inputBuffer.bytesAvailable))
                //         break;
                //     n = this.inputBuffer.getInt16();
                //     n = this.inputBuffer.getInt16();
                //     this.msgBuffer.clear();
                //     this.msgBuffer.writeArrayBuffer(this.inputBuffer.buffer, this.inputBuffer.pos, l - 8);
                //     o = this.inputBuffer.pos + l - 8;
                //     i = this.inputBuffer.length - o;
                //     this.inputBuffer.pos = 0;
                //     if (i > 0) {
                //         this.inputBuffer.writeArrayBuffer(this.inputBuffer.buffer, o, this.inputBuffer.length), this.inputBuffer.length = i;
                //     } else {
                //         this.inputBuffer.length = 0, this.msgBuffer.pos = 0;
                //         asgard.stage.StageManager.gameLog("收到消息 " + n);
                //         this._events && this._events.messageReceivedNotify(n, this.msgBuffer), this.msgBuffer.clear();
                //     }
                // }
                //} catch (t) {
                //console.log("error = ", t.message);
                //}
            }, t.BYTE_ORDER = Laya.Byte.BIG_ENDIAN, t;
        }();
        t.SimpleSocket = i;
    }(t.net || (t.net = {}));
}(asgard || (asgard = {})), function (t) {
    !function (e) {
        var n = function () {
            function e() { }
            return e.prototype.errorHandling = function (e, n) {
                this._errorHandler = new t.utils.SimpleDelegate(e, n);
            }, e.prototype.postRequest = function (e, n, o, i, r, s) {
                void 0 === r && (r = 1e4), e && (this._taskHandler = new t.utils.SimpleDelegate(o, i),
                    this._http = new Laya.HttpRequest(), this._http.http.timeout = r, this._http.once(Laya.Event.PROGRESS, this, this.onHttpRequestProgress),
                    this._http.once(Laya.Event.COMPLETE, this, this.onHttpRequestComplete), this._http.once(Laya.Event.ERROR, this, this.onHttpRequestError),
                    this._http.send(e, n, "post", "text", s));
            }, e.prototype.getRequest = function (e, n, o, i) {
                void 0 === i && (i = 1e4), e && (this._taskHandler = new t.utils.SimpleDelegate(n, o),
                    this._http = new Laya.HttpRequest(), this._http.http.timeout = i, this._http.once(Laya.Event.PROGRESS, this, this.onHttpRequestProgress),
                    this._http.once(Laya.Event.COMPLETE, this, this.onHttpRequestComplete), this._http.once(Laya.Event.ERROR, this, this.onHttpRequestError),
                    this._http.send(e, null, "get", "text"));
            }, e.prototype.onHttpRequestError = function (t) {
                this._errorHandler && this._errorHandler.apply([t]);
            }, e.prototype.onHttpRequestProgress = function (t) {
                console.log("http precess " + t);
            }, e.prototype.onHttpRequestComplete = function (t) {
                this._taskHandler && this._taskHandler.apply([this._http.data]);
            }, e;
        }();
        e.SimpleHttp = n;
    }(t.net || (t.net = {}));
}(asgard || (asgard = {})), function (t) {
    !function (e) {

        var n = function () {
            function e(e) {
                this._connectionFlag = e, this._net = new t.net.TCPClient(), this._net.registerEventListener(Laya.Event.OPEN, this, this.OnConnected),
                    this._net.registerEventListener(Laya.Event.MESSAGE, this, this.OnMsgReceive),
                    this._net.registerEventListener(Laya.Event.CLOSE, this, this.OnClose), this._net.registerEventListener(Laya.Event.ERROR, this, this.OnError),
                    this._connectedNotify = null;
            }
            return Object.defineProperty(e.prototype, "ConnectionFlag", {
                get: function () {
                    return this._connectionFlag;
                },
                enumerable: !0,
                configurable: !0
            }), Object.defineProperty(e.prototype, "IsConnected", {
                get: function () {
                    return this._net.connected;
                },
                enumerable: !0,
                configurable: !0
            }), e.prototype.setConnectedNotify = function (e, n) {
                this._connectedNotify = new t.utils.SimpleDelegate(e, n);
            }, e.prototype.setMessageNotify = function (e, n) {
                this._messageNotify = new t.utils.SimpleDelegate(e, n);
            }, e.prototype.setCloseNotify = function (e, n) {
                this._closeNotify = new t.utils.SimpleDelegate(e, n);
            }, e.prototype.setErrorNotify = function (e, n) {
                this._errorNotify = new t.utils.SimpleDelegate(e, n);
            }, e.prototype.tryConnection = function (t, e) {
                this._net.connect(t, e);
            }, e.prototype.tryConnectionByUrl = function (t) {
                this._net.connectByUrl(t);
            }, e.prototype.close = function () {
                this._net.close();
            }, e.prototype.OnConnected = function () {
                this._connectedNotify && this._connectedNotify.apply();
            }, e.prototype.sendMessage = function (t, e, i) {
                var n = new Laya.Byte();
                n.endian = Laya.Byte.BIG_ENDIAN, n.writeArrayBuffer(e), this._net.sendMessages(t, n, i),
                    n = null;
            }, e.prototype.OnMsgReceive = function (t, e) {
                this._messageNotify && this._messageNotify.apply([this._connectionFlag, t, e]);
            }, e.prototype.OnClose = function () {
                this._closeNotify && this._closeNotify.apply();
            }, e.prototype.OnError = function () {
                this._errorNotify && this._errorNotify.apply();
            }, e;
        }();
        e.NetSession = n;
        var o = function () {
            function e() { }
            return e.tryConnect = function (o, i, r, s, a) {
                var u;
                return e._sessions.indexOf(o) < 0 ? ((u = new n(o)).setMessageNotify(t.message.MessageDispatcher, t.message.MessageDispatcher._onMessageNotify),
                    e._sessions.set(o, u)) : u = e._sessions.get(o), u && (u.setConnectedNotify(s, a),
                        u.tryConnection(i, r)), u;
            }, e.tryConnectByUrl = function (o, i, r, s) {
                var a;
                return e._sessions.indexOf(o) < 0 ? ((a = new n(o)).setMessageNotify(t.message.MessageDispatcher, t.message.MessageDispatcher._onMessageNotify),
                    e._sessions.set(o, a)) : a = e._sessions.get(o), a && (a.setConnectedNotify(r, s),
                        a.tryConnectionByUrl(i)), a;
            }, e.close = function (t) {
                if (e._sessions.indexOf(t) < 0) return null;
                var i;
                return null == (i = e._sessions.get(t)) ? null : (i.close(), e._sessions.remove(t), i);
            }, e.tryClose = function (t, n, o) {
                if (e._sessions.indexOf(t) < 0) return null;
                var i;
                return null == (i = e._sessions.get(t)) ? null : (i.setCloseNotify(n, o), i);
            }, e.tryError = function (t, n, o) {
                if (e._sessions.indexOf(t) < 0) return null;
                var i;
                return null == (i = e._sessions.get(t)) ? null : (i.setErrorNotify(n, o), i);
            }, e.sendMessage = function (t, n, o, i) {
                var i;
                (i = e._sessions.get(t)) && i.sendMessage(n, o, i);
            }, e.IsConnected = function (t) {
                var n;
                return !!(n = e._sessions.get(t)) && n.IsConnected;
            }, e._sessions = new Dictionary(), e;
        }();
        e.NetManager = o;
    }(t.net || (t.net = {}));
}(asgard || (asgard = {})), function (t) {
    !function (e) {
        var n = Laya.Event, o = t.utils.SimpleDelegate, i = function () {
            function t() { }
            return t.prototype.registerEventListener = function (t, e, i) {
                switch (t) {
                    case n.OPEN:
                        this.onConnected = new o(e, i);
                        break;

                    case n.CLOSE:
                        this.onClose = new o(e, i);
                        break;

                    case n.ERROR:
                        this.onError = new o(e, i);
                        break;

                    case n.MESSAGE:
                        this.onMessageReceived = new o(e, i);
                }
            }, t.prototype.unregisterEventListener = function (t) {
                switch (t) {
                    case n.OPEN:
                        this.onConnected = null;
                        break;

                    case n.CLOSE:
                        this.onClose = null;
                        break;

                    case n.ERROR:
                        this.onError = null;
                        break;

                    case n.MESSAGE:
                        this.onMessageReceived = null;
                }
            }, t.prototype.connectedNotify = function () {
                this.onConnected && this.onConnected.apply();
            }, t.prototype.closeNotify = function () {
                this.onClose && (this.onClose.apply(), console.log("SimpleSocket.closeHandler(), 数据连接关闭!"));
            }, t.prototype.errorNotify = function () {
                this.onError && (this.onError.apply(), console.log("SimpleSocket.errorHandler(), 数据连接错误!"));
            }, t.prototype.messageReceivedNotify = function (t, e) {
                this.onMessageReceived && this.onMessageReceived.apply([t, e]);
            }, t;
        }();
        e.NetEvents = i;
    }(t.net || (t.net = {}));
}(asgard || (asgard = {})), function (t) {
    !function (t) {
        var e = function () {
            function t() { }
            return t.init = function (t) {
                if (t && this._moduleFactory.indexOf(t.getAppName()) < 0) {
                    this._moduleFactory.set(t.getAppName(), t);
                    var e = new Dictionary();
                    this._moduleMap.set(t.getAppName(), e);
                }
            }, t.clearModuleData = function (t) {
                if (this._moduleMap.indexOf(t) >= 0) for (var e = 0, n = this._moduleMap.get(t).values; e < n.length; e++) n[e].clearData();
            }, t.clearData = function (t) {
                if (this._moduleMap.indexOf(t) >= 0) {
                    for (var e = 0, n = this._moduleMap.get(t).values; e < n.length; e++) n[e].clearData();
                    this._moduleMap.remove(t);
                }
                this._moduleFactory.indexOf(t) >= 0 && this._moduleFactory.remove(t);
            }, t.findModule = function (t, e) {
                var n = null;
                if (this._moduleMap.indexOf(t) < 0) return n;
                var o = this._moduleMap.get(t);
                return o.indexOf(e) < 0 ? n : n = o.get(e);
            }, t.getModule = function (t, e) {
                var n = this.findModule(t, e);
                return !n && this._moduleFactory.indexOf(t) >= 0 && (n = this._moduleFactory.get(t).getModule(e)) && this._moduleMap.get(t).set(e, n),
                    n;
            }, t._moduleFactory = new Dictionary(), t._moduleMap = new Dictionary(),
                t;
        }();
        t.ModuleManager = e;
    }(t.module || (t.module = {}));
}(asgard || (asgard = {})), function (t) {
    !function (t) {
        var e = function () {
            function t(t, e) {
                this._appName = t, this._moduleId = e;
            }
            return Object.defineProperty(t.prototype, "appName", {
                get: function () {
                    return this._appName;
                },
                enumerable: !0,
                configurable: !0
            }), Object.defineProperty(t.prototype, "moduleId", {
                get: function () {
                    return this._moduleId;
                },
                enumerable: !0,
                configurable: !0
            }), t.prototype.clearData = function () { }, t;
        }();
        t.BaseModule = e;
    }(t.module || (t.module = {}));
}(asgard || (asgard = {})), function (t) {
    !function (t) {
        var e = function () {
            function t() { }
            return t.init = function (t) {
                t && this._messageFactory.indexOf(t.getAppName()) < 0 && (this._messageFactory.set(t.getAppName(), t),
                    t.init());
            }, t.clearData = function (t) {
                this._messageFactory.indexOf(t) >= 0 && (this._messageFactory.get(t).clearData(),
                    this._messageFactory.remove(t));
            }, t._onMessageNotify = function (t, e, n) {
                var o = this._messageFactory.get(t);
                if (o) {
                    var i = o.getMessage(e);
                    if (!i) throw new Error("Unsupported msg:" + e);
                    var r = n.length, s = new protobuf.Reader(n.getUint8Array(0, r)), a = i.apply([s, r]);
                    o.getHandler(e).apply([a]);
                }
            }, t._messageFactory = new Dictionary(), t;
        }();
        t.MessageDispatcher = e;
    }(t.message || (t.message = {}));
}(asgard || (asgard = {})), function (t) {
    !function (e) {
        var n = function () {
            function e() {
                this._connectionFlag = 1;
            }
            return e.prototype.getreturnMsg = function () {
                return this.returnMsg;
            }, e.prototype.setConnectionFlag = function (t) {
                this._connectionFlag = t;
            }, Object.defineProperty(e.prototype, "connectionFlag", {
                get: function () {
                    return this._connectionFlag;
                },
                enumerable: !0,
                configurable: !0
            }), e.prototype.encode = function () {
                return this._bytes = new laya.utils.Byte(), this._bytes.endian = Laya.Byte.BIG_ENDIAN,
                    this.onEncode(), this._bytes;
            }, e.prototype.decode = function (t) {
                this._bytes = t, this.onDecode();
            }, e.prototype.getByteArray = function () {
                return this._bytes;
            }, e.prototype.onEncode = function () { }, e.prototype.onDecode = function () { }, e.prototype.writeBoolean = function (t) {
                1 == t ? this._bytes.writeByte(1) : this._bytes.writeByte(0);
            }, e.prototype.writeByte = function (t) {
                this._bytes.writeByte(t);
            }, e.prototype.writeShort = function (t) {
                this._bytes.writeInt16(t);
            }, e.prototype.writeInt = function (t) {
                this._bytes.writeInt32(t);
            }, e.prototype.writeLong = function (t) {
                this._bytes.writeInt32(t);
            }, e.prototype.writeFloat = function (t) {
                this._bytes.writeFloat32(t);
            }, e.prototype.writeDouble = function (t) {
                this._bytes.writeFloat64(t);
            }, e.prototype.writeString = function (t) {
                this._bytes.writeUTFString(t);
            }, e.prototype.readBoolean = function () {
                return this._bytes.getByte() > .1;
            }, e.prototype.readByte = function () {
                return this._bytes.getByte();
            }, e.prototype.readShort = function () {
                return this._bytes.getInt16();
            }, e.prototype.readInt = function () {
                return this._bytes.getInt32();
            }, e.prototype.readInt64 = function () {
                var e = this._bytes.getInt32(), n = this._bytes.getInt32();
                return new t.utils.Int64(e, n);
            }, e.prototype.readFloat = function () {
                return this._bytes.getFloat32();
            }, e.prototype.readDouble = function () {
                return this._bytes.getFloat64();
            }, e.prototype.readString = function () {
                return this._bytes.getUTFString();
            }, e.prototype.toString = function () {
                return "";
            }, e;
        }();
        e.BaseMessage = n;
    }(t.message || (t.message = {}));
}(asgard || (asgard = {}));

var asgard;

!function (t) {
    !function (e) {
        var n = function () {
            function e() { }
            return e.init = function (t) {
                if (this._eventMap.indexOf(t) < 0) {
                    var e = new Dictionary();
                    this._eventMap.set(t, e);
                }
            }, e.clearData = function (t) {
                if (this._eventMap.indexOf(t) >= 0) {
                    for (var e = 0, n = this._eventMap.get(t).values; e < n.length; e++) n[e].clearAll();
                    this._eventMap.remove(t);
                }
            }, e.registerEventListener = function (e, n, o, i) {
                var r = this._eventMap.get(e);
                if (r && n > 0 && o && i) {
                    var s = r.get(n);
                    s || (s = new t.utils.SimpleDelegates(), r.set(n, s)), s.tryAddDelegate(o, i);
                }
            }, e.unregisterEventListener = function (t, e, n, o) {
                var i = this._eventMap.get(t);
                if (i && e > 0 && n && o) {
                    var r = i.get(e);
                    r && r.removeDelegate(n, o);
                }
            }, e.eventNotify = function (t, e, n) {
                var o = this._eventMap.get(t);
                if (o && e > 0) {
                    var i = o.get(e);
                    i && (n ? i.invokeDelegate(n) : i.invokeDelegate());
                }
            }, e._eventMap = new Dictionary(), e;
        }();
        e.EventsDispatcher = n;
    }(t.events || (t.events = {}));
}(asgard || (asgard = {}));

(function (asgard) {
    var data;
    (function (data) {
        var DataUtil = asgard.utils.DataUtil;
        var BaseStaticData = /** @class */ (function () {
            function BaseStaticData() {
                this.Id = 0;
            }
            BaseStaticData.prototype.getDataType = function () {
                return 0;
            };
            BaseStaticData.prototype.initialize = function (soudata) {
                return false;
            };
            BaseStaticData.prototype.initReference = function () {
            };
            BaseStaticData.prototype.initTextBlock = function () {
            };
            BaseStaticData.prototype.readBoolean = function (indata) {
                return (indata.getByte() > 0.1);
            };
            BaseStaticData.prototype.readByte = function (indata) {
                return indata.getByte();
            };
            BaseStaticData.prototype.readShort = function (indata) {
                return indata.getInt16();
            };
            BaseStaticData.prototype.readInt = function (indata) {
                return indata.getInt32();
            };
            BaseStaticData.prototype.readInt64 = function (indata) {
                var lowV = indata.getInt32();
                var highV = indata.getInt32();
                return new asgard.utils.Int64(lowV, highV);
            };
            BaseStaticData.prototype.readFloat = function (indata) {
                return indata.getFloat32();
            };
            BaseStaticData.prototype.readDouble = function (indata) {
                return indata.getFloat64();
            };
            BaseStaticData.prototype.readString = function (indata) {
                return indata.getUTFString();
            };
            return BaseStaticData;
        }());
        data.BaseStaticData = BaseStaticData;
        var BaseTextBlockData = /** @class */ (function () {
            function BaseTextBlockData(source) {
                this._textSource = source;
            }
            BaseTextBlockData.prototype.initData = function () {
            };
            Object.defineProperty(BaseTextBlockData.prototype, "textSource", {
                get: function () {
                    return this.textSource;
                },
                enumerable: true,
                configurable: true
            });
            return BaseTextBlockData;
        }());
        data.BaseTextBlockData = BaseTextBlockData;
        var StaticDataManager = /** @class */ (function () {
            function StaticDataManager() {
            }
            StaticDataManager.getSheet = function (datatype) {
                return StaticDataManager._dataMap.get(datatype);
            };
            StaticDataManager.getSheetDatas = function (datatype) {
                var sheet = StaticDataManager._dataMap.get(datatype);
                if (sheet)
                    return sheet.getSheetDatas();
                else
                    return null;
            };
            StaticDataManager.appendSheet = function (sheetId) {
                var sheetData = StaticDataManager._dataMap.get(sheetId);
                if (!sheetData) {
                    var newSheet = new StaticDataSheet();
                    StaticDataManager._dataMap.set(sheetId, newSheet);
                    return newSheet;
                }
                else {
                    return sheetData;
                }
            };
            StaticDataManager.findData = function (sheetId, dataId) {
                var sheetData = StaticDataManager._dataMap.get(sheetId);
                if (sheetData != null)
                    return sheetData.getData(dataId);
                else
                    return null;
            };
            StaticDataManager.loadStaticData = function (souData, dataFactory) {
                var sheetCount = DataUtil.readShort(souData);
                var sheetDataPos = new Array(sheetCount);
                var sheetDataSize = new Array(sheetCount);
                var i;
                for (i = 0; i < sheetCount; i++) {
                    sheetDataPos[i] = DataUtil.readInt(souData);
                    sheetDataSize[i] = DataUtil.readInt(souData);
                }
                var sheet;
                var sheets = new Array(sheetCount);
                for (i = 0; i < sheetCount; i++) {
                    sheet = new StaticDataSheet();
                    sheet.initDataFactory(dataFactory);
                    sheet.loadSheetData(souData);
                    sheets[i] = sheet;
                    StaticDataManager._dataMap.set(sheet.SheetId, sheet);
                }
                for (i = 0; i < sheetCount; i++) {
                    sheets[i].loadReferenceData();
                }
                for (i = 0; i < sheetCount; i++) {
                    sheets[i].loadTextBlockData();
                }
            };
            StaticDataManager._dataMap = new Dictionary();
            return StaticDataManager;
        }());
        data.StaticDataManager = StaticDataManager;
        var StaticDataSheet = /** @class */ (function () {
            function StaticDataSheet() {
                this._sheetId = 0;
                this._sheetName = null;
                this._containsReferenceField = false;
                this._containsTextBlockField = false;
                this._dataMap = new Dictionary();
                this._dataList = null;
            }
            StaticDataSheet.prototype.initDataFactory = function (dataFactory) {
                this._dataFactory = dataFactory;
            };
            Object.defineProperty(StaticDataSheet.prototype, "SheetId", {
                get: function () {
                    return this._sheetId;
                },
                enumerable: true,
                configurable: true
            });
            Object.defineProperty(StaticDataSheet.prototype, "SheetName", {
                get: function () {
                    return this._sheetName;
                },
                enumerable: true,
                configurable: true
            });
            StaticDataSheet.prototype.getData = function (dataId) {
                var item = this._dataMap.get(dataId);
                return item;
            };
            StaticDataSheet.prototype.getSheetDatas = function () {
                if (this._dataList != null) {
                    var dataCount = this._dataList.length;
                    if (dataCount > 0) {
                        var result = new Array(dataCount);
                        for (var i = 0; i < dataCount; i++) {
                            result[i] = this._dataList[i];
                        }
                        return result;
                    }
                }
                return null;
            };
            StaticDataSheet.prototype.loadSheetData = function (inStream) {
                try {
                    this._sheetName = DataUtil.readString(inStream);
                    this._sheetId = DataUtil.readShort(inStream);
                    DataUtil.readString(inStream);
                    var i = void 0;
                    var rowCount = DataUtil.readShort(inStream);
                    var colCount = DataUtil.readShort(inStream);
                    for (i = 0; i < colCount; i++) {
                        DataUtil.readString(inStream);
                        if (DataUtil.readShort(inStream) > 0) {
                            this._containsReferenceField = true;
                        }
                        DataUtil.readString(inStream);
                        if (DataUtil.readByte(inStream) == 7) {
                            this._containsTextBlockField = true;
                        }
                        DataUtil.readByte(inStream);
                    }
                    var staticData = void 0;
                    this._dataList = new Array(rowCount);
                    for (i = 0; i < rowCount; i++) {
                        staticData = this._dataFactory.createStaticData(this._sheetId);
                        if (staticData != null) {
                            try {
                                staticData.initialize(inStream);
                                this._dataList[i] = staticData;
                                this._dataMap.set(staticData.Id, staticData);
                            }
                            catch (Error) {
                            }
                        }
                    }
                }
                catch (Error) {
                }
            };
            StaticDataSheet.prototype.loadReferenceData = function () {
                if (this._dataList == null || !this._containsReferenceField)
                    return;
                var dataCount = this._dataList.length;
                for (var i = 0; i < dataCount; i++) {
                    this._dataList[i].initReference();
                }
            };
            StaticDataSheet.prototype.loadTextBlockData = function () {
                if (this._dataList == null || !this._containsTextBlockField)
                    return;
                var dataCount = this._dataList.length;
                for (var i = 0; i < dataCount; i++) {
                    this._dataList[i].initTextBlock();
                }
            };
            Object.defineProperty(StaticDataSheet.prototype, "Count", {
                get: function () {
                    if (this._dataList)
                        return this._dataList.length;
                    else
                        return 0;
                },
                enumerable: true,
                configurable: true
            });
            StaticDataSheet.prototype.getDataAt = function (idx) {
                if (idx >= 0 && idx < this._dataList.length)
                    return this._dataList[idx];
                else
                    return null;
            };
            return StaticDataSheet;
        }());
        data.StaticDataSheet = StaticDataSheet;
    })(data = asgard.data || (asgard.data = {}));
})(asgard || (asgard = {}));