# The card on the bottom of the box

**Status: draft, parked on 17 November 2026.** Nothing here is final. Come back to it when the instrument is built, because the hardware may change what the card and the start-here page need to say.

The plan is a laser-etched aluminium card fixed to the bottom of the display box. It carries the essentials in plain words, and a QR code that leads to a public start-here page.

## What's in this folder?

- `qr-start-here.svg`: the QR code, for a light surface where the laser leaves a dark mark.
- `qr-start-here-etch-the-background.svg`: the same code drawn the other way round, for dark anodised aluminium where the laser leaves a light mark. The finished code must be dark squares on a light ground. A light-on-dark code failed to read in testing.
- `qr-start-here.png`: a picture of the code, for testing with a phone.

The code leads to `https://wocketfone.github.io/earth-dashboard/start/`. That page is `site/start/index.html` in this repository.

## What does the draft card say?

> **EARTH STATE, CONTINUOUS**
> Nine tubes. Nine measures of the Earth.
>
> **UNPLUG BEFORE TOUCHING A TUBE. HIGH VOLTAGE.**
>
> **To read it:** each tube reads like a dial. The glow at the bottom, on 5, means normal. Further round, toward 9, means more. Back toward 1 means less. A dark tube has no reading.
>
> **To test it:** hold any button for three seconds. Every tube counts 0 to 9.
>
> **The covered button:** press it only when its lamp is lit. It can't be undone.
>
> **If the readings stop:** check the WiFi, then scan the code.
>
> wocketfone.github.io/earth-dashboard/start
> *[QR code]*
>
> Made by Atif, Aaron of Oscilloclock, and Claude. 2026.

## What has to be settled before etching?

- **The card's size.** The text hasn't been fitted to one yet.
- **The maker's line and the year.**
- **Whether the motion sensor is in the build.** The start-here page says the instrument goes dark when nobody's in the room.
- **How to change a tube, and how to rejoin WiFi.** Both sections on the start-here page are marked as coming later. They wait on the hardware.
- **Where the GitHub sign-in is kept.** The page says the family holds it. That has to be true by then. The password is deliberately not on the card or the page: anyone handling the box could scan it, passwords change, and GitHub needs a second sign-in step anyway. Adding family members as owners with their own accounts is the sturdier answer.
- **The address.** If the start-here page ever moves, the QR code has to be made again before etching. Once it's etched, the address must never change.

## What should the etcher know?

- Keep the blank border. The files include a margin four squares wide, and it has to stay empty.
- Size the code at 30 mm or more. It's 41 squares across, so that gives squares of about 0.7 mm.
- Etch the web address in plain letters beside the code, in case QR readers are gone one day.
- The code is at the highest error-correction level. In tests it still read with a worn patch, low contrast, and blur. With three fine scratches it read 17 times in 20; with fourteen heavy ones, 9 in 20.
