import { REPLServer, start, } from 'node:repl'
import type { Writable } from "node:stream"
import type { GlobalOptions } from "../types.js"
import { randomBytes, randomUUID, } from "node:crypto"
import { bufferToByteString, bytesToByteString, byteStringToBuffer, isUUID, } from "../utils/coersion.js"
import { ecsign, hashPersonalMessage, privateToPublic, toRpcSig } from "@ethereumjs/util"
import type { components } from "../openapi.js"

function printHelp(stream: Writable): void {
	stream.write(`Usage: node [options] repl [options]\n`)
	stream.write('\n')
	stream.write('Options:\n')
	stream.write('  -h, --help            Print this help message\n')
	stream.write('  -v, --version         Print the version\n')
	stream.write('  --api-url <url>       API URL                   http://API_HTTP_HOST:API_HTTP_PORT  http://localhost:3000\n')
}

export default async function clientMain(globalOpts: GlobalOptions): Promise<number> {
	const { argv, env, stdin, stdout, stderr, } = globalOpts

	let bindAddr = env.API_HTTP_HOST || 'localhost'
	let bindPortOpt = env.API_HTTP_PORT || '8080'
	let apiUrl = `${bindAddr}:${bindPortOpt}`

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

	if (!/^[a-zA-Z]*:\/\//.test(apiUrl)) {
		// Doesn't start with a protocol? Prepend with http:// or https://
		if (apiUrl.startsWith('localhost') || apiUrl.startsWith('127.0.0.1')) {
			apiUrl = `http://${apiUrl}`
		} else {
			apiUrl = `https://${apiUrl}`
		}
	}

	if (!/https?:\/\//.test(apiUrl)) {
		// Unregocnised protocol
		printHelp(stderr)
		stderr.write('\n')
		stderr.write(`Invalid API URL: ${apiUrl}\n`)
		return 1
	}

	await clientCmd({
		stdin,
		stdout,
		stderr,
		apiUrl,
	})

	return 0
}

type CommandOptions = {
	stdin: NodeJS.ReadableStream,
	stdout: NodeJS.WritableStream,
	stderr: NodeJS.WritableStream,
	apiUrl: string,
}

type ReplState = {
	apiUrl: string,
	repl: REPLServer
	stdin: NodeJS.ReadableStream
	stdout: NodeJS.WritableStream
	stderr: NodeJS.WritableStream
	privkey: Buffer
	pubkey: Uint8Array
	userid: string
}

