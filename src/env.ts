import { cpus, tmpdir, totalmem, } from 'node:os'
import { boolOpt, bytesOpt, intOpt, msOpt, rateOpt } from './utils/options.js'
import type { Logger } from 'pino'
import { fmtDurationPrecise } from './utils/time.js'
import { fmtBytes, } from './utils/bytes.js'
import type { ClusterConfig, PrometheusConfig, ShutdownConfig } from './types.js'

declare global {
	namespace NodeJS {
		interface ProcessEnv extends EnvironmentVariables { }
	}
}

export type EnvironmentVariables = {
	/** Set programatically to forcibly avoid printing options (used in api cluster mode) */
	PRINT_OPTIONS?: string
	/** Set programatically for simpler managing of child process lifecycles */
	IGNORE_SIGINTS?: string,

	TZ?: string

	LOG_LEVEL?: string
	LOG_FORMAT?: string
	LOG_PRETTY_SYNC?: string
	LOG_PRETTY_COLOR?: string
	LOG_PRETTY_SINGLE_LINE?: string
	LOG_BINDINGS?: string

	COUNTDOWN?: string
	COMMAND?: string

	DEBUG?: string

	SHUTDOWN_SIGNALS?: string,
	SHUTDOWN_SIGNAL_COUNT_ACCELERATED?: string
	SHUTDOWN_SIGNAL_COUNT_IMMEDIATE?: string

	STORAGE_DRIVER?: string

	STORAGE_FILESYSTEM_ROOT_DIRPATH?: string
	STORAGE_FILESYSTEM_TMP_DIRPATH?: string

	STORAGE_S3_BUCKET_NAME?: string
	STORAGE_S3_BUCKET_REGION?: string
	STORAGE_S3_BUCKET_ROOT_PATH?: string
	STORAGE_S3_REQUEST_HANDLER_CONNECTION_TIMEOUT?: string
	STORAGE_S3_REQUEST_HANDLER_REQUEST_TIMEOUT?: string
	STORAGE_S3_AGENT_KEEP_ALIVE?: string
	STORAGE_S3_AGENT_KEEP_ALIVE_TIMEOUT?: string
	STORAGE_S3_AGENT_MAX_SOCKETS?: string
	STORAGE_S3_AGENT_TIMEOUT?: string
	STORAGE_S3_AGENT_TCP_NODELAY?: string

	API_MAINTENANCE_MODE?: string
	API_ORIGIN_WHITELIST?: string

	API_HTTP_HOST?: string
	API_HTTP_PORT?: string
	API_HTTP_TRUST_PROXY?: string
	API_HTTP_SERVER_KEEP_ALIVE?: string
	API_HTTP_SERVER_KEEP_ALIVE_TIMEOUT?: string
	API_HTTP_SERVER_KEEP_MAX_HEADER_SIZE?: string
	API_HTTP_SERVER_TCP_NODELAY?: string
	API_HTTP_REQ_SOFT_TIMEOUT?: string
	API_HTTP_REQ_SOFT_TIMEOUT_INTERVAL?: string
	API_HTTP_REQ_HARD_TIMEOUT?: string
	API_HTTP_REQ_HARD_TIMEOUT_INTERVAL?: string
	API_HTTP_REQ_BODY_SIZE_LIMIT?: string
	API_HTTP_DEBUG_ERRORS?: string
	API_HTTP_LOG_REQ_HEADERS?: string
	API_HTTP_LOG_RES_HEADERS?: string
	API_HTTP_COMPRESSION?: string
	API_HTTP_EXTRA_LATENCY_BASE?: string
	API_HTTP_EXTRA_LATENCY_JITTER?: string
	API_HTTP_EXTRA_RANDOM_ERROR_LATENCY_BASE?: string
	API_HTTP_EXTRA_RANDOM_ERROR_LATENCY_JITTER?: string
	API_HTTP_EXTRA_RANDOM_ERROR_RATE?: string

	API_CLUSTER_STANDALONE?: string
	API_CLUSTER_MIN_WORKERS?: string
	API_CLUSTER_MAX_WORKERS?: string
	API_CLUSTER_ESTIMATED_MEMORY_PRIMARY?: string
	API_CLUSTER_ESTIMATED_MEMORY_WORKER?: string
	API_CLUSTER_ESTIMATED_MEMORY_MAX?: string
	API_CLUSTER_MEMORY_RESERVED?: string
	API_CLUSTER_ADD_WORKER_DEBOUNCE?: string

	API_PROMETHEUS_ENABLED?: string
	API_PROMETHEUS_HTTP_LOG_LEVEL?: string
	API_PROMETHEUS_HTTP_HOST?: string
	API_PROMETHEUS_HTTP_PORT?: string
	API_PROMETHEUS_HTTP_COMPRESSION?: string
}

type KeyOf<T, K extends keyof T> = K

export type ShutdownVariable = KeyOf<EnvironmentVariables,
	| 'SHUTDOWN_SIGNALS'
	| 'SHUTDOWN_SIGNAL_COUNT_ACCELERATED'
	| 'SHUTDOWN_SIGNAL_COUNT_IMMEDIATE'
>

