import type fs from 'node:fs/promises'
import type { Context, Hash, UUID } from '../types.js'
import { basename, dirname, join, normalize } from 'node:path'
import { tmpdir, } from 'node:os'
import { randomUUID } from 'node:crypto'
import type { Backup, FileStorage } from './interface.js'
import { gunzip as gunzipCb, gzip as gzipCb } from 'node:zlib'
import { promisify } from 'node:util'
import type { Dirent } from 'node:fs'

const gunzip = promisify(gunzipCb)
const gzip = promisify(gzipCb)

type Fs = Pick<typeof fs, 'readFile' | 'writeFile' | 'readdir' | 'mkdir' | 'rename' | 'unlink'>

/** Essentially just a dumb blob storaged indexed by some bytes */
export class FilesystemStorage implements FileStorage {
	_fs: Fs
	_rootDirpath: string
	_tmpdir: string

	constructor(opts: { fs: Fs, rootDirpath: string, tmpdir?: string, }) {
		const { fs, rootDirpath, tmpdir: useTmpdir, } = opts
		this._fs = fs
		this._rootDirpath = rootDirpath
		this._tmpdir = useTmpdir ?? tmpdir()
	}

	getPubkeyHashDirpath(pubkeyHash: Hash): string {
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
		const dirnames: string[] = [this._rootDirpath]
		for (let i = 2, len = pubkeyHash.length; i < len; i += 16) {
			dirnames.push(pubkeyHash.slice(i, i + 16))
		}
		return normalize(join(...dirnames))
	}

	getPubkeyHashUserIdFilepath(pubkeyHash: Hash, userId: UUID): string {
		return normalize(join(this.getPubkeyHashDirpath(pubkeyHash), `${userId}.json.gz`))
	}

	async saveUserBackup(ctx: Context, pubkeyHash: Hash, userId: UUID, backup: Backup): Promise<void> {
		const filepath = this.getPubkeyHashUserIdFilepath(pubkeyHash, userId)
		ctx.logger.debug({ pubkeyHash, userId, filepath, }, 'Saving user backup')

		const dirpath = dirname(filepath)
		const filename = basename(filepath)
		const tmpfilepath = join(this._tmpdir, 'enkrypt-backend', `${filename}-${randomUUID()}.tmp`)
		ctx.logger.trace({ pubkeyHash, userId, filepath, tmpfilepath }, 'Saving temporary file')

		const tmpdirpath = dirname(tmpfilepath)
		ctx.logger.trace({ tmpdirpath, }, 'Creating temporary directory')
		await this._fs.mkdir(tmpdirpath, { recursive: true, mode: 0o700, })

		const data = await gzip(Buffer.from(JSON.stringify(backup), 'utf8'))

		ctx.logger.trace({ tmpfilepath, }, 'Saving temporary file')
		await this._fs.writeFile(tmpfilepath, data, { mode: 0o600, })

		ctx.logger.trace({ tmpfilepath, }, 'Creating directory')
		await this._fs.mkdir(dirpath, { recursive: true, mode: 0o700, })

		ctx.logger.trace({ tmpfilepath, }, 'Renaming temporary file')
		await this._fs.rename(tmpfilepath, filepath)
	}

	async getUserBackups(ctx: Context, pubkeyHash: Hash): Promise<Backup[]> {
		const pubkeyHashDirpath = this.getPubkeyHashDirpath(pubkeyHash)
		ctx.logger.debug({ pubkeyHash, pubkeyHashDirpath, }, 'Getting user backups')
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
		return backups
	}

	async getUserBackup(ctx: Context, pubkeyHash: Hash, userId: UUID): Promise<null | Backup> {
		const pubkeyHashFilename = this.getPubkeyHashUserIdFilepath(pubkeyHash, userId)
		ctx.logger.debug({ pubkeyHash, userId, pubkeyHashFilename, }, 'Getting user backup')
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
}

function sortBackupsDescending(backupa: Backup, backupb: Backup): number {
	// Iso8601 dates can be sorted by local compare
	return -backupa.updatedAt.localeCompare(backupb.updatedAt)
}
