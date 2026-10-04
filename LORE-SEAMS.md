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
| **The Last Scholar** (§11), "the largest unbuilt figure in the setting" | **Plumbing built 2026-09-29, lines waiting on §9.5.** Mother's second scene speaks of a man with the old face, and closing it opens his thread. He is a body that nothing is hostile to and nothing can harm. He is offered only TALK, not saved, and seen at four sightings: early near a Scholar, after Mother, when a tablet is read, and at the rim while the Door is open. Every line he says is null, so he does not answer yet. `tools/lastscholar.js` checks it. |
| **Tohu & Bohu, the Voidborn Twins** (§6) | Absent. Their whole hook, stasis for as long as the Last Scholar lives, depends on the Scholar existing. |
| **Philosopher Stones** (§15) | **Minor ones built, 2026-09-26:** every shrine's stone is one (§1.4). The great ones, "one wrote the law that holds the Twins", are still absent. |
| **Tablets of the Deep; the temple art that "points upward"** (§2, §15) | Absent. The Kept have altars (`deepAltars`) and no depictions. The only tablet in the code is the wax-tablet case on Lyre's model. |
| **The kingdom's crater** (§16): "should be the largest landmark in the world", and the natural site of the Door | **Built, 2026-09-25, in three phases.** **The place:** on a headland in the north-east of every world (moved there 2026-09-28, v24, from the dead centre: "too easy to stumble upon"), standing out into the salt with a ridge across its landward side and one gorge through it, in stretches that deepen from the gorge in (2026-09-28, phase 2: "more gradual, fitting for a final boss arena"): the Marches (the dust going grey, the first dead trees; safe), the Ashfall (ash everywhere and still falling, dead trees leaning away from the middle, the Order's posts, bones; walked at night), the Scorch (burned black, glass lying on it in puddles that run together; a few Watchers by day, more at night, and a weaker light), the glass (fused ground, standing slabs with shadows burned onto them), the rim (a wall with two breaches, both facing the gorge), and the bowl with a veil of light over it. The Order holds the mouth of the gorge with a barricade, five of its people and a Messenger, and turns everybody back: going in means going through them. One road runs out to their post, and people in the towns will tell you where it goes. The ground climbs all the way in, and the ridge is a broken range with scree at its foot. **The danger:** the glass and the bowl are held day and night by Watchers the dawn does not take; three Messengers stand at peace with them; what is killed grows back out of sight; at night telegraphed strikes of light come down on whoever is in the glass. **The reason:** the capital's footings across the bowl, a colonnade round the middle, seven caches, and **the Guardian at the Gate**, a Messenger boss at the middle until the Second Fracture. Then it is gone and the Door opens there, so closing the Door is an expedition into the crater. The roads go round it on a ring of fixed waypoints outside the ridge, and so does anybody travelling on the world's business: caravans, pilgrims, escorts and armies. `tools/crater.js` checks all 24 claims. **Ruled 2026-09-25:** it was strengthened on 2026-09-26 (900 blood, a flight of Eyes over it, the light called down on whoever is at it, and two turns as it bleeds). Killing it before the Fracture raises the Attention by 8, moves the Fracture on 8 at once (about fourteen days of calendar), and adds 0.15 a day to its rate for the rest of the run (the calendar is 0.56). It was called the Custodian until then. |
| **Good Kami** (§6, §12) | Half built. The kami stone at Fallowend consecrates a charm, and the town is `kami: true`. Missing: the rites the bible lists (dirty water at a crossroads, dust not swept past a threshold at night, a dead name spoken into the wind) and the curse clause, *"you do not improvise with something that says yes"*. |
| **Old Har'mageddon** (§6; spelled *Har-Mageddon* until 2026-09-29) | Never named in play. The Coil gestures at him (*"The wars are not the end. The wars are the appetite."*). The Paladin myth that sets him against Kami is absent. The bible says to keep this thin, so this is the lowest priority here. **Widening his part: proposed in §10.7.** |
| **Lunar events, "several exist"** (§10) | Only the blood moon. The "eldritch moon" is held open in §18. |
| **A pureblood-descended human line** (§9), "a line not yet written" | Absent. Salt-cured is Saltmere's line, but it is about brine, not pale, light-averse blood. **Ruled 2026-09-29: the Salt-cured, implied and never stated.** How to show it: §10.6. |
| **Homunculi attract artificial souls** (§9): "stray alchemical overflow, an Old One's dream, even a whole Watcher" | Absent in text and in mechanics. The race blurb is only "Vat-grown. Learns frighteningly fast". **Tenants proposed in §10.4.** |
| **The chimera is her flesh** (§9): "Two peoples out of one prisoner" | The Hollow half is in play; Mother calls a Hollow one of hers. The chimera half is not: nothing a player can read ties the chimera to her. |
| **The Divine art's depth cost** (§7): "delve too deep and you are blinded by eldritch light and maddened" | No mechanic. |
| **The Dust art's reach** (§7): "vanish, plant a false memory, or raise a wall that was never there" | Two of three. *The Veil* vanishes, and a worn face makes "the law forget you". **Closed 2026-09-29:** the rebuilt Unremembered raises the wall in a fight, and a leaf of his ledger teaches it to a player at Dust III (THE WALL THAT WAS NEVER THERE, §10.3). All three reaches are in the game. |
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
- The pureblood line. *(Ruled and built 2026-09-29: Saltmere's Salt-cured, §10.6.)*
- Homunculi attracting souls. *(Built 2026-09-29: the tenants, §10.4.)*
- The chimera's tie to Mother.
- The Divine art's depth cost.
- The Dust art's illusory wall. *(Built 2026-09-29: the Unremembered's, and his ledger leaf, §10.3.)*
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

**Plumbing built 2026-09-29** ("build the plumbing now, lines after I rule"). The shape below is
in the game; every line in it is null in `SCHOLAR_TALK`, and a topic with no line is left out.
The body is called "An old man" and the thread "The man with the old face" (after Mother's
"he had the old face"). Two plain lines stand in until the ruling:
- the journal: *"An old man, seen near Greenrest, day 25."*;
- the log, when you talk to him: *"(An old man does not answer.)"*.

The tablet sighting has its hook (`scholarSighting('tablet', x, y)`) and nothing calls it until
the tablets exist.

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

## 10. The round of 2026-09-29: renames, reworks and brainstorms

**Already done this round, in the docs:**
- Loyal is in the bible's convictions.
- Har-Mageddon is spelled Har'mageddon. He was never named in the code, so only the docs changed.
- The bible records four rulings:
  - Saltmere's Salt-cured are the pureblood-descended line, implied and never stated;
  - lichdom wants an ancient crown of alchemical significance;
  - the Sixfold is a late-game enemy, not a boss;
  - the Ossuary King is to be renamed.
- The eight wanderers and Czarina are in the bible's §13.

**Ruled and built, 2026-09-29.** The proposals below are kept as they were put; this is what came
of each.

