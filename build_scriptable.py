"""Збирає EU90Days.scriptable з EU90Days.js (формат, який Scriptable імпортує сам).

Запуск: python build_scriptable.py
Файл EU90Days.scriptable з'явиться поруч зі скриптом. Запускай після кожної зміни EU90Days.js,
щоб обидва файли в репозиторії збігалися.
"""
import json
import pathlib

root = pathlib.Path(__file__).resolve().parent
code = (root / "EU90Days.js").read_text(encoding="utf-8")
data = {
    "always_run_in_app": False,
    "icon": {"color": "blue", "glyph": "calendar-check"},
    "name": "EU90Days",
    "script": code,
    "share_sheet_inputs": [],
}
text = json.dumps(data, indent=2, ensure_ascii=False, sort_keys=True)
with open(root / "EU90Days.scriptable", "w", encoding="utf-8", newline="\n") as f:
    f.write(text)
print("OK: EU90Days.scriptable")
