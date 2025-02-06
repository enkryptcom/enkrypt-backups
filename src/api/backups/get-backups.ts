import type { RequestHandler } from "express"
import type { operations } from "../../openapi.js"
import { HttpError, HttpStatus } from "../../utils/http.js"
import { bufferToByteString, bytesToByteString, byteStringToBytes, parseByteString } from "../../utils/coersion.js"
import { createHash } from "node:crypto"
import type { FileStorage } from "../../storage/interface.js"
import { ERROR_MESSAGE } from "../../errors.js"
import { ecrecover, fromRpcSig, hashPersonalMessage } from "@ethereumjs/util"
import type { Validators } from "../../validation.js"

type Params = operations['GetUserBackups']['parameters']['path']
type ReqBody = operations['GetUserBackups']['requestBody']
type ResBody = operations['GetUserBackups']['responses']['200']['content']['application/json']
type ReqQuery = operations['GetUserBackups']['parameters']['query']
type Handler = RequestHandler<Params, ResBody, ReqBody, ReqQuery>

export default function createGetBackupsHandler(opts: {
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

			const { signature: signatureParam } = req.query
			if (!validators.byteString(signatureParam)) {
				throw new HttpError(HttpStatus.BadRequest, {
					message: ERROR_MESSAGE.INVALID_SIGNATURE,
					errors: validators.byteString.errors,
				})
			}

			const pubkey = parseByteString(publicKeyParam)
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
				`${pubkey}-GET-BACKUPS-${ymdnow}`,
				`${pubkey}-GET-BACKUPS-${ymdlb}`,
				`${pubkey}-GET-BACKUPS-${ymdub}`
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
				throw new HttpError(HttpStatus.BadRequest, ERROR_MESSAGE.SIGNATURE_DOES_NOT_MATCH_PUBKEY)
			}

			const hasher = createHash('sha256')
			hasher.update(byteStringToBytes(pubkey))
			const pubkeyHash = bufferToByteString(hasher.digest())
			const backups = await storage.getUserBackups(req.ctx, pubkeyHash)
			if (backups == null) {
				throw new HttpError(HttpStatus.NotFound, ERROR_MESSAGE.NO_BACKUPS_FOUND)
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

