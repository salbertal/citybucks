/*
 * online.js — City Bucks 1v1 over the internet (free, peer to peer).
 *
 * Host/mirror model:
 *   HOST   runs the real game (bottom player). A MutationObserver turns every
 *          DOM change of the board into small ops sent to the guest; the
 *          guest's pointer input arrives in board coordinates and is injected
 *          through compat.js as the top player's touches.
 *   GUEST  does not run the game. It rebuilds the host's DOM from the ops
 *          (sanitized: whitelisted tags/attributes, never any code), sees the
 *          board rotated 180° so its own bar is at the bottom, and sends input.
 *
 * Transport: WebRTC data channel via PeerJS (vendor/peerjs.min.js); the free
 * public PeerJS server is only used so the two browsers can find each other.
 */
(function () {
    'use strict';

    var PREFIX = 'citybucks-v1-';
    var CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    var api = window.CityBucksCompat;
    var ui = null;

    /* ---------- UI ---------- */

    function h(tag, attrs, children) {
        var el = document.createElement(tag);
        for (var k in attrs || {}) {
            if (k === 'text') { el.textContent = attrs[k]; } else if (k === 'onclick') { el.addEventListener('click', attrs[k]); } else { el.setAttribute(k, attrs[k]); }
        }
        (children || []).forEach(function (c) { if (c) { el.appendChild(c); } });
        return el;
    }

    function panel(children, opts) {
        if (!ui) {
            ui = h('div', { 'data-cb-ui': '', 'class': 'cb-ui' });
            document.documentElement.appendChild(ui);
        }
        ui.innerHTML = '';
        ui.className = 'cb-ui' + (opts && opts.compact ? ' cb-compact' : '');
        ui.appendChild(h('div', { 'class': 'cb-card' }, children));
        ui.style.display = '';
    }

    function hidePanel() { if (ui) { ui.style.display = 'none'; } }

    var toastTimer = null;
    function toast(text, ms) {
        var t = document.querySelector('.cb-toast');
        if (!t) {
            t = h('div', { 'data-cb-ui': '', 'class': 'cb-toast' });
            document.documentElement.appendChild(t);
        }
        t.textContent = text;
        t.style.display = '';
        clearTimeout(toastTimer);
        if (ms) { toastTimer = setTimeout(function () { t.style.display = 'none'; }, ms); }
    }

    function status(text, ok) {
        var s = document.querySelector('.cb-status');
        if (!s) {
            s = h('div', { 'data-cb-ui': '', 'class': 'cb-status' });
            document.documentElement.appendChild(s);
        }
        s.textContent = text;
        s.className = 'cb-status ' + (ok ? 'cb-ok' : 'cb-bad') + (api.view.rotated ? ' cb-right' : '');
    }

    function title() { return h('div', { 'class': 'cb-title', text: 'City Bucks online' }); }

    function lobby() {
        var input = h('input', { 'class': 'cb-input', placeholder: 'CÓDIGO', maxlength: '5', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false' });
        var join = function () {
            var code = normalizeCode(input.value);
            if (code.length !== 5) { input.focus(); return; }
            location.hash = 'join=' + code;
            startGuest(code);
        };
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { join(); } });
        panel([
            title(),
            h('p', { text: 'Jugá 1 contra 1 con un amigo, cada uno en su compu.' }),
            h('button', { 'class': 'cb-btn cb-primary', text: 'Crear partida', onclick: startHost }),
            h('div', { 'class': 'cb-or', text: 'o unite con el código que te pasaron' }),
            h('div', { 'class': 'cb-row' }, [input, h('button', { 'class': 'cb-btn', text: 'Unirme', onclick: join })]),
            h('a', { 'class': 'cb-link', href: 'index.html', text: 'Jugar en esta pantalla (2 jugadores)' })
        ]);
    }

    function normalizeCode(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); }

    function newCode() {
        var s = '';
        var buf = new Uint32Array(5);
        crypto.getRandomValues(buf);
        for (var i = 0; i < 5; i++) { s += CODE_CHARS[buf[i] % CODE_CHARS.length]; }
        return s;
    }

    function peerErrorText(err) {
        switch (err && err.type) {
            case 'peer-unavailable': return 'No encontré esa partida. Revisá el código o pedile a tu amigo un link nuevo.';
            case 'network': case 'server-error': case 'socket-error': case 'socket-closed':
                return 'No me pude conectar al servidor de partidas. Revisá tu internet y probá de nuevo.';
            case 'browser-incompatible': return 'Este navegador no soporta juego online. Probá con Chrome, Safari, Firefox o Edge actualizados.';
            default: return 'Algo falló con la conexión (' + ((err && err.type) || 'error') + '). Probá de nuevo.';
        }
    }

    /* ---------- heartbeat ---------- */

    // WebRTC often never reports a peer that closed its tab, so both sides
    // send a beat every 2 s and treat 8 s of silence as a disconnect.
    var BEAT_MS = 2000;
    var TIMEOUT_MS = 8000;

    function heartbeat(conn, onDead) {
        var last = Date.now();
        conn.on('data', function () { last = Date.now(); });
        var timer = setInterval(function () {
            if (!conn.open) { stop(); return; }
            try { conn.send({ t: 'hb' }); } catch (e) {}
            if (Date.now() - last > TIMEOUT_MS) { stop(); try { conn.close(); } catch (e) {} onDead(); }
        }, BEAT_MS);
        function stop() { clearInterval(timer); }
        return { lastSeen: function () { return last; }, stop: stop };
    }

    /* ---------- HOST ---------- */

    var hostConn = null;
    var hostBeat = null;
    var everConnected = false;
    var ids = new WeakMap();
    var nextId = 1;
    var remotePointers = {};
    var lastStyle = new Map(); // id -> style without left/top

    function idOf(el) {
        if (el === document.body) { return 0; }
        var id = ids.get(el);
        if (!id) { id = nextId++; ids.set(el, id); }
        return id;
    }

    function serialize(node) {
        if (node.nodeType === 3) { return node.nodeValue; }
        if (node.nodeType !== 1) { return null; }
        var attrs = {};
        for (var i = 0; i < node.attributes.length; i++) {
            var a = node.attributes[i];
            if (!/^on/i.test(a.name)) { attrs[a.name] = a.value; }
        }
        var children = [];
        for (var c = node.firstChild; c; c = c.nextSibling) {
            var s = serialize(c);
            if (s !== null) { children.push(s); }
        }
        var id = idOf(node);
        lastStyle.set(id, stripPos(node.getAttribute('style')));
        return { i: id, n: node.tagName.toLowerCase(), a: attrs, c: children };
    }

    function stripPos(style) { return String(style || '').replace(/(^|;)\s*(left|top)\s*:[^;]*/g, ''); }

    function nextElementId(node) {
        var n = node.nextElementSibling;
        return n ? idOf(n) : null;
    }

    function ownerOf(el) {
        var code = el.getAttribute('ontouchstart') || '';
        var m = /g_drag\w+\(event,\s*(\d)/.exec(code);
        if (m) { return +m[1]; }
        var dlg = el.closest && el.closest('[id^="eventDialogPlayer"]');
        if (dlg) { return +dlg.id.replace('eventDialogPlayer', ''); }
        return null; // shared: pause, restart, info...
    }

    function snapshot() {
        var children = [];
        for (var c = document.body.firstElementChild; c; c = c.nextElementSibling) { children.push(serialize(c)); }
        return { t: 'snap', cls: document.body.className, c: children };
    }

    // PeerJS JSON channels reject messages over ~16 KB: split big ones.
    var CHUNK = 12000;
    var chunkSeq = 0;

    function send(msg) {
        if (!hostConn || !hostConn.open) { return; }
        try {
            var text = JSON.stringify(msg);
            if (text.length <= CHUNK) { hostConn.send(msg); return; }
            var seq = ++chunkSeq;
            var total = Math.ceil(text.length / CHUNK);
            for (var i = 0; i < total; i++) {
                hostConn.send({ t: 'chunk', k: seq, n: total, i: i, d: text.slice(i * CHUNK, (i + 1) * CHUNK) });
            }
        } catch (e) {
            console.warn('[online] send failed', e);
        }
    }

    function observe() {
        new MutationObserver(function (records) {
            if (!hostConn || !hostConn.open) { return; }
            var ops = [];
            var attrOps = new Map();
            var nested = new Set();
            records.forEach(function (r) {
                var t = r.target;
                if (r.type === 'childList') {
                    if (t === document.body) {
                        r.removedNodes.forEach(function (n) {
                            if (n.nodeType === 1 && ids.has(n)) { ops.push(['r', ids.get(n)]); }
                        });
                        r.addedNodes.forEach(function (n) {
                            if (n.nodeType === 1 && n.parentNode === document.body) { ops.push(['a', serialize(n), nextElementId(n)]); }
                        });
                    } else if (ids.has(t) && document.body.contains(t)) {
                        nested.add(t);
                    }
                } else if (r.type === 'characterData') {
                    var p = t.parentNode;
                    if (p && ids.has(p) && document.body.contains(p)) { nested.add(p); }
                } else if (r.type === 'attributes') {
                    if (/^on/i.test(r.attributeName)) { return; }
                    if (t === document.body && r.attributeName !== 'class') { return; }
                    if (t !== document.body && !(ids.has(t) && document.body.contains(t))) { return; }
                    attrOps.set(idOf(t) + '|' + r.attributeName, t);
                }
            });
            attrOps.forEach(function (el, key) {
                var id = idOf(el);
                var name = key.slice(key.indexOf('|') + 1);
                var value = el.getAttribute(name);
                if (name === 'style' && value !== null) {
                    var rest = stripPos(value);
                    if (lastStyle.get(id) === rest) {
                        ops.push(['p', id, el.style.left, el.style.top]);
                        return;
                    }
                    lastStyle.set(id, rest);
                }
                ops.push(['t', id, name, value]);
            });
            nested.forEach(function (el) {
                var kids = [];
                for (var c = el.firstChild; c; c = c.nextSibling) {
                    var s = serialize(c);
                    if (s !== null) { kids.push(s); }
                }
                ops.push(['h', idOf(el), kids]);
            });
            if (ops.length) { send({ t: 'm', o: ops }); }
        }).observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    }

    function loadGame(done) {
        var s = document.createElement('script');
        s.src = 'all-compressed.js';
        s.onload = function () {
            // The game boots from window.onload, which has already fired.
            if (typeof window.g_init === 'function') { window.g_init(); }
            api.fitBoard();
            done();
        };
        document.head.appendChild(s);
    }

    function releaseRemotePointers() {
        Object.keys(remotePointers).forEach(function (id) {
            var p = remotePointers[id];
            api.injectPointer('up', id, p.x, p.y);
        });
        remotePointers = {};
    }

    function startHost() {
        var code = newCode();
        panel([title(), h('p', { text: 'Creando partida…' })]);
        var peer = new Peer(PREFIX + code, { debug: 1 });

        peer.on('error', function (err) {
            if (err.type === 'unavailable-id') { peer.destroy(); startHost(); return; }
            if (!hostConn) { panel([title(), h('p', { text: peerErrorText(err) }), h('button', { 'class': 'cb-btn', text: 'Volver', onclick: function () { location.reload(); } })]); }
            else { toast(peerErrorText(err), 6000); }
        });

        peer.on('open', function () {
            api.canUse = function (el, source) {
                var owner = ownerOf(el);
                if (owner === null) { return true; }
                return source === 'remote' ? owner === 0 : owner === 1;
            };
            loadGame(function () {
                observe();
                showInvite(code);
                status('Esperando a tu amigo · código ' + code, false);
            });
        });

        peer.on('disconnected', function () { if (!peer.destroyed) { peer.reconnect(); } });

        peer.on('connection', function (conn) {
            if (hostConn && hostConn.open && hostBeat && Date.now() - hostBeat.lastSeen() < 5000) {
                conn.on('open', function () { conn.send({ t: 'busy' }); setTimeout(function () { conn.close(); }, 500); });
                return;
            }
            conn.on('open', function () {
                if (hostConn && hostConn !== conn) { dropGuest(hostConn); }
                hostConn = conn;
                hostBeat = heartbeat(conn, function () { dropGuest(conn); });
                hidePanel();
                status('Online · tu amigo está conectado', true);
                if (!everConnected) {
                    // First time: both start a fresh game together.
                    everConnected = true;
                    toast('¡Tu amigo se conectó! Vos sos el de ABAJO. Arranca una partida nueva.', 4000);
                    window.g_reInit();
                    setTimeout(function () { send(snapshot()); }, 150);
                } else {
                    // Reconnection: keep the game going where it was.
                    toast('Tu amigo volvió. La partida sigue.', 4000);
                    send(snapshot());
                }
            });
            conn.on('data', function (msg) {
                if (!msg || msg.t !== 'in') { return; }
                var type = msg.k, x = +msg.x, y = +msg.y, id = String(msg.id).slice(0, 12);
                if ((type !== 'down' && type !== 'move' && type !== 'up') || !isFinite(x) || !isFinite(y)) { return; }
                if (type === 'up') { delete remotePointers[id]; } else { remotePointers[id] = { x: x, y: y }; }
                api.injectPointer(type, id, x, y);
            });
            conn.on('close', function () { dropGuest(conn); });
        });

        function dropGuest(conn) {
            if (hostConn !== conn) { return; }
            if (hostBeat) { hostBeat.stop(); hostBeat = null; }
            hostConn = null;
            try { conn.close(); } catch (e) {}
            releaseRemotePointers();
            status('Tu amigo se desconectó · código ' + code, false);
            toast('Tu amigo se desconectó. Puede volver a entrar con el mismo link.', 6000);
        }

        api.onSound = function (src) { send({ t: 's', src: src }); };

        document.addEventListener('visibilitychange', function () {
            if (!document.hidden && hostConn) {
                toast('Ojo: si minimizás o tapás esta pestaña, el juego se frena para los dos.', 5000);
            }
        });
    }

    function showInvite(code) {
        var link = location.origin + location.pathname + '#join=' + code;
        var copyBtn = h('button', { 'class': 'cb-btn cb-primary', text: 'Copiar link' });
        copyBtn.addEventListener('click', function () {
            var done = function () { copyBtn.textContent = '¡Copiado!'; setTimeout(function () { copyBtn.textContent = 'Copiar link'; }, 2000); };
            if (navigator.clipboard) { navigator.clipboard.writeText(link).then(done, function () { prompt('Copiá este link:', link); }); }
            else { prompt('Copiá este link:', link); }
        });
        panel([
            title(),
            h('p', { text: 'Mandale este link a tu amigo:' }),
            h('div', { 'class': 'cb-code', text: code }),
            h('input', { 'class': 'cb-input cb-linkbox', value: link, readonly: '' }),
            copyBtn,
            h('p', { 'class': 'cb-small', text: 'Cuando entre, arranca una partida nueva. Vos jugás con la barra de ABAJO.' }),
            h('button', { 'class': 'cb-btn', text: 'Ocultar', onclick: hidePanel })
        ], { compact: true });
    }

    /* ---------- GUEST ---------- */

    var TAGS = { div: 1, span: 1, p: 1, a: 1, strong: 1, b: 1, i: 1, em: 1, br: 1, ul: 1, li: 1 };
    var ATTRS = { 'class': 1, id: 1, style: 1, href: 1, title: 1 };
    var nodes = new Map(); // id -> element

    function build(s) {
        if (typeof s === 'string') { return document.createTextNode(s); }
        if (!s || typeof s !== 'object') { return null; }
        var el = document.createElement(TAGS[s.n] ? s.n : 'div');
        var attrs = s.a || {};
        for (var k in attrs) { setAttr(el, k, attrs[k]); }
        (s.c || []).forEach(function (c) { var n = build(c); if (n) { el.appendChild(n); } });
        if (typeof s.i === 'number') { nodes.set(s.i, el); }
        return el;
    }

    function setAttr(el, name, value) {
        name = String(name).toLowerCase();
        if (!ATTRS[name]) { return; }
        if (value === null || value === undefined) { el.removeAttribute(name); return; }
        value = String(value);
        if (name === 'href') {
            if (!/^(https?:|mailto:)/i.test(value)) { return; }
            el.setAttribute('target', '_blank');
            el.setAttribute('rel', 'noopener noreferrer');
        }
        if (name === 'style' && /expression|javascript:/i.test(value)) { return; }
        el.setAttribute(name, value);
    }

    function forget(el) {
        // Drop ids of a removed subtree (keeps the map from growing forever).
        nodes.forEach(function (n, id) { if (n === el || el.contains(n)) { nodes.delete(id); } });
    }

    function applyOps(ops) {
        for (var i = 0; i < ops.length; i++) {
            var op = ops[i];
            var el;
            switch (op[0]) {
                case 'a':
                    el = build(op[1]);
                    var before = op[2] !== null ? nodes.get(op[2]) : null;
                    if (el) { document.body.insertBefore(el, before && before.parentNode === document.body ? before : null); }
                    break;
                case 'r':
                    el = nodes.get(op[1]);
                    if (el && el.parentNode) { el.parentNode.removeChild(el); }
                    if (el && el.querySelector('*')) { forget(el); } else { nodes.delete(op[1]); }
                    break;
                case 'p':
                    el = nodes.get(op[1]);
                    if (el) { el.style.left = op[2]; el.style.top = op[3]; }
                    break;
                case 't':
                    if (op[1] === 0) { if (op[2] === 'class') { document.body.className = String(op[3] || ''); } break; }
                    el = nodes.get(op[1]);
                    if (el) { setAttr(el, op[2], op[3]); }
                    break;
                case 'h':
                    el = nodes.get(op[1]);
                    if (el) {
                        while (el.firstChild) { el.removeChild(el.firstChild); }
                        (op[2] || []).forEach(function (c) { var n = build(c); if (n) { el.appendChild(n); } });
                    }
                    break;
            }
        }
    }

    function applySnapshot(snap) {
        nodes.clear();
        while (document.body.firstChild) { document.body.removeChild(document.body.firstChild); }
        document.body.className = String(snap.cls || '');
        (snap.c || []).forEach(function (s) { var el = build(s); if (el) { document.body.appendChild(el); } });
        api.fitBoard();
    }

    function startGuest(code) {
        api.setRotated(true);
        panel([title(), h('p', { text: 'Conectando con la partida ' + code + '…' })]);
        var peer = new Peer({ debug: 1 });
        var conn = null;
        var pendingMoves = {};
        var flushScheduled = false;

        function flushMoves() {
            flushScheduled = false;
            if (!conn || !conn.open) { pendingMoves = {}; return; }
            for (var id in pendingMoves) { conn.send(pendingMoves[id]); }
            pendingMoves = {};
        }

        api.setInputSink(function (type, id, x, y) {
            if (!conn || !conn.open) { return; }
            var msg = { t: 'in', k: type, id: String(id), x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
            if (type === 'move') {
                pendingMoves[msg.id] = msg;
                if (!flushScheduled) { flushScheduled = true; requestAnimationFrame(flushMoves); }
                return;
            }
            flushMoves();
            conn.send(msg);
        });

        peer.on('error', function (err) {
            panel([title(), h('p', { text: peerErrorText(err) }),
                h('button', { 'class': 'cb-btn cb-primary', text: 'Reintentar', onclick: function () { location.reload(); } }),
                h('a', { 'class': 'cb-link', href: 'online.html', text: 'Volver al inicio' })]);
        });

        peer.on('open', function () {
            conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
            conn.on('open', function () {
                heartbeat(conn, lost);
                hidePanel();
                status('Online · partida ' + code, true);
                toast('¡Conectado! Vos sos el de ABAJO (en tu pantalla).', 4000);
            });
            var chunks = null;
            conn.on('data', function handle(msg) {
                if (!msg) { return; }
                if (msg.t === 'chunk') {
                    if (!chunks || chunks.k !== msg.k) { chunks = { k: msg.k, n: msg.n, parts: [], got: 0 }; }
                    if (chunks.parts[msg.i] === undefined) { chunks.parts[msg.i] = String(msg.d); chunks.got++; }
                    if (chunks.got === chunks.n) {
                        var whole = chunks.parts.join('');
                        chunks = null;
                        try { handle(JSON.parse(whole)); } catch (e) { console.warn('[online] bad chunked message', e); }
                    }
                    return;
                }
                if (msg.t === 'snap') { applySnapshot(msg); }
                else if (msg.t === 'm' && Array.isArray(msg.o)) { applyOps(msg.o); }
                else if (msg.t === 's' && /^sound\/[a-z0-9-]+\.mp3$/.test(String(msg.src))) { new Media(msg.src).play(); }
                else if (msg.t === 'busy') { panel([title(), h('p', { text: 'Esa partida ya tiene dos jugadores.' }), h('a', { 'class': 'cb-link', href: 'online.html', text: 'Volver al inicio' })]); }
            });
            var lostShown = false;
            function lost() {
                if (lostShown) { return; }
                lostShown = true;
                status('Desconectado', false);
                panel([title(), h('p', { text: 'Se cortó la conexión con tu amigo.' }),
                    h('button', { 'class': 'cb-btn cb-primary', text: 'Reconectar', onclick: function () { location.reload(); } }),
                    h('a', { 'class': 'cb-link', href: 'online.html', text: 'Volver al inicio' })]);
            }
            conn.on('close', lost);
        });
    }

    /* ---------- boot ---------- */

    document.addEventListener('DOMContentLoaded', function () {
        if (typeof Peer === 'undefined') {
            panel([title(), h('p', { text: 'No se pudo cargar el módulo online.' })]);
            return;
        }
        var m = /join=([A-Za-z0-9]{5})/.exec(location.hash);
        if (m) { startGuest(normalizeCode(m[1])); } else { lobby(); }
    });
})();
