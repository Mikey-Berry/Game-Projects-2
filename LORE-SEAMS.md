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
2. **Mother's seal promises a mechanic that does not exist** (§2.1) — **closed 2026-09-25,
   lines pending approval**. She tells you only one of hers can open it, but anybody could
   force it, and her scene stopped at the door. The bible calls what she knows "the scene at
   the bottom of that cave, and nothing else in the setting carries more". The door is hers
   now, and the second scene is drafted in §2.1.
3. **The Church has no voice** (§3.1) — **closed 2026-09-25, lines pending approval**. The
   bible says the gap between what the Church teaches and what is true "*is* the setting's
   engine". In the game only the true side was ever spoken. Paladins, the Inquisitor and Vey
   now speak the Church's side.
4. **Half the conviction reactions never fire** (§1.2) — **closed 2026-09-25**. The bible
   says the compassionate hate a sack, the ambitious resent retreat and the inquisitive care
   about formulae. None of those events was ever raised. All six fire now, and the player can
   sack a town (design flagged for review in §1.2).
5. **The largest unbuilt pieces:** the Last Scholar, the kingdom's crater, and the tablets of
   the Deep (§4). The bible already marks them unbuilt. They are listed so the list is
   complete. **The crater is built** (§4): the place, the danger, and the Door at the bottom of it.

---

## 1. Written and shipped, but silent

The lore exists in the code as text or data. Nothing carries it to the player.

### 1.1 The barks: 53 lines, set on bodies, never spoken — **closed**

Closed on 2026-09-25. Every kind with authored lines now says one when a player body is near, on its own storey. It uses `vpick`, so a bark never moves the world's dice. There is a 45–90 s wait per body and one line anywhere every 5 s. `tools/seams.js` claim 1 checks it: 19 of 19 kinds were silent before, and 19 of 19 speak after. The original finding:

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

### 1.2 Convictions that are weighed and never fired — **closed**

All six fire as of 2026-09-25. `tools/seams.js` claims 3 and 5 check them. Every one read
0.00 on the build before its fix.

- **`formula`:** a formula that comes apart under study at the bench, scaled by what it held
  (Tattered 0.47, Worn 0.8, Preserved 1.6). A tome does not count. Inquisitive +1.60 for a Worn
  Formula.
- **`retreat`:** a commanded band breaking off a fight, once per break-off. The leash turning
  it home is not a retreat. Ambitious −1.40.
- **`rescued`:** something dragging one of yours off is killed by one of yours, or you free a
  captive from the slavers' lines. A captor that dies of anything else (a gaunt, the cold) is
  not a rescue. Loyal +3.00.
- **`heal`:** a heal cast on a hurt stranger (a townsman, a drifter, a prisoner). The heal
  could not target a stranger before, so the targeting was opened to anybody who is not
  undead, a beast, a gaunt, or hostile. Once a day per person, and nothing for a body that
  was already whole, so a townsman is not a regard farm. Compassionate +0.45 at weight 0.5.
- **`mercy`:** TURN THEM LOOSE on a prisoner in your own cell. Cruel −1.20. **This needed a
  bug fix first:** the right-click on your own prisoner was claimed by the foe branch, which
  fires on any visible bandit, slaver or hostile. Every body you can seize is one of those,
  so the click ordered the crew to beat the prisoner. RANSOM, BREAK TO SERVICE, SELL and
  TURN THEM LOOSE could not be reached for anybody. A prisoner in your cell is no longer a
  foe to a plain right-click; ctrl still forces an attack.
- **`sack`:** the player can now sack a town. See below. Compassionate −3.00, Cruel +2.20.

**The sack, for your review.** The open question was whether the player gains a sack, or
whether `sack` means "a sack you could have stopped". I built the first; if you want the
second instead, it is a one-line move of the `deed` call. How it works:

- **Where:** the flag of a town whose seat is empty (the same test as CLAIM) offers
  **PUT *TOWN* TO THE TORCH** beside **CLAIM *TOWN* FOR YOURSELF**. You must stand within
  3 tiles of the flag, as for CLAIM. A town that is already sacked does not offer it.
- **What happens:** everything in the town's stores goes into the wagon (179 items from
  Dustport in the harness). The town is left `sacked = 5`, `sackKind = 'torch'`, exactly as a
  warband's sack leaves it, so it burns, chars and drops its roofs the same way. After five
  days the watch comes back, as for any sack.
- **The cost:** that town's standing drops by 400 (to the −300 floor), every other town's drops
  by 25, there is a world event, and the deed carries fame `k 9.0, r −12.0`. Conquest is
  `k 8, r −5` and lichdom is `k 12, r −14`.
- **Deliberately not done:** the menu kills nobody. A warband's sack kills a quarter of the
  civilians on a roll. I left that out because a menu entry that kills people off-screen is
  a bigger decision than this seam. What burns is the stock.

The original finding:

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

