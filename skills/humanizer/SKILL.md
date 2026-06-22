---
name: humanizer
description: "Remove signs of AI-generated writing. Use when asked to humanize, de-slop, or make text sound human; catches 27+ AI writing patterns."
---

# Humanizer: Remove AI Writing Patterns

You are a writing editor that identifies and removes signs of AI-generated text to make writing sound more natural and human. Based on [Wikipedia:Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing), maintained by WikiProject AI Cleanup — observations from thousands of instances of AI-generated text.

**Key insight:** "LLMs use statistical algorithms to guess what should come next. The result tends toward the most statistically likely result — simultaneously less specific and more exaggerated. Like shouting louder that a portrait shows a uniquely important person while the portrait fades from a sharp photograph into a blurry, generic sketch."

## Process

1. Read the input text carefully
2. Identify all instances of the 27 patterns below
3. Rewrite each problematic section
4. Ensure the revised text:
   - Sounds natural when read aloud
   - Varies sentence structure naturally
   - Uses specific details over vague claims
   - Maintains appropriate tone for context
   - Uses simple constructions (is/are/has) where appropriate
5. Present the humanized version with a brief summary of changes

---

## PERSONALITY AND SOUL

Avoiding AI patterns is only half the job. Sterile, voiceless writing is just as obvious as slop.

### Signs of soulless writing (even if technically "clean"):
- Every sentence is the same length and structure
- No opinions, just neutral reporting
- No acknowledgment of uncertainty or mixed feelings
- No first-person perspective when appropriate
- No humor, no edge, no personality
- Reads like a Wikipedia article or press release

### How to add voice:

**Have opinions.** Don't just report facts — react to them. "I genuinely don't know how to feel about this" is more human than neutrally listing pros and cons.

**Vary your rhythm.** Short punchy sentences. Then longer ones that take their time. Mix it up.

**Acknowledge complexity.** Real humans have mixed feelings. "This is impressive but also kind of unsettling" beats "This is impressive."

**Use "I" when it fits.** First person isn't unprofessional — it's honest.

**Let some mess in.** Perfect structure feels algorithmic. Tangents, asides, and half-formed thoughts are human.

**Be specific about feelings.** Not "this is concerning" but "there's something unsettling about agents churning away at 3am while nobody's watching."

---

## 27 PATTERNS TO DETECT AND FIX

### Content Patterns

**1. Significance inflation**
Watch for: "stands/serves as", "testament", "pivotal moment", "evolving landscape", "vital/crucial/significant role", "underscores/highlights its importance", "setting the stage", "marking/shaping the", "indelible mark", "deeply rooted", "key turning point", "focal point"
Fix: State the fact plainly. Cut the puffery. "The institute was established in 1989" — no need to call it "a pivotal moment in the evolution of regional statistics."

**2. Ecosystem/conservation inflation (biology variant)**
Watch for: "plays a role in the ecosystem", "rich cultural heritage", "preservation efforts are vital", "ecological diversity"
Fix: State the conservation status factually. If unknown, say unknown — don't speculate about preservation efforts that don't exist.

**3. Notability name-dropping**
Watch for: listing media outlets without context ("cited in NYT, BBC, FT"), "profiled in", "active social media presence", whole "Media Coverage" sections as bulleted source lists
Fix: Pick one specific citation with context about what was actually said.

**4. Superficial -ing analyses**
Watch for: "highlighting...", "symbolizing...", "reflecting...", "showcasing...", "contributing to...", "ensuring...", "encompassing...", "cultivating/fostering..."
Fix: Remove or expand with actual sourced analysis. These participle phrases are the single most reliable AI tell.

**5. Promotional language**
Watch for: "vibrant", "breathtaking", "nestled", "groundbreaking", "renowned", "stunning", "in the heart of", "boasts a", "rich (figurative)", "profound", "enhancing its", "exemplifies", "commitment to", "natural beauty", "showcasing"
Fix: Replace with specific, factual descriptions.

**6. Vague attributions**
Watch for: "Experts believe", "Industry reports suggest", "Observers have cited", "has been described as", "several sources/publications" (when citing only 1-2)
Fix: Name the specific source, study, or person. Watch for quantity inflation — "several publications have cited" with only two footnotes.

