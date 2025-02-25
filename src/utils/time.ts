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
