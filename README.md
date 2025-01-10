## Enkrypt API

Provides access to Enkrypt settings backups.

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

### Setting up a new deployment (AWS EC2 example)

The Enkrypt API is simple and there are many ways to deploy it. Here's an example on AWS EC2 with an API server and loadbalancer server.

1. (Optional) Setup your VPC
  - Create a private subnet for the Enkrypt API server in your VPC
  - (Optional) Create a VPC Gateway Endpoint for S3 so your API server can access S3 on the private subnet without going through the public internet

2. Create the S3 bucket to store backups as specified in [AWS S3 setup](#aws-s3-setup)

3. Setup IAM permissions
  - Create an IAM Policy specified in [AWS IAM permissions](#aws-iam-permissions).
    - Name the policy something like "EnkryptApi(Stage)" where "Stage" is a deployment stage like "Prod" "Dev", or "Test"
    - Remember to update the policy JSON with your actual backup name
  - Create an IAM Role with name "EnkryptApi(Stage)" and with the IAM Policy for the API server to assume
    - Secify Trusted Entity Type "AWS service" and the EC2 use case "Allows EC2 instances to call AWS services on your behalf."
    - Attach the policy "EnkryptApi(Stage)"

4. Create a new AWS EC2 instance for the Enkrypt API using the AWS GUI
  - Name: "enkrypt-api-<deployment stage>-api" (eg "enkrypt-api-prod-api")
  - AMI: Ubuntu Server 24.04 LTS
  - Instance type: t2.micro/t3.micro or higher
  - Subnet: ideally private subnet behind a NAT gateway
  - Security Group
    - HTTP/HTTPS ipv4/ipv6 egress to anywhere (Temporary, for updating the server, installing apt packages, NodeJS and npm packages)
    - SSH ingress from bastion host if on private subnet, otherwise on a public subnet from your ip address if on public subnet
  - Storage: 8GiB gpt3 root volume

5. Setup the API server
  - Execute the setup script on the server. Feel free to modify the script to fit your environment. For example you may want to remove the Prometheus node exporter, Promtail, terminal, vim and tmux configurations, etc.
    - Private subnet: `private ssh -J <bastion host user>@<bastion host ip> ubuntu@<enkrypt api private ip> < scripts/setup-ubuntu-24.04-api.sh`
    - Public subnet: `private ssh ubuntu@<enkrypt api public ip> < scripts/setup-ubuntu-24.04-api.sh`
  - Check that the setup script succeeded (view the last lines logged, also run `echo $?`, if non zero then setup failed)
  - Follow the getting started steps that should have been printed to the screen. Some of them are optional. Broadly this includes:
    - SSH into the server and setup up API environment variables
    - Run the deploy script to deploy the API onto the API server
    - Modifying Security Groups to disallow all HTTP/S egress, allow load balance ingress (you can postpone this until you've set up a load balancer in a later step), allow monitoring services ingress/egress.
    - Configuring and starting monitoring services
    - Setting up instance tags
    - Rebooting the server
  - Attach the IAM Role from step 3. to the server

6. Create an AWS EC2 instance for a HAProxy loadbalancer / reverse proxy using the AWS GUI
  - Name: "enkrypt-api-<deployment stage>-loadbalancer" (eg "enkrypt-api-prod-loadbalancer")
  - AMI: Ubuntu Server 24.04 LTS
  - Instance type: t2.micro/t3.micro or higher
  - Subnet: public
  - Security Group
    - HTTP/HTTPS ipv4/ipv6 egress to anywhere (Temporary, for updating the server and installing apt packages)
    - SSH ingress from bastion host or from your ip
  - Storage: 8GiB gpt3 root volume

7. Setup the loadbalancer server
  - Execute the setup script on the server. Feel free to modify the script to fit your environment. For example you may want to remove the Prometheus node exporter, Promtail, terminal, vim and tmux configurations, etc.
    - Bastion host: `private ssh -J <bastion host user>@<bastion host ip> ubuntu@<enkrypt loadbalancer private ip> < scripts/setup-ubuntu-24.04-loadbalancer.sh`
    - Direct: `private ssh ubuntu@<enkrypt loadbalancer public ip> < scripts/setup-ubuntu-24.04-loadbalancer.sh`
  - Check that the setup script succeeded (view the last lines logged, also run `echo $?`, if non zero then setup failed)
  - Follow the getting started steps that should have been printed to the screen. Some of them are optional. Broadly this includes:
    - SSH into the server and complete the HAProxy configuration
    - SSH into the server and enable all HAProxy systemd security flags

8. Finalise security groups
  - Remove any previous rules allowing any HTTP/S egress from the API server
  - Remove any previous rules allowing any HTTP/S egress from the loadbalancer server
  - If not already exists, create an empty Security Group for the Enkrypt API named "enkrypt-api-(stage)-api" (eg "enkrypt-api-prod-api")
  - If not already exists, create an empty Security Group for the Enkrypt loadbalancer named "enkrypt-api-(stage)-loadbalancer" (eg "enkrypt-api-prod-loadbalancer")
  - Setup "enkrypt-api-(stage)-api" Security Group rules
    - Setup ingress rules
      - TCP from the "enkrypt-api-(stage)-loadbalancer" Security Group on port 8080
      - TCP from the from a Prometheus server on port 9100 (if applicable)
    - Setup egress rules
      - TCP to S3
        - If using the VPC endpoint from step 1. then allow HTTPS (port 443) egress to the VPC Endpoint
        - If not using a VPC endpoint then enable all HTTPS (port 443) ipv4/ipv6 egress
      - TCP to Loki on port 3100 (or whichever port your Loki is listening on) (if applicable)
  - Setup "enkrypt-api-(stage)-loadbalancer" Security Group rules
    - Setup ingress rules
      - TPC on HTTPS (port 443) and HTTP (port 80) from anywhere ipv4/ipv6
      - TCP from the from a Prometheus server on port 9100 (if applicable)
    - Setup egress rules
      - TCP to the Api server on port 8080 to the `enkrypt-api-(stage)-api` Security Group
      - TCP to Loki on port 3100 (or whichever port your Loki is listening on) (if applicable)
  - Assign the "enkrypt-api-(stage)-api" to the API server "enkrypt-api-(stage)-api"
  - Assign the "enkrypt-api-(stage)-loadbalancer" to the loadbalancer server "enkrypt-api-(stage)-loadbalancer"

9. Finalise setup (if applicable)
  - Create an Elastic IP and assign it to the loadbalancer server
  - Setup TLS certificates on the Loadbalancer if required (Cloudflare proxies let you use self signed certificates which are already setup on the loadbalancer).
  - Create a DNS name and point to the loadbalancer's Elastic IP address.

