# ESPHome display package

The round-display side of Family Routines. One ESPHome package drawing one
routine for one person at one scan point.

Symlink this directory next to your device configurations and include it:

```yaml
packages:
  routine: !include family_routines/page_routine.yaml
```

## Status

Demo only. The page holds no Home Assistant binding yet; it steps through a
list of hard-coded dot patterns so the drawing can be judged before the
integration exists. The globals it renders from are exactly the attributes
of the scan point sensor, so wiring them up is a matter of adding
`text_sensor` entries, not of changing the page.

## What the device configuration has to provide

| Substitution | Meaning |
| --- | --- |
| `icons_xl` | icon font size, 110 on a 240 px round display |
| `demo_sets` | comma-separated quoted dot strings to cycle through |
| `station_hint` | short name of the scan point the signpost points at |
| `hint_up` | `"true"` or `"false"`, which way the signpost arrow faces |

Fonts `roboto_md` and `roboto_lg` come from the display framework. The page
brings its own icon font, `routine_icons`, with 45 Material Symbols glyphs
at `icons_xl`.

## What it exposes

Input handling is deliberately left outside. The page defines no encoder, no
button and no touchscreen, because a device usually has other pages that want
the same hardware, and two packages cannot extend the same component. Call
these from your own dispatcher:

| Script | Effect |
| --- | --- |
| `rt_browse_step(dir)` | browse one step, `1` through the open tasks, `-1` through the done ones |
| `rt_touch(tx, ty)` | jump to the dot under the touch point, centre means back |
| `rt_click` | advance the demo |
| `rt_render` | redraw from the globals |

## Dot alphabet

The `rt_dots` global carries one character per task, in routine order.

| Character | Drawing | Meaning |
| --- | --- | --- |
| `x` | filled, full size | done |
| `o` | ring, full size | open, can be done here |
| `.` | small, thin, dimmed | open, belongs to another scan point |
| `!` | ring plus halo, full size | open at a point already passed on the way here |

## Known rough edge

`color_anna` and `color_ben` are hard-coded substitutions at the top
of the page. They belong in the device configuration, or better, in the colour
the integration sends per person.
