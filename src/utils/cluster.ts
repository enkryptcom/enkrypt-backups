import cluster from 'node:cluster'
import type { ClusterSettings, Worker as ClusterWorker, Address as ClusterAddress } from 'node:cluster'
import { createShutdownHandler } from "../utils/shutdown.js";
import { nextTick } from 'node:process';
import type { EnvironmentVariables } from '../env.js';
import type { Logger } from 'pino';
import type { ClusterConfig, ShutdownConfig } from '../types.js';

const WORKER_GRACEFUL_SHUTDOWN_SIGNAL_COUNT = 1
const WORKER_ACCELERATED_SHUTDOWN_SIGNAL_COUNT = 2
const WORKER_IMMEDIATE_SHUTDOWN_SIGNAL_COUNT = 3

// Timeouts when the cluster fails to start properly
// These timeouts are short because we want to fail fast
const FAILED_STARTUP_GRACEFUL_SHUTDOWN_TIMEOUT = 5_000
const FAILED_STARTUP_ACCELERATED_SHUTDOWN_TIMEOUT = 10_000

// Timeouts for each worker when the cluster is reloaded with SIGHUP
// We shut down each worker slowly one-by-one (with a large timeout
// incase they fail to shut down for some reason) so we don't drop
// any requests while we gracefully roll over the cluster
const ROLLOVER_GRACEFUL_SHUTDOWN_TIMEOUT = 45_000
const ROLLOVER_ACCELERATED_SHUTDOWN_TIMEOUT = 90_000
// Safety check just in case something goes wrong and we're not
// checking roll over properly
const ROLLOVER_CHECK_INTERVAL = 17_500

const kGenerationId = Symbol('GenerationId')
const kExited = Symbol('Exited')
const kSignals = Symbol('Signals')
const kListening = Symbol('Listening')

declare module 'node:cluster' {
	interface Worker {
		[kGenerationId]: number
		[kSignals]: number
		[kListening]: boolean
		[kExited]: boolean
	}
}

/**
 * Manages a HTTP cluster
 *
 * Spin up worker processes to handle HTTP requests
 *
 * Spins up new worker processes when old worker processes die
 *
 * Receive exit signals and instruct workers to tear down and exit
 */
