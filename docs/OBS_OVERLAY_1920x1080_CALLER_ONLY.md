# OBS overlay — 1920×1080 and caller-only media

## OBS Browser Source

Set the Browser Source **Width** to `1920` and **Height** to `1080`. The overlay document itself is fixed at 1920×1080 and retains a transparent background. Keep **Shutdown source when not visible** disabled if OBS should keep its signaling session alive while the overlay is hidden.

## Three-line audio/video behavior

- Lines 1, 2, and 3 each own an independent caller session.
- Incoming call metadata selects audio-only or audio/video negotiation when answering a line.
- Answering is private: a caller is not routed to OBS until the producer presses **Take On Air** for that specific line.
- For video calls, the producer's camera/microphone are sent only to the caller as part of the private two-way conversation. The OBS relay receives the caller's remote tracks only; it never captures the producer's local camera or microphone.
- The overlay negotiates audio as receive-only and negotiates video as receive-only only for video callers.
- Switching lines detaches the previous caller before activating the next caller. Hold/end clears the relevant caller's OBS tracks.

## Validation

The repository test `tests/obs-overlay-contract.test.mjs` checks the fixed canvas and source-level routing gates. This is not a substitute for a live-device test. Before deployment, test audio and video callers on each of Lines 1, 2, and 3, switch the on-air caller, then hold/end each call and confirm OBS immediately stops receiving that caller.

Firestore rules must authorize the existing per-call `overlaySessions`, `overlayCandidates`, and `dashboardCandidates` paths. This patch does not change Firestore rules or deploy the site.
