# Three-line call manager: dashboard integration plan

## Current state

The dashboard currently owns one live WebRTC session through singleton variables such as `activePc`, `activeCallId`, `activeCallRef`, `producerStream`, `producerAudioSender`, and a single `callerRemoteStream`. The incoming-call renderer disables Answer whenever `activePc` exists. The three-tile phone bank is therefore a queue/status display, not three independently connected phone lines.

`lib/multi-line-call-manager.js` provides a tested state coordinator, but it is intentionally not a WebRTC adapter. Do not describe the application as supporting three simultaneous connected calls until the dashboard integration and real-device tests below are complete.

## Required migration

1. **Create a per-call session object.** Each occupied line must own its peer connection, call document reference, candidate/status subscriptions, microphone stream/sender, remote stream, hold-audio generator, call timer, recording state, and cleanup function. Do not overwrite another line's resources when answering a new caller.
2. **Answer per line.** Permit answering a waiting call only if a free line exists. Reserve the line before awaiting microphone/Firestore operations; release it on every error path. Keep video screening separate from an accepted line session.
3. **Separate monitor audio from program audio.** Each remote caller track should enter a per-line Web Audio graph. The producer monitor can select a line independently. Program output must have one explicit source and default to silence/no caller.
4. **Make hold per session.** Holding a line must remove that caller from program output first, then replace only that session's producer-facing sender track with hold audio. Resuming a held line must not automatically put it on-air.
5. **Switch safely.** To switch program callers, route program output to silence first; mark the former program caller held; enable the new caller's normal return audio; then select only the new caller for program output. If any step fails, remain silent rather than mixing two callers.
6. **Make all teardown paths per-session.** Remote hangup, producer hangup, rejected call, WebRTC failure, sign-out, and page refresh must release only the matching session. Do not clear global program state unless the ending call owns that route.
7. **OBS and live state.** Publish the selected call ID/name/media type only after the call's Firestore status is successfully set to live. Take the program off-air immediately before a switch or end. Never send a held, waiting, or private-screening stream to the program/OBS relay.
8. **Update the UI.** Each line tile should show caller, media type, state, and actions valid for that state: Answer/Screen, Hold/Resume, Select On Air, Take Off Air, and End. Disable actions while their asynchronous transition is in flight.
9. **Keep Firestore compatible.** Preserve current collection and candidate path names until rules are verified against the deployed project. Add no new Firestore fields without matching rule tests and deployment verification.

## Acceptance tests

- Three independent caller devices can connect to three separate line sessions.
- A fourth caller remains queued without replacing or disconnecting any existing session.
- A held caller receives hold audio, is not heard in program output, and can be resumed without being automatically broadcast.
- Switching A → B → C always disconnects the previous program source before selecting the next.
- Two callers can never be heard in program output simultaneously, including rapid repeated taps and failures during switching.
- Waiting, screening, and held callers never appear in OBS/program audio.
- Ending one line does not terminate or mutate either other line.
- Remote hangup and network failure free only the affected line.
- Run mobile cross-network tests for audio, video, hold, switch, and reconnection before production rollout.

## Rollout gate

This is a multi-file WebRTC lifecycle and audio-routing refactor. Keep the change in a draft PR until static checks pass, state/adapter tests pass, and the full acceptance matrix has been exercised. A green static CI run is necessary but is not evidence of production WebRTC correctness.
