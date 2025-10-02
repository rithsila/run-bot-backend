import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class MediaService {
  private readonly cloudName: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(private readonly config: ConfigService) {
    this.cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME')!;
    this.apiKey = this.config.get<string>('CLOUDINARY_API_KEY')!;
    this.apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET')!;

    cloudinary.config({
      cloud_name: this.cloudName,
      api_key: this.apiKey,
      api_secret: this.apiSecret,
      secure: true,
    });
  }

  signUpload(folder = 'news') {
    const timestamp = Math.floor(Date.now() / 1000);

    // Only sign the params you intend to allow
    const paramsToSign: Record<string, any> = { timestamp, folder };

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      this.apiSecret,
    );

    return {
      timestamp,
      signature,
      folder,
      cloudName: this.cloudName,
      apiKey: this.apiKey,
    };
  }

  /** Delete a single asset by public_id */
  async deleteOne(publicId: string, resourceType: 'image' | 'video' | 'raw' = 'image') {
    return cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      invalidate: true, // purge CDN caches
    });
  }

  /** Delete many assets by public_ids */
  async deleteMany(
    publicIds: string[],
    resourceType: 'image' | 'video' | 'raw' = 'image',
  ) {
    return cloudinary.api.delete_resources(publicIds, {
      resource_type: resourceType,
      invalidate: true,
    });
  }

  /** Delete everything under a prefix/folder, then the folder */
  async deleteByPrefix(
    prefix: string,
    resourceType: 'image' | 'video' | 'raw' = 'image',
  ) {
    await cloudinary.api.delete_resources_by_prefix(prefix, {
      resource_type: resourceType,
      invalidate: true,
    });
    // Attempt to delete folder (will succeed only if empty)
    try {
      await cloudinary.api.delete_folder(prefix);
    } catch {
      // ignore if not empty
    }
    return { ok: true };
  }
}