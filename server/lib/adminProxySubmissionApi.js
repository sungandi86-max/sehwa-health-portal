import { proxySubmissionCollection } from "./adminProxySubmission.js";
import { verifyDirectoryAdmin } from "./staffDirectory.js";
import { trainingEnvironment } from "./trainingDeployment.js";

function iso(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

function publicItem(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    ...data,
    submittedAt: iso(data.submittedAt),
    updatedAt: iso(data.updatedAt),
    proxyRegisteredAt: iso(data.proxyRegisteredAt),
  };
}

export async function handleAdminProxySubmissionsResource(req, res, {
  verifyAdmin = verifyDirectoryAdmin,
  environment = trainingEnvironment,
  context = process.env,
} = {}) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, message: "지원하지 않는 요청입니다." });
  }
  const access = await verifyAdmin(req);
  if (!access.ok) return res.status(access.status).json({ ok: false, message: access.message });

  const collectionName = proxySubmissionCollection(environment(context));
  const snapshot = await access.db.collection(collectionName)
    .where("submissionMode", "==", "admin_proxy")
    .limit(50)
    .get();
  const items = snapshot.docs.map(publicItem)
    .sort((left, right) => String(right.submittedAt || "").localeCompare(String(left.submittedAt || "")));
  return res.status(200).json({ ok: true, items });
}
