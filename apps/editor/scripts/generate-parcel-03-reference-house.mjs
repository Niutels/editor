import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const workspace = resolve(import.meta.dirname, '../../..')
const downloads = 'C:/Users/briss/Downloads'
const baseReportPath = resolve(downloads, 'landrush-bug-report_2026-08-14_15-12-19-060.json')
const openingReportPath = resolve(downloads, 'landrush-bug-report_2026-08-14_15-28-22-799.json')
const referencePaths = [
  resolve(downloads, 'layout_2026-08-13.json'),
  resolve(downloads, 'layout_2026-08-13 (1).json'),
  resolve(downloads, 'layout_2026-08-13 (2).json'),
]
const reportPath = resolve(
  workspace,
  'apps/editor/public/landrush-debug/parcel-03-reference-house.json',
)
const auditPath = resolve(
  workspace,
  'apps/editor/public/landrush-debug/parcel-03-reference-house-audit.json',
)

const clone = (value) => structuredClone(value)
const nearly = (a, b) => Math.abs(a - b) < 1e-6
const pointIs = (point, x, z) => nearly(point[0], x) && nearly(point[1], z)
const segmentIs = (wall, ax, az, bx, bz) =>
  (pointIs(wall.start, ax, az) && pointIs(wall.end, bx, bz)) ||
  (pointIs(wall.start, bx, bz) && pointIs(wall.end, ax, az))
const segmentLength = (wall) => Math.hypot(
  wall.end[0] - wall.start[0],
  wall.end[1] - wall.start[1],
)
const distanceFromWallStart = (wall, x, z) => Math.hypot(x - wall.start[0], z - wall.start[1])
const polygonArea = (polygon) => Math.abs(
  polygon.reduce((sum, [x, z], index) => {
    const [nextX, nextZ] = polygon[(index + 1) % polygon.length]
    return sum + x * nextZ - nextX * z
  }, 0),
) / 2
const polygonCenter = (polygon) => polygon.reduce(
  ([sumX, sumZ], [x, z]) => [sumX + x / polygon.length, sumZ + z / polygon.length],
  [0, 0],
)

const baseReport = JSON.parse(await readFile(baseReportPath, 'utf8'))
const openingReport = JSON.parse(await readFile(openingReportPath, 'utf8'))
const referenceLayouts = await Promise.all(
  referencePaths.map(async (path) => JSON.parse(await readFile(path, 'utf8'))),
)
const referenceItems = referenceLayouts.flatMap((layout) =>
  Object.values(layout.nodes).filter((node) => node.type === 'item'),
)
const templateByName = (name) => {
  const template = referenceItems.find((node) => node.name === name)
  if (!template) throw new Error(`Missing reference item template: ${name}`)
  return template
}

const report = clone(baseReport)
const build = report.save.builds.find((candidate) => candidate.parcelId === 'parcel-03')
const openingBuild = openingReport.save.builds.find(
  (candidate) => candidate.parcelId === 'parcel-03',
)
if (!build || !openingBuild) throw new Error('Parcel-03 build snapshot is missing.')

const geometryNodes = build.nodes.filter((node) =>
  node.type === 'wall' || node.type === 'slab' || node.type === 'ceiling',
)
const walls = geometryNodes.filter((node) => node.type === 'wall')
const wall = (...coordinates) => {
  const match = walls.find((candidate) => segmentIs(candidate, ...coordinates))
  if (!match) throw new Error(`Missing wall ${coordinates.join(', ')}`)
  return match
}

const south = wall(-8.5, -15.5, 1.5, -15.5)
const north = wall(-8.5, -0.5, 1.5, -0.5)
const west = wall(-8.5, -0.5, -8.5, -15.5)
const east = wall(1.5, -15.5, 1.5, -0.5)
const spine = wall(-4.5, -15.5, -4.5, -0.5)
const bedroomOneDivider = wall(-8.5, -11, -4.5, -11)
const bedroomTwoDivider = wall(-8.5, -7.5, -4.5, -7.5)
const kitchenDivider = wall(-4.5, -8, 1.5, -8)

