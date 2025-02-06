import type { Server } from "http"
import type { ApiHttpConfig } from "../../env.js"
import { createServer, } from 'node:http'

export function createHttpServer(opts: {
	httpConfig: ApiHttpConfig
}): Server {
	const {
		httpConfig,
	} = opts

	const {
		serverKeepAlive,
		serverKeepAliveTimeoutMs,
		serverKeepMaxHeaderSizeBytes,
		serverTcpNodelay,
		reqHardTimeoutMs,
		reqHardTimeoutIntervalMs,
	} = httpConfig

	const server = createServer({
		keepAlive: serverKeepAlive,
		keepAliveTimeout: serverKeepAliveTimeoutMs,
		maxHeaderSize: serverKeepMaxHeaderSizeBytes,
		noDelay: serverTcpNodelay,
		requestTimeout: reqHardTimeoutMs,
		connectionsCheckingInterval: reqHardTimeoutIntervalMs,
	})

	return server
}