async function clientCmd(opts: CommandOptions): Promise<void> {
	const {
		stdin,
		stdout,
		stderr,
		apiUrl,
	} = opts

	const repl = start({
		// replMode
		prompt: '> ',
		input: stdin,
		output: stdout,
		completer(line: string) {
			const commands = [
				'.help',
				'.state',
				'.privkey',
				'.pubkey',
				'.userid',
				'.url',
				'.list',
				'.get',
				'.create',
				'.delete',
			]
			const match = commands.filter(c => c.startsWith(line.split(' ')[0]))
			return [match.length ? match : commands, line]
		},
	})

	const privkey = randomBytes(32)
	const pubkey = privateToPublic(privkey)
	const userid = randomUUID()

	const state: ReplState = {
		apiUrl,
		repl,
		privkey,
		stdin,
		stdout,
		stderr,
		pubkey,
		userid,
	}

	repl.context.state = state
	state.repl.setPrompt('')
	state.repl.prompt()
	state.repl.output.write(`Private key: ${bufferToByteString(state.privkey)}\n`)
	state.repl.output.write(`Public key:  ${bytesToByteString(state.pubkey)}\n`)
	state.repl.output.write(`User ID:     ${state.userid}\n`)
	state.repl.output.write(`API URL:     ${state.apiUrl}\n`)
	state.repl.output.write('\n')
	state.repl.output.write('Type .help for a list of commands\n')
	state.repl.output.write('\n')
	state.repl.setPrompt('> ')
	state.repl.prompt()

	repl.defineCommand('help', function() {
		state.repl.setPrompt('')
		state.repl.prompt()
		state.repl.output.write(`.help                            Display this help message\n`)
		state.repl.output.write(`.state                           Display the state\n`)
		state.repl.output.write(`.privkey [PRIVKEY|r[and[om]]]    Display or set the private key\n`)
		state.repl.output.write(`.pubkey                          Display the public key\n`)
		state.repl.output.write(`.userid [USER_ID|r[and[om]]]     Display or set the user id\n`)
		state.repl.output.write(`.url [APIURL]                    Display or set the API URL\n`)
		state.repl.output.write(`.list                            List backups of the pubkey\n`)
		state.repl.output.write(`.get                             Get the backup of the pubkey and userid\n`)
		state.repl.output.write(`.create DATA                     Create a new backup or override an existing backup for the pubkey and userid\n`)
		state.repl.output.write(`.delete                          Delete the backup of the pubkey and userid, if it exists\n`)
		state.repl.setPrompt('> ')
		state.repl.prompt()
	})

	repl.defineCommand('state', function() {
		state.repl.setPrompt('')
		state.repl.prompt()
		state.repl.output.write(`Private key: ${bufferToByteString(state.privkey)}\n`)
		state.repl.output.write(`Public key:  ${bytesToByteString(state.pubkey)}\n`)
		state.repl.output.write(`User ID:     ${state.userid}\n`)
		state.repl.output.write(`API URL:     ${state.apiUrl}\n`)
		state.repl.setPrompt('> ')
		state.repl.prompt()
	})

	repl.defineCommand('url', function(_text) {
		state.repl.setPrompt('')
		state.repl.prompt()
		const text = _text.trim()
		if (!text) {
			state.repl.output.write(`API URL: ${state.apiUrl}\n`)
		} else {
			if (setApiUrl(state, text)) {
				state.repl.output.write(`API URL: ${state.apiUrl}\n`)
			} else {
				state.repl.output.write(`Usage: .api [API_URL]\n`)
			}
		}
		state.repl.setPrompt('> ')
		state.repl.prompt()
	})

	repl.defineCommand('privkey', function(_text) {
		state.repl.setPrompt('')
		state.repl.prompt()
		const text = _text.trim()
		if (!text) {
			state.repl.output.write(`Private key: ${bufferToByteString(state.privkey)}\n`)
		} else {
			let newPrivkey: string
			if (/^r(and(om)?)?$/i.test(_text)) {
				newPrivkey = bufferToByteString(randomBytes(32))
			} else {
				newPrivkey = text
			}
			if (setPrivateKey(state, newPrivkey)) {
				state.repl.output.write(`Private key: ${bufferToByteString(state.privkey)}\n`)
				state.repl.output.write(`Public key:  ${bytesToByteString(state.pubkey)}\n`)
			} else {
				state.repl.output.write(`Usage: .privkey [PRIVATE_KEY|r[and[om]]]\n`)
			}
		}
		state.repl.setPrompt('> ')
		state.repl.prompt()
	})

	repl.defineCommand('pubkey', function() {
		state.repl.setPrompt('')
		state.repl.prompt()
		state.repl.output.write(`Public key: ${bytesToByteString(state.pubkey)}\n`)
		state.repl.setPrompt('> ')
		state.repl.prompt()
	})

	repl.defineCommand('userid', function(_text) {
		state.repl.setPrompt('')
		state.repl.prompt()
		const text = _text.trim()
		if (!text) {
			state.repl.output.write(`User ID: ${state.userid}\n`)
		} else {
			let newUserId: string
			if (/^r(and(om)?)?$/i.test(_text)) {
				newUserId = randomUUID()
			} else {
				newUserId = text
			}
			if (setUserId(state, newUserId)) {
				state.repl.output.write(`User ID: ${state.userid}\n`)
			} else {
				state.repl.output.write(`Usage: .userid [USER_ID|r[and[om]]]\n`)
			}
		}
		state.repl.setPrompt('> ')
		state.repl.prompt()
	})

	repl.defineCommand('list', async function() {
		state.repl.setPrompt('')
		state.repl.prompt()
		await listBackups(state)
		state.repl.setPrompt('> ')
		state.repl.prompt()
	})

	repl.defineCommand('get', async function() {
		state.repl.setPrompt('')
		state.repl.prompt()
		await getBackup(state)
		state.repl.setPrompt('> ')
		state.repl.prompt()
	})

	repl.defineCommand('create', async function(text) {
		state.repl.setPrompt('')
		state.repl.prompt()
		const textTrimmed = text.trim()
		if (!textTrimmed) {
			state.repl.output.write(`Usage: .create DATA\n`)
		} else {
			await createBackup(state, textTrimmed)
		}
		state.repl.setPrompt('> ')
		state.repl.prompt()
	})

	repl.defineCommand('delete', async function() {
		state.repl.setPrompt('')
		state.repl.prompt()
		await deleteBackup(state)
		state.repl.setPrompt('> ')
		state.repl.prompt()
	})

	return new Promise(res => repl.on('exit', res))
}


