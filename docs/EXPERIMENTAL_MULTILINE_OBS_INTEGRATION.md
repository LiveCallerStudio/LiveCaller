# Experimental multi-line OBS relay integration

This layer gives the opt-in three-line dashboard its own Firestore/WebRTC overlay
relay lifecycle, separate from the legacy singleton globals.

- Each answered call can watch its own `liveCalls/{callId}/overlaySessions`.
- Relay offers are answered and ICE candidates are exchanged using the existing
  `overlayCandidates` / `dashboardCandidates` subcollections.
- Audio-only relay peers send the selected program-bus track only to overlays
  belonging to the selected call. Extra audio lanes and all video lanes are
  inactive.
- Parent call end/reject/cancel and explicit line end close that call's relay peers.
- Switching or losing the program route is handled by the fail-closed bridge.

## Still experimental

The dashboard's Take On Air button remains disabled. This PR wires transport and
routing code but cannot prove real Firestore permissions, ICE/TURN reachability,
OBS Browser Source negotiation, or audio behavior across actual devices. Only
enable on-air after those checks, including hold, caller switch, remote hangup,
and producer sign-out. Video relay remains unsupported in the experimental
console.
