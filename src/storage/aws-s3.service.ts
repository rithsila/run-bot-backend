// src/storage/aws-s3.service.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomUUID } from 'node:crypto';
type UploadedFile = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
};

type UploadResult = {
  key: string;
  url: string;
};

type UploadBufferOptions = {
  key: string;
  buffer: Buffer;
  contentType?: string;
  acl?: 'private' | 'public-read';
  cacheControl?: string;
};

type UploadFileOptions = {
  folder?: string;
  acl?: 'private' | 'public-read';
  cacheControl?: string;
  key?: string;
};

type UploadFromUrlOptions = {
  folder?: string;
  filename?: string;
  acl?: 'private' | 'public-read';
  cacheControl?: string;
};

@Injectable()
export class AwsS3Service {
  private readonly region: string;
  private readonly bucket: string;
  private readonly accessKey: string;
  private readonly secretKey: string;

  constructor(private readonly config: ConfigService) {
    this.region = this.config.get<string>('AWS_REGION', 'ap-southeast-2');
    this.bucket = this.config.get<string>('S3_BUCKET_NAME', '');
    this.accessKey = this.config.get<string>('AWS_ACCESS_KEY_ID', '');
    this.secretKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY', '');

    if (!this.bucket || !this.accessKey || !this.secretKey) {
      throw new Error('AWS credentials or bucket name are not configured');
    }
  }

