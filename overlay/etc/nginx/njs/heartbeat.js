/**
 * heartbeat.js — ports overlay/scripts/heartbeat.sh into a js_periodic task.
 *
 * The legacy script was:
 *     while true; do sleep "$BEAT_TIME"; curl http://127.0.0.1/lancache-heartbeat; done
 * That's now a single `ngx.fetch` from inside nginx worker 0 every BEAT_TIME.
 * No subprocess, no shell, no PID to supervise.
 *
 * Scheduling: `js_periodic lancache.heartbeat interval=BEAT_TIME;` is set in
 * `sites-available/50_njs_periodics.conf` (the BEAT_TIME token is substituted
 * at entrypoint time, same as every other lancache template).
 */

/** Loopback URL — same endpoint the legacy script hit and the Docker HEALTHCHECK probes. */
var HEARTBEAT_URL = 'http://127.0.0.1/lancache-heartbeat';

/**
 * js_periodic callback. The session arg `s` is the periodic-session object
 * (njs `PeriodicSession`); we only need it for logging. ngx.fetch returns a
 * promise — we resolve it to keep failures local (the periodic scheduler
 * silently swallows unhandled rejections, but logging is friendlier).
 *
 * @param {Object} s  njs PeriodicSession
 * @returns {Promise<void>}
 */
async function heartbeat(s) {
    try {
        var reply = await ngx.fetch(HEARTBEAT_URL, {
            method: 'GET',
            // Match the legacy curl: don't follow redirects, ignore body.
            max_response_body_size: 1,
        });
        // 204 No Content is the expected response (see 90_lancache_heartbeat.conf).
        if (reply.status >= 400) {
            s.warn('lancache.heartbeat: HTTP ' + reply.status + ' from ' + HEARTBEAT_URL);
        }
    } catch (e) {
        // Mirrors the legacy `|| true` — heartbeat must never crash the worker.
        s.warn('lancache.heartbeat: fetch failed: ' + (e && e.message ? e.message : e));
    }
}

export default { heartbeat };
