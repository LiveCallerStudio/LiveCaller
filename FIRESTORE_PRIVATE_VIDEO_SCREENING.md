# Private video guest screening — Firebase setup

These instructions are tailored to the current Live Caller Studio code and the Firestore rules supplied for review. This is an addendum, not a replacement for the existing rules. The current app uses `liveCalls/{callId}` for both audio and video calls; private screening is stored under `liveCalls/{callId}/screeningSessions/{sessionId}`. The separate `videoCalls` match in the supplied rules is not used by this feature.

## 1. Enable anonymous authentication

In Firebase Console → Authentication → Sign-in method, enable **Anonymous**. The video caller signs in anonymously before creating a video call. Audio callers do not need anonymous authentication.

## 2. Extend the existing `validAudioCall(d)` validator

The function currently rejects `guestUid` and `screeningSessionId` because they are absent from its `keys().hasOnly([...])` list. Add both fields to that allowlist:

```javascript
'guestUid','screeningSessionId'
```

Then add these checks inside `validAudioCall(d)`:

```javascript
(!('guestUid' in d) ||
  (d.guestUid is string && d.guestUid.size() <= 128)) &&
optString(d, 'screeningSessionId', 150) &&
```

Keep the existing `offer`, `status`, timestamp, and other field validations intact. The name `validAudioCall` is historical: it validates the shared `liveCalls` document for audio and video.

## 3. Bind video call creation to the anonymous guest

In `match /liveCalls/{callId}`, keep the existing create checks and add the following condition to the `allow create` expression after `!('answer' in request.resource.data)` (or equivalently as another `&&` condition):

```javascript
(
  request.resource.data.mediaType == 'video'
    ? (request.auth != null &&
       request.resource.data.guestUid == request.auth.uid)
    : !('guestUid' in request.resource.data)
)
```

The existing caller page sends `mediaType: 'audio'` or `mediaType: 'video'`; it sends `guestUid` only for video calls. This preserves audio call creation while requiring video calls to be tied to their authenticated anonymous UID. Do not let a public caller choose producer-controlled statuses such as `live`, `answered`, or `held`.

## 4. Add the private screening rules under `match /liveCalls/{callId}`

Place this nested match inside the existing `match /liveCalls/{callId}` block. Do not place it under `/videoCalls`.

```javascript
match /screeningSessions/{sessionId} {
  function isThisGuest() {
    return request.auth != null &&
      get(/databases/$(database)/documents/liveCalls/$(callId))
        .data.guestUid == request.auth.uid;
  }
  function parentCallIsWaiting() {
    return get(/databases/$(database)/documents/liveCalls/$(callId))
      .data.status == 'waiting';
  }

  allow read: if isProducer() || isThisGuest();

  // Matches the dashboard's actual setDoc payload.
  allow create: if isProducer() &&
    parentCallIsWaiting() &&
    request.resource.data.keys().hasAll([
      'offer', 'client', 'producerUid', 'createdAt', 'mediaType'
    ]) &&
    request.resource.data.keys().hasOnly([
      'offer', 'client', 'producerUid', 'createdAt', 'mediaType'
    ]) &&
    rtc(request.resource.data.offer, 'offer') &&
    request.resource.data.client == 'dashboard-screen' &&
    request.resource.data.producerUid == request.auth.uid &&
    request.resource.data.createdAt is number &&
    request.resource.data.mediaType == 'video';

  // The guest can add only its own answer; the producer may manage the session.
  allow update: if isProducer() ||
    (isThisGuest() &&
      parentCallIsWaiting() &&
      resource.data.client == 'dashboard-screen' &&
      request.resource.data.diff(resource.data)
        .affectedKeys().hasOnly(['answer', 'answeredBy', 'answeredAt']) &&
      request.resource.data.keys().hasAll([
        'offer', 'client', 'producerUid', 'createdAt', 'mediaType',
        'answer', 'answeredBy', 'answeredAt'
      ]) &&
      rtc(request.resource.data.answer, 'answer') &&
      request.resource.data.answeredBy == request.auth.uid &&
      request.resource.data.answeredAt is number);

  allow delete: if isProducer();

  match /producerCandidates/{candidateId} {
    allow read: if isProducer() || isThisGuest();
    allow create: if isProducer() &&
      parentCallIsWaiting() &&
      validCandidate();
    allow update, delete: if false;
  }

  match /guestCandidates/{candidateId} {
    allow read: if isProducer() || isThisGuest();
    allow create: if isThisGuest() &&
      parentCallIsWaiting() &&
      validCandidate();
    allow update, delete: if false;
  }
}
```

The guest answer update above preserves the existing session fields and limits the guest's changed fields to the answer and its attribution/timestamp. The existing producer update rule for `liveCalls` must permit the producer to set or clear `screeningSessionId`; adding that field to `validAudioCall` allows validation to pass. Only the producer should set that field.

## 5. Test before deploying

Use the Firebase Emulator or Rules Playground to test with separate producer and guest identities:

1. A video guest can create a waiting `liveCalls` document only when `guestUid == request.auth.uid`.
2. Audio call creation still works without `guestUid`.
3. The producer can create a screening session only while the parent call is waiting.
4. Only the matching guest can read that session, answer it, and create `guestCandidates`.
5. An unrelated anonymous user cannot read the session, answer it, or write either candidate collection.
6. A guest cannot change the parent call's `status`, `screeningSessionId`, or producer-controlled fields.
7. Existing audio calls, the normal video answer flow, and the separate OBS overlay relay still work.

Firestore rules are not filters. The existing parent `liveCalls` rule currently allows public reads; this addendum does not change that broader existing policy. Review that exposure separately before production if caller metadata should be private.

## 6. Smoke test the app

1. Open `videocall.html` and start a video call, granting camera/microphone access.
2. In the producer dashboard, click **Screen Guest** on that waiting video call.
3. Confirm the dashboard shows **Private preview connected. Guest is not on air**.
4. Preview audio starts muted; enable it only when needed.
5. Click **Stop Screening** and confirm the guest returns to waiting.
6. Start screening again, then click **Answer**. Confirm the private peer closes and the normal call connection takes over.
7. Use **Send On Air** only after answering; confirm OBS still uses its separate relay.
8. Test Wi-Fi-to-cellular and cellular-to-Wi-Fi.
