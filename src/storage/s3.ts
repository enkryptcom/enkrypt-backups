import { ok, strictEqual } from 'node:assert/strict'
import type { ByteString, Context, Hash, Iso8601, UUID } from '../types.js'
import type { Backup, BackupSummary, FileStorage } from './interface.js'
import { gunzip as gunzipCb, gzip as gzipCb } from 'node:zlib'
import { promisify } from 'node:util'
import { NoSuchKey, S3, type GetObjectCommandOutput, type HeadObjectCommandOutput, type ListObjectsV2CommandInput, type ListObjectsV2CommandOutput } from '@aws-sdk/client-s3'
import { MAX_RECENT_BACKUPS } from './constants.js'

const gunzip = promisify(gunzipCb)
const gzip = promisify(gzipCb)

/** Maximum S3 allows is 1_000 */
const MAX_KEYS_PER_SCAN = 1_000
const MAX_KEYS_SCANNED = 2_000
/** (Safeguard against infinite loop) */
const MAX_SCANS = 3

type BackupMetadata = {
	pubkeyhash: Hash,
	// pubkey: ByteString,
	userid: UUID,
	updatedat: Iso8601
}


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
		const rest = pubkeyHash.slice(6)     // bits 16 to 256 (lots of files)

		// const p2 = pubkeyHash.slice(6, 8)    // bits 16 to 24  (2 ** 8 = 256 partitions)
		// const p3 = pubkeyHash.slice(8, 10)   // bits 24 to 32  (2 ** 8 = 256 partitions)
		// const p4 = pubkeyHash.slice(10, 12)  // bits 32 to 40  (2 ** 8 = 256 partitions)
		// const rest = pubkeyHash.slice(12)    // bits 40 to 256 (possibly lots of files)

		// return `${this._rootPath}backups/${p0}/${p1}/${p2}/${p3}/${p4}/${rest}`
		return `${this._rootPath}backups/${p0}/${p1}/${rest}`
	}

	getPubkeyHashUserIdKey(pubkeyHash: Hash, userId: UUID): string {
		return `${this.getPubkeyHashPrefix(pubkeyHash)}/${userId}.json.gz`
	}

	async saveUserBackup(
		ctx: Context,
		pubkeyHash: Hash,
		userId: UUID,
		backup: Backup,
	): Promise<void> {
		const key = this.getPubkeyHashUserIdKey(pubkeyHash, userId)
		ctx.logger.debug(`Saving user backup  key=${key}`)

		const data = await gzip(Buffer.from(JSON.stringify(backup), 'utf8'))

		const metadata: BackupMetadata = {
			pubkeyhash: pubkeyHash,
			// pubkey,
			userid: userId,
			updatedat: backup.updatedAt,
		}

		await this._s3.putObject({
			Bucket: this._bucket,
			Key: key,
			ContentType: 'application/json',
			ContentEncoding: 'gzip',
			Body: data,
			Metadata: metadata,
		})
	}

	async getUserBackups(ctx: Context, pubkeyHash: Hash): Promise<BackupSummary[]> {
		const prefix = this.getPubkeyHashPrefix(pubkeyHash)
		ctx.logger.debug(`Getting user backups  prefix=${prefix}`)

		let continuationToken: string | undefined
		let scani = 0
		let allBackupEntries: NonNullable<ListObjectsV2CommandOutput['Contents']>[number][] = []
		do {
			const params: ListObjectsV2CommandInput = {
				Bucket: this._bucket,
				Prefix: prefix,
				ContinuationToken: continuationToken,
				MaxKeys: MAX_KEYS_PER_SCAN,
			}
			ctx.signal.throwIfAborted()

			if (scani >= MAX_SCANS) {
				// This is a safeguard against infinite loops
				ctx.logger.warn(`Cannot get all user backups, too many pages  prefix=${prefix}`)
				break;
			}

			if (allBackupEntries.length > MAX_KEYS_SCANNED) {
				// Stop scanning, we've exceeded the limit of how many we care about already
				ctx.logger.warn(`Cannot get all user backups, too many keys  prefix=${prefix}`)
				break;
			}

			ctx.logger.trace(`Listing user backups  prefix=${prefix}`)
			const result = await this._s3.listObjectsV2(params, { abortSignal: ctx.signal, })

			const next = result.Contents ?? []
			ok(Array.isArray(next), 'Expected result.Contents to be an array')

			const alli0 = allBackupEntries.length
			const nextLen = next.length
			allBackupEntries.length += nextLen
			for (let nexti = 0; nexti < nextLen; nexti++) {
				const entry = next[nexti]
				strictEqual(typeof entry.Key, 'string', 'Expected entry.Key to be a string')
				ok(entry.LastModified instanceof Date, 'Expected entry.LastModified to be a Date')
				allBackupEntries[alli0 + nexti] = next[nexti]
			}
			scani++
		} while (continuationToken)

		// Keep only the most recent n keys
		allBackupEntries.sort(sortS3ListLastModifiedDescending)
		const recentBackupEntries = allBackupEntries.slice(0, MAX_RECENT_BACKUPS)
		const recentBackupsCount = recentBackupEntries.length

		// Get The metadata of each key (concurrently)
		const recentBackupKeys = new Array<string>(recentBackupsCount)
		for (let i = 0; i < recentBackupsCount; i++) {
			const key = recentBackupEntries[i].Key
			ok(key, 'Expected key to be defined')
			recentBackupKeys[i] = key
		}
		const recentBackupHeads = await this._getAllHeads(ctx, recentBackupKeys)
		strictEqual(recentBackupHeads.length, recentBackupsCount, 'Expected recentBackupHeads.length to match recentBackupKeys.length')

		// Construct a summary for each backup using its metadata
		const backupSummaries = new Array<BackupSummary>(recentBackupsCount)
		for (let i = 0; i < recentBackupsCount; i++) {
			const head = recentBackupHeads[i]
			ok(head.Metadata, 'Expected head.Metadata to be defined')
			const metadata = head.Metadata as BackupMetadata
			backupSummaries[i] = {
				userId: metadata.userid,
				updatedAt: metadata.updatedat,
			}
		}

		return backupSummaries
	}

	async getUserBackup(ctx: Context, pubkeyHash: Hash, userId: UUID): Promise<null | Backup> {
		const key = this.getPubkeyHashUserIdKey(pubkeyHash, userId)
		ctx.logger.debug(`Getting user backup  key=${key}`)

		let result: GetObjectCommandOutput
		try {
			result = await this._s3.getObject({
				Bucket: this._bucket,
				Key: key,
			}, { abortSignal: ctx.signal, })
		} catch (err) {
			if ((err as NoSuchKey).name === 'NoSuchKey') {
				return null
			}
			throw err
		}

		ok(result.Body, 'Expected result.Body to be defined')
		const compressed = await result.Body.transformToByteArray()
		const buf = await gunzip(compressed)
		const json = buf.toString('utf8')
		const backup: Backup = JSON.parse(json)

		return backup
	}

	async deleteUserBackup(ctx: Context, pubkeyHash: Hash, userId: UUID): Promise<void> {
		const key = this.getPubkeyHashUserIdKey(pubkeyHash, userId)
		ctx.logger.debug(`Deleting user backup  key=${key}`)

		// Noop if they key doesn't exist (doesn't throw)
		await this._s3.deleteObject({
			Bucket: this._bucket,
			Key: key,
		}, { abortSignal: ctx.signal, })
	}

	private _getAllHeads(ctx: Context, keys: string[]): Promise<HeadObjectCommandOutput[]> {
		return new Promise<HeadObjectCommandOutput[]>((res, rej) => {
			const count = keys.length
			const concurrency = 5
			let active = 0
			let errref: undefined | { err: Error }
			let nexti = 0
			const heads = new Array<HeadObjectCommandOutput>(count)

			const next = async () => {
				const i = nexti
				const key = keys[i]
				nexti++
				try {
					const head = await this._s3.headObject({
						Bucket: this._bucket,
						Key: key,
					}, { abortSignal: ctx.signal, })
					heads[i] = head
					ok(head.Metadata, 'Expected head.Metadata to be defined')
				} catch (err) {
					if (!ctx.signal.aborted) {
						if (errref) {
							ctx.logger.warn({ err, }, `Suppressing multiple errors in parallel headObject: ${String(err)}`)
						} else {
							errref = { err: err as Error }
						}
					}
				}

				active--
				if (active === 0 && (errref || ctx.signal.aborted)) {
					rej(errref?.err ?? ctx.signal.reason)
					return
				}
				if (active === 0 && nexti >= count) {
					res(heads)
					return
				}
				if (nexti < count) {
					active++
					next()
				}
			}

			for (let i = 0, c = Math.min(concurrency, count); i < c; i++) {
				active++
				next()
			}
		})
	}
}

function sortS3ListLastModifiedDescending(
	backupa: NonNullable<ListObjectsV2CommandOutput['Contents']>[number],
	backupb: NonNullable<ListObjectsV2CommandOutput['Contents']>[number],
): number {
	return backupb.LastModified!.getTime() - backupa.LastModified!.getTime()
}


