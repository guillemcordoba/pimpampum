# Pim Pam Pum

Pim Pam Pum is a tabletop RPG combat system (written in Catalan). The project contains three main components: game rules/data as the authoritative source, a Rust combat simulator for balance testing, and HTML card generation for print-ready physical cards.

## Project Structure

```
pimpampum/
├── CLAUDE.md                      # This file - project instructions
├── flake.nix                      # Nix dev environment (provides csv-tui)
├── flake.lock                     # Nix lock file (nixpkgs-unstable)
├── .gitignore                     # Ignores /target and simulator/target/
├── rules/
│   ├── rules.md                   # Game rules and combat mechanics (Catalan)
│   ├── classes/
│   │   ├── fighter.csv            # Guerrer class definition
│   │   ├── rogue.csv              # Murri class definition
│   │   └── wizard.csv             # Mag class definition
│   ├── enemies/
│   │   ├── goblin.csv             # Goblin enemy definition
│   │   └── goblin-shaman.csv      # Goblin Shaman enemy definition
│   └── objectes.csv               # Equipment/item definitions
├── simulator/
│   ├── Cargo.toml                 # Rust package (edition 2021, depends on rand 0.8)
│   └── src/
│       └── main.rs                # Combat simulation engine (~2400 lines)
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
- **rules/classes/*.csv** - Character class definitions (fighter.csv, rogue.csv, wizard.csv)
- **rules/enemies/*.csv** - Enemy definitions (goblin.csv, goblin-shaman.csv)
- **rules/objectes.csv** - Item definitions

The simulator (`simulator/src/main.rs`) should always be adapted to match the source material, not the other way around. When there are discrepancies, the source material is correct.

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
- **Defensa** (Defense): Choose an ally to defend; uses your defense stat instead of theirs. Each defense card blocks one attack. If the attack penetrates, the defender takes the wound, not the defended ally
- **Focus**: Special effect cards. Interrupted (cancelled) if the player is hit by an attack or receives an undefended attack before the card resolves

### Equipment

Passive items that modify stats permanently during combat. Slot-based system (Tors/Torso, Braços/Arms, Cap/Head, Cames/Legs, Mà principal/MainHand, Mà secundària/OffHand). Only one item per slot. Cannot be changed mid-combat.

### Characters

| Character | F | M | D | V | MF | Equipment | Cards |
|-----------|---|---|---|---|----|-----------|-------|
| Guerrer | 3 | 0 | 2 | 2 | 3 | Armadura de cuir, Braçals de cuir | 6 cards |
| Murri | 2 | 0 | 1 | 4 | 3 | Armadura de cuir | 8 cards |
| Mag | 0 | 5 | 1 | 2 | 3 | Braçals de cuir | 6 cards |
| Goblin | 2 | 0 | 1 | 3 | 3 | Braçals de cuir | 4 cards |
| Goblin Shaman | 1 | 4 | 0 | 2 | 3 | None | 5 cards |

### Equipment Items

| Item | Slot | Defense | Speed |
|------|------|---------|-------|
| Armadura de ferro | Tors | +3 | -3 |
| Cota de malla | Tors | +1d4 | -2 |
| Armadura de cuir | Tors | +2 | -1 |
| Braçals de cuir | Braços | +1 | 0 |

## Simulator (Rust)

### Building and Running

```bash
cd simulator && cargo run        # Run simulation
cd simulator && cargo build      # Build only
```

### Architecture

The simulator is a single-file Rust application (`simulator/src/main.rs`) with these main components:

1. **DiceRoll** - Dice notation representation (e.g., 1d6, 2d4-1) with `roll()` and `average()` methods
2. **Equipment** - Passive stat modifiers with slot system and builder pattern (`with_defense_flat()`, `with_defense_dice()`, `with_speed()`)
3. **Card / CardType / SpecialEffect** - Card definitions. `CardType` enum: `PhysicalAttack`, `MagicAttack`, `Defense`, `Focus`, `PhysicalDefense`. `SpecialEffect` enum has 20+ variants (Stun, SkipNextTurns, StrengthBoost, MagicBoost, MultiTarget, Sacrifice, Vengeance, etc.)
4. **CombatModifier / ModifierDuration** - Temporary stat modifications with durations: `ThisTurn`, `NextTurn`, `ThisAndNextTurn`, `RestOfCombat`
5. **Character** - Character state including base stats, equipment, cards, and combat state (wounds, modifiers, stun, dodge, focus interruption, etc.). Uses `equip()` to add equipment
6. **Character Factory** - Creator functions: `create_fighter()`, `create_wizard()`, `create_rogue()`, `create_goblin()`, `create_goblin_shaman()`, plus `_naked` variants without equipment for comparison analysis
7. **CombatStats / CardStats** - Statistics tracking: play counts, plays by winning team, interruption rates
8. **CombatEngine** - The core combat loop: AI card selection with weighted preferences, speed-based resolution order, attack/defense resolution with defense card interception, special effect handling, focus interruption mechanics, vengeance counter-attacks, sacrifice redirects
9. **SimulationResults / run_simulation()** - Batch runner for thousands of simulations with aggregate statistics
10. **main()** - Runs two analyses: card effectiveness analysis (5000 battles across matchups) and team power matrix (all 2v2 compositions, 500 battles each)

### AI Card Selection

The AI uses weighted random selection. Weights are influenced by:
- Enemy health state (prefer attacks when enemies are near death)
- Attack probability of hitting (compare attack stat + dice avg vs enemy avg defense)
- Ally health state (prefer defense when allies are wounded, high priority if ally is playing focus)
- Focus card type priorities (dodge when near death, strength/magic boosts rated high, BloodThirst scales with wounded enemies)
- Card speed modifier (faster cards get slight preference)

### Simulation Output

1. **Card Type Effectiveness** - Plays, win correlation, interrupt rates per card type
2. **Individual Card Effectiveness** - Per-card statistics across all matchups
3. **2v2 Win Rate Matrix** - Row vs column for all team compositions
4. **Overall Team Power Ranking** - Aggregate win rates with visual bar chart

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
- **Class**: `guerrer`, `murri`, `mag`, `objecte`, `goblin`, or `goblin-shaman` (sets border color)
- **Type**: `atac-fisic`, `atac-magic`, `defensa`, `focus`, or `character` (sets header color)

Example: `<div class="card mag atac-magic">`

### Card Size

Standard playing card size: 63mm x 88mm

### cards.html Sections

The full card collection (`cards/cards.html`) contains these printable sections:

1. **Cartes de Guerrer** - 6 ability cards
2. **Cartes de Murri** - 6 ability cards
3. **Cartes de Mag** - 6 ability cards
4. **Objectes** - 4 equipment cards
5. **Goblin** - 1 character card + 4 ability cards
6. **Goblin Xaman** - 1 character card + 5 ability cards
7. **Personatges** - 3 player character stat cards (Guerrer, Murri, Mag)
8. **Referència** - 3 copies of a rules summary card

Character cards use the `character` CSS class and display all base stats with icons. Rules cards use the `rules-card` class.

Print layout: `@media print` hides section titles (`.no-print`), sets gap to 0, and uses white background. Card grid max width is 210mm (A4).

## Development Environment

- **Nix**: `flake.nix` provides a dev shell with `csv-tui` for viewing CSV files interactively
- **Rust**: Edition 2021, single dependency `rand = "0.8"`
- **No test suite**: Balance is verified via statistical simulation output, not unit tests
- **No CI/CD**: No automated pipelines configured
