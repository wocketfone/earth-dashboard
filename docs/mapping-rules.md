# Earth Dashboard: Mapping Rules

Version 1, 12 November 2026. This is how a measurement becomes a digit on a tube. The code is in `claude/fetcher/mapping.js`, with its tests beside it.

## What does a digit mean?

- **5 is normal.** Normal is the 2001–2020 value for that tube, until a reset.
- **Each digit away from 5 is one step.** A step is a fixed amount, set per tube.
- **Right of 5 means more of the thing measured. Left means less.** It never means better or worse. Warming tubes lean right; ice leans left.
- **1 and 9 mean "this far or further."**
- **0 is never a reading.**
- **A dash in the file means no reading at all.** The tube is dark.

## How is the digit worked out?

1. Take the value for the button's window: today, the last 90 days, or the last year.
2. Work out how many steps it sits from normal: (value − normal) ÷ step. Some tubes are measured on a curved scale first (see the table).
3. Round to the nearest whole step. Exact halves round up, toward "more."
4. Add 5, then limit the result to 1 through 9.
5. Apply the deadband.

## What is the deadband?

A tube keeps its digit until the value is clearly past the line. "Clearly" means 15% of a step beyond the boundary. Without this, a value sitting on a boundary would flip the tube back and forth every day. CRYO was sitting at 2.51 when we checked, right on the line between 2 and 3.

The first time a tube is read, there's no previous digit, so plain rounding applies.

## What are the rules for each tube?

| Tube | Measures | Scale | Normal (5) | One step | Counts toward a reset |
|---|---|---|---|---|---|
| LITHO | Earthquake energy in the window | Curved (each step is a fixed ratio) | The typical window of that length, 2001–2020 | Set from the data | No |
| OCEAN | Sea surface temperature | Straight | 2001–2020 average | 0.2 °C | Yes |
| ATMOS | Surface air temperature | Straight | 2001–2020 average | 0.2 °C | Yes |
| CRYO | Sea ice, Arctic and Antarctic averaged | Straight | Both poles at their usual extent for the date | 0.75 standard deviations | Yes |
| CHEMO | Carbon dioxide | Straight | 390.6 ppm | 20 ppm | Yes |
| BIO | Plant growth per year | Straight | Typical year, 2001–2020 | Set from the data | No |
| ANTH | World energy use per year | Straight | 2001–2020 average | Not set yet | Yes |
| TECH | Data-centre electricity per year | Curved (each step is ×1.25) | Its 2025 level | ×1.25 | Yes |
| SOLAR | Sunspot number | Curved (square root) | 56.9 | 1.5 on the square-root scale | No |

On the SOLAR curve, a spotless sun reads 1, an average sun reads 5, and about 200 spots reads 9. All nine digits can light.

## How are "set from the data" steps chosen?

For the steady tubes (LITHO and BIO), the fetcher looks at every window of the same length across 2001–2020. Normal is the middle value. The step is sized so the middle 90% of those windows covers digits 2 through 8. That makes 1 and 9 rare.

LITHO gets this separately for each button. A day is compared with typical days, 90 days with typical 90-day stretches, and a year with typical years. Comparing one day with a scaled-down year doesn't work, because a year's energy is dominated by a few giant earthquakes.

## What does each button show?

- **Button 1, Today:** the freshest figure the source has.
- **Button 2, 90 days:** the average over the last 90 days.
- **Button 3, Year:** the average over the last 365 days.
- **Button 4, Baseline:** nine 5s. After a reset, it shows where the old normal sits on the new scale.

If a source reports more slowly than the button's window, the tube shows the source's latest figure and its marker lamp lights.

## When does a reset happen?

The fetcher decides, with no person involved.

- **The trigger.** Three or more of the counting tubes have each sat at 1 or 9 on the Year button for 365 days in a row.
- **Steady tubes don't count.** A quiet sun reads 1 for a year or more at every solar minimum. That's the sun's rhythm, not the planet leaving its scale.
- **The new normal.** For every tube, it's the average of the ten years ending on the trigger day. It's then frozen.
- **Steps don't change.** That keeps the old and new scales comparable.
- **A new file appears.** The original scale stays at `frame-0.json`. The new one is published at `frame-1.json`, and so on for later resets.
- **The lamp lights.** The current file's `ready` flag turns true, which lights the lamp by the covered button.
- **Someone presses the button.** The board moves to the new file. Nothing changes on the tubes until that press.

## What was tested?

The mapping code has about 1,260 checks. They cover rounding at every boundary, the pins, the deadband in both directions, a value wobbling on a line, slow ramps through all nine digits, the SOLAR curve, the reset rule, and the old-normal reading for button 4. The first-pass readings for OCEAN, ATMOS, CHEMO, and CRYO reproduce exactly.

## What isn't settled?

- LITHO, BIO, and ANTH have no numbers yet. They need the real data, which the fetcher will pull.
- TECH's 2025 level isn't fixed yet.
- OCEAN and ATMOS were checked against stand-in series from NOAA. They'll be recalculated against the intended sources.