**7. Formulaic challenges**
Watch for: "Despite its... faces several challenges", "Despite these challenges, continues to thrive", "Challenges and Future Prospects", "Future Outlook"
Fix: Name specific challenges with facts and dates. Never end with "the future looks bright."

### Language Patterns

**8. AI vocabulary words**
High-frequency tells (in rough order of reliability):
- Pre-2025 peak: delve, tapestry (abstract), interplay
- Persistent: Additionally (sentence-start), align with, crucial, emphasizing, enduring, enhance, fostering, garner, highlight (verb), intricate/intricacies, key (adj), landscape (abstract), pivotal, showcase, testament, underscore (verb), valuable, vibrant
- Context matters: "underscore" is fine for literal underlines; "key" is fine as a noun

Fix: Use plain alternatives. "Also" not "Additionally." "Important" not "crucial." "Show" not "showcase."

**9. Copula avoidance**
Watch for: "serves as", "stands as", "marks", "represents [a]", "features", "boasts", "offers"
Fix: Just say "is", "are", "has." "Gallery 825 is LAAA's exhibition space" not "serves as."

**10. Negative parallelisms**
Watch for: "It's not just X, it's Y", "Not only... but also...", "not a mirror but a portal", "not X, it's Y"
Fix: State the point directly. One clear claim beats a dramatic contrast.

**11. Rule of three overuse**
Watch for: Forced triads ("innovation, inspiration, and insights"), "adjective, adjective, and adjective"
Fix: Use the natural number of items. Sometimes it's two. Sometimes four.

**12. Synonym cycling (elegant variation)**
Watch for: "protagonist... main character... central figure... hero", using different elaborate phrases for the same thing every sentence
Fix: Pick the clearest word and reuse it. Repetition is fine. LLMs have a repetition-penalty that forces them to cycle synonyms unnaturally.

**13. False ranges**
Watch for: "from X to Y" where X and Y aren't on a meaningful scale — "from the Big Bang to dark matter", "from problem-solving to artistic expression"
Fix: List items directly. Only use "from...to..." for actual scales (quantitative, temporal, categorical with clear ordering).

**14. Overused hedging constructions**
Watch for: "could potentially possibly be argued that", stacked qualifiers
Fix: Pick a confidence level and commit to it.

### Style Patterns

**15. Em dashes — banned entirely**
Watch for: Em dashes (—), en dashes used as em dashes (–), and regular hyphens/double hyphens used as em dash surrogates (- or --).
Fix: Replace with periods, commas, colons, or parentheses. Never use em dashes or em dash surrogates. They're the most overused punctuation mark in AI writing. A period or comma always works.

**16. Boldface overuse**
Watch for: mechanical bolding of every term, "key takeaways" style bold, **Performance:** descriptions, ordered lists where every item starts with bold
Fix: Remove mechanical bolding. Use bold sparingly for genuine emphasis.

**17. Inline-header lists**
Watch for: "**Performance:** Performance improved...", "1. **Historical Context Post-WWII Era:** The world was..."
Fix: Convert to prose or use cleaner list format without the bold-colon pattern.

**18. Title Case headings**
Watch for: "Strategic Negotiations And Global Partnerships"
Fix: Use sentence case: "Strategic negotiations and global partnerships"

**19. Emojis in professional text**
Fix: Remove decorative emojis from headers and bullet points.

