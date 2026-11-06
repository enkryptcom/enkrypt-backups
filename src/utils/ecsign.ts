import { secp256k1 } from 'ethereum-cryptography/secp256k1.js'

/** Does the same as `ecsign` from @ethereumjs/util 9.x */
export function ecsign(msgHash: Uint8Array, privateKey: Uint8Array): { v: bigint, r: Uint8Array, s: Uint8Array } {
	const sig = secp256k1.sign(msgHash, privateKey)
	const compact = sig.toCompactRawBytes()
	return {
		r: compact.subarray(0, 32),
		s: compact.subarray(32, 64),
		v: BigInt(sig.recovery + 27),
	}
}

