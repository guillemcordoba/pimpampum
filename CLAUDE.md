# Pim Pam Pum

Pim Pam Pum is a tabletop RPG combat system (written in Catalan). The project contains three main components: a TypeScript game engine library (the single source of truth for all game data), a CLI combat simulator for balance testing, and a Vue 3 web app for browser-based play with printable card pages.

## Project Structure

```
pimpampum/
├── CLAUDE.md                      # This file - project instructions
├── package.json                   # Root pnpm workspace config
├── pnpm-workspace.yaml            # Workspace: packages/*
├── pnpm-lock.yaml                 # pnpm lock file
├── tsconfig.base.json             # Shared TypeScript config (ES2022, strict)
├── flake.nix                      # Nix dev environment (csv-tui, nodejs_22, pnpm)
├── flake.lock                     # Nix lock file (nixpkgs-unstable)
├── .gitignore                     # Ignores node_modules/, dist/, /target
├── .github/workflows/pages.yml    # GitHub Pages deployment (builds web)
├── rules.md                   # Game rules and combat mechanics (Catalan, prose)
├── packages/
│   ├── engine/                    # @pimpampum/engine - Core game logic + data (SOLE SOURCE OF TRUTH)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts           # Public API exports
│   │       ├── dice.ts            # DiceRoll class (parse, roll, average)
│   │       ├── equipment.ts       # Equipment system with slots + templates + icons
│   │       ├── modifier.ts        # CombatModifier with durations
│   │       ├── card.ts            # Card, CardType, SpecialEffect types
│   │       ├── display.ts         # Display constants (card type names, CSS classes, stat icons, rules summary)
│   │       ├── character.ts       # Character class + CharacterTemplate type + createCharacter factory
│   │       ├── characters/        # Per-character definitions (one file per character)
│   │       │   ├── index.ts       # Re-exports, ALL_CHARACTER_TEMPLATES, CARD_ICONS, create* factories
│   │       │   ├── fighter.ts     # FIGHTER_TEMPLATE
│   │       │   ├── wizard.ts      # WIZARD_TEMPLATE
│   │       │   ├── rogue.ts       # ROGUE_TEMPLATE
│   │       │   ├── barbarian.ts   # BARBARIAN_TEMPLATE
│   │       │   ├── cleric.ts      # CLERIC_TEMPLATE
│   │       │   ├── monk.ts        # MONK_TEMPLATE
│   │       │   ├── goblin.ts      # GOBLIN_TEMPLATE
│   │       │   ├── goblin-shaman.ts # GOBLIN_SHAMAN_TEMPLATE
│   │       │   └── basilisk.ts    # BASILISK_TEMPLATE
│   │       ├── combat.ts          # CombatEngine - core combat loop (~1300 lines)
│   │       ├── ai.ts              # AI card selection (3 strategies: Aggro, Protect, Power)
│   │       └── strategy.ts        # AIStrategy enum
│   ├── simulator/                 # @pimpampum/simulator - Balance testing (vitest)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── main.ts            # Batch simulation runner (~360 lines)
│   │       └── tests/
│   │           ├── balance.test.ts # Vitest balance test suite (~21 tests)
│   │           └── helpers.ts     # Simulation runner helpers + team composition generation
│   └── web/                       # @pimpampum/web - Vue 3 multi-page SPA
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       ├── public/
│       │   └── icons/             # ~4170 SVG icons from game-icons.net (CC BY 3.0)
│       │       └── 000000/transparent/1x1/
│       │           └── [artist]/[icon-name].svg
│       └── src/
│           ├── main.ts            # Vue app entry point + router setup
│           ├── App.vue            # Root component (AppLayout + router-view)
│           ├── router/
│           │   └── index.ts       # Vue Router routes
│           ├── assets/
│           │   ├── style.css      # Global combat UI styles
│           │   └── cards.css      # Printable card styles (63mm x 88mm)
│           ├── composables/
│           │   ├── useGame.ts     # Combat game state management
│           │   └── useCardDisplay.ts  # Card/equipment → display props conversion
│           ├── components/
│           │   ├── AppLayout.vue      # Nav bar + slot layout
│           │   ├── SetupScreen.vue
│           │   ├── CombatScreen.vue
│           │   ├── VictoryScreen.vue
│           │   ├── CharacterPortrait.vue
│           │   ├── CardHand.vue
│           │   ├── MiniCard.vue
│           │   ├── CombatLog.vue
│           │   ├── TargetSelector.vue
│           │   └── cards/
│           │       ├── PrintableCard.vue   # Generic printable card (63x88mm)
│           │       ├── CharacterCard.vue   # Character stat card
│           │       ├── RulesCard.vue       # Rules summary card
│           │       └── CardGrid.vue        # Flex-wrap grid (max-width 210mm for A4)
│           └── views/
│               ├── HomeView.vue           # Landing page with nav tiles
│               ├── CombatView.vue         # Full combat game (setup → play → victory)
│               ├── ClassesView.vue        # Player class tile grid
│               ├── EnemiesView.vue        # Enemy tile grid
│               ├── CharacterDetailView.vue # Character + ability cards (printable)
│               ├── ObjectsView.vue        # Equipment cards (printable)
│               └── RulesView.vue          # 3x rules summary card (printable)
└── cards/
    └── card-template.html         # CSS design reference for card styling
```

