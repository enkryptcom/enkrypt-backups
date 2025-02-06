import { Counter, Histogram, Registry } from "prom-client"

export type HttpMetrics = {
	totalHttpRequests: Counter<string>,
	totalHttpRequestsFinished: Counter<string>,
	totalHttpRequestsClosed: Counter<string>,
	totalHttpRequestsErrored: Counter<string>,
	totalHttpResponsesErrored: Counter<string>,
	httpResponseTimes: Histogram<string>,
}

export function createHttpMetrics(opts: {
	prefix?: string
	registry: Registry,
}): HttpMetrics {
	const { registry, prefix = '' } = opts
	const metrics: HttpMetrics = {
		totalHttpRequests: new Counter({
			name: `${prefix}http_requests_total`,
			help: 'Total number of HTTP requests',
			labelNames: ['method', 'path', 'status',],
			registers: [registry],
		}),
		totalHttpRequestsFinished: new Counter({
			name: `${prefix}http_requests_finished_total`,
			help: 'Total number of HTTP requests that finished',
			labelNames: ['method', 'path', 'status',],
			registers: [registry],
		}),
		totalHttpRequestsClosed: new Counter({
			name: `${prefix}http_requests_closed_total`,
			help: 'Total number of HTTP requests that were closed before finishing',
			labelNames: ['method', 'path', 'status',],
			registers: [registry],
		}),
		totalHttpRequestsErrored: new Counter({
			name: `${prefix}http_errors_total`,
			help: 'Total number of HTTP errors',
			labelNames: ['method', 'path', 'status',],
			registers: [registry],
		}),
		totalHttpResponsesErrored: new Counter({
			name: `${prefix}http_response_errors_total`,
			help: 'Total number of HTTP responses that errored',
			labelNames: ['method', 'path', 'status',],
			registers: [registry],
		}),
		httpResponseTimes: new Histogram({
			name: `${prefix}http_response_time_seconds`,
			help: 'HTTP response times in seconds',
			labelNames: ['method', 'path', 'status',],
			buckets: [0.1, 0.3, 1, 3, 10, 30, 60, 120],
			registers: [registry],
		}),
	}

	return metrics
}

