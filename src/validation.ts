import type { Ajv, ValidateFunction } from "ajv"
import type { components } from "./openapi.js"
import type { OpenAPIV3_1 } from "openapi-types"

export type Validators = {
	pubkey: ValidateFunction<components['parameters']['PathPublicKey']>,
	userId: ValidateFunction<components['parameters']['PathUserId']>,
	byteString: ValidateFunction<components['schemas']['ByteString']>,
	createUserBackupRequest: ValidateFunction<components['schemas']['CreateUserBackupRequest']>
}


export function createValidators(opts: {
	openApiDoc: OpenAPIV3_1.Document,
	ajv: Ajv,
}): Validators {
	const {
		openApiDoc,
		ajv,
	} = opts

	if (openApiDoc.components) {
		for (const key in openApiDoc.components.schemas) {
			ajv.addSchema(openApiDoc.components.schemas[key], `#/components/schemas/${key}`)
		}
		for (const key in openApiDoc.components.parameters) {
			ajv.addSchema(openApiDoc.components.parameters[key], `#/components/parameters/${key}`)
		}
		for (const key in openApiDoc.components.requestBodies) {
			ajv.addSchema(openApiDoc.components.requestBodies[key], `#/components/requestBodies/${key}`)
		}
		for (const key in openApiDoc.components.responses) {
			ajv.addSchema(openApiDoc.components.responses[key], `#/components/responses/${key}`)
		}
	}

	const validators: Validators = {
		createUserBackupRequest: ajv.getSchema('#/components/schemas/CreateUserBackupRequest')!,
		pubkey: ajv.getSchema('#/components/schemas/PublicKey')!,
		userId: ajv.getSchema('#/components/schemas/UserId')!,
		byteString: ajv.getSchema('#/components/schemas/ByteString')!,
	}

	// Make sure all the json schemas that we tried to get schemas for actually worked
	const entries = Object.entries(validators)
	for (let i = 0, len = entries.length; i < len; i++) {
		const [key, val] = entries[i]
		if (val == null) {
			throw new Error(`Expected validator for ${key}`)
		}
	}

	return validators
}

