/**
 * noslice.js — the noslice detector, ported from overlay/scripts/noslice-detector.sh
 * into nginx's native njs runtime.
 *
 * Replaces:
 *   - `tail -F | while read | grep | jq` shell loop  → `js_periodic` + `fs.readSync`
 *   - JSON state file + flock contention             → atomic `dict.incr()` calls
 *   - Generated `noslice-hosts.map` + `nginx -s reload`
 *                                                    → `js_set $noslice_host`
 *
 * Contract — every name below is load-bearing:
 *   - Shared dict zone: `lancache` (type=number, state=/data/noslice.dict)
 *   - Keys: `nsfail:<host>` `nslast:<host>` `nsblock:<host>` `__ns_offset` `__ns_decay`
 *   - Exported: nosliceHost, nosliceStatus, nosliceReset, nosliceHeaderFilter,
 *               scanErrorLog, decayCounts
 *   - Endpoints: GET /lancache-internal/noslice, POST /lancache-internal/noslice/reset
 *
 * Verified primitives (nginx:alpine 1.31.0):
 *   `fs.openSync`, `fs.readSync(fd, buf, off, len, pos)`, `fs.closeSync`,
 *   `Buffer.alloc`, `ngx.shared.<zone>.get/set/incr/delete/keys`.
 */

import fs from 'fs';

/**
 * @typedef {Object} DictRecord
 * @property {string}  host
 * @property {number}  count
 * @property {number}  lastError
 * @property {boolean} blocked
 */

/**
 * @typedef {Object} NosliceStatusJson
 * @property {boolean}                     enabled
 * @property {('log'|'response'|'both'|'off')} mode
 * @property {string[]}                    blockedHosts
 * @property {Object<string, DictRecord>}  state
 */

// ── tunables resolved from env (env reads happen in nginx, see entrypoint) ───
// We read them on first use and cache, because `process.env` lookups in njs
// happen at the JS side and are inexpensive but should still be hoisted.
var _env = null;
function env() {
    if (_env !== null) return _env;
    var pe = (typeof process !== 'undefined' && process.env) ? process.env : {};
    _env = {
        FALLBACK:      (pe.NOSLICE_FALLBACK || 'false').toLowerCase() === 'true',
        THRESHOLD:     parseInt(pe.NOSLICE_THRESHOLD || '3', 10) || 3,
        DECAY:         parseInt(pe.DECAY_INTERVAL    || '86400', 10) || 86400,
        MODE:          (pe.NOSLICE_DETECT_MODE || 'log').toLowerCase(),
        ERROR_LOG:     pe.NOSLICE_ERROR_LOG || '/data/logs/error.log',
        STATIC_HOSTS:  pe.NOSLICE_STATIC_HOSTS || '',
        // Cap the per-tick read so a multi-GB log catch-up after a long
        // restart can't OOM the worker. 256 KiB is plenty for ~10s of errors
        // on the busiest LAN cache.
        READ_CHUNK:    256 * 1024,
    };
    return _env;
}

// ── shared dict accessors (all writes go through these) ──────────────────────
var ZONE = 'lancache';
function dict() { return ngx.shared[ZONE]; }

/** @param {string} host */ function keyFail(host)  { return 'nsfail:'  + host; }
/** @param {string} host */ function keyLast(host)  { return 'nslast:'  + host; }
/** @param {string} host */ function keyBlock(host) { return 'nsblock:' + host; }

var KEY_OFFSET = '__ns_offset';
var KEY_DECAY  = '__ns_decay';

/** @param {string} k @returns {number} */
function getNum(k) { var v = dict().get(k); return (typeof v === 'number') ? v : 0; }

/** @returns {number} seconds */ function now() { return Math.floor(Date.now() / 1000); }

// ── js_set $noslice_host ─────────────────────────────────────────────────────
/**
 * Returns "1" iff the request's Host header is on the noslice blocklist.
 * Called for EVERY request that references `$noslice_host` (only in
 * `05_noslice_routing.conf` when `NOSLICE_FALLBACK=true` is enabled).
 *
 * Returning "0" when fallback is disabled keeps the var safe everywhere.
 *
 * @param {Object} r  ngx HTTP request
 * @returns {string} "1" or "0"
 */
