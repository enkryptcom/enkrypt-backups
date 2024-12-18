import type { Logger } from "pino"

export function createStopSignalHandler(opts: {
	logger: Logger,
	onGracefullyStop: () => void,
	onForcefullyStop: () => void,
}): (signal: NodeJS.Signals) => void {
	const { logger, onGracefullyStop, onForcefullyStop, } = opts
	let stopSignals = 0
	const forceStopSignalCount = 5
	const exitSignalCount = 10
	return function handleSIGINT(signal: NodeJS.Signals): void {
		stopSignals += 1
		if (stopSignals === 1) {
			logger.warn({
				signal,
				stopSignals,
				forceStopSignalCount,
				exitSignalCount,
			}, `Stopping, keep sending signals to force exit`)
			onGracefullyStop()
		} else if (stopSignals < forceStopSignalCount) {
			logger.warn({
				signal,
				stopSignals,
				forceStopSignalCount,
				exitSignalCount,
			}, `Keep sending signals to forcibly stop`)
		} else if (stopSignals === forceStopSignalCount) {
			logger.warn({
				signal,
				stopSignals,
				forceStopSignalCount,
				exitSignalCount,
			}, `Force stopping`)
			onForcefullyStop()
		} else if (stopSignals < exitSignalCount) {
			logger.warn({
				signal,
				stopSignals,
				forceStopSignalCount,
				exitSignalCount,
			}, `Keep sending signals to exit the process`)
		} else {
			logger.warn({
				signal,
				stopSignals,
				forceStopSignalCount,
				exitSignalCount,
			},
				`Exiting process`,
			)
			process.exit(1)
		}
	}
}
