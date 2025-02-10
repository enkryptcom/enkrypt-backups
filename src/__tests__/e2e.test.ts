import { describe, it } from "node:test";
import { pino } from "pino";
import { Disposer } from "../utils/disposer.js";
import http from 'node:http'
import type { components } from "../openapi.js";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from 'yaml'
import { type OpenAPIV3_1 } from "openapi-types";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { ecsign, hashPersonalMessage, privateToPublic, toRpcSig, } from '@ethereumjs/util'
import { bufferToByteString, bytesToByteString, byteStringToBytes, } from "../utils/coersion.js";
import pinoPretty from 'pino-pretty'
import { join } from "node:path";
import { gunzip, } from 'node:zlib'
import type { Backup } from "../storage/interface.js";
import { getApiHttpConfig, getStorageConfig, } from "../env.js";
import { setup } from "../commands/api/setup.js";
import { ERROR_MESSAGE } from "../errors.js";


describe('e2e', { timeout: 10_000, }, function() {
	// YOLO
	it('should work', async function() {
		const logger = pino(pinoPretty({ singleLine: true, colorize: true, sync: true, }))
		// You can turn on logging by changing the level to 'trace' to debug the test
		logger.level = 'silent'
		// logger.level = 'trace'
		await using disposer = new Disposer()

		const host = '127.0.0.1'
		const port = 3002

		const httpConfig = getApiHttpConfig({
			API_HTTP_HOST: '127.0.0.1',
			API_HTTP_PORT: '3002',
		})
		const storageConfig = getStorageConfig({
			STORAGE_DRIVER: 'FS',
			STORAGE_FILESYSTEM_ROOT_DIRPATH: 'storage.tests',
		})

		const config = await setup({
			disposer,
			logger,
			metrics: undefined,
			httpConfig,
			storageConfig,
		})

		const { httpServer, httpRouter, } = config

		httpServer.on('request', httpRouter)

		// Start listening on the HTTP server
		await new Promise<void>(function(res, rej) {
			function onListening() {
				cleanup()
				res()
			}
			function onError(err: Error) {
				cleanup()
				rej(err)
			}
			function cleanup() {
				httpServer.on('listening', onListening)
				httpServer.on('error', onError)
			}
			httpServer.on('listening', onListening)
			httpServer.on('error', onError)
			httpServer.listen(port, host)
		})

		disposer.defer(async function() {
			// Close server
			await new Promise<void>(function(res, rej) {
				function onClose() {
					cleanup()
					res()
				}
				function onError(err: Error) {
					cleanup()
					rej(err)
				}
				function cleanup() {
					httpServer.off('close', onClose)
					httpServer.off('error', onError)
				}
				httpServer.on('close', onClose)
				httpServer.on('error', onError)
				httpServer.close()
			})
		})

		// Ping the /health endpoint
		type HealthResult = components['schemas']['GetHealthResponse']
		const healthResponse = await new Promise<HealthResult>(function(res, rej) {
			const request = http.request({
				host,
				port,
				path: '/health',
				method: 'GET',
				signal: AbortSignal.timeout(5_000),
			})

			request.on('response', function(response: http.IncomingMessage) {
				if (response.statusCode !== 200) {
					rej(new Error(`Expected GET /health status code 200, got ${response.statusCode}`))
					return
				}

				let errRef: { err: Error } | undefined
				let chunks: Buffer[] = []
				response.on('data', function(chunk) {
					chunks.push(chunk)
				})
				response.on('error', function(err) {
					errRef = { err }
				})
				response.on('end', function() {
					if (errRef) rej(errRef.err)
					else {
						try {
							const json = Buffer.concat(chunks).toString('utf8')
							const data = JSON.parse(json)
							res(data)
						} catch (err) {
							rej(new Error(`Failed to parse JSON: ${(err as Error)?.message}`))
						}
					}
				})
			})

			request.on('error', function(err) {
				rej(err)
			})

			request.end()
		})

		// Check the /health response
		deepStrictEqual(healthResponse, { message: 'Ok', })

		// Ping /version endpoint
		type VersionResult = components['schemas']['GetVersionResponse']
		const versionResponse = await new Promise<VersionResult>(function(res, rej) {
			const request = http.request({
				host,
				port,
				path: '/version',
				method: 'GET',
				signal: AbortSignal.timeout(5_000),
			})

			request.on('response', function(response: http.IncomingMessage) {
				if (response.statusCode !== 200) {
					rej(new Error(`Expected GET /version status code 200, got ${response.statusCode}`))
					return
				}

				let errRef: { err: Error } | undefined
				let chunks: Buffer[] = []
				response.on('data', function(chunk) {
					chunks.push(chunk)
				})
				response.on('error', function(err) {
					errRef = { err }
				})
				response.on('end', function() {
					if (errRef) rej(errRef.err)
					else {
						try {
							const json = Buffer.concat(chunks).toString('utf8')
							const data = JSON.parse(json)
							res(data)
						} catch (err) {
							rej(new Error(`Failed to parse JSON: ${(err as Error)?.message}`))
						}
					}
				})
			})

			request.on('error', function(err) {
				rej(err)
			})

			request.end()
		})

		// Check /version result
		const expectedVersion = JSON.parse(await readFile('package.json', 'utf8')).version
		strictEqual(versionResponse.version, expectedVersion, 'Version mismatch')

		// Ping /schema.yaml endpoint
		type SchemaResponse = components['schemas']['GetSchemaYamlResponse']
		const schemaResponse = await new Promise<OpenAPIV3_1.Document>(function(res, rej) {
			const request = http.request({
				host,
				port,
				path: '/schema.yaml',
				method: 'GET',
				signal: AbortSignal.timeout(5_000),
			})

			request.on('response', function(response: http.IncomingMessage) {
				if (response.statusCode !== 200) {
					rej(new Error(`Expected GET /schema status code 200, got ${response.statusCode}`))
					return
				}

				let errRef: { err: Error } | undefined
				let chunks: Buffer[] = []
				response.on('data', function(chunk) {
					chunks.push(chunk)
				})
				response.on('error', function(err) {
					errRef = { err }
				})
				response.on('end', function() {
					if (errRef) rej(errRef.err)
					else {
						try {
							const yaml = Buffer.concat(chunks).toString('utf8') as SchemaResponse
							const data = parseYaml(yaml)
							res(data)
						} catch (err) {
							rej(new Error(`Failed to parse JSON: ${(err as Error)?.message}`))
						}
					}
				})
			})

			request.on('error', function(err) {
				rej(err)
			})

			request.end()
		})


		// Check /schema.yaml result
		strictEqual(schemaResponse.openapi, '3.1.0')
		strictEqual(schemaResponse.info.title, 'Enkrypt Backend API')

		// Save a backup
		const privkey = randomBytes(32)
		const pubkey = bytesToByteString(privateToPublic(privkey))
		const userId = randomUUID()

		const backupPayload = { hello: 'world' }
		const mockEncryptedBackup = Buffer.from(JSON.stringify(backupPayload), 'utf8')

		type PostBackupResult = components['schemas']['PostUserBackupResponse']
		const postBackupResult = await new Promise<PostBackupResult>(function(res, rej) {
			const messageHash = hashPersonalMessage(mockEncryptedBackup)
			const ecsig = ecsign(messageHash, privkey)
			const signature = toRpcSig(ecsig.v, ecsig.r, ecsig.s)

			const body: components['schemas']['CreateUserBackupRequest'] = {
				payload: bufferToByteString(mockEncryptedBackup),
			}

			const request = http.request({
				host,
				port,
				path: `/backups/${pubkey}/users/${userId}?signature=${signature}`,
				method: 'POST',
				signal: AbortSignal.timeout(5_000),
				headers: { 'content-type': 'application/json' },
			})

			request.on('response', function(response: http.IncomingMessage) {
				if (response.statusCode !== 200) {
					rej(new Error(`Expected POST backup status code 200, got ${response.statusCode}`))
					return
				}

				let errRef: { err: Error } | undefined
				let chunks: Buffer[] = []
				response.on('data', function(chunk) {
					chunks.push(chunk)
				})
				response.on('error', function(err) {
					errRef = { err }
				})
				response.on('end', function() {
					if (errRef) rej(errRef.err)
					else {
						try {
							const json = Buffer.concat(chunks).toString('utf8')
							const data = JSON.parse(json)
							res(data)
						} catch (err) {
							rej(new Error(`Failed to parse JSON: ${(err as Error)?.message}`))
						}
					}
				})
			})

			request.on('error', function(err) {
				rej(err)
			})

			request.write(JSON.stringify(body))
			request.end()
		})

		deepStrictEqual(postBackupResult, { message: 'Ok', })

		// Check that we find our (not actually) encrypted backup in the filesystem
		// (file path comes from `storage/filesystem`)
		const pubkeyHasher = createHash('sha256')
		pubkeyHasher.update(byteStringToBytes(pubkey))
		const pubkeyHash = bufferToByteString(pubkeyHasher.digest())
		const filepath = join(
			'storage.tests',
			'backups',
			pubkeyHash.slice(2, 4),
			pubkeyHash.slice(4, 6),
			pubkeyHash.slice(6, 8),
			pubkeyHash.slice(8, 10),
			pubkeyHash.slice(10, 12),
			pubkeyHash.slice(12),
			`${userId}.json.gz`
		)
		const mockBackupInFilesystem: Backup = await readFile(filepath)
			.then((file) => new Promise(function(res, rej) {
				gunzip(file, function(err, content) {
					if (err) rej(err)
					else {
						try {
							const json = content.toString('utf8')
							const data = JSON.parse(json) as Backup
							res(data)
						} catch (err) {
							rej(err)
						}
					}
				})
			}))

		strictEqual(mockBackupInFilesystem.payload, bufferToByteString(mockEncryptedBackup), 'Payload mismatch')

		// Check we can retrieve it in the list of backups returned by the API
		type GetBackupsResult1 = components['schemas']['GetUserBackupsResponse']
		const getBackupsResult1 = await new Promise<GetBackupsResult1>(function(res, rej) {
			const now = new Date()
			const message = `${pubkey}-GET-BACKUPS-${(now.getUTCMonth() + 1).toString().padStart(2, '0')}-${now.getUTCDate().toString().padStart(2, '0')}-${now.getUTCFullYear()}`
			const messageHash = hashPersonalMessage(Buffer.from(message, 'utf8'))
			const ecsig = ecsign(messageHash, privkey)
			const signature = toRpcSig(ecsig.v, ecsig.r, ecsig.s)

			const request = http.request({
				host,
				port,
				path: `/backups/${pubkey}?signature=${signature}`,
				method: 'GET',
				signal: AbortSignal.timeout(5_000),
				headers: { 'content-type': 'application/json' },
			})

			request.on('response', function(response: http.IncomingMessage) {
				if (response.statusCode !== 200) {
					rej(new Error(`Expected GET backups status code 200, got ${response.statusCode}`))
					return
				}

				let errRef: { err: Error } | undefined
				let chunks: Buffer[] = []
				response.on('data', function(chunk) {
					chunks.push(chunk)
				})
				response.on('error', function(err) {
					errRef = { err }
				})
				response.on('end', function() {
					if (errRef) rej(errRef.err)
					else {
						try {
							const json = Buffer.concat(chunks).toString('utf8')
							const data = JSON.parse(json)
							res(data)
						} catch (err) {
							rej(new Error(`Failed to parse JSON: ${(err as Error)?.message}`))
						}
					}
				})
			})

			request.on('error', function(err) {
				rej(err)
			})

			request.end()
		})

		ok(getBackupsResult1 && typeof getBackupsResult1 === 'object', 'Expected object')
		ok(Array.isArray(getBackupsResult1.backups), 'Expected array')
		deepStrictEqual(getBackupsResult1, {
			backups: [{
				userId,
				updatedAt: getBackupsResult1.backups[0].updatedAt, // :)
				// payload: bufferToByteString(mockEncryptedBackup),
			}]
		} satisfies components['schemas']['GetUserBackupsResponse'])

		// Check we can retrieve it using the API
		type GetBackupResult1 = components['schemas']['GetUserBackupResponse']
		const getBackupResult1 = await new Promise<GetBackupResult1>(function(res, rej) {
			const now = new Date()
			const message = `${userId}-GET-BACKUP-${(now.getUTCMonth() + 1).toString().padStart(2, '0')}-${now.getUTCDate().toString().padStart(2, '0')}-${now.getUTCFullYear()}`
			const messageHash = hashPersonalMessage(Buffer.from(message, 'utf8'))
			const ecsig = ecsign(messageHash, privkey)
			const signature = toRpcSig(ecsig.v, ecsig.r, ecsig.s)

			const request = http.request({
				host,
				port,
				path: `/backups/${pubkey}/users/${userId}?signature=${signature}`,
				method: 'GET',
				signal: AbortSignal.timeout(5_000),
				headers: { 'content-type': 'application/json' },
			})

			request.on('response', function(response: http.IncomingMessage) {
				if (response.statusCode !== 200) {
					rej(new Error(`Expected GET backups status code 200, got ${response.statusCode}`))
					return
				}

				let errRef: { err: Error } | undefined
				let chunks: Buffer[] = []
				response.on('data', function(chunk) {
					chunks.push(chunk)
				})
				response.on('error', function(err) {
					errRef = { err }
				})
				response.on('end', function() {
					if (errRef) rej(errRef.err)
					else {
						try {
							const json = Buffer.concat(chunks).toString('utf8')
							const data = JSON.parse(json)
							res(data)
						} catch (err) {
							rej(new Error(`Failed to parse JSON: ${(err as Error)?.message}`))
						}
					}
				})
			})

			request.on('error', function(err) {
				rej(err)
			})

			request.end()
		})

		ok(getBackupResult1 && typeof getBackupResult1 === 'object', 'Expected object')
		ok(getBackupResult1.backup && typeof getBackupResult1.backup === 'object', 'Expected object')
		deepStrictEqual(getBackupResult1, {
			backup: {
				userId,
				updatedAt: getBackupResult1.backup.updatedAt, // :)
				payload: bufferToByteString(mockEncryptedBackup),
			}
		} satisfies components['schemas']['GetUserBackupResponse'])

		// Delete the backup

		type DeleteBackupResult = components['schemas']['DeleteUserBackupResponse']
		const deleteBackupResult = await new Promise<DeleteBackupResult>(function(res, rej) {
			const now = new Date()
			const message = `${userId}-DELETE-BACKUP-${(now.getUTCMonth() + 1).toString().padStart(2, '0')}-${now.getUTCDate().toString().padStart(2, '0')}-${now.getUTCFullYear()}`
			const messageHash = hashPersonalMessage(Buffer.from(message, 'utf8'))
			const ecsig = ecsign(messageHash, privkey)
			const signature = toRpcSig(ecsig.v, ecsig.r, ecsig.s)

			const request = http.request({
				host,
				port,
				path: `/backups/${pubkey}/users/${userId}?signature=${signature}`,
				method: 'DELETE',
				signal: AbortSignal.timeout(5_000),
				headers: { 'content-type': 'application/json' },
			})

			request.on('response', function(response: http.IncomingMessage) {
				if (response.statusCode !== 200) {
					rej(new Error(`Expected DELETE backup status code 200, got ${response.statusCode}`))
					return
				}

				let errRef: { err: Error } | undefined
				let chunks: Buffer[] = []
				response.on('data', function(chunk) {
					chunks.push(chunk)
				})
				response.on('error', function(err) {
					errRef = { err }
				})
				response.on('end', function() {
					if (errRef) rej(errRef.err)
					else {
						try {
							const json = Buffer.concat(chunks).toString('utf8')
							const data = JSON.parse(json)
							res(data)
						} catch (err) {
							rej(new Error(`Failed to parse JSON: ${(err as Error)?.message}`))
						}
					}
				})
			})

			request.on('error', function(err) {
				rej(err)
			})

			request.end()
		})

		deepStrictEqual(deleteBackupResult, { message: 'Ok', })

		// Check the backup is deleted in the API list response
		type GetBackupsResult2 = components['schemas']['GetUserBackupsResponse']
		const getBackupsResult2 = await new Promise<GetBackupsResult2>(function(res, rej) {
			const now = new Date()
			const message = `${pubkey}-GET-BACKUPS-${(now.getUTCMonth() + 1).toString().padStart(2, '0')}-${now.getUTCDate().toString().padStart(2, '0')}-${now.getUTCFullYear()}`
			const messageHash = hashPersonalMessage(Buffer.from(message, 'utf8'))
			const ecsig = ecsign(messageHash, privkey)
			const signature = toRpcSig(ecsig.v, ecsig.r, ecsig.s)

			const request = http.request({
				host,
				port,
				path: `/backups/${pubkey}?signature=${signature}`,
				method: 'GET',
				signal: AbortSignal.timeout(5_000),
				headers: { 'content-type': 'application/json' },
			})

			request.on('response', function(response: http.IncomingMessage) {
				if (response.statusCode !== 200) {
					rej(new Error(`Expected GET backups status code 200, got ${response.statusCode}`))
					return
				}

				let errRef: { err: Error } | undefined
				let chunks: Buffer[] = []
				response.on('data', function(chunk) {
					chunks.push(chunk)
				})
				response.on('error', function(err) {
					errRef = { err }
				})
				response.on('end', function() {
					if (errRef) rej(errRef.err)
					else {
						try {
							const json = Buffer.concat(chunks).toString('utf8')
							const data = JSON.parse(json)
							res(data)
						} catch (err) {
							rej(new Error(`Failed to parse JSON: ${(err as Error)?.message}`))
						}
					}
				})
			})

			request.on('error', function(err) {
				rej(err)
			})

			request.end()
		})

		ok(getBackupsResult2 && typeof getBackupsResult2 === 'object', 'Expected object')
		ok(Array.isArray(getBackupsResult2.backups), 'Expected array')
		deepStrictEqual(getBackupsResult2.backups, [], 'Expected empty array (by deep equal)')
		strictEqual(getBackupsResult2.backups.length, 0, 'Expected empty array (by length)')

		// Check the backup is deleted in the API get response
		const getBackupResult2 = await new Promise<{ message: string, }>(function(res, rej) {
			const now = new Date()
			const message = `${userId}-GET-BACKUP-${(now.getUTCMonth() + 1).toString().padStart(2, '0')}-${now.getUTCDate().toString().padStart(2, '0')}-${now.getUTCFullYear()}`
			const messageHash = hashPersonalMessage(Buffer.from(message, 'utf8'))
			const ecsig = ecsign(messageHash, privkey)
			const signature = toRpcSig(ecsig.v, ecsig.r, ecsig.s)

			const request = http.request({
				host,
				port,
				path: `/backups/${pubkey}/users/${userId}?signature=${signature}`,
				method: 'GET',
				signal: AbortSignal.timeout(5_000),
				headers: { 'content-type': 'application/json' },
			})

			request.on('response', function(response: http.IncomingMessage) {
				if (response.statusCode !== 404) {
					rej(new Error(`Expected GET backups status code 404, got ${response.statusCode}`))
					return
				}

				let errRef: { err: Error } | undefined
				let chunks: Buffer[] = []
				response.on('data', function(chunk) {
					chunks.push(chunk)
				})
				response.on('error', function(err) {
					errRef = { err }
				})
				response.on('end', function() {
					if (errRef) rej(errRef.err)
					else {
						try {
							const json = Buffer.concat(chunks).toString('utf8')
							const data = JSON.parse(json)
							res(data)
						} catch (err) {
							rej(new Error(`Failed to parse JSON: ${(err as Error)?.message}`))
						}
					}
				})
			})

			request.on('error', function(err) {
				rej(err)
			})

			request.end()
		})

		ok(getBackupResult2 && typeof getBackupResult2 === 'object', 'Expected object')
		deepStrictEqual(getBackupResult2, {
			message: ERROR_MESSAGE.BACKUP_NOT_FOUND
		})
	})
})
