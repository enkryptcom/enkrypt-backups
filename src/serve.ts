import { strictEqual } from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import fs from 'node:fs/promises';
import compression from 'compression'
import { randomUUID } from 'node:crypto';
import express, { type Request, type Response, type Express, type ErrorRequestHandler } from 'express';
import type { Logger } from 'pino';
import cors from 'cors'
import { Ajv, type ValidateFunction } from 'ajv'
import { parse as parseYaml, stringify as stringifyYaml, } from 'yaml'
import type { Context, GlobalOptions } from './types.js';
import { HttpError, HttpStatus, runHttpServer, type HttpServerControllerEvents } from './utils/http.js';
import { Disposer } from './utils/disposer.js';
import { createServer as createHttpServer, type Server } from 'node:http';
import type { Writable } from 'node:stream';
import { boolOpt } from './utils/options.js';
import EventEmitter from 'node:events';
import { createStopSignalHandler } from './utils/signals.js';
import type { Backup, FileStorage } from './storage/interface.js';
import { parseBytes } from './utils/size.js';
import type { OpenAPIV3_1 } from 'openapi-types'
import type { components } from './openapi.js';
import { ecrecover, fromRpcSig, hashPersonalMessage, } from '@ethereumjs/util';
import { bytesToByteString, byteStringToBytes, parseByteString, parseUUID } from './utils/coersion.js';
import { FilesystemStorage } from './storage/filesystem.js';
import { S3 } from '@aws-sdk/client-s3';

const SOFT_REQ_TIMEOUT_INTERVAL = 5_000
const SOFT_REQ_TIMEOUT_DURATION = 2_500

const HARD_REQ_TIMEOUT_INTERVAL = 10_000
const HARD_REQ_TIMEOUT_DURATION = 5_000

const MAX_HEADERS_SIZE = 1024
const KEEPALIVE_TIMEOUT = 5_000

const ErrorMessage = {
	SIGNATURE_DOES_NOT_MATCH_PUBKEY: 'Signature does not match pubkey',
} as const

declare global {
	namespace Express {
		interface Request {
			ctx: Context
			aborter: AbortController,
			reqid: string
			startedAt: number,
		}
	}
}

function printHelp(stream: Writable): void {
	stream.write(`Usage: node [options] serve [options]\n`)
	stream.write('\n')
	stream.write('Options:\n')
	stream.write('  -h, --help                     Print this help message\n')
	stream.write('  -v, --version                  Print the version\n')
	stream.write('  --bind-port <port>             Port to listen on               BIND_PORT     3000\n')
	stream.write('  --bind-addr <addr>             Address to listen on            BIND_ADDR     127.0.0.1\n')
	stream.write('  --[no-]debug                   Enable debug logging of errors  DEBUG         false\n')
	stream.write('Environment Variables\n')
	stream.write('  WHITELIST_ORIGINS              JSON array of regex for whitelisted CORS origns  []\n')
}

