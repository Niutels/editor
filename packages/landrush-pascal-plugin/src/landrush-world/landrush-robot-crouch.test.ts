import { describe, expect, test } from 'bun:test'
import { Bone, Group, Vector3 } from 'three'
import {
  applyLandrushRobotCrouchPose,
  createLandrushRobotCrouchRig,
  resetLandrushRobotCrouchPose,
} from './landrush-robot-crouch'

function createRobotRig() {
  const root = new Group()
  const armature = new Group()
  armature.scale.setScalar(0.01)
  root.add(armature)
  const hips = new Bone()
  hips.name = 'Hips'
  hips.position.y = 90
  armature.add(hips)

  for (const side of ['Left', 'Right']) {
    const upperLeg = new Bone()
    upperLeg.name = `${side}UpLeg`
    upperLeg.position.set(side === 'Left' ? 12 : -12, 0, 0)
    const leg = new Bone()
    leg.name = `${side}Leg`
    leg.position.y = -35
    const foot = new Bone()
    foot.name = `${side}Foot`
    foot.position.y = -42
    const toe = new Bone()
    toe.name = `${side}ToeBase`
    toe.position.set(0, -8, 12)
    hips.add(upperLeg)
    upperLeg.add(leg)
    leg.add(foot)
    foot.add(toe)
  }

  let spineParent: Bone = hips
  for (const name of ['Spine02', 'Spine01', 'Spine']) {
    const spine = new Bone()
    spine.name = name
    spine.position.y = 18
    spineParent.add(spine)
    spineParent = spine
  }
  const head = new Bone()
  head.name = 'Head'
  head.position.y = 36
  spineParent.add(head)
  root.updateWorldMatrix(true, true)
  return root
}

function minimumFootY(root: Group) {
  const point = new Vector3()
  let minimumY = Number.POSITIVE_INFINITY
  root.traverse((child) => {
    if (!child.name.toLowerCase().includes('foot')) return
    minimumY = Math.min(minimumY, child.getWorldPosition(point).y)
  })
  return minimumY
}

function boneVerticalSpan(root: Group) {
  const point = new Vector3()
  let minimumY = Number.POSITIVE_INFINITY
  let maximumY = Number.NEGATIVE_INFINITY
  root.traverse((child) => {
    if (!(child as Bone).isBone) return
    const y = child.getWorldPosition(point).y
    minimumY = Math.min(minimumY, y)
    maximumY = Math.max(maximumY, y)
  })
  return maximumY - minimumY
}

function captureBoneTransforms(root: Group) {
  const transforms: Array<{ name: string; position: number[]; quaternion: number[] }> = []
  root.traverse((child) => {
    if (!(child as Bone).isBone) return
    transforms.push({
      name: child.name,
      position: child.position.toArray(),
      quaternion: child.quaternion.toArray(),
    })
  })
  return transforms
}

describe('Landrush robot crouch pose', () => {
  test('lowers the body from a fresh mixer pose while keeping the feet near their support plane', () => {
    const root = createRobotRig()
    const rig = createLandrushRobotCrouchRig(root)
    const hips = root.getObjectByName('Hips')!
    const standingHipY = hips.getWorldPosition(new Vector3()).y
    const standingFootY = minimumFootY(root)
    const standingSpan = boneVerticalSpan(root)
    const rootPosition = root.position.clone()
    const rootScale = root.scale.clone()

    applyLandrushRobotCrouchPose(rig, 1)

    expect(hips.getWorldPosition(new Vector3()).y).toBeLessThan(standingHipY - 0.25)
    expect(Math.abs(minimumFootY(root) - standingFootY)).toBeLessThan(0.08)
    expect(standingSpan).toBeGreaterThan(1.6)
    expect(boneVerticalSpan(root)).toBeLessThanOrEqual(0.9)
    expect(root.position.toArray()).toEqual(rootPosition.toArray())
    expect(root.scale.toArray()).toEqual(rootScale.toArray())
  })

  test('restores the exact post-mixer baseline before applying another frame', () => {
    const root = createRobotRig()
    const rig = createLandrushRobotCrouchRig(root)
    const baselineTransforms = captureBoneTransforms(root)

    applyLandrushRobotCrouchPose(rig, 1)
    resetLandrushRobotCrouchPose(rig)

    expect(captureBoneTransforms(root)).toEqual(baselineTransforms)
  })
})
