---
name: humanizer-tts
description: >
  Transform written text into speech-friendly form for TTS output. Handles
  symbols, code references, numbers, and structural patterns that sound
  robotic when spoken aloud. Use when preparing text for voice notes, podcasts,
  briefings, or any ElevenLabs/TTS pipeline. Apply AFTER the base humanizer
  (SKILL.md) for best results.
  Invoke when asked to "make this speakable", "prep for TTS", or when
  generating voice content.
---

# TTS Humanizer: Write for the Ear

Transform text so it sounds natural when spoken by a TTS engine. This is a companion to the base humanizer (SKILL.md) — apply that first to remove AI writing patterns, then apply these rules for speech-specific optimization.

**Key insight:** Written text optimizes for scanning. Speech optimizes for comprehension in a single pass — listeners can't re-read. Every sentence must land the first time.

## Process

1. Apply base humanizer (SKILL.md) first — remove AI slop
2. Apply symbol/code/number transformations below
3. Restructure for speech rhythm (one idea per breath)
4. Add discourse markers and conversational connectors
5. Read the result aloud (mentally) — if anything sounds awkward, rewrite it

---

## SYMBOL AND CODE TRANSFORMATIONS

These look fine written but sound terrible spoken. Transform every instance.

### Package names and code references

| Written | Spoken |
|---|---|
| `@polygraphs/*` | "the polygraphs packages" |
| `@acme/lib` | "the shared internal library" |
| `npm install @anthropic/sdk` | "install the Anthropic SDK" |
| `src/utils/helpers.ts` | "the helpers file in your utils folder" |
| `bun run scripts/fellow.ts` | "run the Fellow script" |
| `git push origin main` | "push to main" |
| `/api/v2/users` | "the users API endpoint" |
| `console.log()` | "log it to the console" |
| `--verbose` flag | "the verbose flag" |
| `SCREAMING_CASE` env vars | "the [name] environment variable" |

**Rule:** Describe what code *does* or *points to*, never read syntax aloud.

### URLs and paths

Never read a URL character by character. Name the destination:

| Written | Spoken |
|---|---|
| `https://github.com/owner/repo` | "the repo on GitHub" |
| `https://docs.openclaw.ai/config` | "the OpenClaw config docs" |
| `~/.openclaw/credentials/` | "your credentials folder" |
| `127.0.0.1:65432` | "the local Postgres port" |

### Numbers and units

| Written | Spoken |
|---|---|
| `44TB` | "forty-four terabytes" |
| `$2-3B` | "two to three billion dollars" |
| `100B tokens` | "about a hundred billion tokens" |
| `1,024` | "about a thousand" (or "one thousand twenty-four" if precision matters) |
| `67%` | "about two thirds" (prefer fractions) or "sixty-seven percent" |
| `3.5x` | "three and a half times" |
| `v2.1.1` | "version two point one point one" |
| `Q3 2026` | "the third quarter of twenty twenty-six" |
| `$50/mo` | "fifty dollars a month" |
| `10 req/min` | "ten requests per minute" |

**Density rule:** Never stack more than one statistic per sentence. Space them out with context between.

**Written (too dense):** "The 405B param model trained on 100B tokens achieves 67% accuracy at 3.5x the speed."

**Spoken:** "The model has four hundred and five billion parameters — a massive model. They trained it on about a hundred billion tokens. And the result? Sixty-seven percent accuracy, running three and a half times faster."

### Symbols and punctuation

| Symbol | Spoken |
|---|---|
| `&` | "and" |
| `→` / `->` | "which gives you" or "leading to" or just restructure |
| `+` (in prose) | "and" or "plus" |
| `/` (alternatives) | "or" — "Mac or Linux" not "Mac/Linux" |
| `...` (ellipsis) | Natural pause — keep, TTS handles it |
| `—` (em dash) | Brief pause — keep sparingly, TTS handles it |
| `( )` (parentheticals) | Restructure as separate sentence or use em dash |
| `" "` (quotation marks) | Keep for actual quotes; drop for scare quotes (just say the word) |

### Acronyms

**First use:** Always expand. "MCP — the model context protocol"
**After that:** Just the acronym.
**Proper names** (NVIDIA, AWS, NASA): Don't expand. They're names, not puzzles.
**Stacked acronyms:** Never put two unexpanded acronyms adjacent. "RLHF via SFT" → "reinforcement learning from human feedback, using supervised fine-tuning"

