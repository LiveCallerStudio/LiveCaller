# Live Caller Studio — Current Setup and Operations

This guide describes the current repository. It replaces older instructions that referred to a different three-file prototype.

## Current pages

| File | Purpose |
|---|---|
| `index.html` | Root redirect to the current home page |
| `home-v2.html` | Public landing page and phone/video line status |
| `call.html` | Audio call flow |
| `videocall.html` | Video-first caller flow |
| `voicemessage.html` | Voice-message submission |
| `songrequest.html` | Song requests |
| `dashboard.html` | Producer dashboard |
| `overlay.html` | OBS call overlay |
| `song-overlay.html` | OBS song-request overlay |

`home.html` is a compatibility redirect. PWA manifests, icons, `sw.js`, and files under `lib/` or `dashboard/` may be referenced by app/install flows; don't delete them until references and deployed behavior have been checked.

## Hosting and ownership

The live site is hosted from this GitHub repository at:

- Home: https://livecallerstudio.github.io/LiveCaller/
- Audio call: https://livecallerstudio.github.io/LiveCaller/call.html
- Video call: https://livecallerstudio.github.io/LiveCaller/videocall.html
- Voice messages: https://livecallerstudio.github.io/LiveCaller/voicemessage.html
- Producer dashboard: https://livecallerstudio.github.io/LiveCaller/dashboard.html

This is a static GitHub Pages app. Files delivered to browsers are public and downloadable. Do not put server secrets or privileged business logic in HTML/JavaScript. The repository is currently public; switching it to private can affect the current Pages hosting depending on account/plan. See `README.md`, `SECURITY.md`, and `LICENSE` before changing repository visibility.

## Google API key / Firebase configuration alert

The live client pages contain Firebase Web SDK configuration. The Firebase Web API key is sent to browsers by design; it is not an admin credential. GitHub has reported a Google API key as publicly exposed, so perform the Google-side remediation before treating the alert as resolved.

1. Open Google Cloud Console for the Firebase project `djdeeze-hotline`.
2. Go to **APIs & Services → Credentials** and identify the exact key linked to the GitHub alert. Do not paste the key into issues, chat, commits, or logs.
3. Set **Application restrictions → Websites (HTTP referrers)** to the exact production origin(s) used by the site. Add only necessary development origins.
4. Set **API restrictions** to the APIs this application actually uses. Test before removing access to an API the app needs.
5. If the key was unrestricted or may have been misused, create a replacement key, update every active Firebase client page consistently, test sign-in, call signaling, messages, song requests and overlays, then disable/delete the old key.
6. In Firebase Authentication, verify authorized domains. Review Firestore rules separately; API-key restrictions do not secure database records.
7. Return to GitHub **Security → Secret scanning → Alerts** and resolve the alert only after remediation or confirmation from Google that the finding is an expected Firebase browser key.

Do not place Firebase Admin credentials, service-account JSON, Cloudinary API secrets, or any privileged credential in browser code.

## Firebase and Firestore safety

- Require authentication for producer-only dashboard data and actions.
- Allow visitors only the minimum unauthenticated operations required for call/message submission.
- Validate fields and types; prevent public callers from changing producer-controlled status, line settings, analytics, or other privileged records.
- Scope call signaling and ICE candidate access to the relevant authorized participants.
- Test rules with the Firebase Rules Playground or Emulator before publishing.
- Never use permissive rules such as public read/write/update/delete access. The correct rules depend on the exact deployed collections and data model; do not paste a generic ruleset into production.

## Cloudinary voice-message uploads

The browser-facing upload flow uses an unsigned Cloudinary preset, so its cloud name and preset name are public—not secrets. In Cloudinary Console → **Settings → Upload → Upload presets**, constrain the preset to the intended incoming-audio folder, supported audio formats, a suitable maximum file size, unique filenames, and overwrite disabled. Do not expose the Cloudinary API secret. Unsigned presets can be abused by strangers who discover them; client-side checks are not a security boundary.

If stronger upload controls or reliable deletion are required, move upload signing/deletion behind an authenticated server or function and keep its secret in server-side secret storage.

## OBS setup

1. In OBS, add a **Browser** source.
2. For caller notifications, use the deployed `overlay.html` URL. For song requests, use `song-overlay.html`.
3. Set the source dimensions to match the OBS canvas (commonly 1920×1080).
4. If overlay audio should enter the OBS mixer, enable **Control audio via OBS**.
5. Test with a non-live/dummy call first. Browser autoplay may require a one-time interaction in the OBS Browser Source.

## Safe maintenance and cleanup

- Keep `.gitignore` protections for environment files, service-account credentials, logs, build outputs, and local secrets.
- Keep tests and workflow files; they catch regressions.
- Before removing a page, manifest, icon, library file, or redirect, search all HTML, CSS, JavaScript, manifests and service-worker precache lists for references. Also consider bookmarks and OBS Browser Source URLs.
- Prefer removing truly unused duplicates and obsolete documentation rather than deleting assets used by the production app.
- A copyright notice states ownership but does not prevent downloading public browser assets. For meaningful source protection, keep the development repository private and deploy only the necessary public files from a separate deployment process; put valuable logic and privileged operations behind an authenticated server.
- GitHub Actions checks static syntax/references and automated line-state/security assertions. Green checks are not a substitute for end-to-end testing on real devices, Firebase rules, WebRTC, audio, and OBS.

