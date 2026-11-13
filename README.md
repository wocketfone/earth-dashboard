# Earth Dashboard

This repository feeds a wall instrument that shows how nine Earth systems compare with normal. The instrument has nine Philips Z550M "Pixie" tubes from the early 1960s. Each tube lights one digit, 1 to 9.

If you've found this because the instrument has stopped updating, start with "What do I do if it stops?" below.

## How do you read the instrument?

- **5 is normal.** Normal is the 2001–2020 value for that system.
- **Above 5 means more of the thing measured. Below 5 means less.** It never means better or worse.
- **1 and 9 mean "this far or further."**
- **A dark tube means there's no reading.**
- **A small lamp beside a tube** means its source reports more slowly than the button you pressed, or has gone quiet.

The nine tubes, in order: LITHO (earthquakes), OCEAN (sea temperature), ATMOS (air temperature), CRYO (sea ice), CHEMO (carbon dioxide), BIO (plant growth), ANTH (world energy use), TECH (data-centre electricity), and SOLAR (sunspots).

The four buttons pick the time window: today, 90 days, a year, and the baseline.

## Where is the file the instrument reads?

https://raw.githubusercontent.com/wocketfone/earth-dashboard/main/public/frame-0.json

The board inside the instrument fetches that address about once an hour. The file is tiny. It holds nine digits for each of the four buttons, and a few flags. `docs/mapping-rules.md` explains how a measurement becomes a digit.

## How does it stay up to date?

A job on GitHub runs every hour. It reads each data source, works out the digits, and saves the file if anything changed. Nobody has to do anything.

| Job | What it does | When |
|---|---|---|
| Build the frame | Reads the sources and publishes the file | Every hour, or by hand |
| Work out the normals | Recalculates "normal" from 2001–2020 | By hand only |
| Probe data sources | Tests each source and writes a report | By hand only |

To run one by hand: open the **Actions** tab, pick the job, and press **Run workflow**.

## What's in here?

- `fetcher/` — the code. `sources.js` lists every data address. `mapping.js` turns values into digits. `build.js` is the hourly job.
- `data/normals-0.json` — what "normal" is for each tube. It's saved here so it survives even if a source's history disappears.
- `public/frame-0.json` — the file the instrument reads.
- `status/latest.json` — the real figures behind the digits, and a note for any tube in trouble. Look here first.
- `data/year-history.csv` — one line a day, used to decide when the scale needs resetting.
- `emulator/` — two web pages that imitate the tubes. Open them in a browser.

## What do I do if it stops?

1. **Open `status/latest.json`.** Each tube says whether its source answered, and why not if it didn't.
2. **Check the Actions tab.** A red cross on "Build the frame" means the job itself failed. Click it to read why.
3. **A source has probably moved.** Agencies change their file addresses every few years. Every address is in `fetcher/sources.js`. Find the new address, change that one line, and run "Probe data sources" to check it.
4. **GitHub pauses scheduled jobs on repositories with no activity for 60 days.** If that's happened, the Actions tab will offer a button to turn it back on.

When one source fails, the others carry on. That tube keeps its last reading and its lamp lights.

To test changes on your own computer, install Node.js and run the three test files in `fetcher/`, for example `node fetcher/mapping.test.js`.

## What isn't finished?

- **BIO and TECH have no data source yet.** Their tubes are dark.
- **The reset isn't built.** The plan is in `docs/mapping-rules.md`. When tubes have been pinned at 1 or 9 for a year, the job should publish `frame-1.json` on a new scale.
- **OCEAN uses a monthly source.** A daily one would be better.

## Who made it?

Atif, with boards by Aaron at oscilloclock.com, and software written with Claude.
