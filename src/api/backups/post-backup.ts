import type { RequestHandler } from "express"
import type { operations } from "../../openapi.js"
import { HttpError, HttpStatus } from "../../utils/http.js"
import { bufferToByteString, bytesToByteString, byteStringToBytes, parseByteString, parseUUID } from "../../utils/coersion.js"
import type { Validators } from "../../lib/api/validation.js"
import { createHash } from "node:crypto"
import type { Backup, FileStorage } from "../../storage/interface.js"
import { ErrorMessage } from "../../lib/api/errors.js"
import { ecrecover, fromRpcSig, hashPersonalMessage } from "@ethereumjs/util"

type Params = operations['PostUserBackup']['parameters']['path']
type ReqBody = operations['PostUserBackup']['requestBody']
type ResBody = operations['PostUserBackup']['responses']['200']['content']['application/json']
type ReqQuery = operations['PostUserBackup']['parameters']['query']
type Handler = RequestHandler<Params, ResBody, ReqBody, ReqQuery>

export default function createPostUserBackupHandler(opts: {
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
			const body = validators.postUserBackupRequest.validate(req.body)
			const signature = parseByteString(body.signature)
			const payload = byteStringToBytes(parseByteString(body.payload))

			const esig = fromRpcSig(parseByteString(signature))
			const messageHash = hashPersonalMessage(payload)
			const messagePubkey = bytesToByteString(ecrecover(messageHash, esig.v, esig.r, esig.s))

			if (pubkey !== messagePubkey) {
				throw new HttpError(HttpStatus.BadRequest, ErrorMessage.SIGNATURE_DOES_NOT_MATCH_PUBKEY)
			}

			const backup: Backup = {
				userId,
				pubkey,
				updatedAt: new Date().toISOString(),
				payload: bytesToByteString(payload),
			}

			const hasher = createHash('sha256')
			hasher.update(byteStringToBytes(pubkey))
			const pubkeyHash = bufferToByteString(hasher.digest())

			await storage.saveUserBackup(req.ctx, pubkeyHash, userId, backup)

			const response: ResBody = { message: 'Ok' }

			res.status(HttpStatus.OK).json(response)
		} catch (err) {
			next(err)
		}
	}
}
