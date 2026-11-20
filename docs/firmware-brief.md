# Firmware brief

This is what the board has to do, on one page. The reasons are in the longer notes; this is only the rules.

Everything here can be watched in the emulator at https://wocketfone.github.io/earth-dashboard/. Its timings are still being tuned by eye, so please keep them as settings.

## What does the board fetch?

One small JSON file, under 300 bytes, over HTTPS:

`https://raw.githubusercontent.com/wocketfone/earth-dashboard/main/public/frame-N.json`

`N` is the scale the board is on. It starts at 0 and is kept in flash.

```json
{"v":1,"seq":12,"made":"2026-11-16T14:26:34.683Z","poll":3600,"era":0,"ready":false,"glow":"",
 "d":["488379667","587379665","467376776","555555555"],
 "slow":["000001110","000000000","000000000","000000000"]}
```

- **`d`** is four strings, for buttons 1 to 4. Each has nine characters, one per tube. A character is `1` to `9`, or `-` for a dark tube.
- **`slow`** is four strings in the same layout. A `1` lights that tube's marker lamp on that button.
- **Tube order in every string:** LITHO, OCEAN, ATMOS, CRYO, CHEMO, CYCLO, ANTH, PALIN, SOLAR.
- **`poll`** is how many seconds to wait before fetching again.
- **`seq`** goes up whenever anything changes. If it matches the last one seen for the same scale, there's nothing to do.

## What checks must the file pass?

Use the file only if every one of these holds. If any fails, throw the whole file away and keep showing the last good one.

1. It parses as one JSON object.
2. `v` is exactly 1.
3. `seq` is a whole number, 0 or more.
4. `poll` is a whole number, 60 or more.
5. `made` is a date and time.
6. `era` is a whole number, 0 or more. `ready` is true or false.
7. `glow` is empty, or exactly six hex characters.
8. `d` holds four strings of nine characters, each `1` to `9` or `-`.
9. `slow` holds four strings of nine characters, each `0` or `1`.

Ignore any field not listed here. A failed fetch, a timeout, or any answer other than 200 is treated the same as a bad file.

## What happens on a button press?

Every press of buttons 1 to 4 runs the same sequence on all nine tubes together.

| Step | What the tubes do | Timing |
|---|---|---|
| Sweep up | 0, 1, 2 … 9 | 220 ms a digit |
| Fall back | 8, 7, 6, 5 | 220 ms a digit |
| Idle | Hold at 5 | 2 s |
| Walk out | Each tube steps one digit a beat toward its reading | 700 ms a beat |

- **The marker lamps go out at the press** and come back, for the new button, on the first beat of the walk.
- **A tube whose reading is `-`** sweeps and idles with the rest, then goes dark on the first beat of the walk.
- **A tube never skips a digit** on the walk. The longest walk is four beats.
- **A press during the sweep or the idle** doesn't restart anything. It only changes which button's readings the walk goes to.
- **A press during the walk** starts the whole sequence again from the sweep.
- **0 is never a reading.** It only appears in the sweep and the lamp test.

## What else does it do?

- **New data while resting.** No sweep. Each tube that changed steps one digit a beat, 700 ms a beat, starting at once. The lamps change at once.
- **Sleep.** When the motion sensor says nobody's there, blank every tube and lamp.
- **Wake.** On motion, run the full sequence with a 5 s idle. A button press while asleep does the same, for that button.
- **Lamp test.** Holding any button for 3 s shows 0 to 9 on every tube, 1 s a digit, with the lamps off. Then every tube goes straight back to its reading. It also wakes a sleeping board.
- **Power-up.** Show the last good frame from flash, as for a wake, before WiFi is back.

## How does the reset work?

1. When `ready` is true in the file the board is on, light the lamp by the covered button.
2. If the covered button is pressed while that lamp is lit, add 1 to the stored scale number, fetch `frame-N.json` for the new number, and run the full sequence with a 5 s idle.
3. If the lamp isn't lit, the covered button does nothing.
4. `glow` is the colour for the light at the base of each tube. Empty means off. It's empty on scale 0.

Each scale's file keeps its own `seq`, so `frame-1.json` starts again at 1. Compare `seq` only within one scale. The board never sends anything to the server.

## Which way up do the tubes go?

With 0 at the top. The digits only read upright that way, so 5, which is normal, sits at the bottom. The glow travels clockwise as the digit rises. Nothing in the frame file changes; this is only about how each tube is turned in its socket.

## What can I test against?

**Test files.** Made-up frames at fixed addresses, listed in `public/test/index.json`. Ten must be accepted and fifteen must be rejected. Each entry says what the tubes should show, or why the file is bad. They're served from:

`https://raw.githubusercontent.com/wocketfone/earth-dashboard/main/public/test/`

- `spread.json` puts 1 to 9 across the tubes, which shows every digit and the wiring order.
- `moving.json` changes on the hour, so a board left resting shows the quiet walk with nobody pressing anything. GitHub sometimes runs late, so it can sit for two or three hours and then move several digits at once.
- `reset/frame-0.json` and `reset/frame-1.json` are a lit reset lamp and the scale it leads to.
- `bad/` holds the fifteen files to reject.

The emulator's address box offers all of them, so you can see what each should do.

**Recorded sequences.** `docs/sequences/` holds twelve recordings from the emulator: a press at rest, a wake, a press during each phase, new data at rest, the lamp test, dark tubes, sleep, and the reset. Each gives the frame, the presses, and every change to the nine digits and nine lamps with its time in milliseconds. Times are good to about 20 ms.

## What isn't settled?

- **Losing contact.** We'd like the board to hold its last readings and light all nine lamps when it hasn't fetched for a long time. How long, and how the board judges it, is question 20 in the notes.
- **A dead digit.** If the board can sense a tube failing to strike, we'd like to know. What it does about it isn't decided.
- **Which chip does what.** Whether the Wave or the ESP32 fetches the file is your call. If the digits travel over the serial link, tell us the message format you'd like.
