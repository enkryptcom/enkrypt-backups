import EventEmitter from "node:events"
import type { Context } from "../../types.js"
import type { CommandConfig } from "./types.js"
import { runHttpServer, type HttpServerControllerEvents } from "../../utils/http.js"

export async function run(
	config: CommandConfig,
	controller: EventEmitter<HttpServerControllerEvents>,
): Promise<void> {
	const {
		logger,
		httpAppRouter,
		httpServer,
		httpConfig,
	} = config

	const {
		port,
		host,
	} = httpConfig

	httpServer.on('request', httpAppRouter)

	const aborter = new AbortController()
	const ctx: Context = { logger, signal: aborter.signal, }

	await runHttpServer(ctx, {
		server: httpServer,
		controller,
		port,
		hostname: host,
	})
}

