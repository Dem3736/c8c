---
name: infostyle
description: "v1.0: Infostyle filter for landing pages. Facts, respect, utility. No emotional manipulation."
---

# Infostyle Filter v1.0

Quality filter for landing page content. Based on Ilyakhov's information style: facts, respect for the reader, utility. Every sentence informs or helps decide.

## Purpose

DRY for landing page agents: landing-architect, landing-copywriter.

**Scope:** Landing pages only. Does NOT replace anti-cringe (which serves /copy pipeline for author voice content).

---

## Section A: Buzzword Bans (from anti-cringe)

### Automatic Rejection Words

```
уникальный, инновационный, революционный, прорывной
трансформация, трансформировать, трансформирующий
эффективность, эффективный, высокоэффективный
раскрой потенциал, путь к успеху, секрет успеха
лайфхак, лайфхаки, хак, хаки
синергия, синергетический
мотивация, мотивирующий, вдохновляющий
масштабирование, масштабировать
оптимизация, оптимизировать (в общем контексте)
экосистема (вне технического контекста)
```

### Weak Modifiers (require specifics or remove)

```
очень, крайне, невероятно, потрясающе
просто, легко, быстро (без конкретных чисел)
всего лишь, буквально
```

### Forbidden Constructs

```
Listicle:      "5 способов...", "7 шагов к...", "Топ-10...", "N вещей, которые..."
Success theater: "Что делают успешные люди...", "Привычки миллионеров..."
Pseudo-science:  "Учёные доказали..." (без ссылки), "По статистике..." (без источника)
Empty promises:  "Гарантированный результат", "100% работает", "Изменит вашу жизнь"
```

---

## Section B: Infostyle Bans (landing-specific)

| # | Pattern | Example (cringe) | Infostyle replacement |
|---|---------|-------------------|-----------------------|
| 1 | Rhetorical questions | "Узнаёшь?", "Устали от...?", "Знакомо?" | Statement: "Это касается тех, кто..." |
| 2 | "Представь:" prompts | "Представь: открываешь дайджест..." | Mechanism: "Дайджест: 3 сигнала, 5 минут" |
| 3 | Intimate 2nd person | "Сидишь за ноутбуком в 3 ночи", "Ты листаешь..." | 3rd person: "Преподаватели обновляют материалы..." |
| 4 | Emotion diagnosis | "Anxiety исчезает", "чувствуешь облегчение", "появляется уверенность" | Fact: measurable result OR grounded capability outcome. "Мониторинг: 5 минут вместо 40" OR "Участники деплоят первого агента за 3 дня" |
| 5 | Domestic drama | "Кофе остыл", "дети спят, жена недовольна", "за кухонным столом" | Delete. Not relevant to product description. |
| 6 | Dirty Currency | "Как поход в Макдак", "как чашка кофе" | Price: "15 000 руб/год" |
| 7 | Life Currency | "Пока закипает чайник", "один эпизод сериала" | Time: "5 минут" |
| 8 | Number repetition across blocks | "40→5 минут" in hero, situation, value_prop, mechanism... | Each number appears in exactly 1 block |
| 9 | Forced contrast | "Раньше хаос. Теперь покой." | Fact: "Было: 40 мин/день. Стало: 5 мин/день" |
| 10 | False empathy | "Мы понимаем...", "Мы знаем, как это..." | Delete. Product page, not therapy session. |
| 11 | Urgency manipulation | "Только сегодня!", "Осталось 3 места!" | Fact: real dates, real limits, or nothing |
| 12 | Vague authority | "Эксперты рекомендуют", "Профессионалы выбирают" | Name: "Иван Петров, CTO в X, использует Y" |

### Banned Sentence Openers

```
Представь...
Узнаёшь?
Знакомо?
А что, если...
Устали от...
Мы понимаем...
Мы знаем...
Давай честно...
Будем откровенны...
Хватит...
Пора...
```

---

## Section C: Positive Rules

### C1. Headlines = useful action or concrete outcome

Every heading is a verb + measurable result OR verb + concrete capability:
- BAD: "Новый уровень мониторинга"
- GOOD (quantitative): "Снизить мониторинг с 40 до 5 минут в день"
- GOOD (qualitative): "Запустить production-ready AI-агента за первую неделю"

### C2. Every sentence informs or helps decide

If a sentence is removed and nothing is lost — it was padding. Delete it.

Test: "What NEW information does this sentence give the reader?" If none — delete.

### C3. Numbers with units and sources

- BAD: "значительно снижает время"
- GOOD: "с 40 минут до 5 минут в день (данные из опроса 12 преподавателей)"

### C4. Quotes with full attribution

- BAD: "Участник курса"
- GOOD: "Иван, преподаватель ML, 3 года опыта, Москва"

If source is anonymous research — state: "участник исследования, segment_007, Signal ID: SIG-007-014"

### C5. Third person by default

Default voice: third person ("преподаватели", "разработчики", "пользователи").

"Вы" — ONLY in:
- Q&A blocks (objections, FAQ): "Вы можете..." is natural in answers
- Pricing block: "Вы получаете..." when listing what's included

Never "ты" on a landing page.

### C6. No padding sentences

If two sentences say the same thing — keep the more informative one.

- BAD: "Это экономит время. Вы тратите меньше времени на рутину."
- GOOD: "Экономия: 35 минут в день на мониторинге."

### C7. One fact per block, no repetition

Track which numbers/facts appear in which block. If a number already appeared — don't repeat it. Reference the block instead: "Как показано выше, мониторинг занимает 5 минут."

### C8. Qualitative value is valid when grounded

Not all products save time or money. For products whose value is capability, identity, or community — use this pattern:

- BAD: "Почувствуй себя настоящим разработчиком" (emotion diagnosis)
- BAD: "Уникальное сообщество единомышленников" (buzzword)
- GOOD: "Участники получают рабочие артефакты: Skills, MCP-серверы, промпт-пайплайны. 12 из 40 участников пилота задеплоили агента в прод за первый месяц."

Rule: Qualitative value claims require the same grounding as quantitative — a proof_anchor (verbatim quote, case study, or validated test result). Number of outcomes > emotional label.

---

## Validation Protocol

```
1. SCAN for Section A buzzwords
   └─ Found? → REJECT or REWRITE

2. SCAN for Section B patterns (table + banned openers)
   └─ Found? → APPLY replacement from table

3. CHECK positive rules (C1-C8)
   a. Headlines → verb + result or verb + capability?
   b. Each sentence → new information?
   c. Numbers → units + source?
   d. Quotes → attribution?
   e. Voice → 3rd person (except Q&A)?
   f. Padding → removed?
   g. Number repetition → deduplicated?
   h. Qualitative claims → grounded with proof_anchor?

4. OUTPUT only if all checks pass
```

---

## Number Deduplication Protocol

Before finalizing, build a number registry:

```yaml
number_registry:
  "40 минут": { block: "situation", context: "текущее время мониторинга" }
  "5 минут": { block: "value_prop", context: "время после внедрения" }
  "35 минут": { block: "mechanism", context: "экономия" }
  "12 преподавателей": { block: "evidence", context: "размер выборки" }
```

Rule: each entry appears in exactly ONE block. If found in multiple — keep in the most relevant, remove from others.