## Source of Truth

The **engine** (`packages/engine/`) is the sole source of truth for all game data:

- **Character definitions**: Per-character files in `characters/` (stats, cards, effects, icons)
- **Character metadata**: `ALL_CHARACTER_TEMPLATES`, `PLAYER_TEMPLATES`, `ENEMY_TEMPLATES` in `characters/index.ts`
- **Card icons**: `CARD_ICONS` in `characters/index.ts`
- **Equipment definitions**: Factory functions + `ALL_EQUIPMENT` in `equipment.ts`
- **Display constants**: `CARD_TYPE_DISPLAY_NAMES`, `CARD_TYPE_CSS`, `STAT_ICONS`, `STAT_DISPLAY_NAMES`, `RULES_SUMMARY` in `display.ts`
- **Game rules prose**: `rules.md` (Catalan, not parsed by engine)

The web app and simulator derive everything from the engine. There are no CSV files or static HTML card files.

**IMPORTANT: Card descriptions are authoritative.** Each card's `.withDescription()` text is the canonical definition of what that card does. When there is a discrepancy between a card's description and its effect implementation in `combat.ts`, the description is correct and the engine code must be updated to match.

## Design Intentions

**Read `intentions.md` for the design intentions of the combat system.**

**IMPORTANT: When simulation results conflict with these intentions, immediately flag the discrepancy and propose fixes.**

## Designing New Cards

When creating new cards, follow this workflow:

1. **Design the mechanic first** — write the card description (in Catalan) defining what the card does
2. **Map to existing `SpecialEffect` types** — check if existing types can implement the mechanic:
   - `CharacteristicModifier` handles any stat buff/debuff (strength, magic, defense, speed) on any target (self, allies, team, enemy, enemies) for any duration
   - Other existing types: `Stun`, `MultiTarget`, `Sacrifice`, `Vengeance`, `EnchantWeapon`, etc.
3. **Only create a new `SpecialEffect` variant** if no existing type can express the mechanic (e.g., mixed mechanics like conditional triggers, probabilistic effects, or multi-phase effects)

## Game Rules Summary

### Core Mechanics

- **Language**: All game content is in Catalan
- **Combat format**: Team battles (up to 10 per side). Standard play is 2v2 or 3v3. Horde mode: 4 players vs 10 goblins
- **Characteristics** (scale 1-8):
  - **PV** (Punts de vida): Lives before death (typically 3)
  - **V** (Velocitat): Speed - determines action order
  - **F** (Força): Strength - used for physical attacks
  - **D** (Defensa): Defense - reduces incoming damage
  - **M** (Màgia): Magic - used for magic attacks
