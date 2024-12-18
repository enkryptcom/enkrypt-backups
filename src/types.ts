import type { Logger } from "pino"
import type { EnvironmentVariables } from "./env.js"

export type GlobalOptions = {
	stdin: NodeJS.ReadStream & { fd: 0 }
	stdout: NodeJS.WriteStream & { fd: 1 }
	stderr: NodeJS.WriteStream & { fd: 2 }
	env: EnvironmentVariables
	logger: Logger
	argv: string[]
}

export type Context = {
	logger: Logger
	signal: AbortSignal
}


/** Lowercase 0x prefixed hex string */
export type Hex = `0x${string}`
/** Lowercase -?0x prefixed non-zero-length hex string */
export type HexInt = `${'-' | ''}0x${string}`
/** Lowercase -?0x prefixed non-zero-length hex string */
export type HexUint = `0x${string}`
/** Lowercase 0x prefixed even-length hex string */
export type ByteString = Hex
export type Bytes20 = ByteString
export type Bytes32 = ByteString
export type EVMAddress = Bytes20
export type Hash = Bytes32

export type Iso8601 = string
export type UUID = `${string}-${string}-${string}-${string}-${string}`

