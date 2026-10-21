// Shared phone/video line-state resolution for home.html, home-v2.html and call.html.
//
// A line is only "open" when Firestore has told us so. If the read fails, or the
// snapshot is served from the local cache (which happens when the client is
// offline and can look like a missing document), the state is UNKNOWN and callers
// must treat the line as unavailable.
//
// Documented legacy default: if hotlineSettings/callLines has been successfully
// read from the server and does not exist (or a field is absent), that field is
// OPEN. This preserves the behaviour of a fresh deployment that has never used the
// producer toggle. Any non-boolean value is UNKNOWN rather than silently open.

export const LINE = Object.freeze({ OPEN: 'open', CLOSED: 'closed', UNKNOWN: 'unknown' });

export const UNKNOWN_LINES = Object.freeze({ phone: LINE.UNKNOWN, video: LINE.UNKNOWN });

function fieldState(value) {
  if (value === undefined) return LINE.OPEN;   // field never set -> legacy default
  if (value === true) return LINE.OPEN;
  if (value === false) return LINE.CLOSED;
  return LINE.UNKNOWN;                          // null, "false", 0, ... -> do not guess
}

export function resolveLineStates(snap) {
  if (!snap || typeof snap.data !== 'function') return UNKNOWN_LINES;
  if (snap.metadata && snap.metadata.fromCache) return UNKNOWN_LINES;
  const d = snap.data();
  if (d === undefined || d === null) return { phone: LINE.OPEN, video: LINE.OPEN };
  return { phone: fieldState(d.open), video: fieldState(d.videoOpen) };
}