function setApiUrl(state: ReplState, newApiUrl: string): boolean {
	let apiUrl: string = newApiUrl.trim()
	if (!/^[a-zA-Z]*:\/\//.test(apiUrl)) {
		// Doesn't start with a protocol? Prepend with http:// or https://
		if (apiUrl.startsWith('localhost') || apiUrl.startsWith('127.0.0.1')) {
			apiUrl = `http://${apiUrl}`
		} else {
			apiUrl = `https://${apiUrl}`
		}
	}
	state.apiUrl = apiUrl
	return true
}

function setPrivateKey(state: ReplState, newPrivkeyInput: string): boolean {
	const newPrivkeyByteString = newPrivkeyInput.trim().toLowerCase()
	if (!/0x([0-9a-f]{2})+/.test(newPrivkeyByteString)) {
		state.repl.output.write('Invalid private key\n')
		return false
	}
	try {
		const newPrivkeyBuf = byteStringToBuffer(newPrivkeyByteString)
		const newPubkeyBytes = privateToPublic(newPrivkeyBuf)
		state.privkey = newPrivkeyBuf
		state.pubkey = newPubkeyBytes
		return true
	} catch (err) {
		state.repl.output.write(`Invalid private key: ${String(err as Error)}\n`)
		return false
	}
}

function setUserId(state: ReplState, newUserIdInput: string): boolean {
	const newUserId = newUserIdInput.trim().toLowerCase()
	if (!isUUID(newUserId)) {
		state.repl.output.write('Invalid user ID\n')
		return false
	}
	state.userid = newUserId
	return true
}

async function createBackup(state: ReplState, input: string): Promise<boolean> {
	const payloadBuf = Buffer.from(input, 'utf8')
	const payload = bufferToByteString(payloadBuf)
	const msgHash = hashPersonalMessage(payloadBuf)
	const ecsig = ecsign(msgHash, state.privkey)
	const sig = toRpcSig(ecsig.v, ecsig.r, ecsig.s)
	const body: components['schemas']['CreateUserBackupRequest'] = { payload, }
	const url = `${state.apiUrl}/backups/${bytesToByteString(state.pubkey)}/users/${state.userid}?signature=${sig}`
	try {
		state.repl.output.write(`${url}\n`)
		const res = await fetch(url, {
			keepalive: true,
			method: 'POST',
			headers: [
				['Accept', 'application/json'],
				['Content-Type', 'application/json'],
			],
			signal: AbortSignal.timeout(5_000),
			body: JSON.stringify(body),
		})
		if (!res.ok) {
			let emsg = await res.text().catch((err) => `Failed to read response text: ${String(err)}`)
			const emsglen = emsg.length
			if (emsglen > 512 + 10 + emsglen.toString().length) emsg = `${emsg.slice(0, 512)}... (512/${emsglen})`
			throw new Error(`Server responded with ${res.status} ${res.statusText}: ${emsg}`)
		}
		const json = await res.json() as components['schemas']['PostUserBackupResponse']
		state.repl.output.write(`Backup created: ${json.message}\n`)
		return true
	} catch (err) {
		state.repl.output.write(`Error creating backup: ${String(err)}\n`)
		return false
	}
}

async function deleteBackup(state: ReplState): Promise<boolean> {
	const now = new Date()
	const ymd = `${(now.getUTCMonth() + 1).toString().padStart(2, '0')}-${now.getUTCDate().toString().padStart(2, '0')}-${now.getUTCFullYear()}`
	const msg = `${state.userid}-DELETE-BACKUP-${ymd}`
	const msgHash = hashPersonalMessage(Buffer.from(msg, 'utf8'))
	const ecsig = ecsign(msgHash, state.privkey)
	const sig = toRpcSig(ecsig.v, ecsig.r, ecsig.s)
	const url = `${state.apiUrl}/backups/${bytesToByteString(state.pubkey)}/users/${state.userid}?signature=${sig}`
	try {
		state.repl.output.write(`${url}\n`)
		const res = await fetch(url, {
			keepalive: true,
			method: 'DELETE',
			headers: [['Accept', 'application/json']],
			signal: AbortSignal.timeout(5_000),
		})
		if (!res.ok) {
			let emsg = await res.text().catch((err) => `Failed to read response text: ${String(err)}`)
			const emsglen = emsg.length
			if (emsglen > 512 + 10 + emsglen.toString().length) emsg = `${emsg.slice(0, 512)}... (512/${emsglen})`
			throw new Error(`Server responded with ${res.status} ${res.statusText}: ${emsg}`)
		}
		const json = await res.json() as components['schemas']['DeleteUserBackupResponse']
		state.repl.output.write(`Backup deleted: ${json.message}\n`)
		return true
	} catch (err) {
		state.repl.output.write(`Error deleting backup: ${String(err)}\n`)
		return false
	}
}

