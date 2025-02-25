import { Server } from 'node:http';
import type { Logger } from 'pino';

export const HttpStatus = {
	// 1xx
	Continue: 100,
	SwitchingProtocols: 101,
	Processing: 102,
	EarlyHints: 103,
	// 2xx
	OK: 200,
	Created: 201,
	Accepted: 202,
	NonAuthoritativeInformation: 203,
	NoContent: 204,
	ResetContent: 205,
	PartialContent: 206,
	MultiStatus: 207,
	AlreadyReported: 208,
	IMUsed: 226,
	// 3xx
	MultipleChoices: 300,
	MovedPermanently: 301,
	Found: 302,
	SeeOther: 303,
	NotModified: 304,
	UseProxy: 305,
	TemporaryRedirect: 307,
	PermanentRedirect: 308,
	// 4xx
	BadRequest: 400,
	Unauthorized: 401,
	Forbidden: 403,
	NotFound: 404,
	MethodNotAllowed: 405,
	NotAcceptable: 406,
	RequestTimeout: 408,
	Conflict: 409,
	Gone: 410,
	LengthRequired: 411,
	PreconditionFailed: 412,
	PayloadTooLarge: 413,
	URITooLong: 414,
	UnsupportedMediaType: 415,
	RangeNotSatisfiable: 416,
	ExpectationFailed: 417,
	ImATeapot: 418,
	UnprocessableEntity: 422,
	TooEarly: 425,
	UpgradeRequired: 426,
	PreconditionRequired: 428,
	TooManyRequests: 429,
	RequestHeaderFieldsTooLarge: 431,
	UnavailableForLegalReasons: 451,
	// 5xx
	InternalServerError: 500,
	NotImplemented: 501,
	BadGateway: 502,
	ServiceUnavailable: 503,
	GatewayTimeout: 504,
	HTTPVersionNotSupported: 505,
	VariantAlsoNegotiates: 506,
	InsufficientStorage: 507,
	LoopDetected: 508,
	NotExtended: 510,
} as const
export type HttpStatus = typeof HttpStatus[keyof typeof HttpStatus]

export function httpStatusMessage(status: number): string {
	let msg: string
	const _status = status as HttpStatus
	switch (_status) {
		// 1xx
		case HttpStatus.Continue: msg = 'Continue'; break
		case HttpStatus.SwitchingProtocols: msg = 'Switching Protocols'; break
		case HttpStatus.Processing: msg = 'Processing'; break
		case HttpStatus.EarlyHints: msg = 'Early Hints'; break
		// 2xx
		case HttpStatus.OK: msg = 'OK'; break
		case HttpStatus.Created: msg = 'Created'; break
		case HttpStatus.Accepted: msg = 'Accepted'; break
		case HttpStatus.NonAuthoritativeInformation: msg = 'Non-Authoritative Information'; break
		case HttpStatus.NoContent: msg = 'No Content'; break
		case HttpStatus.ResetContent: msg = 'Reset Content'; break
		case HttpStatus.PartialContent: msg = 'Partial Content'; break
		case HttpStatus.MultiStatus: msg = 'Multi-Status'; break
		case HttpStatus.AlreadyReported: msg = 'Already Reported'; break
		case HttpStatus.IMUsed: msg = 'IM Used'; break
		// 3xx
		case HttpStatus.MultipleChoices: msg = 'Multiple Choices'; break
		case HttpStatus.MovedPermanently: msg = 'Moved Permanently'; break
		case HttpStatus.Found: msg = 'Found'; break
		case HttpStatus.SeeOther: msg = 'See Other'; break
		case HttpStatus.NotModified: msg = 'Not Modified'; break
		case HttpStatus.UseProxy: msg = 'Use Proxy'; break
		case HttpStatus.TemporaryRedirect: msg = 'Temporary Redirect'; break
		case HttpStatus.PermanentRedirect: msg = 'Permanent Redirect'; break
		// 4xx
		case HttpStatus.BadRequest: msg = 'Bad Request'; break
		case HttpStatus.Unauthorized: msg = 'Unauthorized'; break
		case HttpStatus.Forbidden: msg = 'Forbidden'; break
		case HttpStatus.NotFound: msg = 'Not Found'; break
		case HttpStatus.MethodNotAllowed: msg = 'Method Not Allowed'; break
		case HttpStatus.NotAcceptable: msg = 'Not Acceptable'; break
		case HttpStatus.RequestTimeout: msg = 'Request Timeout'; break
		case HttpStatus.Conflict: msg = 'Conflict'; break
		case HttpStatus.Gone: msg = 'Gone'; break
		case HttpStatus.LengthRequired: msg = 'Length Required'; break
		case HttpStatus.PreconditionFailed: msg = 'Precondition Failed'; break
		case HttpStatus.PayloadTooLarge: msg = 'Payload Too Large'; break
		case HttpStatus.URITooLong: msg = 'URI Too Long'; break
		case HttpStatus.UnsupportedMediaType: msg = 'Unsupported Media Type'; break
		case HttpStatus.RangeNotSatisfiable: msg = 'Range Not Satisfiable'; break
		case HttpStatus.ExpectationFailed: msg = 'Expectation Failed'; break
		case HttpStatus.ImATeapot: msg = "I'm a teapot"; break
		case HttpStatus.UnprocessableEntity: msg = 'Unprocessable Entity'; break
		case HttpStatus.TooEarly: msg = 'Too Early'; break
		case HttpStatus.UpgradeRequired: msg = 'Upgrade Required'; break
		case HttpStatus.PreconditionRequired: msg = 'Precondition Required'; break
		case HttpStatus.TooManyRequests: msg = 'Too Many Requests'; break
		case HttpStatus.RequestHeaderFieldsTooLarge: msg = 'Request Header Fields Too Large'; break
		case HttpStatus.UnavailableForLegalReasons: msg = 'Unavailable For Legal Reasons'; break
		// 5xx
		case HttpStatus.InternalServerError: msg = 'Internal Server Error'; break
		case HttpStatus.NotImplemented: msg = 'Not Implemented'; break
		case HttpStatus.BadGateway: msg = 'Bad Gateway'; break
		case HttpStatus.ServiceUnavailable: msg = 'Service Unavailable'; break
		case HttpStatus.GatewayTimeout: msg = 'Gateway Timeout'; break
		case HttpStatus.HTTPVersionNotSupported: msg = 'HTTP Version Not Supported'; break
		case HttpStatus.VariantAlsoNegotiates: msg = 'Variant Also Negotiates'; break
		case HttpStatus.InsufficientStorage: msg = 'Insufficient Storage'; break
		case HttpStatus.LoopDetected: msg = 'Loop Detected'; break
		case HttpStatus.NotExtended: msg = 'Not Extended'; break
		default: {
			(_status satisfies never)
			msg = `Unknown HTTP status code: ${_status}`;
			break
		}
	}
	return msg
}

