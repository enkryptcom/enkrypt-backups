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
import createGetVersionHandler from '../../api/get-version.js';
import type { ApiMetrics } from './types.js';
import createGetSchemaYamlHandler from '../../api/get-schema-yaml.js';
import createGetSchemaJsonHandler from '../../api/get-schema-json.js';
import type { OpenAPIV3_1 } from 'openapi-types';
import createGetBackupsHandler from '../../api/backups/get-backups.js';
import createCreateUserBackupHandler from '../../api/backups/users/post-user-backup.js';
import createDeleteUserBackupHandler from '../../api/backups/users/delete-user-backup.js';

export function createHttpAppRouter(opts: {
	disposer: Disposer,
	logger: Logger,
	httpConfig: ApiHttpConfig,
	storage: FileStorage,
	metrics?: ApiMetrics,
	appVersion: string,
	validators: Validators,
	openApiDocYaml: string,
	openApiDoc: OpenAPIV3_1.Document,
}): Express {
	const {
		disposer,
		logger,
		httpConfig,
		storage,
		metrics,
		appVersion,
		openApiDocYaml,
		openApiDoc,
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
	app.get('/schema', createGetSchemaJsonHandler({ openApiDoc, }))
	app.get('/schema.json', createGetSchemaJsonHandler({ openApiDoc, }))
	app.get('/schema.yml', createGetSchemaYamlHandler({ openApiDocYaml }))
	app.get('/schema.yaml', createGetSchemaYamlHandler({ openApiDocYaml }))
	app.get('/backups/:publicKey', createGetBackupsHandler({ validators, storage }))
	app.post('/backups/:publicKey/users/:userId', createCreateUserBackupHandler({ validators, storage, }))
	app.delete('/backups/:publicKey/users/:userId', createDeleteUserBackupHandler({ validators, storage, }))

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

