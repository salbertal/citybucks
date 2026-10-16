/*
 * compat.js — City Bucks (2010, PhoneGap/iPad) on modern browsers.
 *
 * Loaded BEFORE all-compressed.js. The original game code stays untouched;
 * everything needed to run it today lives here:
 *
 *   1. iPad mode   — the game checks navigator.userAgent for "iPad". In iPad
 *                    mode it uses touch handlers (the well-tested path). The
 *                    desktop path relies on 2010-era HTML5 drag events that
 *                    no longer report usable coordinates, so we force iPad.
 *   2. Media       — PhoneGap's audio API, re-implemented with Web Audio
 *                    (falls back to <audio> if fetch/decoding is unavailable).
 *   3. Input       — Pointer Events (mouse, trackpad, pen, touch) are turned
 *                    into the inline ontouchstart/ontouchmove/ontouchend
 *                    handlers the game sets as attributes. Multi-touch works,
 *                    so two players can still drag at the same time on a tablet.
 *   4. Scaling     — the fixed 768x1024 board is scaled to fit the window;
 *                    pointer coordinates are mapped back into board space.
 *   5. Offline     — the 2010 "news" cross-promo request is answered locally.
 *   6. Smoothness  — render every sprite after each logic tick; CSS glides them.
 *                    Also fixes the original "Restart speeds the game up" bug.
 */
