import { describe, it } from "node:test";
import { strictEqual } from "node:assert/strict";
import { parseBytes } from "../utils/bytes.js";
import { getDesiredWorkerCount } from "./cluster.js";

describe('cluster', function() {
	it('getDesiredWorkerCount', function() {
		it('should work', function() {
			strictEqual(getDesiredWorkerCount({
				estimatedMemoryMaxBytes: parseBytes('1gb'),
				memoryReservedBytes: parseBytes('0'),
				estimatedMemoryPrimaryBytes: parseBytes('0'),
				estimatedMemoryWorkerBytes: parseBytes('0'),
				minWorkers: 1,
				maxWorkers: 10,
			}), 10)
			strictEqual(getDesiredWorkerCount({
				estimatedMemoryMaxBytes: parseBytes('1gb'),
				memoryReservedBytes: parseBytes('0'),
				estimatedMemoryPrimaryBytes: parseBytes('1gb'),
				estimatedMemoryWorkerBytes: parseBytes('0'),
				minWorkers: 1,
				maxWorkers: 10,
			}), 10)
			strictEqual(getDesiredWorkerCount({
				estimatedMemoryMaxBytes: parseBytes('1gb'),
				memoryReservedBytes: parseBytes('0'),
				estimatedMemoryPrimaryBytes: parseBytes('800mb'),
				estimatedMemoryWorkerBytes: parseBytes('100mb'),
				minWorkers: 1,
				maxWorkers: 10,
			}), 2)
			strictEqual(getDesiredWorkerCount({
				estimatedMemoryMaxBytes: parseBytes('1gb'),
				memoryReservedBytes: parseBytes('0'),
				estimatedMemoryPrimaryBytes: parseBytes('800mb'),
				estimatedMemoryWorkerBytes: parseBytes('100mb'),
				minWorkers: 5,
				maxWorkers: 10,
			}), 5)
			strictEqual(getDesiredWorkerCount({
				estimatedMemoryMaxBytes: parseBytes('1gb'),
				memoryReservedBytes: parseBytes('0'),
				estimatedMemoryPrimaryBytes: parseBytes('400mb'),
				estimatedMemoryWorkerBytes: parseBytes('100mb'),
				minWorkers: 3,
				maxWorkers: 10,
			}), 6)
			strictEqual(getDesiredWorkerCount({
				estimatedMemoryMaxBytes: parseBytes('1gb'),
				memoryReservedBytes: parseBytes('100mb'),
				estimatedMemoryPrimaryBytes: parseBytes('400mb'),
				estimatedMemoryWorkerBytes: parseBytes('100mb'),
				minWorkers: 3,
				maxWorkers: 10,
			}), 5)
			strictEqual(getDesiredWorkerCount({
				estimatedMemoryMaxBytes: parseBytes('1gb'),
				memoryReservedBytes: parseBytes('200mb'),
				estimatedMemoryPrimaryBytes: parseBytes('400mb'),
				estimatedMemoryWorkerBytes: parseBytes('100mb'),
				minWorkers: 3,
				maxWorkers: 10,
			}), 4)
			strictEqual(getDesiredWorkerCount({
				estimatedMemoryMaxBytes: parseBytes('1gb'),
				memoryReservedBytes: parseBytes('300mb'),
				estimatedMemoryPrimaryBytes: parseBytes('400mb'),
				estimatedMemoryWorkerBytes: parseBytes('100mb'),
				minWorkers: 3,
				maxWorkers: 10,
			}), 3)
			strictEqual(getDesiredWorkerCount({
				estimatedMemoryMaxBytes: parseBytes('1gb'),
				memoryReservedBytes: parseBytes('400mb'),
				estimatedMemoryPrimaryBytes: parseBytes('400mb'),
				estimatedMemoryWorkerBytes: parseBytes('100mb'),
				minWorkers: 3,
				maxWorkers: 10,
			}), 3)
		})
	})
})
