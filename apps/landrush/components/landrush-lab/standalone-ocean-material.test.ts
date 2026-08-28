import { OrthographicCamera, PerspectiveCamera, Vector3, WebGPUCoordinateSystem } from 'three'
import type { Node as TSLNode } from 'three/webgpu'
import { describe, expect, test } from 'vitest'

import {
  createDefaultStandaloneOceanParameters,
  createStandaloneOceanMaterials,
} from './standalone-ocean-material'

type StructuralNode = TSLNode & {
  getChildren: () => Iterable<TSLNode>
  isSubBuildNode?: boolean
  isVaryingNode?: boolean
  name?: string
  node?: StructuralNode
}

function collectNodeGraph(...roots: Array<TSLNode | null | undefined>) {
  const nodes = new Set<StructuralNode>()

  const visit = (node: TSLNode | null | undefined) => {
    if (!node) return

    const structuralNode = node as StructuralNode
    if (nodes.has(structuralNode)) return

    nodes.add(structuralNode)
    for (const child of structuralNode.getChildren()) visit(child)
  }

  for (const root of roots) visit(root)
  return nodes
}

function expectVertexCarriers(nodes: Set<StructuralNode>, expectedCarrierNames: string[]) {
  const carriers = new Map(
    [...nodes]
      .filter((node) => node.isVaryingNode && node.name?.startsWith('vStandaloneOcean') === true)
      .map((node) => [node.name, node] as const),
  )

  expect([...carriers.keys()].sort()).toEqual([...expectedCarrierNames].sort())
  for (const name of expectedCarrierNames) {
    const carrier = carriers.get(name)
    expect(carrier?.isVaryingNode).toBe(true)
    expect(carrier?.node?.isSubBuildNode).toBe(true)
    expect(carrier?.node?.name).toBe('VERTEX')
  }
}

function resolveSampledLinearDepth(
  screenUv: readonly [number, number],
  depthSample: number,
  projectionMatrixInverse: ArrayLike<number>,
  near: number,
  far: number,
) {
  const clipX = screenUv[0] * 2 - 1
  const clipY = (1 - screenUv[1]) * 2 - 1
  const viewZ =
    (projectionMatrixInverse[2]! * clipX +
      projectionMatrixInverse[6]! * clipY +
      projectionMatrixInverse[10]! * depthSample +
      projectionMatrixInverse[14]!) /
    (projectionMatrixInverse[3]! * clipX +
      projectionMatrixInverse[7]! * clipY +
      projectionMatrixInverse[11]! * depthSample +
      projectionMatrixInverse[15]!)

  return (viewZ + near) / (near - far)
}

function resolveViewDirection(
  cameraWorldPosition: readonly [number, number, number],
  fragmentWorldPosition: readonly [number, number, number],
  orthographicWorldViewDirection: readonly [number, number, number],
  orthographic: boolean,
): [number, number, number] {
  const direction = orthographic
    ? orthographicWorldViewDirection
    : [
        cameraWorldPosition[0] - fragmentWorldPosition[0],
        cameraWorldPosition[1] - fragmentWorldPosition[1],
        cameraWorldPosition[2] - fragmentWorldPosition[2],
      ]
  const inverseLength = 1 / Math.hypot(direction[0], direction[1], direction[2])

  return [direction[0] * inverseLength, direction[1] * inverseLength, direction[2] * inverseLength]
}

function tuple(vector: Vector3): [number, number, number] {
  return [vector.x, vector.y, vector.z]
}

function expectDirection(actual: readonly number[], expected: Vector3) {
  expect(actual[0]).toBeCloseTo(expected.x, 12)
  expect(actual[1]).toBeCloseTo(expected.y, 12)
  expect(actual[2]).toBeCloseTo(expected.z, 12)
}

