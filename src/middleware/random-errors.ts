import type { Handler } from 'express'
import { sleep } from '../utils/helpers.js'
import { HttpError, HttpStatus } from '../utils/http.js'

export function randomErrorsMiddleware(opts: {
	latencyBase: number,
	latencyJitter: number,
	errorRate: number,
}): Handler {
	const {
		latencyBase,
		latencyJitter,
		errorRate,
	} = opts

	const randomErrorStatuses = [
		// 4xx
		HttpStatus.Forbidden,
		HttpStatus.NotAcceptable,
		HttpStatus.RequestTimeout,
		HttpStatus.ImATeapot,
		HttpStatus.UnprocessableEntity,
		HttpStatus.TooManyRequests,
		HttpStatus.UnavailableForLegalReasons,

		// 5xx
		HttpStatus.InternalServerError,
		HttpStatus.NotImplemented,
		HttpStatus.BadGateway,
		HttpStatus.ServiceUnavailable,
		HttpStatus.GatewayTimeout,
		HttpStatus.HTTPVersionNotSupported,
		HttpStatus.VariantAlsoNegotiates,
		HttpStatus.InsufficientStorage,
		HttpStatus.LoopDetected,
		HttpStatus.NotExtended,
	]

	return async function(req, _res, next) {
		// Ignore the /health route (it's used by load balancers / reverse proxies to
		// determine whether the server is up)
		if (req.url === '/health') {
			next()
			return
		}
		// Escape hatch, developer really doesn't want injected errors
		if (Object.hasOwn(req.query, 'noInjectErrors')) {
			next()
			return
		}
		if (Math.random() > errorRate) {
			next()
		} else {
			const latency = Math.round(latencyBase + Math.random() * latencyJitter)
			try {
				req.ctx.logger.trace({ latency }, 'Simulating random error')
				await sleep(latency, req.ctx.signal)
				const code = randomErrorStatuses[Math.floor(Math.random() * randomErrorStatuses.length)]
				throw new HttpError(code, { isInjectedError: true, })
			} catch (err) {
				next(err)
			}
		}
	}
}