- **Stat formula**: Final stat = Base + Equipment modifiers + Card modifier + Combat modifiers

### Combat Flow

1. Each round, all players simultaneously choose a card face-down
2. Cards are revealed simultaneously
3. Cards resolve in speed order (highest speed first)
4. An attack hits if `attack_stat + dice_roll > target_defense`
5. A hit costs the target exactly 1 life (no variable damage)
6. A character dies when lives reach 0

### Card Types

- **Atac físic** (Physical Attack): Compares Força + dice vs target Defensa
- **Atac màgic** (Magic Attack): Compares Màgia + dice vs target Defensa
- **Defensa** (Defense): Choose an ally to defend. The defense card redirects all attacks targeting the defended ally for the entire round. If an attack penetrates, the defender loses the life, not the defended ally
- **Focus**: Special effect cards. Interrupted (cancelled) if the player is hit by an attack or receives an undefended attack before the card resolves

### Equipment

Passive items that modify stats permanently during combat. Slot-based system (Tors/Torso, Braços/Arms, Cap/Head, Cames/Legs, Mà principal/MainHand, Mà secundària/OffHand). Only one item per slot. Cannot be changed mid-combat. Any class can equip any item.

### Characters and Equipment Items

Character stats and cards are defined in `packages/engine/src/characters/` (one file per character). Equipment items are defined in `packages/engine/src/equipment.ts` (`ALL_EQUIPMENT`).

### Goblin Horde

Goblins are **horde units** — individually very weak (F1, M0, D1, V4, PV1) but designed to fight in large numbers (10 goblins vs 4 players). Their power comes from two horde-specific mechanics:

- **PackTactics** (`SpecialEffect`): Attack bonus of +1 per N living allies (e.g., `alliesPerBonus: 3` means +1 per 3 allies). With 9 allies → +3 bonus. Computed in `resolveAttack()`.
- **NimbleEscape** (`SpecialEffect`): Focus card that grants dodge this turn. Post-resolution, all successful hiders on a team get `+N strength` next turn where N = number of successful hiders. Implemented as a post-resolution step (`resolveNimbleEscape()`) in combat.ts. Set aside for 1 turn.

Goblin cards: Atac de la horda (PackTactics physical attack), Punyalada ràpida (fast weak attack for focus interruption), Protegir el clan (defense), Amagar-se (NimbleEscape focus). Goblins do not receive equipment in horde simulations.

## TypeScript Monorepo

The project uses a **pnpm workspace** monorepo with three packages that share a common TypeScript base config.

### Building and Running

```bash
pnpm install                     # Install all dependencies
pnpm build                       # Build all packages (engine first, then others)
pnpm simulate                    # Run CLI simulator (pnpm --filter simulator start)
pnpm dev                         # Start web dev server (pnpm --filter web dev)
```

### Package Dependencies

```
@pimpampum/engine (pure TS, 0 runtime deps)
  ↑                    ↑
  |                    |
@pimpampum/simulator  @pimpampum/web
  (tsx)                (vue 3, vue-router, vite)
```

## Engine (`packages/engine/`)

The core game logic library (`@pimpampum/engine`). Pure TypeScript with no runtime dependencies. Builds to `dist/` via `tsc`.

### Architecture

