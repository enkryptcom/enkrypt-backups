import { parseBytesSafe } from "./bytes.js";
import { parseMsSafe } from "./time.js";

export function boolOpt(value: boolean | number | string | undefined): undefined | boolean {
	switch (typeof value) {
		case 'boolean': return value
		case 'number': {
			switch (value) {
				case 0: return false
				case 1: return true
				default: return undefined;
			}
		}
		case 'string': {
			switch (value.toLowerCase().trim()) {
				case 'y':
				case 'yes':
				case 'enabled':
				// case '1': Conflicts with number opt
				case 't':
				case 'true':
					return true
				case 'n':
				case 'no':
				case 'disabled':
				// case '0': Conflicts with number opt
				case 'f':
				case 'false':
					return false
				default:
					return undefined
			}
		}
		default: return undefined
	}
}

export function intOpt(value: number | string | undefined | unknown): undefined | number {
	switch (typeof value) {
		case 'number': return Number.isSafeInteger(value) ? value : undefined
		case 'string': {
			const number = Number(value.replace(/[,_]/g, ''))
			if (Number.isSafeInteger(number)) return number
			return undefined
		}
		default: return undefined
	}
}

export function msOpt(duration: string | number | undefined): undefined | number {
	if (duration === undefined) return undefined
	return parseMsSafe(duration)
}

export function bytesOpt(value: number | string | undefined): undefined | number {
	if (value === undefined) return undefined
	return parseBytesSafe(value)
}

/**
 * @example
 * ```ts
 * parseOptPercentageSafe('100%')  // 1
 * parseOptPercentageSafe('90%')   // 0.9
 * parseOptPercentageSafe('90 %')  // 0.9
 * parseOptPercentageSafe('0.1')   // 0.1
 * parseOptPercentageSafe(0.1)     // 0.1
 * parseOptPercentageSafe('101%')  // undefined
 * parseOptPercentageSafe('-1%')   // undefined
 * ```
 */
export function rateOpt(value: string | number): undefined | number {
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) return undefined
		if (value < 0) return undefined
		if (value > 1) return undefined
		return value
	}
	const match = value.trim().match(/^([\d,_]+(?:\.[\d,_]+)?)\s*(%)?$/)
	if (!match) return undefined
	const [_, numberStrWithSeparators, percentStr] = match
	const numberStr = numberStrWithSeparators.replace(/[,_]/g, '')
	const number = Number(numberStr)
	if (!Number.isFinite(number)) return undefined
	switch (typeof percentStr) {
		case 'string':
			// Interpret as percentage
			if (number < 0 || number > 100) return undefined
			return number / 100
		case 'undefined':
			// Interpret as number between 0 and 1
			if (number < 0 || number > 1) return undefined
			return number
		default: return undefined
	}
}
