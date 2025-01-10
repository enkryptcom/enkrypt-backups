import EventEmitter from "node:events"
import { Disposer } from "../../utils/disposer.js"
import { setup } from "./setup.js"
import type { HttpServerControllerEvents } from "../../utils/http.js"
import { createStopSignalHandler } from "../../utils/signals.js"
import { run } from "./run.js"
import type { ApiMetrics, ApiSetupOptions } from "./types.js"
import { Registry } from "prom-client"
import { createMetrics } from "./metrics.js"
import { runPrometheusExporterHttpServer } from "../../utils/prometheus.js"

export async function runApiStandalone(opts: ApiSetupOptions): Promise<void> {
	const { logger, configCheck, prometheusConfig, } = opts

	logger.info('Setting up standalone API process')

	await using disposer = new Disposer({ logger, })

	let metrics: undefined | ApiMetrics
	if (prometheusConfig.enabled) {
		const registry = new Registry()
		metrics = createMetrics({ registry, disposer, })
		const { logLevel, host, port, compression, } = prometheusConfig
		runPrometheusExporterHttpServer(disposer, {
			logger,
			registry: { type: 'standalone', instance: registry, },
			host,
			port,
			compression,
			logLevel,
		})
	}

	const conf = await setup(disposer, opts, metrics)

	if (configCheck) {
		logger.info('Config check complete')
		return
	}

	logger.info('Starting API')

	const controller = new EventEmitter<HttpServerControllerEvents>()

	const onSIGINT = createStopSignalHandler({
		logger,
		onGracefullyStop() {
			logger.info('Gracefully stopping...')
			controller.emit('beginGracefulShutdown')
		},
		onForcefullyStop() {
			logger.info('Forcefully stopping...')
			controller.emit('beginForcefulShutdown')
		},
	})

	try {
		process.on('SIGINT', onSIGINT)
		await run(conf, controller)
	} finally {
		process.off('SIGINT', onSIGINT)
	}
}

