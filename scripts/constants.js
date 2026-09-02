export const MODULE_ID = 'matadragones-character-creator';

/** Setting keys. All are API configuration; creature data becomes Actors. */
export const SETTINGS = {
  apiKey: 'openaiApiKey',
  model: 'openaiModel',
  modelOverride: 'openaiModelOverride',
  baseUrl: 'openaiBaseUrl',
  temperature: 'openaiTemperature',
  requestTimeout: 'openaiRequestTimeout',
  spend: 'openaiSpend',
  imageModel: 'openaiImageModel',
  imageSize: 'openaiImageSize',
  imageQuality: 'openaiImageQuality',
  outputLanguage: 'outputLanguage',
  tokenRing: 'tokenRing',
};

/**
 * Models offered in the settings dropdown. The override setting lets a GM type
 * any model id, so this list only needs to cover the common picks.
 */
export const OPENAI_MODELS = {
  'gpt-5.6-sol': 'MCC.Models.Sol',
  'gpt-5.6-terra': 'MCC.Models.Terra',
  'gpt-5.6-luna': 'MCC.Models.Luna',
};

export const DEFAULT_MODEL = 'gpt-5.6-terra';
export const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_IMAGE_MODEL = 'gpt-image-2';

/** Seconds before a generation is abandoned. Cancellation still works under it. */
export const DEFAULT_TIMEOUT_SECONDS = 120;

/**
 * One automatic retry, because a Structured Outputs answer that will not parse
 * has already been paid for and is usually transient. Anything worse than
 * transient fails the same way it did before.
 */
export const RETRY_ATTEMPTS = 1;

/**
 * Rough USD per million tokens, for telling a GM what a generation cost.
 * Labelled an estimate everywhere it surfaces; an unlisted model reports
 * tokens without a figure rather than inventing one.
 */
export const MODEL_PRICES = {
  'gpt-5.6-sol': { input: 1.25, output: 10 },
  'gpt-5.6-terra': { input: 0.25, output: 2 },
  'gpt-5.6-luna': { input: 0.05, output: 0.4 },
};

export const IMAGE_SIZES = {
  '1024x1024': 'MCC.Image.SizeSquare',
  '1536x1024': 'MCC.Image.SizeLandscape',
  '1024x1536': 'MCC.Image.SizePortrait',
};

export const IMAGE_QUALITIES = {
  auto: 'MCC.Image.QualityAuto',
  low: 'MCC.Image.QualityLow',
  medium: 'MCC.Image.QualityMedium',
  high: 'MCC.Image.QualityHigh',
};

/** PF2e creature sizes as the system stores them. */
export const SIZES = {
  tiny: 'MCC.Size.Tiny',
  sm: 'MCC.Size.Small',
  med: 'MCC.Size.Medium',
  lg: 'MCC.Size.Large',
  huge: 'MCC.Size.Huge',
  grg: 'MCC.Size.Gargantuan',
};

export const RARITIES = {
  common: 'MCC.Rarity.Common',
  uncommon: 'MCC.Rarity.Uncommon',
  rare: 'MCC.Rarity.Rare',
  unique: 'MCC.Rarity.Unique',
};

/** Skills a creature can carry, as pf2e names them. */
export const PF2E_SKILLS = [
  'acrobatics',
  'arcana',
  'athletics',
  'crafting',
  'deception',
  'diplomacy',
  'intimidation',
  'medicine',
  'nature',
  'occultism',
  'performance',
  'religion',
  'society',
  'stealth',
  'survival',
  'thievery',
];

/** pf2e damage type slugs the converter is allowed to emit. */
export const DAMAGE_TYPES = [
  'acid',
  'bludgeoning',
  'cold',
  'electricity',
  'fire',
  'force',
  'mental',
  'piercing',
  'poison',
  'slashing',
  'sonic',
  'spirit',
  'untyped',
  'vitality',
  'void',
];
