/// <reference path="../../../assets.d.ts" />

import appliance from './assets/appliance.webp'
import bathroom from './assets/bathroom.webp'
import build from './assets/build.webp'
import ceiling from './assets/ceiling.webp'
import column from './assets/column.webp'
import couch from './assets/couch.webp'
import door from './assets/door.webp'
import duct from './assets/duct.webp'
import ductFitting from './assets/duct-fitting.webp'
import dwvPipes from './assets/dwv-pipes.webp'
import elevator from './assets/elevator.webp'
import fence from './assets/fence.webp'
import floor from './assets/floor.webp'
import floorplan from './assets/floorplan.webp'
import hvac from './assets/HVAC.webp'
import kitchen from './assets/kitchen.webp'
import lineset from './assets/lineset.webp'
import mesh from './assets/mesh.webp'
import paint from './assets/paint.webp'
import registers from './assets/registers.webp'
import roof from './assets/roof.webp'
import rotate from './assets/rotate.webp'
import select from './assets/select.webp'
import shelf from './assets/shelf.webp'
import site from './assets/site.webp'
import spawnPoint from './assets/spawn-point.webp'
import stairs from './assets/stairs.webp'
import topview from './assets/topview.webp'
import tree from './assets/tree.webp'
import wall from './assets/wall.webp'
import window from './assets/window.webp'
import zone from './assets/zone.webp'

const url = (asset: { src: string }): string => asset.src

// Package-owned imports keep the action menu independent of a host app's public directory.
export const ACTION_MENU_ICON_URLS = {
  appliance: url(appliance),
  bathroom: url(bathroom),
  build: url(build),
  ceiling: url(ceiling),
  column: url(column),
  couch: url(couch),
  door: url(door),
  duct: url(duct),
  ductFitting: url(ductFitting),
  dwvPipes: url(dwvPipes),
  elevator: url(elevator),
  fence: url(fence),
  floor: url(floor),
  floorplan: url(floorplan),
  hvac: url(hvac),
  kitchen: url(kitchen),
  lineset: url(lineset),
  mesh: url(mesh),
  paint: url(paint),
  registers: url(registers),
  roof: url(roof),
  rotate: url(rotate),
  select: url(select),
  shelf: url(shelf),
  site: url(site),
  spawnPoint: url(spawnPoint),
  stairs: url(stairs),
  topview: url(topview),
  tree: url(tree),
  wall: url(wall),
  window: url(window),
  zone: url(zone),
} as const
