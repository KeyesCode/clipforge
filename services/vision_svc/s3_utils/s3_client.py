"""
S3 utility client for ClipForge services
Provides unified S3 operations for both LocalStack (dev) and AWS S3 (production)
"""

import os
import boto3
import logging
from typing import Optional, Tuple
from botocore.exceptions import ClientError, NoCredentialsError
from urllib.parse import urljoin

logger = logging.getLogger(__name__)

class S3Client:
    def __init__(self):
        """Initialize S3 client with environment configuration"""
        self.region = os.getenv('AWS_DEFAULT_REGION', 'us-east-1')
        self.access_key = os.getenv('AWS_ACCESS_KEY_ID', 'test')
        self.secret_key = os.getenv('AWS_SECRET_ACCESS_KEY', 'test')
        self.bucket_name = os.getenv('S3_BUCKET_NAME', 'clipforge-storage')
        self.endpoint_url = os.getenv('S3_ENDPOINT_URL')  # LocalStack endpoint
        self.public_url = os.getenv('S3_PUBLIC_URL', 'http://localhost:4566')
        self.use_ssl = os.getenv('S3_USE_SSL', 'false').lower() == 'true'
        
        # Initialize boto3 client
        self._client = self._create_client()
        self._ensure_bucket_exists()

    def _create_client(self):
        """Create boto3 S3 client with proper configuration"""
        try:
            config_kwargs = {
                'aws_access_key_id': self.access_key,
                'aws_secret_access_key': self.secret_key,
                'region_name': self.region,
            }
            
            if self.endpoint_url:
                config_kwargs['endpoint_url'] = self.endpoint_url
                # For LocalStack, disable SSL verification
                config_kwargs['use_ssl'] = self.use_ssl
                config_kwargs['config'] = boto3.session.Config(
                    s3={'addressing_style': 'path'}
                )
            
            client = boto3.client('s3', **config_kwargs)
            logger.info(f"S3 client initialized with endpoint: {self.endpoint_url or 'AWS S3'}")
            return client
            
        except Exception as e:
            logger.error(f"Failed to create S3 client: {e}")
            raise

    def _ensure_bucket_exists(self):
        """Ensure the S3 bucket exists, create if it doesn't"""
        try:
            self._client.head_bucket(Bucket=self.bucket_name)
            logger.info(f"S3 bucket '{self.bucket_name}' exists")
        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == '404':
                try:
                    if self.region == 'us-east-1':
                        # us-east-1 doesn't need CreateBucketConfiguration
                        self._client.create_bucket(Bucket=self.bucket_name)
                    else:
                        self._client.create_bucket(
                            Bucket=self.bucket_name,
                            CreateBucketConfiguration={'LocationConstraint': self.region}
                        )
                    logger.info(f"Created S3 bucket '{self.bucket_name}'")
                except ClientError as create_error:
                    logger.error(f"Failed to create bucket: {create_error}")
                    raise
            elif error_code == '403':
                # Bucket exists but we don't have permission to check - that's OK for LocalStack startup
                logger.warning(f"Cannot verify bucket exists (403), assuming it exists: {self.bucket_name}")
            else:
                logger.error(f"Error checking bucket: {e}")
                raise

    def upload_file(self, local_path: str, s3_key: str, content_type: Optional[str] = None) -> Optional[str]:
        """
        Upload a file to S3
        
        Args:
            local_path: Path to the local file
            s3_key: S3 key (path) for the file
            content_type: MIME type of the file
            
        Returns:
            Public URL of the uploaded file, or None if upload failed
        """
        try:
            if not os.path.exists(local_path):
                logger.error(f"Local file does not exist: {local_path}")
                return None
            
            extra_args = {}
            if content_type:
                extra_args['ContentType'] = content_type
            
            # Auto-detect content type for common video/audio files
            if not content_type:
                ext = os.path.splitext(local_path)[1].lower()
                content_type_map = {
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
                }
                if ext in content_type_map:
                    extra_args['ContentType'] = content_type_map[ext]
            
            # Upload the file
            self._client.upload_file(
                Filename=local_path,
                Bucket=self.bucket_name,
                Key=s3_key,
                ExtraArgs=extra_args
            )
            
            # Generate public URL
            public_url = self.get_public_url(s3_key)
            logger.info(f"Successfully uploaded {local_path} to {public_url}")
            return public_url
            
        except FileNotFoundError:
            logger.error(f"File not found: {local_path}")
            return None
        except NoCredentialsError:
            logger.error("AWS credentials not found")
            return None
        except ClientError as e:
            logger.error(f"Failed to upload {local_path} to S3: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error uploading {local_path}: {e}")
            return None

    def download_file(self, s3_key: str, local_path: str) -> bool:
        """
        Download a file from S3
        
        Args:
            s3_key: S3 key (path) of the file
            local_path: Local path to save the file
            
        Returns:
            True if download successful, False otherwise
        """
        try:
            # Create directory if it doesn't exist
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            
            self._client.download_file(
                Bucket=self.bucket_name,
                Key=s3_key,
                Filename=local_path
            )
            
            logger.info(f"Successfully downloaded {s3_key} to {local_path}")
            return True
            
        except ClientError as e:
            logger.error(f"Failed to download {s3_key} from S3: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error downloading {s3_key}: {e}")
            return False

    def delete_file(self, s3_key: str) -> bool:
        """
        Delete a file from S3
        
        Args:
            s3_key: S3 key (path) of the file to delete
            
        Returns:
            True if deletion successful, False otherwise
        """
        try:
            self._client.delete_object(Bucket=self.bucket_name, Key=s3_key)
            logger.info(f"Successfully deleted {s3_key} from S3")
            return True
            
        except ClientError as e:
            logger.error(f"Failed to delete {s3_key} from S3: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error deleting {s3_key}: {e}")
            return False

    def file_exists(self, s3_key: str) -> bool:
        """
        Check if a file exists in S3
        
        Args:
            s3_key: S3 key (path) of the file
            
        Returns:
            True if file exists, False otherwise
        """
        try:
            self._client.head_object(Bucket=self.bucket_name, Key=s3_key)
            return True
        except ClientError as e:
            if e.response['Error']['Code'] == '404':
                return False
            logger.error(f"Error checking if {s3_key} exists: {e}")
            return False

    def get_public_url(self, s3_key: str) -> str:
        """
        Get the public URL for an S3 object
        
        Args:
            s3_key: S3 key (path) of the file
            
        Returns:
            Public URL to access the file
        """
        if self.endpoint_url:  # LocalStack or custom endpoint
            return f"{self.public_url}/{self.bucket_name}/{s3_key}"
        else:  # AWS S3
            return f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com/{s3_key}"

    def get_presigned_url(self, s3_key: str, expiration: int = 3600) -> Optional[str]:
        """
        Generate a presigned URL for secure access to an S3 object
        
        Args:
            s3_key: S3 key (path) of the file
            expiration: URL expiration time in seconds (default: 1 hour)
            
        Returns:
            Presigned URL or None if generation failed
        """
        try:
            url = self._client.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.bucket_name, 'Key': s3_key},
                ExpiresIn=expiration
            )
            return url
        except ClientError as e:
            logger.error(f"Failed to generate presigned URL for {s3_key}: {e}")
            return None

    def list_files(self, prefix: str = "", max_keys: int = 1000) -> list:
        """
        List files in S3 bucket with optional prefix filter
        
        Args:
            prefix: Prefix to filter files (e.g., "streams/", "clips/")
            max_keys: Maximum number of files to return
            
        Returns:
            List of S3 object keys
        """
        try:
            response = self._client.list_objects_v2(
                Bucket=self.bucket_name,
                Prefix=prefix,
                MaxKeys=max_keys
            )
            
            if 'Contents' not in response:
                return []
            
            return [obj['Key'] for obj in response['Contents']]
            
        except ClientError as e:
            logger.error(f"Failed to list files with prefix {prefix}: {e}")
            return []

    def get_file_info(self, s3_key: str) -> Optional[dict]:
        """
        Get metadata information about a file in S3
        
        Args:
            s3_key: S3 key (path) of the file
            
        Returns:
            Dict with file metadata or None if file doesn't exist
        """
        try:
            response = self._client.head_object(Bucket=self.bucket_name, Key=s3_key)
            return {
                'size': response.get('ContentLength'),
                'last_modified': response.get('LastModified'),
                'content_type': response.get('ContentType'),
                'etag': response.get('ETag'),
                'metadata': response.get('Metadata', {})
            }
        except ClientError as e:
            if e.response['Error']['Code'] == '404':
                return None
            logger.error(f"Failed to get file info for {s3_key}: {e}")
            return None

    def health_check(self) -> bool:
        """
        Check if S3 service is accessible
        
        Returns:
            True if S3 is accessible, False otherwise
        """
        try:
            self._client.head_bucket(Bucket=self.bucket_name)
            return True
        except ClientError:
            return False
        except Exception:
            return False


# Global S3 client instance
_s3_client = None

def get_s3_client() -> S3Client:
    """Get or create global S3 client instance"""
    global _s3_client
    if _s3_client is None:
        _s3_client = S3Client()
    return _s3_client


# Convenience functions for common operations
def upload_file(local_path: str, s3_key: str, content_type: Optional[str] = None) -> Optional[str]:
    """Upload a file to S3 and return public URL"""
    return get_s3_client().upload_file(local_path, s3_key, content_type)

def download_file(s3_key: str, local_path: str) -> bool:
    """Download a file from S3"""
    return get_s3_client().download_file(s3_key, local_path)

def delete_file(s3_key: str) -> bool:
    """Delete a file from S3"""
    return get_s3_client().delete_file(s3_key)

def get_public_url(s3_key: str) -> str:
    """Get public URL for S3 file"""
    return get_s3_client().get_public_url(s3_key)

def file_exists(s3_key: str) -> bool:
    """Check if file exists in S3"""
    return get_s3_client().file_exists(s3_key)