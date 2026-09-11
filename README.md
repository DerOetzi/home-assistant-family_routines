# Family Routines

Home Assistant integration for step-by-step household routines with NFC picture cards and per-room scan points.

> **Status: early development.** The routine logic, the services and the entities work. There is no panel yet, so routines and cards are set up through service calls in the developer tools.

## What it does

A routine is an ordered list of tasks, spread over one or more scan points in the home. A task is checked off by scanning its card at the point where it belongs, so the display always reflects something that actually happened.

Built for kids who cannot read yet: picture cards, wordless icons on a round display, no points, no rewards, no gamification. The data model knows nothing about age, so adult routines fit the same structure.

Each routine carries a time window. The morning routine is shown between four and ten, the evening one in the evening, and each clears its own progress when its window opens. Outside every window the display stays idle.

Routines and tasks can also be limited to certain weekdays. A routine set to Monday through Friday disappears at the weekend; a single task set that way drops out of the ring while the rest of the routine carries on, so Saturday shows four dots where Friday showed six. For a window that runs past midnight, the weekday is the day the window opened, so a routine starting Friday at ten in the evening is still Friday's at one in the morning.

## Concepts

| Term | Meaning |
| --- | --- |
| Person | Someone who takes part in routines, with their own colour and status card. |
| Scan point | A place where cards are scanned. One is the normal case. |
| Routine | A named, ordered list of tasks with a time window and the people it applies to. |
| Task | One step of a routine, with an icon, a word and an order. |
| Card | An NFC tag. Either a task card or a person's status card. |

People and scan points are sub-entries of the integration and therefore admin-only. Routines, tasks and cards live in storage and are meant to be edited without admin rights.

Everyone assigned to a routine shares its task list and keeps their own progress. If someone needs a different list, give them their own routine.

Tasks carry a list of scan points. An empty list means the task can be checked off anywhere, which is what a single-scan-point household wants.

## Display contract

One sensor per scan point carries everything a display needs. Its state is `idle`, `task`, `elsewhere` or `done`, and its attributes are `routine`, `person`, `task`, `glyph`, `label`, `color`, `dots`, `glyphs`, `labels`, `index`, `done_count` and `total`.

`dots` has one character per task in routine order: `x` done, `o` open here, `.` open somewhere else, `!` open at a point already passed on the way here. `glyphs` and `labels` are pipe-separated and follow the same order, so a display can browse the whole routine without asking Home Assistant again.

Icons travel by name. The integration keeps a small catalogue mapping each name to its Material Symbols codepoint and hands the display a finished character, because a display font contains only the characters baked into it. Names outside the catalogue may be given as a raw hex codepoint.

## Services

`scan` and `keepalive` are what a scan point calls. `learn_card`, `complete`, `select_person` and `reset` cover everything else a routine needs. Until the panel exists, `add_routine`, `add_task`, `remove_routine`, `remove_task` and `get_routines` maintain the data; the first two return the new id.

## Hardware

Any NFC reader that can call a service with a tag UID will do. The reference setup uses two M5Stack Dial units running ESPHome, one per floor, which show the routine on a round display and send every scan to `family_routines.scan`.

## Installation

Not published to HACS yet. Add this repository as a custom repository of category *Integration*, or copy `custom_components/family_routines` into your Home Assistant configuration directory.

## Licence

MIT
