import { afterEach, describe, expect, test } from 'bun:test'
import {
  DataTexture,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SRGBColorSpace,
  Texture,
} from 'three'
import {
  applyLandrushRobotRuntimeTexture,
  createLandrushRobotRuntimeTexture,
  readLandrushRobotStagedTextureUpload,
} from './landrush-robot-texture'

const originalOffscreenCanvas = globalThis.OffscreenCanvas

afterEach(() => {
  Object.defineProperty(globalThis, 'OffscreenCanvas', {
    configurable: true,
    value: originalOffscreenCanvas,
    writable: true,
  })
})

describe('Landrush robot runtime texture', () => {
  test('converts the decoded image once to a single-level sRGB DataTexture', () => {
    installOffscreenCanvas(Uint8ClampedArray.of(1, 2, 3, 255, 4, 5, 6, 255))
    const source = new Texture({ height: 1, width: 2 })
    source.name = 'robot'
    source.colorSpace = SRGBColorSpace
    source.flipY = false
    source.needsUpdate = true

    const runtime = createLandrushRobotRuntimeTexture(source)

    expect(runtime).toBeInstanceOf(DataTexture)
    expect(createLandrushRobotRuntimeTexture(source)).toBe(runtime)
    expect(createLandrushRobotRuntimeTexture(runtime)).toBe(runtime)
    expect(runtime.image).toEqual({
      data: Uint8Array.of(1, 2, 3, 255, 4, 5, 6, 255),
      height: 1,
      width: 2,
    })
    expect(runtime.colorSpace).toBe(SRGBColorSpace)
    expect(runtime.flipY).toBe(false)
    expect(runtime.generateMipmaps).toBe(false)
    expect(runtime.minFilter).toBe(LinearFilter)
    source.dispose()
    runtime.dispose()
  })

  test('keeps the shared base-color and emissive binding on one runtime texture', () => {
    installOffscreenCanvas(Uint8ClampedArray.of(10, 20, 30, 255))
    const source = new Texture({ height: 1, width: 1 })
    const material = new MeshStandardMaterial({ emissiveMap: source, map: source })
    const mesh = new Mesh(undefined, material)
    const root = new Object3D()
    root.add(mesh)

    applyLandrushRobotRuntimeTexture(root)

    expect(material.map).toBeInstanceOf(DataTexture)
    expect(material.emissiveMap).toBe(material.map)
    expect(material.map).not.toBe(source)
    material.map?.dispose()
    material.dispose()
    source.dispose()
  })

  test('isolates deferred upload state on an owned material and exposes exact RGBA pixels', () => {
    const pixels = Uint8ClampedArray.of(10, 20, 30, 255, 40, 50, 60, 255)
    installOffscreenCanvas(pixels)
    const source = new Texture({ height: 1, width: 2 })
    const material = new MeshStandardMaterial({ emissiveMap: source, map: source })
    const mesh = new Mesh(undefined, material)
    const root = new Object3D()
    root.add(mesh)

    const application = applyLandrushRobotRuntimeTexture(root, { deferred: true })
    const ownedMaterial = mesh.material as MeshStandardMaterial
    const runtimeTexture = ownedMaterial.map!
    const upload = readLandrushRobotStagedTextureUpload(runtimeTexture)

    expect(ownedMaterial).not.toBe(material)
    expect(application.ownedMaterials).toEqual([ownedMaterial])
    expect(material.map).toBe(source)
    expect(material.emissiveMap).toBe(source)
    expect(ownedMaterial.map).toBeInstanceOf(DataTexture)
    expect(ownedMaterial.emissiveMap).toBe(ownedMaterial.map)
    expect(upload).toEqual({
      height: 1,
      pixels: Uint8Array.from(pixels),
      texture: runtimeTexture,
      width: 2,
    })
    expect(ownedMaterial.map?.source.dataReady).toBe(false)

    ownedMaterial.map?.dispose()
    ownedMaterial.dispose()
    material.dispose()
    source.dispose()
  })

  test('derives a deferred upload from an already converted eager DataTexture without drawing again', () => {
    let drawCount = 0
    installOffscreenCanvas(Uint8ClampedArray.of(1, 2, 3, 255), () => {
      drawCount += 1
    })
    const source = new Texture({ height: 1, width: 1 })
    const eager = createLandrushRobotRuntimeTexture(source)
    const deferred = createLandrushRobotRuntimeTexture(eager, { deferred: true })

    expect(drawCount).toBe(1)
    expect(deferred).not.toBe(eager)
    expect(createLandrushRobotRuntimeTexture(eager, { deferred: true })).toBe(deferred)
    expect(readLandrushRobotStagedTextureUpload(deferred)?.pixels).toBe(
      (eager.image as { data: Uint8Array }).data,
    )
    expect(deferred.source.dataReady).toBe(false)

    deferred.dispose()
    eager.dispose()
    source.dispose()
  })
})

function installOffscreenCanvas(pixels: Uint8ClampedArray, onDrawImage = () => undefined) {
  class TestOffscreenCanvas {
    constructor(
      readonly width: number,
      readonly height: number,
    ) {}

    getContext() {
      return {
        drawImage: onDrawImage,
        getImageData: () => ({ data: pixels }),
      }
    }
  }
  Object.defineProperty(globalThis, 'OffscreenCanvas', {
    configurable: true,
    value: TestOffscreenCanvas,
    writable: true,
  })
}
