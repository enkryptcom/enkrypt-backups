import { ok, strictEqual } from 'node:assert/strict'
import type { Context, Hash, UUID } from '../types.js'
import type { Backup, FileStorage } from './interface.js'
import { gunzip as gunzipCb, gzip as gzipCb } from 'node:zlib'
import { promisify } from 'node:util'
import { S3, type ListObjectsV2CommandInput } from '@aws-sdk/client-s3'

const gunzip = promisify(gunzipCb)
const gzip = promisify(gzipCb)

/** Essentially just a dumb blob storaged indexed by some bytes */
export class S3Storage implements FileStorage {
	_bucket: string
	_rootPath: string
	_s3: S3

	constructor(opts: { bucket: string, rootPath?: string, s3: S3, }) {
		const { bucket, rootPath, s3, } = opts
		if (rootPath && !rootPath.endsWith('/')) {
			throw new Error(`Expected rootPath to end with a slash: ${rootPath}`)
		}
		this._bucket = bucket
		this._rootPath = rootPath ?? ''
		this._s3 = s3
	}

	getPubkeyHashPrefix(pubkeyHash: Hash): string {
		// Partition the directories so they don't get too big and make the filesystem suck
		strictEqual(pubkeyHash.length, 66, 'Expected pubkey hash to be 32 bytes')
		const p0 = pubkeyHash.slice(2, 4)    // first 8 bits   (2 ** 8 = 256 partitions)
		const p1 = pubkeyHash.slice(4, 6)    // bits 8 to 16   (2 ** 8 = 256 partitions)
		const p2 = pubkeyHash.slice(6, 8)    // bits 16 to 24  (2 ** 8 = 256 partitions)
		const p3 = pubkeyHash.slice(8, 10)   // bits 24 to 32  (2 ** 8 = 256 partitions)
		const p4 = pubkeyHash.slice(10, 12)  // bits 32 to 40  (2 ** 8 = 256 partitions)
		const rest = pubkeyHash.slice(12)    // bits 40 to 256 (possibly lots of files)

		return `${this._rootPath}backups/${p0}/${p1}/${p2}/${p3}/${p4}/${rest}`
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
