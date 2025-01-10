import { Counter, Gauge, Histogram, Registry } from "prom-client"
import type { ApiMetrics } from "./types.js"
import type { Disposer } from "../../utils/disposer.js"

export function createMetrics(opts: {
	disposer: Disposer,
	registry: Registry,
}) {
	const { disposer, registry, } = opts
	const metrics: ApiMetrics = {
		uptime: new Gauge({
			name: 'uptime_seconds',
			help: 'Uptime in seconds',
			registers: [registry],
		}),
		totalHttpRequests: new Counter({
			name: 'http_requests_total',
			help: 'Total number of HTTP requests',
			labelNames: ['method', 'path', 'status',],
			registers: [registry],
		}),
		totalHttpRequestsFinished: new Counter({
			name: 'http_requests_finished_total',
			help: 'Total number of HTTP requests that finished',
			labelNames: ['method', 'path', 'status',],
			registers: [registry],
		}),
		totalHttpRequestsClosed: new Counter({
			name: 'http_requests_closed_total',
			help: 'Total number of HTTP requests that were closed before finishing',
			labelNames: ['method', 'path', 'status',],
			registers: [registry],
		}),
		totalHttpRequestsErrored: new Counter({
			name: 'http_errors_total',
			help: 'Total number of HTTP errors',
			labelNames: ['method', 'path', 'status',],
			registers: [registry],
		}),
		totalHttpResponsesErrored: new Counter({
			name: 'http_response_errors_total',
			help: 'Total number of HTTP responses that errored',
			labelNames: ['method', 'path', 'status',],
			registers: [registry],
		}),
		httpResponseTimes: new Histogram({
			name: 'http_response_time_seconds',
			help: 'HTTP response times in seconds',
			labelNames: ['method', 'path', 'status',],
			buckets: [0.1, 0.3, 1, 3, 10, 30, 60, 120],
			registers: [registry],
		}),
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
