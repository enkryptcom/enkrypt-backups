import type { RequestHandler } from "express"
import type { operations } from "../../openapi.js"
import { HttpError, HttpStatus } from "../../utils/http.js"
import { bufferToByteString, byteStringToBytes, parseByteString } from "../../utils/coersion.js"
import type { Validators } from "../../lib/api/validation.js"
import { createHash } from "node:crypto"
import type { FileStorage } from "../../storage/interface.js"
import { ErrorMessage } from "../../lib/api/errors.js"

type Params = operations['GetUserBackups']['parameters']['path']
type ReqBody = operations['GetUserBackups']['requestBody']
type ResBody = operations['GetUserBackups']['responses']['200']['content']['application/json']
type ReqQuery = operations['GetUserBackups']['parameters']['query']
type Handler = RequestHandler<Params, ResBody, ReqBody, ReqQuery>

export default function createGetUserBackupsHandler(opts: {
	validators: Validators,
	storage: FileStorage,
}): Handler {
	const {
		validators,
		storage,
	} = opts

	return async function(req, res, next) {
		try {
			const pubkey = parseByteString(validators.pubkeyParameter.validate(req.params.publicKey))
			const hasher = createHash('sha256')
			hasher.update(byteStringToBytes(pubkey))
			const pubkeyHash = bufferToByteString(hasher.digest())
			const backups = await storage.getUserBackups(req.ctx, pubkeyHash)
			if (backups == null) {
				throw new HttpError(HttpStatus.NotFound, ErrorMessage.NO_BACKUPS_FOUND)
			}
			const responseBackups = new Array(backups.length)
			for (let i = 0, len = backups.length; i < len; i++) {
				const backup = backups[i]
				const responseBackup: ResBody['backups'][number] = {
					userId: backup.userId,
					payload: backup.payload,
					updatedAt: backup.updatedAt
				}
				responseBackups[i] = responseBackup
			}
			const response: ResBody = {
				backups: responseBackups,
			}
			res
				.status(HttpStatus.OK)
				.json(response)
		} catch (err) {
			next(err)
		}
	}
}
