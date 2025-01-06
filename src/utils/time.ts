export function parseMs(duration: string | number): number {
	if (typeof duration === 'number') return duration
	const ms = parseMsSafe(duration)
	if (ms == null) throw new Error(`Invalid duration: ${duration}`)
	return ms
}

export function parseMsSafe(duration: string | number): undefined | number {
	if (typeof duration === 'number') return duration
	const match = duration.trim().replace(/[,_]/g, '').match(/^(\d+)\s*([a-zA-Z]*)$/)
	if (!match) return undefined
	const [_, n, unit] = match
	const num = parseInt(n)
	switch (unit?.toLowerCase()) {
		case 'nanoseconds':
		case 'nanos':
		case 'ns': return Math.round(num / 1_000_000)

		case 'microseconds':
		case 'micros':
		case 'μs': return Math.round(num / 1_000)

		case 'milliseconds':
		case 'millis':
		case 'ms':
		case '': return num

		case 'seconds':
		case 'secs':
		case 's': return num * 1_000

		case 'minutes':
		case 'mins':
		case 'm': return num * 60_000

		case 'hours':
		case 'hrs':
		case 'h': return num * 3_600_000

		case 'days':
		case 'dys':
		case 'd': return num * 86_400_000

		case 'weeks':
		case 'wks':
		case 'w': return num * 604_800_000

		case 'months':
		case 'mos': return num * 2_629_746_000

		case 'years':
		case 'yrs':
		case 'y': return num * 31_556_952_000

		default: return undefined
	}
}

export function fmtBytes(bytes: number): string {
	if (bytes < 1_024) return `${bytes.toString()}B`
	if (bytes < 1_024 * 1_024) return `${(bytes / 1_024).toFixed(2)}KiB`
	if (bytes < 1_024 * 1_024 * 1_024) return `${(bytes / (1_024 * 1_024)).toFixed(2)}MiB`
	if (bytes < 1_024 * 1_024 * 1_024 * 1_024) return `${(bytes / (1_024 * 1_024 * 1_024)).toFixed(2)}GiB`
	if (bytes < 1_024 * 1_024 * 1_024 * 1_024 * 1_024) return `${(bytes / (1_024 * 1_024 * 1_024 * 1_024)).toFixed(2)}TiB`
	if (bytes < 1_024 * 1_024 * 1_024 * 1_024 * 1_024 * 1_024) return `${(bytes / (1_024 * 1_024 * 1_024 * 1_024 * 1_024)).toFixed(2)}PiB`
	if (bytes < 1_024 * 1_024 * 1_024 * 1_024 * 1_024 * 1_024 * 1_024) return `${(bytes / (1_024 * 1_024 * 1_024 * 1_024 * 1_024 * 1_024)).toFixed(2)}EiB`
	return `${bytes.toString()}B`
}

export function parseBytes(bytes: number | string): number {
	const result = parseBytesSafe(bytes)
	if (result == null) throw new Error(`Invalid bytes: ${bytes}`)
	return result
}