function nosliceHost(r) {
    if (!env().FALLBACK) return '0';
    var host = r.headersIn['Host'];
    if (!host) return '0';
    // Strip ":port" — nginx routes by host header, but Host can include a port.
    var colon = host.indexOf(':');
    if (colon !== -1) host = host.substring(0, colon);
    var blocked = dict().get(keyBlock(host));
    return blocked ? '1' : '0';
}

// ── Design A — incremental error-log scan ────────────────────────────────────
/**
 * `js_periodic` on worker 0. Reads ONLY the bytes added to `error.log` since
 * the last tick by opening the file, seeking to `__ns_offset`, reading up to
 * READ_CHUNK bytes, then advancing the offset.
 *
 * If the file is shorter than the saved offset, the log rotated → reset to 0.
 * If we can't open the log yet (boot race), bail silently and try next tick.
 *
 * @param {Object} s  njs PeriodicSession
 */
function scanErrorLog(s) {
    var E = env();
    // When the operator hasn't enabled noslice, do no work at all — the periodic
    // still fires (it's wired in nginx) but is a no-op.
    if (!E.FALLBACK) return;
    if (E.MODE !== 'log' && E.MODE !== 'both') return;

    // Seed static hosts on the FIRST scan after boot. We piggy-back on
    // `__ns_decay` being unset (==0) — first call ever bumps it.
    if (getNum(KEY_DECAY) === 0) {
        seedStaticHosts(s);
        dict().set(KEY_DECAY, now());
    }

    var path = E.ERROR_LOG;
    var fd;
    try {
        fd = fs.openSync(path, 'r');
    } catch (e) {
        // Log not present yet (early boot, fresh container). Try next tick.
        return;
    }

    try {
        var stat;
        try {
            stat = fs.statSync(path);
        } catch (e) {
            return;
        }
        var size = stat.size;
        var offset = getNum(KEY_OFFSET);

        // Rotation detection: file shrank → start fresh at 0.
        if (size < offset) {
            offset = 0;
        }
        if (size === offset) {
            return; // nothing new
        }

        // Read in fixed-size chunks until we've consumed everything new, but
        // never read more than READ_CHUNK at a time (memory + tick fairness).
        var totalNew = size - offset;
        var toRead = (totalNew > E.READ_CHUNK) ? E.READ_CHUNK : totalNew;
        var buf = Buffer.alloc(toRead);
        var n = fs.readSync(fd, buf, 0, toRead, offset);
        if (n <= 0) return;

        // Advance offset by what we actually read (may be < toRead on EOF).
        var newOffset = offset + n;
        dict().set(KEY_OFFSET, newOffset);

        processChunk(s, buf.toString('utf8', 0, n));
    } finally {
        try { fs.closeSync(fd); } catch (e) { /* fd close is best-effort */ }
    }
}

/**
 * Parse a chunk of error-log text for slice failure lines and bump counters.
 *
 * The legacy detector matched these phrases (line 138):
 *   "invalid range in slice response"
 *   "unexpected range in slice response"
 *   "unexpected status code .* in slice response"
 *
 * And extracted the host with this regex (line 141):
 *   host:[[:space:]]*"([^"]+)"
 *
 * We mirror both exactly so the noslice behaviour stays identical line-for-line.
 *
 * @param {Object} s    njs PeriodicSession
 * @param {string} text raw bytes decoded as utf-8
 */
var SLICE_ERR_RE = /(invalid range in slice response|unexpected range in slice response|unexpected status code [^ ]+ in slice response)/;
var HOST_RE      = /host:\s*"([^"]+)"/;

function processChunk(s, text) {
    var E = env();
    // Split on LF — error.log writes one line per error, never folded.
    var lines = text.split('\n');
    // The last fragment may be a partial line. Drop it; we'll re-read it next
    // tick because the offset only advanced by `n` and the file kept growing.
    // (If our chunk ended exactly on a newline the last entry is '', which is
    // fine.) The slight imprecision — re-scanning a fragment — is acceptable
    // because the regex won't match a fragment without "host: ..." in it.
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (!SLICE_ERR_RE.test(line)) continue;
        var m = HOST_RE.exec(line);
        if (!m) continue;
        var host = m[1];
        if (!host) continue;
        bumpHost(s, host);
    }
}

/**
 * Increment the failure count for `host`, update lastError, and (when over
 * threshold) flip the block flag. All writes are atomic shared-dict ops.
 *
 * @param {Object} s     njs PeriodicSession
 * @param {string} host  upstream host name
 */