export async function serve(globalOpts: GlobalOptions): Promise<number> {
	const { argv, env, stdout, stderr, logger, } = globalOpts

	let bindPortOpt = env.BIND_PORT || '3000'
	let bindAddr = env.BIND_ADDR || '127.0.0.1'
	let debugOpt = env.DEBUG || 'false'
	let originsOpt = env.WHITELIST_ORIGINS || '[]'

	let parsedArgs = false
	let argi = 0
	while (!parsedArgs && argi < argv.length) {
		let eqidx: number
		if (argv[argi].startsWith('-') && (eqidx = argv[argi].indexOf('=')) !== -1) {
			argv[argi] = argv[argi].slice(0, eqidx)
			argv.splice(argi + 1, 0, argv[argi].slice(eqidx + 1))
		}

		switch (argv[argi]) {
			case '-h':
			case '--help':
				printHelp(stdout)
				return 0
			case '--bind-port':
				bindPortOpt = argv[++argi]
				break
			case '--bind-addr':
				bindAddr = argv[++argi]
				break
			case '--debug':
				debugOpt = 'true'
				break
			case '--no-debug':
				debugOpt = 'false'
				break
			default:
				printHelp(stderr)
				stderr.write('\n')
				stderr.write(`Unknown option: ${argv[argi]}\n`)
				return 1
		}
		argi++
	}

	const bindPort = Number(bindPortOpt)
	if (!Number.isSafeInteger(bindPort) || bindPort <= 0 || bindPort > 65_535) {
		printHelp(stderr)
		stderr.write('\n')
		stderr.write(`Invalid port: ${bindPortOpt}\n`)
		return 1
	}

	const debug = boolOpt(debugOpt)
	if (debug === undefined) {
		printHelp(stderr)
		stderr.write('\n')
		stderr.write(`Invalid --debug: ${debugOpt}\n`)
		return 1
	}

	let origins: RegExp[]
	try {
		origins = (JSON.parse(originsOpt) as Array<string>).map((origin) => new RegExp(origin))
	} catch (err) {
		printHelp(stderr)
		stderr.write('\n')
		stderr.write(`Invalid WHITELIST_ORIGINS: ${originsOpt}\n`)
		return 1
	}

	await cmd({
		logger,
		bindAddr,
		bindPort,
		origins,
		debug,
	})

	return 0
}

type CommandOptions = {
	logger: Logger,
	bindAddr: string,
	bindPort: number,
	debug: boolean,
	origins: RegExp[],
}

async function cmd(cmdOpts: CommandOptions): Promise<void> {
	await using disposer = new Disposer()
	const cmdConfig = await setup(cmdOpts, disposer)
	await run(cmdConfig)
}

async function run(config: CommandConfig): Promise<void> {
	const {
		logger,
		bindPort,
		bindAddr,
		httpAppRouter,
		httpServer,
	} = config

	httpServer.on('request', httpAppRouter)

	const aborter = new AbortController()
	const ctx: Context = { logger, signal: aborter.signal, }

	const controller = new EventEmitter<HttpServerControllerEvents>()

	const onSIGINT = createStopSignalHandler({
		logger,
		onGracefullyStop() {
			controller.emit('beginGracefulShutdown')
		},
		onForcefullyStop() {
			controller.emit('beginForcefulShutdown')
		},
	})

	try {
		process.on('SIGINT', onSIGINT)
		await runHttpServer(ctx, {
			server: httpServer,
			controller,
			port: bindPort,
			hostname: bindAddr,
		})
	} finally {
		process.off('SIGINT', onSIGINT)
	}
}

type CommandConfig = {
	logger: Logger,
	bindAddr: string,
	bindPort: number,
	httpServer: Server,
	httpAppRouter: Express,
}

class HttpValidator<T> {
	private readonly _schemaValidator: ValidateFunction<T>
	constructor(schemaValidator: ValidateFunction<T>) {
		this._schemaValidator = schemaValidator
	}
	validate(value: unknown): T {
		const ok = this._schemaValidator(value)
		if (!ok) {
			throw new HttpError(HttpStatus.BadRequest,
				{ errors: this._schemaValidator.errors, },
			)
		}
		return value as T
	}
}

type GetHealthResponse = components['schemas']['GetHealthResponse']
type GetVersionResponse = components['schemas']['GetVersionResponse']
type GetSchemaResponse = components['schemas']['GetSchemaResponse']
type GetBackupsResponse = components['schemas']['GetBackupsResponse']
type GetBackupsResponseItem = components['schemas']['GetBackupsResponseItem']
type PostBackupRequest = components['schemas']['PostBackupRequest']
type PostBackupResponse = components['schemas']['PostBackupResponse']
type PubkeyParameter = components['parameters']['userId']
type UserIdParameter = components['parameters']['userId']

type Validators = {
	pubkeyParameter: HttpValidator<components['parameters']['pubkey']>,
	userIdParameter: HttpValidator<components['parameters']['userId']>,
	postBackupRequest: HttpValidator<components['schemas']['PostBackupRequest']>
}

