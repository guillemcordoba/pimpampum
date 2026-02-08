//! Pim Pam Pum Combat Simulation Engine
//!
//! A simulation engine for the Pim Pam Pum tabletop RPG combat system.
//! Supports 2v2 team battles with full rule implementation.

use rand::Rng;
use std::collections::{HashMap, HashSet};

// =============================================================================
// DICE ROLLING
// =============================================================================

/// Represents a dice roll like 1d6, 2d4, or 1d4-1
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DiceRoll {
    pub num_dice: u8,
    pub sides: u8,
    pub modifier: i8,
}

impl DiceRoll {
    pub fn new(num_dice: u8, sides: u8, modifier: i8) -> Self {
        Self {
            num_dice,
            sides,
            modifier,
        }
    }

    /// Roll the dice and return the result (minimum 0)
    pub fn roll(&self) -> i32 {
        let mut rng = rand::thread_rng();
        let mut total: i32 = 0;
        for _ in 0..self.num_dice {
            total += rng.gen_range(1..=self.sides as i32);
        }
        (total + self.modifier as i32).max(0)
    }

    /// Return expected average roll
    pub fn average(&self) -> f32 {
        if self.num_dice == 0 {
            return self.modifier as f32;
        }
        let avg_per_die = (1.0 + self.sides as f32) / 2.0;
        self.num_dice as f32 * avg_per_die + self.modifier as f32
    }
}

impl std::fmt::Display for DiceRoll {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if self.num_dice == 0 {
            write!(f, "{}", self.modifier)
        } else if self.modifier > 0 {
            write!(f, "{}d{}+{}", self.num_dice, self.sides, self.modifier)
        } else if self.modifier < 0 {
            write!(f, "{}d{}{}", self.num_dice, self.sides, self.modifier)
        } else {
            write!(f, "{}d{}", self.num_dice, self.sides)
        }
    }
}

// =============================================================================
// EQUIPMENT
// =============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum EquipmentSlot {
    Torso,
    Arms,
    Head,
    Legs,
    MainHand,
    OffHand,
}

/// Passive equipment that modifies character stats
#[derive(Debug, Clone)]
pub struct Equipment {
    pub name: String,
    pub slot: EquipmentSlot,
    pub defense: Option<DiceRoll>,      // Can be flat (+2) or dice (1d4)
    pub defense_flat: i32,              // Flat defense bonus
    pub speed_mod: i32,
    pub strength_mod: i32,
    pub magic_mod: i32,
}

impl Equipment {
    pub fn new(name: &str, slot: EquipmentSlot) -> Self {
        Self {
            name: name.to_string(),
            slot,
            defense: None,
            defense_flat: 0,
            speed_mod: 0,
            strength_mod: 0,
            magic_mod: 0,
        }
    }

    pub fn with_defense_flat(mut self, defense: i32) -> Self {
        self.defense_flat = defense;
        self
    }

    pub fn with_defense_dice(mut self, dice: DiceRoll) -> Self {
        self.defense = Some(dice);
        self
    }

    pub fn with_speed(mut self, speed: i32) -> Self {
        self.speed_mod = speed;
        self
    }

    /// Get defense value (rolls dice if applicable)
    pub fn get_defense(&self) -> i32 {
        let dice_val = self.defense.map(|d| d.roll()).unwrap_or(0);
        self.defense_flat + dice_val
    }

    /// Get average defense (for AI calculations)
    pub fn get_defense_avg(&self) -> f32 {
        let dice_avg = self.defense.map(|d| d.average()).unwrap_or(0.0);
        self.defense_flat as f32 + dice_avg
    }
}

// Equipment factory functions
pub fn create_armadura_de_ferro() -> Equipment {
    Equipment::new("Armadura de ferro", EquipmentSlot::Torso)
        .with_defense_flat(3)
        .with_speed(-3)
}

pub fn create_cota_de_malla() -> Equipment {
    Equipment::new("Cota de malla", EquipmentSlot::Torso)
        .with_defense_dice(DiceRoll::new(1, 4, 0))
        .with_speed(-2)
}

pub fn create_armadura_de_cuir() -> Equipment {
    Equipment::new("Armadura de cuir", EquipmentSlot::Torso)
        .with_defense_flat(2)
        .with_speed(-1)
}

pub fn create_bracals_de_cuir() -> Equipment {
    Equipment::new("Braçals de cuir", EquipmentSlot::Arms)
        .with_defense_flat(1)
        .with_speed(0)
}

// =============================================================================
// CARD TYPES AND CARDS
// =============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CardType {
    PhysicalAttack,
    MagicAttack,
    Defense,
    Focus,
    PhysicalDefense, // Hybrid cards like Espasa llarga
}

impl CardType {
    pub fn is_attack(&self) -> bool {
        matches!(
            self,
            CardType::PhysicalAttack | CardType::MagicAttack | CardType::PhysicalDefense
        )
    }

    pub fn is_defense(&self) -> bool {
        matches!(self, CardType::Defense | CardType::PhysicalDefense)
    }

    pub fn is_focus(&self) -> bool {
        matches!(self, CardType::Focus)
    }

    pub fn is_physical(&self) -> bool {
        matches!(self, CardType::PhysicalAttack | CardType::PhysicalDefense)
    }
}

/// Special effect types for cards
#[derive(Debug, Clone, PartialEq)]
pub enum SpecialEffect {
    None,
    Stun,                              // Espasa llarga: stuns target
    SkipNextTurn,                      // Skip 1 turn
    SkipNextTurns(u8),                 // Fúria enfollida: skip N turns
    StrengthBoost(i32),                // Ràbia traumada: +4 strength rest of combat
    MagicBoost(i32),                   // Possessió demoníaca: +5 magic rest of combat
    AllyStrengthThisTurn(i32),         // Crit de guerra: allies +2 strength this turn
    DefenseBoostDuration { dice: DiceRoll, turns: u8 }, // Formació defensiva
    TeamSpeedDefenseBoost,             // Camp de distorsió: +2 speed, +1 defense
    EnemySpeedDebuff(i32),             // Raig de gel: -2 speed next turn
    EnemyStrengthDebuff(i32),          // -X strength next turn
    EmbestidaEffect,                   // Embestida: target -2 speed, self -3 speed next turn
    BlindingSmoke,                     // Fum cegador: enemies -4 speed, allies +2
    DodgeWithSpeedBoost,               // El·lusió: +3 speed next turn
    CoordinatedAmbush,                 // Emboscada: allies +1d8 vs target
    Sacrifice,                         // Sacrifici: redirect attacks
    Vengeance,                         // Venjança: counter-attack
    EnchantWeapon,                     // Encantar arma: +1d6 to attacks
    BloodThirst,                       // Set de sang: wound already wounded
    AbsorbPain,                        // Absorvir dolor: +1 defense if absorbs
    MultiTarget(u8),                   // Dagues/Pluja de flames: hit multiple targets
    DefendMultiple(u8),                // Pantalla protectora: defend 3 allies
    PoisonWeapon,                      // Enverinar arma: ally physical attacks deal extra wound
}

/// A card that can be played during combat
#[derive(Debug, Clone)]
pub struct Card {
    pub name: String,
    pub card_type: CardType,
    pub physical_attack: Option<DiceRoll>,
    pub magic_attack: Option<DiceRoll>,
    pub defense: Option<DiceRoll>,
    pub speed_mod: i32,
    pub effect: SpecialEffect,
}

impl Card {
    pub fn new(name: &str, card_type: CardType) -> Self {
        Self {
            name: name.to_string(),
            card_type,
            physical_attack: None,
            magic_attack: None,
            defense: None,
            speed_mod: 0,
            effect: SpecialEffect::None,
        }
    }

    pub fn with_physical_attack(mut self, dice: DiceRoll) -> Self {
        self.physical_attack = Some(dice);
        self
    }

    pub fn with_magic_attack(mut self, dice: DiceRoll) -> Self {
        self.magic_attack = Some(dice);
        self
    }

    pub fn with_defense(mut self, dice: DiceRoll) -> Self {
        self.defense = Some(dice);
        self
    }

    pub fn with_speed_mod(mut self, speed: i32) -> Self {
        self.speed_mod = speed;
        self
    }

    pub fn with_effect(mut self, effect: SpecialEffect) -> Self {
        self.effect = effect;
        self
    }
}

// =============================================================================
// COMBAT MODIFIERS
// =============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModifierDuration {
    ThisTurn,
    NextTurn,
    ThisAndNextTurn,
    RestOfCombat,
}

#[derive(Debug, Clone)]
pub struct CombatModifier {
    pub stat: String,
    pub value: i32,
    pub dice: Option<DiceRoll>,
    pub duration: ModifierDuration,
    pub source: String,
    pub condition: Option<String>,
}

impl CombatModifier {
    pub fn new(stat: &str, value: i32, duration: ModifierDuration) -> Self {
        Self {
            stat: stat.to_string(),
            value,
            dice: None,
            duration,
            source: String::new(),
            condition: None,
        }
    }

    pub fn with_dice(mut self, dice: DiceRoll) -> Self {
        self.dice = Some(dice);
        self
    }

    pub fn with_source(mut self, source: &str) -> Self {
        self.source = source.to_string();
        self
    }

    pub fn with_condition(mut self, condition: &str) -> Self {
        self.condition = Some(condition.to_string());
        self
    }

    pub fn get_value(&self) -> i32 {
        if let Some(dice) = &self.dice {
            dice.roll()
        } else {
            self.value
        }
    }
}

// =============================================================================
// CHARACTER
// =============================================================================

#[derive(Debug, Clone)]
pub struct Character {
    pub name: String,
    pub max_wounds: u8,
    pub strength: i32,
    pub magic: i32,
    pub defense: i32,
    pub speed: i32,
    pub cards: Vec<Card>,
    pub team: u8,
    pub character_class: String,

    // Equipment
    pub equipment: Vec<Equipment>,