export type StorageEnvironmentVariable = KeyOf<
	EnvironmentVariables,
	| 'STORAGE_DRIVER'
	| 'STORAGE_FILESYSTEM_ROOT_DIRPATH'
	| 'STORAGE_FILESYSTEM_TMP_DIRPATH'
	| 'STORAGE_S3_BUCKET_NAME'
	| 'STORAGE_S3_BUCKET_REGION'
	| 'STORAGE_S3_BUCKET_ROOT_PATH'
	| 'STORAGE_S3_REQUEST_HANDLER_CONNECTION_TIMEOUT'
	| 'STORAGE_S3_REQUEST_HANDLER_REQUEST_TIMEOUT'
	| 'STORAGE_S3_AGENT_KEEP_ALIVE'
	| 'STORAGE_S3_AGENT_KEEP_ALIVE_TIMEOUT'
	| 'STORAGE_S3_AGENT_MAX_SOCKETS'
	| 'STORAGE_S3_AGENT_TIMEOUT'
	| 'STORAGE_S3_AGENT_TCP_NODELAY'
>

export type ApiHttpEnvironmentVariable = KeyOf<
	EnvironmentVariables,
	| 'API_MAINTENANCE_MODE'
	| 'API_ORIGIN_WHITELIST'
	| 'API_HTTP_HOST'
	| 'API_HTTP_PORT'
	| 'API_HTTP_TRUST_PROXY'
	| 'API_HTTP_SERVER_KEEP_ALIVE'
	| 'API_HTTP_SERVER_KEEP_ALIVE_TIMEOUT'
	| 'API_HTTP_SERVER_KEEP_MAX_HEADER_SIZE'
	| 'API_HTTP_SERVER_TCP_NODELAY'
	| 'API_HTTP_REQ_SOFT_TIMEOUT'
	| 'API_HTTP_REQ_SOFT_TIMEOUT_INTERVAL'
	| 'API_HTTP_REQ_HARD_TIMEOUT'
	| 'API_HTTP_REQ_HARD_TIMEOUT_INTERVAL'
	| 'API_HTTP_REQ_BODY_SIZE_LIMIT'
	| 'API_HTTP_DEBUG_ERRORS'
	| 'API_HTTP_LOG_REQ_HEADERS'
	| 'API_HTTP_LOG_RES_HEADERS'
	| 'API_HTTP_COMPRESSION'
	| 'API_HTTP_EXTRA_LATENCY_BASE'
	| 'API_HTTP_EXTRA_LATENCY_JITTER'
	| 'API_HTTP_EXTRA_RANDOM_ERROR_LATENCY_BASE'
	| 'API_HTTP_EXTRA_RANDOM_ERROR_LATENCY_JITTER'
	| 'API_HTTP_EXTRA_RANDOM_ERROR_RATE'
>

export type ApiClusterEnvironmentVariable = KeyOf<
	EnvironmentVariables,
	| 'API_CLUSTER_STANDALONE'
	| 'API_CLUSTER_MIN_WORKERS'
	| 'API_CLUSTER_MAX_WORKERS'
	| 'API_CLUSTER_ESTIMATED_MEMORY_PRIMARY'
	| 'API_CLUSTER_ESTIMATED_MEMORY_WORKER'
	| 'API_CLUSTER_ESTIMATED_MEMORY_MAX'
	| 'API_CLUSTER_MEMORY_RESERVED'
	| 'API_CLUSTER_ADD_WORKER_DEBOUNCE'
>

export type ApiPrometheusEnvironmentVariable = KeyOf<
	EnvironmentVariables,
	| 'API_PROMETHEUS_ENABLED'
	| 'API_PROMETHEUS_HTTP_LOG_LEVEL'
	| 'API_PROMETHEUS_HTTP_HOST'
	| 'API_PROMETHEUS_HTTP_PORT'
	| 'API_PROMETHEUS_HTTP_COMPRESSION'
>

export const StorageDriver = {
	FS: 'FS',
	S3: 'S3',
} as const
export type StorageDriver = typeof StorageDriver[keyof typeof StorageDriver]

export type StorageFsConfig = {
	driver: typeof StorageDriver.FS,
	rootDir: string,
	tmpDir: string
}

export type StorageS3Config = {
	driver: typeof StorageDriver.S3,
	bucket: string,
	region?: undefined | string,
	rootPath: string,
	reqConnectionTimeoutMs: number,
	reqRequestTimeoutMs: number,
	agentKeepAlive: boolean,
	agentKeepAliveMs: number,
	agentMaxSockets: undefined | number,
	agentTimeoutMs: number,
	agentTcpNodelay: boolean,
}

export type StorageConfig = StorageFsConfig | StorageS3Config

export type ApiHttpConfig = {
	maintenanceMode: boolean,
	originWhitelist: undefined | RegExp[],
	host: string,
	port: number,
	trustProxy: undefined | boolean | number | string | string[],
	serverKeepAlive: boolean
	serverKeepAliveTimeoutMs: number
	serverKeepMaxHeaderSizeBytes: number
	serverTcpNodelay: boolean,
	reqSoftTimeoutMs: number
	reqSoftTimeoutIntervalMs: number
	reqHardTimeoutMs: number
	reqHardTimeoutIntervalMs: number
	reqBodySizeLimitBytes: number
	debugErrors: boolean
	logReqHeaders: boolean
	logResHeaders: boolean
	compression: boolean
	extraLatencyBaseMs: number
	extraLatencyJitterMs: number
	extraRandomErrorLatencyBaseMs: number
	extraRandomErrorLatencyJitterMs: number
	extraRandomErrorRate: number
}