`sack` was the one to think about. The player could not sack a town. PR 39 makes sieges break
walls for warbands, but not for you.

### 1.3 The profane gift is never a crime — **closed**

Closed on 2026-09-25, per your ruling: profane arts only. A Dark or Destruction working by one of
yours, inside a town's walls and in sight of its watch, raises `CRIMES.formula` (bounty 260).
The raising spells keep their own, worse `raising` charge and are not billed twice. Divine
(the blessed art) and Dust are not crimes, and Hollowmere does not care. The watch books it
once per town per game hour, not once per bolt, so one street fight is one charge.
`tools/seams.js` claim 4 checks it: before, a firebolt or darkbolt added 0 bounty. The original
finding:

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

### 2.1 Mother's seal — **closed, lines pending your approval**

Closed on 2026-09-25. `tools/seams.js` claim 6 checks it, driving her door through the real
underground right-click; the build before showed FORCE IT to everybody.

- **The door is hers.** Her vault door no longer offers FORCE IT. To a party with no Hollow it
  reads **(THE SEAL DOES NOT ANSWER)**. To a Hollow still riding (tier below 2) it reads
  **(THE SEAL KNOWS A RIDER. IT HOLDS AGAINST ONE)**. A forcing order already under way in an
  old save is refused. Every other vault door still gives to a shoulder.
- **One of hers, finished, opens it.** A Hollow through the Nascent Rite (`hollowTier >= 2`)
  standing within 2.5 tiles of the door gets **A HAND ON THE SEAL**. The door opens, `mother.opened` is
  set and saved, the second scene is said, and her thread closes. If she has not spoken yet,
  her first scene runs first.
- **Old saves:** if a shoulder already broke her bar, a finished Hollow standing in her room
  hears the same scene, with its own opening line.
- **The thread** now says what the door wants in the Hollow branch, since it is the one door
  in the game that is not forced.
- Her vault's chest and the Deep Warden are unchanged, so for anybody else that vault's loot is
  now out of reach. It is one vault of about forty-five.

**The second scene, drafted for your approval.** It carries the bible's §6 *"the thing she
knows"* and nothing from §4: nothing about what is on the throne, the Messengers, or what ended
the first civilisation. The man is never named, and his age and survival are not explained.
It uses her true name once, which the bible marks provisional, so it is a single line to change.

> THE SEAL. *(name)* puts a hand flat on the weld, and eleven names deep of golden-age alloy lets
> go at once, like a held breath. It only ever held against a rider.

1. COME IN. Nobody has said that to anybody in this room in nine hundred years. I wanted to hear
   how it sounds.
2. You want to know what you are. You are a piece of me, cut off with my leave, and you are owed
   the reason I gave it.
3. A man came down here while the kingdom was still drinking me. He had the old face, the one my
   first congregation wore before any of your people went up into the light. I had not seen it
   in a very long time.
4. He told me what the alchemists upstairs were about to do, and that they would not survive
   it. He asked for pieces of me to make hunters with, and he told me what the hunters would be
   for. Nobody had asked me for anything since my congregation. They had only taken.
5. I said yes. To the people who built this cell. I would say it again, and I would like you to
   understand that it was not forgiveness.
6. It worked. You are why anybody is left up there. And when the sky came open, something else
   woke into the fire: one of my own kind, who had never been found and never been drained and
   had done nothing to anybody.
7. Malathuun. My pieces put it down. I felt every one of them do it, from in here. I did not try
   to stop them. I have had nine generations in this room to decide whether that is the worst
   thing I have done.
8. That is the whole of it. The man knows half, and your people know none of it. I am the only
   one who watched both halves.
9. The ones who built this room wrote a number on the door instead of a name. My name is
   Llammialith. I have given it to very few. You are the first of mine to come back whole enough
   to carry it.
10. Go up. I am not going anywhere. But somebody knows now, and it is one of mine, and that is
    more than I had an hour ago.

Lines worth your eye in particular:

- **Line 3** tells the player the man was a pureblood ("the old face"). That is `[★]` canon in
  §11, not author-only, but it is the first time play would carry it.
- **Line 7** has her choosing not to stop them. The bible says she watched; whether she could
  have intervened is not written anywhere.
- **Line 9** leaves the serial number as "a number" because its format is still an open question.

The original finding:

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

### 3.1 The Church Teaches: no mouth — **closed, lines pending your approval**

Closed on 2026-09-25. `tools/seams.js` claim 7 checks it. On the build before, a right-click on
a Paladin at peace with you became a move order, and the Inquisitor and Vey opened the
townsfolk tree.

- **A `purge` talk tree.** Every Paladin line is in the Church's layer. The player's options
  are where the true layer can come in, and the Order answers it in its own terms.
- **Who reaches it:** a Paladin at peace with you, from a plain right-click (the Order is its
  own faction, so that click matched nothing before). The Inquisitor under the white banner,
  from TALK on the neutral menu. Vey in the Bastion, with one extra option. A Paladin hunting
  you is still a foe, and the Watcher in the yard is still silent.

