## Getting started

```sh
nvm use

pnpm install

cp .env.example .env

pnpm dev
# pnpm clean && pnpm build:only && pnpm start
```

## Running tests

```sh
pnpm test
# pnpm test:dev
# pnpm test:fast
```

### AWS Setup

Create an S3 bucket

- General purpose
- ACLs disabled
- Block all public access
- Bucket versioning disabled
- Server-side encryption with SSE-S3
  - Bucket key enabled
- Object lock disabled

### AWS Permissions

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "S3Buckets",
            "Effect": "Allow",
            "Action": [
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::<s3-bucket-name>"
            ]
        },
        {
            "Sid": "S3BucketsObjects",
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:DeleteObject"
            ],
            "Resource": [
                "arn:aws:s3:::<s3-bucket-name>/*"
            ]
        }
    ]
}
```
