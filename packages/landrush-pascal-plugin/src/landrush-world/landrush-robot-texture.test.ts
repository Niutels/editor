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
})

function installOffscreenCanvas(pixels: Uint8ClampedArray) {
  class TestOffscreenCanvas {
    constructor(
      readonly width: number,
      readonly height: number,
    ) {}

    getContext() {
      return {
        drawImage() {},
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
