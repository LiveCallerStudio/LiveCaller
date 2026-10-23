# Private video guest screening — Firebase setup

This is an addendum to current Firestore rules, not a replacement. Preserve existing producer-only dashboard permissions and current `liveCalls` / ICE signaling rules.

## 1. Enable anonymous sign-in

In Firebase Console → Authentication → Sign-in method, enable **Anonymous**. The video caller page uses this identity to bind a screening session to the guest who created the call.

## 2. Update the existing `liveCalls` create rule

The video caller now includes `guestUid` in its new `liveCalls` document. Update the existing create-field allowlist to include it and require:

```javascript
request.auth != null
&& request.resource.data.guestUid == request.auth.uid
```

Keep existing validation for caller name, call type, status, timestamps, and offer. Do not allow callers to set producer-controlled status to `live`, `answered`, or `held`.

The existing producer update rule must permit the producer to set `screeningSessionId` while the parent call remains `waiting`. Do not permit a guest to set this field.

## 3. Add scoped rules for private screening signaling

Inside the existing `match /databases/{database}/documents` block, adapt the producer helper name below to the helper already used by your rules. This example assumes `isProducer()` exists and that the parent call's `guestUid` is the authenticated guest.

```javascript
match /liveCalls/{callId}/screeningSessions/{sessionId} {
  function parentCall() {
    return get(/databases/$(database)/documents/liveCalls/$(callId)).data;
  }
  function isThisGuest() {
    return request.auth != null && parentCall().guestUid == request.auth.uid;
  }
  function isWaiting() {
    return parentCall().status == 'waiting';
  }

  allow read: if isProducer() || isThisGuest();

  allow create: if isProducer() && isWaiting()
    && request.resource.data.keys().hasOnly([
      'client', 'producerUid', 'createdAt', 'offer', 'mediaType'
    ])
    && request.resource.data.client == 'dashboard-screen'
    && request.resource.data.producerUid == request.auth.uid
    && request.resource.data.createdAt is number
    && request.resource.data.mediaType == 'video'
    && request.resource.data.offer is map
    && request.resource.data.offer.type == 'offer'
    && request.resource.data.offer.sdp is string;

  allow update: if isProducer()
    || (isThisGuest() && isWaiting()
      && resource.data.client == 'dashboard-screen'
      && request.resource.data.diff(resource.data).affectedKeys()
          .hasOnly(['answer', 'answeredBy', 'answeredAt'])
      && request.resource.data.answeredBy == request.auth.uid
      && request.resource.data.answer.type == 'answer'
      && request.resource.data.answer.sdp is string
      && request.resource.data.answeredAt is number);

  allow delete: if isProducer();

  match /producerCandidates/{candidateId} {
    allow read: if isProducer() || isThisGuest();
    allow create: if isProducer() && isWaiting();
    allow update, delete: if false;
  }
  match /guestCandidates/{candidateId} {
    allow read: if isProducer() || isThisGuest();
    allow create: if isThisGuest() && isWaiting();
    allow update, delete: if false;
  }
}
```

Firestore rules are not filters. Test producer and guest separately in Rules Playground or Emulator. Confirm an unrelated anonymous user cannot read a call/session, create a session, write ICE candidates, or change call status.

## 4. Smoke test

1. Open `videocall.html` in a guest browser and allow camera/microphone.
2. In the dashboard Calls tab, click **Screen Guest** on a video caller.
3. Confirm dashboard video appears and says **Private Guest Screening — Not On Air**.
4. Preview audio starts muted; enable it only when needed.
5. Click **Stop Screening** and confirm the guest returns to waiting.
6. Start screening again, then click **Answer**. Confirm the private peer closes and the normal call connection takes over.
7. Use **Send On Air** only after answering; confirm OBS uses its separate relay.
8. Test Wi-Fi-to-cellular and cellular-to-Wi-Fi.
