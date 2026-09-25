# Lore seams — 2026-09-25

A **seam** is a place where the lore says something and the game has no equivalent. Either
nothing is built, or it is built but never reaches the player.

**Sources:**

- `DUSTWARD-LORE.md`, revision 2. Its canon markers are respected: `[C]` means shipped,
  `[★]` means canon per Mikey, and `[?]` means deliberately open.
- The game's own comments.
- The game's player-facing text: item descriptions, dialogue, logs and blurbs.

Everything was checked against the **merged tree**: this branch plus PR 39, since PR 39 builds
some of the lore. Where PR 39 is what closes a seam, that is said.

**Method.** Every lore term was counted three ways across the script: in comments, in string
literals (what a player can read), and in identifiers (what the code acts on). A term that
lives only in comments, or has text but no code, is a candidate. Each candidate was then read
at its call sites. Nothing here is taken from the bible's own "not yet built" notes without
checking the code first.

---

## Where to start

Ranked by how much lore weight each carries against what it costs to close.

1. **53 authored lines the player never hears** (§1.1). This includes lines the bible quotes
   as shipped canon: Verity's thesis, the redoubt garrison, the whole night-ecology table and
   the Messengers' tongue. A few lines of code fix it. It is the same finding as
   `CODE-AUDIT.md` §5.1, seen from the lore side.
2. **Mother's seal promises a mechanic that does not exist** (§2.1). She tells you only one of
   hers can open it, but anybody can force it, and her scene stops at the door. The bible
   calls what she knows "the scene at the bottom of that cave, and nothing else in the setting
   carries more".
3. **The Church has no voice** (§3.1). The bible says the gap between what the Church teaches
   and what is true "*is* the setting's engine". In the game only the true side is ever spoken.
4. **Half the conviction reactions never fire** (§1.2). The bible says the compassionate hate
   a sack, the ambitious resent retreat and the inquisitive care about formulae. None of those
   events is ever raised.
5. **The largest unbuilt pieces:** the Last Scholar, the kingdom's crater, and the tablets of
   the Deep (§4). The bible already marks them unbuilt. They are listed so the list is
   complete.

---

## 1. Written and shipped, but silent

The lore exists in the code as text or data. Nothing carries it to the player.

### 1.1 The barks: 53 lines, set on bodies, never spoken

`c.barks` is set in eight places:

- the redoubt's vat-soldiers
- three of the immortals (`spawnImmortals`)
- the Archivist
- the bore-thing in the rock
- copies of the `bark:` fields in `GAUNTS` (via `spawnGaunt`)
- copies of the `bark:` fields in `DEEP_KIN` (via `spawnDeep`)

**Nothing reads `c.barks`.** The only barks spoken are `BOSS_BARKS[bossKey]` and the town
tables.

The bible quotes several of these as `[C]`, shipped canon:

| bible | the line | where it actually lives |
|---|---|---|
| §13 Verity, "the shipped bark is already the thesis" | *"I have not eaten in ninety years. I do not miss it. That is the frightening part."* | `c.barks` in `spawnImmortals`; also in a code comment |
| §12 the Redoubts | *"THE LINE HOLDS."* · *"I was made for this day. The day never came."* · *"Are you the relief? You are nine generations late."* | `c.barks` on the vat-soldiers |
| §10 the night ecology table | Gaunt *"...khhhh..."*, Shrike *(a sound like scissors)*, Choir-Kin *(the chord)* | `GAUNTS[*].bark` |
| §5 the Messengers "speak an ancient tongue" | *"SHEM. SHEM ARAK."* · *(the vowels arrive before the consonants)* | `GAUNTS.messenger.bark`, `GAUNTS.herald.bark` |
| §18 the Eyes of Ainzopha'ar | *(it does not blink)* · *(a hymn, sung wrong)* | `GAUNTS.eye.bark` |
| §2 the purebloods ("the Kept") | *(it is not afraid of the light. It is the only one that is not.)* and the rest | `DEEP_KIN[*].bark` |

The bible's voice guide (§17.9) says lore should live "in barks, item text and stumbled-into
lines". These are exactly those barks, and they are the part that never ships. Sister Ash's
*"I burned my order"* does reach the player, because it is in `BOSS_BARKS`.

