#! /usr/bin/env node

import { type Writable } from "node:stream"
import { pino, type Logger } from 'pino'
import prettyFactory from 'pino-pretty'
import type { EnvironmentVariables } from "./env.js"
import { boolOpt } from "./utils/options.js"
import type { GlobalOptions } from "./types.js"

const { stdout, stderr, stdin, } = process

function printHelp(stream: Writable): void {
	stream.write(`Usage: node [options] [command] [options]\n`)
	stream.write('\n')
	stream.write('Options:\n')
	stream.write('  -h, --help                     Print this help message\n')
	stream.write('  -v, --version                  Print the version\n')
	stream.write('\n')
	stream.write('Logging\n')
	stream.write('  --log-level <level>            Log level                                 LOG_LEVEL              info\n')
	stream.write('  --log-foramt <format>          Log format, JSON or PRETTY                LOG_FORMAT             PRETTY\n')
	stream.write('  --[no-]log-pretty-sync         Force synchronous (slower) logging        LOG_PRETTY_SYNC        false\n')
	stream.write('  --[no-]log-pretty-color        Colorize log output                       LOG_PRETTY_COLOR       true\n')
	stream.write('  --[no-]log-pretty-single-line  Single line log output                    LOG_PRETTY_SINGLE_LINE false\n')
	stream.write('\n')
	stream.write('Commands\n')
	stream.write('  serve\n')
}

function printVersion(stream: Writable): void {
	stream.write('v1.0.0\n')
}

let exitAfterDrain = false
async function main(argv: string[], env: EnvironmentVariables): Promise<number> {
	let logLevel = env.LOG_LEVEL || 'info'
	let logFormat = env.LOG_FORMAT || 'PRETTY'
	let logPrettySyncOpt = env.LOG_PRETTY_SYNC === 'false'
	let logPrettyColorOpt = env.LOG_PRETTY_COLOR === 'true'
	let logPrettySingleLine = env.LOG_PRETTY_SINGLE_LINE === 'true'
	let cmd: undefined | string

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
			case '-v':
			case '--version':
				printVersion(stdout)
				return 0
			case '--log-level':
				logLevel = argv[++argi] || logLevel
				break
			case '--log-format':
				logFormat = argv[++argi] || logFormat
				break
			case '--log-pretty-sync':
				logPrettySyncOpt = true
				break
			case '--no-log-pretty-sync':
				logPrettySyncOpt = false
				break
			case '--log-pretty-color':
				logPrettyColorOpt = true
				break
			case '--no-log-pretty-color':
				logPrettyColorOpt = false
				break
			case '--log-pretty-single-line':
				logPrettySingleLine = true
				break
			default:
				if (argv[argi].startsWith('-')) {
					printHelp(stderr)
					stderr.write('\n')
					stderr.write(`Unknown option: ${argv[argi]}\n`)
					return 1
				} else {
					cmd = argv[argi++]
				}
		}
		argi++
	}

	const logPrettySync = boolOpt(logPrettySyncOpt)
	if (logPrettySync === undefined) {
		printHelp(stderr)
		stderr.write('\n')
		stderr.write(`Invalid value for --log-sync: ${logPrettySyncOpt}\n`)
		return 1
	}

	const logPrettyColor = boolOpt(logPrettyColorOpt)
	if (logPrettyColor === undefined) {
		printHelp(stderr)
		stderr.write('\n')
		stderr.write(`Invalid value for --log-color: ${logPrettyColorOpt}\n`)
		return 1
	}

	let logger: Logger
	switch (logFormat.trim().toLowerCase()) {
		case 'json':
			logger = pino()
			break;
		case 'pretty':
			logger = pino(prettyFactory({
				sync: logPrettySync,
				colorize: logPrettyColor,
				singleLine: logPrettySingleLine,
			}))
			break;
		default:
			printHelp(stderr)
			stderr.write('\n')
			stderr.write(`Unknown log format: ${logFormat}\n`)
			return 1
	}
	logger.level = logLevel

	if (!cmd) {
		printHelp(stderr)
		stderr.write('\n')
		stderr.write('No command specified\n')
		return 1
	}

	const globalOpts: GlobalOptions = {
		logger,
		argv: argv.slice(argi),
		stderr,
		stdin,
		stdout,
		env,
	}

	let code: number
	try {
		switch (cmd) {
			case 'serve': {
				code = await (await import('./serve.js')).serve(globalOpts)
				break;
			}
			default: {
				printHelp(stderr)
				stderr.write('\n')
				stderr.write(`Unknown command: ${cmd}\n`)
				code = 1
			}
		}
		stdout.write('Hello world\n')
		code = 0
	} catch (err) {
		logger.error({ err }, 'Unhandled error')
		exitAfterDrain = true
		code = 1
	}

	return 0
}

process.exitCode = await main(process.argv.slice(2), process.env)

// Timeout if we take too long to close, possibly due to open resources
setTimeout(function() {
	process.stderr.write(`Process timed out waiting to close, possible memory leak.\n`)
	process.exit(1)
}, 10_000).unref()

// If an IPC channel to a parent is open then close it. Otherwise workers may
// hang open even if they've reached this far and are meant to close so
// the primary can spin up a new worker
process.channel?.unref()

// Wait for stdout and stderr to drain
// Node's IO streams are async in some cases (see link below) so if we process.exit
// before the streams are drained then we may lose some output.
//
// https://nodejs.org/api/process.html#process_a_note_on_process_i_o
const drainStdout = process.stdout.writableNeedDrain
const drainStderr = process.stderr.writableNeedDrain
if (drainStdout || drainStderr) {
	const promises: Promise<void>[] = []
	if (drainStdout) {
		// Wait for stdout to drain
		promises.push(new Promise(function(res, rej) {
			function onDrain() {
				cleanup()
				res()
			}
			function onError(err: Error) {
				cleanup()
				rej(err)
			}
			function cleanup() {
				process.stdout.off('drain', onDrain)
				process.stdout.off('error', onError)
			}
			process.stdout.on('drain', onDrain)
			process.stdout.on('error', onError)
		}))
	}
	if (drainStderr) {
		// Wait for stderr to drain
		promises.push(new Promise(function(res, rej) {
			function onDrain() {
				cleanup()
				res()
			}
			function onError(err: Error) {
				cleanup()
				rej(err)
			}
			function cleanup() {
				process.stderr.off('drain', onDrain)
				process.stderr.off('error', onError)
			}
			process.stderr.on('drain', onDrain)
			process.stderr.on('error', onError)
		}))
	}
	await Promise.all(promises)
}

if (exitAfterDrain) {
	process.exit(process.exitCode)
}

