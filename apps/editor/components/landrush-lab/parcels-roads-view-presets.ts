export type ParcelsRoadsViewId =
  | 'network'
  | 'owner-entry'
  | 'road-hug'
  | 'sidewalks'
  | 'parcel-grid'

export type ParcelsRoadsViewPreset = {
  id: ParcelsRoadsViewId
  label: string
  camera: {
    position: [number, number, number]
    target: [number, number, number]
    zoom: number
  }
}

export const PARCELS_ROADS_VIEW_PRESETS: readonly ParcelsRoadsViewPreset[] = [
  {
    id: 'network',
    label: 'Road Network',
    camera: { position: [82, 92, 82], target: [0, 0, 0], zoom: 8.1 },
  },
  {
    id: 'owner-entry',
    label: 'Owner Entry',
    camera: { position: [36, 54, 64], target: [-6, 0, 13], zoom: 13.5 },
  },
  {
    id: 'road-hug',
    label: 'Road Hug Band',
    camera: { position: [66, 42, 38], target: [0, 0, 0], zoom: 12.2 },
  },
  {
    id: 'sidewalks',
    label: 'Sidewalk Pairing',
    camera: { position: [-66, 48, 44], target: [-5, 0, 2], zoom: 11.5 },
  },
  {
    id: 'parcel-grid',
    label: 'Parcel Grid',
    camera: { position: [0, 122, 0.01], target: [0, 0, 0], zoom: 10.1 },
  },
]

export function getParcelsRoadsViewPreset(value: string | null): ParcelsRoadsViewPreset {
  return (
    PARCELS_ROADS_VIEW_PRESETS.find((preset) => preset.id === value) ??
    PARCELS_ROADS_VIEW_PRESETS[0]!
  )
}
