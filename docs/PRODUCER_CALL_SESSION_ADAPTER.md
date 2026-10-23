# Producer WebRTC call-session adapter

This change adds `ProducerCallSession`, a framework-independent owner for one producer-side WebRTC call. It provides a dedicated peer connection, sender map, remote stream, ICE candidate buffering until the remote description is set, SDP answer transformation, and isolated cleanup.

The adapter does not connect tracks to the dashboard monitor, program output, or OBS. Those audio routes must be explicitly supplied by the dashboard. It is not yet wired into `dashboard.html`; the current dashboard still uses singleton active-call state. Do not treat this adapter as completion of multi-line calling.

## Dashboard hazards that integration must resolve

- `answerCall()` currently rejects a second answered connection while `activePc` exists.
- Hold music and the hold `AudioContext` are singletons, so they cannot safely represent independent held callers.
- `routeCallerTrackToDashboard()` connects every accepted caller audio track directly to the audio destination. Reusing it unchanged for multiple sessions would let waiting or held callers be audible locally.
- `syncOverlayRelayTracks()` reads the singleton `callerRemoteStream`, and overlay relay subscriptions are scoped to one call. Program/OBS routing must be keyed to the explicitly selected on-air call instead.
- Call teardown resets singleton globals and would need per-session cleanup to avoid closing or clearing another line.

The safe migration must build per-line monitor buses and one fail-closed program bus: disconnect the previous program source before switching, route only the chosen caller to program, and keep private screening/held lines isolated. UI selection alone is not sufficient to enforce this audio boundary.

## Tests

`tests/producer-call-session.test.mjs` checks:
- separate peer connections and remote streams for different call IDs
- buffering early ICE candidates until the offer is accepted
- SDP answer transformation and local sender replacement
- local and remote track isolation
- closing one session without closing another

CI runs this test. Full integration still requires per-line Firestore subscriptions, microphone ownership, hold audio, monitor/program routing, UI controls, and mobile cross-network acceptance tests.
