import { strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import { rateOpt } from "./options.js";

describe('options', function() {
	describe('rateOpt', function() {
		it('should work', function() {
			strictEqual(rateOpt('100%'), 1)
			strictEqual(rateOpt('90%'), 0.9)
			strictEqual(rateOpt('90 %'), 0.9)
			strictEqual(rateOpt('0.1'), 0.1)
			strictEqual(rateOpt(0.1), 0.1)
			strictEqual(rateOpt('101%'), undefined)
			strictEqual(rateOpt('-1%'), undefined)
			strictEqual(rateOpt('1.1'), undefined)
			strictEqual(rateOpt('-0.1'), undefined)
			strictEqual(rateOpt(1.1), undefined)
			strictEqual(rateOpt(-0.1), undefined)
			strictEqual(rateOpt('1,0,0%'), 1)
			strictEqual(rateOpt('1_0_0%'), 1)
			strictEqual(rateOpt(' 9_0% '), 0.9)
			strictEqual(rateOpt(' 85    % '), 0.85)
		})
	})
})
