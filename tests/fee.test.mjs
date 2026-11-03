// Run: node tests/fee.test.mjs
import assert from 'node:assert/strict';
import { calcFee, parseAmount } from '../assets/js/fee.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 0.01, `${a} != ${b}`);

near(calcFee(0).fee, 0);
near(calcFee(100e3).fee, 1000);          // 1.00%
near(calcFee(249_999).fee, 2499.99);
near(calcFee(250e3).fee, 2000);          // whole portfolio drops to 0.80%
near(calcFee(500e3).fee, 3500);          // 0.70%
near(calcFee(750e3).fee, 5250);
near(calcFee(1e6).fee, 5000);            // marginal: first $5M at 0.50%
near(calcFee(5e6).fee, 25000);
near(calcFee(10e6).fee, 25000 + 12500);  // + $5M at 0.25%
near(calcFee(20e6).fee, 25000 + 25000 + 8750);
near(calcFee(29_999_999).fee, 25000 + 25000 + 14_999_999 * 0.00175);
near(calcFee(30e6).fee, 75000);          // flat 0.25%
near(calcFee(40e6).fee, 100000);
assert.equal(calcFee(-5).structure, 'none');
assert.equal(calcFee(2e6).parts.length, 1);
assert.equal(calcFee(16e6).parts.length, 3);

assert.equal(parseAmount('750k'), 750e3);
assert.equal(parseAmount('2.5m'), 2.5e6);
assert.equal(parseAmount('$1,200,000'), 1.2e6);
assert.equal(parseAmount('3 million'), 3e6);
assert.ok(Number.isNaN(parseAmount('lots')));

console.log('fee: all checks pass');
