# Firebase setup required for private pre-air video screening

This is an **addendum**, not a replacement for your current Firestore rules. Keep the existing producer-only dashboard rules and all existing audio-call/voice-message rules. Apply these changes only after reviewing them in Firebase Rules Playground.

## 1. Enable anonymous sign-in for video guests

Firebase Console → Authentication → Sign-in method → **Anonymous** → Enable → Save.

The video guest page now signs in anonymously before creating a video-call request and writes its authenticated UID as `guestUid`. This is what lets the rules distinguish the guest who owns a call from another public visitor.

## 2. Update the existing `videoCalls` root-create rule

The current video call create schema must add `guestUid` and require it to match the authenticated anonymous user. Preserve any existing producer read/update/delete conditions. In the existing `match /videoCalls/{callId}` block, make the create condition equivalent to:

```javascript
allow create: if request.auth != null
  && request.resource.data.keys().hasOnly([
    'callerName', 'callerCity', 'status', 'createdAt', 'guestUid'
  ])
  && request.resource.data.keys().hasAll([
    'callerName', 'status', 'createdAt', 'guestUid'
  ])
  && request.resource.data.guestUid == request.auth.uid
  && request.resource.data.status == 'waiting'
  && request.resource.data.callerName is string
  && request.resource.data.callerName.size() > 0
  && request.resource.data.callerName.size() <= 40
  && request.resource.data.createdAt is timestamp
  && (request.resource.data.callerCity == null
      || (request.resource.data.callerCity is string
          && request.resource.data.callerCity.size() <= 40));
```

Do not add a public write permission to the whole `videoCalls` collection. Do not allow anonymous users to set `status: live`.

## 3. Add this nested rule inside the existing `match /databases/{database}/documents` block

This assumes your existing top-level `isProducer()` helper is retained (the helper that checks your producer UID/custom claim). The guest UID is read from the parent call document.

```javascript
match /videoCalls/{callId}/screeningSessions/{sessionId} {
  function isThisGuest() {
    return request.auth != null
      && get(/databases/$(database)/documents/videoCalls/$(callId)).data.guestUid == request.auth.uid;
  }

  function parentCallIsWaiting() {
    return get(/databases/$(database)/documents/videoCalls/$(callId)).data.status == 'waiting';
  }

  allow read: if isProducer() || isThisGuest();

  // Only the producer can create a preview offer, and only for a waiting guest.
  allow create: if isProducer()
    && parentCallIsWaiting()
    && request.resource.data.keys().hasOnly(['client', 'producerUid', 'createdAt'])
    && request.resource.data.client == 'dashboard-screen'
    && request.resource.data.producerUid == request.auth.uid
    && request.resource.data.createdAt is number;

  allow update: if isProducer()
    || (isThisGuest()
      && parentCallIsWaiting()
      && resource.data.client == 'dashboard-screen'
      && request.resource.data.diff(resource.data).affectedKeys()
          .hasOnly(['answer', 'answeredBy', 'answeredAt'])
      && request.resource.data.answeredBy == request.auth.uid
      && request.resource.data.answer.type == 'answer'
      && request.resource.data.answeredAt is number);

  allow delete: if isProducer();

  match /producerCandidates/{candidateId} {
    allow read: if isProducer() || isThisGuest();
    allow create: if isProducer() && parentCallIsWaiting();
    allow update, delete: if false;
  }

  match /guestCandidates/{candidateId} {
    allow read: if isProducer() || isThisGuest();
    allow create: if isThisGuest() && parentCallIsWaiting();
    allow update, delete: if false;
  }
}
```

**Important:** Firestore rules are not filters. Test both the producer and an anonymous guest in Rules Playground. Confirm an unrelated anonymous UID cannot read/write a screening session, cannot create a session, and cannot set a call live. The browser UI cannot safely compensate for a rules denial.

## 4. Manual smoke test

1. Open the video guest page in a private/incognito browser and allow camera/microphone.
2. Confirm the guest enters the queue and sees their **mirrored local self-view**.
3. From the signed-in dashboard, press **Screen Guest**.
4. Confirm dashboard video appears and status says **private preview / NOT on air**.
5. Press **Stop Screening** and confirm the guest returns to queue status.
6. Start a new screening, then press **Send On Air**. Confirm the dashboard screening peer closes and OBS establishes its separate connection.
7. Test with the guest on cellular and producer on Wi-Fi, then swap networks.
8. Verify the OBS overlay still receives only the on-air call, never the private screening session.
