import express from 'express';
import { initMiddleware } from '../middleware/init.js';
import useCompression from 'compression'
import type { Disposer } from './disposer.js';
import type { Logger } from 'pino';
import { HttpError, HttpStatus, runHttpServer, } from './http.js';
import type { AggregatorRegistry, PrometheusContentType, Registry } from 'prom-client';
import { createServer, Server } from 'node:http';
import { errorHandlerMiddleware } from '../middleware/error.js';
import { createHttpMetrics } from './http-metrics.js';

type RegistryContext =
	| { type: 'standalone', instance: Registry }
	| { type: 'cluster', instance: AggregatorRegistry<PrometheusContentType> }

export function createPrometheusExporterHttpServer(disposer: Disposer, opts: {
	logger: Logger
	registry: RegistryContext,
	logLevel: string,
	compression: boolean,
}): Server {
	const {
		logger: _logger,
		registry,
		logLevel,
		compression,
	} = opts

	const server = createServer({
		requestTimeout: 60_000,
		connectionsCheckingInterval: 10_000,
	})

	const logger = _logger.child({ isPrometheus: true, })
	logger.level = logLevel

	const app = express()
	app.disable('x-powered-by')
	app.set('trust proxy', false)

	const selfMetrics = createHttpMetrics({
		prefix: 'prom_exporter_',
		registry: registry.instance,
	})

	app.use(initMiddleware({
		logger,
		disposer,
		metrics: selfMetrics,
		logReqHeaders: true,
		logResHeaders: true,
		reqSoftTimeoutMs: 15_000,
		reqSoftTimeoutIntervalMs: 5_000,
	}))

	// Compression
	if (compression) {
		app.use(useCompression())
	}

	app.get('/', function(_req, res, _next) {
		res
			.status(HttpStatus.OK)
			.json({ message: `Enkrypt API Prometheus Exporter` })
	})

	app.get('/metrics', async function(_req, res, next) {
		try {
			let metrics: string
			switch (registry.type) {
				case 'cluster':
					metrics = await registry.instance.clusterMetrics()
					metrics += await registry.instance.metrics()
					break
				case 'standalone':
					metrics = await registry.instance.metrics()
					break
				default:
					registry satisfies never
					throw new Error('Unknown registry type')
			}
			res
				.contentType(registry.instance.contentType)
				.send(metrics)
		} catch (err) {
			next(err)
		}
	})

	// 404
	app.use(function(_req, _res, next) {
		next(new HttpError(HttpStatus.NotFound))
	})

	app.use(errorHandlerMiddleware({
		debugErrors: false,
		metrics: selfMetrics,
	}))

	server.on('request', app)

	return server
}

/**
 * Runs a prometheus exporter in the background
 *
 * Stops when the provided disposer tears down
 *
 * Automatically restarts and does not crash the process if the server errors and stops for some reason
 */
export function runPrometheusExporterHttpServer(disposer: Disposer, opts: {
	logger: Logger,
	registry: RegistryContext
	host: string,
	port: number,
	compression: boolean,
	logLevel: string,
}) {
	const {
		logger,
		registry,
		host,
		port,
		logLevel,
		compression,
	} = opts

	function create(): Server {
		return createPrometheusExporterHttpServer(disposer, {
			logLevel,
			logger,
			registry,
			compression,
		})
	}

	const exporterHttpServerRef: { value: Server } = { value: create(), }
	const exporterPromiseRef: { value: Promise<void>; } = { value: Promise.resolve(), }

	let stopping = false

	const gracefulShutdownAborter = new AbortController()
	const acceleratedShutdownAborter = new AbortController()

	// When the parent context is disposed of, shut down the Prometheus exporter server
	disposer.defer(async function() {
		stopping = true
		logger.trace('Stopping prometheus exporter')
		gracefulShutdownAborter.abort(new Error('Disposing'))
		acceleratedShutdownAborter.abort(new Error('Disposing'))
		clearTimeout(restartExporterTimeout)
		await exporterPromiseRef.value
	})

	// If something goes wrong in the Prometheus exporter server we don't want
	// the whole process to crash. Let it run in the background and if it fails
	// restart it with an increasing backoff
	// We don't expect it to crash but it's better to be safe than sorry
	const restartExporterBackoff = [500, 1_000, 5_000, 10_000, 30_000, 60_000, 90_000, 120_000]
	let restartExporterTimeout: undefined | ReturnType<typeof setTimeout>
	let restartExporterRetry = 0

	/** Fired when the exporter errors and shuts down */
	function onExporterDoneError(this: Server, err: Error) {
		// Nothing to do
		if (stopping) {
			logger.error({
				err,
				restartExporterRetry,
			}, `Prometheus exporter crashed, restarting in ${restartExporterBackoff[restartExporterRetry]}ms`)
			return
		}

		// Queue restart of the exporter server
		restartExporterRetry = Math.min(restartExporterRetry + 1, restartExporterBackoff.length - 1)

		logger.error({
			err,
			restartExporterRetry,
		}, `Prometheus exporter crashed, restarting in ${restartExporterBackoff[restartExporterRetry]}ms`)

		restartExporterTimeout = setTimeout(onRestartExporterTimeout, restartExporterBackoff[restartExporterRetry])
	}

	/** Fired when the exporter server is ready to be restarted (after a backoff) */
	function onRestartExporterTimeout() {
		restartExporterTimeout = undefined
		run()
	}

	function run() {
		if (stopping) return
		const server = exporterHttpServerRef.value
		const promise = runHttpServer({
			logger,
			hostname: host,
			port,
			httpServer: server,
			gracefulShutdownSignal: gracefulShutdownAborter.signal,
			acceleratedShutdownSignal: acceleratedShutdownAborter.signal,
		})
		// We listen to the server promise in-case it rejects we don't want to crash the process
		// but also so we can restart the prometheus exporter if it fails
		promise.catch(onExporterDoneError.bind(server))
		exporterPromiseRef.value = promise
	}

	run()
}

