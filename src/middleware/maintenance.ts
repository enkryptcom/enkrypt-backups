import type { Handler } from "express";
import { HttpStatus } from "../utils/http.js";

export function maintenanceMiddleware(opts: { appVersion: string }): Handler {
	const { appVersion } = opts
	return function(_req, res, _next) {
		res
			.header('Retry-After', '10')
			.status(HttpStatus.ServiceUnavailable)
			.json({ message: `Enkrypt API down for maintenance ${appVersion}` })
	}
}

