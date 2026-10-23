# Experimental multi-line OBS audio relay bridge

## Scope

`lib/multi-line-overlay-relay-bridge.js` is a safety-focused adapter between
the experimental multi-line controller's single program-audio bus and a host's
per-call OBS overlay relay peer connections.

- It forwards the router's program output track, not a caller's raw audio track
  or the producer microphone.
- It targets only the relay record whose `callId` matches
  `audioRouter.programCallId`.
- It clears non-selected relay audio before opening the selected relay.
- A failed selected-route replacement triggers best-effort silence of all relays.
- `silence()` explicitly clears all supplied relay audio senders.

## Integration boundary

This is a tested helper, not a production dashboard integration. The legacy
dashboard currently creates OBS overlay sessions from singleton active-call
globals and owns Firestore candidate signaling/peer cleanup in
`dashboard.html`. The helper is not wired to those peers by this change.
**Keep Take On Air disabled** until the host integrates relay lifecycle and
signaling, ensures relay records are keyed to the right call IDs, and verifies
fail-closed behavior in a real browser with OBS.

The current experimental controller supports audio-only calls. This bridge
does not implement caller video forwarding, camera negotiation, or hold music.

## Tests

The accompanying Node tests use mock peer connections. They do not validate
Firestore rules, real WebRTC negotiation, TURN connectivity, or OBS ingestion.
