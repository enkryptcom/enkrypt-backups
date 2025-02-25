
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

