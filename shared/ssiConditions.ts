export const conditionOptions = {
  weather: { label: 'Weather', qr: 'var_weather_id', values: [[1, 'Cloudless'], [2, 'Cloudy'], [3, 'Rainy'], [121, 'Snow']] },
  entry: { label: 'Entry', qr: 'var_entry_id', values: [[21, 'Shore / beach'], [22, 'Boat'], [35, 'Other']] },
  bodyOfWater: { label: 'Body of water', qr: 'var_water_body_id', values: [[13, 'Ocean'], [14, 'River'], [15, 'Quarry'], [16, 'Lake'], [17, 'Indoor'], [54, 'Open water']] },
  current: { label: 'Current', qr: 'var_current_id', values: [[6, 'No current'], [7, 'Light'], [8, 'Strong'], [9, 'Ripping']] },
  surface: { label: 'Surface condition', qr: 'var_surface_id', values: [[10, 'Calm'], [11, 'Moving'], [12, 'Stormy']] },
  purpose: { label: 'Purpose', qr: 'var_divetype_id', values: [[23, 'Training'], [24, 'Fun dive'], [138, 'Scientific'], [139, 'Work']] }
} as const;
export type ConditionField = keyof typeof conditionOptions;
export type SsiConditions = Partial<Record<ConditionField, number | null>>;
export const defaultSsiConditions: Readonly<SsiConditions> = { weather: 1, entry: 22, bodyOfWater: 13, current: 7, surface: 11, purpose: 24 };
export const conditionFields = Object.keys(conditionOptions) as ConditionField[];
export function validateSsiConditions(value: unknown): asserts value is SsiConditions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid SSI conditions.');
  for (const [key, id] of Object.entries(value)) {
    if (!conditionFields.includes(key as ConditionField) || (id !== null && !conditionOptions[key as ConditionField].values.some(([n]) => n === id))) throw new Error('Invalid SSI condition choice.');
  }
}
export function resolveSsiConditions(source?: SsiConditions, overrides?: SsiConditions, defaults?: SsiConditions): SsiConditions {
  for (const value of [source, overrides, defaults]) if (value !== undefined) validateSsiConditions(value);
  return { ...defaultSsiConditions, ...defaults, ...source, ...overrides };
}
export function conditionLabel(field: ConditionField, value: number | null | undefined): string {
  return conditionOptions[field].values.find(([id]) => id === value)?.[1] ?? 'Leave blank';
}
