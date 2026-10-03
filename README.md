# Family Routines

Home Assistant integration for step-by-step household routines with NFC picture cards and per-room scan points.

> **Status: early development.** The routine logic, the services, the entities and the panel work.

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

People and scan points are sub-entries of the integration and therefore admin-only. Routines, tasks and cards live in storage and are edited in the panel, which needs no admin rights.

Everyone assigned to a routine shares its task list and keeps their own progress. If someone needs a different list, give them their own routine.

Tasks carry a list of scan points. An empty list means the task can be checked off anywhere, which is what a single-scan-point household wants.

## Display contract

One sensor per scan point carries everything a display needs. Its state is `idle`, `task`, `elsewhere` or `done`, and its attributes are `routine`, `person`, `task`, `glyph`, `label`, `color`, `dots`, `glyphs`, `labels`, `index`, `done_count`, `total` and `last_scan`.

`dots` has one character per task in routine order: `x` done, `o` open here, `.` open somewhere else, `!` open at a point already passed on the way here. `glyphs` and `labels` are pipe-separated and follow the same order, so a display can browse the whole routine without asking Home Assistant again.

`last_scan` tells the display what the most recent card at this scan point did, so it can answer with the right sound. It reads `<sequence>:<result>`, where the result is `done`, `repeat`, `person`, `wrong_place`, `learned` or `unknown`. The sequence grows with every scan, which lets a display tell a new scan from an update that merely repeats the old result.

Icons travel by name. The integration keeps a catalogue mapping each name to its Material Symbols codepoint and hands the display a finished character, because a display font contains only the characters baked into it. The catalogue holds exactly the 45 glyphs of the reference firmware font: 40 task symbols in six groups, four signpost arrows and the finish symbol. Names outside the catalogue may be given as a raw hex codepoint.

## Panel

The integration adds a *Routines* entry to the sidebar. It opens on *Today*; the gear in the toolbar switches to the configuration tabs *Routines* and *Designer* and back.

| Tab | What it does |
| --- | --- |
| Today | Every routine with its person's tasks for today. Tap a task to check it off or undo it, or reset the routine. |
| Routines | Create and edit routines and their tasks: name, time window, days, person, symbol, scan points, order. Each task shows how many cards it has. Its dialog links cards, either the one scanned last or the next unknown card held to any scan point; card changes take effect on save. Status cards are linked per person at the bottom of the page. |
| Designer | Build the printable picture for a card: a photo in a polaroid frame in the person's colour, the symbol and the task in the wide bottom border. Drag and zoom the photo to pick the crop. |

Symbols in the panel are drawn with Material Symbols loaded from Google Fonts, limited to the names in use, so they look exactly like the display and the printed cards.

## Services

`scan` and `keepalive` are what a scan point calls. `learn_card`, `complete`, `select_person` and `reset` cover everything else a routine needs. `add_routine`, `add_task`, `remove_routine`, `remove_task` and `get_routines` cover automations and scripts; the first two return the new id. Editing and reordering happen in the panel.

## Hardware

Any NFC reader that can call a service with a tag UID will do. The reference setup uses two M5Stack Dial units running ESPHome, one per floor, which show the routine on a round display and send every scan to `family_routines.scan`.

## Installation

Not published to HACS yet. Add this repository as a custom repository of category *Integration*, or copy `custom_components/family_routines` into your Home Assistant configuration directory.

## Licence

MIT
