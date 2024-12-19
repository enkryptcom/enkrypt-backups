import type { Writable } from "node:stream"
import type { GlobalOptions } from "../types.js"
import type { Logger } from "pino"
import { request as httpRequest, } from 'node:http'
import { request as httpsRequest, } from 'node:https'
import { randomBytes, randomUUID } from "node:crypto"
import { createInterface } from 'node:readline/promises'
import { bufferToByteString, bytesToByteString, parseByteString } from "../utils/coersion.js"
import { ecsign, hashPersonalMessage, privateToPublic, toRpcSig } from "@ethereumjs/util"
import type { components } from "../openapi.js"
import { inspect } from "node:util"

function printHelp(stream: Writable): void {
	stream.write(`Usage: node [options] client [options]\n`)
	stream.write('\n')
	stream.write('Options:\n')
	stream.write('  -h, --help       Print this help message\n')
	stream.write('  -v, --version    Print the version\n')
	stream.write('  --api-url <url>  API URL                   http://BIND_ADDR:BIND_PORT  http://localhost:3000\n')
}

export async function serve(globalOpts: GlobalOptions): Promise<number> {
	const { argv, env, stdin, stdout, stderr, logger, } = globalOpts

	let bindPortOpt = env.BIND_PORT || '3000'
	let bindAddr = env.BIND_ADDR || 'localhost'
	let apiUrl = `${bindAddr}:${bindPortOpt}`
	if (!/^[a-zA-Z]:\/\//.test(apiUrl)) {
		// Doesn't start with a protocol? Prepend with http://
		apiUrl = `http://${apiUrl}`
	}

	let parsedArgs = false
	let argi = 0
	while (!parsedArgs && argi < argv.length) {
		let eqidx: number
		if (argv[argi].startsWith('-') && (eqidx = argv[argi].indexOf('=')) !== -1) {
			argv[argi] = argv[argi].slice(0, eqidx)
			argv.splice(argi + 1, 0, argv[argi].slice(eqidx + 1))
		}

		switch (argv[argi]) {
			case '-h':
			case '--help':
				printHelp(stdout)
				return 0
			case '--api-url':
				apiUrl = argv[++argi]
				break
			default:
				printHelp(stderr)
				stderr.write('\n')
				stderr.write(`Unknown option: ${argv[argi]}\n`)
				return 1
		}
		argi++
	}

	if (!/https?:\/\//.test(apiUrl)) {
		// Unregocnised protocol
		printHelp(stderr)
		stderr.write('\n')
		stderr.write(`Invalid API URL: ${apiUrl}\n`)
		return 1
	}

	await cmd({
		stdin,
		stdout,
		stderr,
		logger,
		apiUrl,
	})

	return 0
}

type CommandOptions = {
	stdin: NodeJS.ReadableStream,
	stdout: NodeJS.WritableStream,
	stderr: NodeJS.WritableStream,
	logger: Logger,
	apiUrl: string,
}

async function cmd(opts: CommandOptions): Promise<void> {
	const {
		stdin,
		stdout,
		stderr,
		apiUrl,
		logger,
	} = opts


	const privkey = randomBytes(32)
	const pubkey = privateToPublic(privkey)
	logger.info(`Private key: ${bufferToByteString(privkey)}`)
	logger.info(`Public key:  ${bytesToByteString(pubkey)}`)


	while (true) {
		let payload: string
		{
			const rl = createInterface(stdin, stdout)
			try {
				payload = await rl.question('Create a backup with payload: ')
			} finally {
				rl.close()
			}
		}
		const payloadBuf = Buffer.from(payload, 'utf8')
		const messageHash = hashPersonalMessage(payloadBuf)
		const ecsig = ecsign(messageHash, privkey)
		const signature = toRpcSig(ecsig.v, ecsig.r, ecsig.s)
		const body: components['schemas']['PostBackupRequest'] = {
			payload: bufferToByteString(payloadBuf),
			signature: parseByteString(signature),
		}
		const userId = randomUUID()
		const reqUrl = `${apiUrl}/backups/${bytesToByteString(pubkey)}/${userId}`
		logger.info({ reqUrl, body, userId, signature, }, 'Sending backup')
		const res = await fetch(reqUrl, {
			method: 'POST',
			signal: AbortSignal.timeout(2_000),
			headers: [
				['Content-Type', 'application/json'],
				['Accept', 'application/json'],
			],
			body: JSON.stringify(body)
		})
		if (!res.ok) {
			logger.error({ status: res.status, statusText: res.statusText, }, 'Failed to send backup')
			continue
		}
		const json = await res.json() as components['schemas']['PostBackupResponse']
		logger.info({ message: json.message, }, 'Backup received')

		let yn: string = 'y'
		// const rl = createInterface(stdin, stdout)
		// try {
		// 	yn = await rl.question('Request backups? [y/N] ') || 'n'
		// } finally {
		// 	rl.close()
		// }
		switch (yn.trim().toLowerCase()) {
			case 'y': {
				const reqUrl = `${apiUrl}/backups/${bytesToByteString(pubkey)}`
				const res = await fetch(reqUrl, {
					method: 'GET',
					signal: AbortSignal.timeout(2_000),
					headers: [
						['Accept', 'application/json'],
					],
				})
				if (!res.ok) {
					logger.error({ status: res.status, statusText: res.statusText, }, 'Failed to get backups')
					continue
				}
				const json = await res.json() as components['schemas']['GetBackupsResponse']
				const backups = json.backups
				for (let i = 0, len = backups.length; i < len; i++) {
					const backup = backups[i]
					logger.info(`Backup ${i}. ${inspect(backup, { colors: true, depth: 10, compact: true })}`)
				}
				break
			}
			default:
				break
		}
	}

	// TODO:
	// createreadl
}