function bumpHost(s, host) {
    var E = env();
    var d = dict();
    // dict.incr() is the atomic primitive — start from 0 if absent.
    var count = d.incr(keyFail(host), 1, 0);
    d.set(keyLast(host), now());
    if (count >= E.THRESHOLD) {
        var was = d.get(keyBlock(host));
        d.set(keyBlock(host), 1);
        if (!was) {
            ngx.log(ngx.INFO, 'lancache.noslice: blocklisted ' + host +
                  ' (count=' + count + ' threshold=' + E.THRESHOLD + ')');
        }
    }
}

// ── decay — drop counts for hosts that haven't erred in DECAY_INTERVAL ───────
/**
 * `js_periodic` on worker 0. Hourly sweep that decrements `nsfail:` by 1 for
 * any host whose `nslast:` is older than DECAY_INTERVAL. When a count reaches
 * 0 we clear the block flag and the lastError key.
 *
 * @param {Object} s  njs PeriodicSession
 */
function decayCounts(s) {
    var E = env();
    if (!E.FALLBACK) return;
    var d = dict();
    var cutoff = now() - E.DECAY;

    // njs shared-dict exposes `.keys(limit)` (returns array). We iterate the
    // `nslast:` keys because that's the smallest set; for each, derive the host.
    var keys;
    try {
        keys = d.keys(1024);
    } catch (e) {
        return;
    }
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (k.substring(0, 7) !== 'nslast:') continue;
        var host = k.substring(7);
        var last = getNum(k);
        if (last === 0 || last > cutoff) continue;
        // The host has been quiet long enough — decay one off the count.
        var newCount;
        try {
            newCount = d.incr(keyFail(host), -1, 0);
        } catch (e) {
            continue;
        }
        if (newCount <= 0) {
            // Fully recovered — clear all three keys.
            d.delete(keyFail(host));
            d.delete(keyLast(host));
            if (d.get(keyBlock(host))) {
                d.delete(keyBlock(host));
                ngx.log(ngx.INFO, 'lancache.noslice: cleared ' + host + ' (decayed)');
            }
        } else {
            // Reset lastError so the next decay window restarts.
            d.set(keyLast(host), now());
        }
    }
    dict().set(KEY_DECAY, now());
}

// ── Design B scaffold — js_header_filter ─────────────────────────────────────
/**
 * Inspect upstream response status on the way through. Counts as a slice
 * failure when the request actually carried a `Range` header (i.e. nginx's
 * slice module asked for a slice) AND the upstream answered with non-206.
 *
 * Gated by `NOSLICE_DETECT_MODE` ∈ {response, both}. Default mode is `log`,
 * so this is a no-op out of the box; opt in once the response-time path has
 * been exercised in your environment.
 *
 * Synchronous per njs 0.5.1+ — just calls `dict.incr()`.
 *
 * @param {Object} r  ngx HTTP request
 */
function nosliceHeaderFilter(r) {
    var E = env();
    if (!E.FALLBACK) return;
    if (E.MODE !== 'response' && E.MODE !== 'both') return;

    // Only count requests that actually drove the slice module — those carry
    // a Range header derived from `$slice_range`.
    var rng = r.headersIn['Range'];
    if (!rng) return;

    var status = r.variables['upstream_status'];
    if (!status) return;
    // `$upstream_status` is a comma/colon list when there were retries; the
    // FIRST status is the upstream's actual answer. We split on non-digits.
    var primary = parseInt(status, 10);
    if (!primary) return;

    // A sliced request expects 206 Partial Content. Anything else = the CDN
    // ignored the range → log filter would emit "invalid range in slice
    // response" on the failure path. Count it once, here, with zero log I/O.
    if (primary === 206) return;

    var host = r.headersIn['Host'] || '';
    var colon = host.indexOf(':');
    if (colon !== -1) host = host.substring(0, colon);
    if (!host) return;

    var d = dict();
    var count = d.incr(keyFail(host), 1, 0);
    d.set(keyLast(host), now());
    if (count >= E.THRESHOLD && !d.get(keyBlock(host))) {
        d.set(keyBlock(host), 1);
        r.log('lancache.noslice: blocklisted ' + host +
              ' via header filter (status=' + primary + ')');
    }
}

// ── static hosts seed (NOSLICE_STATIC_HOSTS + Epic) ──────────────────────────
/**
 * Seed any always-on hosts from `NOSLICE_STATIC_HOSTS` (comma-/space-separated)
 * into the dict at boot. The entrypoint seeds Epic CDN hosts here when
 * `EPIC_FORCE_NOSLICE=true`. Hosts seeded this way bypass the threshold
 * entirely — `nsblock:<host>=1` is set immediately.
 *
 * @param {Object} s  njs PeriodicSession
 */