async function listBackups(state: ReplState): Promise<boolean> {
	const now = new Date()
	const ymd = `${(now.getUTCMonth() + 1).toString().padStart(2, '0')}-${now.getUTCDate().toString().padStart(2, '0')}-${now.getUTCFullYear()}`
	const msg = `${bytesToByteString(state.pubkey)}-GET-BACKUPS-${ymd}`
	const msgHash = hashPersonalMessage(Buffer.from(msg, 'utf8'))
	const ecsig = ecsign(msgHash, state.privkey)
	const sig = toRpcSig(ecsig.v, ecsig.r, ecsig.s)
	const url = `${state.apiUrl}/backups/${bytesToByteString(state.pubkey)}?signature=${sig}`
	try {
		state.repl.output.write(`${url}\n`)
		const res = await fetch(url, {
			keepalive: true,
			method: 'GET',
			headers: [['Accept', 'application/json']],
			signal: AbortSignal.timeout(5_000),
		})
		if (!res.ok) {
			let emsg = await res.text().catch((err) => `Failed to read response text: ${String(err)}`)
			const emsglen = emsg.length
			if (emsglen > 512 + 10 + emsglen.toString().length) emsg = `${emsg.slice(0, 512)}... (512/${emsglen})`
			throw new Error(`Server responded with ${res.status} ${res.statusText}: ${emsg}`)
		}
		const json = await res.json() as components['schemas']['GetUserBackupsResponse']
		const backups = json.backups
		const len = backups.length
		if (len === 0) {
			state.repl.output.write(`No backups found\n`)
		} else {
			for (let i = 0; i < len; i++) {
				const backup = backups[i]
				const { userId, updatedAt, } = backup
				state.repl.output.write(`Backup ${i}. ${updatedAt} ${userId}\n`)
			}
		}
		return true
	} catch (err) {
		state.repl.output.write(`Error getting backups: ${String(err)} \n`)
		return false
	}
}

async function getBackup(state: ReplState): Promise<boolean> {
	const now = new Date()
	const ymd = `${(now.getUTCMonth() + 1).toString().padStart(2, '0')}-${now.getUTCDate().toString().padStart(2, '0')}-${now.getUTCFullYear()}`
	const msg = `${bytesToByteString(state.pubkey)}-GET-BACKUP-${ymd}`
	const msgHash = hashPersonalMessage(Buffer.from(msg, 'utf8'))
	const ecsig = ecsign(msgHash, state.privkey)
	const sig = toRpcSig(ecsig.v, ecsig.r, ecsig.s)
	const url = `${state.apiUrl}/backups/${bytesToByteString(state.pubkey)}/users/${state.userid}?signature=${sig}`
	try {
		state.repl.output.write(`${url}\n`)
		const res = await fetch(url, {
			keepalive: true,
			method: 'GET',
			headers: [['Accept', 'application/json']],
			signal: AbortSignal.timeout(5_000),
		})
		if (res.status === 404) {
			const text = await res.text()
			state.repl.output.write(`Backup not found: ${text}\n`)
			return false
		}
		if (!res.ok) {
			let emsg = await res.text().catch((err) => `Failed to read response text: ${String(err)}`)
			const emsglen = emsg.length
			if (emsglen > 512 + 10 + emsglen.toString().length) emsg = `${emsg.slice(0, 512)}... (512/${emsglen})`
			throw new Error(`Server responded with ${res.status} ${res.statusText}: ${emsg}`)
		}
		const json = await res.json() as components['schemas']['GetUserBackupResponse']
		const backup = json.backup
		const { updatedAt, payload, userId, } = backup
		const raw = byteStringToBuffer(payload).toString('utf8')
		state.repl.output.write(`Backup ${updatedAt} ${userId}: ${raw}\n`)
		return true
	} catch (err) {
		state.repl.output.write(`Error getting backups: ${String(err)} \n`)
		return false
	}
}