const slabs = geometryNodes.filter((node) => node.type === 'slab' && node.autoFromWalls)
const ceilings = geometryNodes.filter((node) => node.type === 'ceiling' && node.autoFromWalls)
const roomDefinitions = [
  {
    name: 'Bedroom 1',
    center: [-6.5, -13.25],
    floor: 'library:wood-hungarianparquet2',
  },
  {
    name: 'Bathroom',
    center: [-6.5, -9.25],
    floor: 'library:flooring-pooltiles',
  },
  {
    name: 'Bedroom 2',
    center: [-6.5, -4],
    floor: 'library:wood-squareparquet23',
  },
  {
    name: 'Living Room',
    center: [-1.5, -11.75],
    floor: 'library:wood-finewood27',
  },
  {
    name: 'Kitchen / Dining',
    center: [-1.5, -4.25],
    floor: 'library:flooring-rusticbrick',
  },
]
const nearestRoom = (polygon) => {
  const [x, z] = polygonCenter(polygon)
  return roomDefinitions.reduce((best, candidate) => {
    const distance = Math.hypot(x - candidate.center[0], z - candidate.center[1])
    return distance < best.distance ? { candidate, distance } : best
  }, { candidate: roomDefinitions[0], distance: Number.POSITIVE_INFINITY }).candidate
}
for (const slab of slabs) {
  const room = nearestRoom(slab.polygon)
  slab.name = `${room.name} Slab`
  slab.slots = { surface: room.floor }
  slab.metadata = { ...slab.metadata, roomFunction: room.name }
}
for (const ceiling of ceilings) {
  const room = nearestRoom(ceiling.polygon)
  ceiling.name = `${room.name} Ceiling`
  ceiling.metadata = { ...ceiling.metadata, roomFunction: room.name }
}

const doorTemplate = openingBuild.nodes.find((node) => node.type === 'door')
const windowTemplate = openingBuild.nodes.find((node) => node.type === 'window')
if (!doorTemplate || !windowTemplate) throw new Error('Opening templates are missing.')

const openings = []
const addDoor = (id, name, host, x, z, options = {}) => {
  const node = clone(doorTemplate)
  const distance = distanceFromWallStart(host, x, z)
  Object.assign(node, {
    id,
    name,
    parentId: host.id,
    wallId: host.id,
    width: options.width ?? 0.9,
    height: 2.1,
    position: [distance, 1.05, 0],
    rotation: [0, 0, 0],
    operationState: options.operationState ?? 0.35,
    openingKind: 'door',
    doorType: 'hinged',
    doorCategory: 'interior',
    side: options.side ?? 'front',
    metadata: {
      ...node.metadata,
      wallT: distance / segmentLength(host),
      circulation: options.circulation,
    },
  })
  openings.push(node)
  host.children = [...new Set([...(host.children ?? []), id])]
}
const addWindow = (id, name, host, x, z, options = {}) => {
  const node = clone(windowTemplate)
  const distance = distanceFromWallStart(host, x, z)
  Object.assign(node, {
    id,
    name,
    parentId: host.id,
    wallId: host.id,
    width: options.width ?? 1.5,
    height: options.height ?? 1.5,
    position: [distance, options.centerY ?? 1.45, 0],
    rotation: [0, 0, 0],
    windowType: options.fixed ? 'fixed' : 'casement',
    casementStyle: 'single',
    operationState: options.fixed ? 0 : 0.45,
    openingKind: 'window',
    side: options.side ?? 'front',
    metadata: {
      ...node.metadata,
      wallT: distance / segmentLength(host),
      roomFunction: options.room,
    },
  })
  openings.push(node)
  host.children = [...new Set([...(host.children ?? []), id])]
}

addDoor('door_json_entry', 'Exterior Entry', south, -1.5, -15.5, {
  circulation: 'Exterior -> Living Room',
  operationState: 0.2,
})
addDoor('door_json_bedroom_1', 'Bedroom 1 Door', spine, -4.5, -13.25, {
  circulation: 'Living Room -> Bedroom 1',
})
addDoor('door_json_bathroom', 'Bathroom Door', spine, -4.5, -9.25, {
  circulation: 'Living Room -> Bathroom',
})
addDoor('door_json_kitchen', 'Kitchen Door', kitchenDivider, -1.5, -8, {
  circulation: 'Living Room -> Kitchen / Dining',
})
addDoor('door_json_bedroom_2', 'Bedroom 2 Door', spine, -4.5, -4, {
  circulation: 'Kitchen / Dining -> Bedroom 2',
})

