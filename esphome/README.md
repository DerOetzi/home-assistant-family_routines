# ESPHome display package

The round-display side of Family Routines. Three ESPHome packages drawing one
routine for one person at one scan point, sending every card scan back, and
putting the display to sleep when nobody needs it.

They build on the [display framework](https://github.com/DerOetzi/esphome-homeassistant-display-framework)
with its shared `main.yaml` and the `round` format.

```yaml
substitutions:
  home_page: routine_page
  routine_entity: sensor.flur_og_routine

packages:
  device: !include displays/devices/M5Dial.yaml
  locales: !include displays/locales/de_DE.yaml
  main: !include displays/main.yaml
  format: !include displays/formats/round/format.yaml
  routine: !include family_routines/page_routine.yaml
  binding: !include family_routines/bind_homeassistant.yaml
  display: !include family_routines/bind_display.yaml
```

`page_routine.yaml` draws and knows nothing about Home Assistant.
`bind_homeassistant.yaml` fills its globals from the scan point sensor and
calls the integration's services. `bind_display.yaml` ties the routine to the
framework's standby: it knows the routine state and the framework scripts,
but nothing about Home Assistant.

## What Home Assistant has to allow

The device calls `family_routines.scan`, `keepalive` and `select_person`, so
**Allow the device to perform Home Assistant actions** has to be on in the
ESPHome config entry of that device. Without it the display still updates,
but no scan ever arrives.

The scan point's `device_name` in the integration must match the ESPHome
`devicename`, because that is what the device sends as `station`.

## What the device configuration has to provide

| Substitution | Meaning |
| --- | --- |
| `devicename` | ESPHome node name, doubles as the scan point identifier |
| `routine_entity` | the scan point sensor, e.g. `sensor.flur_og_routine` |
| `keepalive_interval` | how long one keepalive silences the next, 20s by default |
| `home_page` | `routine_page`, the page the framework returns to |

Fonts `roboto_md` and `roboto_lg` come from the display framework. The page
brings its own icon font, `routine_icons`, with 45 Material Symbols glyphs
at `routine_icon_size`, 84 by default. They are exactly the integration's icon catalogue; a symbol
added to one has to be added to the other.

## What arrives from the sensor

The sensor's state is `idle`, `task`, `elsewhere` or `done`. Its attributes
`person`, `glyph`, `label`, `color`, `dots`, `glyphs`, `labels` and `index`
each feed one global. `glyphs` and `labels` are pipe-separated in the same
order as `dots`, which is what the page's `nth` helper expects.

Icons arrive as finished characters, so every codepoint a routine uses has
to be listed in the `routine_icons` font. The colour arrives as `#RRGGBB`
and is parsed into the ring colour, so a person's colour lives in Home
Assistant and nowhere else.

Above the symbol sits a small clock, so a child can tell how much time is
left before the next step. It reads `ha_time`, redraws with every render
and every ten seconds, and stays empty until the time is valid.

`idle` hides clock, symbol, word, name and dots and greys the ring. The clock on top
of it belongs to the framework's round format, see below.

## Sleeping

The framework decides between awake, standby, dark and antiburn, with the
same entities as every other display: `Screen timeout`, `Show standby screen`,
`Standby brightness` and `Antiburn`. Antiburn runs from the firmware at night,
Home Assistant schedules `Show standby screen`.

`bind_display.yaml` adds what only a routine display needs:

- **While a routine is shown the display never sleeps.** Every state other
  than `idle` sets the framework's `standby_hold` and wakes the display.
- **`idle` shows the clock at once**, at full brightness, and dims it after
  `Screen timeout`. With `Show standby screen` off, or during antiburn, the
  display goes dark straight away instead.
- **Every input wakes it.** Scan, turn, touch and button call `rt_wake`:
  full brightness, and in `idle` the clock with a fresh timeout. A scan at
  night wakes the display and plays its sound like any other.

The state is checked every 500 ms, so the package needs no hook in the
Home Assistant binding.

`done` plays the finish tune, but only on the way in, not on every update
that leaves the routine finished.

`last_scan` picks the short sound after a card is read. The reader itself
stays silent, because only Home Assistant knows what the card did.

| Result | Sound |
| --- | --- |
| `done`, `learned` | rising two-note confirmation, skipped when the routine just finished |
| `repeat`, `person` | one neutral note |
| `wrong_place`, `unknown` | falling two-note error |

The first value after boot is only remembered, so a restart never replays
the last scan. Browsing into an empty direction keeps its own muted bump.

## What it exposes

Input handling is deliberately left outside. The packages define no encoder,
no button and no touchscreen, because a device usually has other pages that
want the same hardware, and two packages cannot extend the same component.
Call these from your own dispatcher:

| Script | Effect |
| --- | --- |
| `rt_scan(uid)` | hand a card UID to the integration |
| `rt_keepalive` | tell the integration someone is still standing here |
| `rt_select_person(dir)` | step to the next or previous person |
| `rt_click` | leave browsing, else pick a person when idle, else keepalive |
| `rt_browse_step(dir)` | browse one step, `1` through the open tasks, `-1` through the done ones |
| `rt_touch(tx, ty)` | jump to the dot under the touch point, centre means back |
| `rt_render` | redraw from the globals |
| `rt_wake` | wake the display; in `idle` show the clock with a fresh timeout |

Browsing ends on its own after ten seconds, and any change to `dots` ends it
at once, so a scan always puts the display back on the real suggestion.

## Dot alphabet

The `rt_dots` global carries one character per task, in routine order.

| Character | Drawing | Meaning |
| --- | --- | --- |
| `x` | filled, full size | done |
| `o` | ring, full size | open, can be done here |
| `.` | small, thin, dimmed | open, belongs to another scan point |
| `!` | ring plus halo, full size | open at a point already passed on the way here |

Ten dots fit. A routine with more tasks than that draws only the first ten.
