# How an art is learned: proposals for a ruling (2026-10-04)

> "It would be neat if each branch of alchemy was learned individually via a different talent
> system. E.g., once you reach 25 magic skill, you need to read a weathered tome to advance any
> further. Then magic 26 and beyond unlocks the next 'tier', allowing for (in the case of dark)
> more undead, stronger undead, and more advanced necromancy. This way it's not all tied to
> research trees and can't just be improved by spamming skeletons. I want to revamp the system but
> also map it out properly from the start... Especially for skeleton mages and such, I'm wondering
> if a simplified path should also be available."

Nothing here is built. This document maps the current system, then gives three iterations, a
plan for skeleton mages, and my recommendation.

---

## 1. What the game does today

A caster's power comes from **three places that don't know about each other**:

| | What it is | How it grows | What it gates |
|---|---|---|---|
| **`magic`** | One skill, 1–100 (a lich goes to 150) | Casting; raising (+0.5); **your risen killing things (+0.35 a kill)**; a Weathered Tome (+1.5 once each) | Mana; spell strength; spells' `minMag`; **risen cap** (3 + magic/10) |
| **Attunement** | A tier per branch: initiate, adept, master | Casting that branch (`attGain`; 100/300/700 points); faster beside a better-attuned squadmate | Which spells you can cast (each spell has a tier); master only in your own gift unless you wear the Circlet |
| **Research** | The base's research tree | Scholars at the bench | Deeper Necromancy (**+2 risen cap, risen 1.5× stronger**, +1 lieutenant); the circle and every crafted undead; the Veil, Unwalled and Wall; Pyromancy; Benediction |

**What's wrong with that**, measured against the note:
- **Spamming skeletons is the strongest growth.** Every kill your host makes is magic XP for
  you, and magic is the risen cap. More skeletons → more kills → more cap → more skeletons.
- **A personal art is bought at a desk.** Deeper Necromancy is the single biggest step in a
  necromancer's power (+2 cap, ×1.5 strength), and the necromancer never has to do anything
  for it.
- **One number serves four arts.** A divine healer and a necromancer level the same `magic`;
  nothing about the climb is specific to the branch.
- **There is no moment of advancement.** You cross 26 the way you cross 25.

---

## 2. Three iterations

All three share three things:
- **Gates** at 25, 50 and 75, where the climb stops until something is done.
- **Tiers** that mean something per branch.
- **No magic from your host's kills.** The +0.35 a kill goes. Growth comes from your own
  workings, with a daily ceiling so a hundred castings of Darkbolt at a rock buy nothing a
  dozen wouldn't.

### Iteration A: gates on the one ladder (closest to the note; smallest change)

- `magic` stays one skill. **It stops at 25, 50 and 75** until the caster reads that gate's
  text, in their own gift's branch.
- Crossing a gate is a **tier**: Initiate (1–25), Adept (26–50), Master (51–75), and a fourth,
  **Magister** (76–100). This replaces attunement for the gift branch. Off-gift arts keep the
  old casting-XP climb, capped at Adept, so a necromancer can still learn to heal badly.
- **The texts**, branch by branch:
  - **Gate 25: a Weathered Tome.** Exists already; it now opens the gate instead of giving +1.5.
  - **Gate 50: a branch folio.** *The Ossuary Folio* (dark), *The Litany of Ainzopha'ar*
    (divine), *The Furnace Notes* (destruction), *The Unremembered Ledger* (dust).
  - **Gate 75: a master's own notes**, one per branch.
  - Higher texts are **found, not bought**: tower caches, the ARK's decks, the Sundered sites,
    the crater's colonnade, and the old masters the scholars ask after. Exploration becomes
    progression.
- **What a tier gives, dark as the example:**

| Tier | Risen cap | Risen strength | Lieutenants | Unlocks |
|---|---|---|---|---|
| Initiate | 3 | ×1.0 | 1 | Raise Dead, Darkbolt |
| Adept | 5 | ×1.25 | 1 | Old Bones, Shroud, binding a Skeleton Mage |
| Master | 8 | ×1.5 | 2 | Mass Reanimation, Deathgrip, deeper rites at the circle |
| Magister | 12 | ×1.75 | 3 | (open: one signature working per branch) |

  Soulbound, gear and anchored circles still add on top.
- **Research keeps the buildings.** The circle, the vat, the Ossuary and the anchored circles
  stay on the research tree. **Deeper Necromancy's +2 cap and ×1.5 move to the tier.**

