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

