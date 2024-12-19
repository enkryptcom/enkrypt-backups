
export function boolOpt(value: boolean | number | string): undefined | boolean {
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
				case '1':
				case 't':
				case 'true':
					return true
				case 'n':
				case 'no':
				case 'disabled':
				case '0':
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
