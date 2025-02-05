import type { RequestHandler } from "express"
import type { operations } from "../../../openapi.js"
import { HttpError, HttpStatus } from "../../../utils/http.js"
import { bufferToByteString, bytesToByteString, byteStringToBytes, parseByteString, parseUUID } from "../../../utils/coersion.js"
import type { Validators } from "../../../lib/api/validation.js"
import { createHash } from "node:crypto"
import type { FileStorage } from "../../../storage/interface.js"
import { ecrecover, fromRpcSig, hashPersonalMessage } from "@ethereumjs/util"
import { ErrorMessage } from "../../../lib/api/errors.js"
import { ERROR_MESSAGE } from "../../../errors.js"

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
			const { publicKey: publicKeyParam, } = req.params
			if (!validators.pubkey(publicKeyParam)) {
				throw new HttpError(HttpStatus.BadRequest, {
					message: ERROR_MESSAGE.INVALID_PUBLIC_KEY,
					errors: validators.pubkey.errors,
				})
			}

			const { userId: userIdParam, } = req.params
			if (!validators.userId(userIdParam)) {
				throw new HttpError(HttpStatus.BadRequest, {
					message: ERROR_MESSAGE.INVALID_USER_ID,
					errors: validators.userId.errors,
				})
			}

			const { signature: signatureParam } = req.query
			if (!validators.byteString(signatureParam)) {
				throw new HttpError(HttpStatus.BadRequest, {
					message: ERROR_MESSAGE.INVALID_SIGNATURE,
					errors: validators.byteString.errors,
				})
			}

			const pubkey = parseByteString(publicKeyParam)
			const userId = parseUUID(userIdParam)
			const signature = parseByteString(signatureParam)

			const now = new Date()
			// Now minus 10 minutes
			const lb = new Date(now.valueOf() - 10 * 60 * 1_000)
			// Now plus 10 minutes
			const ub = new Date(now.valueOf() + 10 * 60 * 1_000)

			const ymdnow = `${(now.getUTCMonth() + 1).toString().padStart(2, '0')}-${now.getUTCDate().toString().padStart(2, '0')}-${now.getUTCFullYear()}`
			const ymdlb = `${(lb.getUTCMonth() + 1).toString().padStart(2, '0')}-${lb.getUTCDate().toString().padStart(2, '0')}-${lb.getUTCFullYear()}`
			const ymdub = `${(ub.getUTCMonth() + 1).toString().padStart(2, '0')}-${ub.getUTCDate().toString().padStart(2, '0')}-${ub.getUTCFullYear()}`

			const legitMessages = new Set([
				`${userId}-DELETE-BACKUP-${ymdnow}`,
				`${userId}-DELETE-BACKUP-${ymdlb}`,
				`${userId}-DELETE-BACKUP-${ymdub}`
			])

			const esig = fromRpcSig(parseByteString(signature))
			let provenOwnership = false
			for (const message of legitMessages) {
				const messageHash = hashPersonalMessage(Buffer.from(message, 'utf8'))
				const messagePubkey = bytesToByteString(ecrecover(messageHash, esig.v, esig.r, esig.s))
				if (pubkey === messagePubkey) {
					provenOwnership = true
					break;
				}
			}

			if (!provenOwnership) {
				throw new HttpError(HttpStatus.BadRequest, ErrorMessage.SIGNATURE_DOES_NOT_MATCH_PUBKEY)
			}

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
