import { ok, strictEqual } from 'node:assert/strict'
import type fs from 'node:fs/promises'
import type { Context, Hash, UUID } from '../types.js'
import type { Backup, FileStorage } from './interface.js'
import { gunzip as gunzipCb, gzip as gzipCb } from 'node:zlib'
import { promisify } from 'node:util'
import { S3, type ListObjectsV2CommandInput } from '@aws-sdk/client-s3'

const gunzip = promisify(gunzipCb)
const gzip = promisify(gzipCb)

type Fs = Pick<typeof fs, 'readFile' | 'writeFile' | 'readdir' | 'mkdir' | 'rename' | 'unlink'>

/** Essentially just a dumb blob storaged indexed by some bytes */
export class S3Storage implements FileStorage {
	_bucket: string
	_s3: S3

	constructor(opts: { bucket: string, s3: S3, }) {
		const { bucket, s3, } = opts
		this._bucket = bucket
		this._s3 = s3
	}

	getPubkeyHashPrefix(pubkeyHash: Hash): string {
		// How many levels do we want?
		// We typcaily want no more than 1,000 files per directory
		// so how should we partition the bytes?
		// If we expect 1,000,000 addresses and want at most 1,000 files per directory, then
		// letting `n` be the number of levels
		// 1,000 ** n = 1,000,000
		// n = log(1,000,000) / log(1,000) = 2
		// If a pubkey hash is 32 bytes that means a directory has 32 / 2 = 16 bytes (2+32 hex chars)
		// To be safe let's just break it down by setting n = 4, that let's us store
		// 1,000,000,000,000 pubkeys averaging 1,000 files per directory
		// Therefore we have 32 / 4 = 8, 8 bytes (2 + 16 hex chars) per directory
		const dirnames: string[] = [this._bucket]
		for (let i = 2, len = pubkeyHash.length; i < len; i += 16) {
			dirnames.push(pubkeyHash.slice(i, i + 16))
		}
		return dirnames.join('/')
	}

	getPubkeyHashUserIdKey(pubkeyHash: Hash, userId: UUID): string {
		return `${this.getPubkeyHashPrefix(pubkeyHash)}/${userId}.json.gz`
	}

	async saveUserBackup(ctx: Context, pubkeyHash: Hash, userId: UUID, backup: Backup): Promise<void> {
		const key = this.getPubkeyHashUserIdKey(pubkeyHash, userId)
		ctx.logger.debug({ pubkeyHash, userId, key, }, 'Saving user backup')

		const data = await gzip(Buffer.from(JSON.stringify(backup), 'utf8'))

		await this._s3.putObject({
			Bucket: this._bucket,
			Key: key,
			ContentType: 'application/json',
			ContentEncoding: 'gzip',
			Body: data,
			Metadata: {
				pubkeyHash,
				userId,
				updatedAt: backup.updatedAt,
			}
		})
	}

	async getUserBackups(ctx: Context, pubkeyHash: Hash): Promise<Backup[]> {
		const prefix = this.getPubkeyHashPrefix(pubkeyHash)
		ctx.logger.debug({ pubkeyHash, prefix }, 'Listing user backups')

		const params: ListObjectsV2CommandInput = {
			Bucket: this._bucket,
			Prefix: prefix,
		}

		const maxKeys = 50
		const keys: string[] = [];
		let continuationToken: string | undefined
		let i = 0
		const maxi = 3
		do {
			ctx.signal.throwIfAborted()
			if (i > maxi) {
				ctx.logger.warn({ pubkeyHash, prefix, }, 'Cannot get all user backups, too mange pages.')
				break;
			}
			if (keys.length > maxKeys) {
				ctx.logger.warn({ pubkeyHash, prefix, }, 'Cannot get all user backups, too many keys.')
				break;
			}
			if (continuationToken) params.ContinuationToken = continuationToken
			ctx.logger.trace({ pubkeyHash, prefix, params, }, 'Listing user backups')
			const result = await this._s3.listObjectsV2(params, { abortSignal: ctx.signal, })
			continuationToken = result.ContinuationToken
			ok(Array.isArray(result.Contents), 'Expected result.Contents to be an array')
			for (const item of result.Contents!) {
				strictEqual(typeof item.Key, 'string', 'Expected item.Key to be a string')
				keys.push(item.Key!)
			}
			i++
		} while (!continuationToken)

		keys.splice(maxKeys)

		const backups: Backup[] = []
		for (const key of keys) {
			ctx.signal.throwIfAborted()
			ctx.logger.trace({ pubkeyHash, key, }, 'Getting user backup')
			const result = await this._s3.getObject({
				Bucket: this._bucket,
				Key: key,
			}, { abortSignal: ctx.signal, })
			ok(result.Body, 'Expected result.Body to be defined')
			const compressed = await result.Body.transformToByteArray()
			const buf = await gunzip(compressed)
			const json = buf.toString('utf8')
			const backup: Backup = JSON.parse(json)
			backups.push(backup)
		}

		backups.sort(sortBackupsDescending)

		return backups
	}

	async getUserBackup(ctx: Context, pubkeyHash: Hash, userId: UUID): Promise<null | Backup> {
		const key = this.getPubkeyHashUserIdKey(pubkeyHash, userId)
		ctx.logger.debug({ pubkeyHash, userId, key, }, 'Getting user backup')

		const result = await this._s3.getObject({
			Bucket: this._bucket,
			Key: key,
		}, { abortSignal: ctx.signal, })

		ok(result.Body, 'Expected result.Body to be defined')
		const compressed = await result.Body.transformToByteArray()
		const buf = await gunzip(compressed)
		const json = buf.toString('utf8')
		const backup: Backup = JSON.parse(json)

		return backup
	}
}

function sortBackupsDescending(backupa: Backup, backupb: Backup): number {
	// Iso8601 dates can be sorted by local compare
	return -backupa.updatedAt.localeCompare(backupb.updatedAt)
}
