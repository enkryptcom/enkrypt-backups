import type { RequestHandler } from "express"
import type { operations } from "../openapi.js"
import { HttpStatus } from "../utils/http.js"

type Params = operations['GetSchema']['parameters']['path']
type ReqBody = operations['GetSchema']['requestBody']
type ResBody = operations['GetSchema']['responses']['200']['content']['application/yaml']
type ReqQuery = operations['GetSchema']['parameters']['query']
type Handler = RequestHandler<Params, ResBody, ReqBody, ReqQuery>

export default function createGetSchemaHandler(opts: {
	openApiDocYaml: string
}): Handler {
	const { openApiDocYaml, } = opts

	return function(_req, res, _next) {
		const response: ResBody = openApiDocYaml
		res
			.status(HttpStatus.OK)
			.contentType('application/yaml')
			.send(response)
	}
}
