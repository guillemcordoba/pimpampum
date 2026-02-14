# Pim Pam Pum

Pim Pam Pum is a tabletop RPG combat system (written in Catalan). The project contains four main components: game rules/data as the authoritative source, a TypeScript game engine library, a CLI combat simulator for balance testing, a Vue 3 web app for browser-based play, and HTML card generation for print-ready physical cards.

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
├── rules/
│   ├── rules.md                   # Game rules and combat mechanics (Catalan)
│   ├── classes/
│   │   ├── fighter.csv            # Guerrer class definition
│   │   ├── rogue.csv              # Murri class definition
│   │   ├── wizard.csv             # Mag class definition
│   │   └── barbarian.csv          # Bàrbar class definition
│   ├── enemies/
│   │   ├── goblin.csv             # Goblin enemy definition
│   │   └── goblin-shaman.csv      # Goblin Shaman enemy definition
│   └── objectes.csv               # Equipment/item definitions
├── packages/
│   ├── engine/                    # @pimpampum/engine - Core game logic library
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts           # Public API exports
│   │       ├── dice.ts            # DiceRoll class (parse, roll, average)
│   │       ├── equipment.ts       # Equipment system with slots + templates
│   │       ├── modifier.ts        # CombatModifier with durations
│   │       ├── card.ts            # Card, CardType, SpecialEffect types
│   │       ├── character.ts       # Character class + factory functions (~520 lines)
│   │       ├── combat.ts          # CombatEngine - core combat loop (~1150 lines)
│   │       └── ai.ts             # AI card selection + combo planning
│   ├── simulator/                 # @pimpampum/simulator - CLI balance testing
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── main.ts            # Batch simulation runner (~360 lines)
│   └── web/                       # @pimpampum/web - Vue 3 browser game
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── main.ts            # Vue app entry point
│           ├── App.vue            # Root component
│           ├── assets/
│           │   └── style.css      # Global styles (~780 lines)
│           ├── composables/
│           │   └── useGame.ts     # Game state management (~350 lines)
│           └── components/
│               ├── SetupScreen.vue
│               ├── CombatScreen.vue
│               ├── VictoryScreen.vue
│               ├── CharacterPortrait.vue
│               ├── CardHand.vue
│               ├── MiniCard.vue
│               ├── CombatLog.vue
│               └── TargetSelector.vue
├── cards/
│   ├── card-template.html         # Single card template with full CSS documentation
│   └── cards.html                 # Complete card collection for printing
└── icons/                         # ~4170 SVG icons from game-icons.net (CC BY 3.0)
    └── 000000/transparent/1x1/
        └── [artist]/[icon-name].svg
