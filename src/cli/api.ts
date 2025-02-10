import type { Writable } from "node:stream"
import type { ClusterConfig, GlobalOptions, PrometheusConfig } from "../types.js"
import { boolOpt } from "../utils/options.js"
import { getApiClusterConfig, getApiHttpConfig, getApiPrometheusConfig, getStorageConfig, printApiClusterConfig, printApiHttpConfig, printApiPrometheusConfig, printStorageConfig, type ApiHttpConfig, type StorageConfig } from "../env.js"
import { apiCommand } from "../commands/api/command.js"

function printHelp(stream: Writable): void {
	stream.write(`Usage: node [options] api [options]\n`)
	stream.write('\n')
	stream.write('Options:\n')
	stream.write('  -h, --help                     Print this help message\n')
	stream.write('  --[no-]config-check            Check the configuration                       false\n')
	stream.write('  --[no-]standalone              Force the API in standalone mode (not cluster mode)\n')
}

export default async function main(globalOpts: GlobalOptions): Promise<number> {
	const { argv, env, stdout, stderr, logger, shutdownConfig, } = globalOpts

	let configCheckOpt = 'false'
	let standalone: undefined | boolean

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
			case '--config-check':
				configCheckOpt = 'true'
				break
			case '--no-config-check':
				configCheckOpt = 'false'
				break
			case '--standalone':
				standalone = true
				break
			case '--no-standalone':
				standalone = false
				break
			default:
				printHelp(stderr)
				stderr.write('\n')
				stderr.write(`Unknown option: ${argv[argi]}\n`)
				return 1
		}
		argi++
	}

	const checkConfig = boolOpt(configCheckOpt)
	if (checkConfig === undefined) {
		printHelp(stderr)
		stderr.write('\n')
		stderr.write(`Invalid config-check option: ${configCheckOpt}\n`)
		return 1
	}

	let storageConfig: StorageConfig
	try {
		storageConfig = getStorageConfig(env)
	} catch (err) {
		printHelp(stderr)
		stderr.write('\n')
		stderr.write(`Storage settings are misconfigured\n`)
		stderr.write(`${(err as Error).message}\n`)
		return 1
	}

	let apiHttpConfig: ApiHttpConfig
	try {
		apiHttpConfig = getApiHttpConfig(env)
	} catch (err) {
		printHelp(stderr)
		stderr.write('\n')
		stderr.write(`API HTTP settings are misconfigured\n`)
		stderr.write(`${(err as Error).message}\n`)
		return 1
	}

	let apiClusterConfig: ClusterConfig
	try {
		apiClusterConfig = getApiClusterConfig(env, { standalone })
	} catch (err) {
		printHelp(stderr)
		stderr.write('\n')
		stderr.write(`API Cluster settings are misconfigured\n`)
		stderr.write(`${(err as Error).message}\n`)
		return 1
	}

	let apiPrometheusConfig: PrometheusConfig
	try {
		apiPrometheusConfig = getApiPrometheusConfig(env)
	} catch (err) {
		printHelp(stderr)
		stderr.write('\n')
		stderr.write(`API Prometheus settings are misconfigured\n`)
		stderr.write(`${(err as Error).message}\n`)
		return 1
	}

	if (env.PRINT_OPTIONS === undefined || boolOpt(env.PRINT_OPTIONS)) {
		logger.info(`Options:`)
		printStorageConfig('  ', logger, storageConfig)
		printApiClusterConfig('  ', logger, apiClusterConfig)
		printApiHttpConfig('  ', logger, apiHttpConfig)
		printApiPrometheusConfig('  ', logger, apiPrometheusConfig)
	}


	await apiCommand({
		logger,
		checkConfig,
		httpConfig: apiHttpConfig,
		clusterConfig: apiClusterConfig,
		prometheusConfig: apiPrometheusConfig,
		storageConfig,
		shutdownConfig,
	})

	return 0
}