### Iteration B: a ladder per branch, with talents (the most game; the biggest rework)

- **Four skills replace `magic`:** Dark, Divine, Destruction and Dust, each 1–100.
  - Your gift's skill climbs freely.
  - Another branch's skill climbs at half rate and stops at 50.
  - Mana is the best of them plus a little of the rest.
- **The same gates and texts as A**, per branch.
- **At each gate you pick one talent of three.** That's the talent system, and it's how two
  necromancers come out different. Dark, for example:
  - **Adept:**
    - *Wide Binding:* +3 risen cap.
    - *Deep Binding:* risen +25% and they keep their kit.
    - *Quick Hands:* raising costs half.
  - **Master:**
    - *The Lieutenant's Art:* +1 lieutenant, and they rot less each raising.
    - *Black Bones:* everything you raise comes up calcined.
    - *The Long Working:* Mass Reanimation lasts twice as long.
  - **Magister:** one of three signature workings.
- **Cost:** every one of the 55 places that read `magic` and 30 that read attunement has to
  be re-pointed at the right branch. Saves need a migration: an old `magic` becomes your gift's
  skill. It's a week of careful work and a large harness pass. Worth it only if per-branch
  identity is the point.

### Iteration C: tiers are rites, not numbers (the most fiction)

- `magic` climbs as today, but **a gate is crossed by doing something in the world**, not only
  by reading:
  - **25:** read the Tome.
  - **50:** a deed at a place.
    - **Dark:** raise a body at a Sundered site.
    - **Divine:** hallow a site, or close a tear by hand.
    - **Destruction:** burn something in the crater's glass.
    - **Dust:** walk unseen through a walled town at noon.
  - **75:** find one of the old masters (the scholars' leads), alive or dead, and be taught.
- The tiers are as in A. It gives each branch a pilgrimage and ties progression to the places
  being built (sites, towers, the crater, the ARK). Gate 50 is the most work: each deed needs
  detection and a harness.

---

## 3. Skeleton mages, and the dead in general: a simpler path

A crafted Skeleton Mage can't read and shouldn't carry a ladder. Three options:

- **S1. Bound at a tier.** A mage comes up at its binder's tier minus one (an Adept binds an
  Initiate mage, a Master an Adept) and never climbs. A better one means binding a new one, or
  re-binding the old one at the circle for remains and copper. *Simplest; the binder's growth is
  the mage's.*
- **S2. It learns by service.** A crafted mage has a short ladder of its own, three steps,
  earned by kills, like the Longdead's "gets better by surviving". It never passes one tier
  below its master. *A mage you keep alive becomes worth keeping alive.*
- **S3. Lieutenants are people.** A raised companion keeps the full ladder: their tier comes
  back with them, and they can read a text at the next gate. Crafted mages use S1 or S2.

**My pick: S1 for crafted mages, S3 for lieutenants.** S2 is a good later layer once S1 is in.

---

## 4. My recommendation

**Iteration A now, built so B's talents can be added at the gates later.**
- A answers every point in the note (the tome at 25, tiers that mean more and stronger undead,
  off the research tree, and no growth from spamming skeletons) at about a third of B's cost.
- It reuses what exists: attunement tiers become the gated tier, and the Tome becomes the first
  gate.
- Adding talent picks at each gate is then a menu and a table, not a rewrite.
- C's rites would make good gate-75 tasks later, in place of a text.

**Order of work:**
1. Gates and texts.
2. Tier effects (dark first, then each branch).
3. Moving research's personal bonuses to tiers.
4. The daily XP ceiling, and removing XP from host kills.
5. Skeleton mages S1 and lieutenants S3.
6. Talents, if you want B on top.

---

## 5. For you to rule

1. **A, B or C**, or a mix.
2. **Four tiers or three.** Is Magister (76–100) its own tier, or does Master run to 100?
3. **What gates 50 and 75:** texts only, or a deed (C)?
4. **Off-gift arts:** keep the slow casting climb to Adept, or remove them entirely?
5. **Skeleton mages:** S1, S2 or S3 (or S1 and S3, as I'd pick).
6. **Text names**, if A or B: *The Ossuary Folio*, *The Litany of Ainzopha'ar*, *The Furnace
   Notes*, *The Unremembered Ledger*. These are drafts, like every name here.
