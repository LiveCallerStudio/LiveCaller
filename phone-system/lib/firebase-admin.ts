import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let app: App;
function getAdminApp(): App {
  if (getApps().length) return getApps()[0];
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!encoded) throw new Error("FIREBASE_SERVICE_ACCOUNT_BASE64 is not configured.");
  let serviceAccount: Record<string, unknown>;
  try { serviceAccount = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")); }
  catch { throw new Error("FIREBASE_SERVICE_ACCOUNT_BASE64 is not valid base64-encoded service-account JSON."); }
  app = initializeApp({ credential: cert(serviceAccount as Parameters<typeof cert>[0]), projectId: process.env.FIREBASE_PROJECT_ID });
  return app;
}
export function adminDb(): Firestore { return getFirestore(getAdminApp()); }