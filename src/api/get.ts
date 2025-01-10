import type { RequestHandler } from "express"
import type { operations } from "../openapi.js"
import { HttpStatus } from "../utils/http.js"

type Params = operations['GetRoot']['parameters']['path']
type ReqBody = operations['GetRoot']['requestBody']
type ResBody = operations['GetRoot']['responses']['200']['content']['application/json']
type ReqQuery = operations['GetRoot']['parameters']['query']
type Handler = RequestHandler<Params, ResBody, ReqBody, ReqQuery>

export default function createGetVersionHandler(opts: {
	appVersion: string,
}): Handler {
	const { appVersion, } = opts

	return function(_req, res, _next) {
		const response: ResBody = { message: `Enkrypt API v${appVersion}` }
		res
			.status(HttpStatus.OK)
			.json(response)
	}
}

