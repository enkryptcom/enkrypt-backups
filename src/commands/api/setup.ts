import type { Express } from 'express'
import { strictEqual, } from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Ajv, } from 'ajv'
import { parse as parseYaml, stringify as stringifyYaml, } from 'yaml'
import type { OpenAPIV3_1 } from 'openapi-types'
import { createStorage } from '../../storage/factory.js';
import type { Disposer } from '../../utils/disposer.js';
import type { ApiHttpConfig, StorageConfig } from '../../env.js';
import type { Logger } from 'pino';
import type { Server } from 'node:http';
import { createHttpServer } from './server.js';
import { createValidators } from '../../validation.js';
import type { ApiMetrics } from './metrics.js';

// Lazy load
const importRouter = () => import('./router.js')
const importMaintenance = () => import('./maintenance.js')

export type ApiSetupResult = {
	httpServer: Server,
	httpRouter: Express,
}

export async function setup(opts: {
	disposer: Disposer,
	logger: Logger,
	httpConfig: ApiHttpConfig
	storageConfig: StorageConfig
	metrics: undefined | ApiMetrics,
}): Promise<ApiSetupResult> {
	const {
		disposer,
		logger,
		httpConfig,
		storageConfig,
		metrics,
	} = opts

	const {
		maintenanceMode
	} = httpConfig

	const httpServer = createHttpServer({ httpConfig, })

	const appVersion = JSON.parse(await readFile('package.json', 'utf8')).version as string
	strictEqual(typeof appVersion, 'string')

	if (maintenanceMode) {
		const { createHttpMaintenanceRouter, } = await importMaintenance()
		const httpRouter = createHttpMaintenanceRouter({
			disposer,
			metrics,
			logger,
			httpConfig,
			appVersion,
		})

		return {
			httpServer,
			httpRouter,
		}
	} else {
		const openApiyaml = await readFile('openapi.yaml', 'utf8')
		const openApiDoc: OpenAPIV3_1.Document = parseYaml(openApiyaml)
		const ajv = new Ajv({ allErrors: true, removeAdditional: 'all', strict: true, })

		// // OpenAPI is slightly incompatible with JSON schema, add some
		// // vocabulary to avoid errors when we compile the schemas
		// ajv.addVocabulary([
		// 	// OpenAPI root elements
		// 	'parameters',
		// 	'name',
		// 	'in',
		// 	'schema',
		// 	// OpenAPI Request/Response (relative) root element
		// 	'content',
		// ])

		const validators = createValidators({
			openApiDoc,
			ajv,
		})

		const storage = createStorage({
			logger,
			disposer,
			storageConfig,
		})

		const { createHttpAppRouter, } = await importRouter()
		const httpRouter = createHttpAppRouter({
			disposer,
			metrics,
			logger,
			validators,
			openApiDocYaml: stringifyYaml(openApiDoc),
			openApiDoc,
			httpConfig,
			storage,
			appVersion,
		})

		return {
			httpServer,
			httpRouter,
		}
	}
}

