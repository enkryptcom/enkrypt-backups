import { Buffer } from 'node:buffer'
import type { Bytes20, Bytes32, ByteString, HexInt, UUID } from '../types.js'

// char codes:
// 0: 48
// 9: 57
// a: 97
// z: 122

/** Expects a number that is definitely a hex integer */
export function hexToBigint(hexint: HexInt): bigint {
	if (hexint.startsWith('-')) return -BigInt(hexint.slice(1))
	return BigInt(hexint)
}

/** Expects a number that is definitely a hex integer */
export function hexToNumber(hexint: HexInt): number {
	if (hexint.startsWith('-')) return -Number(hexint.slice(1))
	return Number(hexint)
}

/** Expects a number that is definitely a hex integer */
export function hexToSafeNumber(hexNumber: HexInt): number {
	const number = hexToNumber(hexNumber)
	if (!Number.isSafeInteger(number)) throw new Error(`Expected a safe integer, but got ${hexNumber}`)
	return number
}

/** Expects a number that is definitely a numeric string */
export function stringToBigInt(string: string): bigint {
	if (string.startsWith('-')) return -BigInt(string.slice(1))
	return BigInt(string)
}

/** Returns base 10 string */
export function bigintToString(bigint: bigint): string {
	return bigint.toString(10)
}

export function bigintToHex(bigint: bigint): HexInt {
	if (bigint < 0) return `-0x${(-bigint).toString(16)}` as HexInt
	return `0x${bigint.toString(16)}` as HexInt
}

export function numberToHex(number: number): HexInt {
	if (number < 0) return `-0x${(-number).toString(16)}` as HexInt
	return `0x${number.toString(16)}` as HexInt
}

export function bigintToNumberSafe(bigint: bigint): number {
	const number = Number(bigint)
	if (!Number.isSafeInteger(number)) throw new Error(`Expected a safe integer, but got ${bigint}`)
	return number
}

export function parseHexToBigint(string: string): bigint {
	if (!/0x[0-9a-f]+$/i.test(string)) {
		throw new Error(`Expected a hex int, but got ${string}`)
	}
	const normalised = string.toLowerCase()
	const neg = string.startsWith('-')
	let bigint: bigint
	if (neg) bigint = -BigInt(normalised.slice(1))
	else bigint = BigInt(normalised)
	return bigint
}

export function parseHexInt(string: string): HexInt {
	return bigintToHex(parseHexToBigint(string))
}

export function parseUUID(string: string): UUID {
	const lcstring = string.toLowerCase() as Lowercase<string>
	assertUUID(lcstring)
	return lcstring
}

export function parseByteString(string: string): ByteString {
	const lcstring = string.toLowerCase() as Lowercase<string>
	assertByteString(lcstring)
	return lcstring
}

export function parseBytes20(string: string): Bytes20 {
	const lcstring = string.toLowerCase() as Lowercase<string>
	assertBytes20String(lcstring)
	return lcstring
}

export function parseBytes32(string: string): Bytes32 {
	const lcstring = string.toLowerCase() as Lowercase<string>
	assertBytes32String(lcstring)
	return lcstring
}

export function isUUID(string: string): string is UUID {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(string)
}

export function isByteString(string: string): string is ByteString {
	if (!(string[0] === '0' && string[1] === 'x')) return false
	const len = string.length
	if (len % 2 !== 0) return false
	for (let i = 2; i < len; i++) {
		const charCode = string[i].charCodeAt(0)
		if (!(charCode >= 48 && charCode <= 57) && !(charCode >= 97 && charCode <= 122)) return false
	}
	return true
}

export function isBytes20String(string: string): string is Bytes20 {
	if (!(string[0] === '0' && string[1] === 'x')) return false
	const len = string.length
	if (len !== 42) return false
	for (let i = 2; i < len; i++) {
		const charCode = string[i].charCodeAt(0)
		if (!(charCode >= 48 && charCode <= 57) && !(charCode >= 97 && charCode <= 122)) return false
	}
	return true
}

export function isBytes32String(string: string): string is Bytes32 {
	if (!(string[0] === '0' && string[1] === 'x')) return false
	const len = string.length
	if (len !== 64) return false
	for (let i = 2; i < len; i++) {
		const charCode = string[i].charCodeAt(0)
		if (!(charCode >= 48 && charCode <= 57) && !(charCode >= 97 && charCode <= 122)) return false
	}
	return true
}

export function assertUUID(string: string): asserts string is UUID {
	if (isUUID(string)) return
	throw new Error('Expected a UUID, but got ${string}')
}

export function assertByteString(string: string): asserts string is ByteString {
	if (isByteString(string)) return
	throw new Error(`Expected a byte string, but got ${string}`)
}

export function assertBytes20String(string: string): asserts string is Bytes20 {
	if (isBytes20String(string)) return
	throw new Error(`Expected a byte string of length 20, but got ${string}`)
}

export function assertBytes32String(string: string): asserts string is Bytes20 {
	if (isBytes32String(string)) return
	throw new Error(`Expected a byte string of length 32, but got ${string}`)
}

export function byteStringToBuffer(byteString: string): Buffer {
	return Buffer.from(byteString.slice(2), 'hex')
}

export function byteStringToBytes(byteString: string): Uint8Array {
	const byteLength = (byteString.length - 2) / 2
	const bytes = new Uint8Array(byteLength)
	for (let bytei = 0; bytei < byteLength; bytei++) {
		bytes[bytei] = parseInt(byteString.slice(2 + bytei * 2, 4 + bytei * 2), 16)
	}
	return bytes
}

export function bytesToBuffer(bytes: Uint8Array): Buffer {
	return Buffer.from(bytes);
}

export function bytesToByteString(bytes: Uint8Array): ByteString {
	return '0x' + Buffer.from(bytes).toString('hex') as ByteString;
}

export function bufferToBytes(buf: Buffer): Uint8Array {
	return new Uint8Array(buf);
}

export function bufferToByteString(buf: Buffer): ByteString {
	return '0x' + buf.toString('hex') as ByteString;
}

export function stringToNumber(numberString: string): number {
	return Number(numberString)
}