1. **DiceRoll** (`dice.ts`) - Dice notation parsing and rolling (e.g., "1d6", "2d4-1") with `roll()` and `average()` methods
2. **Equipment** (`equipment.ts`) - Passive stat modifiers with slot system (`EquipmentSlot` enum: Torso, Arms, Head, Legs, MainHand, OffHand). Factory functions: `createArmaduraDeFerro()`, `createCotaDeMalla()`, `createArmaduraDeCuir()`, `createBracalsDeCuir()`. `EquipmentTemplate` interface with metadata (id, name, slot, labels, iconPath, creator). `ALL_EQUIPMENT` array of all templates
3. **Card / CardType / SpecialEffect** (`card.ts`) - Card definitions. `CardType` enum: `PhysicalAttack`, `MagicAttack`, `Defense`, `Focus`, `PhysicalDefense`. `SpecialEffect` is a discriminated union with 30+ variants. `CharacteristicModifier` is the unified type for all stat buff/debuff effects (replaces old individual types like StrengthBoost, MagicBoost, RageBoost). Other types include: `Stun`, `MultiTarget`, `Sacrifice`, `Vengeance`, `BloodThirst`, `PackTactics`, `NimbleEscape`, `SwiftStrike`, `PiercingStrike`, `FlurryOfBlows`, `Deflection`, `MeditationBoost`, `SilenceStrike`, `PetrifyingGaze`, `Regenerate`, `VenomBite`, etc. `getCardTargetRequirement()` returns targeting info for UI
4. **Display** (`display.ts`) - Display constants for rendering: `CARD_TYPE_DISPLAY_NAMES` (Catalan names), `CARD_TYPE_CSS` (CSS class mapping), `STAT_ICONS` (icon paths), `STAT_DISPLAY_NAMES` (Catalan stat names), `RULES_SUMMARY` (structured rules card content)
5. **CombatModifier / ModifierDuration** (`modifier.ts`) - Temporary stat modifications with durations: `ThisTurn`, `NextTurn`, `ThisAndNextTurn`, `NextTwoTurns`, `RestOfCombat`
6. **Character** (`character.ts`) - Character class with base stats, equipment, cards, and combat state (lives, modifiers, stun, dodge, focus interruption, silenced, hasDeflection, etc.). `CharacterTemplate` defines character data; `createCharacter()` instantiates from a template
   - **Characters** (`characters/`) - Per-character template files + `index.ts` with `ALL_CHARACTER_TEMPLATES`, `PLAYER_TEMPLATES`, `ENEMY_TEMPLATES`, `CARD_ICONS`, and factory functions (`createFighter()`, `createWizard()`, `createRogue()`, `createBarbarian()`, `createCleric()`, `createMonk()`, `createGoblin()`, `createGoblinShaman()`, `createBasilisk()`)
7. **CombatEngine** (`combat.ts`, ~1700 lines) - The core combat loop with two interfaces:
   - **Web UI**: `prepareRound()` + `submitSelectionsAndResolve(selections)` for phased player-driven resolution
   - **Simulator**: `runRound()` / `runCombat()` for fully automated AI-vs-AI battles
   - Handles: speed-based resolution, attack/defense rolls, defense card interception, focus interruption, vengeance counter-attacks, sacrifice redirects, poison, absorb pain, combo execution, PackTactics horde bonus, NimbleEscape coordinated hiding, 20+ special effects
   - Post-resolution phase: `resolveNimbleEscape()` runs after all cards resolve to apply coordinated hiding bonuses
   - Tracks `LogEntry[]` for combat log display and `CombatStats` for statistical analysis
8. **AI** (`ai.ts`) - `selectCardAI()` for weighted random card selection, `planCombos()` for greedy team combo coordination

### AI Card Selection

The AI uses weighted random selection. Weights are influenced by:
- Enemy health state (prefer attacks when enemies are near death)
- Attack probability of hitting (compare attack stat + dice avg + PackTactics bonus vs enemy avg defense)
- Ally health state (prefer defense when allies are wounded, high priority if ally is playing focus)
- Focus card type priorities (dodge when near death, strength/magic boosts rated high, BloodThirst scales with wounded enemies)
- Card speed modifier (faster cards get slight preference)
- Combo planning: AI coordinates 2-character combos (e.g., CoordinatedAmbush + Attack, AllyStrengthThisTurn + PhysicalAttack)