export function getShutdownConfig(env: Pick<EnvironmentVariables, ShutdownVariable>): ShutdownConfig {
	const {
		SHUTDOWN_SIGNALS,
		SHUTDOWN_SIGNAL_COUNT_ACCELERATED,
		SHUTDOWN_SIGNAL_COUNT_IMMEDIATE,
	} = env

	let shutdownSignals: string[]
	const shutdownSignalsLc = SHUTDOWN_SIGNALS?.toLowerCase()
	if (shutdownSignalsLc === 'none') {
		shutdownSignals = []
	} else if (shutdownSignalsLc) {
		shutdownSignals = shutdownSignalsLc.split(',').map((signal) => signal.toUpperCase())
	} else {
		// Defaults
		shutdownSignals = ['SIGTERM', 'SIGINT']
	}

	for (let i = 0, len = shutdownSignals.length; i < len; i++) {
		switch (shutdownSignals[i]) {
			// Valid signals
			case 'SIGTERM':
			case 'SIGINT':
			case 'SIGHUP':
				break;
			default:
				throw new Error(`Invalid shutdown signal: ${shutdownSignals[i]}`)
		}
	}

	let acceleratedShutdownSignalCount: number = 5
	if (SHUTDOWN_SIGNAL_COUNT_ACCELERATED) {
		const _acceleratedShutdownSignalCount = intOpt(SHUTDOWN_SIGNAL_COUNT_ACCELERATED)
		if (_acceleratedShutdownSignalCount === undefined || _acceleratedShutdownSignalCount < 0) {
			throw new Error(`Invalid environment variable SHUTDOWN_SIGNAL_COUNT_ACCELERATED: ${SHUTDOWN_SIGNAL_COUNT_ACCELERATED}`)
		}
		acceleratedShutdownSignalCount = _acceleratedShutdownSignalCount
	}

	let immediateShutdownSignalCount: number = 10
	if (SHUTDOWN_SIGNAL_COUNT_IMMEDIATE) {
		const _immediateShutdownSignalCount = intOpt(SHUTDOWN_SIGNAL_COUNT_IMMEDIATE)
		if (_immediateShutdownSignalCount === undefined || _immediateShutdownSignalCount < 0) {
			throw new Error(`Invalid environment variable SHUTDOWN_SIGNAL_COUNT_IMMEDIATE: ${SHUTDOWN_SIGNAL_COUNT_IMMEDIATE}`)
		}
		immediateShutdownSignalCount = _immediateShutdownSignalCount
	}

	const opts: ShutdownConfig = {
		shutdownSignals: shutdownSignals as NodeJS.Signals[],
		acceleratedShutdownSignalCount,
		immediateShutdownSignalCount,
	}

	return opts
}

export function getStorageConfig(
	env: Pick<EnvironmentVariables, StorageEnvironmentVariable>
): StorageConfig {
	const {
		STORAGE_DRIVER,
		STORAGE_FILESYSTEM_ROOT_DIRPATH,
		STORAGE_FILESYSTEM_TMP_DIRPATH,
		STORAGE_S3_BUCKET_NAME,
		STORAGE_S3_BUCKET_REGION,
		STORAGE_S3_BUCKET_ROOT_PATH,
		STORAGE_S3_REQUEST_HANDLER_CONNECTION_TIMEOUT,
		STORAGE_S3_REQUEST_HANDLER_REQUEST_TIMEOUT,
		STORAGE_S3_AGENT_KEEP_ALIVE,
		STORAGE_S3_AGENT_KEEP_ALIVE_TIMEOUT,
		STORAGE_S3_AGENT_MAX_SOCKETS,
		STORAGE_S3_AGENT_TIMEOUT,
		STORAGE_S3_AGENT_TCP_NODELAY,
	} = env

	if (!STORAGE_DRIVER) {
		throw new Error('Missing environment variable STORAGE_DRIVER')
	}

	switch (STORAGE_DRIVER.trim().toLowerCase()) {
		case 'fs':
			return {
				driver: StorageDriver.FS,
				rootDir: STORAGE_FILESYSTEM_ROOT_DIRPATH || 'storage',
				tmpDir: STORAGE_FILESYSTEM_TMP_DIRPATH || tmpdir(),
			}
		case 's3':
			if (!STORAGE_S3_BUCKET_NAME) {
				throw new Error('Missing environment variable STORAGE_S3_BUCKET_NAME')
			}
			const reqConnectionTimeoutMs = msOpt(STORAGE_S3_REQUEST_HANDLER_CONNECTION_TIMEOUT || '5s')
			if (reqConnectionTimeoutMs === undefined) {
				throw new Error(`Invalid environment variable STORAGE_S3_REQUEST_HANDLER_CONNECTION_TIMEOUT: ${STORAGE_S3_REQUEST_HANDLER_CONNECTION_TIMEOUT}`)
			}
			const reqRequestTimeoutMs = msOpt(STORAGE_S3_REQUEST_HANDLER_REQUEST_TIMEOUT || '5s')
			if (reqRequestTimeoutMs === undefined) {
				throw new Error(`Invalid environment variable STORAGE_S3_REQUEST_HANDLER_REQUEST_TIMEOUT: ${STORAGE_S3_REQUEST_HANDLER_REQUEST_TIMEOUT}`)
			}
			const agentKeepAlive = boolOpt(STORAGE_S3_AGENT_KEEP_ALIVE || 'true')
			if (agentKeepAlive === undefined) {
				throw new Error(`Invalid environment variable STORAGE_S3_AGENT_KEEP_ALIVE: ${STORAGE_S3_AGENT_KEEP_ALIVE}`)
			}
			const agentKeepAliveMs = msOpt(STORAGE_S3_AGENT_KEEP_ALIVE_TIMEOUT || '10s')
			if (agentKeepAliveMs === undefined) {
				throw new Error(`Invalid environment variable STORAGE_S3_AGENT_KEEP_ALIVE_TIMEOUT: ${STORAGE_S3_AGENT_KEEP_ALIVE_TIMEOUT}`)
			}
			let agentMaxSockets: undefined | number
			if (STORAGE_S3_AGENT_MAX_SOCKETS) {
				agentMaxSockets = intOpt(STORAGE_S3_AGENT_MAX_SOCKETS)
				if (agentMaxSockets === undefined) {
					throw new Error(`Invalid environment variable STORAGE_S3_AGENT_MAX_SOCKETS: ${STORAGE_S3_AGENT_MAX_SOCKETS}`)
				}
			}
			const agentTimeoutMs = msOpt(STORAGE_S3_AGENT_TIMEOUT || '2m')
			if (agentTimeoutMs === undefined) {
				throw new Error(`Invalid environment variable STORAGE_S3_AGENT_TIMEOUT: ${STORAGE_S3_AGENT_TIMEOUT}`)
			}
			const agentTcpNodelay = boolOpt(STORAGE_S3_AGENT_TCP_NODELAY || 'false')
			if (agentTcpNodelay === undefined) {
				throw new Error(`Invalid environment variable STORAGE_S3_AGENT_TCP_NODELAY: ${STORAGE_S3_AGENT_TCP_NODELAY}`)
			}

			return {
				driver: StorageDriver.S3,
				bucket: STORAGE_S3_BUCKET_NAME,
				region: STORAGE_S3_BUCKET_REGION,
				rootPath: STORAGE_S3_BUCKET_ROOT_PATH ?? '',
				reqConnectionTimeoutMs,
				reqRequestTimeoutMs,
				agentKeepAlive,
				agentKeepAliveMs,
				agentMaxSockets,
				agentTimeoutMs,
				agentTcpNodelay,
			}
		default:
			throw new Error(`Invalid environment variable STORAGE_DRIVER: ${STORAGE_DRIVER}`)
	}
}

