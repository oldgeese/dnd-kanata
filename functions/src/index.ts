import { initializeApp } from "firebase-admin/app";

initializeApp();

// The callables must be publicly invokable on Cloud Run (they check auth themselves).
// firebase-functions ignores `invoker` for onCall, and the Firebase CLI grants allUsers
// roles/run.invoker only when it creates the function, so a function created without it
// needs: gcloud run services add-iam-policy-binding <name> --member=allUsers --role=roles/run.invoker
export { importSheet } from "./importSheet";
export { writeBack } from "./writeBack";
