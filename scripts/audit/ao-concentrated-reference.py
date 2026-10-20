"""Independent Decimal reference sweep for the illustrative concentrated-range model.

Python's high-precision Decimal square roots are independent of PIT's bigint
integerSquareRoot. This script compares the continuous composition with the
documented Q=1e18 integer approximation, including token-unit floors.
"""
from decimal import Decimal as D, getcontext
from math import isqrt

getcontext().prec = 110
Q = 10**18
price_sets = [
    ("0.000000000001", "0.000000000002"),
    ("0.000001", "0.000002"),
    ("1", "1.00000001"),
    ("1", "4"),
    ("1000000", "1000001"),
    ("100000000000", "100000000001"),
]
decimals = [(6, 6), (6, 18), (18, 6), (18, 18)]
maxima = {key: D(0) for key in ("root_abs", "token0_abs", "token1_abs", "token0_relative", "token1_relative", "value_abs", "value_relative")}
worst_cases = {}
count = 0

for lower, upper in price_sets:
    pa, pb = D(lower), D(upper)
    for p0 in (pa, (pa + pb) / 2, pb):
        for p1 in (pa, (pa + pb) / 2, pb):
            for d0, d1 in decimals:
                prices = (pa, pb, p0, p1)
                roots = [p.sqrt() for p in prices]
                fixed = [isqrt(int(p * Q) * Q) for p in prices]
                a, b, q0, q1 = roots
                af, bf, q0f, q1f = fixed
                if bf - af < 1_000_000_000:
                    continue  # Explicitly unsupported narrow v1 domain.
                u = max(a, min(b, q0))
                uf = max(af, min(bf, q0f))
                budget0 = budget1 = D(1000)
                b0, b1 = int(budget0 * 10**d0), int(budget1 * 10**d1)
                continuous_limits = []
                fixed_limits = []
                if u < b:
                    continuous_limits.append(budget0 / (1 / u - 1 / b))
                if u > a:
                    continuous_limits.append(budget1 / (u - a))
                if uf < bf:
                    fixed_limits.append(b0 * uf * bf // ((bf - uf) * 10**d0))
                if uf > af:
                    fixed_limits.append(b1 * Q * Q // ((uf - af) * 10**d1))
                if not continuous_limits or not fixed_limits:
                    continue
                liquidity = min(continuous_limits)
                liquidity_fixed = min(fixed_limits)
                if liquidity_fixed <= 0 or liquidity_fixed > 10**36:
                    continue
                v = max(a, min(b, q1))
                vf = max(af, min(bf, q1f))
                token0 = liquidity * (1 / v - 1 / b)
                token1 = liquidity * (v - a)
                raw0 = liquidity_fixed * (bf - vf) * 10**d0 // (vf * bf)
                raw1 = liquidity_fixed * (vf - af) * 10**d1 // (Q * Q)
                initial0 = liquidity_fixed * (bf - uf) * 10**d0 // (uf * bf)
                initial1 = liquidity_fixed * (uf - af) * 10**d1 // (Q * Q)
                def resolved(price, q, amount0, amount1):
                    value_raw = amount1 + amount0 * int(price * Q) * 10**d1 // (Q * 10**d0)
                    if value_raw <= 0:
                        return False
                    if q < bf and int(price * Q) * 10**d1 * 10_000 > value_raw * Q * 10**d0:
                        return False
                    if q > af and 10_000 > value_raw:
                        return False
                    return True
                if not resolved(p0, q0f, initial0, initial1) or not resolved(p1, q1f, raw0, raw1):
                    continue
                fixed0 = D(raw0) / 10**d0
                fixed1 = D(raw1) / 10**d1
                true_value = token0 * p1 + token1
                fixed_value = fixed0 * p1 + fixed1
                metrics = {
                    "root_abs": max(abs(D(x) / Q - y) for x, y in zip(fixed, roots)),
                    "token0_abs": abs(fixed0 - token0),
                    "token1_abs": abs(fixed1 - token1),
                    "token0_relative": abs(fixed0 - token0) / token0 if token0 else D(0),
                    "token1_relative": abs(fixed1 - token1) / token1 if token1 else D(0),
                    "value_abs": abs(fixed_value - true_value),
                    "value_relative": abs(fixed_value - true_value) / true_value if true_value else D(0),
                }
                for key, value in metrics.items():
                    if value > maxima[key]:
                        maxima[key] = value
                        worst_cases[key] = (lower, upper, str(p0), str(p1), d0, d1, raw0, raw1)
                count += 1

print(f"Decimal precision: {getcontext().prec} digits; supported sampled cases: {count}")
for key, value in maxima.items():
    print(f"worst observed {key}: {value}; case={worst_cases.get(key)}")