export function getApiHttpConfig(
	env: Pick<EnvironmentVariables, ApiHttpEnvironmentVariable>,
): ApiHttpConfig {
	const {
		API_MAINTENANCE_MODE,
		API_ORIGIN_WHITELIST,
		API_HTTP_HOST,
		API_HTTP_PORT,
		API_HTTP_TRUST_PROXY,
		API_HTTP_SERVER_KEEP_ALIVE,
		API_HTTP_SERVER_KEEP_ALIVE_TIMEOUT,
		API_HTTP_SERVER_KEEP_MAX_HEADER_SIZE,
		API_HTTP_SERVER_TCP_NODELAY,
		API_HTTP_REQ_SOFT_TIMEOUT,
		API_HTTP_REQ_SOFT_TIMEOUT_INTERVAL,
		API_HTTP_REQ_HARD_TIMEOUT,
		API_HTTP_REQ_HARD_TIMEOUT_INTERVAL,
		API_HTTP_REQ_BODY_SIZE_LIMIT,
		API_HTTP_DEBUG_ERRORS,
		API_HTTP_LOG_REQ_HEADERS,
		API_HTTP_LOG_RES_HEADERS,
		API_HTTP_COMPRESSION,
		API_HTTP_EXTRA_LATENCY_BASE,
		API_HTTP_EXTRA_LATENCY_JITTER,
		API_HTTP_EXTRA_RANDOM_ERROR_LATENCY_BASE,
		API_HTTP_EXTRA_RANDOM_ERROR_LATENCY_JITTER,
		API_HTTP_EXTRA_RANDOM_ERROR_RATE,
	} = env

	const maintenanceMode = boolOpt(API_MAINTENANCE_MODE || 'false')
	if (maintenanceMode === undefined) {
		throw new Error(`Invalid environment variable API_MAINTENANCE_MODE: ${API_MAINTENANCE_MODE}`)
	}

	let originWhitelist: undefined | RegExp[]
	if (API_ORIGIN_WHITELIST) {
		try {
			originWhitelist = (JSON.parse(API_ORIGIN_WHITELIST) as string[]).map((origin) => new RegExp(origin))
		} catch (err) {
			throw new Error(`Invalid environment variable API_ORIGIN_WHITELIST: ${JSON.stringify(API_ORIGIN_WHITELIST)}`)
		}
	}

	const host = API_HTTP_HOST || '127.0.0.1'

	const port = intOpt(API_HTTP_PORT || '8080')
	if (port === undefined || port < 1 || port > 65_535) {
		throw new Error(`Invalid environment variable API_HTTP_PORT: ${API_HTTP_PORT}`)
	}

	let trustProxy: undefined | boolean | number | string | string[]
	if (API_HTTP_TRUST_PROXY) {
		try {
			trustProxy = JSON.parse(API_HTTP_TRUST_PROXY)
			let ok = false
			switch (typeof trustProxy) {
				case 'boolean':
					ok = true;
					break;
				case 'string':
					trustProxy = boolOpt(trustProxy) ?? intOpt(trustProxy) ?? trustProxy
					ok = true;
					break;
				case 'number':
					ok = true;
					break;
				case 'object': {
					if (
						Array.isArray(trustProxy)
						&& trustProxy.every((ip) => typeof ip === 'string')
					) {
						ok = true
						break
					}
				}
			}
			if (!ok) throw new Error('Fail')
		} catch (err) {
			throw new Error('Invalid environment variable API_HTTP_TRUST_PROXY')
		}
	}

	const serverKeepAlive = boolOpt(API_HTTP_SERVER_KEEP_ALIVE || 'true')
	if (serverKeepAlive === undefined) {
		throw new Error(`Invalid environment variable API_HTTP_SERVER_KEEP_ALIVE: ${API_HTTP_SERVER_KEEP_ALIVE}`)
	}

	const serverKeepAliveTimeoutMs = msOpt(API_HTTP_SERVER_KEEP_ALIVE_TIMEOUT || '5s')
	if (serverKeepAliveTimeoutMs === undefined || !Number.isSafeInteger(serverKeepAliveTimeoutMs) || serverKeepAliveTimeoutMs < 0) {
		throw new Error(`Invalid environment variable API_HTTP_SERVER_KEEP_ALIVE_TIMEOUT: ${API_HTTP_SERVER_KEEP_ALIVE_TIMEOUT}`)
	}

	const serverKeepMaxHeaderSizeBytes = bytesOpt(API_HTTP_SERVER_KEEP_MAX_HEADER_SIZE || '4kib')
	if (serverKeepMaxHeaderSizeBytes === undefined || serverKeepMaxHeaderSizeBytes < 0) {
		throw new Error(`Invalid environment variable API_HTTP_SERVER_KEEP_MAX_HEADER_SIZE: ${API_HTTP_SERVER_KEEP_MAX_HEADER_SIZE}`)
	}

	const serverTcpNodelay = boolOpt(API_HTTP_SERVER_TCP_NODELAY || 'true')
	if (serverTcpNodelay === undefined) {
		throw new Error(`Invalid environment variable API_HTTP_SERVER_TCP_NODELAY: ${API_HTTP_SERVER_TCP_NODELAY}`)
	}

	const reqSoftTimeoutMs = msOpt(API_HTTP_REQ_SOFT_TIMEOUT || '15s')
	if (reqSoftTimeoutMs === undefined || !Number.isSafeInteger(reqSoftTimeoutMs) || reqSoftTimeoutMs < 0) {
		throw new Error(`Invalid environment variable API_HTTP_REQ_SOFT_TIMEOUT: ${API_HTTP_REQ_SOFT_TIMEOUT}`)
	}

	const reqSoftTimeoutIntervalMs = msOpt(API_HTTP_REQ_SOFT_TIMEOUT_INTERVAL || '30s')
	if (reqSoftTimeoutIntervalMs === undefined || !Number.isSafeInteger(reqSoftTimeoutIntervalMs) || reqSoftTimeoutIntervalMs < 0) {
		throw new Error(`Invalid environment variable API_HTTP_REQ_SOFT_TIMEOUT_INTERVAL: ${API_HTTP_REQ_SOFT_TIMEOUT_INTERVAL}`)
	}

	const reqHardTimeoutMs = msOpt(API_HTTP_REQ_HARD_TIMEOUT || '30s')
	if (reqHardTimeoutMs === undefined || !Number.isSafeInteger(reqHardTimeoutMs) || reqHardTimeoutMs < 0) {
		throw new Error(`Invalid environment variable API_HTTP_REQ_HARD_TIMEOUT: ${API_HTTP_REQ_HARD_TIMEOUT}`)
	}

	const reqHardTimeoutIntervalMs = msOpt(API_HTTP_REQ_HARD_TIMEOUT_INTERVAL || '5s')
	if (reqHardTimeoutIntervalMs === undefined || !Number.isSafeInteger(reqHardTimeoutIntervalMs) || reqHardTimeoutIntervalMs < 0) {
		throw new Error(`Invalid environment variable API_HTTP_REQ_HARD_TIMEOUT_INTERVAL: ${API_HTTP_REQ_HARD_TIMEOUT_INTERVAL}`)
	}

	const reqBodySizeLimitBytes = bytesOpt(API_HTTP_REQ_BODY_SIZE_LIMIT || '100kib')
	if (reqBodySizeLimitBytes === undefined || reqBodySizeLimitBytes < 0) {
		throw new Error(`Invalid environment variable API_HTTP_REQ_BODY_SIZE_LIMIT: ${API_HTTP_REQ_BODY_SIZE_LIMIT}`)
	}

	const debugErrors = boolOpt(API_HTTP_DEBUG_ERRORS || 'false')
	if (debugErrors == null) {
		throw new Error(`Invalid environment variable API_HTTP_DEBUG_ERRORS: ${API_HTTP_DEBUG_ERRORS}`)
	}

	const logReqHeaders = boolOpt(API_HTTP_LOG_REQ_HEADERS || 'false')
	if (logReqHeaders == null) {
		throw new Error(`Invalid environment variable API_HTTP_LOG_REQ_HEADERS: ${API_HTTP_LOG_REQ_HEADERS}`)
	}

	const logResHeaders = boolOpt(API_HTTP_LOG_RES_HEADERS || 'false')
	if (logResHeaders == null) {
		throw new Error(`Invalid environment variable API_HTTP_LOG_RES_HEADERS: ${API_HTTP_LOG_RES_HEADERS}`)
	}

	const compression = boolOpt(API_HTTP_COMPRESSION || 'true')
	if (compression == null) {
		throw new Error(`Invalid environment variable API_HTTP_COMPRESSION: ${API_HTTP_COMPRESSION}`)
	}

	const extraLatencyBaseMs = msOpt(API_HTTP_EXTRA_LATENCY_BASE || '0ms')
	if (extraLatencyBaseMs === undefined || !Number.isSafeInteger(extraLatencyBaseMs) || extraLatencyBaseMs < 0) {
		throw new Error(`Invalid environment variable API_HTTP_EXTRA_LATENCY_BASE: ${API_HTTP_EXTRA_LATENCY_BASE}`)
	}

	const extraLatencyJitterMs = msOpt(API_HTTP_EXTRA_LATENCY_JITTER || '0ms')
	if (extraLatencyJitterMs === undefined || !Number.isSafeInteger(extraLatencyJitterMs) || extraLatencyJitterMs < 0) {
		throw new Error(`Invalid environment variable API_HTTP_EXTRA_LATENCY_JITTER: ${API_HTTP_EXTRA_LATENCY_JITTER}`)
	}

	const extraRandomErrorLatencyBaseMs = msOpt(API_HTTP_EXTRA_RANDOM_ERROR_LATENCY_BASE || '0ms')
	if (extraRandomErrorLatencyBaseMs === undefined || !Number.isSafeInteger(extraRandomErrorLatencyBaseMs) || extraRandomErrorLatencyBaseMs < 0) {
		throw new Error(`Invalid environment variable API_HTTP_EXTRA_RANDOM_ERROR_LATENCY_BASE: ${API_HTTP_EXTRA_RANDOM_ERROR_LATENCY_BASE}`)
	}

	const extraRandomErrorLatencyJitterMs = msOpt(API_HTTP_EXTRA_RANDOM_ERROR_LATENCY_JITTER || '0ms')
	if (extraRandomErrorLatencyJitterMs === undefined || !Number.isSafeInteger(extraRandomErrorLatencyJitterMs) || extraRandomErrorLatencyJitterMs < 0) {
		throw new Error(`Invalid environment variable API_HTTP_EXTRA_RANDOM_ERROR_LATENCY_JITTER: ${API_HTTP_EXTRA_RANDOM_ERROR_LATENCY_JITTER}`)
	}

	const extraRandomErrorRate = rateOpt(API_HTTP_EXTRA_RANDOM_ERROR_RATE || '0')
	if (extraRandomErrorRate === undefined) {
		throw new Error(`Invalid environment variable API_HTTP_EXTRA_RANDOM_ERROR_RATE: ${API_HTTP_EXTRA_RANDOM_ERROR_RATE}`)
	}

	const config: ApiHttpConfig = {
		maintenanceMode,
		originWhitelist,
		host,
		port,
		trustProxy,
		serverKeepAlive,
		serverKeepAliveTimeoutMs,
		serverKeepMaxHeaderSizeBytes,
		serverTcpNodelay,
		reqSoftTimeoutMs,
		reqSoftTimeoutIntervalMs,
		reqHardTimeoutMs,
		reqHardTimeoutIntervalMs,
		reqBodySizeLimitBytes,
		debugErrors,
		logReqHeaders,
		logResHeaders,
		compression,
		extraLatencyBaseMs,
		extraLatencyJitterMs,
		extraRandomErrorLatencyBaseMs,
		extraRandomErrorLatencyJitterMs,
		extraRandomErrorRate,
	}

	return config
}

