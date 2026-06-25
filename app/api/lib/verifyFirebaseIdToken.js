import { createRemoteJWKSet, jwtVerify } from "jose";
import { getAdminAuth, isFirebaseAdminConfigured } from "./firebaseAdmin";
import { loadServerEnvOnce } from "./loadEnv";

const JWKS = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
  )
);

function getProjectId() {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_ADMIN_PROJECT_ID ||
    ""
  );
}

export async function verifyFirebaseIdToken(idToken) {
  loadServerEnvOnce();

  if (!idToken || typeof idToken !== "string") {
    const err = new Error("Missing idToken");
    // @ts-ignore
    err.statusCode = 400;
    throw err;
  }

  // Preferred: verify using firebase-admin (requires service account creds)
  if (isFirebaseAdminConfigured) {
    const adminAuth = getAdminAuth();
    if (adminAuth) {
      return adminAuth.verifyIdToken(idToken);
    }
  }

  // Fallback: verify JWT signature/claims via Google JWKS (no service account required)
  const projectId = getProjectId();
  if (!projectId) {
    const err = new Error(
      "Server auth is not configured. Set NEXT_PUBLIC_FIREBASE_PROJECT_ID (or FIREBASE_PROJECT_ID)."
    );
    // @ts-ignore
    err.statusCode = 500;
    throw err;
  }

  const issuer = `https://securetoken.google.com/${projectId}`;

  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer,
    audience: projectId,
  });

  // Normalize to the fields our routes use.
  return {
    uid: payload.user_id || payload.sub,
    email: payload.email || null,
    name: payload.name || null,
  };
}
