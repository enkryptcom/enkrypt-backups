## Enkrypt API

Provides an API for Enkrypt settings backups.

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

### Running the API with Docker


```sh
# Build the API image
DOCKER_BUILDKIT=1 docker build -t enkrypt-api .

# Create a container and run the API
docker run --env-file .env -it --rm enkrypt-api
```

### AWS S3 setup

Create an S3 bucket

- General purpose
- ACLs disabled
- Block all public access
- Bucket versioning disabled
- Server-side encryption with SSE-S3
  - Bucket key enabled
- Object lock disabled

### AWS IAM permissions

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

