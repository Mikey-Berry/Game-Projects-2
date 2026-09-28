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
   the scene approved 2026-09-26** with three changes: the Deep Warden stands down, no "my
   brother", and the scene pages through the window a line at a time. She tells you only one
   of hers can open it, but anybody could force it, and her scene stopped at the door. The
   bible calls what she knows "the scene at the bottom of that cave, and nothing else in the
   setting carries more". The door is hers now, and the second scene is in §2.1.
3. **The Church has no voice** (§3.1) — **closed 2026-09-25, lines approved**. The
   bible says the gap between what the Church teaches and what is true "*is* the setting's
   engine". In the game only the true side was ever spoken. Paladins, the Inquisitor and Vey
   now speak the Church's side.
4. **Half the conviction reactions never fire** (§1.2) — **closed 2026-09-25**. The bible
   says the compassionate hate a sack, the ambitious resent retreat and the inquisitive care
   about formulae. None of those events was ever raised. All six fire now, and the player can
   sack a town, for half of its stores (§1.2).
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
  **Approved 2026-09-25.**
- **`mercy`:** TURN THEM LOOSE on a prisoner in your own cell. Cruel −1.20. **This needed a
  bug fix first:** the right-click on your own prisoner was claimed by the foe branch, which
  fires on any visible bandit, slaver or hostile. Every body you can seize is one of those,
  so the click ordered the crew to beat the prisoner. RANSOM, BREAK TO SERVICE, SELL and
  TURN THEM LOOSE could not be reached for anybody. A prisoner in your cell is no longer a
  foe to a plain right-click; ctrl still forces an attack.
- **`sack`:** the player can now sack a town. See below. Compassionate −3.00, Cruel +2.20.

**The sack, as ruled on 2026-09-25.** The open question was whether the player gains a sack,
or whether `sack` means "a sack you could have stopped". It is the first, with the haul capped
at half the town's stores. How it works:

- **Where:** the flag of a town whose seat is empty (the same test as CLAIM) offers
  **PUT *TOWN* TO THE TORCH** beside **CLAIM *TOWN* FOR YOURSELF**. You must stand within
  3 tiles of the flag, as for CLAIM. A town that is already sacked does not offer it.
- **What happens:** half of each line of the town's stores, rounded down, goes into the
  wagon, and the rest burns (81 from Dustport in the harness; a line of one burns whole). The
  log says how much was carried and how much burned. The town is left `sacked = 5`, `sackKind = 'torch'`, exactly as a
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

### 1.4 Sanctified Ash — **closed 2026-09-26**

Your ruling: shrine stones are minor Philosopher Stones, and crushing one gives the ash. Whole,
the stone is read at the bench for insight. Crushed, it is a reagent that helps the Door rite
without being needed for it, since it is hard to get. `tools/seams.js` claim 10 checks it; on
the build before, a broken shrine gave ash and nothing used it.

- **Breaking a shrine gives a Shrine Stone** (`s_stone`), whole. It used to be 2 to 4 measures
  of ash and 12 insight on the spot; both are in the stone now, and you choose.
- **At the bench it reads like a formula**, for 20 insight (44 hours at one scholar), through
  the same STUDY ALL. It does not count as a recovered formula for the Inquisitive.