```

## Source Material

The following files are the authoritative source material for the game:

- **rules/rules.md** - The game rules and mechanics
- **rules/classes/*.csv** - Character class definitions (fighter.csv, rogue.csv, wizard.csv, barbarian.csv)
- **rules/enemies/*.csv** - Enemy definitions (goblin.csv, goblin-shaman.csv)
- **rules/objectes.csv** - Item definitions

The engine and simulator (`packages/engine/`, `packages/simulator/`) should always be adapted to match the source material, not the other way around. When there are discrepancies, the source material is correct.

## Design Intentions

**Read `intentions.md` for the design intentions of the combat system.**

**IMPORTANT: When simulation results conflict with these intentions, immediately flag the discrepancy and propose fixes.**

### CSV Format

Class/enemy CSV files have two sections:

1. **Header row** with base stats: `Màximes ferides,Força,Màgia,Defensa,Velocitat,,,`
2. **Card rows** with columns: `Nivell,Nom,Tipus,Atac Físic,Atac Màgic,Defensa,Velocitat,Efecte`

The `objectes.csv` has columns: `Nom,Tipus,Atac Físic,Atac Màgic,Defensa,Velocitat,Efecte` where Tipus is the equipment slot (Tors, Braços, etc.).

Dice notation in CSVs: `1d8`, `1d6`, `2d4`, `1d4-1`, etc.

## Game Rules Summary

### Core Mechanics

- **Language**: All game content is in Catalan
- **Combat format**: 2v2 team battles (players vs enemies)
- **Characteristics** (scale 1-8):
  - **MF** (Màximes ferides): Max wounds before death (typically 3)
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
5. A hit deals exactly 1 wound (no variable damage)
6. A character dies when wounds reach MF

### Card Types

- **Atac físic** (Physical Attack): Compares Força + dice vs target Defensa
- **Atac màgic** (Magic Attack): Compares Màgia + dice vs target Defensa
- **Defensa** (Defense): Choose an ally to defend. The defense card redirects all attacks targeting the defended ally for the entire round. If an attack penetrates, the defender takes the wound, not the defended ally
- **Focus**: Special effect cards. Interrupted (cancelled) if the player is hit by an attack or receives an undefended attack before the card resolves

### Equipment

Passive items that modify stats permanently during combat. Slot-based system (Tors/Torso, Braços/Arms, Cap/Head, Cames/Legs, Mà principal/MainHand, Mà secundària/OffHand). Only one item per slot. Cannot be changed mid-combat. Any class can equip any item.

### Characters

| Character | F | M | D | V | MF | Cards |
|-----------|---|---|---|---|----|-------|
| Guerrer | 2 | 0 | 2 | 2 | 3 | 6 cards |
| Murri | 2 | 2 | 1 | 4 | 3 | 8 cards |
| Mag | 0 | 5 | 1 | 2 | 3 | 6 cards |
| Bàrbar | 3 | 0 | 0 | 3 | 3 | 6 cards |
| Goblin | 2 | 0 | 1 | 3 | 3 | 4 cards |
| Goblin Shaman | 1 | 4 | 0 | 2 | 3 | 5 cards |

### Equipment Items

| Item | Slot | Defense | Speed |
|------|------|---------|-------|
| Armadura de ferro | Tors | +3 | -3 |
| Cota de malla | Tors | +1d4 | -2 |
| Armadura de cuir | Tors | +1 | -1 |
| Braçals de cuir | Braços | +1 | 0 |

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
  (tsx)                (vue 3, vite)
```

## Engine (`packages/engine/`)

The core game logic library (`@pimpampum/engine`). Pure TypeScript with no runtime dependencies. Builds to `dist/` via `tsc`.

### Architecture

1. **DiceRoll** (`dice.ts`) - Dice notation parsing and rolling (e.g., "1d6", "2d4-1") with `roll()` and `average()` methods
2. **Equipment** (`equipment.ts`) - Passive stat modifiers with slot system (`EquipmentSlot` enum: Torso, Arms, Head, Legs, MainHand, OffHand). Factory functions: `createArmaduraDeFerro()`, `createCotaDeMalla()`, `createArmaduraDeCuir()`, `createBracalsDeCuir()`. `EquipmentTemplate` interface with metadata (id, name, slot, labels, creator). `ALL_EQUIPMENT` array of all templates
3. **Card / CardType / SpecialEffect** (`card.ts`) - Card definitions. `CardType` enum: `PhysicalAttack`, `MagicAttack`, `Defense`, `Focus`, `PhysicalDefense`. `SpecialEffect` is a discriminated union with 20+ variants (Stun, SkipNextTurns, StrengthBoost, MagicBoost, MultiTarget, Sacrifice, Vengeance, BloodThirst, etc.). `getCardTargetRequirement()` returns targeting info for UI
4. **CombatModifier / ModifierDuration** (`modifier.ts`) - Temporary stat modifications with durations: `ThisTurn`, `NextTurn`, `ThisAndNextTurn`, `RestOfCombat`
5. **Character** (`character.ts`) - Character state including base stats, equipment, cards, and combat state (wounds, modifiers, stun, dodge, focus interruption, etc.). Factory functions create unequipped characters: `createFighter()`, `createWizard()`, `createRogue()`, `createBarbarian()`, `createGoblin()`, `createGoblinShaman()`. Exports `ALL_CHARACTER_TEMPLATES` (for UI roster) and `CARD_ICONS` (card name to icon path mapping)
6. **CombatEngine** (`combat.ts`, ~1150 lines) - The core combat loop with two interfaces:
   - **Web UI**: `prepareRound()` + `submitSelectionsAndResolve(selections)` for phased player-driven resolution
   - **Simulator**: `runRound()` / `runCombat()` for fully automated AI-vs-AI battles
   - Handles: speed-based resolution, attack/defense rolls, defense card interception, focus interruption, vengeance counter-attacks, sacrifice redirects, poison, absorb pain, combo execution, 20+ special effects
   - Tracks `LogEntry[]` for combat log display and `CombatStats` for statistical analysis