    // Combat state
    pub current_wounds: u8,
    pub modifiers: Vec<CombatModifier>,
    pub defense_bonuses: Vec<(u8, usize, String, i32, DiceRoll)>,  // (defender_team, defender_idx, defender_name, total_defense, dice)
    pub skip_turns: u8,  // Number of turns to skip
    pub stunned: bool,
    pub dodging: bool,
    pub focus_interrupted: bool,
    pub played_card_idx: Option<usize>,
    pub wounded_this_combat: bool,
    pub has_absorb_pain: bool,
    pub has_poison_weapon: bool,
}

impl Character {
    pub fn new(
        name: &str,
        max_wounds: u8,
        strength: i32,
        magic: i32,
        defense: i32,
        speed: i32,
        cards: Vec<Card>,
        character_class: &str,
    ) -> Self {
        Self {
            name: name.to_string(),
            max_wounds,
            strength,
            magic,
            defense,
            speed,
            cards,
            team: 0,
            character_class: character_class.to_string(),
            equipment: Vec::new(),
            current_wounds: 0,
            modifiers: Vec::new(),
            defense_bonuses: Vec::new(),
            skip_turns: 0,
            stunned: false,
            dodging: false,
            focus_interrupted: false,
            played_card_idx: None,
            wounded_this_combat: false,
            has_absorb_pain: false,
            has_poison_weapon: false,
        }
    }

    pub fn is_alive(&self) -> bool {
        self.current_wounds < self.max_wounds
    }

    pub fn take_wound(&mut self) -> bool {
        self.current_wounds += 1;
        self.wounded_this_combat = true;
        !self.is_alive()
    }

    pub fn get_stat_modifier(&self, stat: &str, condition: Option<&str>) -> i32 {
        let mut total = 0;
        for m in &self.modifiers {
            if m.stat == stat {
                if let Some(ref cond) = m.condition {
                    if let Some(check) = condition {
                        if !cond.contains(check) {
                            continue;
                        }
                    } else {
                        continue;
                    }
                }
                total += m.get_value();
            }
        }
        total
    }

    /// Get total speed modifier from equipment
    pub fn get_equipment_speed(&self) -> i32 {
        self.equipment.iter().map(|e| e.speed_mod).sum()
    }

    /// Get total defense from equipment (rolls dice)
    pub fn get_equipment_defense(&self) -> i32 {
        self.equipment.iter().map(|e| e.get_defense()).sum()
    }

    /// Get average defense from equipment (for AI)
    pub fn get_equipment_defense_avg(&self) -> f32 {
        self.equipment.iter().map(|e| e.get_defense_avg()).sum()
    }

    pub fn get_effective_speed(&self, card: Option<&Card>) -> i32 {
        let mut base = self.speed + self.get_stat_modifier("speed", None);
        base += self.get_equipment_speed();
        if let Some(c) = card {
            base += c.speed_mod;
        }
        base
    }

    pub fn get_effective_strength(&self) -> i32 {
        self.strength + self.get_stat_modifier("strength", None)
    }

    pub fn get_effective_magic(&self) -> i32 {
        self.magic + self.get_stat_modifier("magic", None)
    }

    pub fn get_effective_defense(&self) -> i32 {
        let base = self.defense + self.get_stat_modifier("defense", None);
        base + self.get_equipment_defense()
    }

    /// Check if this character has any defense protection from other players
    pub fn has_defense_bonus(&self) -> bool {
        !self.defense_bonuses.is_empty()
    }

    /// Pop one defense bonus and return defender info + total defense value
    /// Returns: (defender_team, defender_idx, defender_name, total_defense)
    pub fn pop_defense_bonus(&mut self) -> Option<(u8, usize, String, i32)> {
        if let Some((team, idx, name, flat_defense, dice)) = self.defense_bonuses.pop() {
            let total = flat_defense + dice.roll();
            Some((team, idx, name, total))
        } else {
            None
        }
    }

    pub fn get_attack_bonus(&self, target_name: &str) -> i32 {
        let mut bonus = 0;
        for m in &self.modifiers {
            if m.stat == "attack_bonus" {
                if let Some(ref cond) = m.condition {
                    if cond.contains(target_name) {
                        bonus += m.get_value();
                    }
                } else {
                    bonus += m.get_value();
                }
            }
        }
        bonus
    }

    /// Equip an item, replacing any existing item in that slot
    pub fn equip(&mut self, item: Equipment) {
        // Remove any existing item in the same slot
        self.equipment.retain(|e| e.slot != item.slot);
        self.equipment.push(item);
    }

    pub fn reset_for_new_combat(&mut self) {
        self.current_wounds = 0;
        self.modifiers.clear();
        self.defense_bonuses.clear();
        self.skip_turns = 0;
        self.stunned = false;
        self.dodging = false;
        self.focus_interrupted = false;
        self.played_card_idx = None;
        self.wounded_this_combat = false;
        self.has_absorb_pain = false;
        self.has_poison_weapon = false;
    }

    pub fn reset_for_new_round(&mut self) -> bool {
        self.dodging = false;
        self.focus_interrupted = false;
        self.played_card_idx = None;
        self.defense_bonuses.clear(); // Defense cards only last one round

        if self.skip_turns > 0 {
            self.skip_turns -= 1;
            return true;
        }
        false
    }

    pub fn advance_turn_modifiers(&mut self) {
        self.modifiers.retain_mut(|m| match m.duration {
            ModifierDuration::ThisTurn => false,
            ModifierDuration::NextTurn => false,
            ModifierDuration::ThisAndNextTurn => {
                m.duration = ModifierDuration::NextTurn;
                true
            }
            ModifierDuration::RestOfCombat => true,
        });
    }
}

// =============================================================================
// CHARACTER FACTORY
// =============================================================================

pub fn create_fighter(name: &str) -> Character {
    let cards = vec![
        Card::new("Espasa llarga", CardType::PhysicalAttack)
            .with_physical_attack(DiceRoll::new(1, 8, 0))
            .with_speed_mod(-2)
            .with_effect(SpecialEffect::Stun),
        Card::new("Sacrifici", CardType::Defense)
            .with_speed_mod(4)
            .with_effect(SpecialEffect::Sacrifice),
        Card::new("Ràbia traumada", CardType::Focus)
            .with_speed_mod(-3)
            .with_effect(SpecialEffect::StrengthBoost(4)),
        Card::new("Embestida", CardType::PhysicalAttack)
            .with_physical_attack(DiceRoll::new(1, 6, 0))
            .with_speed_mod(2)
            .with_effect(SpecialEffect::EmbestidaEffect),
        Card::new("Crit de guerra", CardType::PhysicalAttack)
            .with_physical_attack(DiceRoll::new(1, 4, 0))
            .with_speed_mod(1)
            .with_effect(SpecialEffect::AllyStrengthThisTurn(2)),
        Card::new("Formació defensiva", CardType::Focus)
            .with_speed_mod(2)
            .with_effect(SpecialEffect::DefenseBoostDuration {
                dice: DiceRoll::new(1, 4, 0),
                turns: 2,
            }),
    ];
    let mut character = Character::new(name, 3, 3, 0, 2, 2, cards, "Fighter");
    character.equip(create_armadura_de_cuir());
    character.equip(create_bracals_de_cuir());
    character
}

pub fn create_wizard(name: &str) -> Character {
    let cards = vec![
        Card::new("Pantalla protectora", CardType::Defense)
            .with_defense(DiceRoll::new(1, 6, 0))
            .with_speed_mod(-1)
            .with_effect(SpecialEffect::DefendMultiple(3)),
        Card::new("Bola de foc", CardType::MagicAttack)
            .with_magic_attack(DiceRoll::new(1, 6, 0))
            .with_speed_mod(1),  // Buffed: 0 → +1
        Card::new("Raig de gel", CardType::MagicAttack)
            .with_magic_attack(DiceRoll::new(1, 4, 0))
            .with_speed_mod(1)
            .with_effect(SpecialEffect::EnemySpeedDebuff(2)),
        Card::new("Metamorfosi", CardType::Focus)
            .with_speed_mod(-2),
        Card::new("Encantar arma", CardType::Focus)
            .with_speed_mod(2)
            .with_effect(SpecialEffect::EnchantWeapon),
        Card::new("Camp de distorsió", CardType::Focus)
            .with_speed_mod(-1)
            .with_effect(SpecialEffect::TeamSpeedDefenseBoost),
    ];
    let mut character = Character::new(name, 3, 0, 5, 1, 2, cards, "Wizard");  // Buffed: D 0 → 1
    character.equip(create_bracals_de_cuir());
    character
}

pub fn create_rogue(name: &str) -> Character {
    let cards = vec![
        Card::new("Emboscada coordinada", CardType::Focus)
            .with_speed_mod(4)
            .with_effect(SpecialEffect::CoordinatedAmbush),
        Card::new("Fum cegador", CardType::Focus)
            .with_speed_mod(3)
            .with_effect(SpecialEffect::BlindingSmoke),
        Card::new("Braçals de cuir", CardType::Defense)
            .with_defense(DiceRoll::new(1, 4, 0))
            .with_speed_mod(2),
        Card::new("Ballesta", CardType::PhysicalAttack)
            .with_physical_attack(DiceRoll::new(1, 6, 0))
            .with_speed_mod(3),
        Card::new("Dagues", CardType::PhysicalAttack)
            .with_physical_attack(DiceRoll::new(1, 4, 0))
            .with_speed_mod(3)
            .with_effect(SpecialEffect::MultiTarget(2)),
        Card::new("El·lusió", CardType::Focus)
            .with_speed_mod(3)
            .with_effect(SpecialEffect::DodgeWithSpeedBoost),
        Card::new("Enverinar arma", CardType::Focus)
            .with_speed_mod(0)
            .with_effect(SpecialEffect::PoisonWeapon),
    ];
    let mut character = Character::new(name, 3, 2, 0, 1, 4, cards, "Rogue");
    character.equip(create_armadura_de_cuir());
    character
}

