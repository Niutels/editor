import {
  BufferAttribute,
  BufferGeometry,
  type InterleavedBufferAttribute,
  type LineLoop,
  LineSegments,
  type Material,
  type Object3D,
} from 'three'

const normalizedRoots = new WeakSet<Object3D>()

type ReadableAttribute = BufferAttribute | InterleavedBufferAttribute

export function normalizeLineLoopsForWebGPU(root: Object3D): void {
  if (normalizedRoots.has(root)) return
  normalizedRoots.add(root)

  const lineLoops: LineLoop[] = []
  root.traverse((object) => {
    if ((object as LineLoop).isLineLoop) lineLoops.push(object as LineLoop)
  })

  for (const lineLoop of lineLoops) {
    const parent = lineLoop.parent
    if (!parent) continue

    const replacement = createLineSegmentsFromLineLoop(lineLoop)
    const siblingIndex = parent.children.indexOf(lineLoop)
    parent.remove(lineLoop)
    parent.add(replacement)

    if (siblingIndex >= 0) {
      const replacementIndex = parent.children.indexOf(replacement)
      parent.children.splice(replacementIndex, 1)
      parent.children.splice(siblingIndex, 0, replacement)
    }
  }
}

function createLineSegmentsFromLineLoop(lineLoop: LineLoop): LineSegments {
  const replacement = new LineSegments(
    lineLoopGeometryToSegments(lineLoop.geometry),
    lineLoop.material as Material | Material[],
  )

  replacement.name = lineLoop.name
  replacement.position.copy(lineLoop.position)
  replacement.quaternion.copy(lineLoop.quaternion)
  replacement.scale.copy(lineLoop.scale)
  replacement.up.copy(lineLoop.up)
  replacement.matrix.copy(lineLoop.matrix)
  replacement.matrixWorld.copy(lineLoop.matrixWorld)
  replacement.matrixAutoUpdate = lineLoop.matrixAutoUpdate
  replacement.matrixWorldAutoUpdate = lineLoop.matrixWorldAutoUpdate
  replacement.visible = lineLoop.visible
  replacement.castShadow = lineLoop.castShadow
  replacement.receiveShadow = lineLoop.receiveShadow
  replacement.frustumCulled = lineLoop.frustumCulled
  replacement.renderOrder = lineLoop.renderOrder
  replacement.layers.mask = lineLoop.layers.mask
  replacement.userData = { ...lineLoop.userData }

  while (lineLoop.children.length > 0) {
    replacement.add(lineLoop.children[0]!)
  }

  return replacement
}

function lineLoopGeometryToSegments(source: BufferGeometry): BufferGeometry {
  const position = source.getAttribute('position')
  if (!position || position.count < 2) return source.clone()

  const sourceIndices = source.index
    ? Array.from({ length: source.index.count }, (_, index) => source.index!.getX(index))
    : Array.from({ length: position.count }, (_, index) => index)
  if (sourceIndices.length < 2) return source.clone()

  const vertexCount = sourceIndices.length * 2
  const geometry = new BufferGeometry()

  for (const [name, attribute] of Object.entries(source.attributes)) {
    const sourceAttribute = attribute as ReadableAttribute
    const values = new Float32Array(vertexCount * sourceAttribute.itemSize)

    for (let index = 0; index < sourceIndices.length; index += 1) {
      const start = sourceIndices[index]!
      const end = sourceIndices[(index + 1) % sourceIndices.length]!
      copyAttributeVertex(sourceAttribute, start, values, index * 2)
      copyAttributeVertex(sourceAttribute, end, values, index * 2 + 1)
    }

    geometry.setAttribute(
      name,
      new BufferAttribute(values, sourceAttribute.itemSize, sourceAttribute.normalized),
    )
  }

  if (source.boundingBox) geometry.boundingBox = source.boundingBox.clone()
  geometry.computeBoundingSphere()
  return geometry
}

function copyAttributeVertex(
  attribute: ReadableAttribute,
  sourceIndex: number,
  target: Float32Array,
  targetIndex: number,
): void {
  const targetOffset = targetIndex * attribute.itemSize
  for (let component = 0; component < attribute.itemSize; component += 1) {
    target[targetOffset + component] = readAttributeComponent(attribute, sourceIndex, component)
  }
}

function readAttributeComponent(
  attribute: ReadableAttribute,
  index: number,
  component: number,
): number {
  switch (component) {
    case 0:
      return attribute.getX(index)
    case 1:
      return attribute.getY(index)
    case 2:
      return attribute.getZ(index)
    case 3:
      return attribute.getW(index)
    default:
      return 0
  }
}
