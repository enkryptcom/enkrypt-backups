#! /usr/bin/env node

import { type Writable } from "node:stream"
import { pino, type Logger } from 'pino'
import prettyFactory from 'pino-pretty'
import { getShutdownConfig, type EnvironmentVariables } from "./env.js"
import { boolOpt } from "./utils/options.js"
import type { GlobalOptions, ShutdownConfig } from "./types.js"
import { hostname } from "node:os"
import { pid } from "node:process"
import { parseMs } from "./utils/time.js"

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
	stream.write('  --log-format <format>          Log format, JSON or PRETTY                LOG_FORMAT             PRETTY\n')
	stream.write('  --[no-]log-pretty-sync         Force synchronous (slower) logging        LOG_PRETTY_SYNC        false\n')
	stream.write('  --[no-]log-pretty-color        Colorize log output                       LOG_PRETTY_COLOR       true\n')
	stream.write('  --[no-]log-pretty-single-line  Single line log output                    LOG_PRETTY_SINGLE_LINE false\n')
	stream.write('  --alert-throw-level <level>    Throw alerts at this level                ALERT_THROW_LEVEL      (none)\n')
	stream.write('  --countdown <duration>         Grace period before executing command     COUNTDOWN  10s\n')
	stream.write('\n')
	stream.write('Commands\n')
	stream.write('  api       Start the API server\n')
	stream.write('  client    Start an API client (used for testing)\n')
}

function printVersion(stream: Writable): void {
	stream.write('v1.0.0\n')
}

let exitAfterDrain = false
let logJson = false
async function main(mainFile: string, argv: string[], env: EnvironmentVariables): Promise<number> {
	let logLevel = env.LOG_LEVEL || 'info'
	let logFormatOpt = env.LOG_FORMAT || 'PRETTY'
	let logPrettySyncOpt: string | boolean = env.LOG_PRETTY_SYNC || 'false'
	let logPrettyColorOpt: string | boolean = env.LOG_PRETTY_COLOR || 'true'
	let logPrettySingleLineOpt: string | boolean = env.LOG_PRETTY_SINGLE_LINE || 'true'
	let countdownOpt = env.COUNTDOWN || '10s'
	let cmd: undefined | string = env.COMMAND

	let parsedArgs = false
	let argi = 0
	let lastArgIsCommand = false
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
				logFormatOpt = argv[++argi] || logFormatOpt
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
				logPrettySingleLineOpt = true
				break
			case '--countdown':
				countdownOpt = argv[++argi] || countdownOpt
				break
			default:
				if (!argv[argi].startsWith('-')) {
					cmd = argv[argi]
					parsedArgs = true
					lastArgIsCommand = true
				} else {
					printHelp(stderr)
					stderr.write('\n')
					stderr.write(`Unknown option: ${argv[argi]}\n`)
					return 1
				}
		}
		argi++
	}

	const mainArgv = argv.slice(0, lastArgIsCommand ? argi - 1 : argi)

	// Used when we're using clusters / spawning processes so we can use CTRL-C to send
	// SIGINT to the primary process and ignore it in the rest of the process group (the workers).
	// The primary sends SIGTERM instead to the child processes to control their lifecycle.
	// Used in the API's cluster mode, in the "all" command's handling of child processes
	// and in the future probably in the "jobs" command.
	const ignoreSigints = boolOpt(process.env.IGNORE_SIGINTS || 'false')
	if (ignoreSigints === undefined) {
		printHelp(stderr)
		stderr.write('\n')
		stderr.write(`Invalid value for IGNORE_SIGINTS: ${process.env.IGNORE_SIGINTS}\n`)
		return 1
	}

	if (ignoreSigints) {
		process.on('SIGINT', function() {
			logger.trace('Ignoring SIGINT')
		})
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
	switch (logFormatOpt.trim().toLowerCase()) {
		case 'json':
			logJson = true
			logger = pino()
			break;
		case 'pretty': {
			const logPrettySingleLine = boolOpt(logPrettySingleLineOpt)
			if (logPrettySingleLine === undefined) {
				printHelp(stderr)
				stderr.write('\n')
				stderr.write(`Invalid value for --log-single-line: ${logPrettySingleLineOpt}\n`)
				return 1
			}
			logger = pino(prettyFactory({
				sync: logPrettySync,
				colorize: logPrettyColor,
				singleLine: logPrettySingleLine,
			}))
			break;
		}
		default:
			printHelp(stderr)
			stderr.write('\n')
			stderr.write(`Unknown log format: ${logFormatOpt}\n`)
			return 1
	}
	logger.level = logLevel

	let boundName = false
	if (env.LOG_BINDINGS) {
		try {
			const bindings = JSON.parse(env.LOG_BINDINGS)
			logger.setBindings(bindings)
			if (bindings.name) boundName = true
		} catch (err) {
			printHelp(stderr)
			stderr.write('\n')
			stderr.write(`Invalid log bindings: ${String(err)}\n`)
			return 1
		}
	}

	if (!cmd) {
		printHelp(stderr)
		stderr.write('\n')
		stderr.write('No command specified\n')
		return 1
	}

	const countdown = parseMs(countdownOpt)
	if (countdown === undefined) {
		printHelp(stderr)
		stderr.write('\n')
		stderr.write(`Invalid countdown duration: ${countdownOpt}\n`)
		return 1
	}

	let shutdownConfig: ShutdownConfig = getShutdownConfig(env)
	try {
		shutdownConfig = getShutdownConfig(env)
	} catch (err) {
		printHelp(stderr)
		stderr.write('\n')
		stderr.write(`Invalid shutdown options: ${String(err)}\n`)
		return 1
	}

	const globalOpts: GlobalOptions = {
		logger,
		argv: argv.slice(argi),
		stdin,
		stdout,
		stderr,
		nodeBinary: process.execPath,
		nodeArgv: process.execArgv,
		mainFile,
		mainArgv,
		countdown,
		shutdownConfig,
		env,
	}

	let code: number
	try {
		switch (cmd) {
			case 'api': {
				code = await (await import('./cli/api.js')).default(globalOpts)
				break;
			}
			case 'client': {
				code = await (await import('./cli/client.js')).default(globalOpts)
				break;
			}
			default: {
				printHelp(stderr)
				stderr.write('\n')
				stderr.write(`Unknown command: ${cmd}\n`)
				code = 1
			}
		}
	} catch (err) {
		logger.error({ err }, 'Unhandled error')
		exitAfterDrain = true
		code = 1
	}

	return 0
}

process.exitCode = await main(process.argv[1], process.argv.slice(2), process.env)

// Timeout if we take too long to close, possibly due to open resources
setTimeout(function() {
	const msg = "Process timed out waiting to close, possible memory leak."
	if (logJson) {
		const obj = {
			level: 50, // ERROR level
			timestamp: Date.now(),
			pid,
			hostname: hostname(),
			msg,
		}
		process.stderr.write(JSON.stringify(obj) + '\n')
	} else {
		process.stderr.write(msg + '\n')
	}
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
	process.exit()
}