async function setup(opts: CommandOptions, disposer: Disposer): Promise<CommandConfig> {
	const {
		bindAddr,
		bindPort,
		logger,
		debug,
		origins,
	} = opts

	const httpServer = createServer()

	const openApiyaml = await readFile('openapi.yaml', 'utf8')
	const openApiDoc: OpenAPIV3_1.Document = parseYaml(openApiyaml)

	const ajv = new Ajv({
		allErrors: true,
		removeAdditional: 'all',
		strict: true,
	})

	ajv.addVocabulary([
		// OpenAPI root elements
		'parameters',
		// OpenAPI Request/Response (relative) root element
		'content',
	])

	const appVersion = JSON.parse(await readFile('package.json', 'utf8')).version as string
	strictEqual(typeof appVersion, 'string')

	if (openApiDoc.components) {
		for (const key in openApiDoc.components.schemas) {
			ajv.addSchema(openApiDoc.components.schemas[key], `#/components/schemas/${key}`)
		}
		for (const key in openApiDoc.components.parameters) {
			ajv.addSchema(openApiDoc.components.parameters[key], `#/components/parameters/${key}`)
		}
		for (const key in openApiDoc.components.requestBodies) {
			ajv.addSchema(openApiDoc.components.requestBodies[key], `#/components/requestBodies/${key}`)
		}
		for (const key in openApiDoc.components.responses) {
			ajv.addSchema(openApiDoc.components.responses[key], `#/components/responses/${key}`)
		}
	}

	const validators: Validators = {
		postBackupRequest: new HttpValidator(ajv.getSchema('#/components/requestBodies/PostBackup')!),
		pubkeyParameter: new HttpValidator(ajv.getSchema('#/components/parameters/pubkey')!),
		userIdParameter: new HttpValidator(ajv.getSchema('#/components/parameters/userId')!),
	}

	const missingValidators: string[] = []
	for (const [key, val] of Object.entries(validators)) {
		if (val === undefined) missingValidators.push(key)
	}
	if (missingValidators.length > 0) {
		throw new Error(`Missing validators: ${missingValidators.join(', ')}`)
	}

	// TODO: implement S3
	// switch ('' as string) {
	// 	case 'fs':
	// 		break;
	// 	case 's3':
	// 		new S3({
	// 			region,
	// 			requestHandler: {
	// 				//
	// 			}
	// 		})
	// 		break;
	// 	default:
	// 		throw new Error(`Invalid STORAGE_TYPE: ${''}`)
	// }
	const storage = new FilesystemStorage({
		fs,
		rootDirpath: 'storage',
	})

	const httpAppRouter = createHttpAppRouter({
		disposer,
		logger,
		debug,
		origins,
		validators,
		openApiDocYaml: stringifyYaml(openApiDoc),
		storage,
		appVersion,
	})

	const config: CommandConfig = {
		logger,
		bindAddr,
		bindPort,
		httpServer,
		httpAppRouter,
	}

	return config
}

export function createServer(): Server {
	const server = createHttpServer({
		keepAlive: true,
		keepAliveTimeout: KEEPALIVE_TIMEOUT,
		maxHeaderSize: MAX_HEADERS_SIZE,
		requestTimeout: HARD_REQ_TIMEOUT_DURATION,
		connectionsCheckingInterval: HARD_REQ_TIMEOUT_INTERVAL,
	})

	return server
}

