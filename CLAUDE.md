# Pim Pam Pum

## Source Material

The following files are the authoritative source material for the game:

- **rules.md** - The game rules and mechanics
- **classes/*.csv** - Character class definitions (fighter.csv, rogue.csv, wizard.csv)
- **enemies/*.csv** - Enemy definitions (goblin.csv, goblin-shaman.csv)
- **objectes.csv** - Item definitions

The simulator (src/main.rs) should always be adapted to match the source material, not the other way around. When there are discrepancies, the source material is correct.

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