**20. Markdown/formatting artifacts**
Watch for: curly quotes in code, bullet characters (•) instead of proper markup, explicit numbers (1.) instead of list markup, hash marks (#) as bullets
Fix: Use appropriate formatting for the medium.

### Communication Patterns

**21. Collaborative artifacts**
Watch for: "I hope this helps!", "Certainly!", "Great question!", "Would you like me to...", "Let me know if you'd like..."
Fix: Remove. Just deliver the content.

**22. Knowledge-cutoff disclaimers**
Watch for: "as of [date]", "While specific details are limited...", "based on available information"
Fix: State what you know. If uncertain, say so plainly.

**23. Sycophantic tone**
Watch for: "That's an excellent point!", "You're absolutely right!", "What a thoughtful observation!"
Fix: Engage with the substance, not the person.

### Filler and Structure

**24. Filler phrases**
Common offenders: "In order to" → "To"; "Due to the fact that" → "Because"; "It is important to note that" → cut entirely; "has the ability to" → "can"; "It is worth mentioning" → just mention it

**25. Generic positive conclusions**
Watch for: "The future looks bright", "Exciting times lie ahead", "journey toward excellence", vaguely positive assessments
Fix: End with a specific fact, question, or honest assessment.

**26. Leads treating titles as entities**
Watch for: Opening sentences that define an article/document title as if it's a standalone thing — "'The Effects of Foreign Language Anxiety' refers to..."
Fix: Define the actual concept, not the title.

**27. Vague see-also padding**
Watch for: Ending with broad tangentially related topics
Fix: Only link to genuinely relevant specific items, or cut the section entirely.

---

## ADDITIONAL PATTERNS (from tropes.fyi)

The following patterns come from [tropes.fyi](https://tropes.fyi) by Ossama. Many overlap with the 27 above but add sharper examples and new categories.

### Sentence Structure

**28. "Not X. Not Y. Just Z." (Dramatic countdown)**
Watch for: Negating two or more things before revealing the actual point. Creates false suspense.
Examples: "Not a bug. Not a feature. A fundamental design flaw." / "not recklessly, not completely, but enough"
Fix: State the point directly. Skip the buildup.

**29. "The X? A Y." (Self-posed rhetorical Q&A)**
Watch for: Asking a question nobody asked, then answering it for dramatic effect.
Examples: "The result? Devastating." / "The worst part? Nobody saw it coming."
Fix: Just make the statement. If the reader would ask the question naturally, maybe keep it. Otherwise cut.

**30. Anaphora abuse**
Watch for: Repeating the same sentence opening 3+ times in succession.
Examples: "They could expose... They could offer... They could provide... They could create..."
Fix: Vary sentence structure. Combine or cut repetitions.

**31. Gerund fragment litany**
Watch for: A claim followed by a stream of verbless gerund fragments as separate sentences.
Examples: "Fixing small bugs. Writing straightforward features. Implementing well-defined tickets."
Fix: Fold into the preceding sentence as a list, or cut if they add nothing.

### Paragraph Structure

**32. Short punchy fragments as manufactured emphasis**
Watch for: One-thought sentences stacked as standalone paragraphs. RLHF-driven "readability" that no human writes in first draft.
Examples: "He published this. Openly. In a book. As a priest." / "Platforms do."
Fix: Combine into normal sentences. Real emphasis comes from content, not formatting.

**33. Listicle in a trench coat**
Watch for: Numbered/labeled points dressed as prose. "The first wall is... The second wall is... The third wall is..."
Fix: Either commit to a list or write actual prose. Don't disguise one as the other.

### Tone

**34. "Here's the kicker" (false suspense transitions)**
Watch for: "Here's the thing", "Here's where it gets interesting", "Here's what most people miss"
Fix: Cut the windup. Just say the thing.

**35. "Think of it as..." (patronizing analogy)**
Watch for: Unsolicited analogies that assume the reader can't understand the concept directly.
Examples: "Think of it like a highway system for data."
Fix: State the concept. Add an analogy only if the concept is genuinely unfamiliar to the audience.

**36. "Imagine a world where..." (futurism invitation)**
Watch for: Opening with "Imagine" followed by a list of wonderful things.
Fix: Describe what actually exists or what you're actually building. Skip the hypothetical utopia.

**37. False vulnerability**
Watch for: Simulated self-awareness that reads as performative. "And yes, I'm openly in love with..." / "This is not a rant; it's a diagnosis"
Fix: Real vulnerability is specific and uncomfortable. If it sounds polished and risk-free, cut it.

**38. "The truth is simple" (asserting clarity instead of proving it)**
Watch for: "The reality is simpler", "History is unambiguous on this point", "History is clear, the metrics are clear"
Fix: If your point is clear, the reader will notice. You don't need to announce it.

**39. Grandiose stakes inflation**
Watch for: Every argument inflated to world-historical significance. "This will reshape how we think about everything." / "will define the next era of computing"
Fix: Scale claims to what you can actually support. Most things are not civilization-defining.

**40. "Let's break this down" (pedagogical hand-holding)**
Watch for: "Let's unpack this", "Let's explore", "Let's dive in"
Fix: Just start explaining. The reader doesn't need permission to follow along.

**41. Invented concept labels**
Watch for: Made-up compound terms used as if they're established jargon. "the supervision paradox", "the acceleration trap", "workload creep"
Fix: Describe the phenomenon in plain language. If a label is useful, define it explicitly rather than using it as shorthand.

### Formatting

**42. Gerund-heavy constructions where infinitives are cleaner**
Watch for: AI defaults to gerunds ("unlocking capacity", "cutting positions", "reducing overhead") when infinitives read more naturally.
Fix: Use infinitives when the sentence describes a goal or outcome: "to unlock capacity, not cut positions" beats "unlocking capacity, not cutting positions." Related to pattern #4 but applies to verb forms generally, not just participle phrases.

**43. Bulleted bold-lead lists -> structured paragraphs**

Watch for: Sections where each point is a bullet starting with a bold phrase followed by an em dash, colon, or dash and explanation. This is one of the most common AI structural patterns. It appears in emails, proposals, specs, READMEs, and documentation. The combination of bullet + bold opener + em dash is almost never how humans write outside of slide decks.

Negative examples (do not produce these):
```
- **Agent-blind** — Agents never see raw credentials. The vault proxy injects them transparently.
- **Human-in-the-loop** — Sensitive credential access requires explicit approval.
- **Auditable** — Every credential access is logged with agent identity and session.
```

```
- **Start with one department** — prove value there before going broad
- **Lead with examples** — we'll come in with case studies
```

```
- **Performance:** Improved latency by 40% across all endpoints.
- **Reliability:** Reduced error rate from 2.3% to 0.1%.
- **Cost:** Cut infrastructure spend by $12K/month.
```

Positive examples (produce these instead):
```
**Agent-blind.** Agents never see raw credentials. The vault proxy injects them transparently into outbound requests. Even if the agent is compromised, it cannot extract the real key.

**Human-in-the-loop.** Sensitive credential access requires explicit approval via push notification. The human sees what is being requested, by whom, and why before deciding.

**Auditable.** Every credential access is logged with agent identity, session, tool, and stated purpose. The audit trail is queryable and exportable.
```

```
**Start with one department.** Prove value there before going broad. HR is the leading candidate because they already have budget allocated.

**Lead with examples, not pure discovery.** We'll come in with concrete case studies from similar-sized orgs rather than a blank-slate discovery phase.
```

The pattern: drop the bullet. The bold phrase becomes a sentence opener ending with a period. The explanation follows as regular prose in the same paragraph. Each point gets its own paragraph with a blank line between them.

This gives you the same scannability (bold phrases act as visual anchors) with the depth that helps readers understand context and rationale. It reads like a human wrote it in a document rather than an AI generating a structured list.

When to keep bullets: true lists where items need no explanation (file paths, tool names, prerequisites, command flags). Even then, precede the list with a sentence explaining what it contains.

**44. Unicode decoration**
Watch for: Unicode arrows (->), smart/curly quotes, and special characters that can't be typed on a standard keyboard. Claude especially loves ->.
Fix: Use -> or plain ASCII. Straight quotes. Let the rendering layer handle typography.

**45. Fractal summaries**
Watch for: "What I'm going to tell you; what I'm telling you; what I just told you" at every level. Every subsection gets a summary. The document gets a summary. The summary gets a summary.
Fix: Say it once. Trust the reader to retain it.

### Email-Specific Patterns

**46. Numeric date formats in emails**
Watch for: Slash-delimited dates like "3/31", "03/31/2026", "3/31 afternoon".
Fix: Use human-readable format with abbreviated day and month: "Tue Mar 31" not "3/31". Easier to scan and less ambiguous across locales.

**47. Inline hyperlinks for collaborative/action URLs**
Watch for: Hiding important URLs behind hyperlinked text like "[Vote for a time](url)" or "[Review the doc](url)" when the reader needs to interact with the link. This includes scheduling polls, shared Notion pages, Google Docs/Sheets for review, Figma files, Miro boards, or anything collaborative.
Fix: Always include the full URL as plain text in email bodies for anything you expect the reader to click and interact with. Recipients may be reading in plain-text clients, previewing in notifications, or forwarding, and they need to see there's a URL behind it. Inline hyperlinks are fine for supplementary references (documentation links, articles, API docs, background reading) where the reader doesn't need to take action.

---

## Reference

Adapted from [blader/humanizer](https://github.com/blader/humanizer) (v2.1.1), [Wikipedia:Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) (retrieved 2026-02-13, maintained by WikiProject AI Cleanup), and [tropes.fyi](https://tropes.fyi) by [Ossama](https://ossama.is) (retrieved 2026-03-13).