export function getApiClusterConfig(
	env: Pick<EnvironmentVariables, ApiClusterEnvironmentVariable>,
	force?: undefined | { standalone?: undefined | boolean, }
): ClusterConfig {
	const {
		API_CLUSTER_STANDALONE,
		API_CLUSTER_MIN_WORKERS,
		API_CLUSTER_MAX_WORKERS,
		API_CLUSTER_ESTIMATED_MEMORY_PRIMARY,
		API_CLUSTER_ESTIMATED_MEMORY_WORKER,
		API_CLUSTER_ESTIMATED_MEMORY_MAX,
		API_CLUSTER_MEMORY_RESERVED,
		API_CLUSTER_ADD_WORKER_DEBOUNCE,
	} = env

	const standalone = boolOpt(force?.standalone ?? (API_CLUSTER_STANDALONE || 'false'))
	if (standalone === undefined) {
		throw new Error(`Invalid environment variable API_CLUSTER_STANDALONE: ${API_CLUSTER_STANDALONE}`)
	}

	let minWorkers: undefined | number
	minWorkers = intOpt(API_CLUSTER_MIN_WORKERS || '1')
	if (minWorkers === undefined || minWorkers < 0) {
		throw new Error(`Invalid environment variable API_CLUSTER_MIN_WORKERS: ${API_CLUSTER_MIN_WORKERS}`)
	}

	let maxWorkers: undefined | number
	maxWorkers = intOpt(API_CLUSTER_MAX_WORKERS || Math.min(4, cpus().length))
	if (maxWorkers === undefined || maxWorkers < 0) {
		throw new Error(`Invalid environment variable API_CLUSTER_MAX_WORKERS: ${API_CLUSTER_MAX_WORKERS}`)
	}

	let estimatedMemoryPrimaryBytes: undefined | number
	estimatedMemoryPrimaryBytes = bytesOpt(API_CLUSTER_ESTIMATED_MEMORY_PRIMARY || '100mib')
	if (estimatedMemoryPrimaryBytes === undefined || estimatedMemoryPrimaryBytes < 0) {
		throw new Error(`Invalid environment variable API_CLUSTER_ESTIMATED_MEMORY_PRIMARY: ${API_CLUSTER_ESTIMATED_MEMORY_PRIMARY}`)
	}

	let estimatedMemoryWorkerBytes: undefined | number
	estimatedMemoryWorkerBytes = bytesOpt(API_CLUSTER_ESTIMATED_MEMORY_WORKER || '200mib')
	if (estimatedMemoryWorkerBytes === undefined || estimatedMemoryWorkerBytes < 0) {
		throw new Error(`Invalid environment variable API_CLUSTER_ESTIMATED_MEMORY_WORKER: ${API_CLUSTER_ESTIMATED_MEMORY_WORKER}`)
	}

	let estimatedMemoryMaxBytes: undefined | number
	estimatedMemoryMaxBytes = bytesOpt(API_CLUSTER_ESTIMATED_MEMORY_MAX || totalmem())
	if (estimatedMemoryMaxBytes === undefined || estimatedMemoryMaxBytes < 0) {
		throw new Error(`Invalid environment variable API_CLUSTER_ESTIMATED_MEMORY_MAX: ${API_CLUSTER_ESTIMATED_MEMORY_MAX}`)
	}

	let memoryReservedBytes: undefined | number
	memoryReservedBytes = bytesOpt(API_CLUSTER_MEMORY_RESERVED || '200kib')
	if (memoryReservedBytes === undefined) {
		throw new Error(`Invalid environment variable API_CLUSTER_MEMORY_RESERVED: ${API_CLUSTER_MEMORY_RESERVED}`)
	}

	let addWorkerDebounceMs: undefined | number
	addWorkerDebounceMs = msOpt(API_CLUSTER_ADD_WORKER_DEBOUNCE || '200ms')
	if (addWorkerDebounceMs === undefined || addWorkerDebounceMs < 0) {
		throw new Error(`Invalid environment variable API_CLUSTER_ADD_WORKER_DEBOUNCE: ${API_CLUSTER_ADD_WORKER_DEBOUNCE}`)
	}

	const config: ClusterConfig = {
		standalone,
		minWorkers,
		maxWorkers,
		estimatedMemoryPrimaryBytes,
		estimatedMemoryWorkerBytes,
		estimatedMemoryMaxBytes,
		memoryReservedBytes,
		addWorkerDebounceMs,
	}

	return config
}

