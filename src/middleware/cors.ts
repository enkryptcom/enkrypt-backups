import type { Handler, } from 'express'
import cors from 'cors'

export function corsMiddleware(opts: {
	originWhitelist: RegExp[]
}): Handler {
	const { originWhitelist, } = opts

	return cors({ origin: originWhitelist, })
}
