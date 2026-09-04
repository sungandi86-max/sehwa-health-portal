import { readStaffDirectory, sendCors, verifyDirectoryAdmin } from "../lib/staffDirectory.js";

export default async function handler(req, res) {
  sendCors(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ ok: false, message: "지원하지 않는 요청입니다." });

  try {
    const access = await verifyDirectoryAdmin(req);
    if (!access.ok) return res.status(access.status).json({ ok: false, message: access.message });

    const { directory, stats } = await readStaffDirectory();
    return res.status(200).json({ ok: true, directory, stats });
  } catch {
    return res.status(500).json({ ok: false, message: "교직원명단을 불러오지 못했습니다." });
  }
}
