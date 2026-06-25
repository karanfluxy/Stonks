import admin from "firebase-admin";

import { loadServerEnvOnce } from "./loadEnv";

loadServerEnvOnce();

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

export const isFirebaseAdminConfigured = Boolean(
  projectId && clientEmail && privateKey
);

export function getAdminAuth() {
  if (!isFirebaseAdminConfigured) {
    return null;
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  return admin.auth();
}