7. **AI** (`ai.ts`) - `selectCardAI()` for weighted random card selection, `planCombos()` for greedy team combo coordination

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

Vue 3 single-page application (`@pimpampum/web`) for playing Pim Pam Pum in the browser. Uses Vite for dev/build, depends on `@pimpampum/engine`.

### Game Flow (Phases)

1. **Setup** (`SetupScreen.vue`) - Build player team and enemy team from character roster (max 3 per side), choose equipment per character (toggle buttons grouped by slot, no defaults)
2. **Card Selection** (`CombatScreen.vue`) - Each living player character selects a card from their hand
3. **Target Selection** (`TargetSelector.vue`) - Modal prompts for cards requiring enemy/ally targets
4. **Resolution** - AI selects enemy cards, engine resolves the round, combat log updates
5. **Victory** (`VictoryScreen.vue`) - Display winner overlay with play again option

### Key Components

- **`useGame.ts`** composable - Central game state management (Vue 3 Composition API). Manages phase transitions, player selections, target queue, per-character equipment selection, and CombatEngine interaction
- **`CharacterPortrait.vue`** - Displays character icon, name, wound hearts, stats (F/M/D/V), and active modifier badges
- **`MiniCard.vue`** - Individual card display with type-colored header, icon, stats, and selected/disabled states
- **`CombatLog.vue`** - Scrollable, color-coded combat log with auto-scroll

### Styling

Medieval fantasy theme with CSS variables matching the card design system:
- Dark background with parchment accents (`--parchment: #e8dcc4`)
- Class-colored borders (same palette as cards.html)
- Card type-colored headers (same palette as cards.html)
- Fonts: Cinzel Decorative (titles), Crimson Text (body), MedievalSharp (subtitles)
- Vite config allows serving icons from project root via `server.fs.allow`

## Card Design

### Visual Style

Use **cards/card-template.html** as the template for all cards. The style is:
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
- **Objecte**: Brown (#5c4a32)
- **Goblin**: Dark olive (#4a5c2c) *(cards.html only)*
- **Goblin Shaman**: Dark magenta (#5c2c4a) *(cards.html only)*

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
- **Class**: `guerrer`, `murri`, `mag`, `barbar`, `objecte`, `goblin`, or `goblin-shaman` (sets border color)
- **Type**: `atac-fisic`, `atac-magic`, `defensa`, `focus`, or `character` (sets header color)

Example: `<div class="card mag atac-magic">`

### Card Size

Standard playing card size: 63mm x 88mm

### cards.html Sections

The full card collection (`cards/cards.html`) contains these printable sections:

1. **Cartes de Guerrer** - 6 ability cards
2. **Cartes de Murri** - 6 ability cards
3. **Cartes de Mag** - 6 ability cards
4. **Cartes de Bàrbar** - 6 ability cards
5. **Objectes** - 4 equipment cards
6. **Goblin** - 1 character card + 4 ability cards
7. **Goblin Xaman** - 1 character card + 5 ability cards
8. **Personatges** - 4 player character stat cards (Guerrer, Murri, Mag, Bàrbar)
9. **Referència** - 3 copies of a rules summary card

Character cards use the `character` CSS class and display all base stats with icons. Rules cards use the `rules-card` class.

Print layout: `@media print` hides section titles (`.no-print`), sets gap to 0, and uses white background. Card grid max width is 210mm (A4).

## Balance Verification

Any time a character, card, or equipment item is added, removed, or modified (in source material, engine, or both), treat the change as **experimental** until verified. After making the change, you MUST:

1. Run the `/analyze` skill to execute the balance simulation
2. Present the simulation results to the user
3. Flag any balance problems, regressions, or conflicts with the design intentions in `intentions.md`
4. Suggest fixes if the results reveal issues

Do not consider the change complete until the simulation has been reviewed.

## Development Environment

- **Nix**: `flake.nix` provides a dev shell with `csv-tui`, `nodejs_22`, and `pnpm`
- **TypeScript**: Strict mode, ES2022 target, ESNext modules, bundler module resolution
- **pnpm**: Workspace monorepo with `packages/*` glob
- **No test suite**: Balance is verified via statistical simulation output, not unit tests
- **No CI/CD**: No automated pipelines configured
