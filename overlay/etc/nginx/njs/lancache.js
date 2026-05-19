/**
 * lancache.js — entry module for the njs runtime.
 *
 * Wired in `conf.d/05_njs.conf` as:
 *     js_import lancache from lancache.js;
 *
 * Every function exposed to nginx (`js_set`, `js_content`, `js_header_filter`,
 * `js_periodic`) must be a property of the default export of THIS file. We
 * keep `lancache.js` thin: it just re-exports the named functions implemented
 * in `noslice.js` and `heartbeat.js`. Names match the wired conf.d directives
 * exactly — do not rename without updating every conf.d/sites-available file.
 *
 * @typedef {Object} DictRecord
 *   In-memory view of one host's state, reconstructed from the shared dict.
 * @property {string}  host        the upstream Host header
 * @property {number}  count       current `nsfail:<host>` value
 * @property {number}  lastError   epoch seconds, from `nslast:<host>`
 * @property {boolean} blocked     `nsblock:<host>` non-zero
 *
 * @typedef {Object} NosliceStatusJson
 *   Exact wire shape consumed by the Go admin backend (do NOT drift).
 * @property {boolean}                     enabled
 * @property {('log'|'response'|'both'|'off')} mode
 * @property {string[]}                    blockedHosts
 * @property {Object<string, DictRecord>}  state
 */

import noslice   from 'noslice.js';
import heartbeat from 'heartbeat.js';

/**
 * Single default export. Every name here is referenced from an nginx directive
 * — the contract is enforced by the conf.d wiring and the test suite.
 */
export default {
    // js_set $noslice_host
    nosliceHost:         noslice.nosliceHost,
    // js_content (internal :8080 endpoints)
    nosliceStatus:       noslice.nosliceStatus,
    nosliceReset:        noslice.nosliceReset,
    // js_header_filter (Design B scaffold)
    nosliceHeaderFilter: noslice.nosliceHeaderFilter,
    // js_periodic (worker 0 only)
    scanErrorLog:        noslice.scanErrorLog,
    decayCounts:         noslice.decayCounts,
    heartbeat:           heartbeat.heartbeat,
};
