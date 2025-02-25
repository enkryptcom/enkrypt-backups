import useCompression from 'compression'
import express, { type Express } from 'express';
import type { Logger } from 'pino';
import { Disposer } from '../../utils/disposer.js';
import { initMiddleware } from '../../middleware/init.js';
import { corsMiddleware } from '../../middleware/cors.js';
import { errorHandlerMiddleware } from '../../middleware/error.js';
import type { ApiHttpConfig } from '../../env.js';
import createGetHealthHandler from '../../api/get-health.js';
import createGetVersionHandler from '../../api/get-version.js';
import type { ApiMetrics } from './metrics.js';
import { maintenanceMiddleware } from '../../middleware/maintenance.js';

export function createHttpMaintenanceRouter(opts: {
	disposer: Disposer,
	logger: Logger,
	httpConfig: ApiHttpConfig,
	metrics: undefined | ApiMetrics,
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
	if (originWhitelist) {
		app.use(corsMiddleware({ originWhitelist }))
	}

	app.get('/health', createGetHealthHandler())
	app.get('/version', createGetVersionHandler({ appVersion }))

	// All other routes - 503 Error
	app.use(maintenanceMiddleware({ appVersion, }))

	// Error handler
	app.use(errorHandlerMiddleware({ debugErrors, metrics, }))

	return app
}