describe('standalone ocean camera projection contract', () => {
  test('selects a constant world view ray for orthographic draws', () => {
    const perspective = new PerspectiveCamera(52, 16 / 9, 0.05, 90)
    const orthographic = new OrthographicCamera(-8, 8, 6.4, -6.4, 0.05, 90)
    const cameraPosition = new Vector3(47.770_592, 17.441_134, 17.890_133)
    const cameraTarget = new Vector3(44, 0.751_825, 12.3)

    for (const camera of [perspective, orthographic]) {
      camera.position.copy(cameraPosition)
      camera.lookAt(cameraTarget)
      camera.updateMatrixWorld(true)
    }

    expect(perspective.projectionMatrix.elements[15]).toBe(0)
    expect(orthographic.projectionMatrix.elements[15]).toBe(1)

    const orthographicWorldViewDirection = new Vector3(0, 0, 1).transformDirection(
      orthographic.matrixWorld,
    )
    expectDirection(
      tuple(orthographicWorldViewDirection),
      orthographic.getWorldDirection(new Vector3()).negate(),
    )

    const firstFragment: [number, number, number] = [38, -10.05, 4]
    const secondFragment: [number, number, number] = [52, -10.05, 22]
    const orthographicFirst = resolveViewDirection(
      tuple(cameraPosition),
      firstFragment,
      tuple(orthographicWorldViewDirection),
      true,
    )
    const orthographicSecond = resolveViewDirection(
      tuple(cameraPosition),
      secondFragment,
      tuple(orthographicWorldViewDirection),
      true,
    )
    const perspectiveFirst = resolveViewDirection(
      tuple(cameraPosition),
      firstFragment,
      tuple(orthographicWorldViewDirection),
      false,
    )
    const perspectiveSecond = resolveViewDirection(
      tuple(cameraPosition),
      secondFragment,
      tuple(orthographicWorldViewDirection),
      false,
    )

    expect(orthographicFirst).toEqual(orthographicSecond)
    expectDirection(orthographicFirst, orthographicWorldViewDirection)
    expect(perspectiveFirst).not.toEqual(perspectiveSecond)
    expectDirection(
      perspectiveFirst,
      cameraPosition
        .clone()
        .sub(new Vector3(...firstFragment))
        .normalize(),
    )
  })

  test('reconstructs the same linear depth from perspective and orthographic samples', () => {
    const near = 0.05
    const far = 90
    const viewPosition = new Vector3(1.75, -0.9, -17.25)
    const expectedLinearDepth = (viewPosition.z + near) / (near - far)
    const cameras = [
      new PerspectiveCamera(52, 16 / 9, near, far),
      new OrthographicCamera(-8, 8, 6.4, -6.4, near, far),
    ]

    for (const camera of cameras) {
      camera.coordinateSystem = WebGPUCoordinateSystem
      camera.updateProjectionMatrix()
      const projected = viewPosition.clone().applyMatrix4(camera.projectionMatrix)
      const screenUv: [number, number] = [(projected.x + 1) / 2, (1 - projected.y) / 2]
      const reconstructedLinearDepth = resolveSampledLinearDepth(
        screenUv,
        projected.z,
        camera.projectionMatrixInverse.elements,
        near,
        far,
      )

      expect(reconstructedLinearDepth).toBeCloseTo(expectedLinearDepth, 12)
    }
  })
})

describe('standalone ocean material stage ownership', () => {
  test('keeps shared wave carriers in the vertex stage and publishes the opacity floor', () => {
    const materials = createStandaloneOceanMaterials(
      createDefaultStandaloneOceanParameters(),
      'final',
      {
        cloudDetailOctaves: 3,
        detailRadius: 600,
        outerRadius: 1_800,
        vertexSpacing: 6.25,
      },
      null,
      true,
    )

    try {
      const nodes = collectNodeGraph(
        materials.surface.positionNode,
        materials.surface.colorNode,
        materials.surface.opacityNode,
      )
      expectVertexCarriers(nodes, [
        'vStandaloneOceanWaveEnergy',
        'vStandaloneOceanWaveFrame',
        'vStandaloneOceanWavePose',
      ])

      expect(materials.surface.transparent).toBe(true)
      expect(materials.surface.depthWrite).toBe(false)
      expect(materials.surface.userData.standaloneOcean.minimumBodyOpacity).toBe(0.42)
    } finally {
      materials.dispose()
    }
  })

  test('keeps low-frequency sky shape and lighting carriers in the vertex stage', () => {
    const materials = createStandaloneOceanMaterials(
      createDefaultStandaloneOceanParameters(),
      'final',
      {
        cloudDetailOctaves: 3,
        detailRadius: 600,
        outerRadius: 1_800,
        vertexSpacing: 6.25,
      },
      null,
      true,
    )

    try {
      expectVertexCarriers(collectNodeGraph(materials.sky.colorNode), [
        'vStandaloneOceanSkyLight',
        'vStandaloneOceanSkyShape',
      ])
    } finally {
      materials.dispose()
    }
  })
})

describe('bounded Zombie ocean materials', () => {
  test('uses disposable classic materials without constructing the detailed TSL graphs', () => {
    const parameters = createDefaultStandaloneOceanParameters()
    const materials = createStandaloneOceanMaterials(
      parameters,
      'final',
      {
        cloudDetailOctaves: 3,
        detailRadius: 600,
        outerRadius: 1_800,
        vertexSpacing: 6.25,
      },
      null,
      true,
      'zombie-bounded',
    )
    let surfaceDisposals = 0
    let skyDisposals = 0
    materials.surface.addEventListener('dispose', () => {
      surfaceDisposals += 1
    })
    materials.sky.addEventListener('dispose', () => {
      skyDisposals += 1
    })

    expect(materials.surface.isMeshBasicMaterial).toBe(true)
    expect(materials.sky.isMeshBasicMaterial).toBe(true)
    expect('positionNode' in materials.surface).toBe(false)
    expect('colorNode' in materials.surface).toBe(false)
    expect('colorNode' in materials.sky).toBe(false)
    expect(materials.surface.name).toBe('zombie-bounded-ocean-surface')
    expect(materials.sky.name).toBe('zombie-bounded-ocean-sky')
    expect(materials.time).toEqual({ value: 0 })

    const next = createDefaultStandaloneOceanParameters()
    next.oceanColorA = '#123456'
    next.skyZenithColor = '#654321'
    materials.setParameters(next)
    expect(materials.surface.color.getHexString()).toBe('123456')
    expect(materials.sky.color.getHexString()).toBe('654321')

    materials.dispose()
    expect(surfaceDisposals).toBe(1)
    expect(skyDisposals).toBe(1)
  })
})
