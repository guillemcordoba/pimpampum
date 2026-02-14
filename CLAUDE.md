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
├── .github/workflows/pages.yml    # GitHub Pages deployment (builds web + copies icons)
├── rules/
│   └── rules.md                   # Game rules and combat mechanics (Catalan, prose)
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
│   │       ├── character.ts       # Character class + factory functions + templates + card icons
│   │       ├── combat.ts          # CombatEngine - core combat loop (~1150 lines)
│   │       ├── ai.ts              # AI card selection + combo planning
│   │       └── strategy.ts        # AI strategy definitions
│   ├── simulator/                 # @pimpampum/simulator - CLI balance testing
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── main.ts            # Batch simulation runner (~360 lines)
│   └── web/                       # @pimpampum/web - Vue 3 multi-page SPA
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
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
├── cards/
│   └── card-template.html         # CSS design reference for card styling
└── icons/                         # ~4170 SVG icons from game-icons.net (CC BY 3.0)
    └── 000000/transparent/1x1/
        └── [artist]/[icon-name].svg
```

## Source of Truth

The **engine** (`packages/engine/`) is the sole source of truth for all game data:

- **Character definitions**: Per-character files in `characters/` (stats, cards, effects, icons)
- **Character metadata**: `ALL_CHARACTER_TEMPLATES`, `PLAYER_TEMPLATES`, `ENEMY_TEMPLATES` in `characters/index.ts`
- **Card icons**: `CARD_ICONS` in `characters/index.ts`
- **Equipment definitions**: Factory functions + `ALL_EQUIPMENT` in `equipment.ts`
- **Display constants**: `CARD_TYPE_DISPLAY_NAMES`, `CARD_TYPE_CSS`, `STAT_ICONS`, `STAT_DISPLAY_NAMES`, `RULES_SUMMARY` in `display.ts`
- **Game rules prose**: `rules/rules.md` (Catalan, not parsed by engine)

The web app and simulator derive everything from the engine. There are no CSV files or static HTML card files.

**IMPORTANT: Card descriptions are authoritative.** Each card's `.withDescription()` text is the canonical definition of what that card does. When there is a discrepancy between a card's description and its effect implementation in `combat.ts`, the description is correct and the engine code must be updated to match.

## Design Intentions

**Read `intentions.md` for the design intentions of the combat system.**

**IMPORTANT: When simulation results conflict with these intentions, immediately flag the discrepancy and propose fixes.**

## Game Rules Summary

### Core Mechanics

- **Language**: All game content is in Catalan
- **Combat format**: 2v2 team battles (players vs enemies)
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
3. **Card / CardType / SpecialEffect** (`card.ts`) - Card definitions. `CardType` enum: `PhysicalAttack`, `MagicAttack`, `Defense`, `Focus`, `PhysicalDefense`. `SpecialEffect` is a discriminated union with 20+ variants (Stun, SkipNextTurns, StrengthBoost, MagicBoost, MultiTarget, Sacrifice, Vengeance, BloodThirst, etc.). `getCardTargetRequirement()` returns targeting info for UI
4. **Display** (`display.ts`) - Display constants for rendering: `CARD_TYPE_DISPLAY_NAMES` (Catalan names), `CARD_TYPE_CSS` (CSS class mapping), `STAT_ICONS` (icon paths), `STAT_DISPLAY_NAMES` (Catalan stat names), `RULES_SUMMARY` (structured rules card content)
5. **CombatModifier / ModifierDuration** (`modifier.ts`) - Temporary stat modifications with durations: `ThisTurn`, `NextTurn`, `ThisAndNextTurn`, `RestOfCombat`
6. **Character** (`character.ts`) - Character state including base stats, equipment, cards, and combat state (lives, modifiers, stun, dodge, focus interruption, etc.). Factory functions create unequipped characters: `createFighter()`, `createWizard()`, `createRogue()`, `createBarbarian()`, `createCleric()`, `createGoblin()`, `createGoblinShaman()`. `CharacterTemplate` has `category: 'player' | 'enemy'`. Exports `ALL_CHARACTER_TEMPLATES`, `PLAYER_TEMPLATES`, `ENEMY_TEMPLATES`, and `CARD_ICONS`
7. **CombatEngine** (`combat.ts`, ~1150 lines) - The core combat loop with two interfaces:
   - **Web UI**: `prepareRound()` + `submitSelectionsAndResolve(selections)` for phased player-driven resolution
   - **Simulator**: `runRound()` / `runCombat()` for fully automated AI-vs-AI battles
   - Handles: speed-based resolution, attack/defense rolls, defense card interception, focus interruption, vengeance counter-attacks, sacrifice redirects, poison, absorb pain, combo execution, 20+ special effects
   - Tracks `LogEntry[]` for combat log display and `CombatStats` for statistical analysis
8. **AI** (`ai.ts`) - `selectCardAI()` for weighted random card selection, `planCombos()` for greedy team combo coordination

### AI Card Selection

The AI uses weighted random selection. Weights are influenced by:
- Enemy health state (prefer attacks when enemies are near death)
- Attack probability of hitting (compare attack stat + dice avg vs enemy avg defense)
- Ally health state (prefer defense when allies are wounded, high priority if ally is playing focus)
- Focus card type priorities (dodge when near death, strength/magic boosts rated high, BloodThirst scales with wounded enemies)
- Card speed modifier (faster cards get slight preference)
- Combo planning: AI coordinates 2-character combos (e.g., CoordinatedAmbush + Attack, AllyStrengthThisTurn + PhysicalAttack)

## Simulator (`packages/simulator/`)

CLI-based batch simulator (`@pimpampum/simulator`) for balance testing. Depends on `@pimpampum/engine`. Uses `tsx` to run TypeScript directly. Each character receives randomly assigned equipment per battle (equally likely: nothing or any item in each slot) to test class balance across all loadouts.

### Simulation Output

Runs battle configurations (1v1 through 5v5) with all team compositions. For each:
1. **Win Rate Matrix** - Row team vs column team
2. **Team Power Rankings** - Aggregate win rates
3. **Class Win Rates** - Per-class games/wins/percentage
4. **Card Type Effectiveness** - Plays, win correlation, interrupt rates per card type
5. **Individual Card Effectiveness** - Per-card statistics sorted by win correlation

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

1. **Setup** (`SetupScreen.vue`) - Build player team and enemy team from character roster (max 3 per side), choose equipment per character (toggle buttons grouped by slot, no defaults)
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
- Vite config allows serving icons from project root via `server.fs.allow`

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
- **Objecte**: Brown (#5c4a32)
- **Goblin**: Dark olive (#4a5c2c)
- **Goblin Shaman**: Dark magenta (#5c2c4a)

#### Card Type Header Colors
- **Atac físic**: Red-orange (#a63d2f)
- **Atac màgic**: Purple (#6b3fa0)
- **Defensa**: Blue (#2f6a8a)
- **Focus**: Gold/olive (#8a7a2f)

### Icons

Use icons from **icons/** folder (downloaded from game-icons.net, CC BY 3.0 license). The library contains ~4170 SVG files across 30+ artist directories.

Local icon path format:
```
icons/000000/transparent/1x1/[artist]/[icon-name].svg
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
- **Class**: `guerrer`, `murri`, `mag`, `barbar`, `clergue`, `objecte`, `goblin`, or `goblin-shaman` (sets border color)
- **Type**: `atac-fisic`, `atac-magic`, `defensa`, `focus`, or `character` (sets header color)

Example: `<div class="print-card mag atac-magic">`

### Card Size

Standard playing card size: 63mm x 88mm

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
2. Runs `pnpm install --frozen-lockfile && pnpm build`
3. Copies `icons/` into `packages/web/dist/icons/`
4. Copies `index.html` to `404.html` (SPA routing fallback)
5. Uploads `packages/web/dist/` as pages artifact

## Development Environment

- **Nix**: `flake.nix` provides a dev shell with `csv-tui`, `nodejs_22`, and `pnpm`
- **TypeScript**: Strict mode, ES2022 target, ESNext modules, bundler module resolution
- **pnpm**: Workspace monorepo with `packages/*` glob
- **No test suite**: Balance is verified via statistical simulation output, not unit tests
- **CI/CD**: GitHub Pages deployment via Actions workflow
