import type { RequestHandler } from "express"
import type { operations } from "../openapi.js"
import { HttpStatus } from "../utils/http.js"

type Params = operations['GetSchemaYaml']['parameters']['path']
type ReqBody = operations['GetSchemaYaml']['requestBody']
type ResBody = operations['GetSchemaYaml']['responses']['200']['content']['application/yaml']
type ReqQuery = operations['GetSchemaYaml']['parameters']['query']
type Handler = RequestHandler<Params, ResBody, ReqBody, ReqQuery>

export default function createGetSchemaYamlHandler(opts: {
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

