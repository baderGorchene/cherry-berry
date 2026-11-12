export class IngestError extends Error {
  constructor(public code: "unsupported_type" | "invalid_image" | "too_large" | "busy", message: string = code) {
    super(message);
  }
}
