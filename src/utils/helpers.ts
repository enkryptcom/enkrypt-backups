

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
