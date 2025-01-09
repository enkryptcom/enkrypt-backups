import type { Handler } from 'express'
import { sleep } from '../utils/helpers.js'

export function latencyMiddleware(opts: {
	latencyBaseMs: number,
	latencyJitterMs: number,
}): Handler {
	const {
		latencyBaseMs,
		latencyJitterMs,
	} = opts

	return async function(req, _res, next) {
		const latency = Math.round(latencyBaseMs + Math.random() * latencyJitterMs)
		try {
			req.ctx.logger.trace('Simulating latency', { latency })
			await sleep(latency, req.ctx.signal)
			next()
		} catch (err) {
			next(err)
		}
	}
}