addWindow('window_json_bedroom_1', 'Bedroom 1 Casement', west, -8.5, -13.25, {
  room: 'Bedroom 1',
})
addWindow('window_json_bathroom', 'Bathroom Privacy Casement', west, -8.5, -9.25, {
  room: 'Bathroom',
  width: 0.9,
  height: 0.8,
  centerY: 1.75,
})
addWindow('window_json_bedroom_2', 'Bedroom 2 Casement', west, -8.5, -4, {
  room: 'Bedroom 2',
})
addWindow('window_json_living_east', 'Living Room Fixed Window', east, 1.5, -11.75, {
  room: 'Living Room',
  fixed: true,
  width: 1.8,
})
addWindow('window_json_living_south', 'Living Room Picture Window', south, 0.25, -15.5, {
  room: 'Living Room',
  fixed: true,
  width: 1.5,
})
addWindow('window_json_kitchen', 'Kitchen Casement', east, 1.5, -4, {
  room: 'Kitchen / Dining',
})

const items = []
const addItem = (name, id, position, rotation, options = {}) => {
  const node = clone(templateByName(name))
  Object.assign(node, {
    id,
    name: options.label ?? name,
    parentId: options.parentId ?? 'level_landrush-island-debug',
    position,
    rotation,
    scale: options.scale ?? [1, 1, 1],
    children: [],
    visible: true,
    metadata: {
      ...node.metadata,
      roomFunction: options.room,
      referenceInspired: true,
    },
  })
  items.push(node)
  return node
}

addItem('Double Bed', 'item_json_bed_1', [-6.5, 0, -13.65], [0, 0, 0], {
  room: 'Bedroom 1',
})
addItem('Bedside Table', 'item_json_bedside_1a', [-7.65, 0, -14.45], [0, 0, 0], {
  room: 'Bedroom 1',
})
addItem('Bedside Table', 'item_json_bedside_1b', [-5.35, 0, -14.45], [0, 0, 0], {
  room: 'Bedroom 1',
})
addItem('Closet', 'item_json_closet_1', [-7.25, 0, -11.45], [0, 0, 0], {
  room: 'Bedroom 1',
  scale: [0.85, 1, 1],
})

addItem('Double Bed', 'item_json_bed_2', [-6.5, 0, -2.25], [0, Math.PI, 0], {
  room: 'Bedroom 2',
})
addItem('Bedside Table', 'item_json_bedside_2a', [-7.65, 0, -1.45], [0, Math.PI, 0], {
  room: 'Bedroom 2',
})
addItem('Bedside Table', 'item_json_bedside_2b', [-5.35, 0, -1.45], [0, Math.PI, 0], {
  room: 'Bedroom 2',
})
addItem('Closet', 'item_json_closet_2', [-7.2, 0, -7.05], [0, 0, 0], {
  room: 'Bedroom 2',
  scale: [0.85, 1, 1],
})

addItem('Bathtub', 'item_json_bathtub', [-7.25, 0, -10.25], [0, 0, 0], {
  room: 'Bathroom',
  scale: [0.78, 1, 0.78],
})
addItem('Toilet', 'item_json_toilet', [-5.25, 0, -10.15], [0, 0, 0], {
  room: 'Bathroom',
})
addItem('Bathroom Sink', 'item_json_sink', [-6.55, 0, -8.05], [0, Math.PI, 0], {
  room: 'Bathroom',
  scale: [0.7, 0.8, 0.75],
})

