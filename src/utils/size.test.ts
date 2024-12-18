import { describe, it } from "node:test";
import { strictEqual } from 'node:assert/strict'
import { fmtBytes, parseBytes } from "./size.js";

describe('size', function() {
	describe('parseBytes', function() {
		it('should work', function() {
			strictEqual(parseBytes('0'), 0)
			strictEqual(parseBytes('1'), 1)
			strictEqual(parseBytes('2'), 2)
			strictEqual(parseBytes('13'), 13)
			strictEqual(parseBytes('145'), 145)
			strictEqual(parseBytes('9,145'), 9_145)
			strictEqual(parseBytes('98,145'), 98_145)
			strictEqual(parseBytes('987,145'), 987_145)
			strictEqual(parseBytes('9,876,145'), 9_876_145)
			strictEqual(parseBytes('98,765,145'), 98_765_145)
			strictEqual(parseBytes('987,654,145'), 987_654_145)
			strictEqual(parseBytes('9,876,543,145'), 9_876_543_145)
			strictEqual(parseBytes('98,765,432,145'), 98_765_432_145)

			strictEqual(parseBytes('0b'), 0)
			strictEqual(parseBytes('1b'), 1)
			strictEqual(parseBytes('2b'), 2)
			strictEqual(parseBytes('13b'), 13)
			strictEqual(parseBytes('145b'), 145)
			strictEqual(parseBytes('9,145b'), 9_145)
			strictEqual(parseBytes('98,145b'), 98_145)
			strictEqual(parseBytes('987,145b'), 987_145)
			strictEqual(parseBytes('9,876,145b'), 9_876_145)
			strictEqual(parseBytes('98,765,145b'), 98_765_145)
			strictEqual(parseBytes('987,654,145b'), 987_654_145)
			strictEqual(parseBytes('9,876,543,145b'), 9_876_543_145)
			strictEqual(parseBytes('98,765,432,145b'), 98_765_432_145)

			strictEqual(parseBytes('0kb'), 0)
			strictEqual(parseBytes('1kb'), 1_000)
			strictEqual(parseBytes('2kb'), 2_000)
			strictEqual(parseBytes('13kb'), 13_000)
			strictEqual(parseBytes('145kb'), 145_000)
			strictEqual(parseBytes('9,145kb'), 9_145_000)
			strictEqual(parseBytes('98,145kb'), 98_145_000)
			strictEqual(parseBytes('987,145kb'), 987_145_000)
			strictEqual(parseBytes('9,876,145kb'), 9_876_145_000)
			strictEqual(parseBytes('98,765,145kb'), 98_765_145_000)
			strictEqual(parseBytes('987,654,145kb'), 987_654_145_000)
			strictEqual(parseBytes('9,876,543,145kb'), 9_876_543_145_000)
			strictEqual(parseBytes('98,765,432,145kb'), 98_765_432_145_000)

			strictEqual(parseBytes('0mb'), 0)
			strictEqual(parseBytes('1mb'), 1_000_000)
			strictEqual(parseBytes('2mb'), 2_000_000)
			strictEqual(parseBytes('13mb'), 13_000_000)
			strictEqual(parseBytes('145mb'), 145_000_000)
			strictEqual(parseBytes('9,145mb'), 9_145_000_000)
			strictEqual(parseBytes('98,145mb'), 98_145_000_000)
			strictEqual(parseBytes('987,145mb'), 987_145_000_000)
			strictEqual(parseBytes('9,876,145mb'), 9_876_145_000_000)
			strictEqual(parseBytes('98,765,145mb'), 98_765_145_000_000)
			strictEqual(parseBytes('987,654,145mb'), 987_654_145_000_000)

			strictEqual(parseBytes('0gb'), 0)
			strictEqual(parseBytes('1gb'), 1_000_000_000)
			strictEqual(parseBytes('2gb'), 2_000_000_000)
			strictEqual(parseBytes('13gb'), 13_000_000_000)
			strictEqual(parseBytes('145gb'), 145_000_000_000)
			strictEqual(parseBytes('9,145gb'), 9_145_000_000_000)
			strictEqual(parseBytes('98,145gb'), 98_145_000_000_000)
			strictEqual(parseBytes('987,145gb'), 987_145_000_000_000)

			strictEqual(parseBytes('0tb'), 0)
			strictEqual(parseBytes('1tb'), 1_000_000_000_000)
			strictEqual(parseBytes('2tb'), 2_000_000_000_000)
			strictEqual(parseBytes('13tb'), 13_000_000_000_000)
			strictEqual(parseBytes('145tb'), 145_000_000_000_000)

			strictEqual(parseBytes('0pb'), 0)
			strictEqual(parseBytes('1pb'), 1_000_000_000_000_000)
			strictEqual(parseBytes('2pb'), 2_000_000_000_000_000)

			strictEqual(parseBytes('0eb'), 0)
			// Too large to be represented by JavaScript numbers (IEEE 754 double precision)
			// without losing precision
			// strictEqual(parseBytes('1eb'), 1_000_000_000_000_000_000)
			// strictEqual(parseBytes('2eb'), 2_000_000_000_000_000_000)

			strictEqual(parseBytes('0kib'), 0 * ((1024 / 1000) ** 1))
			strictEqual(parseBytes('1kib'), 1_000 * ((1024 / 1000) ** 1))
			strictEqual(parseBytes('2kib'), 2_000 * ((1024 / 1000) ** 1))
			strictEqual(parseBytes('13kib'), 13_000 * ((1024 / 1000) ** 1))
			strictEqual(parseBytes('145kib'), 145_000 * ((1024 / 1000) ** 1))
			strictEqual(parseBytes('9,145kib'), 9_145_000 * ((1024 / 1000) ** 1))
			strictEqual(parseBytes('98,145kib'), 98_145_000 * ((1024 / 1000) ** 1))
			strictEqual(parseBytes('987,145kib'), 987_145_000 * ((1024 / 1000) ** 1))
			strictEqual(parseBytes('9,876,145kib'), 9_876_145_000 * ((1024 / 1000) ** 1))
			strictEqual(parseBytes('98,765,145kib'), 98_765_145_000 * ((1024 / 1000) ** 1))
			strictEqual(parseBytes('987,654,145kib'), 987_654_145_000 * ((1024 / 1000) ** 1))
			strictEqual(parseBytes('9,876,543,145kib'), 9_876_543_145_000 * ((1024 / 1000) ** 1))
			strictEqual(parseBytes('98,765,432,145kib'), 98_765_432_145_000 * ((1024 / 1000) ** 1))

			strictEqual(parseBytes('0mib'), 0 * ((1024 / 1000) ** 2))
			strictEqual(parseBytes('1mib'), 1_000_000 * ((1024 / 1000) ** 2))
			strictEqual(parseBytes('2mib'), 2_000_000 * ((1024 / 1000) ** 2))
			strictEqual(parseBytes('13mib'), 13_000_000 * ((1024 / 1000) ** 2))
			strictEqual(parseBytes('145mib'), 145_000_000 * ((1024 / 1000) ** 2))
			strictEqual(parseBytes('9,145mib'), 9_145_000_000 * ((1024 / 1000) ** 2))
			strictEqual(parseBytes('98,145mib'), 98_145_000_000 * ((1024 / 1000) ** 2))
			strictEqual(parseBytes('987,145mib'), 987_145_000_000 * ((1024 / 1000) ** 2))
			strictEqual(parseBytes('9,876,145mib'), 9_876_145_000_000 * ((1024 / 1000) ** 2))
			strictEqual(parseBytes('98,765,145mib'), 98_765_145_000_000 * ((1024 / 1000) ** 2))
			strictEqual(parseBytes('987,654,145mib'), 987_654_145_000_000 * ((1024 / 1000) ** 2))

			strictEqual(parseBytes('0gib'), 0 * ((1024 / 1000) ** 3))
			strictEqual(parseBytes('1gib'), 1_000_000_000 * ((1024 / 1000) ** 3))
			strictEqual(parseBytes('2gib'), 2_000_000_000 * ((1024 / 1000) ** 3))
			strictEqual(parseBytes('13gib'), 13_000_000_000 * ((1024 / 1000) ** 3))
			strictEqual(parseBytes('145gib'), 145_000_000_000 * ((1024 / 1000) ** 3))
			strictEqual(parseBytes('9,145gib'), 9_145_000_000_000 * ((1024 / 1000) ** 3))
			strictEqual(parseBytes('98,145gib'), 98_145_000_000_000 * ((1024 / 1000) ** 3))
			// We have to round larger numbers now due to floating point issues
			strictEqual(parseBytes('987,145gib'), Math.round(987_145_000_000_000 * ((1024 / 1000) ** 3)))

			strictEqual(parseBytes('0tib'), 0 * ((1024 / 1000) ** 4))
			strictEqual(parseBytes('1tib'), Math.round(1_000_000_000_000 * ((1024 / 1000) ** 4)))
			strictEqual(parseBytes('2tib'), Math.round(2_000_000_000_000 * ((1024 / 1000) ** 4)))
			strictEqual(parseBytes('13tib'), Math.round(13_000_000_000_000 * ((1024 / 1000) ** 4)))
			strictEqual(parseBytes('145tib'), Math.round(145_000_000_000_000 * ((1024 / 1000) ** 4)))

			strictEqual(parseBytes('0eib'), 0 * ((1024 / 1000) ** 5))
			// Too large to be represented by JavaScript numbers (IEEE 754 double precision)
			// without losing precision
			// strictEqual(parseBytes('1eib'), 1_000_000_000_000_000 * ((1024 / 1000) ** 5))
			// strictEqual(parseBytes('2eib'), 2_000_000_000_000_000 * ((1024 / 1000) ** 5))
		})

		it('should be flexible', function() {
			strictEqual(parseBytes('98,145b'), 98_145)
			strictEqual(parseBytes(' 98,145 b '), 98_145)
			strictEqual(parseBytes('98_145 B '), 98_145)

			strictEqual(parseBytes(' 13\nGIB	\n	'), 13_000_000_000 * ((1024 / 1000) ** 3))
			strictEqual(parseBytes(' 145		gib '), 145_000_000_000 * ((1024 / 1000) ** 3))
			strictEqual(parseBytes(' 9_145	GiB   '), 9_145_000_000_000 * ((1024 / 1000) ** 3))
			strictEqual(parseBytes('	9_145 gIb		'), 9_145_000_000_000 * ((1024 / 1000) ** 3))
		})

		it('should support decimals', function() {
			strictEqual(parseBytes('1.1b'), 1)
			strictEqual(parseBytes('1.1kb'), 1_100)
			strictEqual(parseBytes('1.1mib'), Math.round(1_100_000 * ((1024 / 1000) ** 2)))
			strictEqual(parseBytes('1.1gib'), Math.round(1_100_000_000 * ((1024 / 1000) ** 3)))
			strictEqual(parseBytes('1.1tib'), Math.round(1_100_000_000_000 * ((1024 / 1000) ** 4)))

			strictEqual(parseBytes('2.345kib'), Math.round(2_345 * ((1024 / 1000) ** 1)))
			strictEqual(parseBytes('2.345mib'), Math.round(2_345_000 * ((1024 / 1000) ** 2)))
			strictEqual(parseBytes('2.345gib'), Math.round(2_345_000_000 * ((1024 / 1000) ** 3)))
			strictEqual(parseBytes('2.345tib'), Math.round(2_345_000_000_000 * ((1024 / 1000) ** 4)))

			strictEqual(parseBytes('2.345678kib'), Math.round(2_345.678 * ((1024 / 1000) ** 1)))
			strictEqual(parseBytes('2.345678mib'), Math.round(2_345_678 * ((1024 / 1000) ** 2)))
			strictEqual(parseBytes('2.345678gib'), Math.round(2_345_678_000 * ((1024 / 1000) ** 3)))
			strictEqual(parseBytes('2.345678tib'), Math.round(2_345_678_000_000 * ((1024 / 1000) ** 4)))
		})
	})

	describe('fmtBytes', function() {
		it('should work', function() {
			strictEqual(fmtBytes(0), '0B')
			strictEqual(fmtBytes(1), '1B')
			strictEqual(fmtBytes(12), '12B')
			strictEqual(fmtBytes(134), '134B')
			strictEqual(fmtBytes(1023), '1023B')
			strictEqual(fmtBytes(1024), '1.00KiB')
			strictEqual(fmtBytes(1024 * 1.1), '1.10KiB')
			strictEqual(fmtBytes(1024 * 4.56), '4.56KiB')
			strictEqual(fmtBytes(1024 * 1023), '1023.00KiB')
			strictEqual(fmtBytes(1024 ** 2), '1.00MiB')
			strictEqual(fmtBytes(1024 ** 2 * 1.1), '1.10MiB')
			strictEqual(fmtBytes(1024 ** 2 * 4.56), '4.56MiB')
			strictEqual(fmtBytes(1024 ** 2 * 1023), '1023.00MiB')
			strictEqual(fmtBytes(1024 ** 3), '1.00GiB')
			strictEqual(fmtBytes(1024 ** 3 * 1.1), '1.10GiB')
			strictEqual(fmtBytes(1024 ** 3 * 4.56), '4.56GiB')
			strictEqual(fmtBytes(1024 ** 3 * 1023), '1023.00GiB')
			strictEqual(fmtBytes(1024 ** 4), '1.00TiB')
			strictEqual(fmtBytes(1024 ** 4 * 1.1), '1.10TiB')
			strictEqual(fmtBytes(1024 ** 4 * 4.56), '4.56TiB')
			strictEqual(fmtBytes(1024 ** 4 * 1023), '1023.00TiB')
			strictEqual(fmtBytes(1024 ** 5), '1.00PiB')
			strictEqual(fmtBytes(1024 ** 5 * 1.1), '1.10PiB')
			strictEqual(fmtBytes(1024 ** 5 * 4.56), '4.56PiB')
			strictEqual(fmtBytes(1024 ** 5 * 1023), '1023.00PiB')
			strictEqual(fmtBytes(1024 ** 6), '1.00EiB')
		})
	})

})