export function parseBytesSafe(bytes: number | string): undefined | number {
	if (typeof bytes === 'number') return bytes
	const match = bytes.trim().match(/^([0-9,_]+)(?:\.([0-9]+))?\s*([a-z]*)?$/i)
	if (!match) {
		// Invalid string
		return undefined
	}
	const [_, integerPartRaw, decimalPartRaw, unit] = match
	const integerPart = Number(integerPartRaw.replace(/[,_]/g, ''))
	if (!Number.isSafeInteger(integerPart)) {
		// Too large
		return undefined
	}
	let decimalPart: number | undefined
	if (decimalPartRaw) {
		decimalPart = Number(decimalPartRaw)
		if (!Number.isSafeInteger(decimalPart)) {
			// Decimals are too large
			return undefined
		}
	}
	const modifier = unit?.toLowerCase()

	let base: number;
	switch (modifier) {
		case 'b': base = 1; break;
		case 'kb': base = 1_000; break;
		case 'kib': base = 1_024; break;
		case 'mb': base = 1_000 * 1_000; break;
		case 'mib': base = 1_024 * 1_024; break;
		case 'gb': base = 1_000 * 1_000 * 1_000; break;
		case 'gib': base = 1_024 * 1_024 * 1_024; break;
		case 'tb': base = 1_000 * 1_000 * 1_000 * 1_000; break;
		case 'tib': base = 1_024 * 1_024 * 1_024 * 1_024; break;
		case 'pb': base = 1_000 * 1_000 * 1_000 * 1_000 * 1_000; break;
		case 'pib': base = 1_024 * 1_024 * 1_024 * 1_024 * 1_024; break;
		// Note: Exabytes are generally just too large for this... shouldn't allow them
		// would need bigints to work with them
		case 'eb': base = 1_000 * 1_000 * 1_000 * 1_000 * 1_000 * 1_000; break;
		case 'eib': base = 1_024 * 1_024 * 1_024 * 1_024 * 1_024 * 1_024; break;
		case undefined: base = 1; break;
		default: return undefined // Unknown modifier
	}
	if (!Number.isSafeInteger(base)) {
		if (integerPart === 0 && (!decimalPart)) return 0
		throw new Error(`Modifier too large: ${bytes}`)
	}
	let result: number
	if (decimalPart == null) {
		// Round in-case we get some weird floating point issue
		// result = Math.round(integerPart * base)
		result = integerPart * base
	} else {
		result = Math.round(Number(`${integerPart}.${decimalPart}`) * base)
	}
	if (!Number.isSafeInteger(result)) {
		// Too large
		return undefined
	}
	return result
}

export function fmtDurationPrecise(duration: number): string {
	let neg = duration < 0
	duration = Math.abs(duration)
	let age = ''
	const u = duration - Math.floor(duration)
	duration = Math.floor(duration)
	const ms = duration % 1_000
	duration = Math.floor(duration / 1_000)
	const s = duration % 60
	duration = Math.floor(duration / 60)
	const m = duration % 60
	duration = Math.floor(duration / 60)
	const h = duration % 24
	duration = Math.floor(duration / 24)
	const d = duration % 7
	duration = Math.floor(duration / 7)
	const w = duration % 4
	duration = Math.floor(duration / 4)
	const mo = duration % 12
	duration = Math.floor(duration / 12)
	const y = duration
	if (y) age += `${y}y`
	if (mo) age += `${mo}mo`
	if (w) age += `${w}w`
	if (d) age += `${d}d`
	if (h) age += `${h}h`
	if (m) age += `${m}m`
	if (s) age += `${s}s`
	if (ms) age += `${ms}ms`
	if (u) age += `${u.toFixed(3).slice(2)}μs`
	if (!age) age = '0ms'
	if (neg) age = `-${age}`
	return age
}

export function fmtDuration(duration: number): string {
	let neg = duration < 0
	duration = Math.abs(duration)
	let age = ''
	duration = Math.round(duration / 1_000)
	const s = duration % 60
	duration = Math.floor(duration / 60)
	const m = duration % 60
	duration = Math.floor(duration / 60)
	const h = duration % 24
	duration = Math.floor(duration / 24)
	const d = duration % 7
	duration = Math.floor(duration / 7)
	const w = duration % 4
	duration = Math.floor(duration / 4)
	const mo = duration % 12
	duration = Math.floor(duration / 12)
	const y = duration
	if (y) age += `${y}y`
	if (mo) age += `${mo}mo`
	if (w) age += `${w}w`
	if (d) age += `${d}d`
	if (h) age += `${h}h`
	if (m) age += `${m}m`
	if (s) age += `${s}s`
	if (!age) age = '0s'
	if (neg) age = `-${age}`
	return age
}

export function fmtAgePrecise(from: number, to: number): string {
	return fmtDurationPrecise(to - from)
}

export function fmtAge(from: number, to: number): string {
	return fmtDuration(to - from)
}

export function ymdhms(date: Date): string {
	const y = date.getUTCFullYear().toString().padStart(4, '0')
	const m = (date.getUTCMonth() + 1).toString().padStart(2, '0')
	const d = date.getUTCDate().toString().padStart(2, '0')
	const h = date.getUTCHours().toString().padStart(2, '0')
	const min = date.getUTCMinutes().toString().padStart(2, '0')
	const s = date.getUTCSeconds().toString().padStart(2, '0')
	return `${y}-${m}-${d} ${h}:${min}:${s}`
}
