/**
 * Spell names as the remaster prints them.
 *
 * Imported ability prose names spells the source game's way, and the legacy
 * PF2e names many of them share were renamed by the remaster. The AI rewrite
 * cannot be trusted to know the list, so it lives here as data and is applied
 * deterministically - including over the AI's output.
 *
 * Two vocabularies feed one map: legacy PF2e names -> their remaster renames
 * (the published conversion list), plus the handful of 5th-edition spell
 * names whose PF2e equivalent is solid enough to state (charm person is
 * charm; cure wounds is heal). Anything arguable is deliberately absent -
 * a wrong rename is worse than a flagged unknown, and the provenance note
 * already tells the GM to review spell lists by hand.
 */
export const SPELL_RENAMES = {
  // Legacy PF2e -> remaster.
  'acid arrow': 'acid grip',
  'acid splash': 'caustic blast',
  'baleful polymorph': 'cursed metamorphosis',
  'blink': 'flicker',
  'burning hands': 'breathe fire',
  'calm emotions': 'calm',
  'chill touch': 'void warp',
  'color spray': 'dizzying colors',
  'comprehend language': 'translate',
  'crushing despair': 'wave of despair',
  'dimension door': 'translocate',
  'disrupt undead': 'vitality lash',
  'expeditious retreat': 'fleet step',
  'faerie fire': 'revealing light',
  'flesh to stone': 'petrify',
  'freedom of movement': 'unfettered movement',
  'gaseous form': 'vapor form',
  'ghost sound': 'figment',
  'hideous laughter': 'laughing fit',
  'know direction': 'know the way',
  'longstrider': 'tailwind',
  'mage armor': 'mystic armor',
  'mage hand': 'telekinetic hand',
  'magic fang': 'runic body',
  'magic missile': 'force barrage',
  'magic mouth': 'embed message',
  'magic weapon': 'runic weapon',
  'nondetection': 'veil of privacy',
  'obscuring mist': 'mist',
  'phantasmal killer': 'vision of death',
  'produce flame': 'ignition',
  'ray of enfeeblement': 'enfeeble',
  'remove curse': 'cleanse affliction',
  'remove disease': 'cleanse affliction',
  'scorching ray': 'blazing bolt',
  'see invisibility': 'see the unseen',
  'sound burst': 'noise blast',
  'spider climb': 'gecko grip',
  'stoneskin': 'mountain resilience',
  'tanglefoot': 'tangle vine',
  'touch of idiocy': 'stupefy',
  'true strike': 'sure strike',
  'unseen servant': 'phantasmal minion',
  'vampiric exsanguination': 'vampiric maelstrom',
  'vampiric touch': 'vampiric feast',

  // 5th-edition names with an unambiguous PF2e counterpart.
  'charm person': 'charm',
  'cure wounds': 'heal',
  'disguise self': 'illusory disguise',
  'hold person': 'paralyze',
  'inflict wounds': 'harm',
  'misty step': 'translocate',
};

// Longest first, so "vampiric exsanguination" is never half-eaten by
// "vampiric touch" failing to match and something shorter succeeding oddly.
const PATTERN = new RegExp(
  `\\b(${Object.keys(SPELL_RENAMES)
    .sort((a, b) => b.length - a.length)
    .join('|')})\\b`,
  'gi',
);

/** Rewrite known spell names in prose, preserving a leading capital. */
export function modernizeSpellNames(text) {
  return String(text ?? '').replace(PATTERN, (match) => {
    const replacement = SPELL_RENAMES[match.toLowerCase()];
    return match[0] === match[0].toUpperCase()
      ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
      : replacement;
  });
}