addItem('Big Rug', 'item_json_living_rug', [-1.5, 0.015, -11.75], [0, 0, 0], {
  room: 'Living Room',
  scale: [1.15, 1, 1.15],
})
addItem('Sofa', 'item_json_sofa', [-1.5, 0, -13.35], [0, 0, 0], {
  room: 'Living Room',
})
addItem('Coffee Table', 'item_json_coffee_table', [-1.5, 0, -11.75], [0, 0, 0], {
  room: 'Living Room',
  scale: [0.85, 1, 0.85],
})
addItem('Livingroom Chair', 'item_json_chair_l', [-3.35, 0, -11.65], [0, Math.PI / 2, 0], {
  room: 'Living Room',
})
addItem('Livingroom Chair', 'item_json_chair_r', [0.35, 0, -11.65], [0, -Math.PI / 2, 0], {
  room: 'Living Room',
})
const tvStand = addItem('TV Stand', 'item_json_tv_stand', [-1.5, 0, -9.15], [0, Math.PI, 0], {
  room: 'Living Room',
  scale: [1.15, 1, 1],
})
const television = addItem('Television', 'item_json_television', [0, 0.42, 0], [0, 0, 0], {
  room: 'Living Room',
  parentId: tvStand.id,
  scale: [0.85, 0.85, 0.85],
})
tvStand.children = [television.id]

addItem('Kitchen', 'item_json_kitchen_run', [-2.75, 0, -1.15], [0, 0, 0], {
  room: 'Kitchen / Dining',
})
addItem('Fridge', 'item_json_fridge', [1.05, 0, -1.15], [0, 0, 0], {
  room: 'Kitchen / Dining',
})
addItem('Stove', 'item_json_stove', [-0.7, 0, -1.15], [0, 0, 0], {
  room: 'Kitchen / Dining',
})
addItem('Dishwasher', 'item_json_dishwasher', [0.15, 0, -1.15], [0, 0, 0], {
  room: 'Kitchen / Dining',
})
addItem('Kitchen Bar', 'item_json_kitchen_bar', [-1.5, 0, -3.75], [0, 0, 0], {
  room: 'Kitchen / Dining',
  scale: [1, 1, 1],
})
addItem('Dining Table', 'item_json_dining_table', [-1.5, 0, -6.25], [0, 0, 0], {
  room: 'Kitchen / Dining',
  scale: [1, 1, 1],
})
addItem('Dining Chair', 'item_json_dining_nw', [-2.45, 0, -5.45], [0, Math.PI, 0], {
  room: 'Kitchen / Dining',
})
addItem('Dining Chair', 'item_json_dining_ne', [-0.55, 0, -5.45], [0, Math.PI, 0], {
  room: 'Kitchen / Dining',
})
addItem('Dining Chair', 'item_json_dining_sw', [-2.45, 0, -7.05], [0, 0, 0], {
  room: 'Kitchen / Dining',
})
addItem('Dining Chair', 'item_json_dining_se', [-0.55, 0, -7.05], [0, 0, 0], {
  room: 'Kitchen / Dining',
})

build.nodes = [...geometryNodes, ...openings, ...items]
build.updatedAt = Date.now()
build.updatedBy = 'json-design-pass'
report.capturedAt = new Date().toISOString()
report.mode = { buildParcelId: 'parcel-03', fpv: false, view: 'build' }
report.camera = {
  distance: 27,
  pitch: Math.PI / 2,
  position: [-3.5, 27, -8],
  quaternion: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2],
  target: [-3.5, 0.35, -8],
  yaw: 0,
  zoom: null,
}
report.floor = {
  buildingId: 'building_landrush-island-debug',
  levelId: 'level_landrush-island-debug',
  levelNumber: 0,
  scopeId: 'level_landrush-island-debug',
}
report.save.source = 'offline'
report.app.url = '/landrush-lab/pascal-multiplayer-island-bug-report?offline=1&reportUrl=/landrush-debug/parcel-03-reference-house.json'
report.diagnostics = {
  authoredFromJson: true,
  parcelId: 'parcel-03',
  referenceFiles: referencePaths.map((path) => path.split('/').at(-1)),
  roomFunctions: roomDefinitions.map((room) => room.name),
  circulation: openings.filter((node) => node.type === 'door').map((node) => node.metadata.circulation),
  furnitureCount: items.length,
  entryDoor: {
    nodeId: 'door_json_entry',
    physicalRole: 'Exterior -> Living Room',
    supportedDoorCategories: ['interior', 'garage'],
    serializedCategory: 'interior',
  },
}
report.scene.nodeCount = build.nodes.length