## Simulator (`packages/simulator/`)

CLI-based batch simulator (`@pimpampum/simulator`) for balance testing. Depends on `@pimpampum/engine`. Uses `tsx` to run TypeScript directly. Each character receives randomly assigned equipment per battle (equally likely: nothing or any item in each slot) to test class balance across all loadouts.

### Simulation Output

Runs battle configurations (1v1 through 5v5) with all team compositions, plus horde analysis (4 players vs 10 goblins). For each:
1. **Win Rate Matrix** - Row team vs column team
2. **Team Power Rankings** - Aggregate win rates
3. **Class Win Rates** - Per-class games/wins/percentage
4. **Card Type Effectiveness** - Plays, win correlation, interrupt rates per card type
5. **Individual Card Effectiveness** - Per-card statistics sorted by win correlation
6. **Horde Analysis** - All 4-player compositions vs 10 goblins, per-composition win rates

### Balance Test Suite

The simulator has a vitest balance test suite (`src/tests/balance.test.ts`) with helpers in `src/tests/helpers.ts`. Run with `pnpm --filter simulator test`. Tests cover:
- **Class Balance** — player class win rates between 35-65%, no composition consistently too weak/strong (enemy classes like Goblin/GoblinShaman are excluded from the aggregate check since they're designed as opponents, not competitive player-class partners)
- **Combat Length** — average rounds between 2-9, per team size between 2-10
- **Card Type Balance** — each card type has >= 8% play share
- **Individual Card Usage** — every card gets >= 5% class share, win correlation 35-65%, no card > 10% of all plays
- **Strategy Triangle** — Power+Protect competitive vs pure Aggro
- **Class Identity** — Fighter defends, Wizard has highest magic, Barbarian leads physical attacks, Rogue uses focus
- **Horde Balance** — 4 players vs 10 goblins: overall win rate 25-75%, no auto-win/auto-lose compositions, battles finish within 30 rounds, draws < 15%
- **Engine Sanity** — combat terminates, valid winners, lives in valid range

## Web App (`packages/web/`)

Vue 3 multi-page SPA (`@pimpampum/web`) using Vue Router. Uses Vite for dev/build, depends on `@pimpampum/engine`. Deployed to GitHub Pages.

### Routes

| Path | View | Description |
|------|------|-------------|
| `/` | HomeView | Landing page with nav tiles |
| `/combat` | CombatView | Full combat game (setup → play → victory) |
| `/classes` | ClassesView | Player class tile grid |
| `/classes/:id` | CharacterDetailView | Character + ability cards (printable) |
| `/enemies` | EnemiesView | Enemy tile grid |
| `/enemies/:id` | CharacterDetailView | Character + ability cards (printable) |
| `/objects` | ObjectsView | Equipment cards (printable) |
| `/rules` | RulesView | 3x rules summary card (printable) |

### Combat Game Flow (CombatView)

1. **Setup** (`SetupScreen.vue`) - Build player team and enemy team from character roster (max 10 per side), choose equipment per character (toggle buttons grouped by slot, no defaults)
2. **Card Selection** (`CombatScreen.vue`) - Each living player character selects a card from their hand
3. **Target Selection** (`TargetSelector.vue`) - Modal prompts for cards requiring enemy/ally targets
4. **Resolution** - AI selects enemy cards, engine resolves the round, combat log updates
5. **Victory** (`VictoryScreen.vue`) - Display winner overlay with play again option

### Printable Card Pages

Character detail, objects, and rules views render printable cards using components in `components/cards/`:
- **PrintableCard.vue** — Generic 63×88mm card with class border color, type header, icon, effect box, stat row
- **CharacterCard.vue** — Character stat card with all base stats
- **RulesCard.vue** — Rules summary card from `RULES_SUMMARY` engine constant
- **CardGrid.vue** — Flex-wrap layout, max-width 210mm for A4 print

The `useCardDisplay.ts` composable converts engine `Card` and `EquipmentTemplate` objects to `PrintableCard` props using engine display constants (`CARD_TYPE_DISPLAY_NAMES`, `CARD_TYPE_CSS`, `CARD_ICONS`, `STAT_ICONS`).

Print: `@media print` hides nav and headers, shows only cards.

### Key Components

- **`useGame.ts`** composable - Central game state management (Vue 3 Composition API). Manages phase transitions, player selections, target queue, per-character equipment selection, and CombatEngine interaction
- **`CharacterPortrait.vue`** - Displays character icon, name, life hearts, stats (F/M/D/V), and active modifier badges
- **`MiniCard.vue`** - Individual card display with type-colored header, icon, stats, and selected/disabled states
- **`CombatLog.vue`** - Scrollable, color-coded combat log with auto-scroll

### Styling

Medieval fantasy theme with CSS variables matching the card design system:
- Dark background with parchment accents (`--parchment: #e8dcc4`)
- Class-colored borders (same palette as card CSS)
- Card type-colored headers (same palette as card CSS)
- Fonts: Cinzel Decorative (titles), Crimson Text (body), MedievalSharp (subtitles)
- Icons served from `packages/web/public/icons/` via Vite's public directory

## Card Design

### Visual Style

Use **cards/card-template.html** as the CSS design reference. The printable cards are rendered by Vue components in `components/cards/`. The style is:
- Parchment/aged paper background (#e8dcc4) with SVG noise texture overlay
- Color-coded borders by class
- Color-coded header by card type
- Clean, medieval fantasy aesthetic
- Uppercase title with serif font (Cinzel Decorative)
- Italic subtitle with Crimson Text font
- Decorative inner frame border

### Fonts

Loaded via Google Fonts import:
- **Cinzel Decorative** (400, 700, 900): Card titles, section headers
- **Crimson Text** (400, 600, italic): Body text, effect descriptions, stat labels
- **MedievalSharp**: Available as secondary option
- **Uncial Antiqua**: Available as secondary option

### Color Coding

#### Class Border Colors (outer border + inner frame)
- **Guerrer**: Dark red (#8b2c2c)
- **Murri**: Dark green (#2c5a3f)
- **Mag**: Dark purple (#3d2c6b)
- **Bàrbar**: Dark amber (#8b5a2c)
- **Clergue**: Dark teal (#2c4a4a)
- **Monjo**: Dark warm brown (#6b4c2c)
- **Objecte**: Brown (#5c4a32)
- **Goblin**: Dark olive (#4a5c2c)
- **Goblin Shaman**: Dark magenta (#5c2c4a)

#### Card Type Header Colors
- **Atac físic**: Red-orange (#a63d2f)
- **Atac màgic**: Purple (#6b3fa0)
- **Defensa**: Blue (#2f6a8a)
- **Focus**: Gold/olive (#8a7a2f)

### Icons

Use icons from **packages/web/public/icons/** folder (downloaded from game-icons.net, CC BY 3.0 license). The library contains ~4170 SVG files across 30+ artist directories. Vite serves these at `/icons/` at both dev and build time.

Local icon path format:
```
packages/web/public/icons/000000/transparent/1x1/[artist]/[icon-name].svg
```

Stat icons:
- Força (F) = lorc/crossed-swords
- Màgia (M) = lorc/crystal-wand
- Defensa (D) = willdabeast/round-shield
- Velocitat (V) = darkzaitzev/running-ninja

Major icon collections: **lorc/** (~800 icons), **delapouite/** (~600), **skoll/** (~300+).

### Card Layout

Each card follows this structure from top to bottom:

1. **Header (fixed 12mm height)** - Colored banner based on card type containing:
   - **Name** - The ability/item name, uppercase
   - **Subtitle** - The ability type and class (e.g., "Atac màgic | Mag") or "Objecte | [slot]" for items
2. **Artwork** - An illustration from icons/ folder that corresponds to the ability
3. **Effect box** - A box with the additional effect description. Only present if the ability has an additional effect.
4. **Stat modifiers** - Aligned to the right at the bottom, showing only modifiers that are different from 0 or -. Each stat is represented with an icon only.

### Card Classes

Each card element needs TWO CSS classes:
- **Class**: `guerrer`, `murri`, `mag`, `barbar`, `clergue`, `monjo`, `objecte`, `goblin`, or `goblin-shaman` (sets border color)
- **Type**: `atac-fisic`, `atac-magic`, `defensa`, `focus`, or `character` (sets header color)

Example: `<div class="print-card mag atac-magic">`

### Card Size

Standard playing card size: 63mm x 88mm

## Adding a New Character Class

When adding a new player class, ALL of these files need updating:

1. **`packages/engine/src/characters/<class>.ts`** — New file with `<CLASS>_TEMPLATE` (stats, cards, effects, icons)
2. **`packages/engine/src/card.ts`** — Add any new `SpecialEffect` variants to the discriminated union (prefer `CharacteristicModifier` for stat buffs/debuffs)
3. **`packages/engine/src/character.ts`** — Add any new combat state fields, reset in `resetForNewCombat()` and `resetForNewRound()`
4. **`packages/engine/src/combat.ts`** — Implement new effect handlers in card resolution
5. **`packages/engine/src/characters/index.ts`** — Import/export template, add to `ALL_CHARACTER_TEMPLATES`, add `create<Class>` factory
6. **`packages/engine/src/index.ts`** — Export `create<Class>` and `<CLASS>_TEMPLATE`
7. **`packages/engine/src/ai.ts`** — Add AI weight handling for new effects in all 3 strategies (Aggro, Protect, Power)
8. **`packages/web/src/assets/style.css`** — Add CSS variable `--class-<id>` and border-color rules for `.roster-tile.<id>`, `.portrait.<id>`, `.mini-card.<id>`
9. **`packages/web/src/assets/cards.css`** — Add `.print-card.<id>` and `.print-card.<id> .card-frame` border-color rules
10. **`packages/simulator/src/tests/helpers.ts`** — Add to `getAllCreators()` and `getPlayerCreators()` (or enemy equivalent)
11. **`packages/simulator/src/tests/balance.test.ts`** — Add to `playerClasses` arrays, `playerCreators`/`playerCreatorMap` arrays, and relevant test compositions (e.g., strategy triangle if the class fits Power+Protect)

## Balance Verification

Any time a character, card, or equipment item is added, removed, or modified, treat the change as **experimental** until verified. After making the change, you MUST:

1. Run the `/analyze` skill to execute the balance simulation
2. Present the simulation results to the user
3. Flag any balance problems, regressions, or conflicts with the design intentions in `intentions.md`
4. Suggest fixes if the results reveal issues

Do not consider the change complete until the simulation has been reviewed.

## GitHub Pages Deployment

The `.github/workflows/pages.yml` workflow:
1. Installs pnpm + Node 22
2. Runs `pnpm install --frozen-lockfile && pnpm build` (icons are included via Vite's public directory)
3. Copies `index.html` to `404.html` (SPA routing fallback)
4. Uploads `packages/web/dist/` as pages artifact

## Development Environment

- **Nix**: `flake.nix` provides a dev shell with `csv-tui`, `nodejs_22`, and `pnpm`
- **TypeScript**: Strict mode, ES2022 target, ESNext modules, bundler module resolution
- **pnpm**: Workspace monorepo with `packages/*` glob
- **Test suite**: Balance tests via vitest in `packages/simulator/src/tests/balance.test.ts` (~21 tests covering class balance, combat length, card usage, strategy triangle, class identity, engine sanity). Run with `pnpm --filter simulator test`
- **CI/CD**: GitHub Pages deployment via Actions workflow