export function createHttpAppRouter(opts: {
	disposer: Disposer,
	logger: Logger,
	origins: RegExp[],
	debug: boolean,
	storage: FileStorage,
	appVersion: string,
	validators: Validators,
	openApiDocYaml: string,
}): Express {
	const {
		disposer,
		logger,
		origins,
		debug,
		storage,
		appVersion,
		openApiDocYaml,
		validators,
	} = opts

	const app = express()

	function onResClose(this: Response) {
		const now = Date.now()
		const duration = now - this.req.startedAt
		this.req.ctx.logger.info({
			res: {
				duration,
				statusCode: this.statusCode,
				statusMessage: this.statusMessage,
				headers: this.getHeaders(),
			},
		}, `HTTP response closed  ${duration}ms   ${this.statusCode} ${this.statusMessage}`)
		cleanupRes(this)
	}

	function onResFinish(this: Response) {
		const now = Date.now()
		const duration = now - this.req.startedAt
		this.req.ctx.logger.info({
			res: {
				duration,
				status: this.status,
				statusCode: this.statusCode,
				statusMessage: this.statusMessage,
				headers: this.getHeaders(),
			},
		}, `HTTP response finished  ${duration}ms   ${this.statusCode} ${this.statusMessage}`)
		cleanupRes(this)
	}

	function onResError(this: Response, err: Error) {
		const now = Date.now()
		const duration = now - this.req.startedAt
		this.req.ctx.logger.info({
			err,
			res: {
				duration,
				status: this.status,
				statusCode: this.statusCode,
				statusMessage: this.statusMessage,
				headers: this.getHeaders(),
			},
		}, `HTTP response error  ${duration}ms   ${this.statusCode} ${this.statusMessage}`)
	}

	function cleanupRes(res: Response) {
		inflightReqs.delete(res.req)
		res.off('close', onResClose)
		res.off('finish', onResFinish)
		res.off('error', onResError)
	}

	/**
	 * Requests that haven't finished AND haven't timed out
	 *
	 * (timed out requests are deleted from this list)
	 */
	const inflightReqs = new Set<Request>()

	// Time-out requests that have been running for too long
	const softTimeoutInterval = setInterval(function() {
		// logger.trace('Checking HTTP request soft timeouts', 'reqs', inflight.size)
		const now = Date.now()
		const startedAtCutoff = now - SOFT_REQ_TIMEOUT_DURATION
		for (const req of inflightReqs) {
			if (req.startedAt < startedAtCutoff && !req.aborter.signal.aborted) {
				req.ctx.logger.warn('HTTP request soft timed out')
				req.aborter.abort(new HttpError(HttpStatus.RequestTimeout))
				inflightReqs.delete(req)
			}
		}
	}, SOFT_REQ_TIMEOUT_INTERVAL)

	disposer.defer(function() {
		logger.trace('Clearing HTTP request soft timeout interval timer')
		clearInterval(softTimeoutInterval)
	})


	app.use(function(req, res, next) {
		const now = Date.now()
		const aborter = new AbortController()
		const reqid = randomUUID()
		const reqlogger = logger.child({
			req: {
				timestamp: now,
				id: reqid,
				method: req.method,
				url: req.url,
				headers: req.headers,
				ip: req.ip,
				ips: req.ips,
				remotePort: req.socket.remotePort,
			},
		})
		const ctx: Context = { signal: aborter.signal, logger: reqlogger, }
		req.ctx = ctx
		req.aborter = aborter
		req.reqid = reqid
		req.startedAt = now
		res.on('close', onResClose)
		res.on('finish', onResFinish)
		res.on('error', onResError)
		inflightReqs.add(req)
		next()
	})

	// Compression
	app.use(compression())

	// Cors
	app.use(cors({ origin: origins, }))

	// Allow JSON bodies or raw bodies
	app.use(express.json({ limit: parseBytes('50mb') }))
	app.use(express.raw({ limit: parseBytes('50mb'), type: 'application/octet-stream' }))

	// Health check
	app.get('/health', function(_req, res, _next) {
		const response: GetHealthResponse = { message: 'Ok' }
		res.status(HttpStatus.OK).json(response)
	})

	// Application version
	app.get('/version', function(req, res, next) {
		const response: GetVersionResponse = { version: appVersion }
		res.status(HttpStatus.OK).json(response)
	})

	// OpenAPI Schema
	app.get('/schema', function(req, res, next) {
		const response: GetSchemaResponse = openApiDocYaml
		res.status(HttpStatus.OK).contentType('application/yaml').send(response)
	})

	// Get backups
	app.get('/backups/:pubkey', async function(req, res, next) {
		try {
			const pubkey = parseByteString(validators.pubkeyParameter.validate(req.params.pubkey))
			const backups = await storage.getUserBackups(req.ctx, pubkey)
			if (backups == null) {
				throw new HttpError(HttpStatus.NotFound, 'No backups found')
			}
			const response: GetBackupsResponse = new Array(backups.length)
			for (let i = 0, len = backups.length; i < len; i++) {
				const backup = backups[i]
				const item: GetBackupsResponseItem = {
					userId: backup.userId,
					payload: backup.payload,
					updatedAt: backup.updatedAt
				}
				response.push(item)
			}
			res.status(HttpStatus.OK).json(response)
		} catch (err) {
			next(err)
		}
	})

	// Post backup
	app.post('/backups/:pubkey/:userId', async function(req, res, next) {
		try {
			const pubkey = parseByteString(validators.pubkeyParameter.validate(req.params.pubkey))
			const userId = parseUUID(validators.userIdParameter.validate(req.params.userId))
			const body = validators.postBackupRequest.validate(req.body)
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

			await storage.saveUserBackup(req.ctx, pubkey, userId, backup)

			const response: PostBackupResponse = { message: 'Ok' }

			res.status(HttpStatus.OK).json(response)
		} catch (err) {
			next(err)
		}
	})


	// 404
	app.use(function(_req, _res, next) {
		next(new HttpError(HttpStatus.NotFound))
	})

	// Error handler
	app.use(function(_err, req, res, _next) {
		let err: HttpError
		if ((_err instanceof HttpError)) {
			err = _err
		} else {
			err = new HttpError(HttpStatus.InternalServerError, undefined)
			req.ctx.logger.error({ err: _err }, 'Unhandled error')
		}

		let result: Record<PropertyKey, unknown>
		if (debug) {
			result = renderDebugError(err)
		} else {
			result = renderProdError(err)
		}

		if (err.headers) {
			for (const [key, value] of Object.entries(err.headers)) {
				res.setHeader(key, value)
			}
		}

		res.status(err.status).json(result)
	} as ErrorRequestHandler)

	return app
}

