import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectDatabaseEmulator, getDatabase } from "firebase/database";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";

const env = import.meta.env;
const useEmulators = env.VITE_USE_EMULATORS === "true";
const projectId = env.VITE_FIREBASE_PROJECT_ID || (useEmulators ? "demo-dnd-kanata" : undefined);
const databaseURL =
  env.VITE_FIREBASE_DATABASE_URL || (useEmulators ? `http://127.0.0.1:9000?ns=${projectId}` : undefined);

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY || (useEmulators ? "demo-key" : undefined),
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId,
  databaseURL,
  appId: env.VITE_FIREBASE_APP_ID,
});

export const auth = getAuth(app);
export const db = getDatabase(app);
export const functions = getFunctions(app, "asia-northeast1");

if (useEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectDatabaseEmulator(db, "127.0.0.1", 9000);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
