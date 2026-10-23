# Changelog

## Release: v1.4.1 (2026-10-23)

- Upgrade NodeJS from v23.7.0 to v24.22.1
- Upgrade NPM dev dependencies
  - @types/compression: 1.7.5 -> 1.8.1
  - @types/cors: 2.8.17 -> 2.8.19
  - @types/express: 4.17.21 -> 5.0.6
  - @types/node: 22.13.5 -> 26.6.5
  - concurrently: 9.1.2 -> 10.0.6
  - nodemon: 3.1.9 -> 3.1.14
  - openapi-typescript: 7.6.1 -> 7.13.0
  - rimraf: 6.0.1 -> 6.1.3
  - typescript: 5.7.3 -> 7.0.2
- Upgrade NPM core dependencies
  - @aws-sdk/client-s3: 3.750.0 -> 3.1152.0
  - @ethereumjs/util: 9.1.0 - 10.1.3
  - @smithy/node-http-handler: 4.0.0 - 4.12.1
  - ajv: 8.17.1 -> 8.20.0
  - compression: 1.8.0 -> 1.8.2
  - cors: 2.8.5 -> 2.8.6
  - ethereum-cryptography: 3.1.0 -> 3.2.0
  - express: 4.21.2 -> 5.3.0
  - pino: 9.6.0 -> 10.4.0
  - pino-pretty: 13.0.0 -> 13.2.0
  - yaml: 2.7.0 -> 2.9.1

## Release 1.4.0 (2026-04-15)

- Update HTTP logline

## Release 1.3.0 (2025-02-21)

- Downgrade NodeJS version (not available yet)

## Release 1.2.0 (2025-02-21)

- Fix a bug with metrics in cluster mode
- Upgrade NPM dependencies
- Upgrade NodeJS version

## Release 1.1.2 (2025-02-21)

- Release testing, no changes

## Release 1.1.1 (2025-02-21)

- Release testing, no changes

## Release 1.1.0 (2025-02-10)

- Change signature for GET BACKUP endpoint

## Release 1.0.1 (2025-02-10)

- Fix a bug where API hangs when the user has zero backups

## Release 1.0.0 (2025-02-10)

- Upgrade NPM dependencies
- Cleanup codebase

## Release 0.4.0 (2025-02-07)

- Split list and get into different endpoints
- Order API responses properly

## Release 0.3.0 (2025-02-07)

- REPL to create, list, and delete backups
- Upgrade NPM packages

## Release 0.2.0 (2025-02-05)

- Cleanup & restructure codebase
- Improve graceful shutdown behavior
- Upgrade NodeJS version from v23.6.0 to v23.7.0
- Upgrade NPM dependencies

```
-  "@types/node": "22.10.5",
+  "@types/node": "22.13.1",
-  "openapi-typescript": "7.5.2",
+  "openapi-typescript": "7.6.1",
-  "ethereum-cryptography": "3.0.0",
+  "ethereum-cryptography": "3.1.0",
-  "@smithy/node-http-handler": "^4.0.1",
+  "@smithy/node-http-handler": "^4.0.2",
-  "@aws-sdk/client-s3": "3.726.0",
+  "@aws-sdk/client-s3": "3.741.0",
```

## Release 0.1.5 (2025-02-05)

- Require signature to get user backups
- New endpoints
  - /schema.json
  - /schema.yml
  - /schema.yaml
- Change endpoints
  - `POST /backups/:publicKey/:userId` -> `POST /backups/:publicKey/users/:userId`
  - `POST /backups/:publicKey/:userId/delete` -> `DELETE /backups/:publicKey/users/:userId`
- The following endpoints now require `signature` as query URL parameters
  - `POST /backups/:publicKey/users/:userId`
  - `DELETE /backups/:publicKey/users/:userId`
  - `GET /backups/:publicKey`

