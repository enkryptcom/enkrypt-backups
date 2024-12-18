import { Server } from 'node:http';
import EventEmitter from 'node:events';
import type { Context } from '../types.js';

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
	data?: Record<PropertyKey, unknown>
	headers?: [key: string, value: string][]

	constructor(
		status: number,
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

export type HttpServerOptions = {
	/** @default 5_000 */
	listeningTimeout?: number,
	/** @default 15_000 */
	softShutdownTimeout?: number,
	/** @default 15_000 */
	hardShutdownTimeout?: number,
	hostname: string,
	port: number,
	server: Server,
	controller?: EventEmitter<HttpServerControllerEvents>,
}

export async function runHttpServer(ctx: Context, options: HttpServerOptions): Promise<void> {
	const {
		listeningTimeout = HttpServerOptionsDefaults.LISTENING_TIMEOUT,
		softShutdownTimeout = HttpServerOptionsDefaults.SOFT_SHUTDOWN_TIMEOUT,
		hardShutdownTimeout = HttpServerOptionsDefaults.HARD_SHUTDOWN_TIMEOUT,
		port,
		hostname,
		server,
		controller,
	} = options

	let _stop: boolean = false
	function _onBeginGracefulShutdown() {
		_stop = true
	}
	function _onBeginForcefulShutdown() {
		_stop = true
	}

	controller?.on('beginGracefulShutdown', _onBeginGracefulShutdown)
	controller?.on('beginForcefulShutdown', _onBeginForcefulShutdown)
	try {
		// Start the HTTP server
		const cont = await new Promise<boolean>(function(res, rej) {
			function onTimeout() {
				ctx.logger.warn(`HTTP server timed out waiting to start`)
				cleanup()
				server.close()
				server.closeIdleConnections()
				server.closeAllConnections()
				rej(new Error('HTTP server timed out waiting to start'))
			}
			function onAbort() {
				ctx.logger.warn(`HTTP server closing due to execution context aborted`)
				cleanup()
				server.close()
				server.closeIdleConnections()
				server.closeAllConnections()
				rej(ctx.signal.reason)
			}
			function onListening() {
				ctx.logger.info({ hostname, port }, `HTTP server listening on ${hostname}:${port}`)
				cleanup()
				res(true)
			}
			function onBeginGracefulShutdown() {
				ctx.logger.warn('HTTP server beginning graceful shutdown before server is listening')
				cleanup()
				server.close()
				server.closeIdleConnections()
				server.closeAllConnections()
				res(false)
			}
			function onBeginForcefulShutdown() {
				ctx.logger.warn('HTTP server forcing shutdown before server is listening')
				cleanup()
				server.close()
				server.closeIdleConnections()
				server.closeAllConnections()
				res(false)
			}
			function onError(err: Error) {
				ctx.logger.warn({ err }, 'HTTP server error before server is listening')
				cleanup()
				rej(err)
			}
			function cleanup() {
				clearTimeout(timeout)
				ctx.signal.removeEventListener('abort', onAbort)
				server.off('listening', onListening)
				server.off('error', onError)
				controller?.off('beginGracefulShutdown', onBeginGracefulShutdown)
				controller?.off('beginForcefulShutdown', onBeginForcefulShutdown)
			}
			const timeout = setTimeout(onTimeout, listeningTimeout)
			ctx.signal.addEventListener('abort', onAbort)
			server.on('listening', onListening)
			server.on('error', onError)
			controller?.on('beginGracefulShutdown', onBeginGracefulShutdown)
			controller?.on('beginForcefulShutdown', onBeginForcefulShutdown)
			server.listen(port, hostname)
			if (ctx.signal.aborted) {
				onAbort()
			}
		})

		if (!cont || _stop) {
			return
		}

		// Wait for the HTTP server to stop
		await new Promise<void>(function(res, rej) {
			let errref: undefined | { err: Error }
			function onAbort() {
				ctx.logger.warn('HTTP server closing due to execution context aborted')
				cleanup()
				server.closeIdleConnections()
				server.closeAllConnections()
				rej(ctx.signal.reason)
			}
			function onBeginGracefulShutdown() {
				ctx.logger.warn('HTTP server beginning graceful shutdown')
				server.close()
				server.closeIdleConnections()
				softTimeout = setTimeout(onSoftTimeout, softShutdownTimeout)
				hardTimeout = setTimeout(onHardTimeout, hardShutdownTimeout)
			}
			function onBeginForcefulShutdown() {
				ctx.logger.warn('HTTP server forcing shutdown')
				cleanup()
				server.close()
				server.closeIdleConnections()
				server.closeAllConnections()
				errref = { err: new Error('Forced shutdown') }
			}
			function onError(err: Error) {
				ctx.logger.error({ err }, 'HTTP Server error')
				errref = { err }
			}
			function onClose() {
				ctx.logger.info('HTTP server closed')
				cleanup()
				if (errref) rej(errref.err)
				else res()
			}
			function onSoftTimeout() {
				ctx.logger.warn('HTTP server soft timeout reached, forcefully closing connections')
				server.closeIdleConnections()
				server.closeAllConnections()
			}
			function onHardTimeout() {
				ctx.logger.warn('HTTP server hard timeout reached, forcefully closing server')
				cleanup()
				rej(new Error(`HTTP server timed out waiting for server to close`))
			}
			function cleanup() {
				clearTimeout(softTimeout)
				clearTimeout(hardTimeout)
				ctx.signal.removeEventListener('abort', onAbort)
				controller?.off('beginGracefulShutdown', onBeginGracefulShutdown)
				controller?.off('beginForcefulShutdown', onBeginForcefulShutdown)
				server.off('close', onClose)
				server.off('error', onError)
			}
			let softTimeout: undefined | ReturnType<typeof setTimeout>
			let hardTimeout: undefined | ReturnType<typeof setTimeout>
			ctx.signal.addEventListener('abort', onAbort)
			controller?.on('beginGracefulShutdown', onBeginGracefulShutdown)
			controller?.on('beginForcefulShutdown', onBeginForcefulShutdown)
			server.on('close', onClose)
			server.on('error', onError)
		})
	} finally {
		controller?.off('beginGracefulShutdown', _onBeginGracefulShutdown)
		controller?.off('beginForcefulShutdown', _onBeginForcefulShutdown)
	}
}

