import type { RequestHandler } from "express"
import type { operations } from "../openapi.js"
import { HttpStatus } from "../utils/http.js"

type Params = operations['GetVersion']['parameters']['path']
type ReqBody = operations['GetVersion']['requestBody']
type ResBody = operations['GetVersion']['responses']['200']['content']['application/json']
type ReqQuery = operations['GetVersion']['parameters']['query']
type Handler = RequestHandler<Params, ResBody, ReqBody, ReqQuery>

export default function createGetVersionHandler(opts: {
	appVersion: string,
}): Handler {
	const { appVersion, } = opts

	return function(_req, res, _next) {
		const response: ResBody = { version: appVersion }
		res
			.status(HttpStatus.OK)
			.json(response)
	}
}
