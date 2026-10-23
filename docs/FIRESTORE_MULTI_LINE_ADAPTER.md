# Firestore multi-line adapter

`FirestoreMultiLineAdapter` binds `MultiLineMediaController` to the existing `liveCalls/{callId}` Firestore schema without hard-coding Firebase initialization.

## Injected Firebase SDK functions

Pass the initialized `db` and modular SDK functions: `doc`, `getDoc`, `setDoc`, `updateDoc`, `collection`, `addDoc`, and `onSnapshot`. The adapter intentionally does not import `firebaseConfig`.

## Per-call lifecycle

- Read `liveCalls/{callId}` and require an offer before reserving a line.
- Create an independent WebRTC session through the media controller.
- Write the answer and assigned producer line to that call document.
- Publish local ICE candidates to `liveCalls/{callId}/dashboardCandidates`.
- Subscribe to `liveCalls/{callId}/callerCandidates` and deliver candidates only to that call's peer connection.
- Subscribe to the individual call document and dispose the matching session on ended/rejected/cancelled status.
- Update on-air and hold state for the selected call; ending one line does not unsubscribe other lines.

## Important integration boundaries

This adapter is not yet wired into `dashboard.html`. The dashboard still owns a singleton call UI and media flow. Before use in production, integrate the adapter with per-line UI selection and migrate caller preview, recording, camera toggles, overlay relay, hold audio, timers, and local mic ownership to per-call state. The hold callback currently persists state; it does not generate hold audio. The app must also confirm the deployed Firestore rules permit the exact candidate/document writes.

The adapter's tests use mocked Firebase SDK functions. They do not prove deployed Firestore rules, authentication, network connectivity, TURN reachability, or browser interoperability.
