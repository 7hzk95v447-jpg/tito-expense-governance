type D1Database = import("@cloudflare/workers-types").D1Database;
type Fetcher = { fetch(request: Request): Promise<Response> };
interface TitoR2Object { body: ReadableStream<Uint8Array>; writeHttpMetadata(headers: Headers): void; }
interface TitoR2Bucket {
 get(key: string): Promise<TitoR2Object | null>;
 put(key: string, value: string | ArrayBuffer | ReadableStream<Uint8Array>, options?: import("@cloudflare/workers-types").R2PutOptions): Promise<unknown>;
 delete(key: string): Promise<void>;
}
declare module "cloudflare:workers" {
 export const env: { DB: D1Database; BUCKET: TitoR2Bucket; ASSETS: Fetcher; SETUP_TOKEN?: string };
}
