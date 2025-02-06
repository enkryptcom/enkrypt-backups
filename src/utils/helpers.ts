

export function bigintMin(a: bigint, b: bigint): bigint {
	return a < b ? a : b
}

export function bigintMax(a: bigint, b: bigint): bigint {
	return a < b ? a : b
}

export function bigintClamp(value: bigint, min: bigint, max: bigint): bigint {
	if (value < min) return min
	if (value > max) return max
	return value
}

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise<void>(function(res, rej) {
		function onTimeout() {
			cleanup()
			res()
		}
		function onAbort() {
			cleanup()
			rej(signal.reason)
		}
		function cleanup() {
			clearTimeout(timeout)
			signal.removeEventListener('abort', onAbort)
		}
		const timeout = setTimeout(onTimeout, ms)
		signal.addEventListener('abort', onAbort)
	})
}

export function allSettled<T extends readonly unknown[] | []>(values: T): Promise<{ -readonly [P in keyof T]: Awaited<T[P]>; }>;
export function allSettled<T>(values: Iterable<T | PromiseLike<T>>): Promise<Awaited<T>[]>;
export async function allSettled(values: Iterable<any>): Promise<any[]> {
	const settledResults = await Promise.allSettled(values)
	const len = settledResults.length
	const results = new Array(len)
	for (let i = 0; i < len; i++) {
		const settledResult = settledResults[i]
		if (settledResult.status === 'rejected') throw settledResult.reason
		results[i] = settledResult.value
	}
	return results
}

