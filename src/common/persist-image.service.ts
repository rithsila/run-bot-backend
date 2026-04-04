// src/common/persist-image.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { AwsS3Service } from 'src/storage/aws-s3.service';

const OWN_CDN_HOSTS = new Set<string>(['cdn.yourdomain.com']);

function isHttpUrl(u: string) {
    try {
        const url = new URL(u);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

// Up to 8MB for thumbs; tune as you need
const MAX_BYTES = 8 * 1024 * 1024;

// Shared headers that pass most CDNs
const BASE_HEADERS: Record<string, string> = {
    'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
};

@Injectable()
export class PersistImageService {
    private readonly log = new Logger(PersistImageService.name);
    constructor(private readonly s3: AwsS3Service) {}

    /**
     * Persist an image by URL to Cloudinary, returning { secure_url, public_id }.
     * - Auto-skips if already on our CDN.
     * - Tries with Referer and without (some sites require / forbid it).
     * - Streams upload (low memory), enforces MAX_BYTES.
     */
    async uploadFromUrl(
        remoteUrl: string,
        opts?: {
            folder?: string;
            publicIdPrefix?: string;
            overwrite?: boolean;
        },
    ): Promise<{ secure_url: string; public_id: string }> {
        const resolvedUrl = this.unwrapProxyUrl(remoteUrl);
        if (!resolvedUrl || !isHttpUrl(resolvedUrl))
            throw new Error('Invalid image URL');

        // Skip if already persisted on our CDN
        try {
            const u = new URL(resolvedUrl);
            if (OWN_CDN_HOSTS.has(u.hostname)) {
                return { secure_url: resolvedUrl, public_id: '' };
            }
        } catch {}

        const {
            folder = 'analyze-news',
            publicIdPrefix,
            overwrite = true,
        } = opts ?? {};

        // Strategy A: with Referer (origin)
        // Strategy B: without Referer
        const strategies: Array<{
            name: string;
            headers: Record<string, string>;
        }> = [];
        try {
            const origin = new URL(resolvedUrl).origin;
            strategies.push({
                name: 'with-referer',
                headers: { ...BASE_HEADERS, Referer: origin },
            });
        } catch {
            // ignore if URL parsing failed earlier
        }
        strategies.push({ name: 'no-referer', headers: { ...BASE_HEADERS } });

        let lastErr: any = null;

        for (const s of strategies) {
            try {
                const got = await this.fetchImageAsBuffer(
                    resolvedUrl,
                    s.headers,
                );
                const publicId = this.makePublicId(
                    resolvedUrl,
                    got.buffer,
                    publicIdPrefix,
                );
                return await this.uploadBufferToS3(
                    got.buffer,
                    got.contentType,
                    folder,
                    publicId,
                );
            } catch (e) {
                lastErr = e;
                this.log.warn(
                    `[uploadFromUrl] ${s.name} failed for ${resolvedUrl}: ${String(e)}`,
                );
                // continue to next strategy
            }
        }

        throw lastErr ?? new Error('UPLOAD_FAILED');
    }

    private unwrapProxyUrl(urlStr: string): string {
        if (!urlStr) return urlStr;
        try {
            const u = new URL(urlStr);
            const host = u.hostname.toLowerCase();
            if (
                host.includes('google.') &&
                (u.pathname === '/imgres' || u.pathname === '/url')
            ) {
                const target =
                    u.searchParams.get('imgurl') ?? u.searchParams.get('url');
                if (target && isHttpUrl(target)) {
                    this.log.debug(
                        `[uploadFromUrl] unwrapped proxy url -> ${target}`,
                    );
                    return target;
                }
            }
            return urlStr;
        } catch {
            return urlStr;
        }
    }

    private async fetchImageAsBuffer(
        url: string,
        headers: Record<string, string>,
        depth = 0,
    ): Promise<{ buffer: Buffer; contentType: string }> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20_000);

        try {
            const res = await fetch(url, {
                redirect: 'follow',
                cache: 'no-store',
                headers,
                signal: controller.signal,
            });

            if (!res.ok) {
                throw new Error(
                    `Fetch failed: ${res.status} ${res.statusText}`,
                );
            }

            // Quick content-type guard
            const ct = (res.headers.get('content-type') || '').toLowerCase();
            if (!ct.startsWith('image/')) {
                if (ct.includes('text/html') && depth < 2) {
                    const html = await res.text();
                    const candidate = this.extractImageFromHtml(
                        html,
                        res.url || url,
                    );
                    if (candidate) {
                        const nextHeaders = { ...headers };
                        if (!nextHeaders.Referer) {
                            try {
                                nextHeaders.Referer = new URL(url).origin;
                            } catch {
                                // ignore
                            }
                        }
                        return this.fetchImageAsBuffer(
                            candidate,
                            nextHeaders,
                            depth + 1,
                        );
                    }
                }
                throw new Error(`Not an image: ${ct || 'unknown'}`);
            }

            // Size guard (Content-Length if present)
            const cl = res.headers.get('content-length');
            if (cl && Number(cl) > MAX_BYTES) {
                throw new Error(`Image too large: ${cl} bytes`);
            }

            // Read stream with size cap
            const reader = res.body?.getReader?.();
            if (!reader) {
                // Fallback to arrayBuffer for environments without streaming reader
                const arr = await res.arrayBuffer();
                if (arr.byteLength > MAX_BYTES)
                    throw new Error(`Image too large: ${arr.byteLength} bytes`);
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
                        throw new Error(
                            `Image too large (>${MAX_BYTES} bytes)`,
                        );
                    }
                    chunks.push(value);
                }
            }
            const buffer = Buffer.concat(chunks.map((u8) => Buffer.from(u8)));
            return { buffer, contentType: ct };
        } finally {
            clearTimeout(timeout);
        }
    }

    private makePublicId(srcUrl: string, buf: Buffer, prefix?: string) {
        const sha = createHash('sha1')
            .update(srcUrl)
            .update(buf)
            .digest('hex')
            .slice(0, 16);
        return prefix ? `${prefix}_${sha}` : sha;
    }

    private extractImageFromHtml(html: string, baseUrl: string): string | null {
        const patterns: Array<RegExp> = [
            /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
            /<meta[^>]+property=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
            /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
        ];

        for (const r of patterns) {
            const m = html.match(r);
            if (m?.[1]) {
                const abs = this.toAbsoluteUrl(m[1].trim(), baseUrl);
                if (abs) return abs;
            }
        }

        const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgMatch?.[1]) {
            const abs = this.toAbsoluteUrl(imgMatch[1].trim(), baseUrl);
            if (abs) return abs;
        }
        return null;
    }

    private toAbsoluteUrl(possibleUrl: string, baseUrl: string): string | null {
        try {
            const url = new URL(possibleUrl, baseUrl);
            if (isHttpUrl(url.toString())) {
                return url.toString();
            }
            return null;
        } catch {
            return null;
        }
    }

    private async uploadBufferToS3(
        buffer: Buffer,
        contentType: string | undefined,
        folder: string,
        publicId: string,
    ): Promise<{ secure_url: string; public_id: string }> {
        const ext = this.guessExtension(contentType);
        const key = `${folder}/${publicId}.${ext}`;
        const result = await this.s3.uploadBuffer({
            key,
            buffer,
            contentType,
            cacheControl: 'public, max-age=31536000',
        });
        return { secure_url: result.url, public_id: result.key };
    }

    private guessExtension(contentType?: string): string {
        if (!contentType) return 'bin';
        if (contentType.includes('jpeg') || contentType.includes('jpg'))
            return 'jpg';
        if (contentType.includes('png')) return 'png';
        if (contentType.includes('webp')) return 'webp';
        if (contentType.includes('gif')) return 'gif';
        if (contentType.includes('svg')) return 'svg';
        return 'bin';
    }
}
