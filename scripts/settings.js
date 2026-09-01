import {
  DEFAULT_BASE_URL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_SECONDS,
  IMAGE_QUALITIES,
  IMAGE_SIZES,
  MODULE_ID,
  OPENAI_MODELS,
  SETTINGS,
} from './constants.js';

/**
 * A string setting that renders as a password field.
 *
 * Not encryption and does not pretend to be: it stops the key being read over
 * a shoulder, caught in a screen share, or left legible in a screenshot of the
 * settings page, which is the realistic way a key gets seen.
 */
class SecretStringField extends foundry.data.fields.StringField {
  _toInput(config) {
    const input = super._toInput(config);
    if (input?.tagName === 'INPUT') {
      input.type = 'password';
      input.autocomplete = 'off';
      input.spellcheck = false;
    }
    return input;
  }
}

export function registerSettings() {
  /*
   * Client scope, and it matters. `restricted: true` only stops a player
   * *editing* a setting: Foundry's server sends every world Setting document
   * to every client on join with no filter on role, so a world-scoped key
   * would sit readable in every player's browser console. Client scope keeps
   * it in this browser's storage and off the wire entirely. The cost is each
   * GM enters it once per browser - the right trade for a credential that
   * bills someone.
   */
  game.settings.register(MODULE_ID, SETTINGS.apiKey, {
    name: 'MCC.Settings.ApiKey.Name',
    hint: 'MCC.Settings.ApiKey.Hint',
    scope: 'client',
    config: true,
    restricted: true,
    type: new SecretStringField({ required: true, blank: true, initial: '' }),
    default: '',
  });

  game.settings.register(MODULE_ID, SETTINGS.model, {
    name: 'MCC.Settings.Model.Name',
    hint: 'MCC.Settings.Model.Hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: String,
    default: DEFAULT_MODEL,
    choices: OPENAI_MODELS,
  });

  game.settings.register(MODULE_ID, SETTINGS.modelOverride, {
    name: 'MCC.Settings.ModelOverride.Name',
    hint: 'MCC.Settings.ModelOverride.Hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: String,
    default: '',
  });

  game.settings.register(MODULE_ID, SETTINGS.baseUrl, {
    name: 'MCC.Settings.BaseUrl.Name',
    hint: 'MCC.Settings.BaseUrl.Hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: String,
    default: DEFAULT_BASE_URL,
  });

  // Deliberately a String, not a NumberField: Foundry's settings form submits
  // an empty number input as NaN, which no nullable NumberField can validate,
  // and that breaks saving the whole settings sheet. Blank means "omit
  // temperature"; parsing happens at request time.
  game.settings.register(MODULE_ID, SETTINGS.temperature, {
    name: 'MCC.Settings.Temperature.Name',
    hint: 'MCC.Settings.Temperature.Hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: String,
    default: '',
  });

  game.settings.register(MODULE_ID, SETTINGS.requestTimeout, {
    name: 'MCC.Settings.Timeout.Name',
    hint: 'MCC.Settings.Timeout.Hint',
    scope: 'client',
    config: true,
    restricted: true,
    // String for the same NaN reason as temperature.
    type: String,
    default: String(DEFAULT_TIMEOUT_SECONDS),
  });

  // What this GM has spent, kept beside the key it is spent with and client
  // scope for the same reason the key is.
  game.settings.register(MODULE_ID, SETTINGS.spend, {
    scope: 'client',
    config: false,
    restricted: true,
    type: Object,
    default: { requests: 0, inputTokens: 0, outputTokens: 0, cost: 0 },
  });

  game.settings.register(MODULE_ID, SETTINGS.imageModel, {
    name: 'MCC.Settings.ImageModel.Name',
    hint: 'MCC.Settings.ImageModel.Hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: String,
    default: DEFAULT_IMAGE_MODEL,
  });

  game.settings.register(MODULE_ID, SETTINGS.imageSize, {
    name: 'MCC.Settings.ImageSize.Name',
    hint: 'MCC.Settings.ImageSize.Hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: String,
    default: '1024x1024',
    choices: IMAGE_SIZES,
  });

  game.settings.register(MODULE_ID, SETTINGS.imageQuality, {
    name: 'MCC.Settings.ImageQuality.Name',
    hint: 'MCC.Settings.ImageQuality.Hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: String,
    default: 'auto',
    choices: IMAGE_QUALITIES,
  });

  game.settings.register(MODULE_ID, SETTINGS.outputLanguage, {
    name: 'MCC.Settings.OutputLanguage.Name',
    hint: 'MCC.Settings.OutputLanguage.Hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: String,
    default: '',
  });
}