function seedStaticHosts(s) {
    var raw = env().STATIC_HOSTS || '';
    if (!raw) return;
    var d = dict();
    var parts = raw.split(/[\s,]+/);
    var seeded = 0;
    for (var i = 0; i < parts.length; i++) {
        var h = parts[i].trim().toLowerCase();
        if (!h) continue;
        // Mark blocked, leave count at 0 so decay won't touch it (last==0).
        d.set(keyBlock(h), 1);
        seeded++;
    }
    if (seeded) ngx.log(ngx.INFO, 'lancache.noslice: seeded ' + seeded + ' static host(s)');
}

// ── js_content GET /lancache-internal/noslice ────────────────────────────────
/**
 * Returns the §4 JSON shape exactly. Iterates the shared dict once,
 * grouping `nsfail:` / `nslast:` / `nsblock:` keys per host.
 *
 * @param {Object} r  ngx HTTP request
 */
function nosliceStatus(r) {
    var E = env();
    /** @type {Object<string, DictRecord>} */
    var state = {};
    var blocked = [];
    var d = dict();
    var keys;
    try {
        keys = d.keys(4096);
    } catch (e) {
        keys = [];
    }
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var sep = k.indexOf(':');
        if (sep < 0) continue;
        var prefix = k.substring(0, sep + 1);
        if (prefix !== 'nsfail:' && prefix !== 'nslast:' && prefix !== 'nsblock:') continue;
        var host = k.substring(sep + 1);
        if (!host) continue;
        var rec = state[host];
        if (!rec) {
            rec = state[host] = { host: host, count: 0, lastError: 0, blocked: false };
        }
        var v = d.get(k);
        if (typeof v !== 'number') v = 0;
        if (prefix === 'nsfail:')  rec.count     = v;
        if (prefix === 'nslast:')  rec.lastError = v;
        if (prefix === 'nsblock:') rec.blocked   = !!v;
    }
    for (var h in state) {
        if (state[h].blocked) blocked.push(h);
    }
    blocked.sort();

    /** @type {NosliceStatusJson} */
    var body = {
        enabled: !!E.FALLBACK,
        mode: E.FALLBACK ? E.MODE : 'off',
        blockedHosts: blocked,
        state: state,
    };
    r.headersOut['Content-Type'] = 'application/json';
    r.headersOut['Cache-Control'] = 'no-store';
    r.return(200, JSON.stringify(body));
}

// ── js_content POST /lancache-internal/noslice/reset ─────────────────────────
/**
 * Clears every `nsfail:` / `nslast:` / `nsblock:` key and resets the
 * incremental log offset so the next scan starts from the current end of file.
 * The js_shared_dict_zone `state=` file is updated automatically.
 *
 * @param {Object} r  ngx HTTP request
 */
function nosliceReset(r) {
    if (r.method !== 'POST') {
        r.headersOut['Allow'] = 'POST';
        r.return(405, '{"error":"method not allowed"}');
        return;
    }
    var d = dict();
    var keys;
    try {
        keys = d.keys(4096);
    } catch (e) {
        keys = [];
    }
    var cleared = 0;
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (k.substring(0, 7) === 'nsfail:' ||
            k.substring(0, 7) === 'nslast:' ||
            k.substring(0, 8) === 'nsblock:') {
            d.delete(k);
            cleared++;
        }
    }
    // Re-anchor to end-of-file so we don't replay old errors after a reset.
    var path = env().ERROR_LOG;
    try {
        var stat = fs.statSync(path);
        d.set(KEY_OFFSET, stat.size);
    } catch (e) {
        d.set(KEY_OFFSET, 0);
    }
    d.set(KEY_DECAY, now());

    r.headersOut['Content-Type'] = 'application/json';
    r.headersOut['Cache-Control'] = 'no-store';
    r.return(200, JSON.stringify({ ok: true, cleared: cleared }));
}

export default {
    nosliceHost: nosliceHost,
    nosliceStatus: nosliceStatus,
    nosliceReset: nosliceReset,
    nosliceHeaderFilter: nosliceHeaderFilter,
    scanErrorLog: scanErrorLog,
    decayCounts: decayCounts,
};
