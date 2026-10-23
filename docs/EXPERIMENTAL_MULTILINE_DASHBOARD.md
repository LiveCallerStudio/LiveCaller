# Experimental three-line dashboard mode

## Enable locally for testing

Open the producer dashboard with the query parameter `?multiline=1` after the normal URL, for example:

`dashboard.html?multiline=1`

The default dashboard URL is unchanged and continues using the legacy call flow.

## Safety boundaries

- This mode is opt-in and is intended for controlled testing only.
- Only incoming audio calls with an SDP offer appear in the experimental line console.
- Legacy call-answer buttons are disabled while the experimental view is active to prevent mixing the old singleton peer connection with the new sessions.
- Each answer creates a separate producer microphone stream; ending a call stops that call's local tracks.
- Monitor routing is isolated per caller.
- **Take On Air is deliberately disabled.** The production OBS overlay relay still consumes the legacy active-call globals, not the experimental controller's selected program stream.
- Hold currently silences the program route; it does not play hold music.
- Video calls, camera tracks, call recording, call history, OBS relay, and real multi-device behavior are not integrated with this experimental controller.

Do not use this mode for a live broadcast. Before enabling program routing, integrate the selected controller's caller audio/video with the OBS relay, test that switching and disconnecting fail closed, verify Firestore rules for both `callerCandidates` and `dashboardCandidates`, and perform browser/device tests with real callers.

## Validation

The automated suite uses mock WebRTC/Firestore objects. Passing it validates code paths and state isolation, not Firebase security rules, TURN connectivity, microphone permissions on every browser, or real-world WebRTC behavior.