function renderProdError(err: HttpError): Record<PropertyKey, unknown> {
	// Status, message
	const result: Record<PropertyKey, unknown> = {
		status: err.status,
		message: err.message,
	}
	// Bind "data" properties to the root
	if (err.data) {
		for (const [key, val] of Object.entries(err.data)) {
			if (key === 'message') continue
			if (key === 'status') continue
			if (Object.hasOwn(result, key)) continue
			result[key] = val
		}
	}
	return result
}

function renderDebugError(err: Error, seen: Set<unknown> = new Set()): Record<PropertyKey, unknown> {
	const result: Record<PropertyKey, unknown> = {}
	// Name, status, message
	if (!Object.hasOwn(result, 'name') && err.name) result.name = err.name
	if (!Object.hasOwn(result, 'status') && err instanceof HttpError) result.status = err.status
	if (!Object.hasOwn(result, 'message') && err.message) result.message = err.message
	// If HttpError, bind "data" properties to the root
	if (!Object.hasOwn(result, 'data') && err instanceof HttpError) {
		for (const [key, val] of Object.entries(err)) {
			if (Object.hasOwn(result, key)) continue
			result[key] = val
		}
	}
	// Bind all enumerable properties (except data) from the root
	for (const [key, val] of Object.entries(err)) {
		if (err instanceof HttpError && key === 'data') continue
		if (Object.hasOwn(result, key)) continue
		result[key] = val
	}
	// Bind stack
	if (!Object.hasOwn(result, 'stack') && err.stack) {
		if (err instanceof HttpError) {
			result.stack = err
				.stack
				.split('\n')
				.slice(1, 4)
				.map((line) => line.trim())
		} else {
			result.stack = err
				.stack
				.split('\n')
				.map((line) => line.trim())
		}
	}
	// Bind nested errors
	if (!Object.hasOwn(result, 'cause') && err.cause && !seen.has(err.cause as Error)) {
		seen.add(err.cause as Error)
		result.cause = renderDebugError(err.cause as Error, seen)
	}

	return result
}

