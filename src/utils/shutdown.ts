import type { Logger } from "pino"

export type ShutdownHandler = (signal: NodeJS.Signals) => void

export function createShutdownHandler(opts: {
	logger: Logger,
	noLog?: boolean,
	acceleratedShutdownSignalCount: number,
	immediateShutdownSignalCount: number,
	gracefulShutdown: (signal: NodeJS.Signals) => void,
	acceleratedShutdown: (signal: NodeJS.Signals) => void,
	/** `process.exit` called immediately after this */
	onImmediateShutdown?: (signal: NodeJS.Signals) => void,
}): ShutdownHandler {
	const {
		logger,
		noLog = false,
		acceleratedShutdownSignalCount,
		immediateShutdownSignalCount,
		gracefulShutdown,
		acceleratedShutdown,
		onImmediateShutdown,
	} = opts
	const doLog = !noLog
	let shutdownSignals = 0
	const acceleratedSignalCount = acceleratedShutdownSignalCount
	const immediateSignalCount = immediateShutdownSignalCount
	return function handleShutdown(signal: NodeJS.Signals): void {
		shutdownSignals += 1
		if (shutdownSignals === 1) {
			if (doLog) {
				logger.warn({
					signal,
					stopSignals: shutdownSignals,
					forceStopSignalCount: acceleratedSignalCount,
					exitSignalCount: immediateSignalCount,
				}, `Beginning graceful shutdown. Keep sending signals to accelerate shutdown.`
				+ ` ${signal} ${shutdownSignals}/${acceleratedSignalCount}/${immediateSignalCount}`
				)
			}
			gracefulShutdown(signal)
		} else if (shutdownSignals < acceleratedSignalCount) {
			if (doLog) {
				logger.warn({
					signal,
					stopSignals: shutdownSignals,
					forceStopSignalCount: acceleratedSignalCount,
					exitSignalCount: immediateSignalCount,
				}, `Graceful shutdown in progress. Keep sending signals to accelerate shutdown.`
				+ ` ${signal} ${shutdownSignals}/${acceleratedSignalCount}/${immediateSignalCount}`
				)
			}
		} else if (shutdownSignals === acceleratedSignalCount) {
			if (doLog) {
				logger.warn({
					signal,
					stopSignals: shutdownSignals,
					forceStopSignalCount: acceleratedSignalCount,
					exitSignalCount: immediateSignalCount,
				}, `Beginning accelerated shutdown. Keep sending signals to force an immediate shutdown.`
				+ ` ${signal} ${shutdownSignals}/${acceleratedSignalCount}/${immediateSignalCount}`
				)
			}
			acceleratedShutdown(signal)
		} else if (shutdownSignals < immediateSignalCount) {
			if (doLog) {
				logger.warn({
					signal,
					stopSignals: shutdownSignals,
					forceStopSignalCount: acceleratedSignalCount,
					exitSignalCount: immediateSignalCount,
				}, `Accelerated shutdown in progress. Keep sending signals to force an immediate shutdown.`
				+ ` ${signal} ${shutdownSignals}/${acceleratedSignalCount}/${immediateSignalCount}`
				)
			}
		} else {
			if (doLog) {
				logger.warn({
					signal,
					stopSignals: shutdownSignals,
					forceStopSignalCount: acceleratedSignalCount,
					exitSignalCount: immediateSignalCount,
				}, `Forcing immediate shutdown.`
				+ ` ${signal} ${shutdownSignals}/${acceleratedSignalCount}/${immediateSignalCount}`
				)
			}
			if (onImmediateShutdown) {
				onImmediateShutdown(signal)
			}
			process.exit(1)
		}
	}
}

