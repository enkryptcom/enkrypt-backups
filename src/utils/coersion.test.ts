import { describe, it } from "node:test";
import {
	bigintToHex,
	bigintToNumberSafe,
	hexToBigint,
	hexToNumber,
	numberToHex,
	parseHexInt,
	parseUUID,
	stringToBigInt,
} from "./coersion.js";
import { strictEqual, throws, } from "node:assert/strict";

describe('coersion', function() {
	describe('parseUUID', function() {
		it('should work', function() {
			strictEqual(parseUUID('BCb7A20F-41B6-467a-9Da7-b47447A0863b'), 'bcb7a20f-41b6-467a-9da7-b47447a0863b')
			strictEqual(parseUUID('65065834-C595-451f-9439-1Cb8961273ab'), '65065834-c595-451f-9439-1cb8961273ab')
			strictEqual(parseUUID('8Cd633a1-8eC0-484a-AF41-8Bef7f9a89a6'), '8cd633a1-8ec0-484a-af41-8bef7f9a89a6')
			strictEqual(parseUUID('FBa23ea7-F4Ef-4B3f-92ed-70e4d442297f'), 'fba23ea7-f4ef-4b3f-92ed-70e4d442297f')
			strictEqual(parseUUID('60db65eD-5449-4A42-917c-304f9f0bf11f'), '60db65ed-5449-4a42-917c-304f9f0bf11f')
			strictEqual(parseUUID('C8f572b9-B93f-453b-995b-88bda8A7032d'), 'c8f572b9-b93f-453b-995b-88bda8a7032d')
			strictEqual(parseUUID('8F80226E-5aE5-4668-9185-92eee51a9E33'), '8f80226e-5ae5-4668-9185-92eee51a9e33')
			strictEqual(parseUUID('4Edb01bD-7d34-4B74-92de-684ac91ef19a'), '4edb01bd-7d34-4b74-92de-684ac91ef19a')
			strictEqual(parseUUID('48d25dfA-47Fc-4E26-A620-232e82Fcf484'), '48d25dfa-47fc-4e26-a620-232e82fcf484')
			strictEqual(parseUUID('627cB93B-415a-457a-9Ed9-00724eEcf226'), '627cb93b-415a-457a-9ed9-00724eecf226')
			strictEqual(parseUUID('355eF7e4-0dBc-422f-8Ea0-b6407740bD50'), '355ef7e4-0dbc-422f-8ea0-b6407740bd50')
			strictEqual(parseUUID('E20f9599-34Ab-4D67-8Ff2-7D9eacF88505'), 'e20f9599-34ab-4d67-8ff2-7d9eacf88505')
			strictEqual(parseUUID('682f4a08-1b61-4750-B8be-6B72fd1d5B26'), '682f4a08-1b61-4750-b8be-6b72fd1d5b26')
			strictEqual(parseUUID('161846c5-E220-478c-85b7-6681d87beD17'), '161846c5-e220-478c-85b7-6681d87bed17')
			strictEqual(parseUUID('F180B4eB-2aFf-4Ae2-A750-7724cd0d107e'), 'f180b4eb-2aff-4ae2-a750-7724cd0d107e')
			strictEqual(parseUUID('FE4aA4dE-5b06-4080-85f8-8Fe66fA0684d'), 'fe4aa4de-5b06-4080-85f8-8fe66fa0684d')
			strictEqual(parseUUID('7Cc69d9B-F6C4-456a-892d-fFb5728ae6a2'), '7cc69d9b-f6c4-456a-892d-ffb5728ae6a2')
			strictEqual(parseUUID('DCa0A6f9-4874-4705-9A78-44563c1c5326'), 'dca0a6f9-4874-4705-9a78-44563c1c5326')
			strictEqual(parseUUID('B3f7Bb45-9f8a-470e-8Fdd-d6dc30430388'), 'b3f7bb45-9f8a-470e-8fdd-d6dc30430388')
			strictEqual(parseUUID('2Ee07190-5d6f-4548-BB2b-742499B5a875'), '2ee07190-5d6f-4548-bb2b-742499b5a875')
			strictEqual(parseUUID('67bb3ff5-3aE9-497b-97f7-fE06b3408Ff5'), '67bb3ff5-3ae9-497b-97f7-fe06b3408ff5')
			strictEqual(parseUUID('D1e1B233-44Df-4C3f-AA72-55f48904e486'), 'd1e1b233-44df-4c3f-aa72-55f48904e486')
			strictEqual(parseUUID('C0c38ab2-4bD8-402f-A467-a3d9467687b3'), 'c0c38ab2-4bd8-402f-a467-a3d9467687b3')
			strictEqual(parseUUID('18e2567D-E7B9-4F55-9C04-7C17a2562B14'), '18e2567d-e7b9-4f55-9c04-7c17a2562b14')
			strictEqual(parseUUID('9Cd557b3-1509-489f-9B38-b45de60089d4'), '9cd557b3-1509-489f-9b38-b45de60089d4')
			strictEqual(parseUUID('B135D6a2-4c92-4Ab8-A6a5-73fe9260bC6d'), 'b135d6a2-4c92-4ab8-a6a5-73fe9260bc6d')
			strictEqual(parseUUID('61732282-430b-4991-B003-d5ca627a089b'), '61732282-430b-4991-b003-d5ca627a089b')
			strictEqual(parseUUID('76ebDca8-2a00-4455-BB16-b45c23B9b146'), '76ebdca8-2a00-4455-bb16-b45c23b9b146')
			strictEqual(parseUUID('AE5666aC-C110-4Aec-8E64-08e71fCb1D21'), 'ae5666ac-c110-4aec-8e64-08e71fcb1d21')
			strictEqual(parseUUID('CBffBe8B-D1A4-4C5d-BD0b-16f66722fE51'), 'cbffbe8b-d1a4-4c5d-bd0b-16f66722fe51')
			strictEqual(parseUUID('9Fd23b2E-7984-4807-BE6b-052c2b895Bc6'), '9fd23b2e-7984-4807-be6b-052c2b895bc6')
			strictEqual(parseUUID('BC00Fb41-2d9e-4F0e-A54e-eDc934458Cfe'), 'bc00fb41-2d9e-4f0e-a54e-edc934458cfe')
			strictEqual(parseUUID('74beF3c3-6aD4-4F09-A162-7E025d24169b'), '74bef3c3-6ad4-4f09-a162-7e025d24169b')
			strictEqual(parseUUID('41ef3c3D-F922-40c3-9589-0891c8Bf6361'), '41ef3c3d-f922-40c3-9589-0891c8bf6361')
			strictEqual(parseUUID('0Abe32f9-1d66-40d1-BDde-1C9f56B20C07'), '0abe32f9-1d66-40d1-bdde-1c9f56b20c07')
			strictEqual(parseUUID('39842354-F667-4C00-B3f4-a57337C301d3'), '39842354-f667-4c00-b3f4-a57337c301d3')
			strictEqual(parseUUID('EDe006f4-3375-4203-B3ab-d5d4f9E1fF41'), 'ede006f4-3375-4203-b3ab-d5d4f9e1ff41')
			strictEqual(parseUUID('F99e7f31-3953-4746-BC92-bE5d7eA316c5'), 'f99e7f31-3953-4746-bc92-be5d7ea316c5')
			strictEqual(parseUUID('888f0b22-64F6-4827-90f5-fB0bb3C7b852'), '888f0b22-64f6-4827-90f5-fb0bb3c7b852')
			strictEqual(parseUUID('5244D37B-0dE5-487b-9F6f-6366184e8Cf5'), '5244d37b-0de5-487b-9f6f-6366184e8cf5')
		})

		it('should block invalid UUIDs', function() {
			throws(() => parseUUID('BffBe8B-D1A4-4C5d-BD0b-16f66722fE51'))
			throws(() => parseUUID('9Fd23b2E7984-4807-BE6b-052c2b895Bc6'))
			throws(() => parseUUID('BC00Fb41-29e-4F0e-A54e-eDc934458Cfe'))
			throws(() => parseUUID('74beF3c3-6aD4-F09-A162-7E025d24169b'))
			throws(() => parseUUID('41ef3c3D-F922-40c3-589-0891c8Bf6361'))
			throws(() => parseUUID('0Abe32f9-1d66-40d1-BDde-C9f56B20C07'))
			throws(() => parseUUID('39842354-F667-4C00-B3f4a57337C301d3'))
			throws(() => parseUUID('EDe006f4-3375-4203-B3ab-d5d4f9E1fF415'))
			throws(() => parseUUID('F99e7f31-3953-4746-BC922-bE5d7eA316c5'))
			throws(() => parseUUID('888f0b22-64F6-48277-90f5-fB0bb3C7b852'))
			throws(() => parseUUID('5244D37B-0dE55-487b-9F6f-6366184e8Cf5'))
			throws(() => parseUUID('b5244D37B-0dE5-487b-9F6f-6366184e8Cf5'))
		})
	})

	describe('hexToBigint', function() {
		it('should work', function() {
			strictEqual(hexToBigint('0x0'), 0x0n)
			strictEqual(hexToBigint('0x1'), 0x1n)
			strictEqual(hexToBigint('0xffffff'), 0xffffffn)
			strictEqual(hexToBigint('0xfeedbca098765432101234567890abcdef'), 0xfeedbca098765432101234567890abcdefn)

			strictEqual(hexToBigint('-0x0'), -0x0n)
			strictEqual(hexToBigint('-0x1'), -0x1n)
			strictEqual(hexToBigint('-0xffffff'), -0xffffffn)
			strictEqual(hexToBigint('-0xfeedbca098765432101234567890abcdef'), -0xfeedbca098765432101234567890abcdefn)
		})
	})

	describe('hexToNumber', function() {
		it('should work', function() {
			strictEqual(hexToNumber('0x0'), 0x0)
			strictEqual(hexToNumber('0x1'), 0x1)
			strictEqual(hexToNumber('0xffffff'), 0xffffff)

			strictEqual(hexToNumber('-0x0'), -0x0)
			strictEqual(hexToNumber('-0x1'), -0x1)
			strictEqual(hexToNumber('-0xffffff'), -0xffffff)
		})
	})

	describe('stringToBigint', function() {
		it('should work', function() {
			strictEqual(stringToBigInt('0x0'), 0x0n)
			strictEqual(stringToBigInt('0x1'), 0x1n)
			strictEqual(stringToBigInt('0xffffff'), 0xffffffn)
			strictEqual(stringToBigInt('0xfeedbca098765432101234567890abcdef'), 0xfeedbca098765432101234567890abcdefn)
			strictEqual(stringToBigInt('0'), 0n)
			strictEqual(stringToBigInt('1'), 1n)
			strictEqual(stringToBigInt('543212345'), 543212345n)
			strictEqual(stringToBigInt('1234567890987654321'), 1234567890987654321n)

			strictEqual(stringToBigInt('-0x0'), 0x0n)
			strictEqual(stringToBigInt('-0x1'), -0x1n)
			strictEqual(stringToBigInt('-0xffffff'), -0xffffffn)
			strictEqual(stringToBigInt('-0xfeedbca098765432101234567890abcdef'), -0xfeedbca098765432101234567890abcdefn)
			strictEqual(stringToBigInt('-0'), 0n)
			strictEqual(stringToBigInt('-1'), -1n)
			strictEqual(stringToBigInt('-543212345'), -543212345n)
			strictEqual(stringToBigInt('-1234567890987654321'), -1234567890987654321n)
		})
	})

	describe('bigintToHex', function() {
		it('should work', function() {
			strictEqual(bigintToHex(0x0n), '0x0')
			strictEqual(bigintToHex(0x1n), '0x1')
			strictEqual(bigintToHex(0xffffffn), '0xffffff')
			strictEqual(bigintToHex(0xfeedbca098765432101234567890abcdefn), '0xfeedbca098765432101234567890abcdef')

			strictEqual(bigintToHex(-0x0n), '0x0')
			strictEqual(bigintToHex(-0x1n), '-0x1')
			strictEqual(bigintToHex(-0xffffffn), '-0xffffff')
			strictEqual(bigintToHex(-0xfeedbca098765432101234567890abcdefn), '-0xfeedbca098765432101234567890abcdef')
		})
	})

	describe('numberToHex', function() {
		it('should work', function() {
			strictEqual(numberToHex(0x0), '0x0')
			strictEqual(numberToHex(0x1), '0x1')
			strictEqual(numberToHex(0xffffff), '0xffffff')

			strictEqual(numberToHex(-0x0), '0x0')
			strictEqual(numberToHex(-0x1), '-0x1')
			strictEqual(numberToHex(-0xffffff), '-0xffffff')
		})
	})

	describe('bigintToNumberSafe', function() {
		it('should work', function() {
			strictEqual(bigintToNumberSafe(0n), 0)
			strictEqual(bigintToNumberSafe(1n), 1)
			strictEqual(bigintToNumberSafe(123n), 123)
			strictEqual(bigintToNumberSafe(2n ** 53n - 1n), 2 ** 53 - 1)
			throws(() => bigintToNumberSafe(2n ** 53n))
			throws(() => bigintToNumberSafe(2n ** 53n + 1n))
			throws(() => bigintToNumberSafe(2n ** 53n + 2n))

			strictEqual(bigintToNumberSafe(-0n), 0)
			strictEqual(bigintToNumberSafe(-1n), -1)
			strictEqual(bigintToNumberSafe(-123n), -123)
			throws(() => bigintToNumberSafe(-(2n ** 53n)))
			throws(() => bigintToNumberSafe(-(2n ** 53n) - 1n))
			throws(() => bigintToNumberSafe(-(2n ** 53n) - 2n))
		})
	})

	describe('parseHexInt', function() {
		it('should work', function() {
			throws(() => parseHexInt('0x'))
			strictEqual(parseHexInt('0x0'), '0x0')
			strictEqual(parseHexInt('0x1'), '0x1')
			strictEqual(parseHexInt('0x2'), '0x2')
			strictEqual(parseHexInt('0x123'), '0x123')
			strictEqual(parseHexInt('0x123456789'), '0x123456789')
			strictEqual(parseHexInt('0x123456789abcdef'), '0x123456789abcdef')
			strictEqual(parseHexInt('0x123456789AbCdeF'), '0x123456789abcdef')
			strictEqual(parseHexInt('0x123456789ABCDEF'), '0x123456789abcdef')
			strictEqual(parseHexInt('0x123456789ABCDEF987654321'), '0x123456789abcdef987654321')

			throws(() => parseHexInt('-0x'))
			strictEqual(parseHexInt('-0x0'), '0x0')
			strictEqual(parseHexInt('-0x1'), '-0x1')
			strictEqual(parseHexInt('-0x2'), '-0x2')
			strictEqual(parseHexInt('-0x123'), '-0x123')
			strictEqual(parseHexInt('-0x123456789'), '-0x123456789')
			strictEqual(parseHexInt('-0x123456789abcdef'), '-0x123456789abcdef')
			strictEqual(parseHexInt('-0x123456789AbCdeF'), '-0x123456789abcdef')
			strictEqual(parseHexInt('-0x123456789ABCDEF'), '-0x123456789abcdef')
			strictEqual(parseHexInt('-0x123456789ABCDEF987654321'), '-0x123456789abcdef987654321')
		})
	})
})