**Close it:** add a few lines beside the `BOSS_BARKS` block that speak `pick(c.barks)` on the
same `barkCd` cooldown when a player body is near. `tools/watchers.js` asserts that
Messengers "talk". Today that is true only in the sense that they own lines. It should
assert that a line is *said*.

### 1.2 Convictions that are weighed and never fired

`deed(kind)` moves every companion's regard by their conviction's weight for `kind`. The
table weighs six kinds that **no call site ever emits**. `git log -S` finds no call in the
history either, so these were written and never wired, not lost later.

| kind | who it is meant to move | bible |
|---|---|---|
| `sack` | Compassionate −3.0, Cruel +2.2, Devout −1.4, Ambitious +1.0 and three more | §14: "the compassionate hate a sacked town … the cruel enjoy the sack" |
| `retreat` | Ambitious −1.4, Haunted −1.0 | §14: "the ambitious … resent retreat" |
| `formula` | Inquisitive +2.0 | §14: "the inquisitive care about recovered formulae" |
| `heal` | Compassionate +0.9 | — |
| `rescued` | Loyal +3.0, the biggest positive weight Loyal has | — |
| `mercy` | Cruel −1.2 | — |

`sack` is the one to think about. The player cannot sack a town. PR 39 makes sieges break walls
for warbands, but not for you. So either the player gains a sack, or `sack` should be read as
"a sack you could have stopped".

### 1.3 The profane gift is never a crime

The bible (§12) says the Church "burns the profane gift". `CRIMES.formula` exists: bounty
260, labelled *"working a formula inside the walls"*. It is the only crime of the ten that is
never raised. Casting in a town costs nothing with the law. `raising` and `walkdead` are
raised, so necromancy specifically is policed, but alchemy in general is not. Hollowmere's
exemption for `formula` is unreachable for the same reason.

### 1.4 Sanctified Ash

Breaking a shrine yields it. Its description promises that "an alchemist has other uses". No
recipe or rite consumes it. The bible's §18 asks whether a shrine stone is a small
Philosopher Stone, and Sanctified Ash is the obvious place for an answer to land.

---

## 2. The game's own text promises a mechanic

### 2.1 Mother's seal

What is built is good. Mother is placed in a warren vault. She notices a Hollow, or anybody
with the dust art, walking her warren. She speaks when you reach her door, reading the world: your
dust mastery, the corpse-fields you have stood on, the Sixfold, the Attention. She opens a
quest thread and fires `deed('found_mother')`.

The seam is the door. Her lines, and the thread's hint, say it holds against everyone but one
of hers:

> *"THE SEAL DOES NOT ANSWER. It was welded against something you are not. Bring one of hers —
> a Hollow, awake — and it is a different door."*

> *"You came back finished. Then put your hand on it — the weld only ever held against a
> rider."*

In code:

- Her vault door is an ordinary barred door, and FORCE IT works for any body with a shoulder
  (`forceTick`). Nothing checks for a Hollow.
- Behind it is the standard vault chest: codex, tomes, formulae.
- `mother` has no `opened` state. `motherTick` returns once `mother.spoken` is set, so the
  scene runs exactly once.

The bible places "the thing she knows" behind that door: she let a man cut pieces off her,
those pieces killed Malathuun, and she is "the only being alive who knows the whole of what
happened". None of that is said. The man, who is the Last Scholar, is never mentioned in play.

**Close it:**

- Gate her door on `hollowTier >= 2`.
- Give her an `opened` state.
- Put the second half of her scene behind it.

This is the one place in the game that is built to reveal the cosmology, and the bible says
revealing it is the player's job ("the player is the only one positioned to assemble it").

### 2.2 The Dame's *"do not come back"*

`estate.deal` is only ever checked for truthiness, as a one-time guard. `'taken'` opens the
orchard exactly as walking the rows does. The Dame's *"take them, and do not come back"* is
not enforced, and `'kept'` ("Greenrest follows the Aldercotts") does not stop the
invitations. This is `CODE-AUDIT.md` §5.4. It is a story seam more than a bible seam.

