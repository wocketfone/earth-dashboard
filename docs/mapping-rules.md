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
| OCEAN | Sea surface temperature | Straight | Two questions; see below | 0.3 °C on Year; 0.15 °C on Today and 90 days | Yes |
| ATMOS | Surface air temperature | Straight | Two questions; see below | 0.3 °C on Year; 0.15 °C on Today and 90 days | Yes |
| CRYO | Sea ice, Arctic and Antarctic averaged | Straight | Both poles at their usual extent for the date | 0.75 standard deviations | Yes |
| CHEMO | Carbon dioxide | Straight | 390.6 ppm | 20 ppm | Yes |
| CYCLO | El Niño and La Niña index (Niño 3.4) | Straight, whole steps | A neutral Pacific | 0.5 °C | No |
| ANTH | World energy use per year | Straight | 140,822 TWh | 21,123 TWh (15%) | Yes |
| PALIN | Renewable share of world electricity | Straight | 20.95% | 6 percentage points | No |
| SOLAR | Sunspot number | Curved (square root) | 56.9 | 1.5 on the square-root scale | No |

On the SOLAR curve, a spotless sun reads 1, an average sun reads 5, and about 200 spots reads 9. All nine digits can light.

OCEAN and ATMOS ask two questions, because their long climb would otherwise leave them stuck near 9.

- **Year** compares the last twelve months with the 2001–2020 average, at 0.3 °C a step. This is the long story, and it's the only one of the two that counts toward a reset.
- **Today and 90 days** compare the latest month, or the latest three, with the same months of the last ten years, at 0.15 °C a step. On these buttons, 5 means typical for the recent decade. They rise in an El Niño and fall in a La Niña.

Because the planet is warming, an ordinary year sits a little above the average of the ten before it. So on Today and 90 days these two tubes will tend to rest around 6, not 5.

CYCLO changes digit when the index crosses a whole step, not half of one. That lines its digits up with the official strengths: 5 is neutral, 6 is a weak El Niño (0.5 °C), 7 is moderate (1.0), 8 is strong (1.5), and 9 is very strong (2.0 or more). La Niña mirrors that on the left.

PALIN is the one tube where leaning right is good news. It doesn't count toward a reset for that reason.

## How are "set from the data" steps chosen?

For LITHO, the fetcher looks at every window of the same length across 2001–2020. Normal is the middle value. The step is sized so the middle 90% of those windows covers digits 2 through 8. That makes 1 and 9 rare.

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

The fetcher does all of this itself, inside the hourly job. Nobody has to run anything.

- **Every scale keeps publishing.** After a reset, `frame-0.json` and `frame-1.json` are both updated every hour. A board that nobody has pressed the button on still gets readings.
- **Each new scale has a colour.** `frame-1.json` carries `"glow": "7A5CFF"`. Later scales use `3D7BFF`, then `C04DFF`, then round again. These are placeholders until the colours are chosen.
- **Button 4 remembers.** On a new scale, button 4 shows where each tube's old normal sits. It's worked out once and saved with the new normal.
- **Gaps don't matter.** A day with no reading neither counts toward the year nor breaks it. A tube needs at least 300 readings in the 365 days to count as pinned.
- **A failing source can't block it for ever.** If a tube's new normal can't be worked out, the fetcher waits and tries again each hour. After 48 tries it goes ahead, and that tube keeps its old normal. If the source was already dead, it doesn't wait at all.
- **Later resets work the same way.** Only the newest scale is watched. When it runs out of room too, `frame-2.json` appears, and the lamp lights on every older file.
- **For ice, the spread stays.** CRYO's step is measured in spreads for the calendar day. A reset moves the usual extent and keeps the old spread, so the step doesn't change.
- **CYCLO doesn't move.** Its source already reports the difference from a neutral Pacific.

The files a reset adds are `data/normals-1.json`, `public/frame-1.json`, `status/latest-1.json`, and `data/year-history-1.csv`.

## What was tested?

The mapping code has about 15,000 checks. They cover rounding at every boundary, the pins, the deadband in both directions, a value wobbling on a line, slow ramps through all nine digits, the SOLAR curve, the reset rule, and the old-normal reading for button 4. The first-pass readings for OCEAN, ATMOS, CHEMO, and CRYO reproduce exactly.

A second suite runs the whole fetcher with no network, on made-up source files whose answers can be worked out by hand. It has 113 checks. They cover failed and stale sources, the deadband between runs, and the reset from start to finish: the day before it's due, the day it runs, the frozen normal, a source that fails during it, and a second reset years later.

## What isn't settled?

- OCEAN uses a monthly source. A daily one would be better.
