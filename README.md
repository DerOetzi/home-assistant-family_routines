# Family Routines

Home Assistant integration for step-by-step household routines with NFC picture cards and per-room scan points.

> **Status: early development.** The hub and its sub-entries exist, the routine logic does not. Nothing here is usable yet.

## What it does

A routine is an ordered list of tasks, spread over one or more scan points in the home. Each person has their own list and their own colour. A task is checked off by scanning its card at the point where it belongs, so the display always reflects something that actually happened.

Built for kids who cannot read yet: picture cards, wordless icons on a round display, no points, no rewards, no gamification. The data model knows nothing about age, so adult routines and evening or bathroom routines fit the same structure.

Cards are taught from the panel, not from the log. Everything except creating people and scan points works without admin rights.

## Concepts

| Term | Meaning |
| --- | --- |
| Person | Someone with their own routine, own colour and own status card. |
| Scan point | A place where cards are scanned. One is the normal case. |
| Task | One step of the routine, with an icon, a word and an order. |
| Card | An NFC tag. Either a task card or a person's status card. |

Tasks carry a list of scan points. An empty list means the task can be checked off anywhere. The hub option `tasks_per_station` only decides whether the panel offers the field, never how data is stored, so turning it on or off migrates nothing.

## Hardware

Any NFC reader that can call a service with a tag UID will do. The reference setup uses two M5Stack Dial units running ESPHome, one per floor, which show the routine on a round display and send every scan to `family_routines.scan`.

## Installation

Not published to HACS yet. Add this repository as a custom repository of category *Integration*, or copy `custom_components/family_routines` into your Home Assistant configuration directory.

## Licence

MIT