---

## SPEECH RHYTHM AND STRUCTURE

### One idea per breath

Written text can pack information tightly. Speech cannot.

**Written (fine to read):** "Stories #1, #4, #5 (power constraints) show compute is no longer the bottleneck."

**Spoken:** "This is the power-is-now-the-constraint story. We've been talking about how gigawatt stories are driving AI. And here we are — the first three stories this week all come back to the same thing."

Take 2-3x the words. It's not wasteful — it's necessary for comprehension.

### Vary sentence length deliberately

Build up with longer sentences, then punch with short ones:

> "The model has one and a half billion parameters, trained on about a hundred billion tokens, with a context window that can look at roughly a thousand tokens at once. That's not a lot."

> "They shipped it in ten days. Ten days. Using their own tool."

**Pattern:** Long setup → short payoff → pause (new paragraph).

### Use rhetorical questions

They create natural pauses and engage the listener:

- "But what does this actually mean for day-to-day work?"
- "So why does this matter?"
- "And here's the question nobody's asking..."

Use 2-3 per section. They're speech gold.

### Repetition is your friend

Listeners can't re-read. Restate important ideas:

- State it → restate differently → callback later
- "Consistency beats complexity. It just does. And once you internalize that..."

---

## CONVERSATIONAL CONNECTORS

### Discourse markers (keep these — they're navigation, not filler)

| Marker | Function | Example |
|---|---|---|
| "So" | Continuation | "So here's what happened..." |
| "Now" | Temporal pivot | "Now, the interesting part..." |
| "Look" | Candor/authority | "Look, I'll be honest..." |
| "Here's the thing" | Key insight coming | "Here's the thing about rate limiting..." |
| "And so" | Causal chain | "And so the whole pipeline broke." |
| "I mean" | Hedging/humanizing | "I mean, it's a big company, right?" |
| "Right?" | Check-in | "That makes sense, right?" |
| "Okay, so" | Topic reset | "Okay, so — let's talk about the database." |

### Topic transitions

Don't just switch — bridge:

**Bad:** "Moving to the next topic, database performance."
**Good:** "Okay, so that's the API side. Now let's talk about what happens when those requests hit the database."

**Techniques:**
- Summarize what you just covered: "So that's how the sync works."
- Signal what's next: "Now here's where it gets tricky."
- Acknowledge the shift: "Completely different thing now."
- Use "speaking of": "Speaking of performance..."

### Emotion signals

Listeners can't see your face. Signal emotions explicitly:

| Emotion | Signals |
|---|---|
| Excitement | "I love this", "here's what's exciting", "this is wild" |
| Concern | "this is a bit worrying", "I have some concerns", "here's the risk" |
| Surprise | "what's unexpected is", "I did not see this coming" |
| Frustration | "look, this is frustrating", "honestly, this should be better" |
| Wonder | "what's fascinating about this", "I keep thinking about" |
| Humor | "which is kind of hilarious", "you can't make this up" |

---

## TECHNICAL CONTENT FOR SPEECH

### The Karpathy method

State the term → give an immediate intuitive parallel → go deeper only if needed:

> "Think of these parameters as a kind of compression of the internet. Like a zip file — but lossy, not lossless."

> "A sandbox is basically a safe container. You drop a file in and it can't escape."

### Code and architecture

Never read code aloud. Describe behavior:

**Written:** "The `syncSlackMessages()` function calls `conversations.history` with `oldest` set to `latest_ts` from the channels table."

**Spoken:** "The sync function picks up where it left off — it checks the last message timestamp we stored and asks Slack for everything newer than that."

### Lists and enumerations

More than 3-4 items? Group them:

**Written:** "The system handles URL filtering, text extraction, language detection, deduplication, PII removal, and quality scoring."

**Spoken:** "There's a whole pipeline here. First, cleanup — filtering junk URLs and extracting just the text. Then quality control — language detection, deduplication. And finally, safety — stripping out personal information and scoring overall quality."

---

## THINGS THAT KILL TTS NATURALNESS

### The deadly seven

1. **Perfect grammar in casual context** — "It is important to note" → "And look, this matters"
2. **Passive voice** — "The model was trained" → "They trained the model"
3. **Parenthetical nesting** — "(like this (and especially this))" → separate sentences
4. **Concept stacking** — 3+ abstract concepts in one sentence → one per sentence
5. **No contractions** — "do not", "it is", "they are" → "don't", "it's", "they're"
6. **Transitions too clean** — "Moving to the next topic" → "Okay, so..."
7. **Flat emotional register** — every sentence at the same energy level → modulate

