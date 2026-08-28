import { describe, expect, test } from 'bun:test'
import {
  AnimationClip,
  AnimationMixer,
  Bone,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  type InterleavedBufferAttribute,
  Mesh,
  MeshDepthMaterial,
  MeshDistanceMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  QuaternionKeyframeTrack,
  Raycaster,
  Skeleton,
  SkinnedMesh,
  StreamDrawUsage,
  Uint16BufferAttribute,
  Vector3,
  Vector4,
} from 'three'
import { createLandrushRobotCpuSkinning } from './landrush-robot-cpu-skinning'

describe('Landrush robot CPU skinning', () => {
  test('replaces GPU skinning with one exact streamed vertex buffer and preserves mesh state', () => {
    const fixture = createSkinnedFixture()
    const expected = readExpectedSkin(fixture.mesh)
    const sourcePosition = readAttribute(fixture.mesh.geometry, 'position')
    const child = new Object3D()
    fixture.mesh.add(child)

    const cpuSkinning = createLandrushRobotCpuSkinning(fixture.root)
    const replacement = cpuSkinning.meshes[0]!
    const position = replacement.geometry.getAttribute('position')
    const normal = replacement.geometry.getAttribute('normal')
    const interleavedPosition = position as InterleavedBufferAttribute
    const interleavedNormal = normal as InterleavedBufferAttribute

    expect(replacement).toBeInstanceOf(Mesh)
    expect((replacement as Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh).toBeUndefined()
    expect(replacement.getVertexPosition).toBe(Mesh.prototype.getVertexPosition)
    expect(replacement.raycast).toBe(Mesh.prototype.raycast)
    expect(replacement.geometry).not.toBe(fixture.mesh.geometry)
    expect(replacement.geometry.getAttribute('skinIndex')).toBeUndefined()
    expect(replacement.geometry.getAttribute('skinWeight')).toBeUndefined()
    expect(interleavedPosition.isInterleavedBufferAttribute).toBe(true)
    expect(interleavedNormal.isInterleavedBufferAttribute).toBe(true)
    expect(interleavedPosition.data).toBe(interleavedNormal.data)
    expect(interleavedPosition.data.stride).toBe(6)
    expect(interleavedPosition.data.array.byteLength).toBe(
      position.count * 6 * Float32Array.BYTES_PER_ELEMENT,
    )
    expect(interleavedPosition.data.usage).toBe(StreamDrawUsage)
    expect(replacement.geometry.getAttribute('uv')).not.toBe(
      fixture.mesh.geometry.getAttribute('uv'),
    )
    expect(replacement.material).toBe(fixture.material)
    expect(replacement.name).toBe(fixture.mesh.name)
    expect(replacement.uuid).toBe(fixture.mesh.uuid)
    expect(replacement.userData).toBe(fixture.mesh.userData)
    expect(replacement.layers.mask).toBe(fixture.mesh.layers.mask)
    expect(replacement.visible).toBe(fixture.mesh.visible)
    expect(replacement.castShadow).toBe(fixture.mesh.castShadow)
    expect(replacement.receiveShadow).toBe(fixture.mesh.receiveShadow)
    expect(replacement.frustumCulled).toBe(fixture.mesh.frustumCulled)
    expect(replacement.renderOrder).toBe(fixture.mesh.renderOrder)
    expect(replacement.position.toArray()).toEqual(fixture.mesh.position.toArray())
    expect(replacement.quaternion.toArray()).toEqual(fixture.mesh.quaternion.toArray())
    expect(replacement.scale.toArray()).toEqual(fixture.mesh.scale.toArray())
    expect(replacement.customDepthMaterial).toBe(fixture.depthMaterial)
    expect(replacement.customDistanceMaterial).toBe(fixture.distanceMaterial)
    expect(replacement.onBeforeRender).toBe(fixture.mesh.onBeforeRender)
    expect(replacement.onAfterRender).toBe(fixture.mesh.onAfterRender)
    expect(replacement.onBeforeShadow).toBe(fixture.mesh.onBeforeShadow)
    expect(replacement.onAfterShadow).toBe(fixture.mesh.onAfterShadow)
    expect(replacement.children).toEqual([child])
    expect(child.parent).toBe(replacement)
    expect(fixture.mesh.parent).toBeNull()
    expect(fixture.root.getObjectByName(fixture.arm.name)).toBe(fixture.arm)
    expectVectorsClose(readAttribute(replacement.geometry, 'position'), expected.position, 5)
    expectVectorsClose(readAttribute(replacement.geometry, 'normal'), expected.normal, 5)
    expect(readAttribute(fixture.mesh.geometry, 'position')).toEqual(sourcePosition)

    cpuSkinning.dispose()
    fixture.dispose()
  })

  test('updates from immutable bind-pose data after bone animation and parent movement', () => {
    const fixture = createSkinnedFixture()
    const sourcePosition = readAttribute(fixture.mesh.geometry, 'position')
    const cpuSkinning = createLandrushRobotCpuSkinning(fixture.root)
    const replacement = cpuSkinning.meshes[0]!
    const output = replacement.geometry.getAttribute('position').array as Float32Array
    output.fill(999)

    const clip = new AnimationClip('arm-pose', 1, [
      new QuaternionKeyframeTrack(
        `${fixture.arm.name}.quaternion`,
        [0, 1],
        [
          0,
          0,
          0,
          1,
          ...new Quaternion()
            .setFromAxisAngle(new Vector3(0.3, 0.8, 0.2).normalize(), 1.1)
            .toArray(),
        ],
      ),
    ])
    const mixer = new AnimationMixer(fixture.root)
    mixer.clipAction(clip).play()
    const armQuaternionBeforeAnimation = fixture.arm.quaternion.clone()
    mixer.setTime(0.8)
    expect(fixture.arm.quaternion.angleTo(armQuaternionBeforeAnimation)).toBeGreaterThan(0.1)
    fixture.outer.position.set(-2.4, 1.2, 0.8)
    fixture.outer.rotation.set(-0.15, 0.42, 0.08)

    cpuSkinning.update()
    fixture.mesh.bindMatrixInverse.copy(replacement.matrixWorld).invert()
    const expected = readExpectedSkin(fixture.mesh)

    expect(replacement.geometry.boundingBox).toBeNull()
    expect(replacement.geometry.boundingSphere).toBeNull()
    expectVectorsClose(readAttribute(replacement.geometry, 'position'), expected.position, 5)
    expectVectorsClose(readAttribute(replacement.geometry, 'normal'), expected.normal, 5)
    expect(readAttribute(fixture.mesh.geometry, 'position')).toEqual(sourcePosition)
    expect(raycastCurrentTriangle(replacement)[0]?.object).toBe(replacement)

    mixer.stopAllAction()
    mixer.uncacheRoot(fixture.root)
    cpuSkinning.dispose()
    fixture.dispose()
  })

  test('disposes owned geometry once and fails closed before replacing unsupported meshes', () => {
    const fixture = createSkinnedFixture()
    const cpuSkinning = createLandrushRobotCpuSkinning(fixture.root)
    const replacement = cpuSkinning.meshes[0]!
    let disposeCount = 0
    replacement.geometry.addEventListener('dispose', () => {
      disposeCount += 1
    })

    cpuSkinning.dispose()
    cpuSkinning.dispose()
    cpuSkinning.update()

    expect(disposeCount).toBe(1)
    fixture.dispose()

    const unsupported = createSkinnedFixture()
    unsupported.mesh.geometry.setAttribute(
      'tangent',
      new Float32BufferAttribute([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1], 4),
    )
    expect(() => createLandrushRobotCpuSkinning(unsupported.root)).toThrow(
      'does not support tangent attributes',
    )
    expect(unsupported.mesh.parent).toBe(unsupported.root)
    unsupported.dispose()
  })
})

function createSkinnedFixture() {
  const outer = new Group()
  outer.position.set(2.1, -0.7, 1.4)
  outer.rotation.set(0.18, -0.31, 0.12)
  outer.scale.set(1.2, 0.85, 1.1)
  const root = new Group()
  outer.add(root)

  const hip = new Bone()
  hip.name = 'hip'
  hip.position.set(0.1, 0.3, -0.2)
  const arm = new Bone()
  arm.name = 'arm'
  arm.position.set(0.35, 0.6, 0.1)
  hip.add(arm)
  root.add(hip)

  const geometry = new BufferGeometry()
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute([-0.4, 0.1, 0.2, 0.7, 0.2, -0.3, 0.15, 1.1, 0.45], 3),
  )
  geometry.setAttribute(
    'normal',
    new Float32BufferAttribute([0, 1, 0, 0.2, 0.8, 0.5, -0.4, 0.3, 0.86], 3),
  )
  geometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2))
  geometry.setAttribute(
    'skinIndex',
    new Uint16BufferAttribute([0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0], 4),
  )
  geometry.setAttribute(
    'skinWeight',
    new Float32BufferAttribute([0.7, 0.3, 0, 0, 0.25, 0.75, 0, 0, 0.45, 0.55, 0, 0], 4),
  )
  geometry.setIndex([0, 1, 2])

  const material = new MeshStandardMaterial({ color: 0x7dd3fc, side: DoubleSide })
  const mesh = new SkinnedMesh(geometry, material)
  mesh.name = 'char1'
  mesh.position.set(0.4, -0.15, 0.25)
  mesh.rotation.set(-0.12, 0.26, 0.08)
  mesh.scale.set(0.9, 1.15, 1.05)
  mesh.userData = { nested: { robot: true } }
  mesh.layers.set(3)
  mesh.visible = false
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  mesh.renderOrder = 7
  const depthMaterial = new MeshDepthMaterial()
  const distanceMaterial = new MeshDistanceMaterial()
  mesh.customDepthMaterial = depthMaterial
  mesh.customDistanceMaterial = distanceMaterial
  mesh.onBeforeRender = () => undefined
  mesh.onAfterRender = () => undefined
  mesh.onBeforeShadow = () => undefined
  mesh.onAfterShadow = () => undefined
  root.add(mesh)

  outer.updateWorldMatrix(true, true)
  const skeleton = new Skeleton([hip, arm])
  mesh.bind(skeleton, mesh.matrixWorld)
  hip.rotation.set(0.22, -0.18, 0.14)
  arm.rotation.set(-0.36, 0.41, -0.19)
  arm.scale.set(1.05, 0.92, 1.08)
  outer.updateWorldMatrix(true, true)

  return {
    arm,
    depthMaterial,
    distanceMaterial,
    dispose: () => {
      geometry.dispose()
      material.dispose()
      depthMaterial.dispose()
      distanceMaterial.dispose()
    },
    material,
    mesh,
    outer,
    root,
  }
}