pub fn create_goblin(name: &str) -> Character {
    let cards = vec![
        Card::new("Fúria enfollida", CardType::PhysicalAttack)
            .with_physical_attack(DiceRoll::new(2, 6, 0))
            .with_speed_mod(5)
            .with_effect(SpecialEffect::SkipNextTurns(2)),
        Card::new("Maça de punxes", CardType::PhysicalAttack)
            .with_physical_attack(DiceRoll::new(1, 6, 0))
            .with_speed_mod(1),
        Card::new("Escut de fusta", CardType::Defense)
            .with_defense(DiceRoll::new(1, 6, 0))
            .with_speed_mod(2),
        Card::new("Venjança", CardType::Focus)
            .with_speed_mod(1)
            .with_effect(SpecialEffect::Vengeance),
    ];
    let mut character = Character::new(name, 3, 2, 0, 1, 3, cards, "Goblin");
    character.equip(create_bracals_de_cuir());
    character
}

pub fn create_goblin_shaman(name: &str) -> Character {
    let cards = vec![
        Card::new("Llamp", CardType::MagicAttack)
            .with_magic_attack(DiceRoll::new(2, 4, 0))
            .with_speed_mod(0),
        Card::new("Possessió demoníaca", CardType::Focus)
            .with_speed_mod(-4)
            .with_effect(SpecialEffect::MagicBoost(5)),
        Card::new("Set de sang", CardType::Focus)
            .with_speed_mod(-3)
            .with_effect(SpecialEffect::BloodThirst),
        Card::new("Pluja de flames", CardType::MagicAttack)
            .with_magic_attack(DiceRoll::new(1, 4, -1))
            .with_speed_mod(-1)
            .with_effect(SpecialEffect::MultiTarget(3)),
        Card::new("Absorvir dolor", CardType::Defense)
            .with_defense(DiceRoll::new(1, 4, 0))
            .with_speed_mod(1)
            .with_effect(SpecialEffect::AbsorbPain),
    ];
    Character::new(name, 3, 1, 4, 0, 2, cards, "Goblin Shaman")
}

// =============================================================================
// CARD STATISTICS
// =============================================================================

#[derive(Debug, Clone, Default)]
pub struct CardStats {
    pub plays: u32,
    pub plays_by_winner: u32,
    pub interrupted: u32,  // Focus cards only
}

#[derive(Debug, Clone, Default)]
pub struct CombatStats {
    pub card_stats: HashMap<String, CardStats>,
    pub card_type_stats: HashMap<String, CardStats>,
}

impl CombatStats {
    pub fn record_play(&mut self, card_name: &str, card_type: &str) {
        self.card_stats.entry(card_name.to_string()).or_default().plays += 1;
        self.card_type_stats.entry(card_type.to_string()).or_default().plays += 1;
    }

    pub fn record_winner_play(&mut self, card_name: &str, card_type: &str) {
        self.card_stats.entry(card_name.to_string()).or_default().plays_by_winner += 1;
        self.card_type_stats.entry(card_type.to_string()).or_default().plays_by_winner += 1;
    }

    pub fn record_interrupted(&mut self, card_name: &str, card_type: &str) {
        self.card_stats.entry(card_name.to_string()).or_default().interrupted += 1;
        self.card_type_stats.entry(card_type.to_string()).or_default().interrupted += 1;
    }

    pub fn merge(&mut self, other: &CombatStats) {
        for (name, stats) in &other.card_stats {
            let entry = self.card_stats.entry(name.clone()).or_default();
            entry.plays += stats.plays;
            entry.plays_by_winner += stats.plays_by_winner;
            entry.interrupted += stats.interrupted;
        }
        for (name, stats) in &other.card_type_stats {
            let entry = self.card_type_stats.entry(name.clone()).or_default();
            entry.plays += stats.plays;
            entry.plays_by_winner += stats.plays_by_winner;
            entry.interrupted += stats.interrupted;
        }
    }
}

// =============================================================================
// COMBAT ENGINE
// =============================================================================

pub struct CombatEngine {
    pub team1: Vec<Character>,
    pub team2: Vec<Character>,
    pub round_number: u32,
    pub max_rounds: u32,
    pub verbose: bool,

    // Combat state
    pub vengeance_targets: HashMap<String, String>,
    pub sacrifice_targets: HashMap<String, String>,
    pub coordinated_ambush_target: Option<String>,
    pub wounded_this_round: HashSet<String>,

    // Statistics tracking
    pub stats: CombatStats,
    pub team1_cards_played: Vec<(String, String)>,  // (card_name, card_type)
    pub team2_cards_played: Vec<(String, String)>,
}

impl CombatEngine {
    pub fn new(team1: Vec<Character>, team2: Vec<Character>, verbose: bool) -> Self {
        let mut engine = Self {
            team1,
            team2,
            round_number: 0,
            max_rounds: 20,
            verbose,
            vengeance_targets: HashMap::new(),
            sacrifice_targets: HashMap::new(),
            coordinated_ambush_target: None,
            wounded_this_round: HashSet::new(),
            stats: CombatStats::default(),
            team1_cards_played: Vec::new(),
            team2_cards_played: Vec::new(),
        };

        for c in &mut engine.team1 {
            c.team = 1;
            c.reset_for_new_combat();
        }
        for c in &mut engine.team2 {
            c.team = 2;
            c.reset_for_new_combat();
        }

        engine
    }

