import { describe, expect, it } from "vitest";
import { memoryStorage, s3Storage, type Storage } from "../src/storage";

async function roundTrip(s: Storage) {
  const key = `test/${Date.now()}-a b.bin`;
  const bytes = new Uint8Array([0, 1, 2, 250, 255]);
  await s.put(key, bytes, "application/octet-stream");
  expect(await s.get(key)).toEqual(bytes);
  await s.delete(key);
  expect(await s.get(key)).toBeNull();
  await expect(s.delete(key)).resolves.toBeUndefined();
}

it("memory storage round-trips bytes", () => roundTrip(memoryStorage()));

describe.skipIf(!process.env.TEST_S3_ENDPOINT)("s3 storage", () => {
  it("s3 storage round-trips bytes", () => roundTrip(s3Storage({
    endpoint: process.env.TEST_S3_ENDPOINT!, bucket: process.env.TEST_S3_BUCKET ?? "cherry",
    accessKey: process.env.TEST_S3_ACCESS_KEY ?? "rustfsadmin", secretKey: process.env.TEST_S3_SECRET_KEY ?? "rustfsadmin",
    region: process.env.TEST_S3_REGION ?? "us-east-1",
  })));
});
