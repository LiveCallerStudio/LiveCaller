# Production readiness checklist

This repository is a static GitHub Pages application. Source-level checks are necessary but do not replace Firebase/Cloudinary console configuration or real browser/network tests.

## Cloudinary

- Keep the existing unsigned preset `djdeeze_hotline` for listener voice messages. Do not change its settings as part of call-recording setup.
- Create a separate unsigned preset named `djdeeze_hotline_recordings` before deploying the dashboard changes in this branch.
- Restrict the recording preset to the actual browser recording formats supported by the app (normally WebM and MP4), set the maximum file size to 50 MB, target a dedicated call-recordings folder, enable unique filenames, and disable overwrite.
- Do not enable caller-controlled public IDs or eager transformations.
- The browser now enforces a 50 MB cap, uses a 45-second upload timeout, checks HTTP/JSON failures, and validates the returned HTTPS Cloudinary URL. These client checks are not authentication and cannot prevent direct abuse of a public unsigned preset.
- For production abuse protection, move uploads behind an authenticated server endpoint that issues short-lived signed parameters and enforces rate limits. Never place a Cloudinary API secret in client code.

## Firebase

- Preserve the existing Firestore rules and producer-only access. Do not solve permission errors by granting public writes to whole collections.
- Test caller queue creation, producer call acceptance, ICE candidate exchange, call end/cleanup, voice-message submission/playback, and OBS overlay behavior using a producer account and a separate caller browser.
- Verify that closed or unreadable call-line settings fail closed.
- Any private pre-air screening feature must be separately integrated with the current shared `liveCalls` flow and its rules. The older `videoCalls/screeningSessions` implementation from PR #17 is not compatible with the current `videocall.html` architecture and must not be copied over wholesale.

## Release gate

1. Run `node --test tests/production-safety.test.mjs` in a Node.js environment.
2. Confirm all repository CI checks are green.
3. Configure and verify the recording preset in Cloudinary.
4. Run the mobile-browser smoke tests over separate networks (producer Wi-Fi, caller cellular), including camera/microphone permissions and Safari/Chrome.
5. Confirm the OBS overlay receives only the on-air call, and that the private screening workflow is not exposed until it is properly ported and tested.
6. Deploy only after these gates pass.

## Current limitations

- WebRTC diagnostics improve observability; they do not guarantee connectivity. A reliable production TURN service may be needed for restrictive networks.
- Public unsigned uploads remain vulnerable to direct abuse until server-side signing/rate limiting is implemented.
- Automated source assertions do not prove Firebase rules, Cloudinary preset settings, real-time media, or device-specific behavior.
