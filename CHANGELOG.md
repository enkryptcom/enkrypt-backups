## Upcoming

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

