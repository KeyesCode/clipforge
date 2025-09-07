/**
 * S3 utility client for ClipForge services
 * Provides unified S3 operations for both LocalStack (dev) and AWS S3 (production)
 */

import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';

export interface S3Config {
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucketName?: string;
  endpointUrl?: string;
  publicUrl?: string;
  useSsl?: boolean;
}

export interface FileInfo {
  size?: number;
  lastModified?: Date;
  contentType?: string;
  etag?: string;
  metadata?: Record<string, string>;
}

export class S3Client {
  private client: AWS.S3;
  private bucketName: string;
  private publicUrl: string;
  private endpointUrl?: string;

  constructor(config?: S3Config) {
    const {
      region = process.env.AWS_DEFAULT_REGION || 'us-east-1',
      accessKeyId = process.env.AWS_ACCESS_KEY_ID || 'test',
      secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || 'test',
      bucketName = process.env.S3_BUCKET_NAME || 'clipforge-storage',
      endpointUrl = process.env.S3_ENDPOINT_URL,
      publicUrl = process.env.S3_PUBLIC_URL || 'http://localhost:4566',
      useSsl = (process.env.S3_USE_SSL || 'false').toLowerCase() === 'true'
    } = config || {};

    this.bucketName = bucketName;
    this.publicUrl = publicUrl;
    this.endpointUrl = endpointUrl;

    // Configure AWS SDK
    const awsConfig: AWS.S3.ClientConfiguration = {
      region,
      accessKeyId,
      secretAccessKey,
    };

    if (endpointUrl) {
      awsConfig.endpoint = endpointUrl;
      awsConfig.sslEnabled = useSsl;
      awsConfig.s3ForcePathStyle = true; // Required for LocalStack
    }

    this.client = new AWS.S3(awsConfig);
    
    // Ensure bucket exists
    this.ensureBucketExists().catch(console.error);
  }

  private async ensureBucketExists(): Promise<void> {
    try {
      await this.client.headBucket({ Bucket: this.bucketName }).promise();
      console.log(`S3 bucket '${this.bucketName}' exists`);
    } catch (error: any) {
      if (error.code === 'NotFound' || error.code === '404') {
        try {
          const params: AWS.S3.CreateBucketRequest = { Bucket: this.bucketName };
          
          // Don't set LocationConstraint for us-east-1
          if (this.client.config.region !== 'us-east-1') {
            params.CreateBucketConfiguration = {
              LocationConstraint: this.client.config.region as string
            };
          }
          
          await this.client.createBucket(params).promise();
          console.log(`Created S3 bucket '${this.bucketName}'`);
        } catch (createError) {
          console.error(`Failed to create bucket: ${createError}`);
          throw createError;
        }
      } else {
        console.error(`Error checking bucket: ${error}`);
        throw error;
      }
    }
  }

  async uploadFile(
    localPath: string, 
    s3Key: string, 
    contentType?: string
  ): Promise<string | null> {
    try {
      if (!fs.existsSync(localPath)) {
        console.error(`Local file does not exist: ${localPath}`);
        return null;
      }

      // Auto-detect content type if not provided
      if (!contentType) {
        const ext = path.extname(localPath).toLowerCase();
        const contentTypeMap: Record<string, string> = {
          '.mp4': 'video/mp4',
          '.webm': 'video/webm',
          '.avi': 'video/x-msvideo',
          '.mov': 'video/quicktime',
          '.wav': 'audio/wav',
          '.mp3': 'audio/mpeg',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif'
        };
        contentType = contentTypeMap[ext];
      }

      const fileStream = fs.createReadStream(localPath);
      const params: AWS.S3.PutObjectRequest = {
        Bucket: this.bucketName,
        Key: s3Key,
        Body: fileStream
      };

      if (contentType) {
        params.ContentType = contentType;
      }

      await this.client.upload(params).promise();
      
      const publicUrl = this.getPublicUrl(s3Key);
      console.log(`Successfully uploaded ${localPath} to ${publicUrl}`);
      return publicUrl;

    } catch (error) {
      console.error(`Failed to upload ${localPath} to S3:`, error);
      return null;
    }
  }