(function () {
    'use strict';

    var BOARD_W = 768;
    var BOARD_H = 1024;

    /* ---------- 1. iPad mode ---------- */

    var fakeUA = navigator.userAgent + ' (iPad; CityBucksCompat)';
    try {
        Object.defineProperty(navigator, 'userAgent', { get: function () { return fakeUA; }, configurable: true });
    } catch (e) {}
    if (!/iPad/i.test(navigator.userAgent)) {
        try {
            Object.defineProperty(Object.getPrototypeOf(navigator), 'userAgent', { get: function () { return fakeUA; }, configurable: true });
        } catch (e) {}
    }

    /* ---------- 2. Media (PhoneGap audio) ---------- */

    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    var ctx = AudioCtx ? new AudioCtx() : null;
    var bufferCache = {};

    function loadBuffer(src) {
        if (!bufferCache[src]) {
            bufferCache[src] = fetch(src)
                .then(function (r) { if (!r.ok) { throw new Error(r.status); } return r.arrayBuffer(); })
                .then(function (data) {
                    return new Promise(function (resolve, reject) { ctx.decodeAudioData(data, resolve, reject); });
                });
        }
        return bufferCache[src];
    }

    // Fixes for sound files referenced by the original code:
    //   fire-small — shipped as "firesmall.mp3" (bug in the 2010 build)
    //   theme      — never shipped in the IPA; the Info screen stays silent
    var SOUND_ALIASES = { 'sound/fire-small.mp3': 'sound/firesmall.mp3' };
    var SOUND_MISSING = { 'sound/theme.mp3': true };

    function Media(src) {
        src = SOUND_ALIASES[src] || src;
        this.missing = !!SOUND_MISSING[src];
        this.src = src;
        this.source = null;
        this.fallback = null;
        this.useFallback = !ctx || location.protocol === 'file:';
        if (!this.useFallback && !this.missing) { loadBuffer(src).catch(function () {}); }
    }

    Media.prototype.play = function () {
        var self = this;
        if (self.missing) { return; }
        var api = window.CityBucksCompat;
        if (api && api.onSound) { api.onSound(self.src); }
        if (self.useFallback) {
            if (!self.fallback) { self.fallback = new Audio(self.src); }
            self.fallback.currentTime = 0;
            var p = self.fallback.play();
            if (p && p.catch) { p.catch(function () {}); }
            return;
        }
        loadBuffer(self.src).then(function (buffer) {
            self.stop();
            var node = ctx.createBufferSource();
            node.buffer = buffer;
            node.connect(ctx.destination);
            node.start(0);
            self.source = node;
        }).catch(function () {
            self.useFallback = true;
            self.play();
        });
    };

    Media.prototype.pause = Media.prototype.stop = function () {
        if (this.source) {
            try { this.source.stop(); } catch (e) {}
            this.source = null;
        }
        if (this.fallback) { this.fallback.pause(); }
    };

    Media.prototype.release = Media.prototype.stop;
    Media.prototype.seekTo = function () {};
    Media.prototype.setVolume = function () {};

    window.Media = Media;

    /* ---------- News dialog (2010 cross-promo) ---------- */

    // Every few days the game fetched http://file.versuspad.com/news.txt to
    // show an App Store promo. Keep the game offline: answer with "no news".
    var xhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
        if (/versuspad\.com\/news/i.test(String(url))) {
            arguments[1] = 'data:text/plain,';
        }
        return xhrOpen.apply(this, arguments);
    };

    // Browsers only allow audio after a user gesture.
    function unlockAudio() {
        if (ctx && ctx.state === 'suspended') { ctx.resume(); }
    }

    /* ---------- 6. Smooth rendering ---------- */

    // The game runs logic every C.Lc (210 ms) and rendering every C.ad (270 ms),
    // out of phase, and the iPad-1-era renderer only refreshes 30 moving sprites
    // per frame (C.se), so with ~200 citizens each one jumps every ~2 s.
    // We render every sprite right after each logic tick; compat.css then
    // glides elements between positions (transition = one logic tick).
    var nativeSetInterval = window.setInterval;
    var nativeClearInterval = window.clearInterval;
    var renderFn = null;
    var renderId = null;
    var logicId = null;
    var sprites = new Map(); // element -> last rendered position

    function game() { return window.C; }

    function renderAll() {
        var g = game();
        if (!renderFn || !g) { return; }
        g.se = 1e9;
        renderFn();
        snapTeleports();
        if (window.CityBucksCompat && CityBucksCompat.onRender) { CityBucksCompat.onRender(); }
    }

    // A sprite that jumps far in one tick (entering/leaving a building, new
    // map) must not glide across the board: apply that change instantly.
    function snapTeleports() {
        var els = document.body ? document.body.children : [];
        for (var i = 0; i < els.length; i++) {
            var el = els[i];
            var cls = el.className;
            if (typeof cls !== 'string' || cls.indexOf('_x') < 0) { continue; }
            var x = el.style.left, y = el.style.top;
            var prev = sprites.get(el);
            if (prev && (prev.x !== x || prev.y !== y)) {
                var dx = parseFloat(x) - parseFloat(prev.x), dy = parseFloat(y) - parseFloat(prev.y);
                if (dx * dx + dy * dy > 48 * 48) {
                    el.style.transition = 'none';
                    void el.offsetWidth;
                    el.style.transition = '';
                }
            }
            sprites.set(el, { x: x, y: y });
        }
        if (sprites.size > els.length * 2) {
            sprites.forEach(function (v, el) { if (!el.parentNode) { sprites.delete(el); } });
        }
    }

    window.setInterval = function (fn, delay) {
        var g = game();
        if (g && typeof fn === 'function') {
            if (delay === g.ad) {
                renderFn = fn;
                renderId = { compatRender: true };
                return renderId;
            }
            if (delay === g.Lc) {
                // Original bug: g_reInit (Restart) never cleared the logic
                // interval, so every restart added another one (2x, 3x speed).
                // There is only ever one game: keep a single logic interval.
                if (logicId !== null) { nativeClearInterval(logicId); }
                var logic = fn;
                logicId = nativeSetInterval(function () { logic(); renderAll(); }, delay);
                return logicId;
            }
        }
        return nativeSetInterval.apply(window, arguments);
    };

    window.clearInterval = function (id) {
        if (id !== null && id !== undefined && id === logicId) { logicId = null; }
        if (id && id === renderId) {
            renderFn = null;
            renderId = null;
            return;
        }
        return nativeClearInterval(id);
    };

    /* ---------- 4. Scaling ---------- */

    // rotated: show the board upside down (online guest = top player).
    var view = { scale: 1, offsetX: 0, offsetY: 0, rotated: false };

    function fitBoard() {
        var body = document.body;
        if (!body) { return; }
        var w = window.innerWidth;
        var h = window.innerHeight;
        var s = Math.min(w / BOARD_W, h / BOARD_H);
        view.scale = s;
        view.offsetX = Math.round((w - BOARD_W * s) / 2);
        view.offsetY = Math.round((h - BOARD_H * s) / 2);
        body.style.transformOrigin = '0 0';
        body.style.transform = view.rotated
            ? 'translate(' + (view.offsetX + BOARD_W * s) + 'px,' + (view.offsetY + BOARD_H * s) + 'px) scale(' + s + ') rotate(180deg)'
            : 'translate(' + view.offsetX + 'px,' + view.offsetY + 'px) scale(' + s + ')';
    }

    function toBoard(clientX, clientY) {
        var x = (clientX - view.offsetX) / view.scale;
        var y = (clientY - view.offsetY) / view.scale;
        return view.rotated ? { x: BOARD_W - x, y: BOARD_H - y } : { x: x, y: y };
    }

    function toClient(x, y) {
        if (view.rotated) { x = BOARD_W - x; y = BOARD_H - y; }
        return { x: x * view.scale + view.offsetX, y: y * view.scale + view.offsetY };
    }

    /* ---------- 3. Input ---------- */

    // Every pointer, local or remote, goes through pointer(type, id, x, y)
    // in board coordinates. Online mode hooks in via:
    //   inputSink(type, id, x, y)  — guest: send input away instead of using it
    //   canUse(el, source)         — host: who may touch which control
    var active = {}; // pointerId -> { el, touch }
    var inputSink = null;

    function handlerElement(target) {
        for (var el = target; el && el !== document; el = el.parentNode) {
            if (el.getAttribute && (el.getAttribute('ontouchstart') || el.getAttribute('ontouchmove') || el.getAttribute('ontouchend'))) {
                return el;
            }
        }
        return null;
    }

    function elementAtBoard(x, y) {
        var c = toClient(x, y);
        var list = document.elementsFromPoint ? document.elementsFromPoint(c.x, c.y) : [document.elementFromPoint(c.x, c.y)];
        for (var i = 0; i < list.length; i++) {
            if (list[i] && document.body.contains(list[i]) && list[i] !== document.body) { return list[i]; }
        }
        return null;
    }

    function makeTouch(id, x, y, el) {
        return { identifier: id, target: el, pageX: x, pageY: y, clientX: x, clientY: y };
    }

    function touchesOn(el) {
        var list = [];
        for (var id in active) {
            if (active[id].el === el) { list.push(active[id].touch); }
        }
        return list;
    }

    function fire(el, type, changed, targetTouches) {
        var code = el.getAttribute('on' + type);
        if (!code) { return; }
        var all = [];
        for (var id in active) { all.push(active[id].touch); }
        var fakeEvent = {
            type: type,
            target: el,
            currentTarget: el,
            touches: all,
            targetTouches: targetTouches,
            changedTouches: [changed],
            preventDefault: function () {},
            stopPropagation: function () {}
        };
        try {
            new Function('event', code).call(el, fakeEvent);
        } catch (err) {
            console.error('[compat] ' + type + ' handler failed:', err);
        }
    }

    // type: 'down' | 'move' | 'up'; source: 'local' | 'remote'
    function pointer(type, id, x, y, hintTarget, source) {
        var rec = active[id];
        if (type === 'down') {
            if (rec) { pointer('up', id, x, y, null, source); }
            var el = handlerElement(hintTarget || elementAtBoard(x, y));
            if (!el) { return; }
            var api = window.CityBucksCompat;
            if (api && api.canUse && !api.canUse(el, source || 'local')) { return; }
            var touch = makeTouch(id, x, y, el);
            active[id] = { el: el, touch: touch };
            fire(el, 'touchstart', touch, touchesOn(el));
        } else if (rec) {
            rec.touch = makeTouch(id, x, y, rec.el);
            if (type === 'move') {
                var others = touchesOn(rec.el).filter(function (t) { return t !== rec.touch; });
                fire(rec.el, 'touchmove', rec.touch, [rec.touch].concat(others));
            } else {
                delete active[id];
                fire(rec.el, 'touchend', rec.touch, touchesOn(rec.el));
            }
        }
    }

    var localDown = {};

    function onPointerDown(e) {
        unlockAudio();
        if (e.pointerType === 'mouse' && e.button !== 0) { return; }
        if (e.target && e.target.closest && e.target.closest('[data-cb-ui]')) { return; }
        e.preventDefault();
        var p = toBoard(e.clientX, e.clientY);
        localDown[e.pointerId] = true;
        if (inputSink) { inputSink('down', e.pointerId, p.x, p.y); return; }
        pointer('down', e.pointerId, p.x, p.y, e.target, 'local');
    }

    function onPointerMove(e) {
        if (!localDown[e.pointerId]) { return; }
        e.preventDefault();
        var p = toBoard(e.clientX, e.clientY);
        if (inputSink) { inputSink('move', e.pointerId, p.x, p.y); return; }
        pointer('move', e.pointerId, p.x, p.y, null, 'local');
    }

    function onPointerUp(e) {
        if (!localDown[e.pointerId]) { return; }
        delete localDown[e.pointerId];
        var p = toBoard(e.clientX, e.clientY);
        if (inputSink) { inputSink('up', e.pointerId, p.x, p.y); return; }
        pointer('up', e.pointerId, p.x, p.y, null, 'local');
    }

    // Native touch events would reach the same inline handlers with unscaled
    // coordinates; swallow them so Pointer Events are the single input path.
    function swallowTouch(e) {
        // Our own UI (online lobby) keeps normal touch behaviour (taps, inputs).
        if (e.target && e.target.closest && e.target.closest('[data-cb-ui]')) { return; }
        e.stopPropagation();
        if (e.cancelable) { e.preventDefault(); }
    }

    var opts = { capture: true, passive: false };
    window.addEventListener('pointerdown', onPointerDown, opts);
    window.addEventListener('pointermove', onPointerMove, opts);
    window.addEventListener('pointerup', onPointerUp, opts);
    window.addEventListener('pointercancel', onPointerUp, opts);
    ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(function (t) {
        window.addEventListener(t, swallowTouch, opts);
    });
    window.addEventListener('contextmenu', function (e) { e.preventDefault(); }, opts);
    window.addEventListener('dragstart', function (e) { e.preventDefault(); }, opts);
    window.addEventListener('gesturestart', function (e) { e.preventDefault(); }, opts);

    window.addEventListener('resize', fitBoard);
    document.addEventListener('DOMContentLoaded', fitBoard);

    window.CityBucksCompat = {
        view: view,
        fitBoard: fitBoard,
        toBoard: toBoard,
        setRotated: function (on) { view.rotated = !!on; fitBoard(); },
        setInputSink: function (fn) { inputSink = fn; },
        // Remote input: ids are namespaced so they never clash with local pointers.
        injectPointer: function (type, id, x, y) { pointer(type, 'remote-' + id, x, y, null, 'remote'); },
        canUse: null,   // function (el, source) -> bool
        onRender: null, // called after every rendered tick
        onSound: null   // function (src) — a sound was played
    };
})();
