# Experimental three-line dashboard mode

## Enable for controlled testing

Open the producer dashboard with the query parameter `?multiline=1`, for example:

`dashboard.html?multiline=1`

The default dashboard URL remains unchanged and continues using the legacy single-call flow.

## Current capabilities and safety boundaries

- This mode is opt-in; keep it in controlled testing until the real-device acceptance checks below pass.
- Only incoming audio calls with an SDP offer appear in the three-line console.
- Legacy answer buttons are disabled while this mode is active so the singleton legacy peer cannot race the per-line sessions.
- Each answered line has an independent producer microphone stream and WebRTC peer.
- Monitor audio is isolated per caller.
- **Take On Air is now connected to the selected program-audio bus and the existing Firebase/WebRTC OBS overlay relay.** Only the selected caller's program track is routed to OBS; switching, Hold, ending, or a failed overlay-state publication must fail closed.
- Hold removes the caller from the program route. It does not play hold music to the caller; the caller may still hear the producer microphone.
- Resume returns a held caller to connected/screening state without automatically putting them back on air. Use Take On Air explicitly to broadcast that caller.
- Video calls, camera tracks, call recording, call history, and private video screening are not integrated into this experimental controller.

Do not use this mode for a live broadcast until the acceptance checks pass. Verify Firestore rules for `liveCalls/{callId}/callerCandidates`, `dashboardCandidates`, and `overlaySessions` (including both ICE-candidate subcollections); test three separate callers, switching, Hold/Resume, hangup, sign-out, refresh, and network failure in real browsers and OBS. Confirm the program bus stays silent whenever no caller is selected.

## Validation

The automated suite uses mock WebRTC/Firestore objects. Passing it validates code paths and state isolation, not deployed Firebase rules, TURN reachability, microphone permissions, or real-world WebRTC/OBS behavior.
