import type { Logger } from "pino"

export type LazyDisposable<T> = (disposer: Disposer) => T
export type LazyAsyncDisposable<T> = (disposer: Disposer) => Promise<T>

class SuppressedError extends Error {
	error: unknown
	suppressed: Error
	constructor(error: unknown, suppressed: Error, message: string) {
		super(message)
		this.error = error
		this.suppressed = suppressed
	}
}

const DeferrableType = {
	USE: 0,
	DEFER: 1,
} as const
type DeferrableType = typeof DeferrableType[keyof typeof DeferrableType]

type Defer = () => void
type AsyncDefer = () => Promise<void>

type TaggedDeferrable =
	| { type: typeof DeferrableType.DEFER, deferrable: Defer | AsyncDefer, }
	| { type: typeof DeferrableType.USE, deferrable: Disposable | AsyncDisposable, }

export class Disposer implements AsyncDisposable {
	private readonly _logger?: undefined | Logger
	private readonly _deferrables: TaggedDeferrable[]

	constructor(opts?: { logger?: Logger, }) {
		this._logger = opts?.logger
		this._deferrables = []
	}

	defer(deferrable: Defer | AsyncDefer): void {
		this._deferrables.push({ type: DeferrableType.DEFER, deferrable, })
	}

	use<T extends Disposable | AsyncDisposable>(disposable: T): T {
		this._deferrables.push({ type: DeferrableType.USE, deferrable: disposable, })
		return disposable
	}

	async [Symbol.asyncDispose]() {
		let errors: Error[] = []
		while (this._deferrables.length > 0) {
			try {
				const taggedDeferrable = this._deferrables.pop()!
				switch (taggedDeferrable.type) {
					case DeferrableType.DEFER: {
						await taggedDeferrable.deferrable()
						break;
					}
					case DeferrableType.USE: {
						if (typeof (taggedDeferrable.deferrable as Disposable)[Symbol.dispose] === 'function') {
							(taggedDeferrable.deferrable as Disposable)[Symbol.dispose]()
						}
						if (typeof (taggedDeferrable.deferrable as AsyncDisposable)[Symbol.asyncDispose] === 'function') {
							await (taggedDeferrable.deferrable as AsyncDisposable)[Symbol.asyncDispose]()
						}
						break;
					}
					default: {
						taggedDeferrable satisfies never
						throw new Error(`Unknown deferrable type: ${taggedDeferrable}`)
					}
				}
			} catch (err) {
				this._logger?.error({ err }, 'Error disposing deferrable')
				errors.push(err as Error)
			}
		}
		switch (errors.length) {
			case 0: break;
			case 1: throw errors[0];
			default: {
				let err!: SuppressedError
				for (let i = 1; i < errors.length; i++) {
					err = new SuppressedError(errors[i], errors[0], 'Multiple errors disposing deferrables')
					errors[0] = err
				}
				throw err
			}
		}
	}
}

