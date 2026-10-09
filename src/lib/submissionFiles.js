export const MAX_SUBMISSION_FILE_SIZE = 3 * 1024 * 1024;

const MAX_COMPRESSIBLE_IMAGE_SIZE = 10 * 1024 * 1024;
const FILE_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

export function validateSubmissionFile(file) {
  if (!file) return "제출할 파일을 선택해 주세요.";
  if (!FILE_TYPES.has(file.type)) return "PDF, JPG, PNG 파일만 제출할 수 있습니다.";
  if (file.size > MAX_SUBMISSION_FILE_SIZE) return "파일 크기는 3MiB 이하로 줄여 주세요.";
  return "";
}

export function validateSelectableSubmissionFile(file) {
  if (!file) return "제출할 파일을 선택해 주세요.";
  if (!FILE_TYPES.has(file.type)) return "PDF, JPG, PNG 파일만 제출할 수 있습니다.";
  if (file.type === "application/pdf" && file.size > MAX_SUBMISSION_FILE_SIZE) return "PDF는 자동 압축되지 않습니다. 3MiB 이하 파일을 선택해 주세요.";
  if (file.size > MAX_COMPRESSIBLE_IMAGE_SIZE) return "이미지가 너무 커서 압축할 수 없습니다. 10MiB 이하 파일을 선택해 주세요.";
  return "";
}

export async function prepareSubmissionFile(file) {
  const selectionError = validateSelectableSubmissionFile(file);
  if (selectionError) throw new Error(selectionError);
  if (file.size <= MAX_SUBMISSION_FILE_SIZE) return file;
  if (typeof createImageBitmap !== "function") throw new Error("이 브라우저에서는 이미지 압축을 지원하지 않습니다. 3MiB 이하 파일을 선택해 주세요.");

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    for (const [maxSide, quality] of [[2600, 0.9], [2000, 0.82], [1600, 0.72]]) {
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("이미지를 압축할 수 없습니다. 3MiB 이하 파일을 선택해 주세요.");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= MAX_SUBMISSION_FILE_SIZE) {
        const name = `${file.name.replace(/\.[^.]+$/, "")}.jpg`;
        return new File([blob], name, { type: "image/jpeg" });
      }
    }
  } catch {
    throw new Error("이미지를 압축하지 못했습니다. 3MiB 이하 파일을 선택해 주세요.");
  } finally {
    bitmap?.close();
  }
  throw new Error("압축 후에도 파일이 3MiB를 초과합니다. 더 작은 이미지를 선택해 주세요.");
}
