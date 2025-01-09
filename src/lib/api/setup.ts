import { strictEqual, } from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Ajv, } from 'ajv'
import { parse as parseYaml, stringify as stringifyYaml, } from 'yaml'
import type { OpenAPIV3_1 } from 'openapi-types'
import { createStorage } from '../../storage/factory.js';
import type { CommandConfig, SetupOptions } from './types.js';
import { createHttpServer } from './http-server.js';
import { createValidators, } from './validation.js';
import { createHttpAppRouter } from './http-app-router.js';
import type { Disposer } from '../../utils/disposer.js';
import { createHttpMaintenanceRouter } from './http-maintenance-router.js';

export async function setup(
	disposer: Disposer,
	opts: SetupOptions,
): Promise<CommandConfig> {
	const {
		logger,
		storageConfig,
		clusterConfig,
		httpConfig,
	} = opts

	const {
		maintenanceMode
	} = httpConfig

	const httpServer = createHttpServer({ httpConfig, })

	const appVersion = JSON.parse(await readFile('package.json', 'utf8')).version as string
	strictEqual(typeof appVersion, 'string')

	if (maintenanceMode) {
		const maintenanceAppRouter = createHttpMaintenanceRouter({
			disposer,
			logger,
			httpConfig,
			appVersion,
		})

		const maintenanceConfig: CommandConfig = {
			httpAppRouter: maintenanceAppRouter,
			httpConfig,
			logger,
			clusterConfig,
			httpServer,
		}

		return maintenanceConfig
	}

	const openApiyaml = await readFile('openapi.yaml', 'utf8')
	const openApiDoc: OpenAPIV3_1.Document = parseYaml(openApiyaml)

	const ajv = new Ajv({
		allErrors: true,
		removeAdditional: 'all',
		strict: true,
	})

	// OpenAPI is slightly incompatible with JSON schema, add some
	// vocabulary to avoid errors when we compile the schemas
	ajv.addVocabulary([
		// OpenAPI root elements
		'parameters',
		'name',
		'in',
		'schema',
		// OpenAPI Request/Response (relative) root element
		'content',
	])

	const validators = createValidators({
		openApiDoc,
		ajv,
	})

	const storage = createStorage({
		logger,
		disposer,
		storageConfig,
	})

	const httpAppRouter = createHttpAppRouter({
		disposer,
		logger,
		validators,
		openApiDocYaml: stringifyYaml(openApiDoc),
		httpConfig,
		storage,
		appVersion,
	})

	const config: CommandConfig = {
		logger,
		httpConfig,
		clusterConfig,
		httpServer,
		httpAppRouter,
	}

	return config
}

