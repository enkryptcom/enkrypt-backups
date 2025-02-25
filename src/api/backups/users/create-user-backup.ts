import type { RequestHandler } from "express"
import type { operations } from "../../../openapi.js"
import { HttpError, HttpStatus } from "../../../utils/http.js"
import { bufferToByteString, bytesToByteString, byteStringToBytes, parseByteString, parseUUID } from "../../../utils/coersion.js"
import { createHash } from "node:crypto"
import type { Backup, FileStorage } from "../../../storage/interface.js"
import { ecrecover, fromRpcSig, hashPersonalMessage } from "@ethereumjs/util"
import { ERROR_MESSAGE } from "../../../errors.js"
import type { Validators } from "../../../validation.js"

type Params = operations['CreateUserBackup']['parameters']['path']
type ReqBody = NonNullable<operations['CreateUserBackup']['requestBody']>['content']['application/json']
type ResBody = operations['CreateUserBackup']['responses']['200']['content']['application/json']
type ReqQuery = NonNullable<operations['CreateUserBackup']['parameters']['query']>
type Handler = RequestHandler<Params, ResBody, ReqBody, ReqQuery>

export default function createCreateUserBackupHandler(opts: {
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

			const body = req.body
			if (!validators.createUserBackupRequest(body)) {
				throw new HttpError(HttpStatus.BadRequest, {
					message: ERROR_MESSAGE.INVALID_REQUEST_BODY,
					errors: validators.createUserBackupRequest.errors,
				})
			}

			const pubkey = parseByteString(publicKeyParam)
			const userId = parseUUID(userIdParam)
			const signature = parseByteString(signatureParam)
			const payload = byteStringToBytes(parseByteString(body.payload))

			const esig = fromRpcSig(parseByteString(signature))
			const messageHash = hashPersonalMessage(payload)
			const messagePubkey = bytesToByteString(ecrecover(messageHash, esig.v, esig.r, esig.s))

			if (pubkey !== messagePubkey) {
				throw new HttpError(HttpStatus.BadRequest, ERROR_MESSAGE.SIGNATURE_DOES_NOT_MATCH_PUBKEY)
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

