import type { Logger } from "pino"
import type { ApiClusterConfig, ApiHttpConfig, ApiPrometheusConfig, StorageConfig } from "../../env.js"
import type { Server } from "node:http"
import type { Express } from 'express'
import type { Context } from "../../types.js"
import type { Counter, Gauge, Histogram } from "prom-client"

export type ApiMetrics = {
	uptime: Gauge,
	totalHttpRequests: Counter<'method' | 'path' | 'status'>
	totalHttpRequestsFinished: Counter<'method' | 'path' | 'status'>
	totalHttpRequestsClosed: Counter<'method' | 'path' | 'status'>
	totalHttpRequestsErrored: Counter<'method' | 'path' | 'status'>
	totalHttpResponsesErrored: Counter<'method' | 'path' | 'status'>
	httpResponseTimes: Histogram<'method' | 'path' | 'status'>
}


export type ApiCommandOptions = {
	logger: Logger,
	httpConfig: ApiHttpConfig
	clusterConfig: ApiClusterConfig
	storageConfig: StorageConfig
	prometheusConfig: ApiPrometheusConfig,
	configCheck: boolean,
}

export type ApiSetupOptions = {
	logger: Logger,
	httpConfig: ApiHttpConfig
	clusterConfig: ApiClusterConfig
	storageConfig: StorageConfig
	prometheusConfig: ApiPrometheusConfig,
	configCheck: boolean,
}

export type ApiCommandConfig = {
	logger: Logger,
	httpConfig: Pick<ApiHttpConfig, 'port' | 'host'>
	clusterConfig: ApiClusterConfig
	httpServer: Server,
	httpAppRouter: Express,
}

// export type GetHealthResponse = components['schemas']['GetHealthResponse']
// export type GetVersionResponse = components['schemas']['GetVersionResponse']
// export type GetSchemaResponse = components['schemas']['GetSchemaResponse']
// export type GetBackupsResponse = components['schemas']['GetBackupsResponse']
// export type GetBackupsResponseItem = components['schemas']['GetBackupsResponseItem']
// export type PostBackupRequest = components['schemas']['PostBackupRequest']
// export type PostBackupResponse = components['schemas']['PostBackupResponse']
// export type PubkeyParameter = components['parameters']['UserId']
// export type UserIdParameter = components['parameters']['UserId']

declare global {
	namespace Express {
		interface Request {
			ctx: Context
			aborter: AbortController,
			reqid: string
			startedAt: number,
		}
	}
}

