/**
 * The faults `mutation.ts` injects, each one this project has actually shipped,
 * in the line it shipped in. Data only, so the fast tier can check that every
 * find-string still matches today's source exactly once (`test/mutants.test.ts`):
 * a mutant whose code moved scores nothing.
 */
export interface Mutant {
  /** What real defect this reproduces. */
  label: string;
  /** Relative to the repo root. */
  file: string;
  find: string;
  replace: string;
}

export const MUTANTS: Mutant[] = [
  {
    label: 'durationVerdict: the stall bar can never fire',
    file: 'packages/playtest/src/rules.ts',
    find: 'if (stallRate >= maxStalls)',
    replace: 'if (stallRate >= 1.1)',
  },
  {
    label: 'stderr: every error bar becomes zero',
    file: 'packages/bench/src/report.ts',
    find: 'return Math.sqrt(Math.max(rate * (1 - rate), 0.01) / n);',
    replace: 'return 0;',
  },
  {
    label: 'gamesFor: every sample size is deemed sufficient',
    file: 'packages/bench/src/report.ts',
    find: 'return Math.ceil(2 * (sigmas / d) ** 2 * 0.25);',
    replace: 'return 1;',
  },
  {
    label: "regret: decided positions count towards the best-share (\u00a719.5 fault 3 \u2014 a no-op reads alive)",
    file: 'packages/bench/src/regret.ts',
    find: "if (top === bottom) return { choiceCost: 0, cards: [] };",
    replace: "if (false) return { choiceCost: 0, cards: [] };",
  },
  {
    label: "regret: a tie for best is split, not credited (\u00a719.5 fault 4 \u2014 duplicates read dead)",
    file: 'packages/bench/src/regret.ts',
    find: 'const isBest = b.score >= top ? 1 : 0;',
    replace: 'const isBest = b.score >= top ? 1 / branches.filter(o => o.score >= top).length : 0;',
  },
  {
    label: "ENGINE resolution: a tie no longer holds for the defense",
    file: 'packages/engine/src/resolution.ts',
    find: "return { hit: margin > 0, margin };",
    replace: "return { hit: margin >= 0, margin };",
  },
  {
    label: "ENGINE resolution: armour stops reducing damage",
    file: 'packages/engine/src/resolution.ts',
    find: "return Math.max(0, margin - passiveArmor);",
    replace: "return Math.max(0, margin);",
  },
  {
    label: "ENGINE resolution: every contest teaches, not just close ones",
    file: 'packages/engine/src/resolution.ts',
    find: "return lostBy >= 0 && lostBy <= SKILL_UP_MARGIN;",
    replace: "return lostBy >= 0;",
  },
  // --- Faults found and fixed on 2026-09-23 (NEXT-STEPS §25) ----------------
  {
    label: "ENGINE dice: the AI's distributions forget the contest floors (F4 — tired heroes priced as defenceless)",
    file: 'packages/engine/src/dice.ts',
    find: 'const total = (sum: number) => Math.max(0, Math.max(0, sum) + flat);',
    replace: 'const total = (sum: number) => sum + flat;',
  },
  {
    label: 'ENGINE combat: a step stops being simultaneous (F8 — first come, first served)',
    file: 'packages/engine/src/combat.ts',
    find: 'if (aliveBeforeHazards && !actor.isAlive()) break;',
    replace: 'if (!actor.isAlive()) break;',
  },
  {
    label: 'AI: self-guard names a target outside the pool (F10)',
    file: 'packages/ai/src/policy.ts',
    find: 'return pool.includes(actor) ? [actor] : [];',
    replace: 'return [actor];',
  },
  {
    label: "combat log: a fatigued attacker's blow is unreadable (F11 — the U+2212 minus)",
    file: 'packages/bench/src/combatlog.ts',
    find: 'const SIDE = String.raw`(?:\\d+(?:[+−]\\d+)?[=→])?(\\d+)`;',
    replace: 'const SIDE = String.raw`(?:\\d+(?:[+]\\d+)?[=→])?(\\d+)`;',
  },
  {
    label: "cache: a card's target count leaves its fingerprint (F12 — a sweep served a single-target card's numbers)",
    file: 'packages/bench/src/cache.ts',
    find: 'const { name: _n, description: _d, iconPath: _i, ...rest } = a;',
    replace: 'const { name: _n, description: _d, iconPath: _i, targetCount: _t, ...rest } = a;',
  },
  {
    label: 'cache: the fingerprint forgets the AI (F9 — AI changes served stale baselines)',
    file: 'packages/bench/src/cache.ts',
    find: "export const FINGERPRINTED = ['engine', 'ai', 'bench', 'combat-balancer'];",
    replace: "export const FINGERPRINTED = ['engine', 'bench', 'combat-balancer'];",
  },
  {
    label: 'requirement 2: fail a kit that is out of band only inside its noise',
    file: 'packages/playtest/src/rules.ts',
    find: "if (delta - 2 * se > band) return { ok: false, side: 'above' };",
    replace: "if (delta > band) return { ok: false, side: 'above' };",
  },
  {
    label: 'cache: the fingerprint looks above the repo and hashes nothing (af533c1 — every rules change served stale numbers)',
    file: 'packages/bench/src/cache.ts',
    find: "const REPO = path.resolve(HERE, '../../..');",
    replace: "const REPO = path.resolve(HERE, '../../../..');",
  },
  {
    label: "balancer: the search AI's clamp goes out unchecked at the real depth (§26 — bone devils at PV 1)",
    file: 'packages/combat-balancer/src/index.ts',
    find: '  if (clamped && depth !== searchDepth) {',
    replace: '  if (false && clamped && depth !== searchDepth) {',
  },
  // --- The four-requirement rules (NEXT-STEPS §27.3) -------------------------
  {
    label: 'requirement 3: choosing matters on the point estimate, no error bar',
    file: 'packages/playtest/src/rules.ts',
    find: 'return meanCost + 2 * se >= bar;',
    replace: 'return meanCost >= bar;',
  },
  {
    label: 'regret: the choice cost forgets to cross-fit (winner\'s curse — noise reads as choice)',
    file: 'packages/bench/src/regret.ts',
    find: '  if (n < 2) return plain(branches.map(b => b.score));',
    replace: '  return plain(branches.map(b => b.score));',
  },
  {
    label: "regret: the gain when best is the winner's own lead (winner's curse — every best play looks decisive)",
    file: 'packages/bench/src/regret.ts',
    find: '  const ways = (branches[0]?.samples.length ?? 0) < 2',
    replace: '  const ways = true',
  },
  {
    label: 'requirement 3: call a card never right on the point estimate',
    file: 'packages/playtest/src/rules.ts',
    find: '  return gain + 2 * se < 0;',
    replace: '  return gain < 0;',
  },
  {
    label: 'regret: the gain when best is averaged per fight (twins read −2 PV)',
    file: 'packages/bench/src/regret.ts',
    find: '    const g = whenBest.length ? clusteredRatio(whenBest, o => o.gain) : null;',
    replace: '    const g = whenBest.length ? clusteredStderr(whenBest, o => o.gain) : null;',
  },
  {
    label: 'AI: a curse or a swallow is aimed at the enemy about to die (wasted)',
    file: 'packages/ai/src/policy.ts',
    find: "    let s = 2 * pvFraction(e);",
    replace: "    let s = 2 * (1 - pvFraction(e));",
  },
  {
    label: 'ENGINE wall: a bracing member is rolled like any other (lends its level, dodges the breach)',
    file: 'packages/engine/src/combat.ts',
    find: '      if (absorbs(g)) return { g, total: 0, absorbing: true };',
    replace: '      if (false) return { g, total: 0, absorbing: true };',
  },
  {
    label: 'ENGINE streams: an action resolves on the shared stream (the lookahead pairs nothing)',
    file: 'packages/engine/src/combat.ts',
    find: '    this.inSeatStream(this.actStream(cur.actor), () => {\n      if (this.beforeHolderAction(cur)) this.resolveOne(cur);\n    });',
    replace: '    if (this.beforeHolderAction(cur)) this.resolveOne(cur);',
  },
  {
    label: 'balancer: a real-depth fight already played is played again (the horde paid twice)',
    file: 'packages/combat-balancer/src/index.ts',
    find: '    decided.set(key, r);',
    replace: '    void decided;',
  },
  {
    label: 'AI: the evaluator ignores bodies standing (a guard that saves an ally is worthless)',
    file: 'packages/ai/src/lookahead.ts',
    find: 'w.bodies * bodyDiff',
    replace: '0 * bodyDiff',
  },
  {
    label: 'blind spot: a card is blind whatever the AI plays',
    file: 'packages/playtest/src/rules.ts',
    find: '&& playRate < BLIND_MAX_PLAY_RATIO * bestShare;',
    replace: '&& playRate >= 0;',
  },
  {
    label: 'AI: targets come from the rule alone, never searched (a deadly focus left to resolve)',
    file: 'packages/ai/src/lookahead.ts',
    find: 'samples: 6, passes: 2, targetSamples: 2, tempo: 1,',
    replace: 'samples: 6, passes: 2, targetSamples: 0, tempo: 1,',
  },
  {
    label: 'content: Entrar en Fúria protects for one round after it resolves, not two',
    file: 'packages/sets/fantasy/src/players/skills/berserk.ts',
    find: "ctx.source.setStatus('indestructible', 1, turns + 1, undefined, INDESTRUCTIBLE);",
    replace: "ctx.source.setStatus('indestructible', 1, turns, undefined, INDESTRUCTIBLE);",
  },
  {
    label: 'content: Aguantar el cop banks its bonus for the rest of combat (the 45-point blow)',
    file: 'packages/sets/fantasy/src/players/skills/berserk.ts',
    find: "params: { multiplier: 2, duration: 'nextTurn' } }",
    replace: "params: { multiplier: 2 } }",
  },
  {
    label: "ENGINE: a status's flat bonus to the next attack is dropped (Estat de flux's +6 did nothing)",
    file: 'packages/engine/src/combat.ts',
    find: '      if (m.attackRollBonus !== undefined) mods.attackRollBonus = (mods.attackRollBonus ?? 0) + m.attackRollBonus;',
    replace: '      void m.attackRollBonus;',
  },
  {
    label: 'content: Aguantar el cop lets a blow fell the berserker',
    file: 'packages/sets/fantasy/src/players/skills/berserk.ts',
    find: '  clampPvLoss(ref, amount) { return Math.min(amount, Math.max(0, ref.holder.currentPV - 1)); },',
    replace: '  clampPvLoss(_ref, amount) { return amount; },',
  },
  {
    label: "ENGINE: a defense's onDefend never learns the margin it won by (Cop desviat returns nothing)",
    file: 'packages/engine/src/combat.ts',
    find: "      this.dispatch('onDefend', guard.defender, guard.action, { targets: [target], target: source, margin, attackTotal: contestAttack });",
    replace: "      this.dispatch('onDefend', guard.defender, guard.action, { targets: [target], target: source, attackTotal: contestAttack });",
  },
  {
    label: "ENGINE: a defense's onDefend sees only the margin, never the whole blow (Gel del mestre throws nothing back)",
    file: 'packages/engine/src/combat.ts',
    find: "      this.dispatch('onDefend', guard.defender, guard.action, { targets: [target], target: source, margin, attackTotal: contestAttack });",
    replace: "      this.dispatch('onDefend', guard.defender, guard.action, { targets: [target], target: source, margin });",
  },
  {
    label: "ENGINE: an effect's 'enemy you choose' ignores the seat's target policy",
    file: 'packages/engine/src/combat.ts',
    find: "      ? this.targetChooser(this, actor, aimed, 'enemy', count, pool)",
    replace: "      ? pool.slice(0, count)",
  },
  {
    label: 'ENGINE: resolveAs is never asked — a card that blocks or strikes as the moment demands always strikes',
    file: 'packages/engine/src/combat.ts',
    find: '    switch (this.resolvedType(cur)) {',
    replace: '    switch (cur.action.def.actionType) {',
  },
  {
    label: "ENGINE: a block-only defense is dragged onto its own blocker like an attack",
    file: 'packages/engine/src/combat.ts',
    find: "      const forced = req === 'enemy' && cur.action.def.actionType === ActionType.Atac",
    replace: "      const forced = req === 'enemy'",
  },
  {
    label: "ENGINE: an attack over the line still meets the target's allies' guards",
    file: 'packages/engine/src/combat.ts',
    find: '          : this.activeGuards(target, source, mods.ignoreAllyGuards));',
    replace: '          : this.activeGuards(target, source));',
  },
  {
    label: "ENGINE: a tracked target's allies still guard it against its hunter",
    file: 'packages/engine/src/combat.ts',
    find: '      if (attacker && ref.entry.behavior?.excludesAllyGuards?.(ref, attacker)) keepOwn = true;',
    replace: '      if (false) keepOwn = true;',
  },
  {
    label: "ENGINE: a status can never make its holder's attack undefendable",
    file: 'packages/engine/src/combat.ts',
    find: 'this.bypassesDefense(source, target, mods.ignoreDefense || !!statusMods.ignoreDefense);',
    replace: 'this.bypassesDefense(source, target, mods.ignoreDefense);',
  },
  {
    label: 'ENGINE: a side that chooses after the reveal never sees the cards',
    file: 'packages/engine/src/combat.ts',
    find: '      if (later(c) && !this.revealedPlan.length) {',
    replace: '      if (false) {',
  },
  {
    label: 'ENGINE: a delayed action is put back where it was',
    file: 'packages/engine/src/combat.ts',
    find: '    this.pending.push(p);',
    replace: '    this.pending.splice(i, 0, p);',
  },
  {
    label: 'ENGINE: onReveal never runs',
    file: 'packages/engine/src/combat.ts',
    find: "    for (const p of built) this.dispatch('onReveal', p.actor, p.action.def, { targets: p.targets ?? [] });",
    replace: '',
  },
  {
    label: 'ENGINE: onRoundStart never runs',
    file: 'packages/engine/src/combat.ts',
    find: '        if (c.statuses.has(key)) behavior.onRoundStart!(this.statusCtx(c, key, entry));',
    replace: '',
  },
  {
    label: "ENGINE: a defense can only be narrowed to its holder, never to a block",
    file: 'packages/engine/src/action.ts',
    find: "      if (req === 'self' || req === 'enemy') return req;",
    replace: "      if (req === 'self') return req;",
  },
  {
    label: 'requirement 4: an edge holds on the point estimate',
    file: 'packages/playtest/src/rules.ts',
    find: 'return winrate - 2 * stderr(winrate, games) > 0.5;',
    replace: 'return winrate > 0.5;',
  },
  {
    label: 'requirement 4: the triangle holds when ANY edge does',
    file: 'packages/playtest/src/rules.ts',
    find: 'return { ok: broken.length === 0, broken };',
    replace: 'return { ok: broken.length < edges.length, broken };',
  },
];
