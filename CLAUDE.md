# Pim Pam Pum

A 2v2 tabletop RPG combat card game with a Rust combat simulator. All game content is in **Catalan**.

## Project Structure

```
pimpampum/
├── rules/                    # Authoritative source material
│   ├── rules.md              # Game rules and mechanics
│   ├── classes/              # Character class definitions
│   │   ├── fighter.csv       # Guerrer (F=3, M=0, D=2, V=2, MF=3)
│   │   ├── rogue.csv         # Murri (F=2, M=0, D=1, V=4, MF=3)
│   │   └── wizard.csv        # Mag (F=0, M=5, D=1, V=2, MF=3)
│   ├── enemies/              # Enemy definitions
│   │   ├── goblin.csv        # Goblin (F=2, M=0, D=1, V=3, MF=3)
│   │   └── goblin-shaman.csv # Goblin Shaman (F=1, M=4, D=0, V=2, MF=3)
│   └── objectes.csv          # Equipment definitions
├── simulator/                # Rust combat simulator
│   ├── Cargo.toml            # Rust crate (edition 2021)
│   └── src/main.rs           # Single-file simulator (~2400 lines)
├── cards/                    # Card rendering
│   ├── card-template.html    # HTML/CSS template for cards
│   └── cards.html            # Rendered card output
├── icons/                    # SVG icons from game-icons.net (CC BY 3.0)
├── flake.nix                 # Nix development environment
└── CLAUDE.md
```

## Source Material

The files under `rules/` are the authoritative source material for the game. The simulator (`simulator/src/main.rs`) should always be adapted to match the source material, not the other way around. When there are discrepancies, the source material is correct.

## Naming: Catalan ↔ English

| Catalan (game) | English (code) | CSS class |
|----------------|----------------|-----------|
| Guerrer        | Fighter        | `guerrer` |
| Murri          | Rogue          | `murri`   |
| Mag            | Wizard         | `mag`     |
| Objecte        | Equipment/Item | `objecte` |

Stats: Força (F), Màgia (M), Defensa (D), Velocitat (V), Màximes Ferides (MF)

## Simulator

### Build & Run

```bash
cd simulator && cargo run --release
```

Output includes: card usage analysis (5000 battles), card type/individual effectiveness, and team power rankings with/without equipment.

### Architecture (simulator/src/main.rs)

Key types:
- **DiceRoll** — Dice notation (e.g. 1d8, 2d6, 1d4-1)
- **Equipment** — Passive gear with stat modifiers and slot system
- **Card** — Playable action (attack/defense/focus with SpecialEffect enum)
- **Character** — Stats + equipment + combat state + modifier tracking
- **CombatEngine** — Turn-based 2v2 combat loop (max 20 rounds)
- **CombatStats/CardStats** — Per-card play counts, winner correlation, interrupt rates
- **SimulationResults** — Win rates, draw rates, avg rounds

Key factory functions: `create_fighter()`, `create_wizard()`, `create_rogue()`, `create_goblin()`, `create_goblin_shaman()` (and `_naked` variants without equipment).

Analysis functions: `run_class_analysis(with_equipment)` (5 team compositions, 500 sims each), `run_card_analysis()` (diverse matchups, 300 sims each).

Card types: PhysicalAttack, MagicAttack, Defense, Focus. Special effects include Stun, SkipNextTurns, StrengthBoost, SpeedReduction, Dodge, Vengeance, Sacrifice, and more.

## Card Design

### Visual Style

Use **card-template.html** as the template for all cards. The style is:
- Parchment/aged paper background (#e8dcc4)
- Color-coded borders by class
- Color-coded header by card type
- Clean, medieval fantasy aesthetic
- Uppercase title with serif font (Cinzel Decorative)
- Italic subtitle

### Color Coding

#### Class Border Colors (outer border + inner frame)
- **Guerrer**: Dark red (#8b2c2c)
- **Murri**: Dark green (#2c5a3f)
- **Mag**: Dark purple (#3d2c6b)
- **Objecte**: Brown (#5c4a32)

#### Card Type Header Colors
- **Atac físic**: Red-orange (#a63d2f)
- **Atac màgic**: Purple (#6b3fa0)
- **Defensa**: Blue (#2f6a8a)
- **Focus**: Gold/olive (#8a7a2f)

### Icons

Use icons from **icons/** folder (downloaded from game-icons.net, CC BY 3.0 license).

Local icon path format:
```
icons/000000/transparent/1x1/[artist]/[icon-name].svg
```

Stat icons:
- Força (F) = lorc/crossed-swords
- Màgia (M) = lorc/crystal-wand
- Defensa (D) = willdabeast/round-shield
- Velocitat (V) = darkzaitzev/running-ninja

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
- **Class**: `guerrer`, `murri`, `mag`, or `objecte` (sets border color)
- **Type**: `atac-fisic`, `atac-magic`, `defensa`, or `focus` (sets header color)

Example: `<div class="card mag atac-magic">`

### Card Size

Standard playing card size: 63mm x 88mm
