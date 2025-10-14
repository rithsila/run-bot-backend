// src/common/persist-image.service.ts
import { Injectable } from "@nestjs/common";
import { initCloudinary } from "./cloudinary";

function isHttpUrl(u: string) {
  try {
    const url = new URL(u);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

@Injectable()
export class PersistImageService {
  private cloudinary = initCloudinary();

  /** Upload any remote image URL to Cloudinary and return the secure_url */
  async uploadFromUrl(remoteUrl: string, opts?: { folder?: string; publicId?: string }) {
    if (!remoteUrl || !isHttpUrl(remoteUrl)) {
      throw new Error("Invalid image URL");
    }

    // Fetch the bytes (don’t rely on Cloudinary to pull; some hosts require UA)
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 15_000);

    const res = await fetch(remoteUrl, {
      cache: "no-store",
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0", Accept: "image/*,*/*;q=0.8" },
      signal: controller.signal,
    }).catch((e) => {
      clearTimeout(id);
      throw e;
    });
    clearTimeout(id);

    if (!res || !res.ok) {
      throw new Error(`Fetch failed: ${res?.status} ${res?.statusText}`);
    }

    const ct = res.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) {
      // You can still try to upload, but better to guard.
      throw new Error(`Not an image: ${ct}`);
    }

    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    const { folder = "analyze-news", publicId } = opts ?? {};

    return new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
      const upload = this.cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: publicId,
          resource_type: "image",
          // keep thumbnails reasonable
          transformation: [{ width: 1280, height: 720, crop: "fill", gravity: "auto" }],
          overwrite: true,
        },
        (err, result) => {
          if (err || !result) return reject(err ?? new Error("Upload failed"));
          resolve({ secure_url: result.secure_url!, public_id: result.public_id! });
        }
      );
      upload.end(buffer);
    });
  }
}
