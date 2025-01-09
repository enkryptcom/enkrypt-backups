import type { Ajv, ValidateFunction } from "ajv"
import type { components } from "../../openapi.js"
import { HttpError, HttpStatus } from "../../utils/http.js"
import type { OpenAPIV3_1 } from "openapi-types"

export class HttpValidator<T> {
	private readonly _schemaValidator: ValidateFunction<T>
	constructor(schemaValidator: ValidateFunction<T>) {
		this._schemaValidator = schemaValidator
		if (!this._schemaValidator) {
			throw new Error(`Invalid schemaValidator: ${schemaValidator}`)
		}
	}
	validate(value: unknown): T {
		const ok = this._schemaValidator(value)
		if (!ok) {
			console.log(this._schemaValidator.errors)
			throw new HttpError(HttpStatus.BadRequest,
				{ errors: this._schemaValidator.errors, },
			)
		}
		return value as T
	}
}


export type Validators = {
	pubkeyParameter: HttpValidator<components['parameters']['PublicKey']>,
	userIdParameter: HttpValidator<components['parameters']['UserId']>,
	postUserBackupRequest: HttpValidator<components['schemas']['PostUserBackupRequest']>
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
		postUserBackupRequest: new HttpValidator(ajv.getSchema('#/components/schemas/PostUserBackupRequest')!),
		pubkeyParameter: new HttpValidator(ajv.getSchema('#/components/schemas/PublicKey')!),
		userIdParameter: new HttpValidator(ajv.getSchema('#/components/schemas/UserId')!),
	}

	return validators
}

