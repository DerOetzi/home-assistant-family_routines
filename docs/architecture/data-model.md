# Data model

Three layers. People and scan points are sub-entries of the single config entry, so Home Assistant
gives them devices and configuration dialogs and keeps them admin-only. Routines, tasks and cards
live in storage and are meant to be edited without admin rights. The day state is a separate store
that is cleared whenever a routine's time window opens.

```mermaid
erDiagram
    CONFIG_ENTRY ||--o{ PERSON  : "subentry (admin)"
    CONFIG_ENTRY ||--o{ STATION : "subentry (admin)"

    ROUTINE ||--o{ TASK    : "embedded tasks[]"
    ROUTINE }o--o{ PERSON  : "person_ids[]"
    TASK    }o--o{ STATION : "stations[] empty = anywhere"

    CARD }o--o| PERSON  : "person_id"
    CARD }o--o| ROUTINE : "routine_id"
    CARD }o--o| TASK    : "task_id"

    ROUTINE     ||--o| DAY_ROUTINE : "one day state per routine"
    DAY_ROUTINE ||--o{ DAY_PERSON  : "persons{person_id}"
    DAY_PERSON  ||--o{ DAY_TASK    : "{task_id: completed_at}"
    PERSON      ||--o{ DAY_PERSON  : ""
    TASK        ||--o{ DAY_TASK    : ""

    PERSON {
        str id PK "subentry_id"
        str name
        str color "hex, ring colour"
        str status_card_uid "optional"
    }
    STATION {
        str id PK "subentry_id"
        str name
        str short_name "signpost wording"
        str signpost_icon "catalogue name"
        str device_name "ESPHome device"
    }
    ROUTINE {
        str id PK "uuid4 hex"
        str name
        int sort_index
        str window_start "HH:MM, reset happens here"
        str window_end "HH:MM, may wrap past midnight"
        list person_ids FK
        list weekdays "empty = every day"
        list tasks
    }
    TASK {
        str id PK "uuid4 hex"
        str label
        str icon "catalogue name or raw hex"
        int sort_index
        list stations FK
        list weekdays "empty = every day"
    }
    CARD {
        str uid PK "NFC UID"
        str kind "task | status"
        str person_id FK "empty = active person"
        str routine_id FK
        str task_id FK
    }
    DAY_ROUTINE {
        str routine_id PK
        str last_reset "ISO timestamp"
    }
    DAY_PERSON {
        str person_id PK
    }
    DAY_TASK {
        str task_id PK
        str completed_at "ISO timestamp"
    }
```

## Where each object lives

| Layer | Location | Admin required |
| --- | --- | --- |
| Person, station | sub-entries of the single config entry | yes |
| Routine, task | `family_routines.routines` | no |
| Card | `family_routines.cards` | no |
| Day state | `family_routines.day` | no |

## What the diagram cannot show

A task is physically part of its routine. It has no store file of its own and no global namespace,
so a task id is only meaningful together with its routine id.

A card without a `person_id` belongs to whoever is active at the scan point, which is why that
relation is optional. This is what makes both a shared set of cards and one set per child work
without a second card kind.

The active person per scan point is runtime context held by the coordinator. It expires after a
timeout and is never written to storage, so a restart leaves every scan point waiting for the next
card.

Everyone assigned to a routine shares its task list and keeps their own progress. There is no
per-person copy of a task; the split happens only in the day state.
