# DJ Deeze Hotline — Full Setup Guide

This system has 3 pages, all free to host:

| File | What it's for | Who uses it |
|---|---|---|
| `index.html` | Listener call-in page | Your fans (link from Kick chat/panel) |
| `dashboard.html` | Studio queue manager | You, on your laptop while streaming |
| `overlay.html` | Lower-third graphic | OBS Browser Source only |

Everything is stored in **Firebase** (Google's backend platform) on the free "Spark" plan. No backend server to maintain.

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

## PART 2 — Insert your Firebase + Cloudinary config

You have 3 files: `index.html`, `dashboard.html`, `overlay.html`. Each one has a clearly marked section near the top of its `<script>` block:

```js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  ...
};
```

Open each file in any text editor, **replace that placeholder block** with the real one you copied from Firebase, and save. Do this in **all three files** — they must all point to the same Firebase project.

`index.html` also has a second config block right below it, for Cloudinary:

```js
const CLOUDINARY_CLOUD_NAME = "YOUR_CLOUD_NAME";
const CLOUDINARY_UPLOAD_PRESET = "YOUR_UPLOAD_PRESET";
```

Replace these with your actual Cloud Name and the unsigned upload preset name from Part 1b. This only needs to go in `index.html` — that's the only page that uploads audio.

---

## PART 3 — Lock down security rules (critical — don't skip)

By default, "production mode" blocks everyone, including your own app. We need rules that let:
- Anyone submit a new message (so fans can record).
- Anyone read messages (so your dashboard and overlay work without you having to log in).
- Nobody edit/delete except your dashboard (we'll keep this simple for now — see note below on tightening later).

### 3a. Firestore rules
1. Firebase Console → **Firestore Database → Rules** tab.
2. Replace the contents with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /hotlineMessages/{messageId} {
      allow create: if true;
      allow read, update, delete: if true;
    }
    match /hotlineLive/{docId} {
      allow read, write: if true;
    }
    match /hotlineSettings/{docId} {
      allow read, write: if true;
    }
    match /liveCalls/{callId} {
      allow read, write: if true;
      match /callerCandidates/{candidateId} {
        allow read, write: if true;
      }
      match /dashboardCandidates/{candidateId} {
        allow read, write: if true;
      }
      match /airCallerCandidates/{candidateId} {
        allow read, write: if true;
      }
      match /airOverlayCandidates/{candidateId} {
        allow read, write: if true;
      }
    }
    match /videoCalls/{callId} {
      allow read, write: if true;
      match /callerCandidates/{candidateId} {
        allow read, write: if true;
      }
      match /overlayCandidates/{candidateId} {
        allow read, write: if true;
      }
      match /screenCallerCandidates/{candidateId} {
        allow read, write: if true;
      }
      match /screenDashboardCandidates/{candidateId} {
        allow read, write: if true;
      }
    }
    match /callHistory/{historyId} {
      allow read, write: if true;
    }
  }
}
```

> **`hotlineSettings`** holds a single doc (`callLines`) with two fields: `open` (phone lines) and `videoOpen` (video guests). The producer toggles both from the dashboard; `home.html`, `call.html`, `videocall.html`, and `overlay.html` all read them live. Skip this rule and both toggles fail with a permissions error.
>
> **`liveCalls`** now also carries **two separate WebRTC connections**, same idea as `videoCalls` below: `callerCandidates`/`dashboardCandidates` are the original screening connection (caller ↔ producer, for answering/holding/muting/talking before air), and the new `airCallerCandidates`/`airOverlayCandidates` are a second, independent connection straight from the caller to `overlay.html` once the producer sends them on air. That second connection is what actually gets the caller's voice onto the broadcast — skip this rule and on-air phone callers will be silent on stream even though the producer can still hear them fine.
>
> **`videoCalls`** is new — it's the video guest feature (see Part 7 below). Each doc is one guest's call-in request/session. It carries the same two-connection pattern: `callerCandidates`/`overlayCandidates` handle the "air" connection (guest straight to the overlay once live), and `screenCallerCandidates`/`screenDashboardCandidates` handle a second, independent "screening" connection so the producer can preview the guest's camera/mic in the dashboard before deciding to send them on air.

3. Click **Publish**.

> **Security note:** these rules are wide open by design so the dashboard works with zero login, matching "no app required" for listeners and zero-friction for you. The tradeoff is that anyone who finds your Firestore endpoint could theoretically delete messages or spam the queue. For a hobby/small-stream setup this is the standard free-tier approach. If you want it locked down later, the upgrade path is adding Firebase Authentication to `dashboard.html` and changing `update, delete` rules to `if request.auth != null` — ask me when you're ready and I'll wire it in.

Cloudinary's unsigned upload preset is the equivalent safeguard on the audio-upload side — it accepts uploads without a secret key but only from requests that include the correct preset name, and you can tighten it further in Cloudinary's preset settings (e.g. cap file size, restrict formats) if you ever see abuse.

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

**This one Browser Source is the only thing OBS needs for audio from callers.** You do **not** need to add `dashboard.html` as a second Browser Source — that wouldn't work anyway, since a separate OBS Browser Source runs its own private browser session with no login, no mic access, and no connection to what you're doing in your regular browser tab.

**How audio actually reaches the broadcast, for both call types:**
- **Voice messages:** the overlay reads the Cloudinary URL straight from Firestore and plays it itself.
- **Phone calls:** when you click **Send On Air**, the caller's browser opens a *second*, independent connection straight to `overlay.html` (separate from the one connecting them to you for screening/hold/mute). That's the connection OBS's audio mixer actually picks up.
- **Video guests:** works the same way — the guest's camera/mic connect straight to the overlay once you send them live.

**Your own voice (as the host) reaching the broadcast has nothing to do with any of this** — it's just a normal microphone input in OBS (Sources → **Audio Input Capture**, pick your mic), exactly like any stream where you talk over gameplay or footage. This dashboard never needs to inject your mic into the stream; it only sends your mic to the caller/guest so they can hear you back while you're screening or talking to them live. If you can already hear yourself on your own stream without a caller present, you're already set — nothing extra to configure for that part.

**Autoplay note:** some browser engines block audio until there's been a user interaction on the page. If audio doesn't play the first time, click once anywhere inside the OBS Browser Source preview (right-click the source → Interact) and it should unblock for the rest of the session.

---

## PART 7 — Video Guests (camera call-ins)

This is a separate feature from the phone/audio call-in: a guest's **camera and microphone** connect directly into your stream, letting you pull in video guests without any extra software (Zoom, Discord, etc.) on their end.

**How it's wired, and why it's simple:** a video guest's browser opens **two independent WebRTC connections** the moment they join:
1. A **screening connection** straight to the dashboard, so you can see and hear them before they're live.
2. An **"air" connection** straight to `overlay.html` (the same OBS Browser Source you already set up) — this one only starts carrying media once you actually send them on air.

The producer's dashboard is only ever a party to connection #1 (screening). It never touches the media that actually goes to air — it just flips a status flag in Firestore to trigger connection #2. That means:
- The guest's on-air feed reaches your stream with zero relay through the producer.
- You still get to see/hear them first, without that preview ever being what goes out live.

**Guest-side flow (`videocall.html`):**
1. Guest opens the link, taps **Start Camera & Mic**, allows access, and sees a live preview of themselves.
2. Enters name + city, taps **Join as Video Guest**.
3. Lands in a "green room" waiting screen until the producer previews and/or brings them on.

**Producer-side flow (dashboard → Video Guests tab):**
1. Incoming guest requests show up as cards with name/city.
2. Click **🔍 Preview** to open a live video/audio preview right in the dashboard — see and hear the guest, and talk back to them, before deciding anything. Your mic audio never reaches the stream through this — it's a separate connection from the "air" one.
3. From the preview panel: **🔴 Send On Air** to bring them live, **Stop Preview** to just close the preview without deciding, or **✕ Reject** to decline.
4. You can also skip straight to **Send On Air** / **✕ Reject** from the card without previewing first, if you already know the guest.
5. Only one guest can be on air at a time — sending a new one on air automatically ends whichever was previously live.
6. Click **📵 End Segment** to take the current guest off air.
7. The **Video Guests Open/Closed** toggle (top of that tab) controls whether `videocall.html` will accept new join requests at all — same idea as the phone Lines toggle, closing prompts a confirmation first.

**On stream:** the guest's video appears in a bordered box (bottom-right of the 1920×1080 canvas) with their name and an "On Air" tag, matching the rest of the overlay's branding. It fades in/out automatically as guests go on and off air.

**Talkback stays on while a guest is live:** the two-way preview connection (you ↔ guest) no longer closes the moment you send them on air — it keeps running for the whole segment, so you and the guest can keep hearing each other the entire time they're live, not just during screening. If you send a guest on air straight from the queue card (without clicking Preview first), the dashboard automatically opens that same talkback connection for you. To stop hearing/talking to a live guest without taking them off air, use "🔇 Disconnect Talkback" in the preview panel — that only affects your own monitoring, it's a separate connection from what's actually on the stream. (The audio call-in feature has always worked this way — one connection the whole time, from answer through on-air — this update just brings video guests in line with it.)

**Limits to know about:** this uses direct peer-to-peer WebRTC (the same STUN/TURN setup as the audio call-in), so it works well for one guest at a time without a media server. It hasn't been built for multiple simultaneous video guests. The screening/talkback connection is two-way audio — when it connects, the dashboard also asks for your own mic so the guest can hear you back (a "🎧 the host can hear you and is talking back" badge shows on their screen when that's active). If you deny mic access, or your browser blocks it, the preview still works, just one-way — you'll see/hear the guest, but they won't hear you. A "🎙️ Mute My Mic" button in the preview panel lets you silence yourself without disconnecting (handy if you need to talk to someone else in the room). If you want multi-guest support later, that's a bigger addition — ask when you're ready.

---

## PART 8 — Kick integration

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
- **You can hear an on-air caller/guest but the stream can't:** almost always the Firestore rules — make sure the `airCallerCandidates`/`airOverlayCandidates` (phone calls) and `callerCandidates`/`overlayCandidates` (video guests) subcollections from Part 3a are published. Without them, the caller's browser can't finish connecting to `overlay.html`, even though your own screening connection to them works fine.

---

## Future additions (already designed for, not yet built)

The data model (`hotlineMessages` collection with `status: pending/approved`) is built to extend cleanly. When you're ready, I can add:
- Song request flagging/sorting separate from general shoutouts
- Birthday/dedication message types with their own overlay styling
- Subscriber/VIP priority sorting in the queue
- WebRTC live call-ins
- AI transcription (Firebase Cloud Functions + a speech-to-text API) with keyword search across transcripts

Just bring this project back up and I'll build directly on top of what's already deployed.