const roomAudit = slabs.map((slab) => ({
  name: slab.name.replace(/ Slab$/, ''),
  areaM2: polygonArea(slab.polygon),
  center: polygonCenter(slab.polygon),
  floor: slab.slots?.surface ?? null,
  furniture: items.filter((item) => item.metadata.roomFunction === slab.metadata.roomFunction).length,
}))
const audit = {
  generatedAt: report.capturedAt,
  parcelId: build.parcelId,
  nodeCounts: Object.groupBy(build.nodes, (node) => node.type),
  roomCount: slabs.length,
  rooms: roomAudit,
  totalAreaM2: roomAudit.reduce((sum, room) => sum + room.areaM2, 0),
  wallCount: walls.length,
  doorCount: openings.filter((node) => node.type === 'door').length,
  entryDoor: {
    nodeId: 'door_json_entry',
    physicalRole: 'Exterior -> Living Room',
    supportedDoorCategories: ['interior', 'garage'],
    serializedCategory: 'interior',
    categoryConstraintSatisfied: true,
  },
  windowCount: openings.filter((node) => node.type === 'window').length,
  itemCount: items.length,
  wallEndpoints: walls.map((node) => ({ id: node.id, start: node.start, end: node.end })),
  itemPlacements: items.map((node) => ({
    id: node.id,
    name: node.name,
    parentId: node.parentId,
    position: node.position,
    rotation: node.rotation,
    scale: node.scale,
    room: node.metadata.roomFunction,
  })),
}
audit.nodeCounts = Object.fromEntries(
  Object.entries(audit.nodeCounts).map(([type, nodes]) => [type, nodes.length]),
)

const obliqueCamera = (yaw) => {
  const distance = 27
  const pitch = 0.65
  const target = [-3.5, 0.35, -8]
  const horizontal = Math.cos(pitch) * distance
  const halfPitch = pitch / 2
  const halfYaw = yaw / 2
  return {
    distance,
    pitch,
    position: [
      target[0] + Math.sin(yaw) * horizontal,
      target[1] + Math.sin(pitch) * distance,
      target[2] + Math.cos(yaw) * horizontal,
    ],
    quaternion: [
      -Math.sin(halfPitch) * Math.cos(halfYaw),
      Math.cos(halfPitch) * Math.sin(halfYaw),
      Math.sin(halfPitch) * Math.sin(halfYaw),
      Math.cos(halfPitch) * Math.cos(halfYaw),
    ],
    target,
    yaw,
    zoom: null,
  }
}
const cameraProofs = [
  { label: 'top-plan', path: reportPath, camera: report.camera },
  { label: 'north-oblique', yaw: 0 },
  { label: 'east-oblique', yaw: Math.PI / 2 },
  { label: 'south-oblique', yaw: Math.PI },
  { label: 'west-oblique', yaw: -Math.PI / 2 },
].map((proof) => ({
  ...proof,
  camera: proof.camera ?? obliqueCamera(proof.yaw),
  path: proof.path ?? resolve(
    workspace,
    `apps/editor/public/landrush-debug/parcel-03-reference-house-${proof.label}.json`,
  ),
}))
audit.cameraProofs = cameraProofs.map((proof) => ({
  label: proof.label,
  path: proof.path,
  camera: proof.camera,
}))

await mkdir(dirname(reportPath), { recursive: true })
for (const proof of cameraProofs) {
  const proofReport = clone(report)
  proofReport.camera = proof.camera
  proofReport.app.url = `/landrush-lab/pascal-multiplayer-island-bug-report?offline=1&reportUrl=/landrush-debug/${proof.path.split(/[/\\]/).at(-1)}`
  await writeFile(proof.path, `${JSON.stringify(proofReport, null, 2)}\n`)
}
await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`)
console.log(JSON.stringify({ reportPath, auditPath, audit }, null, 2))
