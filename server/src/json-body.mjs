export const DEFAULT_MAX_JSON_BODY_BYTES = 16_384;

export function readJsonBody(req, maxBytes = DEFAULT_MAX_JSON_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        const err = new Error("payload_too_large");
        err.code = "PAYLOAD_TOO_LARGE";
        req.destroy(err);
        reject(err);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}
