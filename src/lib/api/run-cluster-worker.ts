import EventEmitter from "node:events"
import { Disposer } from "../../utils/disposer.js"
import { ClusterPrimaryMessage, ClusterWorkerMessage } from "./cluster-messages.js"
import type { HttpServerControllerEvents } from "../../utils/http.js"
import { run } from "./run.js"
import { setup } from "./setup.js"
import type { ApiMetrics, ApiSetupOptions } from "./types.js"
import { createMetrics } from "./metrics.js"
import { AggregatorRegistry, collectDefaultMetrics, type PrometheusContentType } from "prom-client"

export async function runApiClusterWorker(opts: ApiSetupOptions): Promise<void> {
	const { logger, configCheck, prometheusConfig, } = opts

	logger.info('Setting up API worker')

	await using disposer = new Disposer({ logger, })

	let metrics: undefined | ApiMetrics
	if (prometheusConfig.enabled) {
		const registry = new AggregatorRegistry<PrometheusContentType>()
		collectDefaultMetrics({ register: registry, })
		AggregatorRegistry.setRegistries([registry])
		metrics = createMetrics({ registry, disposer, })
	}

	const conf = await setup(disposer, opts, metrics)

	if (configCheck) {
		logger.info('Config check complete')
		return
	}

	logger.info('Starting API')

	const controller = new EventEmitter<HttpServerControllerEvents>()

	/**
		* Receives messages from the cluster primary process
		*
		* The cluster primary process controlls the lifecycle of the HTTP server
		* that this worker child process executes
		*
		* Primary can send messages to gracefully stop and forcefully stop the
		* http server (after which the worker is expected to exit)
		*
		* Primary is expected to listen to process signals and send corresponding
		* IPC messages to worker so that worker don't have to handle signals
		*/
	function onMessage(_message: unknown, _sendHandle: unknown) {
		if (!(_message !== null && typeof _message === 'object')) return
		const message = _message as ClusterPrimaryMessage
		switch (message.type) {
			case ClusterPrimaryMessage.BEGIN_GRACEFUL_SHUTDOWN:
				logger.info('Beginning graceful cluster worker shutdown')
				controller.emit('beginGracefulShutdown')
				break;
			case ClusterPrimaryMessage.BEGIN_FORCEFUL_SHUTDOWN:
				logger.info('Beginning forceful cluster worker shutdown')
				controller.emit('beginForcefulShutdown')
				break;
			default:
				// Ignore
				break;
		}
	}

	// Hack to ignore SIGINTS...
	// They're automatically received in child worker processes but we only
	// want the primary process to receive and handle them, then send us
	// corresponding messages. This makes the worker process lifecycle more
	// predictable
	function onSIGINT(_signal: NodeJS.Signals) {
		// Drop...
	}

	try {
		process.on('SIGINT', onSIGINT)
		process.on('message', onMessage)

		// Notify the primary that we're ready to receive messages
		const message: ClusterWorkerMessage = { type: ClusterWorkerMessage.READY, }
		process.send!(message)

		await run(conf, controller)
		logger.info('Cluster worker HTTP server finished')
	} finally {
		process.off('SIGINT', onSIGINT)
		process.off('message', onMessage)
	}
}

