const ACTIVE_OVERLAY_CALL_STATUSES = new Set(['live', 'answered', 'on-air', 'on-hold']);

/**
 * Parent call statuses that keep an OBS WebRTC overlay session alive.
 * The audio router, not this signaling lifecycle, decides when program audio
 * is actually sent. In particular, an on-hold call keeps its peer connection
 * while its program route remains silent.
 */
export function isActiveOverlayCallStatus(status) {
  return ACTIVE_OVERLAY_CALL_STATUSES.has(String(status || '').toLowerCase());
}
