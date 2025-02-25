import type { RequestHandler } from "express"
import type { operations } from "../openapi.js"
import { HttpStatus } from "../utils/http.js"

type Params = operations['GetHealth']['parameters']['path']
type ReqBody = operations['GetHealth']['requestBody']
type ResBody = operations['GetHealth']['responses']['200']['content']['application/json']
type ReqQuery = operations['GetHealth']['parameters']['query']
type Handler = RequestHandler<Params, ResBody, ReqBody, ReqQuery>

export default function createGetHealthHandler(): Handler {
	return function(_req, res, _next) {
		const response: ResBody = { message: 'Ok' }
		res
			.status(HttpStatus.OK)
			.json(response)
	}
}
