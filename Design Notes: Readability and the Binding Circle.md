# Two brainstorms

Answers to the two items in `For Claude: To Do` marked BRAINSTORM OWED. Nothing here is
built. Every number below was read out of the source or measured in a running world, not
recalled — the point of writing it down is so the next session argues with evidence instead
of re-deriving it.

---

# 1. Reading your own squad

## What is already there

**Squad groups.** `squadGroups` is a list of named folders; a body belongs to at most one
(`c.grp`). Each folder draws as a collapsible header with a live count, and:

- click a header to collapse it,
- **shift-click a header to select everything inside it**,
- right-click a header for MOVE *n* HERE / UNGROUP *n* / NEW GROUP… / DELETE GROUP.

Two folders always exist and cannot be deleted: **LIVING** (anything not undead, plus a lich)
and **RISEN** (everything else). Anything you have not filed lands in one of those. Groups
ride the save.

This is a genuinely good system and it is doing most of the work already. The gap is not
capability — it is that **it is entirely manual and entirely invisible until you use it.**

**Portraits.** Two sizes. A living body gets a stance icon, a `✦` if gifted, its name, a
worst-limb bar and a blood bar. A risen gets `☠`, its `shortTag` (`BK4`, `SM2`) and one bar.

**Stance** is a five-way: `melee ⚔ · ranged ➶ · medic ✚ · tank ⛨ · hold ⊞`, shown on living
portraits only.

**Job** is a separate axis set from the character panel, filtered so the mindless dead cannot
take jobs that need a mind. **The job is not shown on the portrait at all.** That is the
single biggest hole: "what is this unit *for*" is exactly the question the squad bar does not
answer.

## What actually distinguishes a combat from a non-combat unit

The data already exists, spread across four fields:

| signal | means |
|---|---|
| `noFight` | will not acquire a target, ever (Stitch-Hand, Wisp, Death Eater, Soulbound) |
| `job` | carrion, research, farm, flesh, build, haul… — a standing duty |
| `stance` | `medic` is a non-combat posture; the other four are fighting postures |
| `mule` / `cart` | a hauler |

So nothing needs inventing to answer the question. It needs **surfacing**.

## Options, cheapest first

**A. Put the job on the portrait.** One glyph beside the stance icon. `noFight` bodies get a
distinct mark rather than the default `⚔` they currently inherit — a Stitch-Hand showing a
sword icon is actively lying to you. Nearly free, fixes the worst of it, changes no
behaviour.

**B. Auto-filed default folders.** Replace the LIVING/RISEN split with a *derived* one that
sorts on the fields above — e.g. FIGHTING / WORKING / IDLE — while keeping your hand-made
groups above them and untouched. The important design constraint: a body must be able to
change folder when its job changes, without you re-filing it. Risk: things move under you
mid-fight, which is worse than the current problem. Mitigate by only re-sorting the automatic
folders out of combat.

**C. Keep the split you have, add a filter row.** A strip of toggles above the bar — ALL /
FIGHTERS / WORKERS / WOUNDED — that filters what the portraits show without moving anybody
between folders. Non-destructive, no state to save, and it composes with hand-made groups
instead of competing with them.

**D. Make selection do the sorting.** Hotkeys for "select all fighters", "select all idle
workers". No visual change at all; it just makes the common action one key.

**E. Sort within a folder.** Wounded first, or idle first. Cheap, and it puts the bodies that
need a decision where the eye already is.

## Recommendation

**A + C + E, in that order**, and *not* B.

A is the actual bug — the bar shows a stance for units that cannot fight and shows nothing at
all about duty. C gives you the combat/non-combat view you asked for without taking control of
your folders away, which matters because the folder system is already good and hand-filing is
the thing that makes it good. E is two lines and makes a big host readable.

B is the tempting one and I think it is a trap: automatic folders that reshuffle themselves
are exactly the kind of thing that feels clever for ten minutes and then loses your archers in
the middle of a siege.

One further note: the squad bar and the character panel currently disagree about what a unit
is. The panel knows the job; the bar does not. Whatever gets built, the two should show the
same vocabulary.

---

# 2. The Binding Circle is too strong

## The actual arithmetic

This is not a vibe. `craftUndead` computes one scalar and pours it into every stat:

```
m = caster.stats.magic × (research.done.necromancy ? 1.5 : 1)
```

A Bone Knight is then `atk 6 + m×0.6`, `def 3 + m×0.3`, `tough 10 + m`, claw `12 + m×0.6`.