export class HttpError extends Error {
	override name = 'HttpError'

	status: number
	data?: undefined | Record<PropertyKey, unknown>
	headers?: undefined | [key: string, value: string][]

	constructor(
		status: number,
		// TODO: is this comment below still valid?
		// Don't set "message" or "status" as a non-string propery because it'll be overridden
		data?: string | Record<PropertyKey, unknown>,
		options?: {
			headers?: [key: string, value: string][],
			cause?: Error,
		}
	) {
		let _message: string
		let _data: undefined | Record<PropertyKey, unknown>
		switch (typeof data) {
			case 'string':
				_message = data
				_data = undefined
				break;
			case 'object':
				if (typeof data?.message === 'string') {
					_message = data.message
				}
				_data = data
				break;
			case 'undefined':
				_data = undefined
				break;
			default:
				// ???
				data satisfies never
				break;
		}
		_message ??= httpStatusMessage(status)
		super(_message, { cause: options?.cause, })
		this.status = status
		this.data = _data
		this.headers = options?.headers
	}
}


export type HttpServerControllerEvents = {
	beginGracefulShutdown: [],
	beginForcefulShutdown: [],
}

const HttpServerOptionsDefaults = {
	LISTENING_TIMEOUT: 5_000,
	SOFT_SHUTDOWN_TIMEOUT: 15_000,
	HARD_SHUTDOWN_TIMEOUT: 15_000,
} as const

export type RunHttpServerOptions = {
	logger: Logger,
	/** @default 5_000 */
	listeningTimeout?: number,
	/** @default 15_000 */
	softShutdownTimeout?: number,
	/** @default 15_000 */
	hardShutdownTimeout?: number,
	hostname: string,
	port: number,
	httpServer: Server,
	gracefulShutdownSignal: AbortSignal,
	acceleratedShutdownSignal: AbortSignal,
}

