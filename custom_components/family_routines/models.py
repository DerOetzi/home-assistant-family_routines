from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Task:
    id: str
    label: str
    icon: str
    sort_index: int
    stations: list[str] = field(default_factory=list)
    weekdays: list[str] = field(default_factory=list)

    def runs_at(self, station_id: str) -> bool:
        return not self.stations or station_id in self.stations

    def runs_on(self, weekday: str) -> bool:
        return not self.weekdays or weekday in self.weekdays


@dataclass
class Routine:
    id: str
    name: str
    sort_index: int
    window_start: str
    window_end: str
    person_id: str = ""
    weekdays: list[str] = field(default_factory=list)
    tasks: list[Task] = field(default_factory=list)

    def runs_on(self, weekday: str) -> bool:
        return not self.weekdays or weekday in self.weekdays

    def ordered_tasks(self) -> list[Task]:
        return sorted(self.tasks, key=lambda task: task.sort_index)

    def tasks_on(self, weekday: str) -> list[Task]:
        return [task for task in self.ordered_tasks() if task.runs_on(weekday)]

    def get_task(self, task_id: str) -> Task | None:
        for task in self.tasks:
            if task.id == task_id:
                return task
        return None


@dataclass
class Card:
    uid: str
    kind: str
    person_id: str | None = None
    routine_id: str | None = None
    task_id: str | None = None
