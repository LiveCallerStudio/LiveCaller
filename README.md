# Live Caller Studio

**Proprietary project — © 2026 Live Caller Studio. All rights reserved.**

Live Caller Studio is a personal livestream call-in and audience interaction site for DJ Deeze. It includes caller pages, a producer dashboard, voice messages, song requests, and OBS overlays.

## Production pages

- `index.html` — root entry redirect
- `home-v2.html` — public landing page and line status
- `call.html` — audio call flow
- `videocall.html` — video call flow
- `voicemessage.html` — voice-message submission
- `songrequest.html` — song requests
- `dashboard.html` — producer dashboard
- `overlay.html` — OBS call overlay
- `song-overlay.html` — OBS song-request overlay

The small icon, manifest, and service-worker files support installed/PWA behavior. Keep a file only after confirming it has no references from these pages, the service worker, or browser bookmarks.

## Security status and required action

GitHub has reported a Google API key as publicly exposed. The live pages contain a Firebase Web API key because Firebase's browser SDK requires client configuration. **Do not treat this as a secret or assume that removing it from Git history alone secures it.**

1. In Google Cloud Console, find the exact key identified by GitHub's alert.
2. Restrict it to the production site's HTTP referrers and only the required APIs.
3. If it was unrestricted or misused, create a replacement, update every active page that uses Firebase, test all flows, then disable the old key.
4. Review Firebase Authentication authorized domains and Firestore rules independently.
5. Resolve the GitHub alert only after the Google-side remediation is complete.

See [SECURITY.md](SECURITY.md) and [SETUP.md](SETUP.md). Do not put service-account JSON, Firebase Admin credentials, Cloudinary API secrets, or other privileged credentials in client files.

## Protecting this personal project

The source and design are proprietary; see [LICENSE](LICENSE). Keep the source repository private if you do not want people browsing or cloning it. **The repository is currently public, and public GitHub Pages files are downloadable.** Making only the repository private may affect the current Pages deployment depending on the account/plan.

Anything delivered to a visitor's browser—including HTML, JavaScript, CSS, images, and visible behavior—can be saved or reproduced. Minification, obfuscation, disabling right-click, and copyright notices do not prevent that. For stronger protection, separate private source from a minimal public deployment, move valuable logic and privileged operations to an authenticated server, and enforce authorization in Firebase rules/server APIs. Do not delete active pages or assets just to make the project look smaller; remove files only after checking references and production behavior.

## Validation

GitHub Actions runs static JavaScript/reference checks and line-state/production-safety tests on pushes and pull requests. A green CI run verifies those automated checks only; it does not prove that real devices, Firebase rules, WebRTC, audio, or OBS have been end-to-end tested.