function readExpectedSkin(mesh: SkinnedMesh) {
  const positionAttribute = mesh.geometry.getAttribute('position')
  const normalAttribute = mesh.geometry.getAttribute('normal')
  const position: number[] = []
  const normal: number[] = []
  const point = new Vector3()
  const direction = new Vector4()
  for (let index = 0; index < positionAttribute.count; index += 1) {
    point.fromBufferAttribute(positionAttribute, index)
    mesh.applyBoneTransform(index, point)
    position.push(point.x, point.y, point.z)

    direction.set(
      normalAttribute.getX(index),
      normalAttribute.getY(index),
      normalAttribute.getZ(index),
      0,
    )
    mesh.applyBoneTransform(index, direction)
    const length = Math.hypot(direction.x, direction.y, direction.z)
    normal.push(direction.x / length, direction.y / length, direction.z / length)
  }
  return { normal, position }
}

function readAttribute(geometry: BufferGeometry, name: string) {
  const attribute = geometry.getAttribute(name)
  const values: number[] = []
  for (let index = 0; index < attribute.count; index += 1) {
    for (let component = 0; component < attribute.itemSize; component += 1) {
      values.push(attribute.getComponent(index, component))
    }
  }
  return values
}

function raycastCurrentTriangle(mesh: Mesh) {
  const position = mesh.geometry.getAttribute('position')
  const a = new Vector3().fromBufferAttribute(position, 0).applyMatrix4(mesh.matrixWorld)
  const b = new Vector3().fromBufferAttribute(position, 1).applyMatrix4(mesh.matrixWorld)
  const c = new Vector3().fromBufferAttribute(position, 2).applyMatrix4(mesh.matrixWorld)
  const center = a
    .clone()
    .add(b)
    .add(c)
    .multiplyScalar(1 / 3)
  const normal = new Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize()
  const raycaster = new Raycaster(center.clone().addScaledVector(normal, 2), normal.negate())
  raycaster.layers.mask = mesh.layers.mask
  return raycaster.intersectObject(mesh, false)
}

function expectVectorsClose(
  received: readonly number[],
  expected: readonly number[],
  digits: number,
) {
  expect(received).toHaveLength(expected.length)
  for (let index = 0; index < expected.length; index += 1) {
    expect(received[index]).toBeCloseTo(expected[index]!, digits)
  }
}
