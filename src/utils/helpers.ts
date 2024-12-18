

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