  async downloadFile(s3Key: string, localPath: string): Promise<boolean> {
    try {
      // Create directory if it doesn't exist
      const dir = path.dirname(localPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const params = {
        Bucket: this.bucketName,
        Key: s3Key
      };

      const data = await this.client.getObject(params).promise();
      
      if (data.Body) {
        fs.writeFileSync(localPath, data.Body as Buffer);
        console.log(`Successfully downloaded ${s3Key} to ${localPath}`);
        return true;
      }
      
      return false;

    } catch (error) {
      console.error(`Failed to download ${s3Key} from S3:`, error);
      return false;
    }
  }

  async deleteFile(s3Key: string): Promise<boolean> {
    try {
      await this.client.deleteObject({
        Bucket: this.bucketName,
        Key: s3Key
      }).promise();
      
      console.log(`Successfully deleted ${s3Key} from S3`);
      return true;

    } catch (error) {
      console.error(`Failed to delete ${s3Key} from S3:`, error);
      return false;
    }
  }

  async fileExists(s3Key: string): Promise<boolean> {
    try {
      await this.client.headObject({
        Bucket: this.bucketName,
        Key: s3Key
      }).promise();
      return true;
    } catch (error: any) {
      if (error.code === 'NotFound' || error.code === '404') {
        return false;
      }
      console.error(`Error checking if ${s3Key} exists:`, error);
      return false;
    }
  }

  getPublicUrl(s3Key: string): string {
    if (this.endpointUrl) { // LocalStack or custom endpoint
      return `${this.publicUrl}/${this.bucketName}/${s3Key}`;
    } else { // AWS S3
      const region = this.client.config.region || 'us-east-1';
      return `https://${this.bucketName}.s3.${region}.amazonaws.com/${s3Key}`;
    }
  }

  async getPresignedUrl(s3Key: string, expiration: number = 3600): Promise<string | null> {
    try {
      const params = {
        Bucket: this.bucketName,
        Key: s3Key,
        Expires: expiration
      };

      const url = await this.client.getSignedUrlPromise('getObject', params);
      return url;

    } catch (error) {
      console.error(`Failed to generate presigned URL for ${s3Key}:`, error);
      return null;
    }
  }

  async listFiles(prefix: string = '', maxKeys: number = 1000): Promise<string[]> {
    try {
      const params: AWS.S3.ListObjectsV2Request = {
        Bucket: this.bucketName,
        Prefix: prefix,
        MaxKeys: maxKeys
      };

      const response = await this.client.listObjectsV2(params).promise();
      
      if (!response.Contents) {
        return [];
      }

      return response.Contents
        .map(obj => obj.Key)
        .filter((key): key is string => key !== undefined);

    } catch (error) {
      console.error(`Failed to list files with prefix ${prefix}:`, error);
      return [];
    }
  }

  async getFileInfo(s3Key: string): Promise<FileInfo | null> {
    try {
      const response = await this.client.headObject({
        Bucket: this.bucketName,
        Key: s3Key
      }).promise();

      return {
        size: response.ContentLength,
        lastModified: response.LastModified,
        contentType: response.ContentType,
        etag: response.ETag,
        metadata: response.Metadata || {}
      };

    } catch (error: any) {
      if (error.code === 'NotFound' || error.code === '404') {
        return null;
      }
      console.error(`Failed to get file info for ${s3Key}:`, error);
      return null;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.headBucket({ Bucket: this.bucketName }).promise();
      return true;
    } catch (error) {
      return false;
    }
  }
}

// Global S3 client instance
let _s3Client: S3Client | null = null;

export function getS3Client(config?: S3Config): S3Client {
  if (!_s3Client) {
    _s3Client = new S3Client(config);
  }
  return _s3Client;
}

// Convenience functions
export async function uploadFile(
  localPath: string, 
  s3Key: string, 
  contentType?: string
): Promise<string | null> {
  return getS3Client().uploadFile(localPath, s3Key, contentType);
}

export async function downloadFile(s3Key: string, localPath: string): Promise<boolean> {
  return getS3Client().downloadFile(s3Key, localPath);
}

export async function deleteFile(s3Key: string): Promise<boolean> {
  return getS3Client().deleteFile(s3Key);
}

export function getPublicUrl(s3Key: string): string {
  return getS3Client().getPublicUrl(s3Key);
}

export async function fileExists(s3Key: string): Promise<boolean> {
  return getS3Client().fileExists(s3Key);
}