At magic 100 with Necromancy researched, `m = 150`, and that Bone Knight comes off the circle
with **atk 96, def 48, tough 160, claw 102** — for 2 remains, 4 stone, 2 fabric and 16 mana.
A town guard is in the teens. The skill ceiling is 100 normally and **150 for a lich**, so a
late lich is minting `m = 225` bodies.

Two things are wrong with that shape independently of the magnitude:

1. **It is linear and uncapped.** Every point of magic makes every future body better,
   forever, with no diminishing return anywhere in the curve.
2. **A research unlock multiplies the whole thing by 1.5.** Necromancy is a single flat 50%
   power spike across the entire roster.

And the headcount ceiling is generous on top of it: `risenCap` is `3 + magic/10 + 2` (so 15 at
magic 100), or `5 + magic/8 + 2` for a lich — **25 at magic 150**, plus 3 per Soulbound.

Twenty-five bodies at those stats, and they **do not eat**. `hunger` is skipped entirely for
the undead. There is no ongoing cost of any kind for a host that is already standing.

## What already pushes back

Worth knowing before adding anything, because three real pressures exist and are all weak:

- **`bindStrain`** — holding undead cuts the caster's maximum mana, `0.05` per unit of bind
  weight, capped at **62%**. This is the best existing lever and it is nearly invisible in
  play because mana only matters at the moment of casting.
- **`hostNoiseTick`** — every body carries `noise`; the sum above 4 pushes the Fracture clock.
  A real cost, but it is paid by the *world* on a long timer, not by you in the next fight.
- **Materials and mana per raise** — a one-off, and trivial once you have a corpse economy.

The common failure of all three: they are costs of **building** a host, and none of them is a
cost of **having** one. That is why the host trivializes the midgame — you pay once and are
strong forever.

## Directions

**1. Bend the stat curve.** Replace the linear `m` with a root or a soft cap so magic 40 → 100
is a meaningful but not doubling improvement. This is the smallest change with the largest
effect and it fixes the root cause rather than a symptom. Downside: it makes investing in
magic feel worse, so the ceiling should buy something else instead — cap, variety, control.

**2. Charge rent.** Give the risen an upkeep — remains, or vat-flesh, per body per day — so a
standing host is a running bill. This is the change that turns the Death Eater, the Gravecart
and the harvest job from flavour into infrastructure, because suddenly the corpse economy has
a *sink*. It also makes an over-large host self-correcting: you cannot feed forty, so you keep
twenty good ones. My favourite of these.

**3. Make them decay.** A raised body degrades along the `rot` ladder that already exists and
already drives both the mesh and the colour. Bodies get worse and eventually fall apart, so a
host is a thing you maintain rather than a thing you accumulate — and the Stitch-Hand becomes
essential rather than optional. Pairs naturally with the lieutenant-degradation idea already
on the list.

**4. Make the ceiling the real constraint.** Cut `risenCap` hard, so the question stops being
"how many" and becomes "which". Undead variety is the most interesting thing in the game and
a cap of 25 means you never have to choose. Cheap to try, easy to tune, and it makes the
Soulbound's +3 genuinely valuable.

**5. Make them dumb.** Lean into what they are: no flanking, no self-preservation, no target
priority, slow to respond to orders. Powerful but stupid is a much better fantasy than
powerful and obedient, and it makes a living squad worth keeping. Cost: the AI work is real.

**6. Split the 1.5.** Necromancy shouldn't be a flat 50% across the board. Make it raise the
*cap*, or unlock kinds, or improve one axis — not multiply everything.

## Recommendation

**2 and 6 first, then 1.**

Upkeep (2) is the one that changes the shape of the game rather than the size of a number: it
gives the corpse economy a sink, makes the harvest units matter, and self-corrects a bloated
host without me having to guess a cap. Splitting the Necromancy multiplier (6) removes a flat
50% spike that is currently doing more damage than any single recipe. Bending the curve (1) is
the honest root fix but it is the one most likely to feel bad, so it should come last and be
tuned against a real playthrough rather than a spreadsheet.

I would hold off on 4 (hard cap) until after 2 — upkeep may cap the host naturally, and two
ceilings fighting each other is worse than one.

Whatever gets picked: this wants a harness that stands a raised host against a real garrison
and reports the exchange rate, so "too strong" becomes a number and the tuning stops being an
argument.
