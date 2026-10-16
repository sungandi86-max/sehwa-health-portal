import { firestoreResource } from "../../common/firestoreResources.js";

export function clientFirestoreResource(db, key) {
  const policy = typeof __FIREBASE_RUNTIME_POLICY__ === "undefined"
    ? { environment: "unknown" } : __FIREBASE_RUNTIME_POLICY__;
  return firestoreResource(policy, db, key);
}
