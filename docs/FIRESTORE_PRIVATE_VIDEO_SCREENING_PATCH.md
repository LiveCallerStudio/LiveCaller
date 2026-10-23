# Private video guest screening — Firestore rules patch

This patch guide matches the current dashboard.html and videocall.html implementation on main. Both pages use:

- Parent call: /liveCalls/{callId}
- Private session: /liveCalls/{callId}/screeningSessions/{sessionId}
- Producer ICE: producerCandidates
- Guest ICE: guestCandidates

The existing Firebase Console rules currently protect /videoCalls/{callId}/screeningSessions, which is a different path. The dashboard also writes offer and mediaType into the session document, which the current create rule rejects. Video guest call creation writes guestUid and mediaType: 'video' into /liveCalls, which the current validAudioCall allowlist rejects.

**Do not replace the entire rules file with this guide.** Apply only the edits below to the existing rules, then test in the Rules Playground or Emulator before publishing.

## 1. Extend validAudioCall(d)

In the d.keys().hasOnly([...]) list inside validAudioCall, add these two fields:

~~~rules
'guestUid','screeningSessionId'
~~~

Add these validations near the other optional field validations inside the same function:

~~~rules
(!('guestUid' in d) ||
  (d.guestUid is string && d.guestUid.size() <= 128)) &&
optString(d,'screeningSessionId',150) &&
~~~

Keep the existing validation of all other fields.

## 2. Replace the allow create rule under match /liveCalls/{callId}

Replace only the current allow create line/block with:

~~~rules
allow create: if
  validAudioCall(request.resource.data) &&
  request.resource.data.status == 'waiting' &&
  !('answer' in request.resource.data) &&
  (
    (
      request.resource.data.mediaType == 'video' &&
      request.auth != null &&
      request.resource.data.guestUid == request.auth.uid &&
      videoLineOpen()
    ) ||
    (
      (!('mediaType' in request.resource.data) ||
        request.resource.data.mediaType == 'audio') &&
      !('guestUid' in request.resource.data) &&
      phoneLineOpen()
    )
  );
~~~

This keeps audio call-ins public as before, but requires an authenticated anonymous Firebase user whose UID matches guestUid for video calls. It also checks the appropriate open/closed toggle.

## 3. Add the private screening rules inside match /liveCalls/{callId}

Insert this block inside the existing match /liveCalls/{callId} block, alongside the other nested matches (for example, before match /overlaySessions/{sessionId}). Do not put it inside /videoCalls.

~~~rules
match /screeningSessions/{sessionId} {
  function isThisGuest() {
    return request.auth != null &&
      get(
        /databases/$(database)/documents/liveCalls/$(callId)
      ).data.guestUid == request.auth.uid;
  }

  function parentCallIsWaitingVideo() {
    return get(
      /databases/$(database)/documents/liveCalls/$(callId)
    ).data.status == 'waiting' &&
    get(
      /databases/$(database)/documents/liveCalls/$(callId)
    ).data.mediaType == 'video';
  }

  allow read: if isProducer() || isThisGuest();

  // Only the producer may create a preview offer for a waiting video guest.
  allow create: if isProducer() &&
    parentCallIsWaitingVideo() &&
    request.resource.data.keys().hasAll([
      'offer','client','producerUid','createdAt','mediaType'
    ]) &&
    request.resource.data.keys().hasOnly([
      'offer','client','producerUid','createdAt','mediaType'
    ]) &&
    rtc(request.resource.data.offer,'offer') &&
    request.resource.data.client == 'dashboard-screen' &&
    request.resource.data.producerUid == request.auth.uid &&
    request.resource.data.createdAt is number &&
    request.resource.data.mediaType == 'video';

  // Guest can submit only the answer for its own pending call.
  allow update: if isProducer() ||
    (
      isThisGuest() &&
      parentCallIsWaitingVideo() &&
      resource.data.client == 'dashboard-screen' &&
      request.resource.data.diff(resource.data)
        .affectedKeys().hasOnly(['answer','answeredBy','answeredAt']) &&
      request.resource.data.keys().hasAll([
        'offer','client','producerUid','createdAt','mediaType',
        'answer','answeredBy','answeredAt'
      ]) &&
      rtc(request.resource.data.answer,'answer') &&
      request.resource.data.answeredBy == request.auth.uid &&
      request.resource.data.answeredAt is number
    );

  allow delete: if isProducer();

  match /producerCandidates/{candidateId} {
    allow read: if isProducer() || isThisGuest();
    allow create: if isProducer() &&
      parentCallIsWaitingVideo() &&
      validCandidate();
    allow update, delete: if false;
  }

  match /guestCandidates/{candidateId} {
    allow read: if isProducer() || isThisGuest();
    allow create: if isThisGuest() &&
      parentCallIsWaitingVideo() &&
      validCandidate();
    allow update, delete: if false;
  }
}
~~~

## 4. Preserve the existing /videoCalls rules

Do not delete or loosen the existing /videoCalls matches or overlay-session rules as part of this patch. They may be used by another feature or an older build. This change adds the rules for the actual /liveCalls path used by the current screening code.

## 5. Test before publishing

Use Firebase Emulator Suite if available. Otherwise use the Firestore Rules Playground with authenticated producer and guest contexts. Test these cases:

1. Anonymous audio caller can create a waiting audio call while the phone line is open.
2. Video guest can create a waiting video call only when signed in anonymously and guestUid equals that user's UID.
3. Unauthenticated or mismatched-UID video create is denied.
4. Producer can create a screening session only for a waiting video call.
5. The matching guest can read that session, write its answer, and create guest ICE candidates.
6. A different authenticated user cannot read or write the private session/candidates.
7. Producer can read producer candidates and stop/clear screening.
8. Existing audio call, on-air overlay, voice-message, and hotline rules still pass their existing tests.

Important: the rules editor cannot test a complete WebRTC connection by itself. After the rules pass, test the actual browser flow with two devices/browsers. STUN/TURN reachability is a separate concern from Firestore permissions.
