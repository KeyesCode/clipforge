import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, getS3Client } from '../../s3-utils/src';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private s3Client: S3Client;

  constructor(private configService: ConfigService) {
    this.s3Client = getS3Client({
      region: this.configService.get<string>('AWS_DEFAULT_REGION', 'us-east-1'),
      accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID', 'test'),
      secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY', 'test'),
      bucketName: this.configService.get<string>('S3_BUCKET_NAME', 'clipforge-storage'),
      endpointUrl: this.configService.get<string>('S3_ENDPOINT_URL'),
      publicUrl: this.configService.get<string>('S3_PUBLIC_URL', 'http://localhost:4566'),
      useSsl: this.configService.get<string>('S3_USE_SSL', 'false') === 'true'
    });
  }

  /**
   * Upload a file to S3 and return the public URL
   */
  async uploadFile(localPath: string, s3Key: string, contentType?: string): Promise<string | null> {
    try {
      const url = await this.s3Client.uploadFile(localPath, s3Key, contentType);
      if (url) {
        this.logger.log(`Successfully uploaded ${localPath} to S3: ${url}`);
      } else {
        this.logger.error(`Failed to upload ${localPath} to S3`);
      }
      return url;
    } catch (error) {
      this.logger.error(`Error uploading ${localPath} to S3:`, error);
      return null;
    }
  }

  /**
   * Download a file from S3
   */
  async downloadFile(s3Key: string, localPath: string): Promise<boolean> {
    try {
      const success = await this.s3Client.downloadFile(s3Key, localPath);
      if (success) {
        this.logger.log(`Successfully downloaded ${s3Key} from S3 to ${localPath}`);
      } else {
        this.logger.error(`Failed to download ${s3Key} from S3`);
      }
      return success;
    } catch (error) {
      this.logger.error(`Error downloading ${s3Key} from S3:`, error);
      return false;
    }
  }

  /**
   * Delete a file from S3
   */
  async deleteFile(s3Key: string): Promise<boolean> {
    try {
      const success = await this.s3Client.deleteFile(s3Key);
      if (success) {
        this.logger.log(`Successfully deleted ${s3Key} from S3`);
      } else {
        this.logger.error(`Failed to delete ${s3Key} from S3`);
      }
      return success;
    } catch (error) {
      this.logger.error(`Error deleting ${s3Key} from S3:`, error);
      return false;
    }
  }

  /**
   * Check if a file exists in S3
   */
  async fileExists(s3Key: string): Promise<boolean> {
    try {
      return await this.s3Client.fileExists(s3Key);
    } catch (error) {
      this.logger.error(`Error checking if ${s3Key} exists in S3:`, error);
      return false;
    }
  }

  /**
   * Get the public URL for an S3 object
   */
  getPublicUrl(s3Key: string): string {
    return this.s3Client.getPublicUrl(s3Key);
  }

  /**
   * Generate a presigned URL for secure access to an S3 object
   */
  async getPresignedUrl(s3Key: string, expiration: number = 3600): Promise<string | null> {
    try {
      return await this.s3Client.getPresignedUrl(s3Key, expiration);
    } catch (error) {
      this.logger.error(`Error generating presigned URL for ${s3Key}:`, error);
      return null;
    }
  }

  /**
   * List files in S3 bucket with optional prefix filter
   */
  async listFiles(prefix: string = '', maxKeys: number = 1000): Promise<string[]> {
    try {
      return await this.s3Client.listFiles(prefix, maxKeys);
    } catch (error) {
      this.logger.error(`Error listing files with prefix ${prefix}:`, error);
      return [];
    }
  }

  /**
   * Get metadata information about a file in S3
   */
  async getFileInfo(s3Key: string) {
    try {
      return await this.s3Client.getFileInfo(s3Key);
    } catch (error) {
      this.logger.error(`Error getting file info for ${s3Key}:`, error);
      return null;
    }
  }

  /**
   * Check if S3 service is accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      const isHealthy = await this.s3Client.healthCheck();
      if (isHealthy) {
        this.logger.log('S3 service is healthy');
      } else {
        this.logger.error('S3 service health check failed');
      }
      return isHealthy;
    } catch (error) {
      this.logger.error('Error checking S3 health:', error);
      return false;
    }
  }

  /**
   * Generate S3 key for stream files
   */
  generateStreamS3Key(streamId: string, filename: string): string {
    return `streams/${streamId}/${filename}`;
  }

  /**
   * Generate S3 key for chunk files
   */
  generateChunkS3Key(streamId: string, chunkId: string): string {
    return `chunks/${streamId}/${chunkId}.mp4`;
  }

  /**
   * Generate S3 key for clip files
   */
  generateClipS3Key(clipId: string, filename: string): string {
    return `clips/${clipId}/${filename}`;
  }

  /**
   * Generate S3 key for thumbnail files
   */
  generateThumbnailS3Key(entityId: string, entityType: 'stream' | 'chunk' | 'clip', extension: string = '.jpg'): string {
    return `thumbnails/${entityType}s/${entityId}/thumbnail${extension}`;
  }
}