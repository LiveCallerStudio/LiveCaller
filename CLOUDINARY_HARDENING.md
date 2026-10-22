# Cloudinary hardening checklist

The current GitHub Pages application uses **unsigned** Cloudinary uploads. The cloud name and unsigned preset name are public by design; they are not secrets. A public preset can be abused by anyone who discovers it, so client-side checks alone are not a security boundary. Never put the Cloudinary API secret in HTML or JavaScript.

## Required Cloudinary console changes before merging this branch

Open Cloudinary Console → Settings → Upload → Upload presets.

### Existing preset: `djdeeze_hotline` (listener voice messages)
- Keep signing mode **Unsigned** only because the static GitHub Pages client uploads directly.
- Set allowed formats to only the audio formats you intend to accept: `webm, mp4, ogg, wav, mp3, m4a, aac` (match the formats actually produced by your supported browsers).
- Set the maximum file size to **8 MB**.
- Set the preset's target folder to `livecaller/incoming-audio`.
- Enable unique filenames and disable overwrite.
- Do not permit arbitrary public IDs or eager transformations.
- Keep moderation/notification features off unless deliberately configured.

### New preset: `djdeeze_hotline_recordings` (producer call recordings)
Create this preset before deploying the updated dashboard:
- Signing mode: **Unsigned** (the dashboard is static and has no signing backend).
- Allowed formats: `webm, mp4, ogg` only if these are the actual recorder formats you use.
- Maximum file size: **50 MB**.
- Target folder: `livecaller/call-recordings`.
- Enable unique filenames and disable overwrite.
- Do not permit caller-controlled public IDs or eager transformations.

The code now validates upload size, checks HTTP/JSON failures, applies timeouts, and verifies that Cloudinary returns an HTTPS URL on your expected Cloudinary host. These checks improve reliability and prevent accidental bad records; they do **not** stop an attacker from making direct uploads with the public unsigned preset.

## Stronger protection (recommended next step)
For meaningful abuse prevention, move uploads behind a small authenticated server endpoint (for example, a Firebase callable/HTTPS Cloud Function) that issues short-lived signed upload parameters and enforces rate limits and file policy. Keep the API secret server-side only. Until then, monitor Cloudinary usage and disable/rotate a compromised unsigned preset in the console. Changing the preset name alone is not authentication.

## Deployment order
1. Create/configure both presets above.
2. Enable Firebase Anonymous Authentication and apply/test the screening rules in `FIRESTORE_VIDEO_SCREENING_RULES.md`.
3. Run the repository validation workflow.
4. Merge the pull request only after the CI checks pass.
