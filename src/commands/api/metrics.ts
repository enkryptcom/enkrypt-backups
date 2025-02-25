import { Gauge, Registry } from "prom-client"
import type { Disposer } from "../../utils/disposer.js";
import { createHttpMetrics, type HttpMetrics } from "../../utils/http-metrics.js";

export type ApiMetrics = HttpMetrics & {
	uptime: Gauge<string>,
}

export function createApiMetrics(opts: {
	prefix?: string,
	disposer: Disposer,
	registry: Registry,
}): ApiMetrics {
	const { prefix = '', disposer, registry, } = opts
	const metrics: ApiMetrics = {
		uptime: new Gauge({
			name: `${prefix}uptime_seconds`,
			help: 'Uptime in seconds',
			registers: [registry],
		}),
		...createHttpMetrics({ prefix, registry, }),
	}

	const serverStartTime = Date.now();
	const uptimeInterval = setInterval(() => {
		const elapsedTime = (Date.now() - serverStartTime) / 1_000;
		metrics.uptime.set(elapsedTime);
	}, 1_000);
	disposer.defer(function() {
		clearInterval(uptimeInterval)
	})

	return metrics
}
