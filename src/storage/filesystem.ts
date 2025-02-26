import type fs from 'node:fs/promises'
import type { Context, Hash, UUID } from '../types.js'
import { basename, dirname, join, normalize } from 'node:path'
import { tmpdir, } from 'node:os'
import { randomUUID } from 'node:crypto'
import type { Backup, FileStorage } from './interface.js'
import { gunzip as gunzipCb, gzip as gzipCb } from 'node:zlib'
import { promisify } from 'node:util'
import type { Dirent } from 'node:fs'
import { strictEqual } from 'node:assert'
import { MAX_RECENT_BACKUPS } from './constants.js'

const gunzip = promisify(gunzipCb)
const gzip = promisify(gzipCb)

type Fs = Pick<typeof fs, 'readFile' | 'writeFile' | 'readdir' | 'mkdir' | 'rename' | 'unlink'>

/** Essentially just a dumb blob storaged indexed by some bytes */
export class FilesystemStorage implements FileStorage {
	_fs: Fs
	_rootDirpath: string
	_tmpDirpath: string

	constructor(opts: { fs: Fs, rootDirpath: string, tmpDirpath?: string, }) {
		const { fs, rootDirpath, tmpDirpath: useTmpdir, } = opts
		this._fs = fs
		this._rootDirpath = rootDirpath
		this._tmpDirpath = useTmpdir ?? tmpdir()
	}

	getPubkeyHashDirpath(pubkeyHash: Hash): string {
		// Partition the directories so they don't get too big and make the filesystem suck
		strictEqual(pubkeyHash.length, 66, 'Expected pubkey hash to be 32 bytes')
		const p0 = pubkeyHash.slice(2, 4)    // first 8 bits   (2 ** 8 = 256 partitions)
		const p1 = pubkeyHash.slice(4, 6)    // bits 8 to 16   (2 ** 8 = 256 partitions)
		const p2 = pubkeyHash.slice(6, 8)    // bits 16 to 24  (2 ** 8 = 256 partitions)
		const p3 = pubkeyHash.slice(8, 10)   // bits 24 to 32  (2 ** 8 = 256 partitions)
		const p4 = pubkeyHash.slice(10, 12)  // bits 32 to 40  (2 ** 8 = 256 partitions)
		const rest = pubkeyHash.slice(12)    // bits 40 to 256 (possibly lots of files)

		return normalize(join(
			this._rootDirpath,
			'backups',
			p0,
			p1,
			p2,
			p3,
			p4,
			rest
		))
	}

	getPubkeyHashUserIdFilepath(pubkeyHash: Hash, userId: UUID): string {
		return normalize(join(this.getPubkeyHashDirpath(pubkeyHash), `${userId}.json.gz`))
	}

	async saveUserBackup(ctx: Context, pubkeyHash: Hash, userId: UUID, backup: Backup): Promise<void> {
		const filepath = this.getPubkeyHashUserIdFilepath(pubkeyHash, userId)
		ctx.logger.debug({ pubkeyHash, userId, filepath, }, 'Saving user backup')

		const dirpath = dirname(filepath)
		const filename = basename(filepath)
		const tmpfilepath = join(this._tmpDirpath, 'enkrypt-backend', `${filename}-${randomUUID()}.tmp`)
		ctx.logger.trace(`Saving temporary file  ${filepath}=${filepath}`)

		const tmpdirpath = dirname(tmpfilepath)
		ctx.logger.trace(`Creating temporary directory  tmpdirpath=${tmpdirpath}`)
		await this._fs.mkdir(tmpdirpath, { recursive: true, mode: 0o700, })

		const data = await gzip(Buffer.from(JSON.stringify(backup), 'utf8'))

		ctx.logger.trace(`Saving temporary file  tmpfilepath=${tmpfilepath}`)
		await this._fs.writeFile(tmpfilepath, data, { mode: 0o600, })

		ctx.logger.trace(`Creating directory  tmpfilepath=${tmpfilepath}`)
		await this._fs.mkdir(dirpath, { recursive: true, mode: 0o700, })

		ctx.logger.trace({ tmpfilepath, }, 'Renaming temporary file')
		await this._fs.rename(tmpfilepath, filepath)
	}

	async getUserBackups(ctx: Context, pubkeyHash: Hash): Promise<Backup[]> {
		const pubkeyHashDirpath = this.getPubkeyHashDirpath(pubkeyHash)
		ctx.logger.debug(`Getting user backups  pubkeyHashDirpath=${pubkeyHashDirpath}`)
		let files: Dirent[]
		try {
			files = await this._fs.readdir(pubkeyHashDirpath, { withFileTypes: true, })
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
			throw err
		}
		const backups: Backup[] = []
		for (const file of files) {
			ctx.signal.throwIfAborted()
			const compressed = await this._fs.readFile(join(pubkeyHashDirpath, file.name))
			const buf = await gunzip(compressed)
			const json = buf.toString('utf8')
			const backup: Backup = JSON.parse(json)
			backups.push(backup)
		}
		backups.sort(sortBackupsDescending)
		backups.splice(MAX_RECENT_BACKUPS)
		return backups
	}

	async getUserBackup(ctx: Context, pubkeyHash: Hash, userId: UUID): Promise<null | Backup> {
		const pubkeyHashFilename = this.getPubkeyHashUserIdFilepath(pubkeyHash, userId)
		ctx.logger.debug(`Getting user backup  pubkeyHashFilename=${pubkeyHashFilename}`)
		try {
			const compressed = await this._fs.readFile(pubkeyHashFilename)
			const buf = await gunzip(compressed)
			const json = buf.toString('utf8')
			const backup: Backup = JSON.parse(json)
			return backup
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
			throw err
		}
	}

	async deleteUserBackup(ctx: Context, pubkeyHash: Hash, userId: UUID): Promise<void> {
		const pubkeyHashFilename = this.getPubkeyHashUserIdFilepath(pubkeyHash, userId)
		ctx.logger.debug(`Deleting user backup  pubkeyHashFilename=${pubkeyHashFilename}`)
		try {
			await this._fs.unlink(pubkeyHashFilename)
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
				ctx.logger.warn(`Failed to delete user backup: not found  pubkeyHashFilename=${pubkeyHashFilename}`)
				return
			}
			throw err
		}
	}
}

function sortBackupsDescending(backupa: Backup, backupb: Backup): number {
	// Iso8601 dates can be sorted by local compare
	return -backupa.updatedAt.localeCompare(backupb.updatedAt)
}