    fn card_type_str(card_type: CardType) -> &'static str {
        match card_type {
            CardType::PhysicalAttack => "PhysicalAttack",
            CardType::MagicAttack => "MagicAttack",
            CardType::Defense => "Defense",
            CardType::Focus => "Focus",
            CardType::PhysicalDefense => "PhysicalDefense",
        }
    }

    fn log(&self, msg: &str) {
        if self.verbose {
            println!("{}", msg);
        }
    }

    fn get_living_enemies(&self, team: u8) -> Vec<usize> {
        let enemy_team = if team == 1 { &self.team2 } else { &self.team1 };
        enemy_team
            .iter()
            .enumerate()
            .filter(|(_, c)| c.is_alive())
            .map(|(i, _)| i)
            .collect()
    }

    fn get_living_allies(&self, team: u8, exclude_idx: Option<usize>) -> Vec<usize> {
        let ally_team = if team == 1 { &self.team1 } else { &self.team2 };
        ally_team
            .iter()
            .enumerate()
            .filter(|(i, c)| c.is_alive() && exclude_idx != Some(*i))
            .map(|(i, _)| i)
            .collect()
    }

    fn select_card_ai(&self, character: &Character) -> usize {
        if character.cards.is_empty() {
            return 0;
        }

        let mut rng = rand::thread_rng();
        let enemies = self.get_living_enemies(character.team);
        let allies = self.get_living_allies(character.team, None);

        let mut weights: Vec<f32> = Vec::new();

        for card in &character.cards {
            let mut weight: f32 = 10.0;

            if card.card_type.is_attack() {
                let enemy_team = if character.team == 1 {
                    &self.team2
                } else {
                    &self.team1
                };
                for &idx in &enemies {
                    let enemy = &enemy_team[idx];
                    if enemy.current_wounds >= enemy.max_wounds - 1 {
                        weight += 15.0;
                    }
                }

                let attack_stat = if card.card_type.is_physical() {
                    character.get_effective_strength()
                } else {
                    character.get_effective_magic()
                };
                let dice_avg = if card.card_type.is_physical() {
                    card.physical_attack.map(|d| d.average()).unwrap_or(0.0)
                } else {
                    card.magic_attack.map(|d| d.average()).unwrap_or(0.0)
                };

                if !enemies.is_empty() {
                    let avg_defense: f32 = enemy_team
                        .iter()
                        .filter(|e| e.is_alive())
                        .map(|e| e.get_effective_defense() as f32)
                        .sum::<f32>()
                        / enemies.len() as f32;

                    if attack_stat as f32 + dice_avg > avg_defense {
                        weight += 10.0;
                    }
                }
            } else if card.card_type.is_defense() {
                if character.current_wounds > 0 {
                    weight += 10.0;
                }
                let ally_team = if character.team == 1 {
                    &self.team1
                } else {
                    &self.team2
                };
                for &idx in &allies {
                    if ally_team[idx].current_wounds > 0 {
                        weight += 5.0;
                    }
                    // Check if ally is playing a focus card - defend them!
                    if let Some(ally_card_idx) = ally_team[idx].played_card_idx {
                        if ally_team[idx].cards[ally_card_idx].card_type.is_focus() {
                            weight += 20.0; // High priority to protect focusing allies
                        }
                    }
                }
            } else if card.card_type.is_focus() {
                match &card.effect {
                    SpecialEffect::StrengthBoost(_) | SpecialEffect::MagicBoost(_) => weight += 8.0,
                    SpecialEffect::PoisonWeapon => weight += 10.0,
                    SpecialEffect::DodgeWithSpeedBoost => {
                        if character.current_wounds >= character.max_wounds - 1 {
                            weight += 15.0;
                        } else {
                            weight += 3.0;
                        }
                    }
                    SpecialEffect::TeamSpeedDefenseBoost => weight += 7.0,
                    SpecialEffect::BlindingSmoke => weight += 6.0,
                    SpecialEffect::CoordinatedAmbush => weight += 5.0,
                    SpecialEffect::Vengeance => weight += 4.0,
                    SpecialEffect::BloodThirst => {
                        let enemy_team = if character.team == 1 {
                            &self.team2
                        } else {
                            &self.team1
                        };
                        let wounded_enemies =
                            enemy_team.iter().filter(|e| e.wounded_this_combat).count();
                        weight += wounded_enemies as f32 * 5.0;
                    }
                    _ => weight += 3.0,
                }
            }

            weight += card.speed_mod as f32 * 1.5;
            weights.push(weight.max(1.0));
        }

        let total: f32 = weights.iter().sum();
        let mut r = rng.gen::<f32>() * total;
        for (i, w) in weights.iter().enumerate() {
            r -= w;
            if r <= 0.0 {
                return i;
            }
        }
        character.cards.len() - 1
    }

    fn select_target(&self, attacker: &Character) -> Option<(u8, usize)> {
        let enemies = self.get_living_enemies(attacker.team);
        if enemies.is_empty() {
            return None;
        }

        let enemy_team = if attacker.team == 1 {
            &self.team2
        } else {
            &self.team1
        };

        let wounded: Vec<usize> = enemies
            .iter()
            .filter(|&&i| enemy_team[i].current_wounds > 0)
            .copied()
            .collect();

        let target_idx = if !wounded.is_empty() {
            *wounded
                .iter()
                .max_by_key(|&&i| enemy_team[i].current_wounds)
                .unwrap()
        } else {
            *enemies
                .iter()
                .min_by_key(|&&i| enemy_team[i].get_effective_defense())
                .unwrap()
        };

        let target_team = if attacker.team == 1 { 2 } else { 1 };
        Some((target_team, target_idx))
    }

    fn resolve_attack(
        &mut self,
        attacker_team: u8,
        attacker_idx: usize,
        target_team: u8,
        mut target_idx: usize,
        card: &Card,
    ) -> bool {
        let target_list = if target_team == 1 {
            &self.team1
        } else {
            &self.team2
        };

        if !target_list[target_idx].is_alive() {
            return false;
        }

        let target_name = target_list[target_idx].name.clone();

        // Check for sacrifice redirect
        if let Some(sacrificer_name) = self.sacrifice_targets.get(&target_name) {
            let sacrificer_name = sacrificer_name.clone();
            let mut found = None;
            for (i, c) in self.team1.iter().enumerate() {
                if c.name == sacrificer_name && c.is_alive() {
                    found = Some((1u8, i));
                    break;
                }
            }
            if found.is_none() {
                for (i, c) in self.team2.iter().enumerate() {
                    if c.name == sacrificer_name && c.is_alive() {
                        found = Some((2u8, i));
                        break;
                    }
                }
            }
            if let Some((_team, idx)) = found {
                self.log(&format!(
                    "  → {} intercepts the attack meant for {}!",
                    sacrificer_name, target_name
                ));
                target_idx = idx;
            }
        }

        let target = if target_team == 1 {
            &self.team1[target_idx]
        } else {
            &self.team2[target_idx]
        };

        if target.dodging {
            self.log(&format!("  → {} dodges the attack!", target.name));
            return false;
        }

        let attacker = if attacker_team == 1 {
            &self.team1[attacker_idx]
        } else {
            &self.team2[attacker_idx]
        };

        let (attack_stat, dice) = if card.card_type.is_physical() {
            (attacker.get_effective_strength(), card.physical_attack)
        } else {
            (attacker.get_effective_magic(), card.magic_attack)
        };

        let dice_roll = dice.map(|d| d.roll()).unwrap_or(0);
        let attack_bonus = attacker.get_attack_bonus(&target.name);
        let total_attack = attack_stat + dice_roll + attack_bonus;

        let target_name_for_vengeance = target.name.clone();
        let attacker_name = attacker.name.clone();

        // Check if target has a defense card protecting them
        // Pop ONE defense bonus (each defense card only protects against one attack)
        let defense_bonus_info: Option<(u8, usize, String, i32)> = {
            let target_mut = if target_team == 1 {
                &mut self.team1[target_idx]
            } else {
                &mut self.team2[target_idx]
            };
            target_mut.pop_defense_bonus()
        };

        // Calculate defense - either use defender's defense or target's own defense
        let (total_defense, defender_info) = if let Some((def_team, def_idx, def_name, def_value)) = defense_bonus_info {
            self.log(&format!("  → {} is defending with defense {}!", def_name, def_value));
            (def_value, Some((def_team, def_idx, def_name)))
        } else {
            let target = if target_team == 1 {
                &self.team1[target_idx]
            } else {
                &self.team2[target_idx]
            };
            (target.get_effective_defense(), None)
        };

        self.log(&format!(
            "  → Attack: {} + {} (dice) + {} (bonus) = {}",
            attack_stat, dice_roll, attack_bonus, total_attack
        ));
        self.log(&format!("  → Defense: {}", total_defense));

        // Check for vengeance counter-attack
        if let Some(protector_name) = self.vengeance_targets.get(&target_name_for_vengeance) {
            let protector_name = protector_name.clone();
            let mut protector_strength = 0;
            let mut protector_found = false;
            for c in self.team1.iter().chain(self.team2.iter()) {
                if c.name == protector_name && c.is_alive() {
                    protector_strength = c.get_effective_strength();
                    protector_found = true;
                    break;
                }
            }
            if protector_found {
                let counter_attack = protector_strength + DiceRoll::new(1, 8, 0).roll();
                let attacker_for_counter = if attacker_team == 1 {
                    &self.team1[attacker_idx]
                } else {
                    &self.team2[attacker_idx]
                };
                let attacker_def = attacker_for_counter.get_effective_defense();
                if self.verbose {
                    println!(
                        "  → Vengeance! {} counter-attacks with {} vs {}",
                        protector_name, counter_attack, attacker_def
                    );
                }
                if counter_attack > attacker_def {
                    let (died, wounds, max_wounds) = {
                        let attacker_mut = if attacker_team == 1 {
                            &mut self.team1[attacker_idx]
                        } else {
                            &mut self.team2[attacker_idx]
                        };
                        let died = attacker_mut.take_wound();
                        (died, attacker_mut.current_wounds, attacker_mut.max_wounds)
                    };
                    self.wounded_this_round.insert(attacker_name.clone());
                    if self.verbose {
                        println!(
                            "  → {} takes a wound from vengeance! ({}/{})",
                            attacker_name, wounds, max_wounds
                        );
                        if died {
                            println!("  ★ {} is defeated!", attacker_name);
                        }
                    }
                }
            }
        }

        if total_attack > total_defense {
            // Attack succeeds - but who takes the wound?
            // Track wound recipient for poison weapon check
            let (wound_team, wound_idx, wound_name) = if let Some((def_team, def_idx, def_name)) = defender_info {
                // Defender takes the wound
                self.check_focus_interruption(def_team, def_idx);

                let (died, wounds, max_wounds) = {
                    let defender_mut = if def_team == 1 {
                        &mut self.team1[def_idx]
                    } else {
                        &mut self.team2[def_idx]
                    };
                    let died = defender_mut.take_wound();
                    (died, defender_mut.current_wounds, defender_mut.max_wounds)
                };
                self.wounded_this_round.insert(def_name.clone());
                if self.verbose {
                    println!(
                        "  → HIT! {} (defender) takes a wound! ({}/{})",
                        def_name, wounds, max_wounds
                    );
                    if died {
                        println!("  ★ {} is defeated!", def_name);
                    }
                }
                (def_team, def_idx, def_name)
            } else {
                // No defender - target takes the wound as normal
                self.check_focus_interruption(target_team, target_idx);

                let (target_name, died, wounds, max_wounds) = {
                    let target_mut = if target_team == 1 {
                        &mut self.team1[target_idx]
                    } else {
                        &mut self.team2[target_idx]
                    };
                    let name = target_mut.name.clone();
                    let died = target_mut.take_wound();
                    (name, died, target_mut.current_wounds, target_mut.max_wounds)
                };
                self.wounded_this_round.insert(target_name.clone());
                if self.verbose {
                    println!(
                        "  → HIT! {} takes a wound! ({}/{})",
                        target_name, wounds, max_wounds
                    );
                    if died {
                        println!("  ★ {} is defeated!", target_name);
                    }
                }
                (target_team, target_idx, target_name)
            };

            // Poison weapon: physical attacks cause an additional wound
            if card.card_type.is_physical() {
                let has_poison = {
                    let attacker = if attacker_team == 1 { &self.team1[attacker_idx] } else { &self.team2[attacker_idx] };
                    attacker.has_poison_weapon
                };
                if has_poison {
                    let (died, wounds, max_wounds) = {
                        let recipient = if wound_team == 1 { &mut self.team1[wound_idx] } else { &mut self.team2[wound_idx] };
                        if recipient.is_alive() {
                            let died = recipient.take_wound();
                            (Some(died), recipient.current_wounds, recipient.max_wounds)
                        } else {
                            (None, 0, 0)
                        }
                    };
                    if let Some(died) = died {
                        self.log(&format!(
                            "  → Poison deals extra wound to {}! ({}/{})",
                            wound_name, wounds, max_wounds
                        ));
                        if died {
                            self.log(&format!("  ★ {} is defeated by poison!", wound_name));
                        }
                    }
                }
            }

            true
        } else {
            self.log("  → MISS! Attack blocked.");
            // Check if target has no defense card protection - if so, interrupt focus
            // (defender_info being Some means defense was used, so no interruption)
            if defender_info.is_none() {
                // Attacked without defense card protection - interrupt focus
                self.check_focus_interruption(target_team, target_idx);
            }
            // Check for absorb pain on the defender if there was one
            if let Some((def_team, def_idx, def_name)) = defender_info {
                let has_absorb = {
                    let defender = if def_team == 1 {
                        &self.team1[def_idx]
                    } else {
                        &self.team2[def_idx]
                    };
                    defender.has_absorb_pain
                };
                if has_absorb {
                    let defender_mut = if def_team == 1 {
                        &mut self.team1[def_idx]
                    } else {
                        &mut self.team2[def_idx]
                    };
                    defender_mut.modifiers.push(
                        CombatModifier::new("defense", 1, ModifierDuration::RestOfCombat)
                            .with_source("Absorvir dolor"),
                    );
                    if self.verbose {
                        println!("  → {} gains +1 defense from Absorvir dolor!", def_name);
                    }
                }
            }
            false
        }
    }

    fn resolve_card(&mut self, char_team: u8, char_idx: usize, card: Card) {
        let character = if char_team == 1 {
            &self.team1[char_idx]
        } else {
            &self.team2[char_idx]
        };

        let char_name = character.name.clone();
        let char_class = character.character_class.clone();
        let card_name = card.name.clone();
        let card_type_s = Self::card_type_str(card.card_type).to_string();

        // Track card play
        self.stats.record_play(&card_name, &card_type_s);
        if char_team == 1 {
            self.team1_cards_played.push((card_name.clone(), card_type_s.clone()));
        } else {
            self.team2_cards_played.push((card_name.clone(), card_type_s.clone()));
        }

        self.log(&format!(
            "\n{} ({}) plays {}",
            char_name, char_class, card.name
        ));

        if card.card_type.is_focus() {
            let character = if char_team == 1 {
                &self.team1[char_idx]
            } else {
                &self.team2[char_idx]
            };
            if character.focus_interrupted {
                self.stats.record_interrupted(&card_name, &card_type_s);
                self.log("  → Focus interrupted! Card has no effect.");
                return;
            }
        }

        if card.card_type.is_attack() {
            let character = if char_team == 1 {
                &self.team1[char_idx]
            } else {
                &self.team2[char_idx]
            };
            if character.stunned {
                self.log(&format!("  → {} is stunned and cannot attack!", char_name));
                return;
            }
        }

        // Handle attacks
        if card.card_type.is_attack() {
            let num_targets = match &card.effect {
                SpecialEffect::MultiTarget(n) => *n as usize,
                _ => 1,
            };

            let enemies = self.get_living_enemies(char_team);
            let targets: Vec<usize> = enemies.into_iter().take(num_targets).collect();

            for target_idx in targets {
                let target_team = if char_team == 1 { 2 } else { 1 };
                self.resolve_attack(char_team, char_idx, target_team, target_idx, &card);
            }

            // Handle stun effect
            if matches!(card.effect, SpecialEffect::Stun) {
                let character = if char_team == 1 {
                    &self.team1[char_idx]
                } else {
                    &self.team2[char_idx]
                };
                let target = self.select_target(character);
                if let Some((target_team, target_idx)) = target {
                    let name = {
                        let target_char = if target_team == 1 {
                            &mut self.team1[target_idx]
                        } else {
                            &mut self.team2[target_idx]
                        };
                        if target_char.is_alive() {
                            target_char.stunned = true;
                            Some(target_char.name.clone())
                        } else {
                            None
                        }
                    };
                    if let Some(name) = name {
                        self.log(&format!("  → {} is stunned!", name));
                    }
                }
            }

            // Handle speed debuff
            if let SpecialEffect::EnemySpeedDebuff(penalty) = card.effect {
                let character = if char_team == 1 {
                    &self.team1[char_idx]
                } else {
                    &self.team2[char_idx]
                };
                let target = self.select_target(character);
                if let Some((target_team, target_idx)) = target {
                    let name = {
                        let target_char = if target_team == 1 {
                            &mut self.team1[target_idx]
                        } else {
                            &mut self.team2[target_idx]
                        };
                        if target_char.is_alive() {
                            target_char.modifiers.push(
                                CombatModifier::new("speed", -(penalty as i32), ModifierDuration::NextTurn)
                                    .with_source(&card.name),
                            );
                            Some(target_char.name.clone())
                        } else {
                            None
                        }
                    };
                    if let Some(name) = name {
                        self.log(&format!("  → {} gets -{} speed next turn!", name, penalty));
                    }
                }
            }

            // Handle strength debuff
            if let SpecialEffect::EnemyStrengthDebuff(penalty) = card.effect {
                let character = if char_team == 1 {
                    &self.team1[char_idx]
                } else {
                    &self.team2[char_idx]
                };
                let target = self.select_target(character);
                if let Some((target_team, target_idx)) = target {
                    let name = {
                        let target_char = if target_team == 1 {
                            &mut self.team1[target_idx]
                        } else {
                            &mut self.team2[target_idx]
                        };
                        if target_char.is_alive() {
                            target_char.modifiers.push(
                                CombatModifier::new("strength", -(penalty as i32), ModifierDuration::NextTurn)
                                    .with_source(&card.name),
                            );
                            Some(target_char.name.clone())
                        } else {
                            None
                        }
                    };
                    if let Some(name) = name {
                        self.log(&format!("  → {} gets -{} strength next turn!", name, penalty));
                    }
                }
            }

            // Handle Embestida effect: target -2 speed, self -3 speed next turn
            if matches!(card.effect, SpecialEffect::EmbestidaEffect) {
                let character = if char_team == 1 {
                    &self.team1[char_idx]
                } else {
                    &self.team2[char_idx]
                };
                let target = self.select_target(character);
                if let Some((target_team, target_idx)) = target {
                    let target_name = {
                        let target_char = if target_team == 1 {
                            &mut self.team1[target_idx]
                        } else {
                            &mut self.team2[target_idx]
                        };
                        if target_char.is_alive() {
                            target_char.modifiers.push(
                                CombatModifier::new("speed", -2, ModifierDuration::NextTurn)
                                    .with_source(&card.name),
                            );
                            Some(target_char.name.clone())
                        } else {
                            None
                        }
                    };
                    if let Some(name) = target_name {
                        self.log(&format!("  → {} gets -2 speed next turn!", name));
                    }
                }
                // Apply -3 speed to self next turn
                let attacker = if char_team == 1 {
                    &mut self.team1[char_idx]
                } else {
                    &mut self.team2[char_idx]
                };
                attacker.modifiers.push(
                    CombatModifier::new("speed", -3, ModifierDuration::NextTurn)
                        .with_source(&card.name),
                );
                self.log(&format!("  → {} gets -3 speed next turn!", char_name));
            }

            // Handle skip next turn(s)
            match card.effect {
                SpecialEffect::SkipNextTurn => {
                    let character = if char_team == 1 {
                        &mut self.team1[char_idx]
                    } else {
                        &mut self.team2[char_idx]
                    };
                    character.skip_turns = 1;
                    self.log(&format!("  → {} will skip next turn!", char_name));
                }
                SpecialEffect::SkipNextTurns(n) => {
                    let character = if char_team == 1 {
                        &mut self.team1[char_idx]
                    } else {
                        &mut self.team2[char_idx]
                    };
                    character.skip_turns = n;
                    self.log(&format!("  → {} will skip the next {} turns!", char_name, n));
                }
                _ => {}
            }
        }

        // Handle defense cards
        if card.card_type.is_defense() {
            // Handle Sacrifice effect (defense card that redirects attacks)
            if matches!(card.effect, SpecialEffect::Sacrifice) {
                let allies = self.get_living_allies(char_team, Some(char_idx));
                if !allies.is_empty() {
                    let ally_team = if char_team == 1 {
                        &self.team1
                    } else {
                        &self.team2
                    };
                    let protected_name = ally_team[allies[0]].name.clone();
                    self.sacrifice_targets
                        .insert(protected_name.clone(), char_name.clone());
                    self.log(&format!(
                        "  → {} will intercept attacks against {}!",
                        char_name, protected_name
                    ));
                }
            } else if let Some(defense_dice) = card.defense {
                // Standard defense card with defense bonus
                let num_targets = match &card.effect {
                    SpecialEffect::DefendMultiple(n) => *n as usize,
                    _ => 1,
                };

                let allies = self.get_living_allies(char_team, None);
                let targets: Vec<usize> = allies.into_iter().take(num_targets).collect();

                // Get defender's total defense (base + equipment + modifiers)
                let defender_base_defense = {
                    let defender = if char_team == 1 {
                        &self.team1[char_idx]
                    } else {
                        &self.team2[char_idx]
                    };
                    defender.defense + defender.get_stat_modifier("defense", None) + defender.get_equipment_defense()
                };

                let names: Vec<String> = {
                    let ally_team = if char_team == 1 {
                        &mut self.team1
                    } else {
                        &mut self.team2
                    };

                    targets.iter().map(|&target_idx| {
                        ally_team[target_idx]
                            .defense_bonuses
                            .push((char_team, char_idx, char_name.clone(), defender_base_defense, defense_dice));
                        ally_team[target_idx].name.clone()
                    }).collect()
                };

                for name in names {
                    self.log(&format!(
                        "  → {} gains +{} + {} defense this round from {}!",
                        name, defender_base_defense, defense_dice, char_name
                    ));
                }

                if matches!(card.effect, SpecialEffect::AbsorbPain) {
                    let character = if char_team == 1 {
                        &mut self.team1[char_idx]
                    } else {
                        &mut self.team2[char_idx]
                    };
                    character.has_absorb_pain = true;
                }
            }
        }

        // Handle focus cards
        if card.card_type.is_focus() {
            match &card.effect {
                SpecialEffect::StrengthBoost(amount) => {
                    let character = if char_team == 1 {
                        &mut self.team1[char_idx]
                    } else {
                        &mut self.team2[char_idx]
                    };
                    character.modifiers.push(
                        CombatModifier::new("strength", *amount, ModifierDuration::RestOfCombat)
                            .with_source(&card.name),
                    );
                    self.log(&format!(
                        "  → {} gains +{} Strength for rest of combat!",
                        char_name, amount
                    ));
                }

                SpecialEffect::MagicBoost(amount) => {
                    let character = if char_team == 1 {
                        &mut self.team1[char_idx]
                    } else {
                        &mut self.team2[char_idx]
                    };
                    character.modifiers.push(
                        CombatModifier::new("magic", *amount, ModifierDuration::RestOfCombat)
                            .with_source(&card.name),
                    );
                    self.log(&format!(
                        "  → {} gains +{} Magic for rest of combat!",
                        char_name, amount
                    ));
                }

                SpecialEffect::AllyStrengthThisTurn(amount) => {
                    let allies = self.get_living_allies(char_team, Some(char_idx));
                    let ally_team = if char_team == 1 {
                        &mut self.team1
                    } else {
                        &mut self.team2
                    };
                    for idx in allies {
                        ally_team[idx].modifiers.push(
                            CombatModifier::new("strength", *amount, ModifierDuration::ThisTurn)
                                .with_source(&card.name),
                        );
                    }
                    self.log(&format!(
                        "  → All allies gain +{} Strength this turn!",
                        amount
                    ));
                }

                SpecialEffect::DefenseBoostDuration { dice, turns: _ } => {
                    let character = if char_team == 1 {
                        &mut self.team1[char_idx]
                    } else {
                        &mut self.team2[char_idx]
                    };
                    character.modifiers.push(
                        CombatModifier::new("defense", 0, ModifierDuration::ThisAndNextTurn)
                            .with_dice(*dice)
                            .with_source(&card.name),
                    );

                    let allies = self.get_living_allies(char_team, Some(char_idx));
                    if !allies.is_empty() {
                        let ally_team = if char_team == 1 {
                            &mut self.team1
                        } else {
                            &mut self.team2
                        };
                        let ally_idx = allies[0];
                        let ally_name = ally_team[ally_idx].name.clone();
                        ally_team[ally_idx].modifiers.push(
                            CombatModifier::new("defense", 0, ModifierDuration::ThisAndNextTurn)
                                .with_dice(*dice)
                                .with_source(&card.name),
                        );
                        self.log(&format!(
                            "  → {} and {} gain +{} defense this and next turn!",
                            char_name, ally_name, dice
                        ));
                    }
                }

                SpecialEffect::TeamSpeedDefenseBoost => {
                    let all_allies = self.get_living_allies(char_team, None);
                    let ally_team = if char_team == 1 {
                        &mut self.team1
                    } else {
                        &mut self.team2
                    };

                    ally_team[char_idx].modifiers.push(
                        CombatModifier::new("speed", 2, ModifierDuration::RestOfCombat)
                            .with_source(&card.name),
                    );
                    ally_team[char_idx].modifiers.push(
                        CombatModifier::new("defense", 1, ModifierDuration::RestOfCombat)
                            .with_source(&card.name),
                    );

                    for idx in all_allies {
                        if idx != char_idx {
                            ally_team[idx].modifiers.push(
                                CombatModifier::new("speed", 2, ModifierDuration::RestOfCombat)
                                    .with_source(&card.name),
                            );
                            ally_team[idx].modifiers.push(
                                CombatModifier::new("defense", 1, ModifierDuration::RestOfCombat)
                                    .with_source(&card.name),
                            );
                        }
                    }
                    self.log(
                        "  → All allies gain +2 speed and +1 defense for rest of combat!",
                    );
                }

                SpecialEffect::BlindingSmoke => {
                    let enemies = self.get_living_enemies(char_team);
                    let enemy_team = if char_team == 1 {
                        &mut self.team2
                    } else {
                        &mut self.team1
                    };
                    for idx in enemies {
                        enemy_team[idx].modifiers.push(
                            CombatModifier::new("speed", -4, ModifierDuration::ThisTurn)
                                .with_source(&card.name),
                        );
                    }

                    let allies = self.get_living_allies(char_team, None);
                    let ally_team = if char_team == 1 {
                        &mut self.team1
                    } else {
                        &mut self.team2
                    };
                    for idx in allies {
                        ally_team[idx].modifiers.push(
                            CombatModifier::new("speed", 2, ModifierDuration::ThisTurn)
                                .with_source(&card.name),
                        );
                    }
                    self.log("  → Enemies get -4 speed, allies get +2 speed!");
                }

                SpecialEffect::DodgeWithSpeedBoost => {
                    let character = if char_team == 1 {
                        &mut self.team1[char_idx]
                    } else {
                        &mut self.team2[char_idx]
                    };
                    character.dodging = true;
                    character.modifiers.push(
                        CombatModifier::new("speed", 3, ModifierDuration::NextTurn)
                            .with_source(&card.name),
                    );
                    self.log(&format!(
                        "  → {} will dodge all attacks this turn, +3 speed next turn!",
                        char_name
                    ));
                }

                SpecialEffect::CoordinatedAmbush => {
                    let enemies = self.get_living_enemies(char_team);
                    if !enemies.is_empty() {
                        let enemy_team = if char_team == 1 {
                            &self.team2
                        } else {
                            &self.team1
                        };
                        let target_name = enemy_team[enemies[0]].name.clone();
                        self.coordinated_ambush_target = Some(target_name.clone());

                        let allies = self.get_living_allies(char_team, Some(char_idx));
                        let ally_team = if char_team == 1 {
                            &mut self.team1
                        } else {
                            &mut self.team2
                        };
                        for idx in allies {
                            ally_team[idx].modifiers.push(
                                CombatModifier::new("attack_bonus", 0, ModifierDuration::ThisTurn)
                                    .with_dice(DiceRoll::new(1, 8, 0))
                                    .with_source(&card.name)
                                    .with_condition(&format!("attacking_{}", target_name)),
                            );
                        }
                        self.log(&format!(
                            "  → Allies get +1d8 when attacking {}!",
                            target_name
                        ));
                    }
                }

                SpecialEffect::Vengeance => {
                    let allies = self.get_living_allies(char_team, Some(char_idx));
                    let ally_team = if char_team == 1 {
                        &self.team1
                    } else {
                        &self.team2
                    };

                    let protect_name = if allies.is_empty() {
                        char_name.clone()
                    } else {
                        let wounded: Vec<usize> = allies
                            .iter()
                            .filter(|&&i| ally_team[i].current_wounds > 0)
                            .copied()
                            .collect();
                        if !wounded.is_empty() {
                            ally_team[*wounded
                                .iter()
                                .max_by_key(|&&i| ally_team[i].current_wounds)
                                .unwrap()]
                            .name
                            .clone()
                        } else {
                            ally_team[allies[0]].name.clone()
                        }
                    };

                    self.vengeance_targets
                        .insert(protect_name.clone(), char_name.clone());
                    self.log(&format!(
                        "  → {} will counter-attack anyone who attacks {}!",
                        char_name, protect_name
                    ));
                }

                SpecialEffect::EnchantWeapon => {
                    let allies = self.get_living_allies(char_team, None);
                    let ally_team = if char_team == 1 {
                        &mut self.team1
                    } else {
                        &mut self.team2
                    };

                    let target_idx = allies
                        .iter()
                        .max_by_key(|&&i| ally_team[i].strength.max(ally_team[i].magic))
                        .copied()
                        .unwrap_or(char_idx);

                    let target_name = ally_team[target_idx].name.clone();
                    ally_team[target_idx].modifiers.push(
                        CombatModifier::new("attack_bonus", 0, ModifierDuration::RestOfCombat)
                            .with_dice(DiceRoll::new(1, 6, 0))
                            .with_source(&card.name),
                    );
                    self.log(&format!(
                        "  → {}'s attacks now deal +1d6 damage!",
                        target_name
                    ));
                }

                SpecialEffect::PoisonWeapon => {
                    let allies = self.get_living_allies(char_team, Some(char_idx));
                    let ally_team = if char_team == 1 {
                        &mut self.team1
                    } else {
                        &mut self.team2
                    };

                    // Target the ally with the highest strength (physical attacker)
                    let target_idx = allies
                        .iter()
                        .max_by_key(|&&i| ally_team[i].strength)
                        .copied()
                        .unwrap_or(char_idx);

                    let target_name = ally_team[target_idx].name.clone();
                    ally_team[target_idx].has_poison_weapon = true;
                    self.log(&format!(
                        "  → {}'s physical attacks now deal an extra wound!",
                        target_name
                    ));
                }

                SpecialEffect::BloodThirst => {
                    let enemies = self.get_living_enemies(char_team);
                    let mut blood_results: Vec<(String, u8, u8, bool)> = Vec::new();

                    {
                        let enemy_team = if char_team == 1 {
                            &mut self.team2
                        } else {
                            &mut self.team1
                        };

                        for idx in enemies {
                            if enemy_team[idx].wounded_this_combat {
                                let enemy_name = enemy_team[idx].name.clone();
                                let died = enemy_team[idx].take_wound();
                                blood_results.push((
                                    enemy_name,
                                    enemy_team[idx].current_wounds,
                                    enemy_team[idx].max_wounds,
                                    died,
                                ));
                            }
                        }
                    }

                    for (enemy_name, wounds, max_wounds, died) in blood_results {
                        self.log(&format!(
                            "  → {} takes a wound from Blood Thirst! ({}/{})",
                            enemy_name, wounds, max_wounds
                        ));
                        if died {
                            self.log(&format!("  ★ {} is defeated!", enemy_name));
                        }
                    }
                }

                _ => {}
            }
        }
    }

    fn check_focus_interruption(&mut self, target_team: u8, target_idx: usize) {
        let target = if target_team == 1 {
            &mut self.team1[target_idx]
        } else {
            &mut self.team2[target_idx]
        };

        if let Some(card_idx) = target.played_card_idx {
            if target.cards[card_idx].card_type.is_focus() {
                target.focus_interrupted = true;
            }
        }
    }

    fn is_combat_over(&self) -> bool {
        let team1_alive = self.team1.iter().any(|c| c.is_alive());
        let team2_alive = self.team2.iter().any(|c| c.is_alive());
        !team1_alive || !team2_alive
    }

    pub fn run_round(&mut self) -> bool {
        self.round_number += 1;
        self.log(&format!("\n{}", "-".repeat(50)));
        self.log(&format!("ROUND {}", self.round_number));
        self.log(&format!("{}", "-".repeat(50)));

        self.coordinated_ambush_target = None;
        self.wounded_this_round.clear();

        // Card Selection
        let mut actions: Vec<(u8, usize, usize)> = Vec::new();
        let mut logs: Vec<String> = Vec::new();

        // Team 1 card selection
        for idx in 0..self.team1.len() {
            if !self.team1[idx].is_alive() {
                continue;
            }
            if self.team1[idx].reset_for_new_round() {
                logs.push(format!("{} skips this turn!", self.team1[idx].name));
                continue;
            }
            let card_idx = self.select_card_ai(&self.team1[idx]);
            self.team1[idx].played_card_idx = Some(card_idx);
            actions.push((1, idx, card_idx));
            logs.push(format!("{} selects: {}", self.team1[idx].name, self.team1[idx].cards[card_idx].name));
        }

        // Team 2 card selection
        for idx in 0..self.team2.len() {
            if !self.team2[idx].is_alive() {
                continue;
            }
            if self.team2[idx].reset_for_new_round() {
                logs.push(format!("{} skips this turn!", self.team2[idx].name));
                continue;
            }
            let card_idx = self.select_card_ai(&self.team2[idx]);
            self.team2[idx].played_card_idx = Some(card_idx);
            actions.push((2, idx, card_idx));
            logs.push(format!("{} selects: {}", self.team2[idx].name, self.team2[idx].cards[card_idx].name));
        }

        for log in logs {
            self.log(&log);
        }

        if actions.is_empty() {
            return false;
        }

        // Sort by speed
        actions.sort_by(|a, b| {
            let char_a = if a.0 == 1 {
                &self.team1[a.1]
            } else {
                &self.team2[a.1]
            };
            let char_b = if b.0 == 1 {
                &self.team1[b.1]
            } else {
                &self.team2[b.1]
            };
            let card_a = &char_a.cards[a.2];
            let card_b = &char_b.cards[b.2];
            let speed_a = char_a.get_effective_speed(Some(card_a));
            let speed_b = char_b.get_effective_speed(Some(card_b));
            speed_b.cmp(&speed_a)
        });

        self.log("\nResolution order (by speed):");
        for (team, char_idx, card_idx) in &actions {
            let char = if *team == 1 {
                &self.team1[*char_idx]
            } else {
                &self.team2[*char_idx]
            };
            let card = &char.cards[*card_idx];
            let speed = char.get_effective_speed(Some(card));
            self.log(&format!(
                "  {}: {} (base {} + card {} + mods)",
                char.name, speed, char.speed, card.speed_mod
            ));
        }

        // Resolve actions
        for (team, char_idx, card_idx) in actions.clone() {
            let char = if team == 1 {
                &self.team1[char_idx]
            } else {
                &self.team2[char_idx]
            };

            if !char.is_alive() {
                continue;
            }

            let card = char.cards[card_idx].clone();

            self.resolve_card(team, char_idx, card);

            if self.is_combat_over() {
                return false;
            }
        }

        // End of round cleanup
        for char in self.team1.iter_mut().chain(self.team2.iter_mut()) {
            char.advance_turn_modifiers();
            char.stunned = false;
        }

        true
    }

    pub fn run_combat(&mut self) -> u8 {
        self.log(&format!("{}", "=".repeat(50)));
        self.log("COMBAT START");
        self.log(&format!("{}", "=".repeat(50)));

        self.log("\nTeam 1:");
        for c in &self.team1 {
            self.log(&format!(
                "  {} ({}) - MF:{} F:{} M:{} D:{} V:{}",
                c.name, c.character_class, c.max_wounds, c.strength, c.magic, c.defense, c.speed
            ));
        }

        self.log("\nTeam 2:");
        for c in &self.team2 {
            self.log(&format!(
                "  {} ({}) - MF:{} F:{} M:{} D:{} V:{}",
                c.name, c.character_class, c.max_wounds, c.strength, c.magic, c.defense, c.speed
            ));
        }

        while self.round_number < self.max_rounds {
            if !self.run_round() {
                break;
            }
        }

        let team1_alive: u32 = self.team1.iter().filter(|c| c.is_alive()).count() as u32;
        let team2_alive: u32 = self.team2.iter().filter(|c| c.is_alive()).count() as u32;

        self.log(&format!("\n{}", "-".repeat(50)));
        self.log("COMBAT END");
        self.log(&format!("{}", "-".repeat(50)));

        let winner = if team1_alive > 0 && team2_alive == 0 {
            self.log("TEAM 1 WINS!");
            1
        } else if team2_alive > 0 && team1_alive == 0 {
            self.log("TEAM 2 WINS!");
            2
        } else if team1_alive > team2_alive {
            self.log(&format!(
                "TEAM 1 WINS! ({} vs {} survivors)",
                team1_alive, team2_alive
            ));
            1
        } else if team2_alive > team1_alive {
            self.log(&format!(
                "TEAM 2 WINS! ({} vs {} survivors)",
                team2_alive, team1_alive
            ));
            2
        } else {
            self.log("DRAW!");
            0
        };

        // Record winner's cards
        let winner_cards = if winner == 1 {
            &self.team1_cards_played
        } else if winner == 2 {
            &self.team2_cards_played
        } else {
            return winner;
        };
        for (card_name, card_type) in winner_cards.clone() {
            self.stats.record_winner_play(&card_name, &card_type);
        }

        winner
    }
}