- **CRUSH** (in the wagon and in anybody's pack) turns it into 3 measures of Sanctified Ash.
- **The ash carries the Door's hold.** While the hold still has work in it, the rite burns a
  measure at a time from the camp's stores, and each one runs the hold at 1.5x for 2.5 game
  hours. The seal's price is unchanged, and the rite lands the same without any.
- **The bible:** §18's open question is answered by this ruling. It is worth folding into the
  bible's §15 (Philosopher Stones) when you next revise it.

The options that were put to you:

Breaking a shrine yields it. Its description promises that "an alchemist has other uses". No
recipe or rite consumes it. The bible's §18 asks whether a shrine stone is a small
Philosopher Stone, and Sanctified Ash is the obvious place for an answer to land.

The options, each with the answer it gives to the §18 question:

1. **Anointing** (*no: it is the blessed gift, stored*). Work a measure into one of your dead
   and for a day the consecrated ground does not diminish it: it takes, hits and calls as it
   would anywhere. A shrine's own ash walks your dead through the next shrine. It needs a
   rite and nothing else new, since shrines already diminish the dead by ground.
2. **A sink for the closing** (*no, but it is the same power*). The Door rite takes ash as an
   optional reagent that cuts the work: breaking the faithful's stones is how a necromancer
   does the job the Church thinks it is doing. Late, and it gives the ash a price late.
3. **Burned at the bench** (*yes, a very small one*). Spend a measure for a burst of research,
   and pay for it in Attention, because it is a tap on the source like any other. One line in
   the research code and one in `bumpNotice`.
4. **A Messenger can smell it** (*no, and they know what it is*). Carrying ash reads to a
   Messenger abroad the way ATTENDED does. A cost for any of the above rather than a use.
5. **A law, once** (*yes, and it is what a Stone is for*). Enough ash (say twelve measures)
   makes one Philosopher's working: rewrite one rule of one place for good, such as a town that
   no longer diminishes the dead, or a tear that cannot open. The biggest of these, and the
   one that commits the bible.

I recommended 1 with 4 as its cost; you chose a version of 3 and 2 instead.

---

## 2. The game's own text promises a mechanic

### 2.1 Mother's seal — **closed; the scene approved 2026-09-26, with three changes**

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

**Your three changes (2026-09-26):**

- **The Deep Warden stands down.** Every warren vault has one over its chest, so "COME IN" was
  followed by an automaton with an Aether Lance attacking the one she let in. When her door
  opens to one of hers, her Warden stops fighting your people (`stoodDown`, saved). It takes
  it up again, for good, if one of yours strikes it. She says one new line, second, after
  COME IN, while it stands: *"Mind the thing by the chest. It was built to keep me, and it
  has never once understood that I was not the one leaving."*
- **No "my brother".** Her first scene's corpse-site line now reads *"You have stood on one of
  my kind. They cut it apart and sold the pieces by weight. They kept me because a corpse is a
  windfall and a prisoner is an income."* That matches line 6 of the second scene and the
  bible, which gives them no kinship.
- **A line at a time.** Both scenes page through the window: GO ON (or space, or enter) for the
  next line, LEAVE at the end. Each line goes to the log as it is shown. Closing early sends
  the rest to the log, so nothing is lost. The journal is updated when the scene ends, so it
  no longer says she gave her name before she has said it. When one of hers opens the seal
  before she has spoken, the first scene runs straight into the second in one window.

**The second scene, as approved.** It carries the bible's §6 *"the thing she
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

### 3.1 The Church Teaches: no mouth — **closed, lines approved 2026-09-25**

Closed on 2026-09-25. `tools/seams.js` claim 7 checks it. On the build before, a right-click on
a Paladin at peace with you became a move order, and the Inquisitor and Vey opened the
townsfolk tree.

- **A `purge` talk tree.** Every Paladin line is in the Church's layer. The player's options
  are where the true layer can come in, and the Order answers it in its own terms.
- **Who reaches it:** a Paladin at peace with you, from a plain right-click (the Order is its
  own faction, so that click matched nothing before). The Inquisitor under the white banner,
  from TALK on the neutral menu. Vey in the Bastion, with one extra option. A Paladin hunting
  you is still a foe, and the Watcher in the yard is still silent.

**The lines, approved as written.** The greeting depends on who is speaking:

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

Notes:

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

### 3.2 The Messengers — **faction closed 2026-09-25**

Your ruling: in the crater they allow nothing close, the Order included; anywhere else they are
their own faction, beside the Paladins, and there are more of them late. `tools/seams.js` claim
8 checks it; on the build before, a Messenger stood up abroad was faction `gaunt`.

- **Abroad, `faction: 'messenger'`.** `spawnGaunt` makes every Messenger and Herald one. At
  peace with the Order. At war with the Watchers (the gaunt clause stays as the bible wants
  it), the Kept, and the walking dead, including neutral dead. They hunt a living one of yours
  when the Order would (the dead near you, or your name), and on one reading of their own: once
  the Attention is ATTENDED, whatever the Order thinks. Killing one raises the Order's wrath.
  They are not a Watcher for a cull contract and the warding light does not turn them.
- **In the crater, the crater's own.** The bowl's three and the Guardian are handed back to
  `gaunt`: at peace with the crater's Watchers, and at war with the Order and with a Messenger
  from abroad alike.
- **Late in the clock, more.** The world's ceiling is 2, then 3 at THE WATCHERS WAKE, then 4 at
  the Second Fracture. Patrols carry one from THE WATCHERS WAKE on (12% a patrol, 36% by the
  end); hunts go from 22% to 52%. The Attention's roll goes from 1 in 67 to 1 in 25, but it
  sits inside the night spawner that `CODE-AUDIT.md` §5.9 found dead, so it does nothing until
  that is fixed.
- **One that comes to look.** A Messenger the Attention sends walks up to whoever drew it. If it
  has a quarrel with any of yours it hunts them. If not, it looks, turns, and walks to the
  Bastion yard.
- **A bug fixed on the way:** the crater's four counted against the world's ceiling of two,
  so since the crater was built the yard and the Attention could never stand a Messenger up.
  They are not counted now.

- **One at the pass** (2026-09-28, crater phase 3). The Order's post at the mouth of the gorge
  has five of its people and a Messenger standing at the barricade beside them. It is
  `faction: 'messenger'` like any other abroad, and it fights with the post when the post turns
  on you.

Still open: **their job has no expression.** Nothing about a Messenger responds to the Door or
the tears. Logged in §7.

The original finding:

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

### 3.3 The vocabulary that encodes the speaker — **options 1 and 3 built 2026-09-26**

You picked 1 and 3; `tools/seams.js` claim 9 checks both, and that no item says "Battery".

- **The formulae.** The Worn Formula: *"The word for where the power comes from has been scraped
  off every page but one, and on that one it says conduit."* The Preserved Formula: *"In the
  margin, in another hand: draw from the conduit, not past it."*
- **The Chancellery Ledger** (`c_ledger`), in the colonnade cache at the bottom of the crater and
  nowhere else: *"A golden-age yield ledger in board covers, columns of figures in a clerk's
  hand. The last entry: 'Conduit yield down a third since the winter. The Chancellery asks
  whether the conduit can be encouraged.'"* It sells for 260 and teaches nothing.

The brainstorm:

The bible §3 gives three words for Mother by speaker: *Priest* (the purebloods), *Conduit*
(the Golden Age's notes) and *Battery* (for us). None appears in play. "Kept Priest" is a
caste of the Kept, not a word for her. *The Eldest* appears only in comments. This is cheap to
close: it lives in item text, such as a Golden-Age note that says "conduit".

The rule for the brainstorm: each word appears in the hand that would use it, a few times at
most, and nothing explains it. A player who reads three different words for one thing in three
different places does the rest. *Battery* never appears, per the bible. The options:

1. **The formulae's margins** (Golden Age, *conduit*). A second sentence on the Preserved
   Formula, in another hand: *"Draw from the conduit, not past it."* The Worn Formula: every page
   has the word for the source scraped out but one, and that one says *conduit*.
2. **The Kept's altars** (the purebloods, *Priest*). Looking at a `deepAltar` gives one line: the
   carving shows a figure the others face, and every panel calls her the same thing. This is the
   thin end of the Tablets of the Deep (§4).
3. **A ledger in the crater** (Golden Age, *conduit*). One new item, in the colonnade cache only:
   a Chancellery yield ledger. *"Conduit yield down a third since the winter. The Chancellery
   asks whether the conduit can be encouraged."* It sells, and it is worth nothing to a bench.
4. **The Codex** (the Church before the Fracture). The Transmutation Codex has no description.
   It could get one that names the source once, as the bible's §12 says it does. This touches
   the Codex/Doctrine drift in §6, so it wants your call on that first.
5. **The Heralds' brackets** (*the Eldest*). The crater's barks are bracketed impressions. One
   more: *"(it faces the middle the way you would face something asleep that must stay asleep)"*.
   It is not the word itself, but it is the only honest way for a Messenger to say it.

Recommended: 1 and 3 first. Both are Golden Age text in places the player already reads, and the
ledger gives the crater's best cache a voice.

---

## 4. Named in the lore, absent from the game

The bible marks the first five as unbuilt itself. They are verified here: zero identifiers
and zero player-facing strings.

| lore | status in code |
|---|---|
| **The Last Scholar** (§11), "the largest unbuilt figure in the setting" | Absent. Nobody in play refers to him, including Mother. |
| **Tohu & Bohu, the Voidborn Twins** (§6) | Absent. Their whole hook, stasis for as long as the Last Scholar lives, depends on the Scholar existing. |
| **Philosopher Stones** (§15) | **Minor ones built, 2026-09-26:** every shrine's stone is one (§1.4). The great ones, "one wrote the law that holds the Twins", are still absent. |
| **Tablets of the Deep; the temple art that "points upward"** (§2, §15) | Absent. The Kept have altars (`deepAltars`) and no depictions. The only tablet in the code is the wax-tablet case on Lyre's model. |
| **The kingdom's crater** (§16): "should be the largest landmark in the world", and the natural site of the Door | **Built, 2026-09-25, in three phases.** **The place:** on a headland in the north-east of every world (moved there 2026-09-28, v24, from the dead centre: "too easy to stumble upon"), standing out into the salt with a ridge across its landward side and one gorge through it, in stretches that deepen from the gorge in (2026-09-28, phase 2: "more gradual, fitting for a final boss arena"): the Marches (the dust going grey, the first dead trees; safe), the Ashfall (ash everywhere and still falling, dead trees leaning away from the middle, the Order's posts, bones; walked at night), the Scorch (burned black, glass lying on it in puddles that run together; a few Watchers by day, more at night, and a weaker light), the glass (fused ground, standing slabs with shadows burned onto them), the rim (a wall with two breaches, both facing the gorge), and the bowl with a veil of light over it. The Order holds the mouth of the gorge with a barricade, five of its people and a Messenger, and turns everybody back: going in means going through them. One road runs out to their post, and people in the towns will tell you where it goes. The ground climbs all the way in, and the ridge is a broken range with scree at its foot. **The danger:** the glass and the bowl are held day and night by Watchers the dawn does not take; three Messengers stand at peace with them; what is killed grows back out of sight; at night telegraphed strikes of light come down on whoever is in the glass. **The reason:** the capital's footings across the bowl, a colonnade round the middle, seven caches, and **the Guardian at the Gate**, a Messenger boss at the middle until the Second Fracture. Then it is gone and the Door opens there, so closing the Door is an expedition into the crater. The roads go round it on a ring of fixed waypoints outside the ridge, and so does anybody travelling on the world's business: caravans, pilgrims, escorts and armies. `tools/crater.js` checks all 24 claims. **Ruled 2026-09-25:** it was strengthened on 2026-09-26 (900 blood, a flight of Eyes over it, the light called down on whoever is at it, and two turns as it bleeds). Killing it before the Fracture raises the Attention by 8, moves the Fracture on 8 at once (about fourteen days of calendar), and adds 0.15 a day to its rate for the rest of the run (the calendar is 0.56). It was called the Custodian until then. |
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
- **Item descriptions can be found** (2026-09-28). Every list that names an item (the wagon, a
  pack, the kit, the counters, the bins, the work orders and the bar) shows a card on hover or
  tap: its kind, its numbers, and the description set apart below them. The only place a
  description was printed before was the gear chooser. `tools/seams.js` claim 11 checks it.
  43 of the 100 base items have a description; the other 57 are drafted in §9.3.

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
- **Mother and Malathuun** — **settled 2026-09-26, the bible's way.** She said *"You have stood on
  my brother."* The bible makes Malathuun another Old One and a bystander, with no kinship to
  her. She now says *"one of my kind"*.
- **Mother and the Dust art** — **ruled 2026-09-28, the bible's way: Dust did not come from
  her.** Three of her lines say it did (*"You work the dust art. That came out of me."*, *"the
  art they took off me"*, *"It was mine before it was a technique."*). They were written on the
  code side and are wrong. The replacements are in §9.1, waiting on a ruling, and the old lines
  stay until then.
- **The conviction list.** Bible §14 lists seven convictions and includes Cold. The code has
  eight, and **Loyal** is missing from the bible.

---

## 7. Logged for later

Put down on 2026-09-25 so none of it is lost. Nothing here is started.

**Lore, needing a ruling before code**

- The bible drift in §6: the Codex and the Doctrine, where Mother is, Loyal missing from the
  convictions. (Dust from her: ruled, §6.)
- The Last Scholar, and Tohu & Bohu behind him: proposed in §9.
- The Tablets of the Deep (§3.3 option 2 is their thin end): proposed in §9.
- The Good Kami rites and the curse clause.
- More lunar events.
- The pureblood line.
- Homunculi attracting souls.
- The chimera's tie to Mother.
- The Divine art's depth cost.
- The Dust art's illusory wall.
- The Hollow Citadel's purpose.
- The Messengers' job: nothing about them responds to the Door, the tears or the clock (§3.2).

**Game and code**

- The Dame's *"do not come back"* is never enforced (§2.2).
- The playtest cheats are visible in Options. **Ruled 2026-09-28: keep them for now.**
- A forage band may leave the inner part of its circle unswept, and leave members behind at the
  close. **Reproduced 2026-09-26:** `command.js` read "BAND LEFT BEHIND (19) | MISSED A CHEST
  (0/1)" and, on another world path, "BAND LEFT BEHIND (55)", whenever the world's stream was
  shifted (by six more bodies at worldgen). It passes on the committed world. Real, and worth
  its own look.
- The skinned rig: one mesh per body instead of 12 to 15 (`CODE-AUDIT.md` §2.3). The largest
  draw-call saving left.
- A bigger map: **done.** 2048 was measured and built, then 2560 square with crater phase 1
  (v24, 2026-09-28). More towns to fill it are still to come.
- The other five biomes from the 2026-09-26 brainstorm (sulphur vents, quicksilver fens, the
  nigredo ashwood, albedo chalk, the oases). Three are built (§8.1).
- The old king's court: **built** (§8.5).
- After you have played the crater: ruin density, cache loot and strike rate. Visible waystones
  at the ring's waypoints. (The scavengers' waystation at the mouth of the gorge is superseded:
  the Order holds it now, §4.)
- Town spacing: a rule keeping every town within about 450 tiles of another (Ironscar).
- The deploy preview has not been checked since the crater.
- A full-suite run after the crater's three phases. The last two were on `d7a5602` (178/179)
  and after the biomes and the old king (190/191, the one red `marchorder.js`, ruled in
  `CODE-AUDIT.md` §5.15). Both reds were fixed. Crater phases 1 to 3 have only had targeted
  batches.

## 8. The three grounds and the old king (2026-09-26)

### 8.1 The salt flats, the rust barrens, the vat bog — **built**

As ruled: three of the eight. Each stands round the thing that made it. The world's random
stream never hears of them: the masks are laid after worldgen, off noise and the tile hash, and
what sleeps in them is only spawned when one of yours walks up. A fresh world boots with the
same chests, sites, buildings and bodies as before. `tools/biomes.js` holds all of it.

| Ground | Where | What it does |
|---|---|---|
| **The salt flats** | round Saltmere, about 18,800 tiles | White crust with polygon seams, no trees. **A body that falls on the flats is cured where it lies**: Saltmere's faith as ground, and the one place a necromancer would rather fight. Not brine, though: the dust still takes it on the ordinary clock, and you can still pack one properly to keep it for good. |
| **The rust barrens** | round Ironscar, about 22,600 tiles | Red ground and dead trees. About 115 half-buried wrecks, which a new **SALVAGE** job strips for **scrap metal** (five plates each, slow to come back; ruled 2026-09-27: scrap, not ingots). Scrap melts to iron at five and two coal to one, or makes build materials, a club or a kettle helm. Eight of the wrecks are **Rusted Automatons** that sit up when one of yours comes within seven tiles; they drop the ingots. |
| **The vat bog** | round the deep redoubt, about 7,000 tiles | Liver-dark peat with pale threads through it. About 70 **quickflesh blooms**, which a new **FORAGE** job cuts for Quickened Flesh (they grow back in days). **The living wade it at 72% of their pace; the dead cross it at full stride.** Six pools each put out two **vat-spawn** when you come close: half-poured, unarmed, asking for the tender. |

Each announces itself once, the first time one of yours walks in, and the minimap draws all three.

Left for later: mirages on the flats, and anything that reads the biomes beyond these rules (weather,
towns' trade, the Order's patrols).

### 8.2 The old king — **built**

As ruled: the Hanged King, and never called that where a player can read it. Outwardly he is
only ever **the old king**. In code he is `oldking`, and the comment block is the one place the
other name appears.

- **Hanging.** When the sky opens he is in the mouth of the Door, a long way up, on a rope of
  light, wearing a crown. He is not a body while he hangs: nothing can target, raise or loot him.
  About once a minute, if one of yours is near, he says something from up there:
  - *"Is the capital still there? I cannot see it for the light."*
  - *"We did it correctly. Write that down somewhere. We did it correctly."*
  - *"I can see all of you from up here. It is a long way down."*
  - *"My alchemists said the rope would hold. It has held."*
  - *"Kneel. No. Stand. Nobody kneels any more. I saw."*
  - *"Nine generations. I counted every one of them. It passes the time."*
- **The rule.** It is the Brood's one rule taken one step further. The Brood holds the Door open
  from below, and the king is what it hangs from. With the Brood dead, the finished hold does not
  shut the sky. It pulls him down the rope, and he stands up at the Door's edge (*"There. Now we
  are the same height."*). The Door will not close while he stands. Put him down and the same hold
  lands. There is no new cost and nothing new to learn: the rite as it was, with its last page
  turned. The journal says so at every step.
- **The fight.** 1,250 blood, with Kingsfang. He never leaves the Door. His own attack is **the
  noose**: a gold ring at somebody's feet with the crater's warning time, then it closes, and
  whoever is in it is lifted off the ground, held for 2.4 seconds and hurt. Below half blood he
  *"takes up the slack"* and the nooses come faster. He is `gaunt` by allegiance only: what comes
  out of the Door leaves him alone, the crater's light does not burn him, and everybody else is
  his enemy.
- **What he leaves.** **The Old King's Crown**, which is *"Lighter than it looks, and warm on the
  inside of the band as if somebody took it off a moment ago. Nothing is engraved in it at all."*
  That stands against the Sunken Crown's eleven names. It is not a legendary, because the twelve
  are a ledger of their own.

`tools/oldking.js` holds all of it. `beasts.js`'s "with the Brood down the rite lands" claim now
walks through him.

**Not decided, so not built:** whether Lyonart is anything to him. It is in the sketch below
as a proposal. (The Ossuary King was ruled out on 2026-09-27: no relation. See §8.4.)

### 8.3 The old king's court — **built, first pass** (sketch below; as built in §8.5)

Four, not eleven, and the eleven stay where the game already put them: they are the Pouring's
names. **One for each of the Four Arts**, practised as the Golden Age practised them, before
anything was degraded. That is the court's reason to exist: each is the full version of something
the player knows only as a remnant. They come through masked. Outwardly they are the old king's
people; nobody in the world has a word for what they are.

1. **The Chancellor** (Divine, at full: revelation). The Chancellery's own hand, the one who
   wrote *conduit* in the ledgers (§3.3). Speaks in minutes and procedure, and records
   everything, including you. Mask: plain white, and no mouth, because the Chancellery minutes;
   it does not speak. **In a fight:** mends and shields whoever stands beside it, and at close
   range shows a body enough of the light to blind it, which is the Divine art's depth cost
   turned outward.
2. **The Master of the Pouring** (Transmutation, the art Destruction is the wreck of). The one
   who poured the eleven. The Sigil-Bound's maker, and the one person in the world it would want
   to speak to. Mask: a smith's face-plate, seamed where it was cast. **In a fight:** turns ground
   to glass under a body's feet, and pours the dead around it into brief armoured vessels. Its
   home would be **the rust barrens**, among the machines of the war that followed.
3. **The Keeper of the Conduit** (Dark, at full). Mother's jailer: the one who held the leash
   while the siphon ran. The one member of the court whose name Mother would know, and the one
   she would not say. Mask: long, bone. **In a fight:** raises the crater's dead in numbers
   nothing in the world can match, which is the point: this is what the player's art was *for*.
   Its home would be **the vat bog**, round the bunker whose vats it stocked.
4. **The Unremembered** (Dust, the art that altered reality). Nobody can hold its face in
   memory, and nobody remembers its name, so no record of it exists. **Proposal:** this is why
   Dust is the degraded art with no deathless road and no depth left in it. Its only master went
   through the Door with the king, and took the rest of the art. **In a fight:** raises walls that
   were never there, and makes one of yours forget what they were ordered to do. Its home would
   be **the salt flats**, which already want mirages.

**How they arrive (recommended).** One at a time as the Fracture climbs, at its own ground,
ahead of the Door. Each is a late-game boss at a place: the Master in the barrens, the Keeper
in the bog, the Unremembered on the flats, and the Chancellor last, in the colonnade, when the
Door opens. **Each one you put down before the old king comes down takes that art out of his
fight.** With the whole court alive, he fights with all four. That mirrors the Guardian's cost,
and it gives the player's endgame preparation a shape that isn't a stockpile.

*The alternative, smaller:* they come through the Door itself as the hold passes 25, 50 and 75%,
to keep the rope from being cut. That is simpler, but they never meet the world.

**Tie-ins, for you to rule on:**
- ~~**The Ossuary King as the husk.**~~ Ruled out 2026-09-27: no relation to the old king.
- **Lyonart d'Alagadda.** If the old king has hung in Alagadda for nine generations, the court
  would know an Alagaddan prince on sight. One line from the Chancellor (*"Highness. You are
  expected."*) would do more than any exposition. It makes Lyonart's exile something the court
  noticed, and nothing more is committed.
- **The licence flag, again.** The masked ambassadors and the Hanged King are SCP ideas (CC BY-SA
  3.0). Keeping the name internal lowers the exposure. The borrowing is still there if the game
  ships.

### 8.4 The Ossuary King, rebuilt — **built** (2026-09-27)

The brief: a legacy boss, reworked from the ground up, **no relation to the old king**. The
old shape was a big skeleton with a crown and a stat block. Everything about him is new.

- **Who he is.** A Golden-Age registrar who countersigned the Pouring, with eleven names and
  his hand under every one. He was meant to be the twelfth, went halfway into the vessel and
  climbed back out. What climbed out wears its own bones on the outside. The "crown" is the
  Pouring's register-band. The demilich's line about him now says he would not sign the twelfth
  space. The scholars' last-king rumour is retired (lore bible §13, §18).
- **The place.** A throne facing south down two rows of five, backed by a horseshoe of wall
  stacked with skulls, with a cold teal candle at either hand. The empty places in the rows
  hold bones bowed to the floor. Four living petitioners kneel in the front places and do not
  get up until he is struck.
- **The fight, in three.**
  - *Enthroned:* he does not leave the chair. Struck, the kneelers stand. Every 7 s he reads a
    name off the inside of the band, and another petitioner answers it, to six alive.
  - *The court rises* (60%): he gets up.
  - *He sheds the cage* (25%): the bone comes off, and the ward with it. He is faster (×1.3),
    hits harder (claw 46), and the shedding hurts everything within 3.2 tiles. The roll speeds
    up to every 5 s.
- **The read.** While the cage is on, `BONE_WARD` scales damage by weapon: blunt ×1.5, holy
  ×1.2, burn ×0.9, cut ×0.6, pierce ×0.55. Bring a hammer.
- **Drawn** by `bodyOfTheOssuaryKing`: seated, standing and shed, with the rig rebuilt when
  the phase changes (`bossPhase` is in `colorKeyOf`). The phase, the ward and the petitioners
  survive a save.

`tools/ossuary.js` holds it.

### 8.5 The court, as built (2026-09-27)

The "one at a place" shape from the sketch, simplified to one Art each:

| Courtier | Art | Comes through | Where | In a fight |
|---|---|---|---|---|
| The Master of the Pouring | transmutation | Fracture 60 | the rust barrens | blows ignore armour |
| The Keeper of the Conduit | dark | Fracture 75 | the vat bog | a third of the damage it deals heals it |
| The Unremembered | dust | Fracture 90 | the salt flats | in a fight, every 12 s it folds out of sight for 3 s |
| The Chancellor | divine | when the Door opens | the colonnade, under the Door | mends 3% of its blood every 8 s while hurt |

- Each spawns well inside its ground and at least the town's clear radius plus 24 tiles from
  any walls, since Saltmere and Ironscar sit at the middles of the flats and the barrens.
- Anyone not yet through when the Door opens comes with it.
- **When the old king comes down he carries the Art of every courtier not yet slain.** The log
  names them, and a courtier's death line says what the king will now come down without.
- Blood 700, claw 30, big 1.2, and each drops a codex, a formula and a tome.
- Who has come through (`courtCame`) and what each body carries (`courtArts`) survive a save.
- **Not built from the sketch:** the Chancellor shielding others and blinding at close range,
  the Keeper raising the dead, the Master's glass ground. Those are the next pass if the
  single-Art version plays thin.

`tools/kingscourt.js` holds it.

### 8.6 The Aldercott orchard, told in order — **rebuilt 2026-09-27**

The note: *"It just appears suddenly and without warning. Needs a proper buildup and honestly
doesn't need a bunch of corpses in the city to work."* It did. The first time anybody with the
Dark gift walked within eleven tiles of the orchard, twenty bodies came up out of the ground in
the middle of the start town, and Bellowes, the Dame and the invitations came after the answer.
It is told in the order a town keeps a secret now:

1. **A lead.** The gift feels something under the trees and nothing comes up, or somebody goes
   up to the house to dine and does not come home. Either one opens the thread *The Aldercott
   orchard*, marked at the gate.
2. **Asking.** Greenrest's townsfolk get a new question: *"The people who dine at the Aldercott
   house. Where do they go afterwards?"* Each answer is different and none of them straight:
   Copperhold, a sister's letter that did not sound like her, the watch's new coats, the fruit.
   The last warns you that Bellowes has been asking after a stranger.
3. **The invitation.** Two answers, or one plus the gift's lead, and the house hears of it. The
   next day Bellowes crosses the square with a card that has your name on it. The gate is open to
   the invitation, the same gate the missing walked through. The Dame's first line knows why you
   came: *"You have been asking at the well where my guests go, so I thought you had better be
   one."*
4. **The rows.** Opened by the Dame (*"Show me."*) or by the bargain. They are bone, four
   generations of it, and the bargain gives it to you as 18–38 Mortal Remains. The only bodies
   are the last three guests, the names the town was pleased for, laid in the newest row.

The three endings are unchanged: a friend of the house, the square, or the bargain. Each one
closes the thread. §2.2 (the Dame's *"do not come back"* is not enforced) is still open.

`tools/playnotes.js` claim 9 walks it end to end.

## 9. Waiting on a ruling (2026-09-28)

Nothing in this section is in the game. Each part has a question for you, and each part goes
in only once you have ruled on it. **(mine)** marks invention that neither the bible nor the
code already says.

### 9.1 Mother and the Dust art: three lines to replace

Ruled: Dust did not come from her. What the bible *does* say (§3, the tap table) is that before
the Fracture every art's route ran **through** her. She interceded, and there was no other way
through. After it, the power comes straight out of the wound, and she is **Redundant**. Nothing
in the game says "redundant" yet, and these three lines are the natural place for it.

| where | now | option A: through her, not from her (recommended) | option B: no tie to her at all |
|---|---|---|---|
| a stranger with the Dust gift or tier II | *"You work the dust art. That came out of me. Out of ME — a woman under a mountain, on a table, awake for it. Every time you fold the light you are spending a piece of me. Do it anyway. It is spent."* | *"You work the dust art. Once, every art in the world came through this room on its way to somebody. Now it comes out of the hole in the sky, and it does not need me. You are standing in front of the part they stopped needing."* | *"You work the dust art. What is left of it. In their day it did not hide a thing; it made it so the thing had never been there. You only hide. Keep hiding. It is the better use."* |
| one of hers at tier III | *"You have mastered the art they took off me. Do you understand that when you work it, you are working ME?"* | *"You have mastered the dust art. They used to draw it through me a measure at a time and write down what each measure cost. You draw it from nowhere and owe nobody. I do not know whether to be glad."* | *"You have mastered the dust art, or what is left of it. They could unmake a thing, once. You can make it hard to see. Be content with that. They were not."* |
| one of hers at tier II | *"You use the art. Adequately. It was mine before it was a technique."* | *"You use the art. Adequately. It used to come through me. Now it comes through anybody, and it shows."* | *"You use the art. Adequately. They did it better, and it cost them more."* |

Option A voices the bible's own "Redundant" beat and says nothing new. Option B says only what
§7 says ("a degradation of an art that altered reality itself") and keeps her out of it.

### 9.2 Drift between the bible and the code: which side moves?

1. **The Codex and the Doctrine.** The bible gives the Codex the Church text that "names them
   once". The code gives that text to **The First Doctrine**, a quest item: it is in the oldest
   redoubt's vault and Czarina wants it. The Codex is a Golden-Age alchemy manual there: the
   Transmutation research is built from one, the Kept gather round one at the altar, and the
   court drops them. *Recommendation: the bible follows the code.* The Doctrine is the Church
   text and the Codex is the Golden Age's manual. The Codex's description is in 9.3.
2. **Where Mother is.** The bible says "a cell at the bottom of a sealed redoubt". The code
   says a Golden-Age seal at the bottom of a warren. The bible's own §3 says the prison was
   built "around a god who was lying where she had always lain", in the purebloods' earth.
   *Recommendation: the bible follows the code*, with the vault at the bottom of a warren.
3. **Loyal is missing from the bible's convictions (§14).** In code it is *"Decided about you a
   long time ago. Takes a great deal to undecide."*, and what moves it most is a captive taken
   back. *Recommendation: add it to §14 as shipped.*
4. **"Llammialith's Tooth".** Her name is "known only to the precious few she has chosen to
   whisper it to", and her scene is where she gives it to you. A legendary weapon with the
   name on it gives it away first. The Unblinded, one of the Kept, carries it. *Recommendation:*
   **The Priest's Tooth**, because Priest is the purebloods' word for her. The description stays.
5. **"The Fall".** Two items say it (the Sunless Leaf "older than the Fall", the Aether Cell
   "pre-Fall"). Everything else says the Fracture. *Recommendation: Fracture*, unless "the
   Fall" is meant as a folk word, in which case it does not belong in the narrator's text.
6. **The Sunken Crown has two histories. Found while writing its description.** §13 and the
   2026-09-27 rework make it the Pouring's register-band, sunk and tarnished, with eleven names
   inside, which the demilich asks you to read. §14 and Lyonart's start say he "came through
   with the Sunken Crown" from Alagadda, and the game gives him one. The Circlet of the
   Pouring *also* has eleven signatures and a blank twelfth. Options:
   - (a) there were several register-bands, and one of them went through a tear;
   - (b) Lyonart carries a different crown, perhaps Alagadda's;
   - (c) the band inside the Sunken Crown is not the Pouring's, and only the Circlet is.

   I have no recommendation; this is your call. The description in 9.3 avoids its history.
7. **The Kept and "the only one of his kind left".** The bible's §11 says the Last Scholar is
   the last pureblood. The game has congregations of the Kept, who are purebloods, still
   keeping the vigil in the Deep. The Scholar scaffolding (9.5) depends on how those two fit.
   A reading that keeps both is that **the civilisation** ended, and what is down there is what
   was left when it did: no council, no letters, "a language with no descendants", and the
   Scholar is the last one of them who is *whole*. Does that hold, or does one side move?

### 9.3 Descriptions for the 57 items that have none

These follow the house style of the 43 there already: two or three sentences, physical first,
and the lore coming in sideways and ending on the turn. The item card now shows them wherever an
item is listed (wagon, pack, kit, counters, bins, work orders, the bar).

**Food and medicine**

| item | description |
|---|---|
| Dried Meat | Strips of whatever walked past the smokehouse last, salted and hung until it could be anything. It keeps. Nobody asks which animal, and nobody should. |
| Greenfruit | Grown at Greenrest, because nowhere else grows anything. Sweet, bruised by the road, and soft by the second day. It is why Greenrest has more watchmen than trees. |
| Shore Fish | Caught in the shallows at the rim of the world, since there is no other water for a fish to live in. Bony, grey, and better than nothing by a narrow margin. |
| Bandage Kit | Boiled linen, a needle, a twist of gut and a bottle of something that stings. Eight dressings to a kit. It stops the bleeding; it does not bring anything back. |

**Materials**

| item | description |
|---|---|
| Build Materials | Lashed bundles of pole, plank, cord and peg: everything a wall needs except the reason. Hauled to a blueprint, they become the blueprint. |
| Wood | Cut from the dead husks that stand in for trees everywhere but Greenrest. Grey all the way through. It still burns, which is more than can be said for most things out here. |
| Stone | Quarried, or pulled out of something somebody else already quarried. Most of the good building stone in the world has been used at least twice. |
| Copper Ore | Green-veined rock out of Copperhold's shafts. Mine money built those walls; this is what mine money looks like before it is money. |
| Iron Ore | Red, heavy, and worth nothing until a smelter has had it. Ironscar digs it with indebted hands, and there are hired blades standing over the hands. |
| Coal | Black rock that burns longer and hotter than wood. The smelter eats it by the sack and never says thank you. |
| Copper Ingot | Smelted, poured and stamped. Too soft for an edge, right for a fitting, and the easiest thing in the world to sell. |
| Iron Ingot | A bar of good iron. A smelter makes them slowly. An automaton gives them up all at once, if you can put it down first. |
| Quickened Flesh | Tissue out of the vat bog, where what the vats grew went into the ground and kept growing. It is warm, it moves when it is handled, and a graft takes to it better than to anything that was ever born. |
| Fabric | Bolts of woven cloth, dyed the colour of dust whether or not anybody meant it to be. Coats, bandages, shrouds. The world goes through a lot of shrouds. |
| Lead | Soft grey metal, heavy and cheap. The Golden Age made gold out of it as a matter of routine. It can still be done, by whoever has read the right codex, and it is still worth doing. |
| Gold Bar | A stamped bar of gold. Some gold was mined. Some was lead last week, and no assayer alive can tell you which. |

**Trade goods**

| item | description |
|---|---|
| Rum | Cane spirit from somewhere that has cane. It rides in every caravan because it pays at every counter, and it opens a conversation that gold would only insult. |
| Harbourblack | Cask rum cut with salt and let go dark, to Dustport's own receipt. It tastes of tar and pays like a debt coming due. |
| Cask Rum | Rum that has sat in wood long enough to forget where it came from. Worth the wait, which is not something you hear often out here. |
| Hound Hide | Off a waste hound, scraped and dried. It is stiff, it stinks, and it is the best leather most people will ever wear. |
| Mortal Remains | Bones, mostly, and what still clings to them, bundled in sacking. To a gravekeeper it is a duty and to a necromancer it is stock. Most towns fine you for the difference. |
| Sunken Crown | Heavy bronze gone green, sunk down over a brow for so long it kept the shape. Something is written round the inner band. The Last Rite wants it, and gives it back afterwards: it is a key, not a candle. *(Holds whichever way 9.2.6 goes.)* |
| Leviathan Hide | A slab of hide off something the size of a street. Thick enough to turn a blade, and it smells of nowhere you have been. |

**Weapons**

| item | description |
|---|---|
| Plank | A length of board with a nail or two left in it. It is what you pick up when there is nothing else to pick up, and there often is not. |
| Iron Club | A bar of iron with a grip wound round one end. There is no technique to it. It works on the things a blade slides off. |
| Rusty Katana | A curved blade somebody once looked after. The rust has got into the edge and will not come out. It still cuts; it just takes longer about it. |
| Arming Sword | A straight double edge and a crossguard: the sword a town gives the man it sends to the gate. Nothing about it is remarkable, which is why it works. |
| Dagger | A hand's length of point. Useless in a fair fight and very good at ending an unfair one. |
| Katana | A curved single edge, folded by somebody who knew how. It asks for both hands and repays them. |
| Nodachi | Taller than the man who carries it. Too long to draw quickly and too heavy to swing twice, and the first swing is usually enough. |
| Hunting Bow | Horn and sinew, drawn for elk. It was never meant for people, and it does not know the difference. |
| Crossbow | A steel prod on a stock, wound back with a crank. Slow to load, and plate is only a suggestion to the bolt. |
| Sundering Edge | A Golden-Age blade with a line down the flat that is not quite the colour of the rest. It has never needed sharpening. Nobody knows what it was made to cut, because nothing left in the world gives it any trouble. |
| Kingsfang | A two-handed blade out of a sealed vault, laid up in oil nine generations ago and taken out as sharp as the day. Whose king it was named for, the vault did not record. |
| Pyre Blade | Sister Ash's. The edge is always warm and sometimes a good deal more than warm. She burned her order with it, and she will tell you bones burn easier. |

**Armour, head and cloak**

| item | description |
|---|---|
| Rag Shirt | A shirt that has been more hole than shirt for some time. It keeps the dust off. It does not keep anything else off. |
| Leather Jacket | Hound hide boiled hard and stitched double at the shoulders. Most blades turn on it once. |
| Iron Plate | Breastplate, backplate and the straps between. It takes the heart out of a cut, and the spring out of the man inside it. |
| Alchemic Carapace | Golden-Age plate in one piece, with no rivet or seam a smith would recognise. Heavy past bearing on a long march, and nothing made since stops a blow half as well. It was made for the war that was lost. |
| Baroness's Plate | The Red Baroness's own, lacquered the colour she is named for. She did not come by it honestly and neither will you. |
| Leviathan Coat | Leviathan hide cut long and oiled dark. It turns a blade like plate, it moves like a coat, and it never quite dries. |
| Gravecloth Shroud | Grave linen, wound the way Hollowmere winds its dead. On the living it is barely a shirt. On the risen it passes for one of the living. |
| Marshal's Plate | Grand Marshal Vey's plate, enamelled white and dented everywhere a man can be struck. It was never once taken off him, until it was. |
| Padded Cap | Quilted wool with a chin strap. It will not stop a blade, only the ones that were not really trying. |
| Kettle Helm | A steel brim over a round crown: the helm a militia can afford. Rain runs off it, and so do most arrows. |
| Closed Armet | A helm that shuts over the whole face. The world gets small and dark inside it, which is a fair trade for keeping the face. |
| Road Cloak | Heavy wool, cut long for a road with no end to it, with deep pockets sewn inside. It does not stop much. It carries a little more. |

**Books, packs and grafts**

| item | description |
|---|---|
| Transmutation Codex | A Golden-Age manual in iron boards, on turning one thing into another. It was written for people who had something to draw the art through, and the bench can still rebuild the art from it. *(If 9.2.1 goes the code's way.)* |
| Weathered Tome | Somebody's notes, bound in whatever was to hand. Half of it is wrong and all of it is useful. |
| Traveller's Pack | Canvas and two straps. Enough for a week on the road, and light enough that you forget it until you have to run. |
| Hauler's Pack | A frame pack built to be loaded until the carrier complains, then loaded again. Nobody fights well under one. |
| Bone Graft (Arm) | Bone off the dead, pinned to a stump and bound on by rite. It is not an arm. It is somewhere to put the rest of one. |
| Bone Graft (Leg) | Bone off the dead, pinned to a stump and bound on by rite. It is not a leg. It is somewhere to stand. |
| Skeleton Arm | A whole arm's worth of the dead, wired joint to joint and bound on by rite. It answers most of the time. The rite does not say whose it was. |
| Skeleton Leg | A whole leg's worth of the dead, wired joint to joint and bound on by rite. It carries you most of the time. The rite does not say whose it was. |
| Articulated Arm | Iron, copper and quickened flesh, jointed like the real thing and a little better. Some mornings, whoever wears it forgets which arm they were born with. |
| Articulated Leg | Iron, copper and quickened flesh, jointed like the real thing and a little better. Some mornings, whoever wears it forgets which leg they were born with. |

Fixes to existing text, if you agree:
- "the Fall" becomes "the Fracture" (9.2.5).
- The Tooth is renamed (9.2.4).
- Final full stops go on the ten one-line descriptions that lack one (Salt, the Socket Spear, the
  helm, the wreath, both cloaks and the four trinkets).

### 9.4 The Tablets of the Deep

**Mechanics (proposed):**

- **Nine tablets per world**, each a unique item. They are stone and weigh 4 kg. They sell for
  nothing, because their whole value is what they say.
- **Where they are:** three to a storey, and the deeper, the later. Six lie in the Kept's halls
  (two per storey), as a slab you walk up to, like a cache. The other three are given to you by
  a congregation when its altar reaches KIN, one per storey. So a player who keeps the vigil,
  rather than cutting through it, gets the ones that matter most.
- **Reading:**
  - Only the lettered can read one, by the test the convictions already use: MAG over 12, a
    Scholar, or lettered.
  - Anybody else gets *"The marks are cut deep and even, and they mean nothing to [name]."*
  - Reading gives **nothing**: no insight, no MAG, no research, as the bible says.
- **The journal:**
  - CHRONICLES gets a **TABLETS** tab. Each tablet read is filed there with its text and where it
    was found.
  - A tablet you have but cannot read shows as *unread — wants somebody lettered*.
  - The tablet stays in the wagon after it is read.
- **(mine)** They are cut to be **read by the fingers**, since the purebloods were blind, and
  the text is given as *what [the reader] makes of it*. That is also how a script in "a
  language with no descendants" can be read at all: the reader does not read the words, only
  what the carving shows. Keep or drop?

**The texts.**

- They are in the purebloods' voice and call her **the Priest** throughout.
- They never name the Eldest. They record what happened and explain none of it.
- What ended them stays open: the ninth breaks off.

1. **THE FIRST THING TAUGHT.** *We live below because the sky looks. What is past the sky is
   not empty. It is attention. Stone is the one roof it cannot see through, and the deeper the
   stone, the less it sees.*
2. **THE PRIEST WAS LEFT.** *Her kin went out among the stars and did not take her. She lay in
   the rock a long age before we found her, and when we found her she did not ask to be
   worshipped. She asked to be useful. We gave her a congregation, and she gave us her voice,
   which carries further than ours.*
3. **ONLY SHE SPEAKS UPWARD.** *We do not address it. No one of us addresses it. The Priest
   speaks upward for us, and only for us, and she has never once told us what she hears.*
4. **THE WALL OF THE GREAT HALL.** *The congregation at the bottom, small. Above them the
   Priest, arms open. Above her, cut deeper than anything else in the hall, the thing she faces.
   Every line of the carving runs up to it, so a hand that follows any one of them is led to the
   top.* The bible's "the temple art points upward": this is the one that was read by the
   wrong people much later.
5. **WE HAVE BEEN ELSEWHERE.** *Not up. Never up. Through. There are ways between that do not
   cross the sky, and we walked them, and were received, and came home. One of the places was a
   kingdom built on the same work we do. We did not stay. It is not a place a person should
   stay.* This is Alagadda; the bible says its exile is one-way.
6. **SOME OF US WENT UP.** *They wanted the warm and the light, and they said the sky had not
   looked at anyone in a long time. We let them go. We did not follow. It has been long enough
   now that they will not remember us, and the Priest says that is a mercy to them.*
7. **FEW CHILDREN THIS AGE.** *Fewer the next. The council has decided that some of us will go
   up to those who went up before, and ask them for nothing, and tell them nothing, and come
   back with children or not come back. The Priest did not argue. She said she had seen kin
   leave before.*
8. **ONE OF US WENT UP TO TEACH THEM.** *Not all of it. The council argued a long time over how
   much, and he went before they had finished arguing. His name was on this tablet. It has been
   cut out, carefully, by somebody with a better chisel than ours.* **(mine)** This is the
   First Scholar, and the implication is that he came back and took his own name off.
9. **THE COUNCIL HAS STOPPED MEETING.** *There are enough of us left to fill one hall. The Priest
   asks after each of us by name, every day, and every day there are fewer names. We are cutting
   this because somebody should, and because the* The tablet ends there.

### 9.5 The Last Scholar: scaffolding

The bible's rules:

- he appears human, with great age and melancholy, and a voice tinged with regret;
- he appears and reappears through history;
- he reaches the player only by "being unhelpful";
- his immortality is never explained, and what ended his people is never resolved;
- he is never written as a hero or as a villain;
- his life holds the Twins.

**Proposed shape:**

- **A figure, not a follower.** One body, `lastScholar`, drawn as an old man in a travelling
  coat. He cannot be recruited, raised or bound. Nothing is hostile to him and he is hostile to
  nothing. An attack order on him is refused with the log line *"Nobody lifts a hand. Nobody can
  say afterwards why not."* **(mine)** If blows land anyway (a stray bolt, a blast), he takes
  none of them.
- **He comes and goes.** He is on the map only for a sighting, and leaves when nobody of yours
  is looking.
- **His thread.** It is called *The man with the old face*. It opens when Mother's second scene
  closes, since she is the one who says he exists. A sighting also opens it, for a player who
  never reaches her.
- **The sightings (each happens once):**
  1. **Early (days 20 to 40).** He stands a little way off from a Scholar (the Archivist at
     Dustport, or one on the road), watching the road.
  2. **After Mother's second scene.** He is at the mouth of the warren you came up out of.
  3. **After a tablet is read.** He is somewhere near the Deep mouth nearest your reader.
  4. **When the Door opens.** He is at the rim of the bowl and does not go in. He is gone when
     it closes.
- **Hearsay.** In town rumours, rarely, somebody's grandmother described him, and so did theirs:
  *"Same coat."* It is a folk-layer line, and it never names him.
- **Talking to him.** A short tree. Every answer is true and useless:
  - *(who are you)* "Nobody you need. I have been somebody people needed, and it did not go well
    for them."
  - *(how old are you)* "Older than I would like. I stopped counting when counting stopped
    helping."
  - *(Mother, once her scene is done)* "She is owed more than I paid her. Do not carry her
    anything from me. She knows."
  - *(the Scholars)* "They took their name from the wrong end of my life. It suits them better
    than it suited me."
  - *(your people)* "Gone. I was there. That is all of it I will say, and it is more than I have
    said in a while."
  - *(the Door)* "Close it. Not for them. For you."
  - *(the Hollows, to one of hers)* "I made you to save them. It worked. Do not thank me for
    it."
  - *(what is on the throne)* "Nothing that will ever know you asked."
  - *(the Twins: never. Nobody in the world knows to ask.)*
  - *(leaving)* "I have been here before. I will be again. You will not."
- **What this does not do:** explain his immortality, name what ended his people, give the
  player a quest, or make him killable. The last is deliberate for now: his death has
  consequences the setting has not decided on.

Questions for 9.5:

- the sightings as listed, or fewer;
- the attack-order line;
- the throne line, which is the nearest thing to an answer he gives (the bible allows him to be
  "unhelpful" about it);
- 9.2.7 first, since "the last of his kind" has to fit the Kept.

---

## Appendix: re-running the counts

`lore.js` parses the script block with `acorn`. It collects comments, string and template
literals, and identifiers separately. Then, for each term in a JSON list of
`[label, regex]` pairs, it prints the three counts and the first two string hits with their
lines. A term with 0 strings and 0 identifiers is absent from play. A term with strings but
no identifiers is text without a mechanic, which is only a lead until its call sites are
read. The two scripts are small enough to rewrite. They are not committed, because they
answer a question once rather than guard anything.
