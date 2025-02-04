import type { RequestHandler } from "express"
import type { operations } from "../../openapi.js"
import { HttpStatus } from "../../utils/http.js"
import { bufferToByteString, byteStringToBytes, parseByteString, parseUUID } from "../../utils/coersion.js"
import type { Validators } from "../../lib/api/validation.js"
import { createHash } from "node:crypto"
import type { FileStorage } from "../../storage/interface.js"

type Params = operations['DeleteUserBackup']['parameters']['path']
type ReqBody = operations['DeleteUserBackup']['requestBody']
type ResBody = operations['DeleteUserBackup']['responses']['200']['content']['application/json']
type ReqQuery = operations['DeleteUserBackup']['parameters']['query']
type Handler = RequestHandler<Params, ResBody, ReqBody, ReqQuery>

export default function createDeleteUserBackupHandler(opts: {
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
			const userId = parseUUID(validators.userIdParameter.validate(req.params.userId))

			const hasher = createHash('sha256')
			hasher.update(byteStringToBytes(pubkey))
			const pubkeyHash = bufferToByteString(hasher.digest())

			await storage.deleteUserBackup(req.ctx, pubkeyHash, userId)

			const response: ResBody = { message: 'Ok' }

			res.status(HttpStatus.OK).json(response)
		} catch (err) {
			next(err)
		}
	}
}
