import { summarizeSourceOnlyExceptions } from "./healthMandatoryTrainingAnalysis.js";
import {
  HEALTH_TRAINING_TASK_ID,
  exceptionDocumentId,
  validateSourceOnlyException,
} from "./healthMandatoryTrainingExceptions.js";

export function planLegacyExceptionMigration({ legacyValues, sourceRows, directory, storedRecords = [], year = 2026 }) {
  const legacy = summarizeSourceOnlyExceptions(legacyValues, year);
  const conflicts = [];
  const candidates = [];
  const seenIds = new Set();
  const existingIds = new Set(storedRecords.map((record) => record.id));

  if (legacy.headerInfo.parseStatus !== "success") {
    return { legacy, candidates, conflicts: [{ row: 1, code: "header_not_found" }] };
  }

  for (let index = 0; index < legacy.rows.length; index += 1) {
    const row = legacy.rows[index];
    const sheetRow = row.sheetRow;
    try {
      const validated = validateSourceOnlyException({
        year: row.year,
        sourceName: row.realName,
        sourcePosition: row.position,
        reason: row.reason,
        confirmationStatus: row.confirmationStatus,
        note: legacyValues[sheetRow - 1]?.[legacy.headerInfo.indexes.note] || "",
      }, sourceRows, directory);
      const id = exceptionDocumentId(validated.year, validated.sourceName, validated.sourcePosition);
      if (seenIds.has(id) || existingIds.has(id)) {
        conflicts.push({ row: sheetRow, code: "duplicate_or_existing" });
        continue;
      }
      seenIds.add(id);
      candidates.push({
        id,
        data: {
          taskId: HEALTH_TRAINING_TASK_ID,
          identityType: "source_only_exact",
          year: validated.year,
          sourceName: validated.sourceName,
          sourceTitle: validated.sourcePosition,
          exceptionReason: validated.reason,
          confirmationStatus: validated.confirmationStatus,
          note: validated.note,
          staffId: null,
          legacySourceOnly: true,
          sourceRow: validated.sourceRow,
          sourceFingerprint: validated.sourceFingerprint,
          legacySource: "mandatory_training_exception_sheet_2026",
          originalSheetName: "법정의무연수_예외",
          active: true,
          legacy: {
            sourceSheet: "법정의무연수_예외",
            sourceRow: sheetRow,
            confirmationStatus: row.confirmationStatus,
          },
        },
      });
    } catch {
      conflicts.push({ row: sheetRow, code: "identity_or_value_not_verified" });
    }
  }

  return { legacy, candidates, conflicts };
}