| § | ruling | built |
|---|---|---|
| 10.1 | **The Lord of Ash and Bone**; his trinket is **the Lord's Signet**. The repetition with "ash" is distant enough. | Renamed everywhere a player reads it (rumour, hunt question, masters, Signet). The code's `bossKey` stays `king`. |
| 10.2 | **The Exile's Crown**, and the demilich **accepts** it, so Lyonart goes round the Lord instead of through him: "half the point of Lyonart's origin". | Lyonart starts with it. The demilich's crown stage takes either crown, and the Last Rite takes any `lichCrown`. His lines for the Exile's Crown: *"No names. Ours had eleven, and a space…"*. Along the way, the text a stage said on completion was never shown (read after the stage advanced); it now is. |
| 10.3 | The name stays. "Build it and send screenshots." | Rebuilt: the look below, and the fight at full Dust (wall, four of him, Loyalty that always takes, Veil that relocates). The old king inherits the walls. His ledger leaf teaches a player Dust III wall. The Remembrancer office and the Hesper line were not ruled and are not in. |
| 10.4 | "Those tenants and rates are good." Overflow works in a Nullborn; workings cost no more Attention, but the discharge stays; a Watcher may turn. | All four tenants, at 14/10/7/4%. A Watcher turns at 1% a day from THE WATCHERS WAKE. A Scholar can "look" at a homunculus. |
| 10.5 | "A sixfold", not "the". Capped, "as they are capable of wiping out cities". | Named as a kind; none on day one; cap 1/1/1/2/3/4 by Fracture stage; one a day at 30% under the cap from stage 3; the Sigil-Bound counts any kill; the Mantle rides the first born. |
| 10.6 | "Incorporate it." | Easy in the dark (half the price), shy of the noon flats, the Kept know them (+50% regard), four Saltmere lines. |
| 10.7 | 1, 2, 4, 5, 6 and 7 yes; **3 (Kami keeps them out of Fallowend) no**: "the rivalry… is a bit more zoomed out". 4 gains the choice not to report; 5 becomes the cells rising against their own towns. | All six. Named by layer (the Order's `devourer` topic; the Coil's Appetite and Seventh). The Appetite sows wars with evidence. Report or stand with them. The rising at the Door. Rubido's barks. The Ouroboros Ring and the Serpent in Ash. |
| 10.8 | Blythe: a Hospitaller the Order **never hunted and hopes will rejoin**, not in their camps, a drunk. **Maren and Tallow approved; Grist and Idris cut.** | Blythe (taproom, three bottles, the drunk surgeon's hands, the Order's and Ash's lines), Maren (Copperhold speaker with a conversation), Tallow (Copperhold wanderer with her echo). |

**(mine)** marks my own invention.

### 10.1 The Ossuary King: a new name

What he is:
- a Golden-Age registrar who countersigned the Pouring;
- he was meant to be the twelfth name, went halfway into the vessel and climbed back out;
- he wears his bones on the outside and sits a throne with dead petitioners kneeling before him;
- the "crown" is the Pouring's register-band.

"King" is what's wrong with the name, and there is a second collision: the player can build an
**Ossuary**, so "Ossuary" is a building and a boss.

A rename touches 13 strings in the code, his Signet ("The Ossuary King's Signet") and two harnesses.

| name | for | against |
|---|---|---|
| **The Lord of Ash and Bone** (yours) | Plain-harsh, and says throne and bones at once | "Ash" is already Sister Ash, the Ashfall, Sanctified Ash and the Ash Phial |
| **The Lord of Bones** | Shortest, and the ash collision is gone | Generic |
| **The Undersigned** **(mine)** | His whole story in one word: he signed under eleven names and would not sign his own. Grim-title, and the joke lands late | A clerk's word, so the folk would not coin it; the demilich would |
| **The Bone Registrar** | Flat and true | Undramatic for a boss |
| **The Lord of Petitioners** | His court is the kneeling dead | Long |
| **The Countersign** | Clerical and eerie | Reads as a password |

**Recommendation: two names, by speaker**, the way the vocabulary already works:
- *The Lord of Bones* is the folk name, and his display name;
- *the Undersigned* is what the demilich calls him.

His Signet becomes *The Undersigned's Signet* either way. If you would rather have one name,
yours minus the ash, *the Lord of Bones*, avoids every collision.

### 10.2 The crown for the Last Rite

**Ruled:** the rite wants *an ancient crown of alchemical significance*. That is usually the Sunken
Crown, and Lyonart's is an equivalent.

**Mechanics (proposed):**
- **Any crown with the flag opens the rite.** The Last Rite accepts any item marked `lichCrown`.
  - It keeps the rule that the crown "is a key, not a candle", so it survives the rite.
  - The requirements line reads *"an ancient crown (Sunken Crown ×1, or …)"*.
- **Lyonart starts with a new item of his own, not the Sunken Crown.**
  - Today his `crown` satisfies the demilich's third stage at once, and the demilich reads eleven
    names off a crown that came from another world. That is the contradiction this fixes.
  - The third stage stays the Sunken Crown's alone. The eleven names are on it, so Lyonart still has
    to take one off the Ossuary King.
- **Where the Sunken Crown comes from:** his drop and the demilich's final reward, both unchanged.
- **Question: does the Old King's Crown also count?** It is the legendary helm he drops, *"nothing
  is engraved in it at all"*. I would say no: a crown with no names on it is the point of him.

**Names for Lyonart's crown:**

| name | note |
|---|---|
| **The Dark Prince's Crown** (yours) | Implies the world calls him the Dark Prince. It is good if something in the world says it; nothing does yet |
| **The Exile's Crown** **(mine)** | Flat-descriptive, which is the bible's rule for things. Humble for a prince, which suits a man who cannot use it yet |
| **The Crown of Alagadda** | Names a kingdom nobody here has heard of, and his surname already carries it |
| **The Far Crown** | Quiet and strange |

My pick is *The Exile's Crown*. *The Dark Prince's Crown* works if the halls start calling him that,
and they could (a rumour line).

**The demilich, when Lyonart does the quest** (drafts):
- **At the third stage, with Lyonart's crown in the stores:** *"Not that one. I can see it from here,
  and I can see where it has been, which is further than anybody has gone who came back. Bring me
  the one with the names in it."*
- **At the last stage, handing over the Sunken Crown:** *"You came here with a crown already. It is
  not one of ours. Ours were cast for a register; that one was cast for a throne, somewhere they
  did this work before we did and did not stop **(mine)**. It will open the same door. Keep mine
  anyway. I would not trust a key that fits two worlds with everything."*

### 10.3 The Unremembered, rebuilt

**Why it is the weakest of the court:**
- The others are an office: the Chancellor, the Master of the Pouring, the Keeper of the Conduit.
  The Unremembered is an adjective.
- The others are masked; it is a dun robe with a smear for a face, and three faint copies jittering
  in place.
- Its whole fight is three seconds unseen every twelve.

Dust is "the art that altered reality itself": vanish, plant a false memory, raise a wall that was
never there. Each of the player's Dust arts is a degraded version of one of those:
- *The Veil* and *Step Unseen* (vanish);
- *The Unwalled* (a squad that was never there, whose blades cut nothing);
- *Loyalty of Dust* (a charm that may not take);
- *Change Form*.

The courtier should be those arts at full, so the player sees what theirs used to be.

**Who (proposed):**
- **The King's Remembrancer.** **(mine)** It is a real old office: the Remembrancer kept the
  kingdom's records.
- In the Golden Age his office decided what the kingdom remembered, and with the art it decided
  what had happened.
- Nobody can remember him now; the folk call him the Unremembered, and so does the log.
- He comes through onto the salt flats. The town beside them, Saltmere, brines everything it means
  to keep, and he is the thing nothing keeps.
- **Question:** keep *The Unremembered* as the name shown (my pick, with the Remembrancer only in
  what the lettered say), or show *The Remembrancer*?

**Look:**
- Tall and thin in the grey-white of the salt: a scribe's layered robe with long sleeves, a ledger
  on a chain at the hip, and ink-black fingertips.
- **Masked, like the rest of the court.** A plain white oval with one black bar across it where the
  eyes would be: a redaction.
- **Black bars drift round him and across him** as if somebody is still editing.
- **He is not all there.** A forearm and hand float at the end of a sleeve with nothing joining
  them, and a band of the torso is missing, with the robe behind showing through the gap.
- **The afterimages trail where he has been**, a second or two behind, instead of jittering in place.
- Dust falls off him the whole time, like a page being rubbed out.
- I would build him and send screenshots to iterate, as with the court.

**The fight: the Dust arts at full:**

| his | the player's degraded version |
|---|---|
| **The wall that was never there.** About every 15 s he raises a pale wall of 5–7 tiles across a flank or between himself and the nearest of yours. It is real to paths and sight for 8 s, then it is dust. | None: the art has lost this reach. It is the §4 seam, *"there is no illusory wall"*. |
| **His Unwalled.** At half blood he becomes four, and **their blades cut**, until one of them is struck, and then that one is dust. | The Unwalled: phantoms whose blades cut nothing. |
| **His Loyalty.** One of yours forgets whose side they are on for 8 s, and it always takes. | Loyalty of Dust, which may not. |
| **His Veil.** Vanishes and is somewhere else, and whoever was fighting him loses him. | The Veil: vanish in place. |

- **Struck from the record.** While he stands, his name in the log is *The ———*. When he dies the
  journal says *"Something was killed on the salt flats. Nobody who was there can say what."*
- **The old king inherits the walls,** not the fold: with the Remembrancer alive, walls rise inside
  the Door while you fight the king.
- **What he drops:** besides the usual codex, formula and tome, **the formula for the wall**, so a
  Dust III player learns the reach the art had lost. That closes the §4 seam for the player too.
- **Link to Hesper Lund (question):** she walks the roads and "is on the road again every time". A
  line from her once the Remembrancer is dead (*"I remember where I was going"*) would tie them.
  Only if you want her to have lost something to him. **(mine)**

### 10.4 Homunculi and the souls they draw

The bible: *"As empty vessels they attract artificial souls — stray alchemical overflow, an Old One's
dream, even a whole Watcher. The Golden Age believed it was manufacturing labour."*

In the code, homunculi are five lines (Vat-born, Wardline, Forge-line, Sleepless, Nullborn), learn
at ×1.35, and die at 34.

**The idea:**
- **Every homunculus, on the day it is poured, has a chance of a tenant.**
- The tenant is **hidden until it shows**: a line in the log, and after that a row on the character
  sheet.
- It can show in three ways:
  - **a trigger** that fits the tenant (the first night near a tear, a blood moon, a kill);
  - **time** (a season in the squad);
  - **a Scholar asked to look.**
- Each tenant has one real upside and one real downside.

| tenant | chance | upside | downside | how it shows |
|---|---|---|---|---|
| **Nobody** (empty) | ~65% | none: the Golden Age's intended product | none | never |
| **Overflow**: the vat's leftover charge | ~14% | Gifted: attunes to a random art, starting at I, even a Nullborn **(question)** | Each working draws more of the Attention, and now and then it discharges: a spark and a burn to whoever is beside it | first time it casts, or in a fight |
| **A dream**: an Old One's | ~10% | Learns one skill (the dream's) twice as fast, and dreams **lines** at night (lore snippets, one at a time) | Sleepwalks: some nights it walks toward the nearest Sundered site, and Malathuun's creatures there do not touch it **(mine)** | a night's sleepwalk |
| **An echo**: a Golden-Age person, a pourer or a subject | ~7% | Lettered: reads formulae and tablets, with a small research bonus | It starts answering to another name: its **name changes** on the roster, conviction becomes haunted, and it will not raise the dead | a season in the squad |
| **A whole Watcher** | ~4% | Sees in the dark (day sight at night); gaunts pass it by unless it attacks | The Order knows it on sight (Paladins hostile, an inquisition finds it), Messengers hunt it, and at the Second Fracture it may turn for good | the first tear it stands near |

