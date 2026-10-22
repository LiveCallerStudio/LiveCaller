# Live Caller Studio — Setup Guide

The current static site uses these main pages:

| File | Purpose |
|---|---|
| `home-v2.html` | Public landing page and phone/video line status |
| `call.html` | Caller page with audio/video mode selection |
| `videocall.html` | Video-first caller page |
| `voicemessage.html` | Voice-message submission |
| `songrequest.html` | Song requests |
| `dashboard.html` | Authenticated producer dashboard |
| `overlay.html` | OBS caller overlay |
| `song-overlay.html` | OBS song-request overlay |

`index.html` and `home.html` are redirects to the current home page. The dashboard shortcut is `dashboard/index.html`.

Firebase provides the browser-facing authentication and database services. Because this is a static GitHub Pages site, browser code and public assets are downloadable; do not put server credentials or privileged business logic in these files.

---

## PART 1 — Create your Firebase project (10 min)

1. Go to **https://console.firebase.google.com**
2. Sign in with a Google account (create one if needed — recommend a dedicated `djdeezehotline@gmail.com` or similar so it's not tied to a personal account).
3. Click **"Add project"**.
4. Name it `djdeeze-hotline` (or similar). Click **Continue**.
5. Disable Google Analytics (you don't need it — toggle off, click **Create project**).
6. Wait for it to provision, then click **Continue**.

### 1b. Set up Cloudinary (the audio file storage — free, no credit card)

Firebase Storage now requires a paid Blaze billing plan with a linked credit card (a change Google made in 2026), even though usage itself stays free under typical limits. Since you don't have a card to put on file, we're using **Cloudinary** instead for the actual audio files — it has a genuinely free tier with no credit card required, and Firestore (your message database) is untouched by any of this.

1. Go to **https://cloudinary.com** and click **Sign up for free**. You can register with Google, GitHub, or just an email — no card needed.
2. Once you're in the Cloudinary console, your **Cloud Name** is shown right on the dashboard near the top (e.g. `dxxxxxxxa`). Copy it.
3. In the left sidebar, go to **Settings (gear icon) → Upload** tab.
4. Scroll to **Upload presets** → click **Add upload preset**.
5. Set:
   - **Preset name:** something like `djdeeze_hotline` (you'll copy this exact name)
   - **Signing Mode:** change from "Signed" to **Unsigned** — this is what lets the listener page upload directly from the browser without needing a secret key.
   - Leave everything else default.
6. Click **Save**.

You now have two values to copy: your **Cloud Name** and your **Upload Preset name**.

### 1c. Enable Firestore (the message database)
1. In Firebase Console, left sidebar, click **Build → Firestore Database**.
2. Click **Create database**.
3. Choose **Start in production mode** → Next.
4. Edition: leave on **Standard edition** (this is the right one — it has the automatic indexing this app needs and is the free-tier-friendly option; Enterprise is for larger MongoDB-style workloads).
5. Location type: choose **Regional**, then pick a region close to you (e.g. `us-south1` for Dallas, or `us-central1` if that's not listed). If the location dropdown shows blank, click directly into the field, wait a few seconds, or refresh the page — it's a console loading quirk, not a real error.
6. Click **Enable**.

### 1c. Register a Web App
1. Click the gear icon (⚙) next to "Project Overview" → **Project settings**.
2. Scroll to **"Your apps"** → click the **`</>`** (web) icon.
3. Nickname it `djdeeze-hotline-web`. Do **not** check "Firebase Hosting" (we're using GitHub Pages instead).
4. Click **Register app**.
5. You'll see a `firebaseConfig` object that looks like this:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "djdeeze-hotline.firebaseapp.com",
  projectId: "djdeeze-hotline",
  storageBucket: "djdeeze-hotline.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};
```

**Copy this entire block.** You'll paste it into 3 files in Part 2.

---

## PART 2 — Client configuration

The current source has Firebase client configuration in these active pages: `home-v2.html`, `call.html`, `videocall.html`, `voicemessage.html`, `songrequest.html`, `song-overlay.html`, `dashboard.html`, and `overlay.html`. If you change Firebase project settings, keep the client configuration consistent across those pages.

**Important:** a Firebase Web API key is visible to browsers by design. It is not a substitute for authentication. Restrict it to the production website's HTTP referrer and only the APIs this app needs in Google Cloud Console. Rotate it if it has been used outside the intended site. See `SECURITY.md` for the remediation checklist.

Cloudinary upload settings belong only on the page that actually uploads the audio/message asset. Keep Cloudinary API secrets out of browser code; unsigned upload presets must be tightly constrained by upload type, folder, size, and allowed formats.

---

## PART 3 — Secure Firebase access before going live (critical)

**Do not use the old example of open Firestore rules.** Rules such as `allow read, write: if true` or `allow read, update, delete: if true` let strangers read, alter, or delete records. They are not safe for a personal production project.

1. Open Firebase Console → **Firestore Database → Rules**.
2. Review every collection used by the current pages, including call signaling, caller/message queues, line settings, overlays, and song requests. Do not publish generic rules copied from an old setup guide.
3. Require Firebase Authentication for producer-only reads and all producer actions (approval, deletion, line settings, analytics, and private call/session data).
4. Allow unauthenticated visitors only the minimum operations the public caller flow needs. Validate document fields and types, limit permitted fields, and prevent clients from changing producer-controlled status or settings.
5. Keep each call's signaling/candidate data scoped to that call and its authorized participants. Do not make every call/session readable by every visitor.
6. Test the rules in Firebase's Rules Playground or Emulator before publishing. Then test guest submission, producer sign-in, incoming queue, answering/ending calls, and OBS overlays.
7. Apply corresponding access controls to Cloudinary uploads: use a tightly constrained unsigned preset only for the intended upload flow, with size/format/folder limits. Never put Cloudinary API secrets in browser code.

**Important:** the exact secure rules depend on the collections and data model in the deployed app. This guide intentionally does not provide a broad copy/paste ruleset that could expose caller data. If you are unsure whether existing rules are safe, treat them as unsafe until reviewed. Restricting the Google API key is separate from protecting Firestore data.

---

## PART 4 — Put it on GitHub Pages (free hosting)

1. Go to **https://github.com** and sign in (create a free account if needed).
2. Click the **+** icon top right → **New repository**.
3. Name it `djdeeze-hotline`. Set it to **Public**. Click **Create repository**.
4. On the new repo page, click **"uploading an existing file"** (or drag-and-drop).
5. Drag in all three files: `index.html`, `dashboard.html`, `overlay.html`.
6. Scroll down, click **Commit changes**.
7. Go to the repo's **Settings** tab → **Pages** (left sidebar).
8. Under "Build and deployment" → Source: **Deploy from a branch**. Branch: `main`, folder: `/ (root)`. Click **Save**.
9. Wait 1–2 minutes. Refresh the page — you'll see a green box: **"Your site is live at `https://yourusername.github.io/djdeeze-hotline/`"**.

Your three live URLs are now:
- Listener page: `https://yourusername.github.io/djdeeze-hotline/index.html`
- Dashboard: `https://yourusername.github.io/djdeeze-hotline/dashboard.html`
- Overlay: `https://yourusername.github.io/djdeeze-hotline/overlay.html`

> Optional: if you want it at a custom domain like `hotline.djdeeze.com`, add a `CNAME` file in the repo with that domain, and add a CNAME DNS record at your domain registrar pointing to `yourusername.github.io`. Ask me if you want this step-by-step too.

---

## PART 5 — Test the full flow

1. Open the **listener page** on your phone. Tap the mic, allow microphone access, record a few seconds, stop, review, fill in name/city/song (optional), hit **Send to DJ Deeze**. You should see the confirmation screen.
2. Open the **dashboard** on your laptop. Within a second or two, the new message should appear at the top with a green "New" badge, a chime sound, and a flashing "Incoming Voice Message" banner.
3. Click the **Play** button on the dashboard card — you should hear it (muted preview by design, see Part 6).
4. Click **Approve** to mark it played, or **Delete** to remove it (this also deletes the audio file from Storage).

If the dashboard shows "Couldn't connect to Firebase," double check your `firebaseConfig` was pasted correctly in `dashboard.html` and that you published the Firestore rules.

---

## PART 6 — OBS setup

1. In OBS, click **+** under Sources → **Browser**.
2. Name it `DJ Deeze Hotline Overlay`.
3. URL: your `overlay.html` GitHub Pages link.
4. Width: `1920`, Height: `1080` (match your canvas).
5. Check **"Control audio via OBS"** so the overlay's audio shows up as its own audio mixer track (you can route it, duck music under it, etc.).
6. Click **OK**. Position the overlay source wherever you want it on your scene (it auto-positions itself in the bottom-left, but you can drag/resize the OBS source — the lower-third is built at 1080p scale).

**How it works live:** the dashboard's Play button doesn't play the audio itself into OBS — it triggers Firestore to tell the overlay "play this now," and the overlay (running inside OBS's browser engine) plays the actual audio. That's what OBS's audio mixer picks up. The dashboard's own playback is muted by default since it's just for your monitoring; unmute it in `dashboard.html` if you want to hear it through your headphones too by removing `hiddenPlayer.muted = true;`.

**Autoplay note:** some browser engines block audio until there's been a user interaction on the page. If audio doesn't play the first time, click once anywhere inside the OBS Browser Source preview (right-click the source → Interact) and it should unblock for the rest of the session.

---

## PART 7 — Kick integration

In your Kick panel editor or chat description, add a clickable link:

```
🎤 Leave DJ Deeze a Voice Message: https://yourusername.github.io/djdeeze-hotline/index.html
```

Kick panels support plain links — paste your listener page URL as a "Custom Panel" with that text.

---

## Costs — when does this stop being free?

Firebase's free Spark plan includes (per day):
- Firestore: 50K reads, 20K writes, 20K deletes
- GitHub Pages: unlimited for public repos, soft bandwidth limit ~100GB/month

Cloudinary's free plan includes 25 credits/month (1 credit ≈ 1GB storage, 1GB bandwidth, or 500 seconds of SD audio/video processing) — for short voice clips at low volume, this comfortably covers a typical stream's worth of hotline messages.

For a hotline doing dozens to a few hundred messages per stream, you will not come close to either platform's limits. Neither requires a credit card at the free tier you're using.

**Note on Delete:** clicking Delete in the dashboard removes the message from the queue/database, but the audio file itself stays on Cloudinary (deleting it there requires a signed server-side request, which isn't something we expose in a pure front-end app). This is harmless — Cloudinary's free tier has 25GB+ of headroom, and old files just sit unused. If you ever want true file deletion, that's a small addition using a Cloudinary "delete by tag" admin call from a lightweight backend — ask me if you want it added later.

---

## What to do if something breaks

- **Mic button does nothing on iPhone:** Safari requires HTTPS for mic access — GitHub Pages serves HTTPS automatically, so this should work. If testing locally on `file://`, it won't work; always test via the live GitHub Pages URL.
- **Dashboard shows no messages but listener page says "sent":** check Firestore Console → Firestore Database → Data tab — you should see a `hotlineMessages` collection. If it's empty, the rules in Part 3a likely weren't published.
- **Overlay doesn't appear in OBS:** confirm `overlay.html` has the same `firebaseConfig` as the other two files, and that "Control audio via OBS" doesn't block rendering — try removing/re-adding the Browser Source.
- **Audio won't play in OBS:** see the autoplay note in Part 6.

---

## Future additions (already designed for, not yet built)

The data model (`hotlineMessages` collection with `status: pending/approved`) is built to extend cleanly. When you're ready, I can add:
- Song request flagging/sorting separate from general shoutouts
- Birthday/dedication message types with their own overlay styling
- Subscriber/VIP priority sorting in the queue
- WebRTC live call-ins
- AI transcription (Firebase Cloud Functions + a speech-to-text API) with keyword search across transcripts

Just bring this project back up and I'll build directly on top of what's already deployed.
