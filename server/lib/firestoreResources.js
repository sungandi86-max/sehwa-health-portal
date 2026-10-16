import { firebaseRuntimePolicy } from "../../common/firebaseEnvironment.js";
import { firestoreResource } from "../../common/firestoreResources.js";

export function serverFirestoreResource(db, key, context = process.env, requestedName) {
  return firestoreResource(firebaseRuntimePolicy(context), db, key, requestedName);
}
