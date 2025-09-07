"""
S3 utilities package for ClipForge
Provides unified S3 operations across all services
"""

from .s3_client import (
    S3Client,
    get_s3_client,
    upload_file,
    download_file,
    delete_file,
    get_public_url,
    file_exists
)

__all__ = [
    'S3Client',
    'get_s3_client', 
    'upload_file',
    'download_file',
    'delete_file',
    'get_public_url',
    'file_exists'
]