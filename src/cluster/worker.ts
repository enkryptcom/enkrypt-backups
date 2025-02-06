// import { Disposer } from "../utils/disposer.js"
// import type { ApiHttpConfig, } from "../env.js"
// import type { Logger } from "pino"
// import { AggregatorRegistry, type PrometheusContentType } from "prom-client"
// import type { PrometheusConfig, ShutdownConfig } from "../types.js"
// import { createShutdownHandler } from "../utils/shutdown.js"
// import type { ApiMetrics } from "../lib/api/types.js"
// import { createMetrics } from "../lib/api/metrics.js"
// import { setup } from "../lib/api/setup.js"
//
// export async function runApiClusterWorker(opts: {
// 	logger: Logger,
// 	chainConfigsFilename: string,
// 	httpConfig: ApiHttpConfig,
// 	prometheusConfig: PrometheusConfig,
// 	checkConfig: boolean,
// 	shutdownConfig: ShutdownConfig
// }): Promise<void> {
// 	const {
// 		logger,
// 		chainConfigsFilename,
// 		httpConfig,
// 		prometheusConfig,
// 		checkConfig,
// 		shutdownConfig,
// 	} = opts
//
// 	logger.debug('Setting up API worker')
//
// 	await using disposer = new Disposer({ logger, })
//
// 	let metrics: undefined | ApiMetrics
// 	if (prometheusConfig.enabled) {
// 		const registry = new AggregatorRegistry<PrometheusContentType>()
// 		AggregatorRegistry.setRegistries([registry])
// 		metrics = createMetrics({ registry, disposer, })
// 	}
//
// 	const {
// 		httpServer,
// 		httpAppRouter,
// 	} = await setup({
// 		disposer,
// 		alerter,
// 		logger,
// 		metrics,
// 		chainConfigsFilename,
// 		keyConfig,
// 		httpConfig,
// 		pgConfigs,
// 	})
//
// 	const {
// 		shutdownSignals,
// 		acceleratedShutdownSignalCount,
// 		immediateShutdownSignalCount,
// 	} = shutdownConfig
//
// 	if (checkConfig) {
// 		logger.info('Config check complete')
// 		return
// 	}
//
// 	logger.debug('Starting API')
//
// 	const gracefulShutdownAborter = new AbortController()
// 	const acceleratedShutdownAborter = new AbortController()
// 	const shutdownHandler = createShutdownHandler({
// 		logger,
// 		acceleratedShutdownSignalCount,
// 		immediateShutdownSignalCount,
// 		gracefulShutdown(signal) {
// 			logger.debug(`Beginning graceful shutdown of cluster worker  ${signal}`)
// 			gracefulShutdownAborter.abort(new Error(`Graceful shutdown: ${signal}`))
// 		},
// 		acceleratedShutdown(signal) {
// 			logger.debug(`Beginning accelerated shutdown of cluster worker  ${signal}`)
// 			acceleratedShutdownAborter.abort(new Error(`Accelerated shutdown: ${signal}`))
// 		},
// 		onImmediateShutdown(signal) {
// 			logger.debug(`Beginning immediate shutdown of cluster worker  ${signal}`)
// 		},
// 	})
//
// 	try {
// 		for (let i = 0, len = shutdownSignals.length; i < len; i++) {
// 			process.on(shutdownSignals[i], shutdownHandler)
// 		}
// 		const { host, port, } = httpConfig
// 		logger.debug(`Cluster worker HTTP server starting on ${host}:${port}`)
// 		await run({
// 			logger,
// 			gracefulShutdownSignal: gracefulShutdownAborter.signal,
// 			acceleratedShutdownSignal: acceleratedShutdownAborter.signal,
// 			httpAppRouter,
// 			httpServer,
// 			host,
// 			port,
// 		})
// 		logger.debug('Cluster worker HTTP server finished')
// 	} finally {
// 		for (let i = 0, len = shutdownSignals.length; i < len; i++) {
// 			process.off(shutdownSignals[i], shutdownHandler)
// 		}
// 	}
// }
//
