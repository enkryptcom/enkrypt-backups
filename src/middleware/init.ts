import type { Handler, Request, Response, } from "express";
import type { Disposer } from "../utils/disposer.js";
import type { Logger } from "pino";
import { fmtDurationPrecise } from "../utils/time.js";
import { randomUUID } from "node:crypto";
import type { Context } from "../types.js";
import { HttpError, HttpStatus } from "../utils/http.js";
import type { HttpMetrics } from "../utils/http-metrics.js";

export function initMiddleware(opts: {
	disposer: Disposer,
	metrics: undefined | HttpMetrics,
	logger: Logger,
	logReqHeaders: boolean,
	logResHeaders: boolean,
	reqSoftTimeoutMs: number,
	reqSoftTimeoutIntervalMs: number,
}): Handler {
	const {
		disposer,
		metrics,
		logger,
		logReqHeaders,
		logResHeaders,
		reqSoftTimeoutMs,
		reqSoftTimeoutIntervalMs,
	} = opts

	function onResClose(this: Response) {
		const now = Date.now()
		const duration = now - this.req.startedAt
		const routePath = typeof this.req.route?.path === 'string' ? this.req.route?.path : undefined
		this.req.ctx.logger.info({
			res: {
				duration,
				routePath,
				statusCode: this.statusCode,
				statusMessage: this.statusMessage,
				headers: logResHeaders ? this.getHeaders() : undefined,
			},
		},
			`HTTP response closed`
			+ `  ${fmtDurationPrecise(duration)}`
			+ `  ${this.statusCode}`
			+ `  ${this.statusMessage}`
			+ `  ${this.req.method}`
			+ `  ${this.req.path}`
		)

		metrics?.httpResponseTimes.observe({
			method: this.req.method,
			status: this.statusCode,
			path: routePath ?? 'UNKNOWN',
		}, duration)
		metrics?.totalHttpRequests.inc({
			method: this.req.method,
			status: this.statusCode,
			path: routePath ?? 'UNKNOWN',
		})
		metrics?.totalHttpRequestsClosed.inc({
			method: this.req.method,
			status: this.statusCode,
			path: routePath ?? 'UNKNOWN',
		})

		cleanupRes(this)
	}

	function onResFinish(this: Response) {
		const now = Date.now()
		const duration = now - this.req.startedAt
		const routePath = typeof this.req.route?.path === 'string' ? this.req.route?.path : undefined
		this.req.ctx.logger.info({
			res: {
				duration,
				routePath,
				status: this.status,
				statusCode: this.statusCode,
				statusMessage: this.statusMessage,
				headers: logResHeaders ? this.getHeaders() : undefined,
			},
		},
			`HTTP response finished`
			+ `  ${fmtDurationPrecise(duration)}`
			+ `  ${this.statusCode}`
			+ `  ${this.statusMessage}`
			+ `  ${this.req.method}`
			+ `  ${this.req.path}`
		)

		metrics?.httpResponseTimes.observe({
			method: this.req.method,
			status: this.statusCode,
			path: routePath ?? 'UNKNOWN',
		}, duration)
		metrics?.totalHttpRequests.inc({
			method: this.req.method,
			status: this.statusCode,
			path: routePath ?? 'UNKNOWN',
		})
		metrics?.totalHttpRequestsFinished.inc({
			method: this.req.method,
			status: this.statusCode,
			path: routePath ?? 'UNKNOWN',
		})

		cleanupRes(this)
	}

	function onResError(this: Response, err: Error) {
		const now = Date.now()
		const duration = now - this.req.startedAt
		const routePath = typeof this.req.route?.path === 'string' ? this.req.route?.path : undefined
		this.req.ctx.logger.info({
			err,
			res: {
				duration,
				routePath,
				status: this.status,
				statusCode: this.statusCode,
				statusMessage: this.statusMessage,
				headers: logResHeaders ? this.getHeaders() : undefined,
			},
		},
			`HTTP response error`
			+ `  ${fmtDurationPrecise(duration)}`
			+ `  ${this.statusCode}`
			+ `  ${this.statusMessage}`
			+ `  ${this.req.method}`
			+ `  ${this.req.path}`
		)

		metrics?.totalHttpResponsesErrored.inc({
			method: this.req.method,
			status: this.statusCode,
			path: routePath ?? 'UNKNOWN',
		})
	}

	function cleanupRes(res: Response) {
		inflightReqs.delete(res.req)
		res.off('close', onResClose)
		res.off('finish', onResFinish)
		res.off('error', onResError)
	}

	/**
	 * Requests that haven't finished AND haven't timed out
	 *
	 * (timed out requests are deleted from this list)
	 */
	const inflightReqs = new Set<Request>()

	// Time-out requests that have been running for too long
	const softTimeoutInterval = setInterval(function() {
		const now = Date.now()
		const startedAtCutoff = now - reqSoftTimeoutMs
		for (const req of inflightReqs) {
			if (req.startedAt < startedAtCutoff && !req.aborter.signal.aborted) {
				req.ctx.logger.warn('HTTP request soft timed out')
				req.aborter.abort(new HttpError(HttpStatus.RequestTimeout))
				inflightReqs.delete(req)
			}
		}
	}, reqSoftTimeoutIntervalMs)

	disposer.defer(function() {
		logger.trace('Clearing HTTP request soft timeout interval timer')
		clearInterval(softTimeoutInterval)
	})

	return function(req, res, next) {
		const now = Date.now()
		const aborter = new AbortController()
		const reqid = randomUUID()
		const reqlogger = logger.child({
			req: {
				timestamp: now,
				id: reqid,
				method: req.method,
				url: req.url,
				headers: logReqHeaders ? req.headers : undefined,
				ip: req.ip,
				ips: req.ips,
				remotePort: req.socket.remotePort,
			},
		})
		const ctx: Context = { signal: aborter.signal, logger: reqlogger, }
		req.ctx = ctx
		req.aborter = aborter
		req.reqid = reqid
		req.startedAt = now
		res.on('close', onResClose)
		res.on('finish', onResFinish)
		res.on('error', onResError)
		inflightReqs.add(req)
		next()
	}
}