---

## 3. Built, but only one layer of it

### 3.1 The Church Teaches: no mouth

The bible says all Church material is written in two layers, what **the Church teaches** and
what is **true**, and that "the gap between the two layers *is* the setting's engine".

The true side is spoken in play. Scholars say it: *"The Purge burns people for the profane
gift and lights their pyres with the blessed one."* Mother says it. So does The First
Doctrine's description.

The Church's side is not spoken anywhere:

- **The Order has no talk tree.** `TALK_TREES` holds servant, dame, town, guard, leader and
  necro. A Paladin willing to talk falls into `openDiscourse(t, 'town')`, the same
  conversation as any villager.
- **The Inquisitor speaks procedure.** *"The Bastion sends terms before it sends fire.
  Once."* Never doctrine.
- **The doctrine itself never appears in any string.** That covers the searching gaze, the
  lost sun, mercy to the penitent, and the Fracture as the *Original Purge*. "Wild magic",
  the Church's word for Destruction, is not used anywhere either.

So the player hears the answer and never the caricature it answers.

**Close it:** a `purge` talk tree (Paladin, Inquisitor, Grand Marshal Vey) written in the
Church layer. It fits the machinery that already exists (`openDiscourse` and `TALK_TREES`).

### 3.2 The Messengers

This is mostly built, and well. Messengers learn (`learnMult`). They carry weapons of fire and
light that cannot be looted. After day 45 one stands in the Bastion yard, and on hunts they
march with the Paladins as `faction = 'purge'`.

There are two gaps against the bible:

- **They are a row in `GAUNTS`.** Any Messenger that arrives through the Attention (the
  `spawnGaunt(... 'messenger')` roll) keeps `faction: 'gaunt'`, which is hostile to
  everybody, the Order included. The bible says outright that they "should never be written
  as a gaunt variant" and "need their own faction in code, not `gaunt`".
- **Their job has no expression.** In the bible they are the custodians keeping the Eldest
  asleep, and "closing the Door is a job you do for them". Nothing about a Messenger
  responds to the Door, the tears or the Second Fracture clock.

### 3.3 The vocabulary that encodes the speaker

