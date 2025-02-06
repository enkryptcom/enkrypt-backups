import type { Logger } from 'pino'
import type { ClusterConfig, Context, PrometheusConfig, ShutdownConfig } from '../../types.js'
import type { ApiHttpConfig, StorageConfig } from '../../env.js'
import { Disposer } from '../../utils/disposer.js'
import { createApiMetrics, type ApiMetrics } from './metrics.js'
import { AggregatorRegistry, collectDefaultMetrics, Registry, type PrometheusContentType } from 'prom-client'
import { runPrometheusExporterHttpServer } from '../../utils/prometheus.js'
import { allSettled } from '../../utils/helpers.js'

const importCluster = () => import('node:cluster')
const importManageCluster = () => import('../../utils/cluster.js')
const importSetup = () => import('./setup.js')
const importServe = () => import('./serve.js')

export type ApiCommandOptions = {
	logger: Logger,
	httpConfig: ApiHttpConfig
	clusterConfig: ClusterConfig
	storageConfig: StorageConfig
	prometheusConfig: PrometheusConfig,
	shutdownConfig: ShutdownConfig,
	checkConfig: boolean,
}

export async function apiCommand(opts: ApiCommandOptions): Promise<void> {
	const {
		logger,
		httpConfig,
		clusterConfig,
		storageConfig,
		prometheusConfig,
		shutdownConfig,
		checkConfig,
	} = opts

	const { standalone } = clusterConfig

	// Imports are split to slightly reduce memory footprint
	if (standalone) {
		logger.debug('Setting up standalone API')
		// Standalone HTTP server (not running in cluster mode)
		await using disposer = new Disposer({ logger, })

		let metrics: undefined | ApiMetrics
		if (prometheusConfig.enabled) {
			// Collect & serve prometheus metrics
			const registry = new Registry()
			collectDefaultMetrics({ register: registry, })
			metrics = createApiMetrics({ registry, disposer, })
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

		const [{ httpServer, httpRouter, }, { serve, }] = await allSettled([
			importSetup().then(({ setup }) => setup({
				disposer,
				logger,
				httpConfig,
				storageConfig,
				metrics,
			})),
			importServe(),
		])

		const { host, port, } = httpConfig

		await serve({
			logger,
			httpServer,
			httpRouter,
			host,
			port,
			checkConfig,
			shutdownConfig,
		})
	} else {
		const cluster = await importCluster()

		if (cluster.default.isPrimary) {
			// Cluster primary
			// Manages the HTTP cluster worker processes
			logger.setBindings({ name: 'api::primary', })
			logger.debug('Setting up API primary cluster manager')

			await using disposer = new Disposer({ logger, })

			const { manageCluster, } = await importManageCluster()

			if (prometheusConfig.enabled) {
				/** Cluster primary aggregator metrics registry (collects metrics from workers) */
				const registry = new AggregatorRegistry<PrometheusContentType>()
				const { logLevel, host, port, compression, } = prometheusConfig
				// Serve Prometheus metrics on the primary
				runPrometheusExporterHttpServer(disposer, {
					logger,
					registry: { type: 'cluster', instance: registry, },
					host,
					port,
					compression,
					logLevel,
				})
			}

			await manageCluster({
				logger,
				clusterConfig,
				shutdownConfig,
				checkConfig,
			})
		} else {
			// Cluster worker
			// Note, after the cluster worker finishes gracefully the IPC channel (process.channel)
			// needs to be unreferred or else the worker hangs. This is closed in `src/main.ts`.
			logger.setBindings({ name: `api::worker::${cluster.default.worker!.id}`, })
			logger.debug('Setting up API cluster worker')

			await using disposer = new Disposer({ logger, })

			let metrics: undefined | ApiMetrics
			if (prometheusConfig.enabled) {
				let metrics: undefined | ApiMetrics
				if (prometheusConfig.enabled) {
					const registry = new AggregatorRegistry<PrometheusContentType>()
					AggregatorRegistry.setRegistries([registry])
					metrics = createApiMetrics({ registry, disposer, })
				}
			}

			const [{ httpServer, httpRouter, }, { serve, }] = await allSettled([
				importSetup().then(({ setup }) => setup({
					disposer,
					logger,
					httpConfig,
					storageConfig,
					metrics,
				})),
				importServe(),
			])

			const { host, port, } = httpConfig

			await serve({
				logger,
				httpServer,
				httpRouter,
				host,
				port,
				checkConfig,
				shutdownConfig,
			})
		}

		logger.info('Done')
	}
}

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

