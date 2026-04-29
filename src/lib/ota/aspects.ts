export const CORE_ASPECTS = [
  { key: 'cleanliness', label: 'Cleanliness' },
  { key: 'staff',       label: 'Staff & Service' },
  { key: 'food',        label: 'Food & Dining' },
  { key: 'location',    label: 'Location' },
  { key: 'value',       label: 'Value for Money' },
  { key: 'comfort',     label: 'Comfort & Room' },
  { key: 'facilities',  label: 'Facilities & Amenities' },
] as const

export type CoreAspectKey = (typeof CORE_ASPECTS)[number]['key']
export const CORE_ASPECT_KEYS = CORE_ASPECTS.map((a) => a.key) as CoreAspectKey[]
