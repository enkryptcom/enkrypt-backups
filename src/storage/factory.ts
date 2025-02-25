import fs from 'node:fs/promises';
import { Agent as HttpsAgent } from 'node:https'
import { Agent as HttpAgent, } from 'node:http'
import { StorageDriver, type StorageConfig } from "../env.js";
import type { Disposer } from "../utils/disposer.js";
import type { FileStorage } from "./interface.js";
import { FilesystemStorage } from './filesystem.js';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import type { Logger } from 'pino';
import { S3, type S3ClientConfig } from '@aws-sdk/client-s3';
import { S3Storage } from './s3.js';

export function createStorage(opts: {
	logger: Logger,
	disposer: Disposer,
	storageConfig: StorageConfig,
}): FileStorage {
	const {
		logger,
		disposer,
		storageConfig,
	} = opts

	let storage: FileStorage
	switch (storageConfig.driver) {
		case StorageDriver.FS: {
			const { rootDir, tmpDir, } = storageConfig
			storage = new FilesystemStorage({
				fs,
				rootDirpath: rootDir,
				tmpDirpath: tmpDir,
			})
			break;
		}
		case StorageDriver.S3: {
			const {
				region,
				bucket,
				rootPath,
				reqConnectionTimeoutMs,
				reqRequestTimeoutMs,
				agentKeepAlive,
				agentKeepAliveMs,
				agentMaxSockets,
				agentTimeoutMs,
				agentTcpNodelay,
			} = storageConfig

			const httpsAgent = new HttpsAgent({
				keepAlive: agentKeepAlive,
				keepAliveMsecs: agentKeepAliveMs,
				maxSockets: agentMaxSockets,
				timeout: agentTimeoutMs,
				noDelay: agentTcpNodelay,
			})
			disposer.defer(function() {
				logger.debug('Disposing s3 https agent')
				httpsAgent.destroy()
			})
			const httpAgent = new HttpAgent({
				keepAlive: agentKeepAlive,
				keepAliveMsecs: agentKeepAliveMs,
				maxSockets: agentMaxSockets,
				timeout: agentTimeoutMs,
				noDelay: agentTcpNodelay,
			})
			disposer.defer(function() {
				logger.debug('Disposing s3 http agent')
				httpAgent.destroy()
			})


			const requestHandler = NodeHttpHandler.create({
				connectionTimeout: reqConnectionTimeoutMs,
				requestTimeout: reqRequestTimeoutMs,
				httpsAgent,
				httpAgent,
			})

			const s3params: S3ClientConfig = {}
			if (region) s3params.region = region
			s3params.requestHandler = requestHandler

			const s3 = new S3(s3params)

			storage = new S3Storage({
				bucket,
				s3,
				rootPath,
			})
			break;
		}
		default:
			logger.error(`Invalid storage driver: ${(storageConfig as StorageConfig).driver}`)
			throw new Error(`Invalid storage driver: ${(storageConfig as StorageConfig).driver}`)
	}

	return storage

}

