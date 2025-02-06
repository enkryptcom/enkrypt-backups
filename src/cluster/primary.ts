// import cluster from 'node:cluster'
// import type { ClusterSettings, Worker as ClusterWorker, Address as ClusterAddress } from 'node:cluster'
// import { createShutdownHandler } from "../utils/shutdown.js";
// import { nextTick } from 'node:process';
// import type { ApiClusterConfig, ApiPrometheusConfig, EnvironmentVariables } from '../env.js';
// import type { Logger } from 'pino';
// import { Disposer } from '../utils/disposer.js';
// import { AggregatorRegistry, type PrometheusContentType } from 'prom-client';
// import { runPrometheusExporterHttpServer } from '../utils/prometheus.js';
// import type { ShutdownConfig } from '../types.js';
//
// const WORKER_GRACEFUL_SHUTDOWN_SIGNAL_COUNT = 1
// const WORKER_ACCELERATED_SHUTDOWN_SIGNAL_COUNT = 2
// const WORKER_IMMEDIATE_SHUTDOWN_SIGNAL_COUNT = 3
//
// const kSignals = Symbol('Signals')
// const kListening = Symbol('Listening')
//
// declare module 'node:cluster' {
// 	interface Worker {
// 		[kSignals]: number
// 		[kListening]: boolean
// 	}
// }
//
// /**
//  * Manages the API HTTP cluster
//  *
//  * Spin up worker processes to handle HTTP requests
//  *
//  * Spins up new worker processes when old worker processes die
//  *
//  * Receive exit signals and instruct workers to tear down and exit
//  */
// export async function runApiClusterPrimary(opts: {
// 	logger: Logger,
// 	checkConfig: boolean,
// 	clusterConfig: ApiClusterConfig,
// 	prometheusConfig: ApiPrometheusConfig,
// 	shutdownConfig: ShutdownConfig,
// }): Promise<void> {
// 	const {
// 		logger,
// 		checkConfig,
// 		clusterConfig,
// 		prometheusConfig,
// 		shutdownConfig,
// 	} = opts
//
// 	const {
// 		minWorkers,
// 		maxWorkers,
// 		estimatedMemoryPrimaryBytes,
// 		estimatedMemoryWorkerBytes,
// 		estimatedMemoryMaxBytes,
// 		memoryReservedBytes,
// 		addWorkerDebounceMs,
// 	} = clusterConfig
//
// 	const {
// 		shutdownSignals,
// 		acceleratedShutdownSignalCount,
// 		immediateShutdownSignalCount,
// 	} = shutdownConfig
//
// 	await using disposer = new Disposer({ logger, })
//
// 	if (prometheusConfig.enabled) {
// 		/** Metrics registry */
// 		const registry = new AggregatorRegistry<PrometheusContentType>()
// 		const { logLevel, host, port, compression, } = prometheusConfig
// 		runPrometheusExporterHttpServer(disposer, {
// 			logger,
// 			registry: { type: 'cluster', instance: registry, },
// 			host,
// 			port,
// 			compression,
// 			logLevel,
// 		})
// 	}
//
// 	let res: () => void
// 	let rej: (reason: Error) => void
// 	const promise = new Promise<void>(function(_res, _rej) {
// 		res = _res
// 		rej = _rej
// 	})
//
// 	const State = {
// 		RUNNING: 'RUNNING',
// 		STOPPING: 'STOPPING',
// 	} as const
// 	type State =
// 		| { type: typeof State.RUNNING }
// 		| { type: typeof State.STOPPING, /* err: undefined | Error */ }
// 	let state: State = { type: State.RUNNING }
//
// 	let failedStartupGracefulShutdownTimeout: undefined | ReturnType<typeof setTimeout>
// 	let failedStartupAcceleratedShutdownTimeout: undefined | ReturnType<typeof setTimeout>
//
// 	/**
// 	 * Fired when the initial workers fail to start properly and some workers take
// 	 * too long to gracefully shutdown
// 	 */
// 	function handleFailedStartupGracefulShutdownTimeout() {
// 		logger.warn('Timed out waiting for graceful shutdown after startup failed, beginning accelerated shutdown')
// 		if (!acceleratedShutdown()) {
// 			logger.warn('Already at or beyond accelerated shutdown of worker processes')
// 		}
// 		failedStartupAcceleratedShutdownTimeout = setTimeout(handleFailedStartupAcceleratedShutdownTimeout, 5_000)
// 	}
//
// 	/**
// 	 * Fired when the intial workers fail to start properly and some workers refuse
// 	 * to shutdown
// 	 */
// 	function handleFailedStartupAcceleratedShutdownTimeout() {
// 		logger.warn('Timed out waiting for accelerated shutdown after startup failed, beginning immediate shutdown')
// 		if (!onImmediateShutdown()) {
// 			logger.warn('Already at or beyond immediate shutdown of worker processes')
// 		}
// 		process.exit(1)
// 	}
//
// 	/** Instruct all workers to begin a graceful shutdown */
// 	function gracefulShutdown(): boolean {
// 		if (state.type !== State.STOPPING) state = { type: State.STOPPING, }
// 		let didSomething = false
// 		for (const workerId in cluster.workers) {
// 			const worker = cluster.workers[workerId]!
// 			while (worker[kSignals] < WORKER_GRACEFUL_SHUTDOWN_SIGNAL_COUNT) {
// 				logger.debug(`Instructing graceful shutdown of worker "${worker.id}" with SIGTERM`)
// 				worker[kSignals]++
// 				worker.kill('SIGTERM')
// 				didSomething = true
// 			}
// 		}
// 		return didSomething
// 	}
//
// 	/** Instruct all workers to begin an accelerated shutdown */
// 	function acceleratedShutdown(): boolean {
// 		if (state.type !== State.STOPPING) state = { type: State.STOPPING, }
// 		let didSomething = false
// 		for (const workerId in cluster.workers) {
// 			const worker = cluster.workers[workerId]!
// 			while (worker[kSignals] < WORKER_ACCELERATED_SHUTDOWN_SIGNAL_COUNT) {
// 				logger.debug(`Instructing accelerated shutdown of worker "${worker.id}" with SIGTERM`)
// 				worker[kSignals]++
// 				worker.kill('SIGTERM')
// 				didSomething = true
// 			}
// 		}
// 		return didSomething
// 	}
//
// 	/** Force all workers to immediately shut down */
// 	function onImmediateShutdown(): boolean {
// 		if (state.type !== State.STOPPING) state = { type: State.STOPPING, }
// 		let didSomething = false
// 		for (const workerId in cluster.workers) {
// 			const worker = cluster.workers[workerId]!
// 			while (worker[kSignals] < WORKER_IMMEDIATE_SHUTDOWN_SIGNAL_COUNT) {
// 				logger.debug(`Instructing immediate shutdown of worker "${worker.id}" with SIGKILL`)
// 				worker[kSignals]++
// 				worker.kill('SIGKILL')
// 				didSomething = true
// 			}
// 		}
// 		return didSomething
// 	}
//
// 	const shutdownHandler = createShutdownHandler({
// 		logger,
// 		acceleratedShutdownSignalCount,
// 		immediateShutdownSignalCount,
// 		gracefulShutdown(signal) {
// 			logger.info(`Beginning graceful shutdown of worker processes  ${signal}`)
// 			if (!gracefulShutdown()) {
// 				logger.info(`Already at or beyond graceful shutdown of worker processes  ${signal}`)
// 			}
// 			if (checkConfig) {
// 				// We may not have performed a proper config check so exit with an error
// 				logger.warn('Graceful shutdown in checkConfig mode, will exit with failure after all workers exit')
// 				exitErrRef ??= { err: new Error('Shutdown in checkConfig mode'), }
// 			}
// 		},
// 		acceleratedShutdown(signal) {
// 			logger.info(`Beginning accelerated shutdown of worker processes  ${signal}`)
// 			if (!acceleratedShutdown()) {
// 				logger.info(`Already at or beyond accelerated shutdown of worker processes  ${signal}`)
// 			}
// 			if (checkConfig) {
// 				// We may not have performed a proper config check so exit with an error
// 				logger.warn('Accelerated shutdown in checkConfig mode, will exit with failure after all workers exit')
// 				exitErrRef ??= { err: new Error('Shutdown in checkConfig mode'), }
// 			}
// 		},
// 		onImmediateShutdown(signal) {
// 			logger.info(`Beginning immediate shutdown of worker processes of worker processes  ${signal}`)
// 			if (!onImmediateShutdown()) {
// 				logger.info(`Already at or beyond immediate shutdown of worker processes  ${signal}`)
// 			}
// 		}
// 	})
//
// 	// Figure out how many workers to run
// 	const desiredWorkerCount = getDesiredWorkerCount({
// 		estimatedMemoryMaxBytes,
// 		estimatedMemoryPrimaryBytes,
// 		memoryReservedBytes,
// 		estimatedMemoryWorkerBytes,
// 		minWorkers,
// 		maxWorkers,
// 	})
//
// 	logger.info(`Calculated desired worker count ${desiredWorkerCount}`)
//
// 	let workerLastAddedAt = 0
// 	let workerAddedTimeout: undefined | ReturnType<typeof setTimeout>
// 	let exitErrRef: undefined | { err: Error }
// 	let forkCount = 0
// 	let exitedCount = 0
// 	/** Whether any worker has successfully started listening */
// 	let hasListened = false
// 	let tickQueued = false
//
// 	function queueTick() {
// 		if (tickQueued) return
// 		tickQueued = true
// 		nextTick(tick)
// 	}
//
// 	function tick() {
// 		tickQueued = false
// 		const workers = Object.values(cluster.workers!) as ClusterWorker[]
// 		const workerCount = workers.length
//
// 		if (checkConfig && exitedCount === desiredWorkerCount) {
// 			// Done
// 			state.type = State.STOPPING
// 		}
//
// 		switch (state.type) {
// 			case State.STOPPING: {
// 				clearTimeout(workerAddedTimeout)
// 				if (workerCount === 0) {
// 					logger.info('All workers exited')
// 					if (exitErrRef) rej(exitErrRef.err)
// 					else res()
// 				} else {
// 					logger.info(`Waiting for workers to exit... ${workerCount}`)
// 				}
// 				break;
// 			}
// 			case State.RUNNING: {
// 				const now = Date.now()
//
// 				let action: 'noop' | 'addWorker' | 'shutdown'
// 				const longEnoughSinceLastAddedWorker = (now - workerLastAddedAt) > addWorkerDebounceMs
// 				if (checkConfig) {
// 					const isMissingWorker = forkCount < desiredWorkerCount
// 					if (longEnoughSinceLastAddedWorker && isMissingWorker) action = 'addWorker'
// 					else action = 'noop'
// 				} else if (!hasListened && exitedCount === desiredWorkerCount) {
// 					// All workers have failed to start properly
// 					// Something is probably wrong with configuration (maybe an environment variable
// 					// is configured wrong) or with the environment (maybe ports are taken)
// 					// Start shutting down so we don't loop infinitely
// 					action = 'shutdown'
// 				} else {
// 					const isMissingWorker = workerCount < desiredWorkerCount
// 					if (longEnoughSinceLastAddedWorker && isMissingWorker) action = 'addWorker'
// 					else action = 'noop'
// 				}
//
// 				switch (action) {
// 					case 'noop':
// 						break;
// 					case 'addWorker': {
// 						// Add a worker
// 						logger.debug('Forking worker...')
// 						const forkEnv: EnvironmentVariables = {
// 							// Have the cluster worker drop SIGINT's so that we can use CTRL-C
// 							// to gracefully shut down, otherwise the terminal would send SIGINT
// 							// to the process group and we couldn't finely control the shutdown process
// 							IGNORE_SIGINTS: 'true',
// 							SHUTDOWN_SIGNALS: 'SIGTERM',
// 							SHUTDOWN_SIGNAL_COUNT_ACCELERATED: String(WORKER_ACCELERATED_SHUTDOWN_SIGNAL_COUNT),
// 							SHUTDOWN_SIGNAL_COUNT_IMMEDIATE: String(WORKER_IMMEDIATE_SHUTDOWN_SIGNAL_COUNT),
// 							PRINT_OPTIONS: 'false',
// 							COUNTDOWN: '0',
// 						}
// 						const worker = cluster.fork(forkEnv)
// 						worker[kSignals] = 0
// 						worker[kListening] = false
// 						forkCount++
// 						workerLastAddedAt = now
// 						workerAddedTimeout = setTimeout(tick, addWorkerDebounceMs)
// 						break;
// 					}
// 					case 'shutdown': {
// 						logger.warn('All workers failed to start, shutting down')
// 						if (!gracefulShutdown()) {
// 							logger.warn('Already at or beyond graceful shutdown of worker processes')
// 						}
// 						failedStartupGracefulShutdownTimeout = setTimeout(handleFailedStartupGracefulShutdownTimeout, 5_000)
// 						break;
// 					}
// 				}
// 				break;
// 			}
// 			default:
// 				state satisfies never
// 				logger.error(`Unknown state ${String(state)}`)
// 		}
// 	}
//
// 	cluster.on('fork', function(worker: ClusterWorker) {
// 		logger.debug(`Cluster worker ${worker.id} forked`)
// 	})
//
// 	cluster.on('setup', function(settings: ClusterSettings) {
// 		logger.debug({ settings, }, `Cluster setup`)
// 	})
//
// 	cluster.on('online', function(worker: ClusterWorker) {
// 		logger.debug(`Cluster worker ${worker.id} online`)
// 	})
//
// 	/** Fired when a worker in the cluster starts listening for HTTP requests */
// 	cluster.on('listening', function(worker: ClusterWorker, address: ClusterAddress) {
// 		hasListened = true
// 		worker[kListening] = true
// 		logger.debug({ address }, `Cluster worker ${worker.id} listening`)
// 	})
//
// 	/** Fired when a worker in the cluster disconnects from the IPC channel (shouldn't happen) */
// 	cluster.on('disconnect', function(worker: ClusterWorker) {
// 		logger.debug(`Cluster worker ${worker.id} disconnected`)
// 	})
//
// 	/** Fired when a worker in the cluster exits */
// 	cluster.on('exit', function(worker: ClusterWorker, code: number, signal: string) {
// 		exitedCount++
// 		if (signal) {
// 			logger.info(`Cluster worker ${worker.id} killed by signal ${signal}`)
// 			queueTick()
// 		} else if (code !== 0) {
// 			logger.info(`Cluster worker ${worker.id} exited with error ${code}`)
// 			if (checkConfig) {
// 				exitErrRef ??= { err: new Error(`Cluster worker exited with code ${code}`), }
// 			} else {
// 				switch (state.type) {
// 					case State.RUNNING:
// 						break;
// 					case State.STOPPING:
// 						exitErrRef ??= { err: new Error(`Cluster worker exited with code ${code}`), }
// 						break;
// 					default:
// 						state satisfies never
// 						logger.error(`Unknown state ${String(state)}`)
// 				}
// 			}
// 			queueTick()
// 		} else {
// 			logger.debug(`Cluster worker ${worker.id} exited`)
// 			queueTick()
// 		}
// 	})
//
// 	try {
// 		for (let i = 0, len = shutdownSignals.length; i < len; i++) {
// 			process.on(shutdownSignals[i], shutdownHandler)
// 		}
// 		queueTick()
// 		await promise
// 	} finally {
// 		logger.debug('Cluster primary done')
// 		for (let i = 0, len = shutdownSignals.length; i < len; i++) {
// 			process.off(shutdownSignals[i], shutdownHandler)
// 		}
// 		clearTimeout(failedStartupGracefulShutdownTimeout)
// 		clearTimeout(failedStartupAcceleratedShutdownTimeout)
// 	}
// }
//
// export function getDesiredWorkerCount(opts: {
// 	estimatedMemoryMaxBytes: number
// 	memoryReservedBytes: number
// 	estimatedMemoryPrimaryBytes: number
// 	estimatedMemoryWorkerBytes: number
// 	minWorkers: number
// 	maxWorkers: number
// }): number {
// 	const {
// 		estimatedMemoryMaxBytes,
// 		memoryReservedBytes,
// 		estimatedMemoryPrimaryBytes,
// 		estimatedMemoryWorkerBytes,
// 		minWorkers,
// 		maxWorkers,
// 	} = opts
//
// 	let maxWorkersGivenMemory: number
// 	if (estimatedMemoryWorkerBytes === 0) {
// 		maxWorkersGivenMemory = maxWorkers
// 	} else {
// 		maxWorkersGivenMemory = (
// 			estimatedMemoryMaxBytes
// 			- estimatedMemoryPrimaryBytes
// 			- memoryReservedBytes
// 		) / estimatedMemoryWorkerBytes
// 	}
//
// 	const desiredWorkerCount = Math.max(
// 		1,
// 		Math.max(
// 			minWorkers,
// 			Math.min(
// 				maxWorkers,
// 				maxWorkersGivenMemory,
// 			)
// 		)
// 	)
//
// 	return desiredWorkerCount
// }
//
