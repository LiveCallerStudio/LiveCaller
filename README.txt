LIVE CALLER STUDIO — HOME, DASHBOARD & AUDIO DOWNLOAD FIX

Included files:
- index.html: lightweight root redirect to home.html
- home.html: landing page with stale manifest/icon/service-worker references removed
- dashboard.html: optimized producer dashboard, realtime message inbox, WAV/MP3 conversion buttons
- overlay.html: OBS overlay
- call.html: existing live call module
- voicemessage.html: existing voice message recording/submission module

DEPLOY
1. Back up the current hosted files first.
2. Upload the included files to the same directory as your existing site.
3. Replace dashboard.html with the included optimized dashboard.html (renamed from dashboard_optimized.html).
4. Open the site on desktop, sign into the same producer account used on mobile, and watch the inbox status.
5. The inbox now reads the hotlineMessages collection without an orderBy constraint so older messages without createdAt are not silently excluded. If Firestore denies access, the inbox displays an explicit error.
6. Each message offers WAV and MP3 buttons. WAV conversion is built in. MP3 conversion loads lamejs from cdnjs on first use; if that CDN is unavailable, use WAV.
7. WAV/MP3 conversion requires the audio host to allow browser CORS requests. If conversion reports a CORS/fetch error, configure the Cloudinary delivery resource to permit cross-origin GET from your website domain, or serve audio through a same-origin endpoint.
8. Refresh the OBS Browser Source after deploying overlay.html.

NOTES
- This package does not contain videocall.html because it was not among the provided project files. If the deployed site has no such file, the Video Guest homepage link will still need its existing module restored or supplied.
- Live Firebase rules, user permissions, Cloudinary CORS, and OBS playback cannot be certified without testing against the deployed services.
