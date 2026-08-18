'use client'

import { cn } from '@/lib/utils'
import { useLandrushModeController } from './interaction/use-landrush-mode-controller'
import type { LandrushModeControllerProps, LandrushRenderSlot } from './types'
import {
  LandrushCharacterMarker,
  LandrushIslandFadeLayer,
  LandrushModeOverlay,
} from './ui/landrush-overlays'

export function LandrushModeController({
  className,
  children,
  introPanel,
  buildMenu,
  renderCharacter,
  renderIslandFade,
  projectCharacterToScreen,
  showDefaultCharacter = true,
  buildTools,
  activeBuildToolId,
  onBuildToolSelect,
  introTitle,
  introSubtitle,
  showModePill = true,
  ...options
}: LandrushModeControllerProps) {
  const snapshot = useLandrushModeController(options)
  const characterPoint = projectCharacterToScreen?.(snapshot.character.position)

  return (
    <div
      className={cn('relative h-full w-full overflow-hidden', className)}
      data-landrush-mode={snapshot.mode}
    >
      {renderSlot(children, snapshot)}
      {renderIslandFade ? (
        renderIslandFade(snapshot)
      ) : (
        <LandrushIslandFadeLayer snapshot={snapshot} />
      )}
      {renderCharacter ? (
        renderCharacter(snapshot)
      ) : showDefaultCharacter && characterPoint ? (
        <LandrushCharacterMarker point={characterPoint} snapshot={snapshot} />
      ) : null}
      <LandrushModeOverlay
        activeBuildToolId={activeBuildToolId}
        buildMenu={buildMenu}
        buildTools={buildTools}
        introPanel={introPanel}
        introSubtitle={introSubtitle}
        introTitle={introTitle}
        onBuildToolSelect={onBuildToolSelect}
        showModePill={showModePill}
        snapshot={snapshot}
      />
    </div>
  )
}

function renderSlot(
  slot: LandrushRenderSlot | undefined,
  snapshot: ReturnType<typeof useLandrushModeController>,
) {
  return typeof slot === 'function' ? slot(snapshot) : slot
}