export async function runHttpServer(opts: RunHttpServerOptions): Promise<void> {
	const {
		logger,
		listeningTimeout = HttpServerOptionsDefaults.LISTENING_TIMEOUT,
		softShutdownTimeout = HttpServerOptionsDefaults.SOFT_SHUTDOWN_TIMEOUT,
		hardShutdownTimeout = HttpServerOptionsDefaults.HARD_SHUTDOWN_TIMEOUT,
		port,
		hostname,
		httpServer,
		gracefulShutdownSignal,
		acceleratedShutdownSignal,
	} = opts

	if (gracefulShutdownSignal.aborted || acceleratedShutdownSignal.aborted) {
		logger.warn('Skipping HTTP server start due to ongoing shutdown')
		return
	}

	// Start the HTTP server
	await new Promise<void>(function(res, rej) {
		function onTimeout() {
			logger.warn(`HTTP server timed out waiting to start`)
			cleanup()
			httpServer.close()
			httpServer.closeIdleConnections()
			httpServer.closeAllConnections()
			rej(new Error('HTTP server timed out waiting to start'))
		}
		function onListening() {
			logger.info({ hostname, port }, `HTTP server listening on ${hostname}:${port}`)
			cleanup()
			res()
		}
		function gracefulShutdown() {
			logger.warn('HTTP server beginning graceful shutdown before server is listening')
			cleanup()
			httpServer.close()
			httpServer.closeIdleConnections()
			httpServer.closeAllConnections()
			// The server will be immediately re-closed in the next new Promise scope
			// wherein we wait for the "close" event to be emitted with timeouts
			res()
		}
		function acceleratedShutdown() {
			logger.warn('HTTP server beginning accelerated shutdown before server is listening')
			cleanup()
			httpServer.close()
			httpServer.closeIdleConnections()
			httpServer.closeAllConnections()
			// The server will be immediately re-closed in the next new Promise scope
			// wherein we wait for the "close" event to be emitted with timeouts
			res()
		}
		function onError(err: Error) {
			logger.warn({ err }, `HTTP server error before server is listening: ${String(err)}`)
			cleanup()
			rej(err)
		}
		function cleanup() {
			clearTimeout(timeout)
			httpServer.off('listening', onListening)
			httpServer.off('error', onError)
			gracefulShutdownSignal.removeEventListener('abort', gracefulShutdown)
			acceleratedShutdownSignal.removeEventListener('abort', acceleratedShutdown)
		}
		const timeout = setTimeout(onTimeout, listeningTimeout)
		httpServer.on('listening', onListening)
		httpServer.on('error', onError)
		gracefulShutdownSignal.addEventListener('abort', gracefulShutdown)
		acceleratedShutdownSignal.addEventListener('abort', acceleratedShutdown)
		httpServer.listen(port, hostname)
	})

	// Promise that resolves (or rejects) when the HTTP server closes
	await new Promise<void>(function(res, rej) {
		let errRef: undefined | { err: Error }
		function gracefulShutdown() {
			logger.debug('HTTP server beginning graceful shutdown')
			httpServer.close()
			httpServer.closeIdleConnections()
			if (softTimeout == null) softTimeout = setTimeout(onSoftTimeout, softShutdownTimeout)
			if (hardTimeout == null) hardTimeout = setTimeout(onHardTimeout, hardShutdownTimeout)
		}
		function acceleratedShutdown() {
			logger.debug('HTTP server beginning accelerated shutdown')
			httpServer.close()
			httpServer.closeIdleConnections()
			httpServer.closeAllConnections()
			if (softTimeout == null) softTimeout = setTimeout(onSoftTimeout, softShutdownTimeout)
			if (hardTimeout == null) hardTimeout = setTimeout(onHardTimeout, hardShutdownTimeout)
		}
		function onError(err: Error) {
			logger.error({ err }, `HTTP Server error: ${String(err)}`)
			errRef = { err }
		}
		function onClose() {
			logger.info('HTTP server closed')
			cleanup()
			if (errRef) rej(errRef.err)
			else res()
		}
		function onSoftTimeout() {
			logger.warn('HTTP server soft timeout reached, closing connections')
			httpServer.closeIdleConnections()
			httpServer.closeAllConnections()
		}
		function onHardTimeout() {
			logger.warn('HTTP server hard timeout reached, closing server')
			cleanup()
			rej(new Error(`HTTP server timed out waiting for server to close`))
		}
		function cleanup() {
			clearTimeout(softTimeout)
			clearTimeout(hardTimeout)
			gracefulShutdownSignal.removeEventListener('abort', gracefulShutdown)
			acceleratedShutdownSignal.removeEventListener('abort', acceleratedShutdown)
			httpServer.off('close', onClose)
			httpServer.off('error', onError)
		}
		let softTimeout: undefined | ReturnType<typeof setTimeout>
		let hardTimeout: undefined | ReturnType<typeof setTimeout>
		gracefulShutdownSignal.addEventListener('abort', gracefulShutdown)
		acceleratedShutdownSignal.addEventListener('abort', acceleratedShutdown)
		httpServer.on('close', onClose)
		httpServer.on('error', onError)
		if (acceleratedShutdownSignal.aborted) acceleratedShutdown()
		else if (gracefulShutdownSignal.aborted) gracefulShutdown()
	})
}

