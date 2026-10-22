# Security and ownership notes

## Google / Firebase API key alert

The Firebase Web API key is a browser configuration value, not an admin credential. A static site must send it to browsers, so moving it into another public JavaScript file or a GitHub Pages build variable does **not** make it secret.

Before dismissing the GitHub secret-scanning alert:

1. Open Google Cloud Console for project `djdeeze-hotline`.
2. Go to **APIs & Services → Credentials** and identify the flagged key.
3. Restrict **Application restrictions** to **Websites (HTTP referrers)** and allow only the actual Live Caller Studio origin/path and any explicitly needed development origin.
4. Restrict the key to the APIs the Firebase web app actually uses. Test sign-in, Firestore, calls, messages, and overlays after changing restrictions; don't disable an API the app needs.
5. If the key was unrestricted or used outside the intended site, create a replacement key, update the app configuration, verify the app, then disable/delete the old key.
6. Review Firebase Authentication authorized domains and Firestore rules separately. API-key restrictions do not replace authentication or database rules.
7. Return to GitHub **Security → Secret scanning → Alerts** and resolve the alert only after the key is restricted/replaced, or after confirming with Google that the finding is an expected public Firebase client key.

Do not put Firebase Admin credentials, service-account JSON, Cloudinary API secrets, or other server credentials in HTML or client-side JavaScript.

## Source and asset protection

Live Caller Studio currently uses static GitHub Pages. Any HTML, JavaScript, CSS, images, and other assets sent to a visitor's browser can be downloaded, inspected, or copied regardless of minification, obfuscation, disabled right-click, or a copyright notice.

The proprietary notice in `LICENSE` clarifies ownership and permission requirements; it is not technical copy protection. For meaningful protection:

- Keep the source repository private if you do not want people browsing or cloning the source repository.
- Understand that a public website still serves downloadable client assets, even if its source repository is private.
- Put valuable business logic and privileged operations behind an authenticated server/API; never trust a hidden front-end button as access control.
- Require Firebase Authentication and least-privilege Firestore/Storage rules for producer-only data and actions.
- Keep private keys and credentials in server-side secret storage, never in browser bundles.

No browser-only technique can guarantee that a visitor cannot reproduce a public website's visible behavior or downloaded assets.
