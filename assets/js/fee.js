// Annual advisory fee, from the published schedule (matthewpindoley.com/fee.html).
// Three structures:
//   under $1M   breakpoint: the whole portfolio takes one rate (1.00% / 0.80% from $250K / 0.70% from $500K)
//   $1M–$30M    marginal: first $5M at 0.50%, $5M–$15M at 0.25%, $15M–$30M at 0.175%
//   $30M+       flat: 0.25% on everything
export function calcFee(aum) {
  if (!(aum > 0)) return { fee: 0, structure: 'none', parts: [] };

  if (aum >= 30e6) {
    const fee = aum * 0.0025;
    return { fee, structure: 'flat', parts: [{ label: 'All assets', rate: '0.25%', amount: aum, fee }] };
  }

  if (aum >= 1e6) {
    const bands = [
      { from: 0, to: 5e6, rate: 0.005, label: 'First $5M', display: '0.50%' },
      { from: 5e6, to: 15e6, rate: 0.0025, label: '$5M to $15M', display: '0.25%' },
      { from: 15e6, to: 30e6, rate: 0.00175, label: '$15M to $30M', display: '0.175%' },
    ];
    const parts = [];
    let fee = 0;
    for (const b of bands) {
      const amount = Math.min(aum, b.to) - b.from;
      if (amount <= 0) break;
      const f = amount * b.rate;
      fee += f;
      parts.push({ label: b.label, rate: b.display, amount, fee: f });
    }
    return { fee, structure: 'marginal', parts };
  }

  const [rate, display, label] =
    aum >= 500e3 ? [0.007, '0.70%', 'Whole portfolio, $500K breakpoint'] :
    aum >= 250e3 ? [0.008, '0.80%', 'Whole portfolio, $250K breakpoint'] :
                   [0.01, '1.00%', 'Whole portfolio, under $250K'];
  return { fee: aum * rate, structure: 'breakpoint', parts: [{ label, rate: display, amount: aum, fee: aum * rate }] };
}

// Reads what people type: "750k", "2.5m", "$1,200,000", "3 million". Returns NaN when it cannot.
export function parseAmount(text) {
  const s = String(text).toLowerCase().replace(/[$,\s]/g, '').replace(/million$|mil$|mm$/, 'm').replace(/thousand$/, 'k');
  const m = s.match(/^(\d*\.?\d+)([kmb])?$/);
  if (!m) return NaN;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[m[2]] || 1;
  return Number(m[1]) * mult;
}
