import type { Express, } from 'express'
import type { Logger } from "pino"
import { createShutdownHandler } from "../../utils/shutdown.js"
import { runHttpServer } from "../../utils/http.js"
import type { ShutdownConfig } from "../../types.js"
import type { Server } from "node:http"

export async function serve(opts: {
	logger: Logger,
	host: string,
	port: number,
	shutdownConfig: ShutdownConfig
	httpServer: Server
	httpRouter: Express
	checkConfig: boolean,
}): Promise<void> {
	const {
		logger,
		host,
		port,
		shutdownConfig,
		httpServer,
		httpRouter,
		checkConfig,
	} = opts

	logger.debug('Preparing to serve API')

	const {
		shutdownSignals,
		acceleratedShutdownSignalCount,
		immediateShutdownSignalCount,
	} = shutdownConfig

	if (checkConfig) {
		logger.info('Config check complete')
		return
	}

	logger.debug('Starting API')

	const gracefulShutdownAborter = new AbortController()
	const acceleratedShutdownAborter = new AbortController()
	const shutdownHandler = createShutdownHandler({
		logger,
		acceleratedShutdownSignalCount,
		immediateShutdownSignalCount,
		gracefulShutdown(signal) {
			logger.debug(`Beginning graceful shutdown of cluster worker  ${signal}`)
			gracefulShutdownAborter.abort(new Error(`Graceful shutdown: ${signal}`))
		},
		acceleratedShutdown(signal) {
			logger.debug(`Beginning accelerated shutdown of cluster worker  ${signal}`)
			acceleratedShutdownAborter.abort(new Error(`Accelerated shutdown: ${signal}`))
		},
		onImmediateShutdown(signal) {
			logger.debug(`Beginning immediate shutdown of cluster worker  ${signal}`)
		},
	})

	try {
		for (let i = 0, len = shutdownSignals.length; i < len; i++) {
			process.on(shutdownSignals[i], shutdownHandler)
		}
		logger.debug(`HTTP server starting on ${host}:${port}`)
		httpServer.on('request', httpRouter)
		await runHttpServer({
			logger,
			gracefulShutdownSignal: gracefulShutdownAborter.signal,
			acceleratedShutdownSignal: acceleratedShutdownAborter.signal,
			httpServer: httpServer,
			hostname: host,
			port,
		})
		logger.debug('HTTP server finished')
	} finally {
		for (let i = 0, len = shutdownSignals.length; i < len; i++) {
			process.off(shutdownSignals[i], shutdownHandler)
		}
	}
}

