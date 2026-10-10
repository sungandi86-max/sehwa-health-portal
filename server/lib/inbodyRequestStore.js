import { randomUUID } from "node:crypto";
import { getFirebaseAdminDb } from "./firebaseAdmin.js";
import { submissionEnvironment } from "./submissionConfig.js";

const COLLECTIONS = Object.freeze({ qa: "inbody_requests_qa", production: "inbody_requests_production" });

export class InbodyRequestStore {
  constructor({ database = getFirebaseAdminDb, context = () => process.env, requestId = randomUUID } = {}) {
    this.database = database;
    this.context = context;
    this.requestId = requestId;
  }

  get environment() { return submissionEnvironment(this.context()); }
  get collectionName() { return COLLECTIONS[this.environment]; }
  get backend() { return this.environment === "qa" ? "firestore" : "sheet"; }

  async createRequest({ staffId, fields, now = new Date() }) {
    if (this.backend !== "firestore") throw new Error("Production 인바디 신청은 기존 Sheet 경로를 사용합니다.");
    if (!staffId) throw new Error("교직원 ID가 필요합니다.");
    const id = this.requestId();
    const request = {
      requestId: id,
      staffId,
      submittedAt: now.toISOString(),
      name: String(fields.name).trim(),
      department: String(fields.dept).trim(),
      preferredDate: String(fields.preferredDate).trim(),
      preferredTime: String(fields.preferredTime).trim(),
      status: "received",
      environment: "qa",
      sourceType: "portal",
      schemaVersion: 1,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    await this.database().collection(this.collectionName).doc(id).create(request);
    return request;
  }

  async getRequest(requestId) {
    if (this.backend !== "firestore") throw new Error("Production 관리자 조회는 기존 Sheet 경로를 사용합니다.");
    const snapshot = await this.database().collection(this.collectionName).doc(requestId).get();
    if (!snapshot.exists) return null;
    return this.readDocument(snapshot);
  }

  async listRequests() {
    if (this.backend !== "firestore") throw new Error("Production 관리자 조회는 기존 Sheet 경로를 사용합니다.");
    const snapshot = await this.database().collection(this.collectionName).get();
    return snapshot.docs.map((doc) => this.readDocument(doc))
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt) || a.requestId.localeCompare(b.requestId));
  }

  readDocument(doc) {
    const request = doc.data();
    if (request.requestId !== doc.id || request.environment !== this.environment) {
      throw new Error("인바디 신청 원장의 환경·문서 ID가 일치하지 않습니다.");
    }
    return request;
  }
}

export const inbodyRequestStore = new InbodyRequestStore();
