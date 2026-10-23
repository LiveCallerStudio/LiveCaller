# Producer WebRTC call-session adapter

This change adds `ProducerCallSession`, a framework-independent owner for one producer-side WebRTC call. It provides a dedicated peer connection, sender map, remote stream, ICE candidate buffering until the remote description is set, SDP answer transformation, and isolated cleanup.

The adapter does not connect tracks to the dashboard monitor, program output, or OBS. Those audio routes must be explicitly supplied by the dashboard. It is not yet wired into `dashboard.html`; the current dashboard still uses singleton active-call state. Do not treat this adapter as completion of multi-line calling.

## Tests

`tests/producer-call-session.test.mjs` checks:
- separate peer connections and remote streams for different call IDs
- buffering early ICE candidates until the offer is accepted
- SDP answer transformation and local sender replacement
- local and remote track isolation
- closing one session without closing another

CI runs this test. Full integration still requires per-line Firestore subscriptions, microphone ownership, hold audio, monitor/program routing, UI controls, and mobile cross-network acceptance tests.