// =============================================================================
// SIMULATION RUNNER
// =============================================================================

pub struct SimulationResults {
    pub team1_wins: u32,
    pub team2_wins: u32,
    pub draws: u32,
    pub total_rounds: u32,
    pub num_simulations: u32,
    pub stats: CombatStats,
}

impl SimulationResults {
    pub fn team1_win_rate(&self) -> f32 {
        self.team1_wins as f32 / self.num_simulations as f32 * 100.0
    }

    pub fn team2_win_rate(&self) -> f32 {
        self.team2_wins as f32 / self.num_simulations as f32 * 100.0
    }

    pub fn draw_rate(&self) -> f32 {
        self.draws as f32 / self.num_simulations as f32 * 100.0
    }

    pub fn avg_rounds(&self) -> f32 {
        self.total_rounds as f32 / self.num_simulations as f32
    }
}

pub fn run_simulation<F1, F2>(
    team1_creators: &[F1],
    team2_creators: &[F2],
    num_simulations: u32,
    verbose: bool,
) -> SimulationResults
where
    F1: Fn(&str) -> Character,
    F2: Fn(&str) -> Character,
{
    let mut results = SimulationResults {
        team1_wins: 0,
        team2_wins: 0,
        draws: 0,
        total_rounds: 0,
        num_simulations,
        stats: CombatStats::default(),
    };

    for i in 0..num_simulations {
        let team1: Vec<Character> = team1_creators
            .iter()
            .enumerate()
            .map(|(j, creator)| creator(&format!("T1_{}_{}", j, i)))
            .collect();

        let team2: Vec<Character> = team2_creators
            .iter()
            .enumerate()
            .map(|(j, creator)| creator(&format!("T2_{}_{}", j, i)))
            .collect();

        let mut engine = CombatEngine::new(team1, team2, verbose);
        let winner = engine.run_combat();

        results.total_rounds += engine.round_number;
        results.stats.merge(&engine.stats);

        match winner {
            1 => results.team1_wins += 1,
            2 => results.team2_wins += 1,
            _ => results.draws += 1,
        }
    }

    results
}

