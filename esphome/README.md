# ESPHome display package

The round-display side of Family Routines. Two ESPHome packages drawing one
routine for one person at one scan point, and sending every card scan back.

```yaml
substitutions:
  routine_entity: sensor.flur_og_routine

packages:
  routine: !include family_routines/page_routine.yaml
  binding: !include family_routines/bind_homeassistant.yaml
```

`page_routine.yaml` draws and knows nothing about Home Assistant.
`bind_homeassistant.yaml` fills its globals from the scan point sensor and
calls the integration's services. Including the page alone gives a device
that renders whatever you put in the globals yourself.

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
| `icons_xl` | icon font size, 110 on a 240 px round display |
| `keepalive_interval` | how long one keepalive silences the next, 20s by default |
| `routine_clock` | id of the `time` component the idle clock reads, `ha_time` by default |
| `clock_size` | idle clock font size, 72 by default |

Fonts `roboto_md` and `roboto_lg` come from the display framework. The page
brings its own icon font, `routine_icons`, with 45 Material Symbols glyphs
at `icons_xl`. They are exactly the integration's icon catalogue; a symbol
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

`idle` shows a clock in a grey ring instead of the routine. The colour the
sensor sends with `idle` is ignored, because nobody is standing there whose
colour it could be.

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
