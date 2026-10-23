# Firestore multi-line adapter

`FirestoreMultiLineAdapter` binds `MultiLineMediaController` to the existing `liveCalls/{callId}` Firestore schema without hard-coding Firebase initialization.

## Injected Firebase SDK functions

Pass the initialized `db` and modular SDK functions: `doc`, `getDoc`, `setDoc`, `updateDoc`, `collection`, `addDoc`, and `onSnapshot`. The adapter intentionally does not import `firebaseConfig`.

## Per-call lifecycle

- Read `liveCalls/{callId}` and require an offer before reserving a line.
- Create an independent WebRTC session through the media controller.
- Write the WebRTC answer to that call document. The producer's local line assignment stays in client-side controller state; the adapter does not persist `producerLineId` because it is not in the current `validAudioCall` allowlist.
- Publish local ICE candidates to `liveCalls/{callId}/dashboardCandidates`.
- Subscribe to `liveCalls/{callId}/callerCandidates` and deliver candidates only to that call's peer connection.
- Subscribe to the individual call document and dispose the matching session on ended/rejected/cancelled status.
- Persist the rules-compatible call status `live` when taking a call on air and `held` when holding it; ending one line does not unsubscribe other lines.

## Firestore status contract

The adapter intentionally uses the status values allowed by the supplied `validAudioCall` rules:

- `waiting`: guest is waiting for the producer.
- `answered`: producer has established the WebRTC answer but has not routed the call to program audio.
- `live`: producer selected the call for program/on-air audio. This also matches the current overlay-session rule that requires a parent call with status `live`.
- `held`: call is connected but its program audio is held/silent.
- `ended`, `rejected`, `timeout`: terminal states handled by the existing call flow.

Do not add `on-air`, `on-hold`, `producerLineId`, `answeredAt`, `onAirAt`, `heldAt`, or `endedAt` to `liveCalls` writes unless the deployed rules are intentionally updated to allow them. These extra values currently conflict with the supplied rules' status enum or field allowlist.

The adapter tests are mocked tests, not Firestore Rules tests. Before enabling Take On Air, validate the exact deployed rules and authenticated producer/guest permissions in the Firebase Emulator, then test the real browser-to-OBS offer/answer/ICE path.

## Important integration boundaries

This adapter is not yet wired into `dashboard.html`. The dashboard still owns a singleton call UI and media flow. Before use in production, integrate the adapter with per-line UI selection and migrate caller preview, recording, camera toggles, overlay relay, hold audio, timers, and local mic ownership to per-call state. The hold callback currently persists state; it does not generate hold audio. The app must also confirm the deployed Firestore rules permit the exact candidate/document writes.

The adapter's tests use mocked Firebase SDK functions. They do not prove deployed Firestore rules, authentication, network connectivity, TURN reachability, or browser interoperability.