// =============================================================================
// MAIN
// =============================================================================

// Character creators without equipment
pub fn create_fighter_naked(name: &str) -> Character {
    let cards = vec![
        Card::new("Espasa llarga", CardType::PhysicalAttack)
            .with_physical_attack(DiceRoll::new(1, 8, 0))
            .with_speed_mod(-2)
            .with_effect(SpecialEffect::Stun),
        Card::new("Sacrifici", CardType::Defense)
            .with_speed_mod(4)
            .with_effect(SpecialEffect::Sacrifice),
        Card::new("Ràbia traumada", CardType::Focus)
            .with_speed_mod(-3)
            .with_effect(SpecialEffect::StrengthBoost(4)),
        Card::new("Embestida", CardType::PhysicalAttack)
            .with_physical_attack(DiceRoll::new(1, 6, 0))
            .with_speed_mod(2)
            .with_effect(SpecialEffect::EmbestidaEffect),
        Card::new("Crit de guerra", CardType::PhysicalAttack)
            .with_physical_attack(DiceRoll::new(1, 4, 0))
            .with_speed_mod(1)
            .with_effect(SpecialEffect::AllyStrengthThisTurn(2)),
        Card::new("Formació defensiva", CardType::Focus)
            .with_speed_mod(2)
            .with_effect(SpecialEffect::DefenseBoostDuration {
                dice: DiceRoll::new(1, 4, 0),
                turns: 2,
            }),
    ];
    Character::new(name, 3, 3, 0, 2, 2, cards, "Fighter")
}

