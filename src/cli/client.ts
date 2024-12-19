import type { Writable } from "node:stream"
import type { GlobalOptions } from "../types.js"
import type { Logger } from "pino"
import { randomBytes } from "node:crypto"
import { createInterface } from 'node:readline/promises'
import { bufferToByteString, bytesToByteString } from "../utils/coersion.js"
import { privateToPublic } from "@ethereumjs/util"

function printHelp(stream: Writable): void {
	stream.write(`Usage: node [options] client [options]\n`)
	stream.write('\n')
	stream.write('Options:\n')
	stream.write('  -h, --help                     Print this help message\n')
	stream.write('  -v, --version                  Print the version\n')
	stream.write('  --port <port>                  API Port                        BIND_PORT     3000\n')
	stream.write('  --host <addr>                  API host                        BIND_ADDR     127.0.0.1\n')
}

export async function serve(globalOpts: GlobalOptions): Promise<number> {
	const { argv, env, stdin, stdout, stderr, logger, } = globalOpts

	let portOpt = env.BIND_PORT || '3000'
	let host = env.BIND_ADDR || '127.0.0.1'

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
			case '--port':
				portOpt = argv[++argi]
				break
			case '--host':
				host = argv[++argi]
				break
			default:
				printHelp(stderr)
				stderr.write('\n')
				stderr.write(`Unknown option: ${argv[argi]}\n`)
				return 1
		}
		argi++
	}

	const port = Number(portOpt)
	if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
		printHelp(stderr)
		stderr.write('\n')
		stderr.write(`Invalid port: ${portOpt}\n`)
		return 1
	}

	await cmd({
		stdin,
		stdout,
		stderr,
		logger,
		host,
		port,
	})

	return 0
}

type CommandOptions = {
	stdin: NodeJS.ReadableStream,
	stdout: NodeJS.WritableStream,
	stderr: NodeJS.WritableStream,
	logger: Logger,
	host: string,
	port: number,
}

async function cmd(opts: CommandOptions): Promise<void> {
	const {
		host,
		port,
		logger,
	} = opts


	const privkey = randomBytes(32)
	const pubkey = privateToPublic(privkey)
	logger.info(`Private key: ${bufferToByteString(privkey)}`)
	logger.info(`Public key:  ${bytesToByteString(pubkey)}`)

	// TODO:
	// createreadl
}

