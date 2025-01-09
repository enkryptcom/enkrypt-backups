import cluster from 'node:cluster'
import type { ClusterSettings, Worker as ClusterWorker, Address as ClusterAddress } from 'node:cluster'
import type { Socket as NetSocket, Server as NetServer, } from 'node:net'
import { createStopSignalHandler } from "../../utils/signals.js";
import { nextTick } from 'node:process';
import type { ApiClusterConfig, EnvironmentVariables } from '../../env.js';
import { ClusterPrimaryMessage, ClusterWorkerMessage } from './cluster-messages.js';
import type { Logger } from 'pino';

/**
 * Manages the API HTTP cluster
 *
 * Spin up worker processes to handle HTTP requests
 *
 * Spins up new worker processes when old worker processes die
 *
 * Receive exit signals and instruct workers to tear down and exit
 */
export async function runApiClusterPrimary(opts: {
	logger: Logger,
	configCheck: boolean,
	clusterConfig: Pick<ApiClusterConfig,
		| 'minWorkers'
		| 'maxWorkers'
		| 'estimatedMemoryPrimaryBytes'
		| 'estimatedMemoryWorkerBytes'
		| 'estimatedMemoryMaxBytes'
		| 'memoryReservedBytes'
		| 'addWorkerDebounceMs'
	>,
}): Promise<void> {
	const {
		logger,
		configCheck,
		clusterConfig,
	} = opts

	const {
		minWorkers,
		maxWorkers,
		estimatedMemoryPrimaryBytes,
		estimatedMemoryWorkerBytes,
		estimatedMemoryMaxBytes,
		memoryReservedBytes,
		addWorkerDebounceMs,
	} = clusterConfig

	let done!: (err?: Error) => void;
	const donePromise = new Promise<void>(function(res, rej) {
		done = function(err) {
			if (err === undefined) res(err)
			else rej(err)
		}
	})

	const State = {
		RUNNING: 'RUNNING',
		STOPPING: 'STOPPING',
	} as const
	type State =
		| { type: typeof State.RUNNING }
		| { type: typeof State.STOPPING, err: undefined | Error }
	let state: State = { type: State.RUNNING }

	const LastMessage = {
		GRACEFUL_SHUTDOWN: 'GRACEFUL_SHUTDOWN',
		FORCEFUL_SHUTDOWN: 'FORCEFUL_SHUTDOWN',
	} as const
	let lastMessage: null | typeof LastMessage[keyof typeof LastMessage] = null

	const signalHandler = createStopSignalHandler({
		logger,
		onGracefullyStop() {
			logger.info('Gracefully stopping workers...')
			lastMessage = LastMessage.GRACEFUL_SHUTDOWN
			const message: ClusterPrimaryMessage = { type: ClusterPrimaryMessage.BEGIN_GRACEFUL_SHUTDOWN, }
			state = { type: State.STOPPING, err: undefined, }
			for (const workerId in cluster.workers) {
				const worker = cluster.workers[workerId]
				if (worker) {
					worker.send(message)
				}
			}
			if (configCheck) {
				logger.warn('Gracefully stopping in configCheck mode, will exit with failure after all workers exit')
				exitErrRef ??= { err: new Error('Gracefully stopping in configCheck mode'), }
			}
			queueTick()
		},
		onForcefullyStop() {
			logger.info('Forcefully stopping workers...')
			lastMessage = LastMessage.FORCEFUL_SHUTDOWN
			const message: ClusterPrimaryMessage = { type: ClusterPrimaryMessage.BEGIN_FORCEFUL_SHUTDOWN, }
			state = { type: State.STOPPING, err: undefined, }
			for (const workerId in cluster.workers) {
				const worker = cluster.workers[workerId]
				if (worker) {
					worker.send(message)
				}
			}
			if (configCheck) {
				logger.warn('Forcefully stopping in configCheck mode, will exit with failure after all workers exit')
				exitErrRef ??= { err: new Error('Forcefully stopping in configCheck mode'), }
			}
			queueTick()
		},
	})

	// Figure out how many workers to run
	const desiredWorkerCount = getDesiredWorkerCount({
		estimatedMemoryMaxBytes,
		estimatedMemoryPrimaryBytes,
		memoryReservedBytes,
		estimatedMemoryWorkerBytes,
		minWorkers,
		maxWorkers,
	})

	logger.info(
		{ desiredWorkerCount, },
		'Calculated desired worker count',
	)

	let workerLastAddedAt = 0
	const workerAddDebounce = addWorkerDebounceMs
	let workerAddedTimeout: undefined | ReturnType<typeof setTimeout>
	let exitErrRef: undefined | { err: Error }
	let forkCount = 0
	let exitedCount = 0
	let tickQueued = false

	function queueTick() {
		if (tickQueued) return
		tickQueued = true
		nextTick(tick)
	}

	function tick() {
		tickQueued = false
		const workers = Object.values(cluster.workers!) as ClusterWorker[]
		const workerCount = workers.length

		if (configCheck && exitedCount === desiredWorkerCount) {
			// Done
			state.type = State.STOPPING
		}

		switch (state.type) {
			case State.STOPPING: {
				clearTimeout(workerAddedTimeout)
				if (workerCount === 0) {
					logger.info('All workers exited')
					done(exitErrRef?.err)
				} else {
					logger.info({ workerCount }, 'Waiting for workers to exit...')
				}
				break;
			}
			case State.RUNNING: {
				const now = Date.now()
				// Check if we need to add more workers and it's been long enough since the last worker was added
				// (or if we're just checking config then add workers until we've added the desired amount)
				const addWorkerForConfigCheck = configCheck && forkCount < desiredWorkerCount
				const addWorkerForMissing = !configCheck && workerCount < desiredWorkerCount
				const longEnoughSinceLastAddedWorker = now - workerLastAddedAt > workerAddDebounce
				if ((addWorkerForConfigCheck || addWorkerForMissing) && longEnoughSinceLastAddedWorker) {
					// Add a worker
					logger.info('Forking worker...')
					const forkEnv: EnvironmentVariables = {
						PRINT_OPTIONS: 'false',
					}
					cluster.fork(forkEnv)
					forkCount++
					workerLastAddedAt = now
					workerAddedTimeout = setTimeout(tick, workerAddDebounce)
				}
				break;
			}
			default:
				state satisfies never
				logger.error({ state }, `Unknown state`)
		}

	}

	cluster.on('fork', function(worker: ClusterWorker) {
		logger.info({ eventWorkerId: worker.id }, 'Cluster worker forked')
	})

	cluster.on('setup', function(settings: ClusterSettings) {
		logger.info({ settings, }, `Cluster worker setup`)
	})

	cluster.on('online', function(worker: ClusterWorker) {
		logger.info({ eventWorkerId: worker.id }, 'Cluster worker online',)
	})

	cluster.on('message', function(worker: ClusterWorker, _message: unknown, handle: NetSocket | NetServer) {
		if (!_message) return
		if (typeof _message === 'object') return
		if ((_message as Record<PropertyKey, unknown>).type !== 'string') return

		const message = _message as ClusterWorkerMessage
		switch (message.type) {
			case ClusterWorkerMessage.READY:
				logger.info({ eventWorkerId: worker.id }, `Cluster worker ready`,)
				switch (lastMessage) {
					case null:
						break;
					case LastMessage.GRACEFUL_SHUTDOWN: {
						// In-case worker was still booting and missed shutdown message
						const response: ClusterPrimaryMessage = { type: ClusterPrimaryMessage.BEGIN_GRACEFUL_SHUTDOWN }
						worker.send(response)
						break;
					}
					case LastMessage.FORCEFUL_SHUTDOWN: {
						// In-case worker was still booting and missed shutdown message
						const response: ClusterPrimaryMessage = { type: ClusterPrimaryMessage.BEGIN_FORCEFUL_SHUTDOWN }
						worker.send(response)
						break;
					}
					default:
						lastMessage satisfies never
						logger.error({ state: lastMessage }, 'Unknown state')
				}
				break;
			default:
				// Ignore
				break;
		}
	})

	cluster.on('listening', function(worker: ClusterWorker, address: ClusterAddress) {
		logger.info({ eventWorkerId: worker.id, address, }, `Cluster worker listening`)
	})

	cluster.on('disconnect', function(worker: ClusterWorker) {
		logger.info({ eventWorkerId: worker.id }, 'Cluster worker disconnected',)
	})

	cluster.on('exit', function(worker: ClusterWorker, code: number, signal: string) {
		exitedCount++
		if (signal) {
			logger.info({ eventWorkerId: worker.id, signal: signal }, 'Cluster worker killed by signal')
			queueTick()
		} else if (code !== 0) {
			logger.info({ eventWorkerId: worker.id, code: code }, 'Cluster worker exited with error')
			if (configCheck) {
				exitErrRef ??= { err: new Error(`Worker exited with code ${code}`), }
			} else {
				switch (state.type) {
					case State.RUNNING:
						break;
					case State.STOPPING:
						exitErrRef ??= { err: new Error(`Worker exited with code ${code}`), }
						break;
					default:
						state satisfies never
						logger.error({ state }, 'Unknown state')
				}
			}
			queueTick()
		} else {
			logger.info({ eventWorkerId: worker.id }, 'Cluster worker exited')
			queueTick()
		}
	})

	try {
		process.on('SIGINT', signalHandler)
		queueTick()
		await donePromise
	} finally {
		logger.info('Primary process done')
		process.off('SIGINT', signalHandler)
		clearTimeout(workerAddedTimeout)
	}
}

export function getDesiredWorkerCount(opts: {
	estimatedMemoryMaxBytes: number
	memoryReservedBytes: number
	estimatedMemoryPrimaryBytes: number
	estimatedMemoryWorkerBytes: number
	minWorkers: number
	maxWorkers: number
}): number {
	const {
		estimatedMemoryMaxBytes,
		memoryReservedBytes,
		estimatedMemoryPrimaryBytes,
		estimatedMemoryWorkerBytes,
		minWorkers,
		maxWorkers,
	} = opts

	let maxWorkersGivenMemory: number
	if (estimatedMemoryWorkerBytes === 0) {
		maxWorkersGivenMemory = maxWorkers
	} else {
		maxWorkersGivenMemory = (
			estimatedMemoryMaxBytes
			- estimatedMemoryPrimaryBytes
			- memoryReservedBytes
		) / estimatedMemoryWorkerBytes
	}

	const desiredWorkerCount = Math.max(
		1,
		Math.max(
			minWorkers,
			Math.min(
				maxWorkers,
				maxWorkersGivenMemory,
			)
		)
	)

	return desiredWorkerCount
}

