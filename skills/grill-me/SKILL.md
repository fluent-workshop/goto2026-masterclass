---
name: "grill-me"
description: "Relentlessly interview the user one question at a time with Discord buttons, tool-enriched answers, and ADHD trigger for open design nodes."
---

# Grill Me — OpenClaw-Native

**Triggers:** `/grill-me [topic]` · "grill me on [topic]" · "grill me about [topic]"

---

## Purpose

Stress-test a plan, design, or decision by walking every branch of its decision tree — one question at a time — until we reach shared understanding. Works for coding and non-coding alike.

---

## The Core Loop

Interview relentlessly. Walk each branch of the decision tree, resolving dependencies one-by-one. **Ask exactly one question per message.** Never stack questions. Wait for the answer before continuing.

For each question, provide your recommended answer. When the user agrees, move on. When they push back, adjust and continue.

---

## Before Asking Each Question — Foraging Model

Don't ask what you can already find. Before forming each question, scan your available tools, skills, and integrations — pick whichever ones are most likely to yield relevant context for *this specific question*, then apply the cost-benefit tiers below.

The goal: arrive at each question already holding as much grounded context as possible, so your recommended answer reflects reality rather than assumption.

### Tier 1 — Forage freely (no announcement, ~instant)

If the right tool for this question is fast and cheap, use it without asking. Memory, search-based tools, lightweight API lookups — these generally qualify. Cite the source briefly in the message text when you use one (e.g. *"(from Slack #masterclass-prep)"*).

### Tier 2 — Forage with brief mention (~5–30 seconds)

If the right tool takes a bit longer or involves reading a document, do it proactively but note it with a single inline line before the question (e.g. *"(Pulled from your Notion masterclass page)"*). No need to ask permission — just be transparent.

### Tier 3 — HITL required (>30 seconds / unbounded)

**Always ask before starting.** If the right tool is expensive in time or compute — deep research runs, ADHD diverge passes, anything with unclear time bounds — offer it with buttons before firing it off:

```
[Run it → primary]  [Skip it, keep going → secondary]
```

If the user declines: continue with whatever partial context you have and acknowledge the gap in your recommended answer.

**The bright line is 30 seconds.** When in doubt about which tier something falls into, ask.

---

## Question Format (Discord)

Post each question as its own message using the `message` tool with `action=send` and `presentation.blocks` containing buttons.

**Plain-text reply is the primary, reliable path. Buttons are progressive enhancement.** Lead with the reply CTA so it's the first thing the user sees — not the last line.

**Message structure:**

```
Q{N} / ~{estimate} estimated — reply here or tap a button below

**[One clear question sentence]**

My recommendation: [recommended answer, 1–2 sentences explaining why]
```

**Button structure:**
- Recommended answer → `style: "primary"`
- 2–3 alternatives → `style: "secondary"`
- Max 4 buttons total. Keep labels ≤ 25 chars.

**Example payload:**
```json
{
  "action": "send",
  "target": "channel:<current_channel_id>",
  "message": "Q3 / ~8 estimated — reply here or tap a button below\n\n**How do students run their agent in the afternoon?**\n\nMy recommendation: pre-baked remote instances (browser + Discord only on their machine). Eliminates install hell on Windows/admin-locked machines — the single biggest tech-reliability risk for the afternoon.",
  "presentation": {
    "blocks": [{
      "type": "buttons",
      "buttons": [
        {"label": "Pre-baked remote instances", "value": "prebaked", "style": "primary"},
        {"label": "Local install", "value": "local", "style": "secondary"},
        {"label": "Hybrid (offer both)", "value": "hybrid", "style": "secondary"}
      ]
    }]
  }
}
```

**Note on button reliability:** Discord button clicks require a 3-second interaction ACK from OpenClaw. If the event loop is busy, clicks may silently fail with no visible error. This is why plain-text reply is the dominant path — buttons are UX sugar that speed things up when they work, but a plain-text reply always continues the session reliably.

After receiving any answer (button click or free text), acknowledge it briefly in one sentence before posting the next question. Confirm the decision and its implication — don't repeat the question text.

---

## ADHD Trigger

When a question is **genuinely open-ended** (multiple viable paths, no obvious right answer) **and** the stakes justify ~2 min of diverge cost — this is always Tier 3, always HITL:

```
Q{N} / ~{estimate} estimated — reply here or tap a button below

This is a real design fork. Want me to fan out 5 isolated perspectives before we continue? (~2 min)

My recommendation: run the ADHD pass — the decision here is high enough stakes that lateral options are worth surfacing before we commit.
```

Buttons: `[Run ADHD pass → primary]` · `[Keep going → secondary]`

If yes: **pause the grill**, run the ADHD skill on that node, present the Phase 2 synthesis, then **resume grilling** from that point with the chosen direction locked in.

Don't trigger ADHD on every question. Reserve it for genuine forks where the decision tree branches in multiple defensible directions. Typical rate: 0–2 triggers per session.

---

## Converge / Diverge Rhythm

The natural session shape:

1. **Grill** to extract constraints and goals (converge)
2. **ADHD** on any genuine design fork surfaced during grilling (diverge)
3. **Grill** to stress-test the ADHD survivors (converge)
4. Repeat as needed — but don't over-diverge; most questions have good answers

---

## Ending a Session

When the decision tree is sufficiently resolved — no major open branches, or all open branches explicitly deferred:

1. **Decisions made** — crisp list, one line each, with the key rationale
2. **Open items** — anything deferred, flagged as unknown, or needing follow-up
3. **Suggested next step** — offer: save the outcome to your notes or task tracker (if you have one wired up), continue grilling on a sub-topic, or kick off ADHD on a surviving open question

---

## Question Sequencing Heuristics

For **course/curriculum design**, grill in this order:
1. Audience profiling (who's in the room, what do they already know)
2. Hard constraints (time, tech reliability, room setup, remote/in-person ratio)
3. Core learning objective — singular: the *one* thing they must leave with
4. Contingency design (demo breaks, running short/long)
5. Content sequencing and pacing

For **coding/system design:**
1. Problem statement (what pain does this solve?)
2. Constraints (performance, scale, team size, existing stack)
3. Interfaces (what does success look like from the outside?)
4. Key design decisions (the real forks)
5. Implementation order and risk surface

---

## Anti-Patterns

- **Never ask multiple questions at once** — bewildering, not grilling
- **Never skip Tier 1 foraging** — don't ask what you can already find cheaply
- **Never start Tier 3 work without asking** — 30-second rule is the bright line
- **Never enumerate tools prescriptively** — scan what's available and pick the right one for the context; the list of integrations changes, the reasoning doesn't
- **Never trigger ADHD on every question** — it's a fork detector, not a reflex
- **Never lead with buttons** — reply-first framing is the reliable path; buttons are secondary
- **Never end with unresolved open branches** — resolve them or explicitly defer
- **Don't over-summarize mid-session** — keep the momentum; summarize at the end

---

## Future Directions

**Reliable button-click session waking via Valkey.** The current limitation is Discord's 3-second interaction ACK window — if OpenClaw's event loop is busy, button clicks silently fail and the session stalls. A Valkey-backed message bus could decouple interaction receipt from turn processing: the Discord plugin ACKs immediately to Valkey, OpenClaw dequeues and wakes the session reliably, independent of event loop pressure. This would make buttons a first-class session-continuation primitive rather than progressive enhancement. Until then, plain-text reply remains the reliable path and buttons are UX sugar.