export function getApiPrometheusConfig(
	env: Pick<EnvironmentVariables, ApiPrometheusEnvironmentVariable>,
): PrometheusConfig {
	const {
		API_PROMETHEUS_ENABLED,
		API_PROMETHEUS_HTTP_LOG_LEVEL,
		API_PROMETHEUS_HTTP_HOST,
		API_PROMETHEUS_HTTP_PORT,
		API_PROMETHEUS_HTTP_COMPRESSION,
	} = env

	const enabled = boolOpt(API_PROMETHEUS_ENABLED || 'false')
	if (enabled === undefined) {
		throw new Error(`Invalid environment variable API_PROMETHEUS_ENABLED: ${API_PROMETHEUS_ENABLED}`)
	}

	const logLevel = API_PROMETHEUS_HTTP_LOG_LEVEL || 'warn'

	const host = API_PROMETHEUS_HTTP_HOST || '127.0.0.1'

	const port = intOpt(API_PROMETHEUS_HTTP_PORT || '9110')
	if (port === undefined || port < 1 || port > 65_535) {
		throw new Error(`Invalid environment variable API_PROMETHEUS_HTTP_PORT: ${API_PROMETHEUS_HTTP_PORT}`)
	}

	const compression = boolOpt(API_PROMETHEUS_HTTP_COMPRESSION || 'true')
	if (compression === undefined) {
		throw new Error(`Invalid environment variable API_PROMETHEUS_HTTP_COMPRESSION: ${API_PROMETHEUS_HTTP_COMPRESSION}`)
	}

	const config: PrometheusConfig = {
		enabled,
		logLevel,
		host,
		port,
		compression,
	}

	return config
}

