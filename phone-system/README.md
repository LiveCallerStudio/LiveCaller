# Live Caller Studio — LiveKit Phone System

This is a separate Next.js app for the Live Caller Studio call-in workflow. It leaves the existing static pages intact and uses LiveKit for WebRTC media plus the existing Firebase project and liveCalls collection for the screening queue.

## Included
- Mobile caller UI with FaceTime Audio / Video choice, name and optional city, waiting state, hold state, microphone/camera UI and end-call action.
- Producer console with auto-refreshing incoming queue, call-type badges, Answer, Put on Hold, Resume, Decline, Disconnect and Send On Air.
- Server-issued LiveKit participant tokens; API secrets stay server-side.
- Firestore call documents in liveCalls and line-state lookup at hotlineSettings/callLines.
- Host API guarded by HOST_DASHBOARD_KEY; caller status and end action require a random per-call secret.
- Existing OBS overlay remains a separate graphics source. Capture the host console browser/window audio in OBS to hear the call.

## Deploy
This is a Next.js server app and cannot run from static GitHub Pages. Deploy the phone-system folder as its own Vercel/Node app. Set Vercel Root Directory to phone-system and use Node 20+.

Configure these server environment variables from .env.example: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, FIREBASE_SERVICE_ACCOUNT_BASE64, FIREBASE_PROJECT_ID=djdeeze-hotline, and a long random HOST_DASHBOARD_KEY. Encode your Firebase service-account JSON as one-line base64. Never commit the service account or expose secrets as NEXT_PUBLIC variables.

Create a LiveKit Cloud project, deploy, open /host and enter the host key. Open the root caller page from another device. HTTPS is required for browser microphone/camera permissions. After the deployed URL is known, update the existing home page caller link and the producer shortcut.

## Security and rollout
Admin SDK routes bypass Firestore client rules; keep service-account credentials private. Prevent public Firestore clients from reading callerKey fields in liveCalls. Existing static pages may use additional fields/status names; verify line-state field names and existing Firestore rules before switching traffic. This implementation intentionally does not overwrite call.html, videocall.html or dashboard.html.

## Audio quality
WebRTC typically negotiates Opus. Echo cancellation, noise suppression and automatic gain control depend on browser capture constraints and device support. This starter prioritizes low-latency interactive calling and does not guarantee a specific Opus bitrate or broadcast loudness. Verify negotiated codec, packet loss and bitrate in a real LiveKit room before going live. Use headphones and a stable uplink.