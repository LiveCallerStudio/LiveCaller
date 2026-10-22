# Live Caller Studio — LiveKit Phone System

A standalone Next.js host control room and mobile caller experience. It keeps the existing Firestore queue collection names — `liveCalls` for audio calls and `videoCalls` for video guests — while using LiveKit rooms for media instead of exchanging SDP/ICE candidates through Firestore.

## What is included

- `/` — host sign-in, live incoming queue, Audio/Video filters, answer/reject, active media stage, hold/resume, bring-on-air and disconnect.
- `/call` — mobile-first FaceTime-inspired caller flow, audio/video selection, waiting status, mic/camera controls and end-call.
- `POST /api/calls` — creates a call request and a random private caller secret.
- `POST /api/calls/status` — lets a caller check only the status of their own request.
- `POST /api/livekit-token` — creates short-lived LiveKit room tokens after server-side authorization.
- `POST /api/calls/action` — host-only call state transitions.
- `POST /api/calls/end` — caller can end only the request matching their secret.

## Required services

1. A Firebase project with Authentication (Email/Password for the host) and Firestore enabled.
2. A LiveKit Cloud project or a reachable self-hosted LiveKit server.
3. A Node.js host for Next.js (Vercel is a straightforward option). GitHub Pages cannot run the API routes in this folder.

## Local setup

Use Node.js 20 or newer.

```bash
cd phone-system
npm install
cp .env.example .env.local
npm run dev
```

Fill in the variables in `.env.local`:

- `NEXT_PUBLIC_FIREBASE_*`: use the same Firebase web app configuration as the existing Live Caller Studio site.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: the full service-account JSON string, or use `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`. Keep these server-only.
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`: from LiveKit. Never prefix the key or secret with `NEXT_PUBLIC_`.
- `HOST_UIDS`: comma-separated Firebase Authentication UIDs allowed to control calls. Find the producer's UID in Firebase Console → Authentication → Users.

Then visit `http://localhost:3000` for the host control room and `http://localhost:3000/call` for the caller page.

## Deployment

Deploy the `phone-system` directory as its own Next.js project. In Vercel, set the project root directory to `phone-system`, add the environment variables above, and redeploy after changes. Link your existing static website's call button to the deployed `/call` URL. Do not point the existing static dashboard at the new API until the new deployment and credentials are tested.

## Audio quality and browser behavior

LiveKit negotiates Opus for WebRTC audio. The room publishes with the SDK's high-quality 48 kHz music preset and disables DTX, while requesting echo cancellation, noise suppression and automatic gain control. This improves the browser call, but it does **not** guarantee uncompressed or studio-grade broadcast audio: browser microphones, Bluetooth routes, network conditions, the other participant's device, and the broadcast mix still matter. For DJ/radio use, wired headphones and a clean external mic path are recommended.

The caller browser requests mic/camera permission only after a host answers and the room connection begins. Mobile Safari requires HTTPS in production. Keep the caller page open while waiting; mobile browsers can suspend background tabs.

## Important integration notes

- Existing old `call.html` requests use the legacy Firestore WebRTC offer/ICE schema. They remain visible in the queue but are labelled as legacy and cannot join a LiveKit room. New callers must use this app's `/call` page. Keep the old dashboard available during rollout, or migrate all callers and the host dashboard together.
- `Bring on air` updates the call state in Firestore. This code does not automatically inject room audio into OBS. For a broadcast mix, configure a LiveKit egress/recording pipeline or capture a dedicated host-side audio output in OBS and test echo/feedback before going live.
- The browser host queue uses authenticated Firestore listeners, matching the existing dashboard's general pattern. Firestore rules must allow the intended signed-in host account to read `liveCalls` and `videoCalls`; do not enable unrestricted public reads of these collections.
- This code uses Firebase Admin on the server to create and transition new calls. Protect service-account credentials, restrict host UIDs, and configure Firebase Authentication and Firestore rules before production.
- The free/public TURN credentials in the old static page are not carried forward. LiveKit's media infrastructure handles room connectivity; a self-hosted deployment needs its UDP/TCP media ports and TURN setup configured correctly.

## Existing call status vocabulary

The new flow uses `waiting`, `answered`, `held`, `live`, `rejected`, and `ended`, preserving the core queue concepts from the existing assets. The `videoCalls` collection is still separate so video guests can be screened independently from audio-only callers.