export function printStorageConfig(prefix: string, logger: Logger, storageConfig: undefined | StorageConfig): void {
	logger.info(`${prefix}Storage settings:`)
	if (storageConfig) {
		switch (storageConfig.driver) {
			case StorageDriver.FS:
				logger.info(`${prefix}  driver:             ${storageConfig.driver}`)
				logger.info(`${prefix}  root dir:           ${storageConfig.rootDir}`)
				logger.info(`${prefix}  tmp dir:            ${storageConfig.tmpDir}`)
				break
			case StorageDriver.S3:
				logger.info(`${prefix}  driver:                 ${storageConfig.driver}`)
				logger.info(`${prefix}  bucket:                 ${storageConfig.bucket}`)
				logger.info(`${prefix}  region:                 ${storageConfig.region}`)
				logger.info(`${prefix}  rootPath:               ${storageConfig.rootPath}`)
				logger.info(`${prefix}  reqConnectionTimeout:   ${fmtDurationPrecise(storageConfig.reqConnectionTimeoutMs)}`)
				logger.info(`${prefix}  reqRequestTimeout:      ${fmtDurationPrecise(storageConfig.reqRequestTimeoutMs)}`)
				logger.info(`${prefix}  agentKeepAlive:         ${storageConfig.agentKeepAlive}`)
				logger.info(`${prefix}  agentKeepAlive:         ${fmtDurationPrecise(storageConfig.agentKeepAliveMs)}`)
				logger.info(`${prefix}  agentMaxSockets:        ${storageConfig.agentMaxSockets?.toLocaleString()}`)
				logger.info(`${prefix}  agentTimeout:           ${fmtDurationPrecise(storageConfig.agentTimeoutMs)}`)
				logger.info(`${prefix}  agentTcpNodelay:        ${storageConfig.agentTcpNodelay}`)
				break
			default:
				throw new Error(`${prefix}Unhandled driver: ${(storageConfig as StorageConfig).driver}`)
		}
	} else {
		logger.info(`${prefix}  disabled`)
	}
}

