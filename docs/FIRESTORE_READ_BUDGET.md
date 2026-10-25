# Firestore read-budget safeguards

## Why this exists

The Spark plan has a project-wide daily Firestore read allowance. A realtime listener on a whole collection charges reads for its initial result set and for documents that subsequently change. Opening the dashboard in several tabs and having OBS overlays watch the same unbounded collections can multiply those reads. Client code cannot reserve or enforce the project's total quota because other browsers, devices, and Firebase clients share it.

## Limits introduced

- Producer dashboard incoming-call queue: only `status == waiting`, maximum 50 documents. Active call signaling continues through the per-call listeners.
- OBS audio/video waiting counters: one shared listener for both media types, filtered to waiting calls and capped at 50 documents instead of two whole-collection listeners.
- Producer call history: most recent 100 documents in the realtime listener.
- Producer voice-message inbox: most recent 100 documents in the realtime listener.
- Producer song-request list: most recent 100 documents in the realtime listener.
- Song-request OBS overlay: most recent 50 requests in the realtime listener.
- OBS voice-message counter: most recent 100 messages instead of the entire message collection.
- Dashboard phone/video open state: one shared listener for `hotlineSettings/callLines`, rather than two listeners on the same document.
- Dashboard sign-out releases call-history and shared settings listeners as well as the existing queue listeners.

## Behavior and limits

The dashboard's live history/inbox/request views are bounded to the latest records listed above. This deliberately avoids downloading every historical document each time a tab opens. It does not delete any Firestore data. Older records remain in Firestore, but these views do not currently page through them.

The waiting-call queue shows at most 50 simultaneous waiting calls. If the studio regularly has more than 50 waiting calls, the cap should be revisited with a paginated/priority queue rather than removed blindly.

These changes reduce expected reads; they cannot guarantee that the project will never exceed its daily quota. Read consumption can still exceed the limit if many clients connect, reconnect repeatedly, or other app surfaces query large datasets. Monitor Firebase Console → Firestore Database → Usage after the change.

## Validation

Run:

```sh
node tests/firestore-read-budget.test.mjs
node tests/check-syntax.mjs
for f in tests/*.test.mjs; do node "$f" || exit 1; done
```

No Firestore security rules, Firebase configuration, billing settings, or deployment settings are changed by this patch. Real-device call/OBS testing and production usage monitoring are still required.
