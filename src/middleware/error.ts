import type { ErrorRequestHandler } from "express"
import { HttpError, HttpStatus } from "../utils/http.js"

export function errorHandlerMiddleware(opts: {
	debugErrors: boolean,
}): ErrorRequestHandler {
	const { debugErrors, } = opts

	// Error handler
	return function(_err, req, res, _next) {
		let err: HttpError
		if ((_err instanceof HttpError)) {
			err = _err
		} else {
			err = new HttpError(HttpStatus.InternalServerError, undefined)
			req.ctx.logger.error({ err: _err }, 'Unhandled error')
		}

		let result: Record<PropertyKey, unknown>
		if (debugErrors) {
			result = renderDebugError(err)
		} else {
			result = renderProdError(err)
		}

		if (err.headers) {
			for (const [key, value] of Object.entries(err.headers)) {
				res.setHeader(key, value)
			}
		}

		res.status(err.status).json(result)
	}
}



function renderProdError(err: HttpError): Record<PropertyKey, unknown> {
	// Message
	const result: Record<PropertyKey, unknown> = {
		// status: err.status,
		message: err.message,
	}
	// Bind "data" properties to the root
	if (err.data) {
		for (const [key, val] of Object.entries(err.data)) {
			if (key === 'message') continue
			if (key === 'status') continue
			if (Object.hasOwn(result, key)) continue
			result[key] = val
		}
	}
	return result
}

function renderDebugError(err: Error, seen: Set<unknown> = new Set()): Record<PropertyKey, unknown> {
	const result: Record<PropertyKey, unknown> = {}
	// Name, status, message
	if (!Object.hasOwn(result, 'name') && err.name) result.name = err.name
	if (!Object.hasOwn(result, 'status') && err instanceof HttpError) result.status = err.status
	if (!Object.hasOwn(result, 'message') && err.message) result.message = err.message
	// If HttpError, bind "data" properties to the root
	if (!Object.hasOwn(result, 'data') && err instanceof HttpError) {
		for (const [key, val] of Object.entries(err)) {
			if (Object.hasOwn(result, key)) continue
			result[key] = val
		}
	}
	// Bind all enumerable properties (except data) from the root
	for (const [key, val] of Object.entries(err)) {
		if (err instanceof HttpError && key === 'data') continue
		if (Object.hasOwn(result, key)) continue
		result[key] = val
	}
	// Bind stack
	if (!Object.hasOwn(result, 'stack') && err.stack) {
		if (err instanceof HttpError) {
			result.stack = err
				.stack
				.split('\n')
				.slice(1, 4)
				.map((line) => line.trim())
		} else {
			result.stack = err
				.stack
				.split('\n')
				.map((line) => line.trim())
		}
	}
	// Bind nested errors
	if (!Object.hasOwn(result, 'cause') && err.cause && !seen.has(err.cause as Error)) {
		seen.add(err.cause as Error)
		result.cause = renderDebugError(err.cause as Error, seen)
	}

	return result
}
