import type { RequestHandler } from "express"
import type { operations } from "../openapi.js"
import { HttpStatus } from "../utils/http.js"
import type { OpenAPIV3_1 } from "openapi-types"

type Params = operations['GetSchemaJson']['parameters']['path']
type ReqBody = operations['GetSchemaJson']['requestBody']
// type ResBody = operations['GetSchemaJson']['responses']['200']['content']['application/json']
type ResBody = string
type ReqQuery = operations['GetSchemaJson']['parameters']['query']
type Handler = RequestHandler<Params, ResBody, ReqBody, ReqQuery>

export default function createGetSchemaJsonHandler(opts: {
	openApiDoc: OpenAPIV3_1.Document,
}): Handler {
	const { openApiDoc, } = opts

	const json = JSON.stringify(openApiDoc)
	return function(_req, res, _next) {
		const response: ResBody = json
		res
			.status(HttpStatus.OK)
			.contentType('application/json')
			.send(response)
	}
}