- **Never Mother's.** The Hollows are hers, and a homunculus with a piece of her would blur the one
  line the bible draws hard.
- **Nine**, the unique, has no tenant: *"The order has not been rescinded"* is a person with nobody
  else in.
- **Nothing new is built for it.** It reads systems that exist: gifts, the Attention, sleep, the
  sundered sites, the Order's inquisition, the Messengers, the convictions and names.

Questions:
- the five tenants, or fewer;
- whether the rates suit;
- whether the Watcher tenant should be able to turn.

### 10.5 The Sixfold: a kind of creature, still written as a boss

**Where the code treats it as one:**

| # | where | what | fix |
|---|---|---|---|
| 1 | `spawnSixfold` | every one is named **"The Sixfold"** | "Sixfold", and the log says "a Sixfold" / "the Sixfold" by context |
| 2 | `spawnSixfold` | every one has `bossKey: 'sixfold'`, so the kill ledger (`bossSlain`) records the first and ignores the rest | a kind, not a boss key; a kill count |
| 3 | worldgen | **one is spawned on day one** near a corpse site, so the early game has one | none at worldgen; see below |
| 4 | the legendaries | *The Gaunt's Mantle* is carried by the day-one Sixfold ("scavenged off the largest scavenger") | the first Sixfold born carries it |
| 5 | the Sigil-Bound's second stage | done when `bossSlain.sixfold` is set | done when a Sixfold dies after it is asked (so a day-one kill does not pre-complete it) |
| 6 | asking after quarries | a Scholar says *"The Sixfold. It feeds where the ground is Sundered…"* | *"Sixfolds feed where…"*, pointing at the nearest |
| 7 | Mother | *"You put down the sixfold thing."* (keyed on the ledger) | keyed on the kill count; the line is fine |
| 8 | `vscaleOf` | "the boss stays the biggest thing in the world" | the kind still draws big; the comment goes |
| 9 | the log | *"The Sixfold gathers all six legs…"*, *"The Sixfold tears something…"* | the creature's own name |
| 10 | the bible §10 | the row was "The Sixfold" | done: "Sixfolds, a late-game enemy" |

**How to make it late-game (proposed):**
- **Born when a tear reaches full width**, as now. Early on that only happens to a player who leaves
  a tear alone.
- **From the Second Fracture's middle stages on (stage 3 and up),** one or two walk the deep waste on
  their own, as the Messengers already rise with the clock.
- **The cap on how many exist** follows the Fracture stage: 0/0/1/2/3/4.

The Sigil-Bound's "a Sixfold walks the waste" then asks for something the player may have to wait
for, or make (leave a tear open). Question: is that the right cost, or should his step move later in
his chain?

### 10.6 Saltmere and the pureblood line

**Ruled:** implied, never stated. The line in play today: *"Saltmere brines everything it means to
keep, and after enough generations that includes the people. Hard to kill and hard to change."*
(toughness and armour, resists sickness).

**Leaning in (proposed):**
- **The blurb** (draft): *"Saltmere brines everything it means to keep, and after enough generations
  that includes the people. Pale under the salt-burn, easy in a cellar, and hard to kill."*
- **Traits:** one that shows the old blood, and one that costs:
  - **easy underground:** the dark's toll on them is halved, and they see a little further below;
  - **uneasy under open sky:** 5% slower on the surface between late morning and mid-afternoon.
- **The Kept notice.** A Salt-cured who lays something on a vigil's altar raises its regard by half
  again, and the congregation "comes in close to look at this one" **(mine)**. Nobody says why.
  This is the strongest single tell, and it is all show and no statement.
- **Saltmere talks** (townsfolk, drafts):
  - *"We keep off the flats at noon. It's the glare. That's all it is."*
  - *"My grandmother could find the cellar steps without a lamp. So can I, mostly."*
  - *"We bury deep here. Deeper than we need to. Nobody remembers why we started."*
  - *"Strangers ask why we marry in. We ask why they don't."*
- **The Unremembered's ground is theirs** (10.3): the thing nothing keeps comes through beside the
  town that keeps everything.

### 10.7 Har'mageddon, and the Coil

**What exists:**
- **He is never named in play.**
- **The Coil:**
  - cells of 3 to 5 townsfolk in every town but Hollowmere, with a speaker each;
  - they meet some nights at a serpent stone (an ouroboros) that is on no map, and train, "not
    worship, practice";
  - they recruit and buy the watch;
  - once, when two wars are running at once, they murder a town's leader and leave a serpent in ash
    on the threshold.
- **Rubido** stands at their stone: *"I have been on the other side of that particular arrangement."*
- **In the bible:**
  - he is the devourer and seeker of endless war, the ouroboros at the end of time;
  - Paladin myth sets him against Good Kami and calls him the **sixth-born**; the cults say the
    **seventh living**;
  - his place in the cosmology is open.

**Ways to widen it** (pick any; they stack):
1. **Name him, by layer.**
   - The Church's Teaches tree gains a topic: Kami and Har'mageddon, the sixth-born, *"greed with a
     god's name on it"*.
   - The Coil never says the name to outsiders: *"the Appetite"*, *"the Seventh"*.
   - Which birth order a speaker uses says which side they are on, and nobody reconciles it.
2. **War is the sacrament, as a system.**
   - Every running war feeds a hidden *Appetite*.
   - At thresholds a cell **makes** a war: a caravan burned in one town's colours, an envoy found
     dead, an insult posted at a gate. Two towns go to war over something the player may be able
     to prove was the Coil.
3. **Kami keeps them out.** Fallowend, every lintel hung with charms, **cannot hold a cell**. The
   cult's recruitment fails there, and a speaker sent there leaves. That is the Paladin myth made
   mechanical, and Kami answering, as the bible says Kami does. **(mine)**
4. **An investigation.**
   - Asking in halls (the rumour system) about the serpent in ash, then following a member out
     after dark, finds the stone.
   - Exposing a cell to its town's leader turns the town against it: arrests, and the Order is
     not needed.
   - Leaving it alone lets it grow; the watch looks away already.
