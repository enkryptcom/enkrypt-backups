import useCompression from 'compression'
import express, { type Express, } from 'express';
import type { Logger } from 'pino';
import { HttpError, HttpStatus, } from '../../utils/http.js';
import { Disposer } from '../../utils/disposer.js';
import type { FileStorage } from '../../storage/interface.js';
import { initMiddleware } from '../../middleware/init.js';
import { corsMiddleware } from '../../middleware/cors.js';
import { errorHandlerMiddleware } from '../../middleware/error.js';
import { latencyMiddleware } from '../../middleware/latency.js';
import { randomErrorsMiddleware } from '../../middleware/random-errors.js';
import type { ApiHttpConfig } from '../../env.js';
import type { Validators } from './validation.js';
import createGetHandler from '../../api/get.js';
import createGetHealthHandler from '../../api/get-health.js';
import createGetSchemaHandler from '../../api/get-schema.js';
import createGetVersionHandler from '../../api/get-version.js';
import createGetUserBackupsHandler from '../../api/backups/get.js';
import createPostUserBackupHandler from '../../api/backups/post-backup.js';
import type { ApiMetrics } from './types.js';
import createDeleteUserBackupHandler from '../../api/backups/delete-backup.js';

export function createHttpAppRouter(opts: {
	disposer: Disposer,
	logger: Logger,
	httpConfig: ApiHttpConfig,
	storage: FileStorage,
	metrics?: ApiMetrics,
	appVersion: string,
	validators: Validators,
	openApiDocYaml: string,
}): Express {
	const {
		disposer,
		logger,
		httpConfig,
		storage,
		metrics,
		appVersion,
		openApiDocYaml,
		validators,
	} = opts

	const {
		originWhitelist,
		trustProxy,
		reqSoftTimeoutMs,
		reqSoftTimeoutIntervalMs,
		reqBodySizeLimitBytes,
		debugErrors,
		logReqHeaders,
		logResHeaders,
		compression,
		extraLatencyBaseMs,
		extraLatencyJitterMs,
		extraRandomErrorLatencyBaseMs,
		extraRandomErrorLatencyJitterMs,
		extraRandomErrorRate,
	} = httpConfig

	const app = express()
	app.disable('x-powered-by')
	app.set('trust proxy', trustProxy)

	app.use(initMiddleware({
		disposer,
		metrics,
		logger,
		logReqHeaders,
		logResHeaders,
		reqSoftTimeoutMs,
		reqSoftTimeoutIntervalMs,
	}))

	// Compression
	if (compression) {
		app.use(useCompression())
	}

	// Cors
	if (originWhitelist !== undefined) {
		app.use(corsMiddleware({ originWhitelist }))
	}

	// Parse JSON bodies when Header Content-Type=application/json
	app.use(express.json({ limit: reqBodySizeLimitBytes, }))

	// Inject random latency
	if (extraLatencyBaseMs > 0 || extraLatencyJitterMs > 0) {
		app.use(latencyMiddleware({
			latencyBaseMs: extraLatencyBaseMs,
			latencyJitterMs: extraLatencyJitterMs,
		}))
	}

	// Inject random errors
	if (
		(extraRandomErrorLatencyBaseMs > 0 || extraRandomErrorLatencyJitterMs > 0)
		&& extraRandomErrorRate > 0
	) {
		app.use(randomErrorsMiddleware({
			latencyBase: extraRandomErrorLatencyBaseMs,
			latencyJitter: extraRandomErrorLatencyJitterMs,
			errorRate: extraRandomErrorRate,
		}))
	}

	// Serve static files
	app.use(express.static('public'))

	app.get('/', createGetHandler({ appVersion, }))
	app.get('/health', createGetHealthHandler())
	app.get('/version', createGetVersionHandler({ appVersion }))
	app.get('/schema', createGetSchemaHandler({ openApiDocYaml }))
	app.get('/backups/:publicKey', createGetUserBackupsHandler({ validators, storage }))
	app.post('/backups/:publicKey/:userId', createPostUserBackupHandler({ validators, storage, }))
	app.post('/backups/:publicKey/:userId/delete', createDeleteUserBackupHandler({ validators, storage, }))

	// 404
	app.use(function(_req, _res, next) {
		next(new HttpError(HttpStatus.NotFound))
	})

	// Error handler
	app.use(errorHandlerMiddleware({
		metrics,
		debugErrors,
	}))

	return app
}