export async function manageCluster(opts: {
	logger: Logger,
	checkConfig: boolean,
	clusterConfig: ClusterConfig,
	shutdownConfig: ShutdownConfig,
}): Promise<void> {
	const {
		logger,
		checkConfig,
		clusterConfig,
		shutdownConfig,
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

	const {
		shutdownSignals,
		acceleratedShutdownSignalCount,
		immediateShutdownSignalCount,
	} = shutdownConfig

	let res: () => void
	let rej: (reason: Error) => void
	const promise = new Promise<void>(function(_res, _rej) {
		res = _res
		rej = _rej
	})

	const State = { RUNNING: 'RUNNING', STOPPING: 'STOPPING', } as const
	type State = typeof State[keyof typeof State]
	let state: State = State.RUNNING

	let failedStartupGracefulShutdownTimeout: undefined | ReturnType<typeof setTimeout>
	let failedStartupAcceleratedShutdownTimeout: undefined | ReturnType<typeof setTimeout>

	// We only roll over one worker at a time to avoid downtime
	let workerRollingOver: undefined | ClusterWorker
	let workerRolloverGracefulShutdownTimeout: undefined | ReturnType<typeof setTimeout>
	let workerRolloverAcceleratedShutdownTimeout: undefined | ReturnType<typeof setTimeout>

	/**
	 * ID of the current generation of workers
	 *
	 * Increased every time RELOAD (SIGHUP) is received and a rollover is triggered
	 */
	let currentGenerationId = 0

	/**
	 * Fired when the initial workers fail to start properly and some workers take
	 * too long to gracefully shutdown
	 */
	function handleFailedStartupGracefulShutdownTimeout() {
		logger.warn('Timed out waiting for graceful shutdown after startup failed, beginning accelerated shutdown')
		if (!acceleratedShutdown()) {
			logger.warn('Already at or beyond accelerated shutdown of worker processes')
		}
	}

	/**
	 * Fired when the intial workers fail to start properly and some workers refuse
	 * to shutdown
	 */
	function handleFailedStartupAcceleratedShutdownTimeout() {
		logger.warn('Timed out waiting for accelerated shutdown after startup failed, beginning immediate shutdown')
		if (!onImmediateShutdown()) {
			logger.warn('Already at or beyond immediate shutdown of worker processes')
		}
		process.exit(1)
	}

	/**
	 * Check if there are any workers waiting to be rolled over (of a prior generation)
	 * and if possible gracefully shut the next one down
	 *
	 * Can only roll over one worker at a time
	 */
	function checkRollover(): void {
		checkRolloverQueued = false

		if (state === State.STOPPING) {
			logger.trace('Cluster is stopping, not checking rolling over')
			return
		}

		if (workerRollingOver !== undefined) {
			logger.trace('Worker is already rolling over, not checking generations')
			return
		}

		const generations = new Map<number, ClusterWorker[]>()
		let lowestGenerationId: undefined | number
		let highestGenerationId: undefined | number

		// Group workers by generation
		// Determine the lowest and highest current generations
		for (const workerId in cluster.workers) {
			const worker = cluster.workers[workerId]!
			const generationId = worker[kGenerationId]
			if (lowestGenerationId === undefined || generationId < lowestGenerationId) {
				lowestGenerationId = generationId
			}
			if (highestGenerationId === undefined || generationId > highestGenerationId) {
				highestGenerationId = generationId
			}
			let generationWorkers = generations.get(generationId)
			if (!generationWorkers) {
				generationWorkers = []
				generations.set(generationId, generationWorkers)
			}
			generationWorkers.push(worker)
		}

		if (lowestGenerationId === undefined || lowestGenerationId === currentGenerationId) {
			logger.trace('No old generations to check')
			return
		}

		const generationIdsAsc = Array.from(generations.keys()).sort(asc)

		// If possible, remove a worker from the oldest generation
		let workerToRemove: undefined | ClusterWorker
		let otherWorkersAreListening: undefined | boolean
		for (let i = 0, len = generationIdsAsc.length; i < len; i++) {
			const generationId = generationIdsAsc[i]
			const generationWorkers = generations.get(generationId)!
			for (let ii = 0, llen = generationWorkers.length; ii < llen; ii++) {
				const worker = generationWorkers[ii]
				if (workerToRemove === undefined && generationId !== currentGenerationId) {
					workerToRemove = worker
				} else if (worker[kListening]) {
					otherWorkersAreListening = true
				}
			}
		}

		if (workerToRemove && (otherWorkersAreListening || desiredWorkerCount === 1)) {
			logger.info(`Rolling over worker "${workerToRemove.id}" from generation ${workerToRemove[kGenerationId]}`)
			workerRollingOver = workerToRemove
			workerRolloverGracefulShutdownTimeout = setTimeout(
				handleRolloverWorkerGracefulShutdownTimeout,
				ROLLOVER_GRACEFUL_SHUTDOWN_TIMEOUT,
			) as unknown as ReturnType<typeof setTimeout>
			workerRolloverAcceleratedShutdownTimeout = setTimeout(
				handleRolloverWorkerAcceleratedGracefulShutdownTimeout,
				ROLLOVER_ACCELERATED_SHUTDOWN_TIMEOUT,
			) as unknown as ReturnType<typeof setTimeout>
			gracefullyShutdownWorker(workerToRemove)
		} else if (workerToRemove) {
			logger.warn('Cannot roll over worker, no other workers listening yet')
		}
	}

	function handleRolloverWorkerGracefulShutdownTimeout(): void {
		if (!workerRollingOver) {
			logger.warn('Rollover worker graceful shutdown timeout triggered but no worker rolling over')
			return
		}
		if (workerRollingOver[kExited]) {
			logger.warn(`Rollover worker graceful shutdown timeout triggered but worker "${workerRollingOver.id}" already exited`)
			return
		}
		logger.warn(
			`Timed out waiting for rollover graceful shutdown of worker "${workerRollingOver.id}"`
			+ ` from generation ${workerRollingOver[kGenerationId]}, beginning accelerated shutdown`
		)
		acceleratedShutdownWorker(workerRollingOver)
	}

	function handleRolloverWorkerAcceleratedGracefulShutdownTimeout(): void {
		if (!workerRollingOver) {
			logger.warn('Rollover worker accelerated shutdown timeout triggered but no worker rolling over')
			return
		}
		if (workerRollingOver[kExited]) {
			logger.warn(`Rollover worker accelerated shutdown timeout triggered but worker "${workerRollingOver.id}" already exited`)
			return
		}
		logger.warn(
			`Timed out waiting for rollover accelerated shutdown of worker "${workerRollingOver.id}"`
			+ ` from generation ${workerRollingOver[kGenerationId]}, beginning immediate shutdown`
		)
		immediateShutdownWorker(workerRollingOver)
	}

	/** Instruct a worker to begin a graceful shutdown */
	function gracefullyShutdownWorker(worker: ClusterWorker): boolean {
		let didSomething = false
		while (worker[kSignals] < WORKER_GRACEFUL_SHUTDOWN_SIGNAL_COUNT) {
			logger.debug(`Instructing graceful shutdown of worker "${worker.id}" with SIGTERM`)
			worker[kSignals]++
			worker.kill('SIGTERM')
			didSomething = true
		}
		return didSomething
	}

	/** Instruct a worker to begin an accelerated shutdown */
	function acceleratedShutdownWorker(worker: ClusterWorker): boolean {
		let didSomething = false
		while (worker[kSignals] < WORKER_ACCELERATED_SHUTDOWN_SIGNAL_COUNT) {
			logger.debug(`Instructing accelerated shutdown of worker "${worker.id}" with SIGTERM`)
			worker[kSignals]++
			worker.kill('SIGTERM')
			didSomething = true
		}
		return didSomething
	}

	/** Instruct a worker to shut down immediately */
	function immediateShutdownWorker(worker: ClusterWorker): boolean {
		let didSomething = false
		while (worker[kSignals] < WORKER_IMMEDIATE_SHUTDOWN_SIGNAL_COUNT) {
			logger.debug(`Instructing immediate shutdown of worker "${worker.id}" with SIGKILL`)
			worker[kSignals]++
			worker.kill('SIGKILL')
			didSomething = true
		}
		return didSomething
	}

	/** Instruct all workers to begin a graceful shutdown */
	function gracefulShutdown(): boolean {
		if (state !== State.STOPPING) state = State.STOPPING
		let didSomething = false
		for (const workerId in cluster.workers) {
			const worker = cluster.workers[workerId]!
			didSomething = gracefullyShutdownWorker(worker)
		}
		return didSomething
	}

	/** Instruct all workers to begin an accelerated shutdown */
	function acceleratedShutdown(): boolean {
		if (state !== State.STOPPING) state = State.STOPPING
		let didSomething = false
		for (const workerId in cluster.workers) {
			const worker = cluster.workers[workerId]!
			didSomething = acceleratedShutdownWorker(worker)
		}
		return didSomething
	}

	/** Force all workers to immediately shut down */
	function onImmediateShutdown(): boolean {
		if (state !== State.STOPPING) state = State.STOPPING
		let didSomething = false
		for (const workerId in cluster.workers) {
			const worker = cluster.workers[workerId]!
			didSomething = immediateShutdownWorker(worker)
		}
		return didSomething
	}

	const shutdownHandler = createShutdownHandler({
		logger,
		acceleratedShutdownSignalCount,
		immediateShutdownSignalCount,
		gracefulShutdown(signal) {
			logger.info(`Beginning graceful shutdown of worker processes  ${signal}`)
			if (!gracefulShutdown()) {
				logger.info(`Already at or beyond graceful shutdown of worker processes  ${signal}`)
			}
			if (checkConfig) {
				// We may not have performed a proper config check so exit with an error
				logger.warn('Graceful shutdown in checkConfig mode, will exit with failure after all workers exit')
				exitErrRef ??= { err: new Error('Shutdown in checkConfig mode'), }
			}
		},
		acceleratedShutdown(signal) {
			logger.info(`Beginning accelerated shutdown of worker processes  ${signal}`)
			if (!acceleratedShutdown()) {
				logger.info(`Already at or beyond accelerated shutdown of worker processes  ${signal}`)
			}
			if (checkConfig) {
				// We may not have performed a proper config check so exit with an error
				logger.warn('Accelerated shutdown in checkConfig mode, will exit with failure after all workers exit')
				exitErrRef ??= { err: new Error('Shutdown in checkConfig mode'), }
			}
		},
		onImmediateShutdown(signal) {
			logger.info(`Beginning immediate shutdown of worker processes of worker processes  ${signal}`)
			if (!onImmediateShutdown()) {
				logger.info(`Already at or beyond immediate shutdown of worker processes  ${signal}`)
			}
		}
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

	logger.info(`Calculated desired worker count ${desiredWorkerCount}`)

	let workerLastAddedAt = 0
	let workerAddedTimeout: undefined | ReturnType<typeof setTimeout>
	let exitErrRef: undefined | { err: Error }
	let forkCount = 0
	let exitedCount = 0
	/** Whether any worker has successfully started listening */
	let hasListened = false
	let checkRolloverQueued = false
	let tickQueued = false

	function queueCheckRollover() {
		if (checkRolloverQueued) return
		checkRolloverQueued = true
		nextTick(checkRollover)
	}

	function queueTick() {
		if (tickQueued) return
		tickQueued = true
		nextTick(tick)
	}

	function tick() {
		tickQueued = false
		const workers = Object.values(cluster.workers!) as ClusterWorker[]
		const workerCount = workers.length

		if (checkConfig && exitedCount === desiredWorkerCount) {
			// Done
			state = State.STOPPING
		}

		switch (state) {
			case State.STOPPING: {
				clearTimeout(workerAddedTimeout)
				if (workerCount === 0) {
					logger.info('All workers exited')
					if (exitErrRef) rej(exitErrRef.err)
					else res()
				} else {
					logger.info(`Waiting for workers to exit... ${workerCount}`)
				}
				break;
			}
			case State.RUNNING: {
				const now = Date.now()

				let action: 'noop' | 'addWorker' | 'shutdown'
				const longEnoughSinceLastAddedWorker = (now - workerLastAddedAt) > addWorkerDebounceMs
				if (checkConfig) {
					const isMissingWorker = forkCount < desiredWorkerCount
					if (longEnoughSinceLastAddedWorker && isMissingWorker) action = 'addWorker'
					else action = 'noop'
				} else if (!hasListened && exitedCount === desiredWorkerCount) {
					// All workers have failed to start properly
					// Something is probably wrong with configuration (maybe an environment variable
					// is configured wrong) or with the environment (maybe ports are taken)
					// Start shutting down so we don't loop infinitely
					action = 'shutdown'
				} else {
					const isMissingWorker = workerCount < desiredWorkerCount
					if (longEnoughSinceLastAddedWorker && isMissingWorker) action = 'addWorker'
					else action = 'noop'
				}

				switch (action) {
					case 'noop':
						break;
					case 'addWorker': {
						// Add a worker
						logger.debug('Forking worker...')
						const forkEnv: EnvironmentVariables = {
							// Have the cluster worker drop SIGINT's so that we can use CTRL-C
							// to gracefully shut down, otherwise the terminal would send SIGINT
							// to the process group and we couldn't finely control the shutdown process
							IGNORE_SIGINTS: 'true',
							SHUTDOWN_SIGNALS: 'SIGTERM',
							SHUTDOWN_SIGNAL_COUNT_ACCELERATED: String(WORKER_ACCELERATED_SHUTDOWN_SIGNAL_COUNT),
							SHUTDOWN_SIGNAL_COUNT_IMMEDIATE: String(WORKER_IMMEDIATE_SHUTDOWN_SIGNAL_COUNT),
							PRINT_OPTIONS: 'false',
							COUNTDOWN: '0',
						}
						const worker = cluster.fork(forkEnv)
						worker[kGenerationId] = currentGenerationId
						worker[kSignals] = 0
						worker[kListening] = false
						worker[kExited] = false
						forkCount++
						workerLastAddedAt = now
						workerAddedTimeout = setTimeout(tick, addWorkerDebounceMs)
						break;
					}
					case 'shutdown': {
						logger.warn('All workers failed to start, shutting down')
						if (!gracefulShutdown()) {
							logger.warn('Already at or beyond graceful shutdown of worker processes')
						}
						failedStartupGracefulShutdownTimeout = setTimeout(
							handleFailedStartupGracefulShutdownTimeout,
							FAILED_STARTUP_GRACEFUL_SHUTDOWN_TIMEOUT
						)
						failedStartupAcceleratedShutdownTimeout = setTimeout(
							handleFailedStartupAcceleratedShutdownTimeout,
							FAILED_STARTUP_ACCELERATED_SHUTDOWN_TIMEOUT,
						)
						break;
					}
				}
				break;
			}
			default:
				state satisfies never
				logger.error(`Unknown state ${String(state)}`)
		}
	}

	cluster.on('fork', function(worker: ClusterWorker) {
		logger.debug(`Cluster worker ${worker.id} forked`)
	})

	cluster.on('setup', function(settings: ClusterSettings) {
		logger.debug({ settings, }, `Cluster setup`)
	})

	cluster.on('online', function(worker: ClusterWorker) {
		logger.debug(`Cluster worker ${worker.id} online`)
	})

	/** Fired when a worker in the cluster starts listening for HTTP requests */
	cluster.on('listening', function(worker: ClusterWorker, address: ClusterAddress) {
		hasListened = true
		worker[kListening] = true
		logger.debug({ address }, `Cluster worker ${worker.id} listening`)
		queueCheckRollover()
	})

	/** Fired when a worker in the cluster disconnects from the IPC channel (shouldn't happen) */
	cluster.on('disconnect', function(worker: ClusterWorker) {
		logger.debug(`Cluster worker ${worker.id} disconnected`)
	})

	/** Fired when a worker in the cluster exits */
	cluster.on('exit', function(worker: ClusterWorker, code: number, signal: string) {
		exitedCount++

		worker[kExited] = true

		if (worker[kGenerationId] !== currentGenerationId) {
			// Worker is from a previous generation
			// Kill the next worker of that generateion if there are any
			logger.debug(`Cluster worker ${worker.id} exited from previous generation ${worker[kGenerationId]}`)
		}

		if (worker === workerRollingOver) {
			logger.debug(`Cluster worker ${worker.id} rolled over`)
			workerRollingOver = undefined
			clearTimeout(workerRolloverGracefulShutdownTimeout)
			clearTimeout(workerRolloverAcceleratedShutdownTimeout)
		}

		if (signal) {
			logger.info(`Cluster worker ${worker.id} killed by signal ${signal}`)
			queueCheckRollover()
			queueTick()
			return
		}

		if (code !== 0) {
			logger.info(`Cluster worker ${worker.id} exited with error ${code}`)
			if (checkConfig) {
				exitErrRef ??= { err: new Error(`Cluster worker exited with code ${code}`), }
			} else {
				switch (state) {
					case State.RUNNING:
						break;
					case State.STOPPING:
						exitErrRef ??= { err: new Error(`Cluster worker exited with code ${code}`), }
						break;
					default:
						state satisfies never
						logger.error(`Unknown state ${String(state)}`)
				}
			}
			queueCheckRollover()
			queueTick()
			return
		}

		logger.debug(`Cluster worker ${worker.id} exited`)
		queueCheckRollover()
		queueTick()
	})

	function reloadHandler(signal: NodeJS.Signals): void {
		currentGenerationId++
		logger.info(`Beginning rollover due to signal ${signal}. New generation ID ${currentGenerationId}`)
		queueCheckRollover()
	}

	const checkRolloverInterval = setInterval(function() {
		logger.trace('Checking rollover (interval)')
		queueCheckRollover()
	}, ROLLOVER_CHECK_INTERVAL)

	try {
		process.on('SIGHUP', reloadHandler)
		for (let i = 0, len = shutdownSignals.length; i < len; i++) {
			process.on(shutdownSignals[i], shutdownHandler)
		}
		queueTick()
		await promise
	} finally {
		logger.debug('Cluster primary done')
		process.off('SIGHUP', reloadHandler)
		for (let i = 0, len = shutdownSignals.length; i < len; i++) {
			process.off(shutdownSignals[i], shutdownHandler)
		}
		clearInterval(checkRolloverInterval)
		clearTimeout(failedStartupGracefulShutdownTimeout)
		clearTimeout(failedStartupAcceleratedShutdownTimeout)
		clearTimeout(workerRolloverGracefulShutdownTimeout)
		clearTimeout(workerRolloverAcceleratedShutdownTimeout)
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

function asc(a: number, b: number): number {
	return a - b
}
