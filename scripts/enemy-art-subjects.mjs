/**
 * Per paint id: English silhouette line for WoW/WC3-inspired unit + pose.
 * Keys must match EnemyPaintKind / filenames public/assets/enemies/<id>.png
 */
export const ENEMY_ART_SUBJECTS = {
  grunt: `Classic RTS orc footman grunt: stocky green-brown skin, small tusks, crude leather and metal armor, one-handed cleaver or axe, three-quarters view facing viewer's right, standing.`,
  dread_warrior: `Undead footman: gray-blue plate on skeletal frame, twin ghostly swords at sides, red chest rune, three-quarters facing right, standing.`,
  raider: `Orc wolf rider without mount shown as compact raider: wolf-pelt hood, curved weapon to the side, three-quarters facing right, dynamic stance.`,
  beserker: `Berserker orc: twin upward axes, red fur and angry pose, bare muscular torso with straps, three-quarters facing right.`,
  kodo: `Huge kodo beast: wide armored back, twin blunt horns, tribal howdah hint, four legs, side view facing right, fills frame low.`,
  ultralisk: `Zerg-like ultralisk: purple chitin plates, twin scythe blades on back, heavy low body, three-quarters facing right.`,
  abomination: `Abomination undead brute: green bloated body, twin small heads or growths, cleaver hooks on sides, three-quarters facing right.`,
  headhunter: `Troll headhunter: slim torso, tall mohawk, throwing spear raised, three-quarters facing right.`,
  darkspear: `Troll spear hunter: teal-tribal paint, long spear forward, lean, three-quarters facing right.`,
  shaman: `Orc shaman: totemic staff straight up, fur shoulder, glowing orb or fetish, robes, three-quarters facing right.`,
  batrider: `Goblin bat rider compact: small rider on bat wings silhouette, lance to the side, three-quarters facing right.`,
  catapult: `Siege catapult war machine: wooden arm, stone bucket, two wheels, compact side view facing right, no crew detail clutter.`,
  wolf: `Dire wolf beast: purple-furred muscular wolf, bared fangs, no rider, side-three-quarters facing right, aggressive stance.`,
  mirror: `Mirror image purple construct: symmetric shoulder pads, eerie face, magical duplicate vibe, three-quarters facing right.`,
  boss_farseer: `Orc farseer boss: tall shaman regalia, lightning staff, spirit wisps or radial sparks, imposing, three-quarters facing right.`,
  boss_tauren: `Tauren chieftain boss: huge minotaur-like torso, totem on back, war drums belt, three-quarters facing right.`,
  boss_blademaster: `Blademaster orc boss: samurai-like wide hat optional, crimson armor, long curved blade forward, three-quarters facing right.`,
};

export const ALL_ENEMY_PAINT_IDS = Object.keys(ENEMY_ART_SUBJECTS);