5. **The Coil wants the Door open. (Question: a lore decision.)** A devourer's cult would want the
   end, and the Eldest waking is the end.
   - At the closing rite, when the Door is open, **Coil cells march on the crater** and fight
     whoever is holding the rite.
   - The quiet people you traded with for sixty days are at the rim with blades. It makes them part
     of the endgame and ties the cult to the main plot, without saying what Har'mageddon is.
6. **Rubido.** He was once on the god's side of the stone. A line at recruitment, or as a companion
   near the stone, says a little more, and never the name.
7. **Coil relics:**
   - an **Ouroboros Ring** (a trinket): every kill in a fight adds a little to the next blow, but
     whoever wears it will not retreat;
   - a **Serpent in Ash** mark found at the stone.

My order: 3 and 1 first (cheap and mythic), then 2, then 4. Then 5 if you want the Coil at the end.

### 10.8 Named people

The bible's named figures now include the eight wanderers and Czarina (§13). The world still has
gaps where the setting's arguments have no face.

- **Brother Blythe** (yours) — an ex-Paladin who took Sister Ash's path without the exile. He still
  wears the plate, but not the helm.
  - **The shape (proposed):** he asked Ash's question, *what is the light we burn them with made
    of?*, and stopped lighting pyres. The Order did not throw him out, because he is **the best field
    surgeon the Bastion has** **(mine)**: a Hospitaller.
  - **The helm is on a pyre somewhere.** He will not be anonymous when he decides who lives.
  - **Divine gift, devout** (to the people, not the Church), tanky, a strong medic.
  - **Where:** at the Order's post at the pass, or in its camps. He is the one Paladin who will talk
    to you there without *"no further"*.
  - **What it takes (options):**
    - spare somebody the Order meant to burn (an accused suspect or one of Albedo's kind);
    - or bring him to the pyre where his helm is.
  - **What he knows:** half of what Ash knows: that the light and the dark are drawn from one well.
    He has not said it aloud, and says it once to a player who has closed a tear with the blessed
    art.
  - Ash and he would have **one line each about the other**, and neither is kind.
- **Maren Tollis** **(mine)** — a Copperhold chandler and a **Coil speaker**. The cult's human face:
  pleasant, fair-dealing, drills at the stone twice a week. Met at her counter. If exposed she does
  not run; she asks what you think war is for.
- **Old Grist** **(mine)** — **Saltmere's salt-house keeper**. She salts the town's dead and keeps
  the burial rolls, and is the tell of 10.6 in one person: she works in the dark, avoids the noon
  flats, and has kept every name for fifty years. She would be the one to say, once, *"the flats
  used to be further off"*.
- **Idris Vane** **(mine)** — a **Scholar cartographer** with a name and a route. He keeps the
  ledger of quiet corpse-fields (the bible's way to Lyre). He has seen the old man twice, forty
  years apart, and it is his journal that makes the Last Scholar's early sighting land.
- **Tallow** **(mine)** — a **Vat-born homunculus with an echo** (10.4), recruitable. It began
  answering to a woman's name last winter and would like to know whose.

Questions:
- Brother Blythe's shape: Hospitaller, at the pass, what it takes;
- which of the other four to keep;
- whether Blythe and the others are wanderers (recruitable uniques) or people who stay put.

### 10.9 Found on the way

- **Homunculus lines:** the bible says *"six lines poured for one job each"*; the code has five
  (Vat-born, Wardline, Forge-line, Sleepless, Nullborn). One side should move.
- **The wanderers** are introduced in the code as "six people" and there are eight now. That is a
  comment only.


## 11. Play notes of 2026-09-29: the postgame, the Brood, a fuller world (ruled 2026-09-30)

Three brainstorms for a ruling. Two small fixes from the same notes are built: the Messenger fights
with its arm and a burning blade, and a townsperson answers with a rumour instead of a window.
**(mine)** marks my own invention.

### 11.1 After the Door: the postgame

"Defeating the old king and sealing the door should somewhat 'reset' the world. As in, all existing
tears should close, and the attention should reset to zero."

**Built:** sealing the Door now closes every tear in the waste, sends back what came through them,
and puts the Attention to zero.

**Found, and it needs a ruling first:** the Fracture drops only to 92 and the calendar keeps
running, so **the Door opens again about fifteen days later** (100 / 180 a day from 92). Today there
is no postgame, only a reprieve. The shipped line, *"It is not over. It is survivable."*, was
written for that reprieve. Options for the clock:
- **A. Stop it.** The sky is shut and stays shut, and the world gets on with living. The simplest,
  and the one every item below assumes. **(my pick)**
- **B. Roll it back** to the start of THE WATCHERS WAKE (60), running at half speed: a second,
  slower cycle, with the tears coming back one at a time.
- **C. Let it heal.** The Fracture runs *down* a point a day to zero. Stage by stage the tears stop
  opening, the dust thins and the light comes back. It reads as the world recovering.

**What the postgame could hold** (pick any; they stack):
1. **The dust thins.** Over some weeks the lighting and fog lift toward a clear sky nobody alive
   has seen, and the towns remark on it. It is the visible reward, and cheap to build (the
   lighting already reads the clock).
2. **Resettle the fallen.** A seat that fell to the dark or the torch can be refounded: stores, a
   watch, and refugees from the other towns walking to it. A player-built seat joins the Compact.
3. **The Compact after the war.** With nothing at the gates, the signatories start arguing: tithes,
   borders, who pays for the muster now. The player's institution becomes politics. The old war
   system gets new causes.
4. **The Order claims it.** The Paladins preach that Ainzopha'ar shut the sky. If the player is a
   necromancer, a lich or Hollow, the Order's answer to a profane saviour is a crusade. If the
   player is blessed, the Order wants them canonised and at the Bastion. Either way the Church's
   two layers (what it teaches, what is true) finally collide in public.
5. **The Coil without a war to feed on.** The Appetite turns inward: cells fight each other, or
   start the one war nobody else will.
6. **The people who were waiting for this:**
   - Mother's third scene (she felt the Door shut);
   - the Last Scholar's last conversation (he knows it is not the end: the Twins are still held,
     §11 of the bible);
   - Lyre's ending with her brother;
   - the demilich's (a lich in a world with no Door).
7. **The crater opens.** With the Door shut, the colonnade's floor gives onto the kingdom
   underneath: vaults, the throne room, what was on the throne (bible §4, author-canon). An
   endgame dungeon for the postgame.
8. **An epilogue page.** A chronicle of the run: seats that stood and fell, the deeds each
   conviction weighed, who is still alive. Then *continue*, not *game over*.

**My order:** A, then 1 and 8 (cheap and they say "you won"), then 6, then 2 and 4. 7 is the big one
and wants its own round.

**Ruled 2026-09-30, and built the same day:** "after the door closes, I don't think it should reopen
again. It should somewhat reset to the very first phase where gaunts etc are pretty scarce." A,
with the clock put back rather than stopped where it stood: sealing the Door sets the Fracture to
10, the middle of THE DUST FALLS, and nothing advances it after that (`doorSealed`, saved). The
night stays scarce (§11.3's companion ruling, *legends first*, reads the same clock). The shipped
line now ends "The sky is not healed. But it is shut, and it is going to stay shut." **(mine, for
review.)** Items 1 to 8 are still open.

### 11.2 Brood-of-the-Door: something more eldritch

"Basically just a giant dude. Kind of lame."

- **What it does, which any replacement keeps:**
  - it is the thing holding the Door open;
  - four anchors can be cut off, and each narrows the Door (cheaper rite);
  - the Door's reinforcements come out of it;
  - the rite cannot land while it stands;
  - it never leaves the Door.
- **Why it reads wrong:** it is a torso with four arms planted in the ground, so the eye sees a very
  large man doing a push-up.

**Options** (all **(mine)**):
- **A. The Hand.** You never see the body. Four enormous jointed fingers are hooked over the rim of
  the Door from the far side, prising it open, each several tiles tall with too many knuckles.
  Between them the Door's lips are held apart. The four fingers are the four limbs, and cutting one
  lets the rim close a little. The doorborn drop from the gap between the fingers. It is the
  clearest possible picture of "the thing holding it open", and it needs almost no new mechanic.
  **(my pick)**
- **B. The Cord.** A pulsing umbilicus from the Door down to the crater floor, anchored by four
  roots, with things born along it like beads that drop off when they are ripe. Cutting the roots
  sags the cord. It reads as the Door feeding on the world.
- **C. The Pupa.** A translucent sac hanging in the Door on four veined stalks, full of shapes that
  move. It swells as the fight goes on, and a stalk cut drops it a little. It dies by tearing, and
  what spills out is the last wave.
- **D. The Wheel.** Interlocking rings covered in eyes, turning slowly in the Door: the thing the
  Order would call an angel of Ainzopha'ar. Four rings to break. It is the most striking, and it
  makes an argument (the Church's god holds the Door open), which is a lore decision, not only a
  look.
- **E. The Host.** Not one creature: a knot of doorborn fused into a column wedged in the Door, faces
  and limbs of every gaunt kind grown together, with four thick trunks braced on the ground. Each
  trunk cut spills its bodies.

**Ruled 2026-09-30: D, the Wheel** ("Makes sense and aligns with the biblical parallels we've
incorporated. Let's build it."). **Built the same day** as The Wheel in the Door: four rings of old
gold, one inside the other, each tumbling on its own axis, the rims full of eyes that look out of
both faces of the band, one great eye at the hub that looks about, and flame going up between the
rings. Each ring sits on one of the four limb slots the rite already counts, so cutting one drops
it out of the turning and narrows the Door, exactly as before. The rings turn three times as fast
while it winds up a blow. Internally it is still `brood`, so no save needs converting. **For review
(mine):** the name; the spawn line ("SOMETHING IS TURNING IN THE DOOR. A wheel inside a wheel, and
another inside that, the rims of them full of eyes, and fire going up between them. The sky is open
because it is turning."); the world event (the Order's people kneel); the journal's rite lines; and
the ring-cut line ("One of the Wheel's rings breaks and falls out of the turning, and the Door
narrows.").

### 11.3 A world that feels sparse

"The size is great but we need to brainstorm ways to balance emptiness with life."

**Measured** (default seed, 2560², about 5.25M land tiles):
- **Places:** 7 towns, 25 ruins, 3 redoubts, 13 Sundered sites, 6 shrines and 296 chests.
- **Distance:** from a random land tile, the nearest place of any kind is a median 69 tiles off
  (90th percentile 132). That is 19–37 seconds of walking.
- **People and animals between places:** about 45 fauna, 99 wild, 23 drifters and 33 of the
  guild, on the whole map. The 1,270 bandits are almost all in their camps.
- **Conclusion:** places are not especially far apart. What is missing is life *between* them.
  The walk is empty, not long.

**Ways to fill it** (pick any):
1. **Hamlets and farmsteads.** Small unwalled places of three to eight people around each town,
   and along the roads: salt-pans, charcoal burners, a shepherd, a well with a hut. They are the
   town's hinterland. They supply it, raids hit them first, and they give a war and the Fracture
   something to burn before the walls. **The biggest single change.**
2. **Traffic on the roads.** More of what already exists: pilgrims, the Order's patrols with a
   prisoner, refugees from a war, a caravan broken down and asking for help. Each is a short
   encounter that reads the world's state, so a war *looks* like a war from the road.
3. **Herds and scavengers.** Strider herds that migrate, carrion birds circling wherever something
   died (a free pointer to fights and corpses), dust hares, and something that follows caravans.
   Cheap, and it makes empty ground feel inhabited rather than abandoned.
4. **Landmarks on a grid.** A guarantee that no point of land is more than about 50 tiles from
   *something*. Most are small: a standing stone, a Golden-Age statue half buried, a wreck, a
   milestone, a cairn with a line of text. Each is a place to find a Tablet or an item's story (the
   lore drops the item card made room for).
5. **History that stays.** A war leaves burned farmsteads and a mass grave where it was fought, a
   sack leaves a refugee camp outside a neighbour's walls, and a tear that closed leaves glassed
   ground. The map records the run.
6. **Waystations.** An inn every hundred-odd tiles on the trade roads (the scavengers' waystation is
   one already): food, rumours, a bed, and a hired sword or two.
7. **Getting across it.** Pay to ride with a caravan between two towns you know, or build a Wayline
   Circle at each end. That fills the map with less walking rather than more things.

**My order:** 1 and 3 together (they fill the ground most for the least), then 2 (it makes the
world's events visible), then 4 (it carries the lore drops). 5 is the long-term one.

**Ruled 2026-09-30:** "I like the idea of hamlets etc.. I'd also like to add some new biomes, and
make the main roads between towns a bit more obvious. Right now the waste all blends together.
Let's work at this little by little so as not to overcrowd the game." Two steps are built, both
checked by `tools/waste.js`:
- **The roads, worn into the ground.** They were a stroke on the ground texture narrower than one
  of its pixels. The track is now in the ground's own vertices: darker and browner down the
  middle, fading out three tiles to the side (74% as bright as the waste eight tiles off, at 57
  points on 10 roads).
- **Hamlets, one per town.** Out along one of the town's roads, 58 to 67 tiles from its gate on the
  default world, kept clear of camps, Sundered sites, ruins, redoubts, the Bastion, the Guild, the
  Coil's stone and the crater. Four farms, two wells (Copperhold, and Ironscar's in the rust, clear
  of the sleeping automatons) and Saltmere's pans. Each is a house (a farm adds a barn) in its
  town's style, a well, the work in the yard (rows and bales, a trough and barrels, white pans and
  salt heaps), and three or four people who keep to it and talk about the work. The houses are
  laid at worldgen without a draw; **the people arrive the first time one of yours comes within 90
  tiles**, on a stream of their own, so a new world is exactly the world it was. Names are a
  surname and the kind ("Coker Farm", "Kessel Well", "Dunmore Pans"). **(mine, for review.)**
  **Open:** hamlets are outside the law (`crime` asks `townAt`). Tie them to their town's watch, or
  leave the waste lawless?

### 11.4 New grounds, for a ruling

The same rules as the three built grounds (§8.1): each stands round the thing that made it, is
laid without a draw, and whatever sleeps in it wakes only when one of yours walks up. One at a time,
as asked. Five from the 2026-09-26 brainstorm were never built:
- **A. Albedo chalk and the bone-hills.** White ossuary country round the Lord of Ash and Bone's
  seat: chalk ground, bone outcrops that yield Mortal Remains, and a harsher cold at night. The
  strongest contrast with the tan dust, and it gives the Lord a country.
- **B. The oases.** Two or three rare green pockets like Greenrest: walled gardens the alchemists
  kept, always guarded, with fruit and clean water. Somewhere to rest on a long road.
- **C. The sulphur vents.** Yellow fumaroles whose air hurts the living and not the dead, and where
  fire workings run stronger. A necromancer's ground.
- **D. The quicksilver fens.** Mirror pools of liquid metal. The fumes move convictions, and they
  are the only source of a rare reagent.
- **E. The nigredo ashwood.** A black petrified forest downwind of the crater. Dark workings
  resonate there, and bodies left in it blacken.

And two new ones, aimed at the "it all blends together" note rather than at a mechanic **(mine)**:
- **F. The dune sea.** Open drifting dust with long ridges and nothing in it. The one place the
  waste looks like a desert on purpose. Tracks fill in behind you, and something travels under it.
- **G. Glassed ground.** Where a tear closed, the ground fuses to glass and stays. It grows as you
  close tears, so the map records the run (way 5 above).

**My order:** A (the most visual contrast, and a reason to go), then B (it breaks up the long
roads), then C. G is cheap once tears have somewhere to leave a mark.

## 12. A skyline, and the map drawn whole (2026-10-02)

The play note: *"What if, instead of fog, the entire map is drawn already and simply cannot be seen
until a squad member is close by? ... I do like the idea of a unique skyline."* Ruled the same day:
*"Whole map is drawn but we keep the current sight range and that is where the tint difference (and
what the player can actually see) appears. Also the free roam camera is tethered to the nearest
squad members... (Take Kenshi's system for this as inspiration.)"* Built in order, one at a time.

### 12.1 The map, drawn whole

- **What you see:** all ground, trees and buildings, from the first frame. Out of sight it is
  greyed and dimmed (to 65% of its brightness, and nearly colourless). Nobody out of sight is
  drawn.
- **Explored is now an internal state only.** It still drives the save, the scouts, the charts and
  the place names. On screen, ground you walked a week ago looks the same as ground nobody has
  walked.
- **The camera stays within 64 tiles of the nearest of your people.** That is about twice what
  anybody sees at noon. Any one of them is an anchor. A click on the minimap lands at the edge of
  the nearest one's circle.
- **The minimap** shows the whole country, with a light wash over what is out of sight.
- **Open: charts.** A bought chart used to open ground, and all ground is open now. It still marks
  the towns, ruins and hamlets inside it on the minimap, and names them on screen. Three options:
  1. Leave it as is: a chart is a gazetteer.
  2. Make it mark more: the Sundered sites, the towers, the ARK.
  3. Drop its price to match what it now does.
  **(Ruling needed.)**

### 12.2 The Sundered sites, the size of hills

- **Scale:** the bones, their footprint and their ground are 2.2 times what they were (`SITE_K`).
  The ribcage is about 40 tiles long and stands about 25 high. They read on the skyline from well
  outside sight.
- **Named once reached:** the label "THE SUNDERED GROUND" appears only after one of yours has
  stood within about 21 tiles of the middle (`reached`). Seeing the site from a distance is not
  enough. The flag rides the save.
- **Scaled with them:** the guardians' spread, the ticks, the cache, the Hallow order's reach, the
  Sixfold's spawn, and Lyre's two arrival tests.
- **The site's animals now roll on a stream of their own.** This shifts the generated world once
  (the default starting party comes out with different names). After this, changing the size does
  not shift it again.
- **Proposed, not built: a name for each site (mine, for review).** Today every site carries the
  same label. A name per monument would be:
  - **The Cage** for the ribcage
  - **The Brow** for the skull
  - **The Reaching Hand** for the hand

  Where two share a shape, add a bearing from the nearest town, as the Cairn Beasts do (*"The
  Cage east of Copperhold"*). The label would read *"☠ THE CAGE — SUNDERED GROUND"*.
- **Fixed on the way:** after any reload, every monument could be walked through. The footprint
  went into `blocked` but not into `baseBlocked`, and `restore` rebuilds from the latter. The
  hamlet houses had the same fault. Both are fixed.

### 12.3 The Golden-Age towers

- **What they are:** the tallest things a person built in this world. Each is a shaft of pale
  dressed stone, banded in gold every few storeys, on a stepped plinth with four buttresses, and
  gone at the top.
- **How they ended up:** they come in three states.
  - **Standing:** 44 to 58 high, the broken stubs of the last storey and a crooked gold collar on
    top.
  - **Leaning:** 34 to 44 high, about seven degrees off true.
  - **Snapped:** a stump of 14 to 20, with the other 24 to 32 tiles of it lying where it fell.
- **Where:** 19 on the default world, 240 or more apart, each at least 110 from a town and clear
  of the roads, hamlets and Sundered sites.
- **Placed without a draw.** The world is unchanged apart from 19 chests appended to the list.
- **They are solid,** and survive a reload.
- **A cache at the foot of each:** 40 to 130 cats, two to five scrap, and one of a worn formula,
  an aether cell, a gold bar or two lead. Chosen by hash.
- **Named once reached**, as the Sundered sites are, and marked on the minimap from then on.
- **Checked by:** `tools/skyline.js`.
- **For review (mine):**
  - **The label:** *"▲ A GOLDEN-AGE TOWER"*.
  - **The look:** pale stone, gold bands, a collar at the top.
  - **What they were for: not stated anywhere yet.** One option that fits the bible is the
    kingdom's aether spires, the conduits its siphoned power ran through. I have not written
    that anywhere a player can read it.

### 12.4 The wreck of the ARK

The ask: *"Let's make it the wreck of a titanic spaceship. Project ARK, meant to evacuate humanity.
Perhaps parts of it are explorable."*

**Built (the hull only).**
- **Size and lie:** 170 tiles from the stern to the buried prow, 32 across and about 24 high. It
  came down nose first and slid. The prow is under a mound it ploughed up. The stern stands clear
  of the ground, with three cold engine bells and two fins, one of them torn off and lying beside
  it.
- **The breach:** amidships the plating is gone from the top and one side, and the ribs stand
  over a black hold.
- **The furrow:** a 150-tile trench runs behind it, berms thrown up on both sides, with 34 pieces
  of plating and gold trim lying in it.
- **The look:** dark bronze, lighter panels, verdigris, and the towers' gold in bands.
- **Where:** one on the map, placed off the hash with no draw. It is 639 tiles from the nearest
  town on the default world, far from every road, and the towers keep 60 or more clear of it.
- **Solid,** and survives a reload. The furrow is open ground, and nothing grows under the hull or
  in the furrow.
- **Named once reached,** like the rest. The label is *"◆ PROJECT ARK"*, and the minimap draws its
  length from then on.
- **Checked by:** `tools/skyline.js` §5.

**Not built, waiting on a ruling:** the inside, and every word a player reads about it.
**(All mine, for review.)**
1. **Who built it, and when.** The bible's Golden Age is an alchemical kingdom: aether lances,
   automatons, bunkers. I propose the ARK fits there, and suggest one of two readings:
   - **A. Before the Fracture.** The alchemists' last great work, built in the years after the
     Last Scholar's warning by the part of the court that believed him. It was to carry the
     kingdom's chosen away if the rite went wrong. It lifted as the light came and did not get
     far. This one ties to the warning they spurned.
   - **B. After the Fracture.** Built by the survivors to get away from the Watchers. It ran on
     the old conduit power, and fell when alchemy began to come from the wound instead. This one
     ties to "the Golden Age's project, delivered."
   - **My pick is A.** "Meant to evacuate humanity" then means "meant to evacuate the people who
     mattered," which is the Golden Age all over.
2. **What it is called in the world.** "Project ARK" is the Golden Age's own name, found on its
   plates and in its logs. The living call it **the Keel** (or the Hull), because that is what
   sticks up out of the ground. The label would then read *"◆ THE KEEL"* until somebody reads
   the plate.
3. **Where.** Tying it to the **rust barrens** would make its spill the origin of the barrens'
   war-rust and its sleeping automatons. Moving it there means taking it out of its own country
   on the default world: the barrens are centred on Ironscar.
4. **Inside: the second step, once the above is ruled.** The breaches would open onto decks:
   corridors, a hold of cold sleeper berths (the chosen, still in them), a bridge with the
   ship's log, and Golden-Age automatons that never stood down. The loot is aether cells,
   schematics and the log. The log would be the lore drop, and it would need your words or your
   approval of mine.

### 12.5 Ruled 2026-10-03

- **Explorable places are the top priority.** *"I would really like for more explorable areas
  across the map. Like the ARK and these towers... making them big enough to explore and actually
  fit squads in is kind of ideal. The ark is big but not big enough."* Walls and ceilings going
  clear when entered is part of the same ask.
- **Camera lead:** doubled to 128 tiles. **Done.**
- **No minimap.** *"Obviously this will require the world to be more 'set' rather than randomly
  generated... a more handcrafted world that won't break quite as easily. Let's start
  architecting toward this."* **Done** for the minimap: switched off, code kept
  (`setMinimap`). The set world is a plan in progress.
- **Charts:** retired, code kept (`CHARTS_ON`). **Done.**
- **Sundered sites:** a unique name for each.
- **Towers:** the generic label stays for now. **What they were is ruled:** aetheric conduits,
  essential for the rite that opened the sky (bible §15).
- **ARK and AEGIS:** ruled (bible §15). AEGIS is the redoubts, the Aether Lances and the
  automatons.
- **Quicksilver fens:** mimics out of the mercurial pools, restlessly hunting your allies. **On
  hold** until it is fleshed out.
- **The Calcine Wood** (the name stands for now). **Built (12.8); its words, dials and fauna
  are waiting on you.**
  - Raised corpses blacken (black bones) if left there long enough, and come back stronger.
  - **Ash squalls**, acid rain in effect: a hat protects you, and the undead do not need one.
  - Local fauna: to brainstorm.
- **Roadside stops with a choice:** bandits demanding a toll or food, an Order patrol
  questioning your faith, refugees asking for help. Occasional, never intrusive, and not every
  bandit hostile on sight. **Built (12.6); its words are waiting on you.**

### 12.6 Roadside stops: the words, for a ruling

The mechanics are in (ROADSIDE STOPS in the game; `tools/roadside.js`). **Every line below is
new player-facing text and is unruled.** Change any of it and the scene stays the same.

**How often.**
- About **0.77 stops a day of walking** out past the fences, and 30 to 54 hours of quiet after
  each one.
- Only for one of yours who is actually on the move, never on the first day, never inside a town's
  reach, a hamlet's, the Bastion's or the headland's.
- Toll-takers about 45% of the time, the Order 30%, people with nothing 25% (a little more as the
  Fracture deepens).

**What they look like.**
- **Toll-takers:** 4 to 6 Dust Bandits.
- **The Order:** 3 or 4 Paladins with an Acolyte, from the Bastion.
- **People with nothing:** 3 to 5 people, sometimes with a child.

**The toll** (window title *ON THE ROAD — A TOLL*).
- Opening barks: *"The road is ours. You pay to walk it."* / *"Toll. Coin or food, your
  choice."* / *"Far enough. Now you pay."*
- Scene: *"{N} of them across the road, in no hurry, weapons out but down. The one in front
  wants {toll} in coin or 6 rations of food to let {speaker}'s people by, and says it like
  somebody who has said it a great many times."*
- Choices:
  - **PAY**, which costs 40 to 450, rising with the day and your purse.
  - **HAND OVER 6 RATIONS.**
  - **TALK YOUR WAY PAST**, on charisma and how many of you there are against them.
  - **LET THEM SEE WHAT YOU ARE**, on your numbers, the dead with you and your name.
  - **[LICH] Step aside**, with no roll.
  - **DRAW STEEL.**
- A failed talk or threat is a fight.

**The Order** (*ON THE ROAD — THE ORDER*).
- Opening barks: *"Hold. Whose light do you walk by?"*, or, with your dead in plain sight,
  *"Hold. What walks with you?"*
- Choices:
  - **PROFESS THE FAITH**, on charisma and your name; the divine gift helps a great deal and
    visible dead hurt a great deal.
  - **TITHE** 30 to 240 **TO THE BASTION**, not offered with the dead in view.
  - **SAY NOTHING**, which costs a little standing, or with the dead in view becomes a fight.
  - **DRAW STEEL.**
- A failed profession without the dead in view becomes a demanded tithe, and a fight if you
  cannot pay. With the dead in view it is *"Liar. Burn it."* and a fight.

**People with nothing** (*ON THE ROAD — PEOPLE WITH NOTHING*).
- Opening barks: *"Please. Anything you can spare."* / *"We have walked three days. Please."* /
  *"Is there food? For the little one, if nothing else."*
- Choices:
  - **GIVE THEM 4 RATIONS**, a mercy on the ledger.
  - **GIVE THEM 25 IN COIN**, half a mercy.
  - **TAKE THEM IN**: all of them join you, and it is a mercy.
  - **POINT THEM TO {nearest town}.**
  - **TAKE WHAT LITTLE THEY HAVE**, 6 to 30 coin, on the ledger as a small sack.
  - **TURN THEM AWAY.**

**For you to rule:**
1. All of the text above.
2. Whether the Order on the road should be the Bastion's Paladins (the `purge` faction, as
   built) or some other arm of the Church.
3. Whether a refused tithe should cost more than standing.
4. Whether the people with nothing should sometimes be *something else*: a trap, or
   Watcher-touched.

### 12.7 A name for each Sundered site: the words, for a ruling

Built, and waiting on a ruling. The plumbing is permanent; the words are drafts.

Each site already shows one of three pieces of Malathuun, chosen by `id % 3`: the ribcage,
the skull, or the hand. Each piece has its own list of six names, and the sites of that kind
take them in order, with no dice. A world lays 13 or 16 sites, so a kind never has more than
six. The name is shown only once one of yours has reached the site, like before.

| Ribcage | Skull | Hand |
|---|---|---|
| The Burnt Nave | The Sleeper's Brow | The Reaching |
| Keel Hollow | Jawfall | Fingerfall |
| The Long Cage | The Hollow Crown | The Open Palm |
| Arches-under-Ash | Socket Hill | Knuckle Ridge |
| The Black Choir | The Grin in the Dust | The Last Grasp |
| Mourning Ribs | Eyeless Down | Fivefold |

**Where it is shown:**
- **The label** over the bones: `☠ THE BURNT NAVE`, with `Sundered ground` under it in small
  type (`Sundered ground — hallowed` while hallowed). **Ruled 2026-10-04:** the names are good
  for now, and the second "the" in the subtext is dropped.
- **A new log line**, said once on arrival: *"Hob comes in under the bones of the Burnt
  Nave — the Sundered ground."*
- **Three existing lines** use the name once the site is reached, and keep "the Sundered
  ground" before that:
  - the site running out of hunters (*"Keel Hollow has spent what it had…"*);
  - a dreamer sleepwalking toward it;
  - hallowing it.
- Town rumours still say "the Sundered ground", so a name is learned by going there and
  never from hearsay.

**For you to rule:**
1. The eighteen names, any of them.
2. The arrival line.
3. Whether the townsfolk should know the names after all, so a rumour could say
   *"out past Jawfall"*.

### 12.8 The Calcine Wood: built, with its words and dials for a ruling

As ruled on 2026-10-03: black bones, ash squalls, and fauna to brainstorm. The first two are
built; the fauna is a list below. It follows the same rules as the other grounds (§8.1): laid
after worldgen without a die, so a fresh world boots with the same stream, bodies, chests and
sites as before (checked against the previous build).

**Where it stands.** Just past the crater's ridge, 30° off the gorge road, on whichever side has
more dry ground: about 120 tiles out from the ridge, some 30,000 tiles, and 400 tiles from the
nearest town (Saltmere on the default seed). It is a wood: about one open tile in seven at its
heart has a tree, against one in fourteen on the plain. The trees are tall, black, crownless and
straight, the ground is soot with pale ash drifts, and the stone is blackened like the crater's.

**Black bones.**
- A body that lies in the wood for **30 game-hours** goes black.
- A risen that **stands** in the wood for 30 hours goes black too. I built both readings of
  "raised corpses… if left there long enough".
- A black risen is **25% stronger** in attack, defence, toughness and blood. It is the one
  case where the dead come up stronger than they were. It happens once: a black risen does
  not get blacker, and raising it again brings it up black, not blacker.
- Liches are exempt.

**Ash squalls.**
- **Frequency:** on about half the days, for 1.5 to 3.5 hours. The timing comes off the day's
  hash, not a die.
- **Who it hits:** anybody living in the wood, under the sky, with nothing over their head. It
  burns the head at 30 points an hour, **down to 15 and no further**, so it hurts but never
  kills by itself.
- **What protects:** a Padded Cap, Kettle Helm, Closed Armet or Crested Great Helm. A Bone
  Wreath, the Circlet or a crown does not cover the head, so it does not count. Standing
  under a deck, underground, or inside a shack or homestead of yours also protects.
- **Who is exempt:** the undead, and constructs (they have no scalp). Constructs are my
  addition.
- **What you see:** while the camera is over the wood in a squall, the sky dims and slanted
  ash falls.

**The words (all new):**
- On entering: *"The trees here are black, and they ring like stone when the wind moves them.
  Whatever burned them is still coming down."*
- When a squall starts with one of yours in the wood: *"The sky over the wood goes the colour
  of a bruise, and the ash comes down hot. Get something over your heads, or get under a
  roof."* A float says **ASH SQUALL**.
- Once per squall: *"Hob and Tam have nothing on their heads, and the ash is eating at the
  scalp."*
- A risen of yours turning: *"R4 has stood in the Calcine Wood long enough. The bone has gone
  black, and it is harder than it was."* A float says **BLACK BONES**.
- Raising a black body: *"It comes up black to the marrow, and harder than it ever was
  alive."*

**Fauna, to brainstorm (none built):**
- **A. Marrow-herons.** Tall grey waders that stalk the wood and crack black bone for the
  marrow. They leave the living alone and go for your risen, the black ones first. This gives
  the black-bone farm a natural risk.
- **B. Cinder moths.** Swarms that come out after a squall and eat cloth: caps, cloaks,
  packs. They are harmless to flesh, but they wear down the thing that protects you.
- **C. Soot hounds.** Dust hounds that have denned in the wood, black-coated. They hunt
  during the squalls, when everything else shelters, and the ash does not touch them. This
  ties into #122 (hounds hunting elk).
- **D. Bark-knockers.** Beetles boring into the petrified trunks; the ringing is them. You
  can harvest them for a dark reagent, and a swarm comes out if you disturb them.
- **E. The Kindled Stag.** One rare beast, an elk burning slowly from the inside with antlers
  of black glass. A trophy hunt.

**My pick:** A and C. A answers the black bones and C joins the ecology work; B is the
cheapest of the rest.

**For you to rule:**
1. The five lines above.
2. The dials: 30 hours to blacken, 25% stronger, squalls on half the days, 30 an hour down to
   15.
3. Both readings of black bones (lying and standing), or only one?
4. Should a squall be able to kill a bare-headed body, or stop at 15 as built?
5. Felled trees here give ordinary wood. Should they give charcoal?
6. Which fauna, if any.

### 12.9 The waste's own business: built, with its dials for a ruling

As asked on 2026-10-02: hounds hunt elk, there are nests you can destroy, the striders are more
active, and they look more alien. All four are built. The strider's look is a first pass,
waiting on your notes from the screenshots.

**The strider, rebuilt.**
- It's a **tripod**, the only three-legged thing in the waste.
- A flat carapace hub sits high up, with a ring of eye pits and a crown of feelers where a head
  would be.
- A rounded, veined sac hangs under the hub, and a four-joint feeding tube hangs from the sac to
  the dust.
- Three legs rise up and out to knees above the hub, then come down to a spike.
- **Gait:** it moves one leg at a time. The tube trails and sways, and the feelers never stop.
- **Attack:** the front leg is the weapon. It rises, then stabs down.
- It's deliberately not a small Sixfold, which has six limbs arched over a hung mass.

**Hounds hunt elk.**
- 18 game-hours after it last ate, a pack goes after the nearest elk it can reach, staying inside
  its own country (45 tiles round its den).
- It runs one down and eats at the kill for 8 seconds.
- A carcass the pack has eaten gives hide and no meat.
- An elk bolts the moment a hunting hound comes within 12 tiles. A fed pack and a herd ignore
  each other.

**Herds come back.**
- **Elk:** a herd of two or more calves once every 48 hours, up to six. A herd hunted down to
  one is gone.
- **Striders:** a herd under three grows one every 96 hours.
- Nothing is born where one of yours can see it.
- **More herds:** the world now has 11 elk herds and 7 strider herds, up from 6 and 4, which were
  set for a map a third the size.

**Dens.**
- **Five dens** in the deep waste, away from towns and roads, each with a pack of three or four.
- A den whelps one back every 16 hours while its pack is short, but not while one of yours is
  near it.
- **Right-click a den:** *DIG OUT THE DEN — nothing will whelp here again.* Six seconds of work,
  and the mound is gone and the ground is scorched.
- **Packs no longer walk in off the map's edge.** A world whose dens are all dug out has seen
  its last new pack.
- **An old bug, found on the way:** that edge spawn had already stopped working. Its budget
  counted the 62 Bonewalkers and 31 Marrow Ticks as "wild", so it was always full. The whole
  world has had the 5 hounds spawned at boot and no others since. Now it has those 5 plus 18 in
  dens.

**Striders take a more active role (my reading of "a more active role").**
- **They migrate.** A herd walks a loop of five points round its home, 95 to 165 tiles out, and
  stops to sift at each point for 8 to 16 hours.
- **They will not be crowded.** Anything that comes within 5 tiles is stabbed at until it leaves:
  one of yours, a pack, or a caravan.
  - A herd you walk round never turns.
  - Hounds leave them alone.
  - One that scuffled with you forgets it 20 seconds after you've gone.
- **They no longer run when hit.** They fight back, and only run under a third of their blood.

**The words (all new):**
- The menu line above.
- *"Hob goes to dig out the den."*
- *"Hob digs out the den and fires what was in it. Nothing will whelp there again."*
- **HOUND DEN** over a den in sight.
- The strider's bark *"(a dry click, high up)"* when it rounds on something.
- A **TOO CLOSE** float when it rounds on one of yours.

**For you to rule:**
1. **The strider's look.** What to change.
2. **Is "a more active role" what you meant?** Built as migration plus a space it defends. The
   alternative I didn't build: striders feed on the dead with the tube, so they would compete
   with a necromancer for bodies.
3. **Should a dug-out den stay gone for good?** As built, yes. The alternative is that a
   surviving pack digs a new den somewhere else after a few weeks.
4. **The dials:**
   - 18 hours to hunger;
   - 5 dens of 3 or 4;
   - a whelp every 16 hours;
   - a calf every 48;
   - 5 tiles of strider space;
   - 8 to 16 hours of sifting.
5. **The words above.**

### 12.10 Ruled 2026-10-04, and built

- **Bonewalkers are gone.** *"Legacy content... the world's necromancers sort of take on this
  role anyway, and the new skyline exploration sites also fulfill the need for loot."*
  - The 62 ruin guards are never put in the world.
  - Their dice are still rolled, so the rest of the world is unchanged.
- **Striders, as ruled:**
  - **Pace:** they walk slowly, under half an elk's pace (1.4 against 3.9 tiles a second).
  - **Colour:** brown, the dust hounds' palette, not violet. That colour belongs to the
    gaunts.
  - **Purely migratory:**
    - A herd has no home. It keeps a heading and walks a leg of 100 to 160 tiles from wherever
      it is.
    - It sifts for 8 to 16 hours, turns a little, and walks on.
  - **Young are carried and born on the move:**
    - A herd with two grown and room bears one every 72 hours, onto a parent's back,
      wherever the herd happens to be.
    - It rides there 36 hours, then is put down to walk with the herd and grow.
  - **They are herbivores that defend the herd:**
    - Nothing provokes them but a blow. Strike one, and the whole herd within 30 tiles turns
      on whoever did it. The young run.
    - **Ranged attack:** being slow, they **throw a clot of the silt they sift** off the
      feeding tube, at 3 to 15 tiles, every 3 seconds.
    - A quarrel is forgotten 20 seconds after you've gone.
    - **Not built:** proactive stabbing of anything that came close.
  - They never feed on the dead.
- **Young start small, for every animal that breeds.** This answers your question: before
  this, calves were born at full size. Now:
  - A calf, a whelp, or a strider's young is born at about a third of its size, strength and
    blood, and grows over days: 4 for elk and hounds, 8 for striders.
  - Until it's mostly grown it runs rather than fights, and a whelp doesn't hunt.
- **Dens:** a surviving pack digs again.
  - **Digging:** two grown hounds with no den of their own for 14 days dig one where they are.
  - **Cap:** the world holds at most 2 dens more than it started with (7 on this map).
  - **Floor:** while the waste holds fewer than 4 grown hounds, a pack walks in off the edge
    every 5 days and digs in, in its turn.
- **Wyrms keep to the high ground.**
  - Each has a lair on the flank of one of the two largest massifs, well clear of towns and
    of each other, with a hoard of gold and bones there.
  - The guard leash keeps it home, and an old save's wyrms walk home on load.
- **More mountains are on the handcrafted-world list (#128).** Most of the map is flat. The
  wyrms take the two biggest massifs now, and a set world should give them, and much else,
  real ranges.
- **The site label's subtext** is *Sundered ground*, without the second "the".

**The words (all new):** none this round. The silt clot is unlabelled, and the strider's
`(a dry click, high up)` bark and the **TOO CLOSE** float went with the proactive stabbing.

**For you to rule:**
1. **The strider dials:** pace, a birth every 72 hours, 36 hours carried, 8 days to grow, the
   clot's reach and damage.
2. **Should young be catchable and tameable?** It's a natural next step for elk calves; it's
   not built.
3. **The den dials:** 14 days to dig again, 2 dens over the start, a floor of 4 hounds.
4. **Alchemy progression:** see `ALCHEMY-PATHS.md`. Three iterations and a recommendation,
   for your ruling.

---

## Appendix: re-running the counts

`lore.js` parses the script block with `acorn`. It collects comments, string and template
literals, and identifiers separately. Then, for each term in a JSON list of
`[label, regex]` pairs, it prints the three counts and the first two string hits with their
lines. A term with 0 strings and 0 identifiers is absent from play. A term with strings but
no identifiers is text without a mechanic, which is only a lead until its call sites are
read. The two scripts are small enough to rewrite. They are not committed, because they
answer a question once rather than guard anything.
