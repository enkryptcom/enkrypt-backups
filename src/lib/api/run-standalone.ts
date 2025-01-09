import EventEmitter from "node:events"
import { Disposer } from "../../utils/disposer.js"
import { setup } from "./setup.js"
import type { HttpServerControllerEvents } from "../../utils/http.js"
import { createStopSignalHandler } from "../../utils/signals.js"
import { run } from "./run.js"
import type { SetupOptions } from "./types.js"

export async function runApiStandalone(opts: SetupOptions): Promise<void> {
	const { logger, configCheck, } = opts

	logger.info('Setting up standalone API process')

	await using disposer = new Disposer({ logger, })

	const conf = await setup(disposer, opts)

	if (configCheck) {
		logger.info('Config check complete')
		return
	}

	logger.info('Starting API')

	const controller = new EventEmitter<HttpServerControllerEvents>()

	const onSIGINT = createStopSignalHandler({
		logger,
		onGracefullyStop() {
			logger.info('Gracefully stopping...')
			controller.emit('beginGracefulShutdown')
		},
		onForcefullyStop() {
			logger.info('Forcefully stopping...')
			controller.emit('beginForcefulShutdown')
		},
	})

	try {
		process.on('SIGINT', onSIGINT)
		await run(conf, controller)
	} finally {
		process.off('SIGINT', onSIGINT)
	}
}

