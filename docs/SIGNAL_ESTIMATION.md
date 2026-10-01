# Signal estimation

`WeightedRegionEstimator/v1` identifies an **observed strength region**, not a verified transmitter position. Its radius is a conservative display heuristic, not a calibrated confidence interval. A source may lie outside the circle. RSSI is never converted into exact source distance.

## Processing

1. Validate power, coordinates and units. Ignore geographic samples with horizontal accuracy worse than 65 m.
2. Require a single receiver, target, frequency, power unit and provenance.
3. Reject power outliers farther than `max(12 dB, 3 × median absolute deviation)` from the median.
4. Greedily retain positions separated by at least 3 m. Require four positions and a bounding-diagonal span between 12 m and 50 km.
5. Convert nearby fixes into a local tangent approximation. Weight each point by relative power, capped at 24 dB, and reported GPS accuracy: `10^(min(24, power − minimum)/20) / max(5, accuracy)`.
6. Report the weighted center with radius `max(20 m, 2 × mean accuracy, 0.65 × span)`.

| Confidence label | Minimum separated samples | Minimum span | Mean accuracy | Geometry |
| --- | ---: | ---: | ---: | --- |
| High | 40 | 50 m | ≤10 m | Covariance minor/major eigenvalue ratio ≥0.20; power variance ≤100 |
| Medium | 12 | 30 m | ≤20 m | Eigenvalue ratio ≥0.08 |
| Low | 4 | 12 m | ≤65 m | Remaining eligible geometry |

A compass bearing requires at least 12 positions, 30 m span, eigenvalue ratio ≥0.08, power variance ≥4, and a center farther than twice mean accuracy from the latest position. Constant power and straight-line geometry cannot produce a bearing. Bearing means direction toward the estimated observed region; it does not mean BLE antenna direction or a verified line of sight.

## Interpretation

Trees, terrain, walls, transmit-power changes, antenna orientation, multipath and GPS errors all alter the measurements. Moving through more directions improves geometric evidence; a strong reading alone does not. Confidence is a quality label, not a probability, localization guarantee or proximity guarantee. Simulation tests validate deterministic behavior, not physical accuracy.

Native estimates use the last 1,000 samples in the selected domain. Raw readings remain in the session. Exponential smoothing (`alpha = 0.25`) affects the graph only; estimation uses unsmoothed power. The stronger/weaker indicator examines recent smoothed power, not spatial direction.

`dbm`, `dbfs` and relative `db` are different units. Relative values are never relabeled dBm. Calibrated antenna bearings, path-loss models and multi-receiver fusion can replace the current estimator once their calibration and uncertainty are established. Ordinary receiver bearing fields are retained in exports but do not automatically gain calibrated trust.

Tests cover sparse/stationary data, poor GPS, mixed targets/receivers/provenance, flat power, geometry-based confidence, dateline distance, smoothing and deterministic simulation. Live RF accuracy remains an unrun acceptance test; see [verification](VERIFICATION.md).