  async uploadFile(file: UploadedFile, opts?: UploadFileOptions): Promise<UploadResult> {
    if (!file?.buffer?.length) {
      throw new InternalServerErrorException('File buffer is empty');
    }

    const folder = (opts?.folder ?? 'uploads').replace(/^\/*/, '').replace(/\/*$/, '');
    const safeOriginal = (file.originalname || 'file').replace(/[^\w.\-]+/g, '-');
    const key =
      opts?.key ??
      `${folder}/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${randomUUID()}-${safeOriginal}`;

    return this.uploadBuffer({
      key,
      buffer: file.buffer,
      contentType: file.mimetype,
      acl: opts?.acl,
      cacheControl: opts?.cacheControl,
    });
  }

  async uploadBuffer(options: UploadBufferOptions): Promise<UploadResult> {
    const { key, buffer, contentType, acl, cacheControl } = options;
    if (!buffer?.length) {
      throw new InternalServerErrorException('Upload buffer is empty');
    }

    const host = `${this.bucket}.s3.${this.region}.amazonaws.com`;
    const encodedKey = key
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    const url = `https://${host}/${encodedKey}`;

    const now = new Date();
    const amzDate = this.formatAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = this.sha256Hex(buffer);

    const headers: Record<string, string> = {
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };

    if (contentType) headers['content-type'] = contentType;
    if (cacheControl) headers['cache-control'] = cacheControl;
    if (acl) headers['x-amz-acl'] = acl;

    const canonicalHeaders = this.buildCanonicalHeaders(headers);
    const signedHeaders = Object.keys(canonicalHeaders).join(';');
    const canonicalHeadersString = Object.entries(canonicalHeaders)
      .map(([name, value]) => `${name}:${value}\n`)
      .join('');

    const canonicalRequest = [
      'PUT',
      `/${encodedKey}`,
      '',
      canonicalHeadersString,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      this.sha256Hex(Buffer.from(canonicalRequest, 'utf8')),
    ].join('\n');

    const signingKey = this.getSignatureKey(this.secretKey, dateStamp, this.region, 's3');
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    headers.authorization = [
      `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(', ');

    const response = await fetch(url, {
      method: 'PUT',
      headers,
      body: new Uint8Array(buffer),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error');
      throw new InternalServerErrorException(
        `Failed to upload to S3 (${response.status}): ${text}`,
      );
    }

    return { key, url };
  }

  async uploadFromUrl(sourceUrl: string, opts?: UploadFromUrlOptions): Promise<UploadResult> {
    const response = await fetch(sourceUrl);
    if (!response.ok || !response.body) {
      throw new InternalServerErrorException(
        `Failed to download file (${response.status} ${response.statusText})`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get('content-type') ?? undefined;

    const folder = (opts?.folder ?? 'uploads').replace(/^\/*/, '').replace(/\/*$/, '');
    const filename =
      opts?.filename ??
      sourceUrl.split('/').pop()?.split('?')[0]?.replace(/[^\w.\-]+/g, '-') ??
      `remote-${randomUUID()}`;

    const key = `${folder}/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${filename}`;

    return this.uploadBuffer({
      key,
      buffer,
      contentType,
      acl: opts?.acl,
      cacheControl: opts?.cacheControl,
    });
  }

  async deleteFileByKey(key: string): Promise<void> {
    if (!key) return;

    const host = `${this.bucket}.s3.${this.region}.amazonaws.com`;
    const encodedKey = key
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    const url = `https://${host}/${encodedKey}`;

    const now = new Date();
    const amzDate = this.formatAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = this.sha256Hex(Buffer.from(''));

    const headers: Record<string, string> = {
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };

    const canonicalHeaders = this.buildCanonicalHeaders(headers);
    const signedHeaders = Object.keys(canonicalHeaders).join(';');
    const canonicalHeadersString = Object.entries(canonicalHeaders)
      .map(([name, value]) => `${name}:${value}\n`)
      .join('');

    const canonicalRequest = [
      'DELETE',
      `/${encodedKey}`,
      '',
      canonicalHeadersString,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      this.sha256Hex(Buffer.from(canonicalRequest, 'utf8')),
    ].join('\n');

    const signingKey = this.getSignatureKey(this.secretKey, dateStamp, this.region, 's3');
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    headers.authorization = [
      `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(', ');

    const response = await fetch(url, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error');
      throw new InternalServerErrorException(
        `Failed to delete from S3 (${response.status}): ${text}`,
      );
    }
  }

  async deleteFileByUrl(fileUrl: string): Promise<boolean> {
    const key = this.getKeyFromUrl(fileUrl);
    if (!key) return false;
    await this.deleteFileByKey(key);
    return true;
  }

  getPublicUrl(key: string): string {
    const encodedKey = key
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${encodedKey}`;
  }

  private formatAmzDate(date: Date): string {
    const iso = date.toISOString(); // e.g., 2025-01-17T10:24:30.123Z
    return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); // 20250117T102430Z
  }

  private sha256Hex(data: Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }

  private getSignatureKey(key: string, dateStamp: string, region: string, service: string) {
    const kDate = createHmac('sha256', `AWS4${key}`).update(dateStamp).digest();
    const kRegion = createHmac('sha256', kDate).update(region).digest();
    const kService = createHmac('sha256', kRegion).update(service).digest();
    return createHmac('sha256', kService).update('aws4_request').digest();
  }

  private buildCanonicalHeaders(headers: Record<string, string>): Record<string, string> {
    return Object.keys(headers)
      .sort()
      .reduce<Record<string, string>>((acc, key) => {
        acc[key.toLowerCase()] = headers[key].trim().replace(/\s+/g, ' ');
        return acc;
      }, {});
  }

  private getKeyFromUrl(fileUrl: string): string | null {
    if (!fileUrl) return null;
    try {
      const u = new URL(fileUrl);
      const host = u.hostname;
      const bucketHost = `${this.bucket}.s3.${this.region}.amazonaws.com`;
      const bucketHostAlt = `${this.bucket}.s3.amazonaws.com`;
      const regionalHost = `s3.${this.region}.amazonaws.com`;
      const globalHost = 's3.amazonaws.com';

      const path = decodeURIComponent(u.pathname.replace(/^\/+/, ''));

      if (host === bucketHost || host === bucketHostAlt) {
        return path || null;
      }

      if (host === regionalHost || host === globalHost) {
        if (!path.startsWith(`${this.bucket}/`)) return null;
        return path.slice(this.bucket.length + 1) || null;
      }
    } catch {
      return null;
    }

    return null;
  }
}
