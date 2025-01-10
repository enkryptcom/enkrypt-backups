import type { ApiCommandOptions } from "../lib/api/types.js"

const importCluster = () => import('node:cluster')
const importRunStandalone = () => import('../lib/api/run-standalone.js')
const importRunClusterPrimary = () => import('../lib/api/run-cluster-primary.js')
const importRunClusterWorker = () => import('../lib/api/run-cluster-worker.js')

export async function api(opts: ApiCommandOptions): Promise<void> {
	const {
		logger,
		configCheck,
		httpConfig,
		clusterConfig,
		storageConfig,
		prometheusConfig,
	} = opts
	const { standalone } = clusterConfig

	// Imports are split to slightly reduce memory footprint
	if (standalone) {
		logger.info('Setting up API')
		const imports = await importRunStandalone()
		await imports.runApiStandalone({
			logger,
			configCheck,
			clusterConfig,
			storageConfig,
			prometheusConfig,
			httpConfig,
		})
	} else {
		const cluster = await importCluster()
		if (cluster.default.isPrimary) {
			logger.setBindings({ name: 'primary', })
			logger.info('Setting up API primary')
			const imports = await importRunClusterPrimary()
			await imports.runApiClusterPrimary({
				logger,
				configCheck,
				clusterConfig,
				prometheusConfig,
			})
		} else {
			logger.setBindings({
				name: `worker:${cluster.default.worker!.id}`,
				workerId: cluster.default.worker!.id,
			})
			logger.info('Setting up API worker')
			// Note: after the cluster worker finishes gracefully the IPC channel (process.channel)
			// needs to be unreferred or else the worker hangs. This is closed in `src/main.ts`.
			const imports = await importRunClusterWorker()
			await imports.runApiClusterWorker({
				logger,
				configCheck,
				clusterConfig,
				storageConfig,
				prometheusConfig,
				httpConfig,
			})
		}

		logger.info('Done')
	}
}

