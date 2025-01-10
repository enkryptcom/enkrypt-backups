import useCompression from 'compression'
import express, { type Express } from 'express';
import type { Logger } from 'pino';
import { HttpStatus, } from '../../utils/http.js';
import { Disposer } from '../../utils/disposer.js';
import { initMiddleware } from '../../middleware/init.js';
import { corsMiddleware } from '../../middleware/cors.js';
import { errorHandlerMiddleware } from '../../middleware/error.js';
import type { ApiHttpConfig } from '../../env.js';
import createGetHealthHandler from '../../api/get-health.js';
import createGetVersionHandler from '../../api/get-version.js';
import type { ApiMetrics } from './types.js';

export function createHttpMaintenanceRouter(opts: {
	disposer: Disposer,
	logger: Logger,
	httpConfig: ApiHttpConfig,
	metrics?: ApiMetrics,
	appVersion: string,
}): Express {
	const {
		disposer,
		logger,
		metrics,
		httpConfig,
		appVersion,
	} = opts

	const {
		originWhitelist,
		reqSoftTimeoutMs,
		reqSoftTimeoutIntervalMs,
		debugErrors,
		logReqHeaders,
		logResHeaders,
		compression,
	} = httpConfig

	const app = express()

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

	app.get('/health', createGetHealthHandler())
	app.get('/version', createGetVersionHandler({ appVersion }))

	app.use(function(_req, res, _next) {
		res
			.status(HttpStatus.ServiceUnavailable)
			.json({ message: `Enkrypt API down for maintenance ${appVersion}` })
	})

	// Error handler
	app.use(errorHandlerMiddleware({ debugErrors, }))

	return app
}