pub fn create_wizard_naked(name: &str) -> Character {
    let cards = vec![
        Card::new("Pantalla protectora", CardType::Defense)
            .with_defense(DiceRoll::new(1, 6, 0))
            .with_speed_mod(-1)
            .with_effect(SpecialEffect::DefendMultiple(3)),
        Card::new("Bola de foc", CardType::MagicAttack)
            .with_magic_attack(DiceRoll::new(1, 6, 0))
            .with_speed_mod(1),
        Card::new("Raig de gel", CardType::MagicAttack)
            .with_magic_attack(DiceRoll::new(1, 4, 0))
            .with_speed_mod(1)
            .with_effect(SpecialEffect::EnemySpeedDebuff(2)),
        Card::new("Metamorfosi", CardType::Focus)
            .with_speed_mod(-2),
        Card::new("Encantar arma", CardType::Focus)
            .with_speed_mod(2)
            .with_effect(SpecialEffect::EnchantWeapon),
        Card::new("Camp de distorsió", CardType::Focus)
            .with_speed_mod(-1)
            .with_effect(SpecialEffect::TeamSpeedDefenseBoost),
    ];
    Character::new(name, 3, 0, 5, 1, 2, cards, "Wizard")
}

pub fn create_rogue_naked(name: &str) -> Character {
    let cards = vec![
        Card::new("Emboscada coordinada", CardType::Focus)
            .with_speed_mod(4)
            .with_effect(SpecialEffect::CoordinatedAmbush),
        Card::new("Fum cegador", CardType::Focus)
            .with_speed_mod(3)
            .with_effect(SpecialEffect::BlindingSmoke),
        Card::new("Braçals de cuir", CardType::Defense)
            .with_defense(DiceRoll::new(1, 4, 0))
            .with_speed_mod(2),
        Card::new("Ballesta", CardType::PhysicalAttack)
            .with_physical_attack(DiceRoll::new(1, 6, 0))
            .with_speed_mod(3),
        Card::new("Dagues", CardType::PhysicalAttack)
            .with_physical_attack(DiceRoll::new(1, 4, 0))
            .with_speed_mod(3)
            .with_effect(SpecialEffect::MultiTarget(2)),
        Card::new("El·lusió", CardType::Focus)
            .with_speed_mod(3)
            .with_effect(SpecialEffect::DodgeWithSpeedBoost),
        Card::new("Enverinar arma", CardType::Focus)
            .with_speed_mod(0)
            .with_effect(SpecialEffect::PoisonWeapon),
    ];
    Character::new(name, 3, 2, 0, 1, 4, cards, "Rogue")
}