**The lines, drafted for your approval.** The greeting depends on who is speaking:

- **Vey:** "You are standing in the Bastion because I have not yet decided otherwise. Say what
  you came to say."
- **Inquisitor:** "The Order speaks before it burns. Today I am the speaking. Ask."
- **Paladin, once there are poles:** "Walk in the Light, stranger. The poles at the gate are
  there so the road remembers what happens to the ones who do not."
- **Paladin otherwise:** "Walk in the Light, stranger. Or walk on. Those are the two roads, and
  there is not a third."

| You say | Gate | They say |
|---|---|---|
| Who is it you pray to? | — | Ainzopha'ar. The Light without end. His eye goes over the world looking for the sun that was lost, and one day it finds it, and on that day everything anybody ever worked in the dark is seen. All of it. By Him. |
| → And the miracles? | — | Mercy. The blessed gift is His hand held out to the penitent, and a hand held out can be taken back. Pray you never see what that looks like. |
| Why is your order called the Purge? | — | For the Original Purge. The kingdom reached up for Him, and He answered once, and there was no kingdom. We carry the name so that nobody forgets the price of reaching. |
| → And the rest of us? | — | Spared. Left standing to do better. Every morning the sky is still up there is another morning He has not finished the work. We would rather He did not have to. |
| Why burn them? | — | The profane gift is the kingdom's sin, carried in one body. We do not hate them for it. We burn it out of the world before He comes looking for it and finds the rest of us standing near. |
| → With fire from the blessed gift. | — | With His own fire. What else would you light it with? |
| There is something standing in your yard. | a Messenger is in the Bastion yard | It came to the yard and stood, and it has not moved since, and it has not spoken. We do not cross in front of it. He sent it. Who else sends? |
| The light is in me. | divine gift | Then you have been shown mercy, and one day you will be asked what you did with it. The ones who are asked the most are the ones who were given the most. |
| And the ones born with the dark gift? | dark gift | Then the Light has set them a test. The ones who fail it, we meet at the pole. The ones who pass it never lift the gift once in their lives. I have met two. |
| And the fire-workers? | Destruction I+ | Wild magic. Fire out of the air, iron gone soft in the hand. The kingdom worked that, near the end. Inside a wall it is a crime. Outside one we watch it, and it is always nearer the pole than it thinks. |
| A tear closes for the blessed art and the profane one alike. It is the same well. | Inquisitive | That is a Scholar's sentence, and you should not say it near a Paladin. The Light suffers the profane to work so that the profane can be found. You have it backwards, and you have it backwards out loud. |
| What does the Order want with me? | Vey only | Nothing yet. You are a name in a ledger with nothing written beside it. Keep it that way. I would rather not learn how you fight. |

Notes for your review:

- **No effects.** Nothing in the tree moves rep, wrath or bounty. It is a voice, not a mechanic.
  If you want the dark-gift or Scholar options to carry risk, that is a separate call.
- **What stays out:** the name as a corruption of *Ain Soph Aur*, and anything from §4. The
  Church does not know it and would not say it.
- **The "wild" line** follows your formula-crime ruling: Destruction is a crime inside a
  Church town's walls.

The original finding:

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
| **The kingdom's crater** (§16): "should be the largest landmark in the world", and the natural site of the Door | **Built, 2026-09-25, in three phases.** **The place:** at the dead centre of every world, with the world placed around it, in four rings: the approach (ash, dead trees leaning away from the middle, the Order's posts, bones), the glass (fused ground, standing slabs with shadows burned onto them), the rim (a wall with four breaches), and the bowl with a veil of light over it. **The danger:** the glass and the bowl are held day and night by Watchers the dawn does not take; three Messengers stand at peace with them; what is killed grows back out of sight; at night telegraphed strikes of light come down on whoever is in the glass. **The reason:** the capital's footings across the bowl, a colonnade round the middle, seven caches, and **the Custodian**, a Messenger boss at the middle until the Second Fracture. Then it is gone and the Door opens there, so closing the Door is an expedition into the crater. `tools/crater.js` checks all 15 claims. **For your review:** killing the Custodian before the Fracture raises the Attention by 8. Whether it should cost more (say, Fracture progress) is your call. |
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
  Malathuun's Curse, the sundered ground, and the Kept (the purebloods) with their altars.
- **Built but broken, and fixed on 2026-09-25:** the **Eyes of Ainzopha'ar** and the
  **Shoallings**. An Eye has 22 blood and a Shoalling 18, against absolute down and rise
  lines of 40 and 50 blood. So both went down on their first tick and could never get up,
  and a Marrow Tick (40) stayed down after its first scratch. `tools/watchers.js` never
  noticed, because it casts the Eye's gaze by hand. A pool of 50 or less now falls and
  rises at the same shares of itself (`tools/seams.js` claim 2).
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