### Suspended resolution (deadly for dialogue)

The subject-verb pair of a sentence should resolve before any interrupting clause begins. When the main clause resolves late — because of a colon-introduced question, an em-dash parenthetical, or a nested qualifier mid-sentence — the listener holds an open slot in working memory waiting for the sentence to close. In speech this creates real confusion. In writing it's annoying. In dialogue scripts it breaks the conversational rhythm entirely.

**Patterns to eliminate:**

| Broken | Fixed |
|---|---|
| "And the question we kept coming back to was: how do you..." | "We kept trying to figure out how to..." |
| "That distinction — does the skill connect to an external system or not — is what separates..." | "An integration skill connects to an external system. That's what separates it from..." |
| "At minimum it is a markdown file — SKILL.md — that I read before acting." | "Every skill has a markdown file I read before acting." |
| "The marketplace — ClawHub — is how those skills get discovered." | "OpenClaw has a marketplace called ClawHub, which is how skills get discovered." |

**The rule:** subject-verb resolves first, elaboration follows. Relative clauses ("which is...", "that allows...") are fine because the main claim already landed. Interrupting clauses are not.

This pairs with sentence complexity: one new concept per sentence. If you're introducing a term and explaining its implication in the same clause, split them.

### Density limits

| Content Type | Max per sentence |
|---|---|
| Statistics/numbers | 1 |
| Technical terms (new) | 1 |
| Acronyms (unexpanded) | 2 |
| Named entities | 2-3 |
| Abstract concepts | 1-2 |

If you exceed these, split the sentence.

---

## QUICK REFERENCE: 12 RULES

1. **One idea per sentence.** Comma-separated list of 3+ concepts? Break it up.
2. **Say numbers in words.** "Forty-four terabytes" not "44TB."
3. **Never include raw URLs, file paths, or code syntax.** Describe what they point to.
4. **Expand acronyms once.** First use only. Then just the acronym.
5. **Use contractions.** "It's" not "it is." Always.
6. **Include discourse markers.** "So," "Now," "Look," "Here's the thing" — these are navigation.
7. **Ask rhetorical questions.** They create pauses and engagement.
8. **Vary sentence length.** Long buildup → short punch. Repeat.
9. **Use "you" and "we."** Direct address keeps listeners engaged.
10. **Signal emotions explicitly.** Listeners can't read your face.
11. **Repeat key ideas.** State it, restate it differently, callback later.
12. **Read it aloud.** If anything sounds awkward, rewrite it.

---

## BEFORE/AFTER EXAMPLES

### Technical explanation

**Before:** "The R&D Framework (Reduce and Delegate) provides two fundamental approaches to context window management."

**After:** "So there's this framework called R and D — Reduce and Delegate. It's really simple. There are only two ways to manage your context window. You either reduce what goes in, or you delegate the work to another agent."

### News/announcement

**Before:** "Anthropic shipped Claude Cowork in 10 days, built using Claude Code, demonstrating production-ready agentic capabilities and organizational AI fluency."

**After:** "Here's the wild part — Anthropic shipped Cowork in ten days. Ten days! And they built it using their own tool, Claude Code. That tells you something about how ready this stuff actually is."

### Concept explanation

**Before:** "LLMs process tokens rather than characters, leading to failure on character-level tasks like counting letters in words."

**After:** "The models don't see individual letters the way we do. They see tokens — these little chunks of text. So when you ask how many R's are in strawberry, the model sees something like 'straw' and 'berry' as chunks. It literally can't count the letters because it doesn't see them."

### Package/project reference

**Before:** "Install the `@polygraphs/core` package and configure the `docusaurus.config.ts` to include the theme plugin from `@polygraphs/docusaurus-theme-polygraphs`."

**After:** "First, install the core Polygraphs package. Then open your Docusaurus config and add the theme plugin. That's the one from the Polygraphs theme package."

---

## Reference

Based on transcript analysis of Andrej Karpathy, Nate B. Jones, IndyDevDan (Dan Dillinger), and Theo (t3.gg). Combined with [Wikipedia:Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) and ElevenLabs TTS optimization experience from The Traversal Podcast production.
