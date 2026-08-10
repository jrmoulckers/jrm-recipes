/**
 * Connectivity status helper (#141).
 *
 * The connectivity microcopy that used to live here now lives in the
 * `pwa.connectivity` namespace of the message catalogs, so it is translated
 * along with everything else and has a single source of truth. Only the runtime
 * check remains.
 */

/** True when the browser reports it is offline (safe during SSR). */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}
