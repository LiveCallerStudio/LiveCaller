# Program audio router

`ProgramAudioRouter` is a Web Audio routing primitive for the multi-line dashboard migration. Each registered caller gets a dedicated program gain and monitor gain. Caller tracks feed only their own two gains; all gains start at zero.

## Safety behavior

- Program output and producer monitor selection are independent.
- Program switching zeros every program gain before validating/enabling the next caller.
- A stale call ID or ended/missing track leaves the program bus silent.
- Removing the on-air caller silences the program bus.
- Closing the router silences and disconnects all nodes.
- The router never auto-selects a waiting, screening, or held caller; the dashboard must explicitly select the intended call ID.

## Scope and integration status

This module exposes `getProgramStream()` as a separate `MediaStreamAudioDestinationNode` stream suitable for wiring to a dedicated OBS relay sender. It is not yet integrated into `dashboard.html`, and it does not implement caller hold-music senders, Firestore state transitions, video selection, or per-line UI. Existing dashboard audio routing remains unchanged until that integration is completed and tested on real devices.

## Tests

`tests/program-audio-router.test.mjs` covers isolated caller tracks, separate monitor/program selections, single-caller program routing, fail-closed switching to an invalid caller, removal of the on-air line, and teardown.
