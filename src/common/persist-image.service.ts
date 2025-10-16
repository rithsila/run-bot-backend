// src/common/persist-image.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { initCloudinary } from "./cloudinary";
import { PassThrough } from "stream";
import { createHash } from "crypto";

const OWN_CDN_HOSTS = new Set<string>([
  "res.cloudinary.com",
  "cdn.yourdomain.com",
]);

function isHttpUrl(u: string) {
  try {
    const url = new URL(u);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// Up to 8MB for thumbs; tune as you need
const MAX_BYTES = 8 * 1024 * 1024;

// Shared headers that pass most CDNs
const BASE_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
};

@Injectable()
export class PersistImageService {
  private cloudinary = initCloudinary();
  private readonly log = new Logger(PersistImageService.name);

  /**
   * Persist an image by URL to Cloudinary, returning { secure_url, public_id }.
   * - Auto-skips if already on our CDN.
   * - Tries with Referer and without (some sites require / forbid it).
   * - Streams upload (low memory), enforces MAX_BYTES.
   */
  async uploadFromUrl(
    remoteUrl: string,
    opts?: { folder?: string; publicIdPrefix?: string; overwrite?: boolean }
  ): Promise<{ secure_url: string; public_id: string }> {
    if (!remoteUrl || !isHttpUrl(remoteUrl)) throw new Error("Invalid image URL");

    // Skip if already persisted on our CDN
    try {
      const u = new URL(remoteUrl);
      if (OWN_CDN_HOSTS.has(u.hostname)) {
        return { secure_url: remoteUrl, public_id: "" };
      }
    } catch {}

    const { folder = "analyze-news", publicIdPrefix, overwrite = true } = opts ?? {};

    // Strategy A: with Referer (origin)
    // Strategy B: without Referer
    const strategies: Array<{ name: string; headers: Record<string, string> }> = [];
    try {
      const origin = new URL(remoteUrl).origin;
      strategies.push({ name: "with-referer", headers: { ...BASE_HEADERS, Referer: origin } });
    } catch {
      // ignore if URL parsing failed earlier
    }
    strategies.push({ name: "no-referer", headers: { ...BASE_HEADERS } });

    let lastErr: any = null;

    for (const s of strategies) {
      try {
        const got = await this.fetchImageAsBuffer(remoteUrl, s.headers);
        const publicId = this.makePublicId(remoteUrl, got.buffer, publicIdPrefix);
        return await this.uploadBufferToCloudinaryStream(
          got.buffer,
          {
            folder,
            public_id: publicId,
            resource_type: "image",
            overwrite,
            // keep thumbs in check; comment this out if you want originals
            transformation: [{ width: 1280, height: 720, crop: "fill", gravity: "auto" }],
          }
        );
      } catch (e) {
        lastErr = e;
        this.log.warn(`[uploadFromUrl] ${s.name} failed for ${remoteUrl}: ${String(e)}`);
        // continue to next strategy
      }
    }

    throw lastErr ?? new Error("UPLOAD_FAILED");
  }

  private async fetchImageAsBuffer(url: string, headers: Record<string, string>) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    try {
      const res = await fetch(url, {
        redirect: "follow",
        cache: "no-store",
        headers,
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
      }

      // Quick content-type guard
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (!ct.startsWith("image/")) throw new Error(`Not an image: ${ct || "unknown"}`);

      // Size guard (Content-Length if present)
      const cl = res.headers.get("content-length");
      if (cl && Number(cl) > MAX_BYTES) {
        throw new Error(`Image too large: ${cl} bytes`);
      }

      // Read stream with size cap
      const reader = res.body?.getReader?.();
      if (!reader) {
        // Fallback to arrayBuffer for environments without streaming reader
        const arr = await res.arrayBuffer();
        if (arr.byteLength > MAX_BYTES) throw new Error(`Image too large: ${arr.byteLength} bytes`);
        return { buffer: Buffer.from(arr), contentType: ct };
      }

      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > MAX_BYTES) {
            reader.cancel();
            throw new Error(`Image too large (>${MAX_BYTES} bytes)`);
          }
          chunks.push(value);
        }
      }
      const buffer = Buffer.concat(chunks.map(u8 => Buffer.from(u8)));
      return { buffer, contentType: ct };
    } finally {
      clearTimeout(timeout);
    }
  }

  private makePublicId(srcUrl: string, buf: Buffer, prefix?: string) {
    const sha = createHash("sha1").update(srcUrl).update(buf).digest("hex").slice(0, 16);
    return prefix ? `${prefix}_${sha}` : sha;
  }

  private uploadBufferToCloudinaryStream(
    buffer: Buffer,
    params: {
      folder: string;
      public_id: string;
      resource_type: "image";
      overwrite: boolean;
      transformation?: any;
    }
  ): Promise<{ secure_url: string; public_id: string }> {
    return new Promise((resolve, reject) => {
      const pass = new PassThrough();
      const stream = this.cloudinary.uploader.upload_stream(
        params,
        (err, result) => {
          if (err || !result) return reject(err ?? new Error("Upload failed"));
          resolve({ secure_url: result.secure_url!, public_id: result.public_id! });
        }
      );
      pass.end(buffer);
      pass.pipe(stream);
    });
  }
}
