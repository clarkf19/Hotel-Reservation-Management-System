/** Money helpers. All amounts are handled in the hotel's base currency (BR-4) and rounded to 2 dp. */
export const toNumber = (v) => (v == null ? 0 : typeof v === 'number' ? v : Number(v.toString()));
export const round2 = (n) => Math.round((toNumber(n) + Number.EPSILON) * 100) / 100;
export const sum = (values) => round2(values.reduce((a, v) => a + toNumber(v), 0));
