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

    function Media(src) {
        this.src = src;
        this.source = null;
        this.fallback = null;
        this.useFallback = !ctx || location.protocol === 'file:';
        if (!this.useFallback) { loadBuffer(src).catch(function () {}); }
    }

    Media.prototype.play = function () {
        var self = this;
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

    // Browsers only allow audio after a user gesture.
    function unlockAudio() {
        if (ctx && ctx.state === 'suspended') { ctx.resume(); }
    }

    /* ---------- 4. Scaling ---------- */

    var view = { scale: 1, offsetX: 0, offsetY: 0 };

    function fitBoard() {
        var body = document.body;
        if (!body) { return; }
        var w = window.innerWidth;
        var h = window.innerHeight;
        view.scale = Math.min(w / BOARD_W, h / BOARD_H);
        view.offsetX = Math.round((w - BOARD_W * view.scale) / 2);
        view.offsetY = Math.round((h - BOARD_H * view.scale) / 2);
        body.style.transformOrigin = '0 0';
        body.style.transform = 'translate(' + view.offsetX + 'px,' + view.offsetY + 'px) scale(' + view.scale + ')';
    }

    function toBoard(clientX, clientY) {
        return {
            x: (clientX - view.offsetX) / view.scale,
            y: (clientY - view.offsetY) / view.scale
        };
    }

    /* ---------- 3. Input ---------- */

    var active = {}; // pointerId -> { el, touch }

    function handlerElement(target) {
        for (var el = target; el && el !== document; el = el.parentNode) {
            if (el.getAttribute && (el.getAttribute('ontouchstart') || el.getAttribute('ontouchmove') || el.getAttribute('ontouchend'))) {
                return el;
            }
        }
        return null;
    }

    function makeTouch(e, el) {
        var p = toBoard(e.clientX, e.clientY);
        return { identifier: e.pointerId, target: el, pageX: p.x, pageY: p.y, clientX: p.x, clientY: p.y };
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

    function onPointerDown(e) {
        unlockAudio();
        if (e.pointerType === 'mouse' && e.button !== 0) { return; }
        e.preventDefault();
        var el = handlerElement(e.target);
        if (!el) { return; }
        var touch = makeTouch(e, el);
        active[e.pointerId] = { el: el, touch: touch };
        fire(el, 'touchstart', touch, touchesOn(el));
    }

    function onPointerMove(e) {
        var rec = active[e.pointerId];
        if (!rec) { return; }
        e.preventDefault();
        rec.touch = makeTouch(e, rec.el);
        var others = touchesOn(rec.el).filter(function (t) { return t !== rec.touch; });
        fire(rec.el, 'touchmove', rec.touch, [rec.touch].concat(others));
    }

    function onPointerUp(e) {
        var rec = active[e.pointerId];
        if (!rec) { return; }
        delete active[e.pointerId];
        rec.touch = makeTouch(e, rec.el);
        fire(rec.el, 'touchend', rec.touch, touchesOn(rec.el));
    }

    // Native touch events would reach the same inline handlers with unscaled
    // coordinates; swallow them so Pointer Events are the single input path.
    function swallowTouch(e) {
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

    window.CityBucksCompat = { view: view, fitBoard: fitBoard };
})();