The bible §3 gives three words for Mother by speaker: *Priest* (the purebloods), *Conduit*
(the Golden Age's notes) and *Battery* (for us). None appears in play. "Kept Priest" is a
caste of the Kept, not a word for her. *The Eldest* appears only in comments. This is cheap to
close: it lives in item text, such as a Golden-Age note that says "conduit".

---

## 4. Named in the lore, absent from the game

The bible marks the first five as unbuilt itself. They are verified here: zero identifiers
and zero player-facing strings.

| lore | status in code |
|---|---|
| **The Last Scholar** (§11), "the largest unbuilt figure in the setting" | Absent. Nobody in play refers to him, including Mother. |
| **Tohu & Bohu, the Voidborn Twins** (§6) | Absent. Their whole hook, stasis for as long as the Last Scholar lives, depends on the Scholar existing. |
| **Philosopher Stones** (§15) | Absent. §1.4's Sanctified Ash is the natural door. |
| **Tablets of the Deep; the temple art that "points upward"** (§2, §15) | Absent. The Kept have altars (`deepAltars`) and no depictions. The only tablet in the code is the wax-tablet case on Lyre's model. |
| **The kingdom's crater** (§16): "should be the largest landmark in the world", and the natural site of the Door | Absent. The word "kingdom" reaches the player three times in all. |
| **Good Kami** (§6, §12) | Half built. The kami stone at Fallowend consecrates a charm, and the town is `kami: true`. Missing: the rites the bible lists (dirty water at a crossroads, dust not swept past a threshold at night, a dead name spoken into the wind) and the curse clause, *"you do not improvise with something that says yes"*. |
| **Old Har-Mageddon** (§6) | Never named in play. The Coil gestures at him (*"The wars are not the end. The wars are the appetite."*). The Paladin myth that sets him against Kami is absent. The bible says to keep this thin, so this is the lowest priority here. |
| **Lunar events, "several exist"** (§10) | Only the blood moon. The "eldritch moon" is held open in §18. |
| **A pureblood-descended human line** (§9), "a line not yet written" | Absent. Salt-cured is Saltmere's line, but it is about brine, not pale, light-averse blood. |
| **Homunculi attract artificial souls** (§9): "stray alchemical overflow, an Old One's dream, even a whole Watcher" | Absent in text and in mechanics. The race blurb is only "Vat-grown. Learns frighteningly fast". |
| **The chimera is her flesh** (§9): "Two peoples out of one prisoner" | The Hollow half is in play; Mother calls a Hollow one of hers. The chimera half is not: nothing a player can read ties the chimera to her. |
| **The Divine art's depth cost** (§7): "delve too deep and you are blinded by eldritch light and maddened" | No mechanic. |
| **The Dust art's reach** (§7): "vanish, plant a false memory, or raise a wall that was never there" | Two of three. *The Veil* vanishes, and a worn face makes "the law forget you". There is no illusory wall. |
| **The Hollow Citadel** (§16) | Four walkable storeys at Hollowmere, and nothing in them. The bible marks its purpose `[?]`. |

---

## 5. Checked and built

These have real equivalents in play, listed so nobody re-checks them:

- **The setting:** the Four Arts and attunement; the three immortalities and the Hollow
  ladder; the Attention's four tiers; the six Fracture stages and the Stillness; the Door and
  the closing rite.
- **Creatures:** the Brood, the Sixfold, the Larder-Kin and its midden, the Cairn Beast,
  Malathuun's Curse, the sundered ground, the Eyes of Ainzopha'ar, and the Kept (the
  purebloods) with their altars.
- **Factions:** the Compact, the Coil (with its stone and its exposure dialogue), and the
  redoubts with their Warden Automatons.
- **Relics:** the Aether Lance, deaf hands only.
- **Named figures:** Lyre and her sister arc, Lyonart, Saga, Czarina, Verity's steps, the
  Sigil-Bound's name ("ELEVEN NAMES"), the Ossuary King and the Sunken Crown, Sister Ash,
  Grand Marshal Vey, the Red Baroness, the Grazer, Osric and Wenna.
- **Origins and races:** all five generic origins; chimeras as alchemy-deaf with the Scaleborn
  exception; the golem kinds; Grave-bred.
- **Conviction machinery:** the education damper (`convictionSwing`, lettered × 0.65).
- **Legendaries:** all twelve, seeded by `placeLegends` and counted by `tools/legends.js`.

---

## 6. Drift noticed on the way

These are not seams, because both sides exist. But the bible and the code disagree, and one of
them should move.

- **The Codex and the Doctrine.** Bible §12 and §15 say the *Transmutation Codex* is the
  pre-Fracture Church text that "names them once, because they are the same name". In code
  that description belongs to **The First Doctrine**, a quest item. The Codex item has no
  description at all.
- **Where Mother is.** The bible (§6, §12, §16) puts her "in a cell at the bottom of a sealed
  redoubt". In code she is behind a vault at the bottom of a warren, "a cave under the
  mountains".
- **Mother and Malathuun.** In code she says *"You have stood on my brother. They cut him apart
  and sold the pieces by weight."* The bible makes Malathuun another Old One and a bystander,
  with no kinship to her.
- **Mother and the Dust art.** In code she says *"You work the dust art. That came out of
  me."* The bible's §7 does not tie Dust to her.

  These two may be deliberate code-side canon worth folding into the bible. They sharpen the
  story, but right now the bible does not know them.
- **The conviction list.** Bible §14 lists seven convictions and includes Cold. The code has
  eight, and **Loyal** is missing from the bible.

---

## Appendix: re-running the counts

`lore.js` parses the script block with `acorn`. It collects comments, string and template
literals, and identifiers separately. Then, for each term in a JSON list of
`[label, regex]` pairs, it prints the three counts and the first two string hits with their
lines. A term with 0 strings and 0 identifiers is absent from play. A term with strings but
no identifiers is text without a mechanic, which is only a lead until its call sites are
read. The two scripts are small enough to rewrite. They are not committed, because they
answer a question once rather than guard anything.
