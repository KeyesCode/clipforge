#!/bin/bash
# Initialize S3 bucket in LocalStack

echo "Waiting for LocalStack to be ready..."
sleep 10

echo "Creating S3 bucket: clipforge-storage"
aws --endpoint-url=http://localstack:4566 s3 mb s3://clipforge-storage --region us-east-1

echo "Setting bucket policy for public read access"
aws --endpoint-url=http://localstack:4566 s3api put-bucket-policy \
  --bucket clipforge-storage \
  --policy '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "PublicReadGetObject",
        "Effect": "Allow", 
        "Principal": "*",
        "Action": "s3:GetObject",
        "Resource": "arn:aws:s3:::clipforge-storage/*"
      }
    ]
  }'

echo "S3 bucket initialization complete!"