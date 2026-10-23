# Multi-line media controller

This module composes the existing `ProducerCallSession`, `MultiLineCallManager`, and `ProgramAudioRouter` into one testable producer-side coordinator.

## API

- `answerCall({ callId, callerName, mediaType, offer, localStream, lineId? })` reserves one of three lines, creates a dedicated peer connection, accepts the caller offer, and returns an answer SDP.
- `addRemoteCandidate(callId, candidate)` queues or applies caller ICE candidates to that call's peer connection.
- `takeOnAir(callId)` explicitly routes only that caller to the program stream. A second caller is not automatically connected to program output.
- `setMonitor(callId|null)` selects a separate caller for local monitoring.
- `holdCall(callId)` mutes the program route when appropriate and emits `onHoldState`; the application must provide the actual hold-audio track through that callback/adapter.
- `replaceLocalTrack(callId, kind, track)` changes a track only on the selected call's sender.
- `endCall(callId)` disposes only that line's peer connection and audio route.
- `getSnapshot()` exposes a serializable line/session summary.
- `close()` silences and disposes all sessions.

## Firestore/UI integration boundary

The module intentionally does not read or write Firestore, request microphone permissions, manipulate dashboard DOM, or connect an OBS relay. The application must persist returned answer SDP and local ICE candidates using the correct per-call Firestore paths, subscribe to caller candidates and pass each to `addRemoteCandidate`, and use the returned line ID to update the UI.

Do not merge this module into the live dashboard without wiring its callbacks to Firestore and replacing the current global `activePc` flow. In particular, the existing global hold-music generator, direct caller monitoring, global overlay relay stream, call timer/recording state, and cleanup function still need per-call ownership. A held call needs a real hold track; this controller deliberately does not fabricate one.

## Tests

`tests/multi-line-media-controller.test.mjs` exercises three separate peer connections, independent monitor/program routing, program switching, per-line end cleanup, and global shutdown using browser API fakes. This is a deterministic integration test, not a substitute for mobile-browser, Firestore, TURN, and OBS end-to-end testing.
