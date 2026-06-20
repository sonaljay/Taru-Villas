export type WasteCategoryKey =
  | 'paperKg'
  | 'glassKg'
  | 'plasticKg'
  | 'foodKg'
  | 'metalKg'
  | 'electronicKg'

export const WASTE_CATEGORIES: readonly { key: WasteCategoryKey; label: string }[] = [
  { key: 'paperKg', label: 'Paper' },
  { key: 'glassKg', label: 'Glass' },
  { key: 'plasticKg', label: 'Polythene & Plastic' },
  { key: 'foodKg', label: 'Food' },
  { key: 'metalKg', label: 'Metal' },
  { key: 'electronicKg', label: 'Electronic Waste' },
] as const