pub fn create_goblin_naked(name: &str) -> Character {
    let cards = vec![
        Card::new("Fúria enfollida", CardType::PhysicalAttack)
            .with_physical_attack(DiceRoll::new(2, 6, 0))
            .with_speed_mod(5)
            .with_effect(SpecialEffect::SkipNextTurns(2)),
        Card::new("Maça de punxes", CardType::PhysicalAttack)
            .with_physical_attack(DiceRoll::new(1, 6, 0))
            .with_speed_mod(1),
        Card::new("Escut de fusta", CardType::Defense)
            .with_defense(DiceRoll::new(1, 6, 0))
            .with_speed_mod(2),
        Card::new("Venjança", CardType::Focus)
            .with_speed_mod(1)
            .with_effect(SpecialEffect::Vengeance),
    ];
    Character::new(name, 3, 2, 0, 1, 3, cards, "Goblin")
}

pub fn create_goblin_shaman_naked(name: &str) -> Character {
    let cards = vec![
        Card::new("Llamp", CardType::MagicAttack)
            .with_magic_attack(DiceRoll::new(2, 4, 0))
            .with_speed_mod(0),
        Card::new("Possessió demoníaca", CardType::Focus)
            .with_speed_mod(-4)
            .with_effect(SpecialEffect::MagicBoost(5)),
        Card::new("Set de sang", CardType::Focus)
            .with_speed_mod(-3)
            .with_effect(SpecialEffect::BloodThirst),
        Card::new("Pluja de flames", CardType::MagicAttack)
            .with_magic_attack(DiceRoll::new(1, 4, -1))
            .with_speed_mod(-1)
            .with_effect(SpecialEffect::MultiTarget(3)),
        Card::new("Absorvir dolor", CardType::Defense)
            .with_defense(DiceRoll::new(1, 4, 0))
            .with_speed_mod(1)
            .with_effect(SpecialEffect::AbsorbPain),
    ];
    Character::new(name, 3, 1, 4, 0, 2, cards, "GoblinShaman")
}

fn run_class_analysis(with_equipment: bool) {
    let label = if with_equipment { "WITH EQUIPMENT" } else { "WITHOUT EQUIPMENT" };
    println!("{}", "=".repeat(60));
    println!("TEAM POWER ANALYSIS - {}", label);
    println!("{}", "=".repeat(60));

    // Build 2v2 team compositions
    let team_comps: Vec<(&str, Vec<fn(&str) -> Character>)> = if with_equipment {
        vec![
            ("Fighter+Wizard", vec![create_fighter, create_wizard]),
            ("Fighter+Rogue", vec![create_fighter, create_rogue]),
            ("Wizard+Rogue", vec![create_wizard, create_rogue]),
            ("Goblin+Shaman", vec![create_goblin, create_goblin_shaman]),
            ("2x Goblin", vec![create_goblin, create_goblin]),
        ]
    } else {
        vec![
            ("Fighter+Wizard", vec![create_fighter_naked, create_wizard_naked]),
            ("Fighter+Rogue", vec![create_fighter_naked, create_rogue_naked]),
            ("Wizard+Rogue", vec![create_wizard_naked, create_rogue_naked]),
            ("Goblin+Shaman", vec![create_goblin_naked, create_goblin_shaman_naked]),
            ("2x Goblin", vec![create_goblin_naked, create_goblin_naked]),
        ]
    };

    println!("\n2v2 Win Rates (row vs column):\n");

    // Header
    print!("{:15}", "");
    for (name, _) in &team_comps {
        print!("{:>15}", name);
    }
    println!();
    println!("{}", "-".repeat(90));

    let mut total_wins: HashMap<&str, u32> = HashMap::new();
    let mut total_games: HashMap<&str, u32> = HashMap::new();

    for (name1, creators1) in &team_comps {
        print!("{:15}", name1);
        for (name2, creators2) in &team_comps {
            if name1 == name2 {
                print!("{:>15}", "-");
                continue;
            }

            let results = run_simulation(creators1, creators2, 500, false);
            let win_rate = results.team1_win_rate();
            print!("{:>14.1}%", win_rate);

            *total_wins.entry(name1).or_insert(0) += results.team1_wins;
            *total_games.entry(name1).or_insert(0) += 500;
            *total_wins.entry(name2).or_insert(0) += results.team2_wins;
            *total_games.entry(name2).or_insert(0) += 500;
        }
        println!();
    }

    println!("\n{}", "=".repeat(60));
    println!("OVERALL TEAM POWER RANKING - {}", label);
    println!("{}", "=".repeat(60));

    let mut rankings: Vec<(&str, f32)> = team_comps
        .iter()
        .map(|(name, _)| {
            let wins = *total_wins.get(name).unwrap_or(&0) as f32;
            let games = *total_games.get(name).unwrap_or(&1) as f32;
            (*name, wins / games * 100.0)
        })
        .collect();

    rankings.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());

    for (i, (name, win_rate)) in rankings.iter().enumerate() {
        let bar_len = (win_rate / 2.0) as usize;
        let bar: String = "█".repeat(bar_len);
        println!("{}. {:15} {:5.1}% {}", i + 1, name, win_rate, bar);
    }
}

fn print_card_stats(stats: &CombatStats) {
    println!("\n{}", "=".repeat(60));
    println!("CARD TYPE EFFECTIVENESS");
    println!("{}", "=".repeat(60));
    println!("{:20} {:>8} {:>10} {:>12} {:>10}", "Type", "Plays", "By Winner", "Win Corr.", "Interrupt%");
    println!("{}", "-".repeat(60));

    let mut type_stats: Vec<_> = stats.card_type_stats.iter().collect();
    type_stats.sort_by(|a, b| b.1.plays.cmp(&a.1.plays));

    for (card_type, card_stats) in &type_stats {
        let win_correlation = if card_stats.plays > 0 {
            (card_stats.plays_by_winner as f32 / card_stats.plays as f32) * 100.0
        } else {
            0.0
        };
        let interrupt_rate = if card_stats.plays > 0 {
            (card_stats.interrupted as f32 / card_stats.plays as f32) * 100.0
        } else {
            0.0
        };
        println!(
            "{:20} {:>8} {:>10} {:>11.1}% {:>9.1}%",
            card_type, card_stats.plays, card_stats.plays_by_winner, win_correlation, interrupt_rate
        );
    }

    println!("\n{}", "=".repeat(80));
    println!("INDIVIDUAL CARD EFFECTIVENESS");
    println!("{}", "=".repeat(80));
    println!("{:25} {:>8} {:>10} {:>12} {:>10}", "Card", "Plays", "By Winner", "Win Corr.", "Interrupt%");
    println!("{}", "-".repeat(80));

    let mut card_stats_vec: Vec<_> = stats.card_stats.iter().collect();
    card_stats_vec.sort_by(|a, b| b.1.plays.cmp(&a.1.plays));

    for (card_name, card_stats) in &card_stats_vec {
        let win_correlation = if card_stats.plays > 0 {
            (card_stats.plays_by_winner as f32 / card_stats.plays as f32) * 100.0
        } else {
            0.0
        };
        let interrupt_rate = if card_stats.plays > 0 {
            (card_stats.interrupted as f32 / card_stats.plays as f32) * 100.0
        } else {
            0.0
        };
        println!(
            "{:25} {:>8} {:>10} {:>11.1}% {:>9.1}%",
            card_name, card_stats.plays, card_stats.plays_by_winner, win_correlation, interrupt_rate
        );
    }
}

fn run_card_analysis() {
    println!("\n{}", "=".repeat(60));
    println!("CARD USAGE ANALYSIS - 2v2 BATTLES (5000 battles)");
    println!("{}", "=".repeat(60));

    // Run 2v2 battles to see team coordination
    let team_comps: Vec<(fn(&str) -> Character, fn(&str) -> Character)> = vec![
        (create_fighter, create_wizard),
        (create_fighter, create_rogue),
        (create_wizard, create_rogue),
        (create_goblin, create_goblin_shaman),
    ];

    let mut total_stats = CombatStats::default();

    // Run team vs team matchups
    for (creator1a, creator1b) in &team_comps {
        for (creator2a, creator2b) in &team_comps {
            let results = run_simulation(
                &[*creator1a, *creator1b],
                &[*creator2a, *creator2b],
                300,
                false
            );
            total_stats.merge(&results.stats);
        }
    }

    print_card_stats(&total_stats);
}

fn main() {
    println!("{}", "=".repeat(60));
    println!("PIM PAM PUM COMBAT SIMULATION ENGINE");
    println!("{}", "=".repeat(60));

    // Run card analysis first
    run_card_analysis();

    println!("\n");

    // Run class analysis with equipment only (for brevity)
    run_class_analysis(true);
}
