# Anonymous authentication for video callers

## Why this change exists

The Firestore rules proposal requires video call documents to include a `guestUid` matching the caller's authenticated Firebase UID. The public `call.html` page previously created video call documents without establishing that identity, so the stricter rule would reject those calls.

## User experience

- Audio calls remain unauthenticated and do not include `guestUid`.
- Video calls silently use Firebase Anonymous Authentication before requesting camera/microphone access and creating the call document.
- Callers do not create a password, register, or manually sign in.
- If anonymous sign-in is disabled or fails, the page shows a clear error instead of creating a video call that Firestore rules will reject.

## Firebase setup required

In Firebase Console, open **Authentication → Sign-in method** and enable **Anonymous**. This is a project configuration prerequisite; this code change does not modify Firebase settings or deploy Firestore rules.

## Validation

The `tests/call-anonymous-video-auth.test.mjs` regression test checks that:
1. Firebase Auth's anonymous sign-in API is imported and awaited.
2. Video authentication happens before media capture and call creation.
3. The authenticated UID is written only to video call documents, preserving the audio flow.

These source-level tests do not replace Firestore Emulator Suite tests or an end-to-end call with a real producer dashboard and OBS Browser Source.