export function printApiHttpConfig(prefix: string, logger: Logger, apiHttpConfig: undefined | ApiHttpConfig): void {
	logger.info(`${prefix}API HTTP settings:`)
	if (apiHttpConfig) {
		logger.info(`${prefix}  originWhitelist:                ${apiHttpConfig.originWhitelist?.map((re) => re.source).join(', ')}`)
		logger.info(`${prefix}  host:                           ${apiHttpConfig.host}`)
		logger.info(`${prefix}  port:                           ${apiHttpConfig.port.toLocaleString()}`)
		logger.info(`${prefix}  trustProxy:                     ${JSON.stringify(apiHttpConfig.trustProxy)}`)
		logger.info(`${prefix}  serverKeepAlive:                ${apiHttpConfig.serverKeepAlive}`)
		logger.info(`${prefix}  serverKeepAliveTimeout:         ${fmtDurationPrecise(apiHttpConfig.serverKeepAliveTimeoutMs)}`)
		logger.info(`${prefix}  serverKeepMaxHeaderSize:        ${fmtBytes(apiHttpConfig.serverKeepMaxHeaderSizeBytes)}`)
		logger.info(`${prefix}  serverTcpNodelay:               ${apiHttpConfig.serverTcpNodelay}`)
		logger.info(`${prefix}  reqSoftTimeout:                 ${fmtDurationPrecise(apiHttpConfig.reqSoftTimeoutMs)}`)
		logger.info(`${prefix}  reqSoftTimeoutInterval:         ${fmtDurationPrecise(apiHttpConfig.reqSoftTimeoutIntervalMs)}`)
		logger.info(`${prefix}  reqHardTimeout:                 ${fmtDurationPrecise(apiHttpConfig.reqHardTimeoutMs)}`)
		logger.info(`${prefix}  reqHardTimeoutInterval:         ${fmtDurationPrecise(apiHttpConfig.reqHardTimeoutIntervalMs)}`)
		logger.info(`${prefix}  reqBodySizeLimit:               ${fmtBytes(apiHttpConfig.reqBodySizeLimitBytes)}`)
		logger.info(`${prefix}  debugErrors:                    ${apiHttpConfig.debugErrors}`)
		logger.info(`${prefix}  logReqHeaders:                  ${apiHttpConfig.logReqHeaders}`)
		logger.info(`${prefix}  logResHeaders:                  ${apiHttpConfig.logResHeaders}`)
		logger.info(`${prefix}  compression:                    ${apiHttpConfig.compression}`)
		logger.info(`${prefix}  extraLatencyBase:               ${fmtDurationPrecise(apiHttpConfig.extraLatencyBaseMs)}`)
		logger.info(`${prefix}  extraLatencyJitter:             ${fmtDurationPrecise(apiHttpConfig.extraLatencyJitterMs)}`)
		logger.info(`${prefix}  extraRandomErrorLatencyBase:    ${fmtDurationPrecise(apiHttpConfig.extraRandomErrorLatencyBaseMs)}`)
		logger.info(`${prefix}  extraRandomErrorLatencyJitter:  ${fmtDurationPrecise(apiHttpConfig.extraRandomErrorLatencyJitterMs)}`)
		logger.info(`${prefix}  extraRandomErrorRate:           ${(apiHttpConfig.extraRandomErrorRate * 100).toFixed(2)}%`)
	} else {
		logger.info(`${prefix}  disabled`);
	}
}

export function printApiClusterConfig(prefix: string, logger: Logger, apiClusterConfig: undefined | ClusterConfig): void {
	logger.info(`${prefix}API cluster settings:`)
	if (apiClusterConfig) {
		logger.info(`${prefix}  standalone:                   ${apiClusterConfig.standalone}`)
		logger.info(`${prefix}  minWorkers:                   ${apiClusterConfig.minWorkers?.toLocaleString()}`)
		logger.info(`${prefix}  maxWorkers:                   ${apiClusterConfig.maxWorkers?.toLocaleString()}`)
		logger.info(`${prefix}  estimatedMemoryPrimary:       ${apiClusterConfig.estimatedMemoryPrimaryBytes === undefined
			? undefined
			: fmtBytes(apiClusterConfig.estimatedMemoryPrimaryBytes)}`)
		logger.info(`${prefix}  estimatedMemoryWorker:        ${apiClusterConfig.estimatedMemoryWorkerBytes === undefined
			? undefined
			: fmtBytes(apiClusterConfig.estimatedMemoryWorkerBytes)}`)
		logger.info(`${prefix}  estimatedMemoryMax:           ${apiClusterConfig.estimatedMemoryMaxBytes === undefined
			? undefined
			: fmtBytes(apiClusterConfig.estimatedMemoryMaxBytes)}`)
		logger.info(`${prefix}  memoryReserved:               ${fmtBytes(apiClusterConfig.memoryReservedBytes)}`)
		logger.info(`${prefix}  addWorkerDebounce:            ${apiClusterConfig.addWorkerDebounceMs === undefined
			? undefined
			: fmtDurationPrecise(apiClusterConfig.addWorkerDebounceMs)}`)
	} else {
		logger.info(`${prefix}  disabled`)
	}
}

export function printApiPrometheusConfig(prefix: string, logger: Logger, apiPrometheusConfig: undefined | PrometheusConfig): void {
	logger.info(`${prefix}Api Prometheus settings:`)
	if (apiPrometheusConfig) {
		logger.info(`${prefix}  enabled:      ${apiPrometheusConfig.enabled}`)
		if (apiPrometheusConfig.enabled) {
			logger.info(`${prefix}  logLevel:     ${apiPrometheusConfig.logLevel}`)
			logger.info(`${prefix}  host:         ${apiPrometheusConfig.host}`)
			logger.info(`${prefix}  port:         ${apiPrometheusConfig.port}`)
			logger.info(`${prefix}  compression:  ${apiPrometheusConfig.compression}`)
		}
	} else {
		logger.info(`${prefix}  disabled`)
	}
}
