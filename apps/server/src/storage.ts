import { AwsClient } from "aws4fetch";
import type { Config } from "./config";

export type Storage = {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
};

export type MemoryStorage = Storage & { keys(): string[] };

export function memoryStorage(): MemoryStorage {
  const m = new Map<string, Uint8Array>();
  return {
    async put(key, body) { m.set(key, body.slice()); },
    async get(key) { return m.get(key)?.slice() ?? null; },
    async delete(key) { m.delete(key); },
    keys: () => [...m.keys()], // test-only: lets tests assert that nothing was stored
  };
}

export function s3Storage(cfg: Config["s3"]): Storage {
  const client = new AwsClient({ accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey, region: cfg.region, service: "s3" });
  const url = (key: string) => `${cfg.endpoint.replace(/\/+$/, "")}/${cfg.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const fail = async (what: string, res: Response) => {
    throw new Error(`S3 ${what} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  };
  return {
    async put(key, body, contentType) {
      const res = await client.fetch(url(key), { method: "PUT", body: body as BodyInit, headers: { "content-type": contentType } });
      if (!res.ok) await fail("put", res);
    },
    async get(key) {
      const res = await client.fetch(url(key));
      if (res.status === 404) return null;
      if (!res.ok) await fail("get", res);
      return new Uint8Array(await res.arrayBuffer());
    },
    async delete(key) {
      const res = await client.fetch(url(key), { method: "DELETE" });
      if (!res.ok && res.status !== 404) await fail("delete", res);
    },
  };
}

export function createStorage(cfg: Config["s3"]): Storage {
  return cfg.endpoint === "memory:" ? memoryStorage() : s3Storage(cfg);
}
