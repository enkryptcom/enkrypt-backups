
export type EnvironmentVariables = {
	TZ?: string

	LOG_LEVEL?: string
	LOG_FORMAT?: string
	LOG_PRETTY_SYNC?: string
	LOG_PRETTY_COLOR?: string
	LOG_PRETTY_SINGLE_LINE?: string

	DEBUG?: string

	/** JSON array of regex for whitelisted CORS origns */
	WHITELIST_ORIGINS?: string

	BIND_ADDR?: string
	BIND_PORT?: string

	STORAGE_DRIVER?: string

	FILESYSTEM_STORAGE_ROOT_DIRPATH?: string

	S3_STORAGE_BUCKET_NAME?: string
	S3_STORAGE_BUCKET_REGION?: string
	S3_STORAGE_BUCKET_ROOT_PATH?: string
}

declare global {
	namespace NodeJS {
		interface ProcessEnv extends EnvironmentVariables { }
	}
}

