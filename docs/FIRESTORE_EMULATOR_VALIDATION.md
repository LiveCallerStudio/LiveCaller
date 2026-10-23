# Firestore Emulator validation matrix

## Purpose

Use the Firebase Emulator Suite to verify the exact Firestore rules intended for Live Caller Studio before enabling the experimental multi-line producer's **Take On Air** action. This plan is not evidence that current deployed rules pass.

## Current blocker

The repository does not currently contain `firestore.rules`, `firebase.json`, or a Firebase Emulator test harness. The rules discussed in the project conversation are not available here as a complete checked-in source file. Do not reconstruct or deploy a replacement from a summary: a small difference in a guest-call or screening rule could change who can read or mutate live calls.

Before implementing emulator tests:
1. Copy the exact, reviewed rules text into `firestore.rules`.
2. Confirm with the project owner that this file is the intended source of truth; do not deploy it as part of this change.
3. Add Firebase CLI / rules-unit-testing dependencies and a test command pinned to a known supported version.
4. Run the tests against the emulator with no production Firebase project selected.

## Required scenarios

These scenarios must be implemented against the exact rules file. Where the intended policy is not explicit in the checked-in source, record the expected result with the project owner before writing an assertion.

| Area | Identity / setup | Operation | Validation goal |
| --- | --- | --- | --- |
| Audio call creation | Unauthenticated guest | Create a valid `liveCalls/{callId}` waiting call | Preserve the intended public caller flow while rejecting malformed payloads |
| Audio call schema | Guest and producer | Add an unknown field or invalid status | Reject fields outside the documented allowlist and statuses outside `waiting`, `answered`, `held`, `live`, `ended`, `timeout`, `rejected` |
| Producer call updates | Authenticated producer UID and ordinary signed-in user | Write answer/status fields | Permit only the intended producer transitions; deny non-producer writes |
| ICE candidates | Guest / producer | Create candidates in caller and dashboard candidate subcollections | Confirm each side can write only its permitted candidate shape and cannot overwrite the other side's candidates |
| Video calls | Guest / producer | Create and update a valid video call; try malformed fields | Enforce the exact video schema independently of audio calls |
| Screening privacy | Guest, producer, unrelated user | Read/write screening-session data | Verify private video-screening data is not exposed to unrelated users |
| OBS overlay sessions | Producer and guest | Create session or update answer while parent call is not `live`, then while it is `live` | Confirm parent-call state gates overlay-session operations as intended |
| Voice messages | Owner / unrelated user | Read, create, update, and delete messages | Enforce the intended ownership and producer access |
| Hotline state/settings | Guest / producer | Read state and attempt settings writes | Preserve public call availability reads while restricting producer-only settings |
| Call history | Producer / unrelated user | Read and write history entries | Prevent unauthorized history access and mutation |
| Song requests | Guest / producer | Create request and modify live-request state | Validate payloads and producer-only moderation actions |

## Adapter contract checks

The existing `tests/firestore-multi-line-adapter.test.mjs` uses mocked Firebase functions. Keep it as a fast unit test. Emulator tests must additionally verify that adapter writes are accepted by the rules and that rejected writes leave the producer media route fail-closed.

The current adapter maps on-air to `live` and hold to `held`, and avoids writing `producerLineId` and extra timestamp fields that were not in the supplied `validAudioCall` allowlist. Confirm these assumptions against the checked-in rules before treating the adapter as production-compatible.

## Release gate

Do not enable **Take On Air** until all of the following are true:

- The exact intended rules file is checked in and reviewed.
- All emulator allow/deny cases pass.
- Producer and guest flows pass in a real browser using the deployed-equivalent authentication configuration.
- WebRTC offer/answer and ICE candidate exchange succeed across the intended networks.
- OBS receives only the selected caller's program audio, and hold/end/error paths become silent.
- CI and Pages deployment succeed after the final changes.

Passing emulator tests does not replace end-to-end browser, network, or OBS validation. No Firebase rules should be deployed without separate explicit approval.
