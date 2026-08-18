'use client'

import {
  type AnyNode,
  type AnyNodeId,
  type ItemNode,
  sceneRegistry,
  useScene,
} from '@pascal-app/core'
import { Html } from '@react-three/drei'
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import {
  type CSSProperties,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  DoubleSide,
  type Group,
  type Mesh,
  type Object3D,
  Raycaster,
  Vector2,
  Vector3,
} from 'three'
import {
  resolveSpatialVoiceGain,
  SPATIAL_VOICE_FULL_VOLUME_DISTANCE,
  SPATIAL_VOICE_MAX_DISTANCE,
} from './world-multiplayer-spatial-audio'
import { SpatialVoiceRangeRing } from './world-multiplayer-spatial-voice-range'

type LandrushIslandTvLocalMotion = {
  position: Vector3
}

type LandrushIslandTvEmbed = {
  kind: 'iframe' | 'youtube'
  screenSrc: string
  title: string
}

export type LandrushIslandTvMediaState = {
  muted: boolean
  parcelId: string
  playbackSeconds: number
  playbackUpdatedAt: number
  playing: boolean
  tvId: string
  updatedAt: number
  updatedBy: string
  url: string
  userVolume: number
  worldId: string
}

export type LandrushIslandTvMediaSettings = {
  muted: boolean
  playbackSeconds: number
  playbackUpdatedAt: number
  playing: boolean
  url: string
  userVolume: number
}

const LANDRUSH_ISLAND_TV_DEFAULT_MEDIA = {
  muted: false,
  playbackSeconds: 0,
  playbackUpdatedAt: 0,
  playing: false,
  url: '',
  userVolume: 0.8,
} satisfies LandrushIslandTvMediaSettings

const LANDRUSH_ISLAND_TV_SCREEN_WIDTH_METERS = 1.4626
const LANDRUSH_ISLAND_TV_SCREEN_HEIGHT_METERS = 0.7423
const LANDRUSH_ISLAND_TV_SCREEN_POSITION = [0, 0.6207, -0.025] as const
const LANDRUSH_ISLAND_TV_PROMPT_POSITION = [0, 1.28, 0.04] as const
const LANDRUSH_ISLAND_TV_ITEM_ASSET_ID = 'television'
const LANDRUSH_ISLAND_TV_PROMPT_OFFSET_Y =
  LANDRUSH_ISLAND_TV_PROMPT_POSITION[1] - LANDRUSH_ISLAND_TV_SCREEN_POSITION[1]
const LANDRUSH_ISLAND_TV_PROMPT_OFFSET_Z =
  LANDRUSH_ISLAND_TV_PROMPT_POSITION[2] - LANDRUSH_ISLAND_TV_SCREEN_POSITION[2]
const LANDRUSH_ISLAND_TV_ITEM_SCREEN_FRONT_OFFSET = 0.012
const LANDRUSH_ISLAND_TV_INTERACTION_MARGIN_X_METERS = 0.22
const LANDRUSH_ISLAND_TV_INTERACTION_MARGIN_Y_METERS = 0.18
const LANDRUSH_ISLAND_TV_INTERACTION_DEPTH_METERS = 0.32
const LANDRUSH_ISLAND_TV_IFRAME_WIDTH_PX = 640
const LANDRUSH_ISLAND_TV_IFRAME_HEIGHT_PX = Math.round(
  LANDRUSH_ISLAND_TV_IFRAME_WIDTH_PX *
    (LANDRUSH_ISLAND_TV_SCREEN_HEIGHT_METERS / LANDRUSH_ISLAND_TV_SCREEN_WIDTH_METERS),
)
const LANDRUSH_ISLAND_TV_HTML_DISTANCE_FACTOR =
  (LANDRUSH_ISLAND_TV_SCREEN_WIDTH_METERS * 400) / LANDRUSH_ISLAND_TV_IFRAME_WIDTH_PX
const LANDRUSH_ISLAND_TV_PANEL_DISTANCE_FACTOR = LANDRUSH_ISLAND_TV_HTML_DISTANCE_FACTOR * 1.35
const LANDRUSH_ISLAND_TV_INTERACT_MAX_DISTANCE = 7.5
const LANDRUSH_ISLAND_TV_SOUND_RANGE_MULTIPLIER = 2.5
const LANDRUSH_ISLAND_TV_SOUND_MAX_DISTANCE =
  SPATIAL_VOICE_MAX_DISTANCE * LANDRUSH_ISLAND_TV_SOUND_RANGE_MULTIPLIER
const LANDRUSH_ISLAND_TV_SOUND_FULL_VOLUME_DISTANCE =
  SPATIAL_VOICE_FULL_VOLUME_DISTANCE * LANDRUSH_ISLAND_TV_SOUND_RANGE_MULTIPLIER
const LANDRUSH_ISLAND_TV_VOLUME_SEND_INTERVAL_SECONDS = 0.22
const LANDRUSH_ISLAND_TV_VOLUME_EPSILON = 0.025
const LANDRUSH_ISLAND_TV_PLAYBACK_RESTORE_DELAY_MS = 420
const LANDRUSH_ISLAND_TV_PLAYBACK_DRIFT_SEEK_SECONDS = 1.25
const LANDRUSH_ISLAND_TV_PLAYBACK_SEEK_PUBLISH_SECONDS = 1.5
const LANDRUSH_ISLAND_TV_PLAYBACK_CORRECTION_INTERVAL_MS = 8000
const LANDRUSH_ISLAND_TV_LOCAL_PLAY_GAIN_EPSILON = 0.001
const LANDRUSH_ISLAND_TV_OCCLUSION_CANDIDATE_REFRESH_SECONDS = 0.35
const LANDRUSH_ISLAND_TV_SCREEN_OCCLUSION_INTERVAL_SECONDS = 0.1

const playerSlotStyle = {
  background: '#020617',
  border: 0,
  display: 'block',
  height: '100%',
  width: '100%',
} satisfies CSSProperties

const frameWrapStyle = {
  background: '#020617',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 4,
  boxShadow: '0 0 22px rgba(255,255,255,0.18)',
  height: LANDRUSH_ISLAND_TV_IFRAME_HEIGHT_PX,
  overflow: 'hidden',
  width: LANDRUSH_ISLAND_TV_IFRAME_WIDTH_PX,
} satisfies CSSProperties

const centerScreenPoint = new Vector2(0, 0)

export function LandrushIslandPlacedTvScreens({
  enabled = true,
  localMotionRef,
  mediaStates = [],
  onMediaStateChange,
}: {
  enabled?: boolean
  localMotionRef?: { readonly current: LandrushIslandTvLocalMotion | null }
  mediaStates?: readonly LandrushIslandTvMediaState[]
  onMediaStateChange?: (
    parcelId: string,
    tvId: string,
    media: LandrushIslandTvMediaSettings,
  ) => void
}) {
  const [televisions, setTelevisions] = useState(() =>
    selectLandrushIslandTvItems(useScene.getState().nodes),
  )

  useEffect(() => {
    const syncTelevisions = (nodes: Record<AnyNodeId, AnyNode>) => {
      const nextTelevisions = selectLandrushIslandTvItems(nodes)
      setTelevisions((currentTelevisions) =>
        areLandrushIslandTvItemListsEqual(currentTelevisions, nextTelevisions)
          ? currentTelevisions
          : nextTelevisions,
      )
    }

    syncTelevisions(useScene.getState().nodes)
    return useScene.subscribe((state, previousState) => {
      if (state.nodes === previousState.nodes) return
      syncTelevisions(state.nodes)
    })
  }, [])

  const mediaStateByTvId = useMemo(
    () => new Map(mediaStates.map((state) => [state.tvId, state])),
    [mediaStates],
  )

  if (!enabled || televisions.length === 0) return null

  return (
    <>
      {televisions.map((item) => (
        <LandrushIslandPlacedTvScreen
          item={item}
          key={item.id}
          localMotionRef={localMotionRef}
          mediaState={mediaStateByTvId.get(item.id)}
          onMediaStateChange={onMediaStateChange}
        />
      ))}
    </>
  )
}

export function LandrushIslandTvScreens({
  enabled = true,
  localMotionRef,
  position,
  videoUrlOrId,
}: {
  enabled?: boolean
  localMotionRef?: { readonly current: LandrushIslandTvLocalMotion | null }
  position: readonly [number, number, number]
  videoUrlOrId: string
}) {
  const [media, setMedia] = useState<LandrushIslandTvMediaSettings>(() => ({
    ...LANDRUSH_ISLAND_TV_DEFAULT_MEDIA,
    playbackUpdatedAt: Date.now(),
    playing: Boolean(videoUrlOrId),
    url: videoUrlOrId,
  }))
  const embed = useMemo(() => resolveLandrushIslandTvEmbed(media.url), [media.url])

  useEffect(() => {
    setMedia((current) => ({
      ...current,
      playbackSeconds: 0,
      playbackUpdatedAt: Date.now(),
      playing: Boolean(videoUrlOrId),
      url: videoUrlOrId,
    }))
  }, [videoUrlOrId])

  if (!enabled) return null

  return (
    <LandrushIslandTvScreen
      embed={embed}
      localMotionRef={localMotionRef}
      media={media}
      onMediaStateChange={setMedia}
      position={position}
    />
  )
}

function LandrushIslandTvScreen({
  embed,
  fixtureVisible = true,
  localMotionRef,
  media,
  onMediaStateChange,
  position,
  rotation,
  scale,
  occlusionRootRef,
  interactionBounds,
  rangeVisible = true,
  screenPosition = LANDRUSH_ISLAND_TV_SCREEN_POSITION,
}: {
  embed: LandrushIslandTvEmbed | null
  fixtureVisible?: boolean
  localMotionRef?: { readonly current: LandrushIslandTvLocalMotion | null }
  media: LandrushIslandTvMediaSettings
  onMediaStateChange: (media: LandrushIslandTvMediaSettings) => void
  position: readonly [number, number, number]
  rotation?: readonly [number, number, number]
  scale?: readonly [number, number, number]
  occlusionRootRef?: { readonly current: Object3D | null }
  interactionBounds?: {
    position: readonly [number, number, number]
    size: readonly [number, number, number]
  }
  rangeVisible?: boolean
  screenPosition?: readonly [number, number, number]
}) {
  const { gl, camera, scene } = useThree()
  const tvGroupRef = useRef<Group | null>(null)
  const screenMeshRef = useRef<Mesh | null>(null)
  const interactionMeshRef = useRef<Mesh | null>(null)
  const playerIframeRef = useRef<HTMLIFrameElement | null>(null)
  const playerHostFrameRef = useRef<number | null>(null)
  const screenPlayerSlotRef = useRef<HTMLDivElement | null>(null)
  const panelPlayerSlotRef = useRef<HTMLDivElement | null>(null)
  const raycasterRef = useRef(new Raycaster())
  const occlusionDirectionRef = useRef(new Vector3())
  const occlusionCandidatesRef = useRef<Object3D[]>([])
  const lastOcclusionCandidateRefreshAtRef = useRef(Number.NEGATIVE_INFINITY)
  const lastScreenOcclusionCheckAtRef = useRef(Number.NEGATIVE_INFINITY)
  const mediaRef = useRef(media)
  const spatialGainRef = useRef(0)
  const tvWorldPositionRef = useRef(new Vector3())
  const tvGroupWorldPositionRef = useRef(new Vector3())
  const tvRingMotionRef = useRef({ position: new Vector3() })
  const rangeGroundYRef = useRef(position[1])
  const aimedRef = useRef(false)
  const promptVisibleRef = useRef(false)
  const screenOccludedRef = useRef(false)
  const interactingRef = useRef(false)
  const restorePointerLockAfterInteractionRef = useRef(false)
  const lastSentVolumeRef = useRef(-1)
  const lastSentMutedRef = useRef(false)
  const lastSentVolumeAtRef = useRef(0)
  const lastYoutubePlaybackSecondsRef = useRef(0)
  const lastYoutubePlayingRef = useRef(true)
  const lastLocalYoutubePlayingRef = useRef(false)
  const lastYoutubePlayerStateRef = useRef<number | null>(null)
  const lastObservedYoutubePlaybackRef = useRef<{
    observedAt: number
    playing: boolean
    seconds: number
  } | null>(null)
  const lastPublishedYoutubePlaybackRef = useRef<{
    playbackUpdatedAt: number
    playing: boolean
    seconds: number
  }>({ playbackUpdatedAt: 0, playing: false, seconds: 0 })
  const suppressYoutubePlaybackPublishUntilRef = useRef(0)
  const [aimed, setAimed] = useState(false)
  const [promptVisible, setPromptVisible] = useState(false)
  const [screenOccluded, setScreenOccluded] = useState(false)
  const [interacting, setInteracting] = useState(false)
  const [draftUrl, setDraftUrl] = useState(media.url)
  const [rangeGroundY, setRangeGroundY] = useState(position[1])
  const [urlError, setUrlError] = useState<string | null>(null)
  const promptPosition = useMemo(
    () =>
      [
        screenPosition[0],
        screenPosition[1] + LANDRUSH_ISLAND_TV_PROMPT_OFFSET_Y,
        screenPosition[2] + LANDRUSH_ISLAND_TV_PROMPT_OFFSET_Z,
      ] as const,
    [screenPosition],
  )

  const scheduleYoutubePlaybackRestore = useCallback(() => {
    if (embed?.kind !== 'youtube') return
    const iframe = playerIframeRef.current
    if (!iframe) return

    window.setTimeout(() => {
      if (playerIframeRef.current !== iframe) return
      const media = mediaRef.current
      const playbackSeconds = resolveLandrushIslandTvEffectivePlaybackSeconds(media)
      const shouldPlay = shouldLandrushIslandTvPlayLocally(
        media,
        spatialGainRef.current,
        interactingRef.current,
      )
      suppressYoutubePlaybackPublishUntilRef.current =
        Date.now() + LANDRUSH_ISLAND_TV_PLAYBACK_RESTORE_DELAY_MS
      if (shouldPlay) sendLandrushIslandYoutubeSeek(iframe, playbackSeconds)
      sendLandrushIslandYoutubePlayback(iframe, shouldPlay)
      lastLocalYoutubePlayingRef.current = shouldPlay
      if (!shouldPlay) sendLandrushIslandYoutubeVolume(iframe, 0, true)
    }, LANDRUSH_ISLAND_TV_PLAYBACK_RESTORE_DELAY_MS)
  }, [embed?.kind])

  const syncPlayerHost = useCallback(() => {
    const iframe = playerIframeRef.current
    const target = interactingRef.current ? panelPlayerSlotRef.current : screenPlayerSlotRef.current
    if (!iframe || !target) return

    if (iframe.parentElement !== target) {
      target.appendChild(iframe)
      scheduleYoutubePlaybackRestore()
    }
    iframe.style.pointerEvents = interactingRef.current ? 'auto' : 'none'
  }, [scheduleYoutubePlaybackRestore])

  const schedulePlayerHostSync = useCallback(() => {
    if (playerHostFrameRef.current !== null) return
    playerHostFrameRef.current = window.requestAnimationFrame(() => {
      playerHostFrameRef.current = null
      syncPlayerHost()
    })
  }, [syncPlayerHost])

  const assignScreenPlayerSlot = useCallback(
    (node: HTMLDivElement | null) => {
      screenPlayerSlotRef.current = node
      schedulePlayerHostSync()
    },
    [schedulePlayerHostSync],
  )

  const assignPanelPlayerSlot = useCallback(
    (node: HTMLDivElement | null) => {
      panelPlayerSlotRef.current = node
      schedulePlayerHostSync()
    },
    [schedulePlayerHostSync],
  )

  const openInteraction = useCallback(() => {
    setDraftUrl(mediaRef.current.url)
    setUrlError(null)
    setInteracting(true)
    const hadPointerLock = document.pointerLockElement === gl.domElement
    restorePointerLockAfterInteractionRef.current = hadPointerLock
    if (hadPointerLock) document.exitPointerLock()
  }, [gl])

  const closeInteraction = useCallback(() => {
    setInteracting(false)
    if (!restorePointerLockAfterInteractionRef.current) return
    restorePointerLockAfterInteractionRef.current = false
    requestLandrushIslandTvPointerLock(gl.domElement)
  }, [gl])

  const handleLoad = useCallback(
    (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault()
      const nextUrl = draftUrl.trim()
      if (!resolveLandrushIslandTvEmbed(nextUrl)) {
        setUrlError('Enter a YouTube or https URL')
        return
      }
      setUrlError(null)
      const now = Date.now()
      const nextMedia = {
        ...mediaRef.current,
        playbackSeconds: 0,
        playbackUpdatedAt: now,
        playing: true,
        url: nextUrl,
      }
      lastYoutubePlaybackSecondsRef.current = 0
      lastYoutubePlayingRef.current = true
      lastPublishedYoutubePlaybackRef.current = {
        playbackUpdatedAt: now,
        playing: true,
        seconds: 0,
      }
      mediaRef.current = nextMedia
      onMediaStateChange(nextMedia)
    },
    [draftUrl, onMediaStateChange],
  )

  useEffect(() => {
    mediaRef.current = media
    lastYoutubePlaybackSecondsRef.current = resolveLandrushIslandTvEffectivePlaybackSeconds(media)
    lastYoutubePlayingRef.current = media.playing
    lastPublishedYoutubePlaybackRef.current = {
      playbackUpdatedAt: Date.now(),
      playing: media.playing,
      seconds: lastYoutubePlaybackSecondsRef.current,
    }
  }, [media])

  useEffect(() => {
    aimedRef.current = aimed
  }, [aimed])

  useEffect(() => {
    interactingRef.current = interacting
    schedulePlayerHostSync()
  }, [interacting, schedulePlayerHostSync])

  useEffect(() => {
    if (interacting) setDraftUrl(media.url)
  }, [interacting, media.url])

  useEffect(() => {
    const handleLayoutChange = () => schedulePlayerHostSync()
    window.addEventListener('resize', handleLayoutChange)
    return () => {
      window.removeEventListener('resize', handleLayoutChange)
    }
  }, [schedulePlayerHostSync])

  useEffect(() => {
    return () => {
      if (playerHostFrameRef.current !== null) {
        window.cancelAnimationFrame(playerHostFrameRef.current)
        playerHostFrameRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape' && interactingRef.current) {
        event.preventDefault()
        event.stopImmediatePropagation()
        closeInteraction()
        return
      }

      if (isLandrushIslandTvEditableTarget(event.target)) return

      if (event.code !== 'KeyE' || !aimedRef.current) return
      event.preventDefault()
      event.stopImmediatePropagation()
      openInteraction()
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [closeInteraction, openInteraction])

  useEffect(() => {
    if (!embed) {
      playerIframeRef.current?.remove()
      playerIframeRef.current = null
      lastLocalYoutubePlayingRef.current = false
      schedulePlayerHostSync()
      return
    }

    const iframe = document.createElement('iframe')
    const handleLoad = () => scheduleYoutubePlaybackRestore()
    iframe.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture'
    iframe.loading = 'eager'
    iframe.referrerPolicy = 'strict-origin-when-cross-origin'
    iframe.src = embed.screenSrc
    iframe.title = `${embed.title} on TV`
    iframe.addEventListener('load', handleLoad)
    Object.assign(iframe.style, playerSlotStyle)
    playerIframeRef.current = iframe
    lastSentVolumeRef.current = -1
    lastSentMutedRef.current = false
    lastYoutubePlaybackSecondsRef.current = resolveLandrushIslandTvEffectivePlaybackSeconds(
      mediaRef.current,
    )
    lastYoutubePlayingRef.current = mediaRef.current.playing
    lastLocalYoutubePlayingRef.current = false
    schedulePlayerHostSync()

    return () => {
      iframe.removeEventListener('load', handleLoad)
      iframe.remove()
      if (playerIframeRef.current === iframe) {
        playerIframeRef.current = null
      }
      schedulePlayerHostSync()
    }
  }, [embed, schedulePlayerHostSync, scheduleYoutubePlaybackRestore])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const iframeWindow = playerIframeRef.current?.contentWindow
      if (!iframeWindow || event.source !== iframeWindow) return

      const info = parseLandrushIslandYoutubeInfoDelivery(event.data)
      if (!info) return

      const now = Date.now()
      let playbackChangedByInteraction = false
      if (typeof info.currentTime === 'number') {
        const nextSeconds = Math.max(0, info.currentTime)
        const previousObservation = lastObservedYoutubePlaybackRef.current
        if (previousObservation) {
          const expectedSeconds = previousObservation.playing
            ? previousObservation.seconds + (now - previousObservation.observedAt) / 1000
            : previousObservation.seconds
          playbackChangedByInteraction =
            interactingRef.current &&
            Math.abs(nextSeconds - expectedSeconds) >=
              LANDRUSH_ISLAND_TV_PLAYBACK_SEEK_PUBLISH_SECONDS
        }
        lastYoutubePlaybackSecondsRef.current = nextSeconds
      }
      if (typeof info.playerState === 'number') {
        const nextPlaying = isLandrushIslandYoutubePlayerStatePlaying(info.playerState)
        if (
          lastYoutubePlayerStateRef.current !== null &&
          nextPlaying !== lastYoutubePlayingRef.current
        ) {
          playbackChangedByInteraction = interactingRef.current
        }
        lastYoutubePlayerStateRef.current = info.playerState
        lastYoutubePlayingRef.current = nextPlaying
      }
      if (typeof info.currentTime === 'number') {
        lastObservedYoutubePlaybackRef.current = {
          observedAt: now,
          playing: lastYoutubePlayingRef.current,
          seconds: lastYoutubePlaybackSecondsRef.current,
        }
      }

      const current = mediaRef.current
      const volumeMedia = {
        ...current,
        muted:
          interactingRef.current && typeof info.muted === 'boolean' ? info.muted : current.muted,
        userVolume:
          interactingRef.current && typeof info.volume === 'number'
            ? clampLandrushIslandTvVolume(info.volume / 100)
            : current.userVolume,
      }
      const volumeOrMuteChanged = !areLandrushIslandTvVolumeSettingsEqual(current, volumeMedia)
      const lastPublished = lastPublishedYoutubePlaybackRef.current
      const expectedPublishedSeconds = lastPublished.playing
        ? lastPublished.seconds + (now - lastPublished.playbackUpdatedAt) / 1000
        : lastPublished.seconds
      const correctionDue =
        interactingRef.current &&
        lastYoutubePlayingRef.current &&
        now - lastPublished.playbackUpdatedAt >=
          LANDRUSH_ISLAND_TV_PLAYBACK_CORRECTION_INTERVAL_MS &&
        Math.abs(lastYoutubePlaybackSecondsRef.current - expectedPublishedSeconds) >= 0.75
      const shouldPublishPlayback =
        now >= suppressYoutubePlaybackPublishUntilRef.current &&
        (playbackChangedByInteraction || correctionDue)
      if (!volumeOrMuteChanged && !shouldPublishPlayback) return

      const nextMedia = shouldPublishPlayback
        ? {
            ...volumeMedia,
            playbackSeconds: lastYoutubePlaybackSecondsRef.current,
            playbackUpdatedAt: now,
            playing: lastYoutubePlayingRef.current,
          }
        : volumeMedia
      mediaRef.current = nextMedia
      if (shouldPublishPlayback) {
        lastPublishedYoutubePlaybackRef.current = {
          playbackUpdatedAt: now,
          playing: nextMedia.playing,
          seconds: nextMedia.playbackSeconds,
        }
      }
      onMediaStateChange(nextMedia)
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [onMediaStateChange])

  useEffect(() => {
    if (embed?.kind !== 'youtube') return

    const iframe = playerIframeRef.current
    if (!iframe) return

    const targetSeconds = resolveLandrushIslandTvEffectivePlaybackSeconds(media)
    const currentSeconds = lastYoutubePlaybackSecondsRef.current
    const shouldPlay = shouldLandrushIslandTvPlayLocally(
      media,
      spatialGainRef.current,
      interactingRef.current,
    )
    suppressYoutubePlaybackPublishUntilRef.current =
      Date.now() + LANDRUSH_ISLAND_TV_PLAYBACK_RESTORE_DELAY_MS

    if (
      shouldPlay &&
      Math.abs(targetSeconds - currentSeconds) >= LANDRUSH_ISLAND_TV_PLAYBACK_DRIFT_SEEK_SECONDS
    ) {
      sendLandrushIslandYoutubeSeek(iframe, targetSeconds)
      lastYoutubePlaybackSecondsRef.current = targetSeconds
    }
    sendLandrushIslandYoutubePlayback(iframe, shouldPlay)
    lastLocalYoutubePlayingRef.current = shouldPlay
    if (!shouldPlay) sendLandrushIslandYoutubeVolume(iframe, 0, true)
    lastYoutubePlayingRef.current = media.playing
  }, [embed?.kind, media])

  useFrame(({ clock }) => {
    const screenMesh = screenMeshRef.current
    if (!screenMesh) return

    screenMesh.getWorldPosition(tvWorldPositionRef.current)
    tvRingMotionRef.current.position.copy(tvWorldPositionRef.current)
    tvGroupRef.current?.getWorldPosition(tvGroupWorldPositionRef.current)
    const nextRangeGroundY = tvGroupRef.current ? tvGroupWorldPositionRef.current.y : position[1]
    if (Math.abs(nextRangeGroundY - rangeGroundYRef.current) > 0.01) {
      rangeGroundYRef.current = nextRangeGroundY
      setRangeGroundY(nextRangeGroundY)
    }

    const raycaster = raycasterRef.current
    if (
      clock.elapsedTime - lastOcclusionCandidateRefreshAtRef.current >=
      LANDRUSH_ISLAND_TV_OCCLUSION_CANDIDATE_REFRESH_SECONDS
    ) {
      occlusionCandidatesRef.current = collectLandrushIslandTvOcclusionCandidates(scene)
      lastOcclusionCandidateRefreshAtRef.current = clock.elapsedTime
    }

    const screenDistance = camera.position.distanceTo(tvWorldPositionRef.current)
    if (
      clock.elapsedTime - lastScreenOcclusionCheckAtRef.current >=
      LANDRUSH_ISLAND_TV_SCREEN_OCCLUSION_INTERVAL_SECONDS
    ) {
      lastScreenOcclusionCheckAtRef.current = clock.elapsedTime
      const screenOcclusionHit = firstLandrushIslandTvOcclusionHit({
        candidates: occlusionCandidatesRef.current,
        direction: occlusionDirectionRef.current
          .copy(tvWorldPositionRef.current)
          .sub(camera.position)
          .normalize(),
        distance: screenDistance,
        ignoredRoots: [tvGroupRef.current, occlusionRootRef?.current ?? null],
        raycaster,
        source: camera.position,
      })
      const nextScreenOccluded =
        screenOcclusionHit !== null && screenOcclusionHit.distance < screenDistance - 0.04
      if (nextScreenOccluded !== screenOccludedRef.current) {
        screenOccludedRef.current = nextScreenOccluded
        setScreenOccluded(nextScreenOccluded)
      }
    }

    raycaster.setFromCamera(centerScreenPoint, camera)
    const interactionMesh = interactionMeshRef.current ?? screenMesh
    const hit = raycaster.intersectObject(interactionMesh, false)[0]
    const aimOcclusionHit = hit
      ? firstLandrushIslandTvOcclusionHit({
          candidates: occlusionCandidatesRef.current,
          direction: raycaster.ray.direction,
          distance: hit.distance,
          ignoredRoots: [tvGroupRef.current, occlusionRootRef?.current ?? null],
          raycaster,
          source: raycaster.ray.origin,
        })
      : null
    const hasAimHit = hit !== undefined
    const withinInteractDistance =
      hasAimHit && hit.distance <= LANDRUSH_ISLAND_TV_INTERACT_MAX_DISTANCE
    const aimLineClear =
      !hasAimHit || aimOcclusionHit === null || aimOcclusionHit.distance >= hit.distance - 0.04
    const notInteracting = !interactingRef.current
    const nextAimed = hasAimHit && withinInteractDistance && aimLineClear && notInteracting
    if (nextAimed !== aimedRef.current) {
      aimedRef.current = nextAimed
      setAimed(nextAimed)
    }
    const nextPromptVisible = nextAimed
    if (nextPromptVisible !== promptVisibleRef.current) {
      promptVisibleRef.current = nextPromptVisible
      setPromptVisible(nextPromptVisible)
    }

    const localMotion = localMotionRef?.current
    const voiceDistance = localMotion
      ? Math.hypot(
          tvWorldPositionRef.current.x - localMotion.position.x,
          tvWorldPositionRef.current.z - localMotion.position.z,
        )
      : LANDRUSH_ISLAND_TV_SOUND_MAX_DISTANCE
    const gain =
      embed?.kind === 'youtube'
        ? resolveSpatialVoiceGain(voiceDistance, {
            fullVolumeDistance: LANDRUSH_ISLAND_TV_SOUND_FULL_VOLUME_DISTANCE,
            maxDistance: LANDRUSH_ISLAND_TV_SOUND_MAX_DISTANCE,
          })
        : 0
    spatialGainRef.current = gain
    const shouldPlayLocally =
      embed?.kind === 'youtube' &&
      shouldLandrushIslandTvPlayLocally(mediaRef.current, gain, interactingRef.current)
    if (embed?.kind === 'youtube' && shouldPlayLocally !== lastLocalYoutubePlayingRef.current) {
      const iframe = playerIframeRef.current
      lastLocalYoutubePlayingRef.current = shouldPlayLocally
      suppressYoutubePlaybackPublishUntilRef.current =
        Date.now() + LANDRUSH_ISLAND_TV_PLAYBACK_RESTORE_DELAY_MS
      if (shouldPlayLocally) {
        const targetSeconds = resolveLandrushIslandTvEffectivePlaybackSeconds(mediaRef.current)
        if (
          Math.abs(targetSeconds - lastYoutubePlaybackSecondsRef.current) >=
          LANDRUSH_ISLAND_TV_PLAYBACK_DRIFT_SEEK_SECONDS
        ) {
          sendLandrushIslandYoutubeSeek(iframe, targetSeconds)
          lastYoutubePlaybackSecondsRef.current = targetSeconds
        }
      }
      sendLandrushIslandYoutubePlayback(iframe, shouldPlayLocally)
    }
    const nextVolume = shouldPlayLocally
      ? resolveLandrushIslandTvEffectiveVolume(mediaRef.current, gain, interactingRef.current)
      : 0
    const nextMuted = mediaRef.current.muted || !shouldPlayLocally || nextVolume <= 0
    const elapsedSinceVolumeSend = clock.elapsedTime - lastSentVolumeAtRef.current
    if (
      embed?.kind === 'youtube' &&
      !interactingRef.current &&
      (elapsedSinceVolumeSend >= LANDRUSH_ISLAND_TV_VOLUME_SEND_INTERVAL_SECONDS ||
        Math.abs(nextVolume - lastSentVolumeRef.current) >= LANDRUSH_ISLAND_TV_VOLUME_EPSILON ||
        nextMuted !== lastSentMutedRef.current)
    ) {
      lastSentVolumeAtRef.current = clock.elapsedTime
      lastSentVolumeRef.current = nextVolume
      lastSentMutedRef.current = nextMuted
      sendLandrushIslandYoutubeVolume(playerIframeRef.current, nextVolume, nextMuted)
    }
    if (embed) schedulePlayerHostSync()
  })

  useEffect(() => {
    if (embed?.kind !== 'youtube') return
    const shouldPlay = shouldLandrushIslandTvPlayLocally(media, spatialGainRef.current, interacting)
    const nextVolume = shouldPlay
      ? resolveLandrushIslandTvEffectiveVolume(media, spatialGainRef.current, interacting)
      : 0
    const nextMuted = media.muted || !shouldPlay || nextVolume <= 0
    lastSentVolumeRef.current = nextVolume
    lastSentMutedRef.current = nextMuted
    sendLandrushIslandYoutubeVolume(playerIframeRef.current, nextVolume, nextMuted)
  }, [embed?.kind, interacting, media])

  const screen = (
    <group
      position={position}
      ref={tvGroupRef}
      rotation={rotation}
      scale={scale}
      userData={{ pascalExcludeFromToolConeTarget: true }}
    >
      {fixtureVisible ? (
        <>
          <mesh
            position={[0, LANDRUSH_ISLAND_TV_SCREEN_POSITION[1], -0.055]}
            renderOrder={7}
            userData={{ pascalExcludeFromToolConeTarget: true }}
          >
            <boxGeometry args={[1.72, 0.92, 0.08]} />
            <meshStandardMaterial color="#111827" roughness={0.76} metalness={0.18} />
          </mesh>
          <mesh
            position={[0, 0.18, -0.06]}
            renderOrder={6}
            userData={{ pascalExcludeFromToolConeTarget: true }}
          >
            <boxGeometry args={[0.16, 0.36, 0.12]} />
            <meshStandardMaterial color="#0f172a" roughness={0.82} metalness={0.12} />
          </mesh>
          <mesh
            position={[0, 0.02, -0.06]}
            renderOrder={6}
            userData={{ pascalExcludeFromToolConeTarget: true }}
          >
            <boxGeometry args={[0.8, 0.04, 0.32]} />
            <meshStandardMaterial color="#111827" roughness={0.84} metalness={0.1} />
          </mesh>
        </>
      ) : null}
      {interactionBounds ? (
        <mesh
          position={interactionBounds.position}
          ref={interactionMeshRef}
          renderOrder={12}
          userData={{ pascalExcludeFromToolConeTarget: true }}
          visible={false}
        >
          <boxGeometry args={interactionBounds.size} />
          <meshBasicMaterial side={DoubleSide} />
        </mesh>
      ) : null}
      <mesh
        position={screenPosition}
        ref={screenMeshRef}
        renderOrder={8}
        userData={{ pascalExcludeFromToolConeTarget: true }}
      >
        <planeGeometry
          args={[LANDRUSH_ISLAND_TV_SCREEN_WIDTH_METERS, LANDRUSH_ISLAND_TV_SCREEN_HEIGHT_METERS]}
        />
        <meshBasicMaterial
          color={embed ? '#ffffff' : '#020617'}
          opacity={embed ? 0.24 : fixtureVisible ? 0.62 : 0.01}
          side={DoubleSide}
          toneMapped={false}
          transparent
        />
      </mesh>
      {embed ? (
        <Html
          center
          distanceFactor={LANDRUSH_ISLAND_TV_HTML_DISTANCE_FACTOR}
          pointerEvents={interacting ? 'auto' : 'none'}
          position={screenPosition}
          transform
          zIndexRange={[30, 0]}
        >
          <div
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            style={{
              ...frameWrapStyle,
              pointerEvents: interacting ? 'auto' : 'none',
              visibility: screenOccluded && !interacting ? 'hidden' : 'visible',
            }}
          >
            <div ref={assignScreenPlayerSlot} style={playerSlotStyle} />
          </div>
        </Html>
      ) : null}
      {promptVisible ? (
        <LandrushIslandTvAimPrompt onInteract={openInteraction} position={promptPosition} />
      ) : null}
    </group>
  )

  return (
    <>
      {createPortal(
        <SpatialVoiceRangeRing
          color="#38bdf8"
          groundY={rangeGroundY}
          motionRef={tvRingMotionRef}
          radiusMeters={LANDRUSH_ISLAND_TV_SOUND_MAX_DISTANCE}
          visible={rangeVisible && Boolean(embed)}
        />,
        scene,
      )}
      {screen}
      {interacting ? (
        <LandrushIslandTvInteractionPanel
          draftUrl={draftUrl}
          embed={embed}
          onClose={closeInteraction}
          onDraftUrlChange={setDraftUrl}
          onLoad={handleLoad}
          onPlayerHostReady={assignPanelPlayerSlot}
          open={interacting}
          urlError={urlError}
        />
      ) : null}
    </>
  )
}

function LandrushIslandPlacedTvScreen({
  item,
  localMotionRef,
  mediaState,
  onMediaStateChange,
}: {
  item: ItemNode
  localMotionRef?: { readonly current: LandrushIslandTvLocalMotion | null }
  mediaState?: LandrushIslandTvMediaState
  onMediaStateChange?: (
    parcelId: string,
    tvId: string,
    media: LandrushIslandTvMediaSettings,
  ) => void
}) {
  const [localMedia, setLocalMedia] = useState<LandrushIslandTvMediaSettings>(
    LANDRUSH_ISLAND_TV_DEFAULT_MEDIA,
  )
  const [itemVisible, setItemVisible] = useState(false)
  const itemWorldGroupRef = useRef<Group | null>(null)
  const itemSceneObjectRef = useRef<Object3D | null>(null)
  const itemVisibleRef = useRef(false)
  const parcelId = resolveLandrushIslandTvParcelId(item)
  const media = useMemo(
    () => (mediaState ? mediaSettingsFromTvState(mediaState) : localMedia),
    [localMedia, mediaState],
  )
  const embed = useMemo(() => resolveLandrushIslandTvEmbed(media.url), [media.url])
  const assetScale = useMemo(
    () => multiplyLandrushIslandTvScales(item.asset.scale, item.scale),
    [item.asset.scale, item.scale],
  )
  const screenPosition = useMemo(
    () => resolveLandrushIslandPlacedTvScreenPosition(item.asset.dimensions),
    [item.asset.dimensions],
  )
  const interactionArea = useMemo(
    () => resolveLandrushIslandPlacedTvInteractionBounds(screenPosition),
    [screenPosition],
  )
  const handleMediaStateChange = useCallback(
    (nextMedia: LandrushIslandTvMediaSettings) => {
      setLocalMedia(nextMedia)
      if (!parcelId) return
      onMediaStateChange?.(parcelId, item.id, nextMedia)
    },
    [item.id, onMediaStateChange, parcelId],
  )

  useFrame(() => {
    const target = sceneRegistry.nodes.get(item.id as AnyNodeId) ?? null
    const group = itemWorldGroupRef.current
    if (!group) return

    if (!target) {
      itemSceneObjectRef.current = null
      group.visible = false
      if (itemVisibleRef.current) {
        itemVisibleRef.current = false
        setItemVisible(false)
      }
      return
    }

    itemSceneObjectRef.current = target
    target.updateWorldMatrix(true, false)
    group.matrix.copy(target.matrixWorld)
    group.matrixWorldNeedsUpdate = true
    const nextVisible = isLandrushIslandTvObjectVisibleInHierarchy(target)
    group.visible = nextVisible
    if (nextVisible !== itemVisibleRef.current) {
      itemVisibleRef.current = nextVisible
      setItemVisible(nextVisible)
    }
  })

  return (
    <group matrixAutoUpdate={false} ref={itemWorldGroupRef} visible={false}>
      <LandrushIslandTvScreen
        embed={embed}
        fixtureVisible={false}
        interactionBounds={interactionArea}
        localMotionRef={localMotionRef}
        media={media}
        occlusionRootRef={itemSceneObjectRef}
        onMediaStateChange={handleMediaStateChange}
        position={item.asset.offset}
        rangeVisible={itemVisible}
        rotation={item.asset.rotation}
        scale={assetScale}
        screenPosition={screenPosition}
      />
    </group>
  )
}

function LandrushIslandTvAimPrompt({
  onInteract,
  position,
}: {
  onInteract: () => void
  position: readonly [number, number, number]
}) {
  return (
    <Html
      center
      distanceFactor={LANDRUSH_ISLAND_TV_PANEL_DISTANCE_FACTOR}
      pointerEvents="auto"
      position={position}
      transform
      zIndexRange={[40, 0]}
    >
      <button
        className="inline-flex h-11 items-center gap-2 rounded-md border border-sky-100/50 bg-slate-950/82 px-3 font-black text-white text-xs uppercase shadow-2xl backdrop-blur-md transition hover:border-sky-100/80 hover:bg-slate-900/88"
        data-landrush-ui
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onInteract()
        }}
        type="button"
      >
        <span className="grid size-7 place-items-center rounded border border-sky-100/55 bg-sky-300 text-slate-950 text-base">
          E
        </span>
        <span>TV</span>
      </button>
    </Html>
  )
}

function isLandrushIslandTvItemNode(node: AnyNode): node is ItemNode {
  if (node.type !== 'item' || node.visible === false || node.asset.attachTo) return false
  const id = node.asset.id.toLowerCase()
  const name = node.asset.name.toLowerCase()
  if (id.includes('stand') || name.includes('stand')) return false
  return (
    id === LANDRUSH_ISLAND_TV_ITEM_ASSET_ID ||
    id.includes('television') ||
    name === 'television' ||
    name === 'tv'
  )
}

function selectLandrushIslandTvItems(nodes: Record<AnyNodeId, AnyNode>) {
  return Object.values(nodes).filter(isLandrushIslandTvItemNode)
}

function areLandrushIslandTvItemListsEqual(a: readonly ItemNode[], b: readonly ItemNode[]) {
  if (a.length !== b.length) return false
  return a.every((item, index) => item === b[index])
}

function resolveLandrushIslandPlacedTvScreenPosition(
  dimensions: readonly [number, number, number],
): [number, number, number] {
  const [, height] = dimensions
  const screenY = height * (LANDRUSH_ISLAND_TV_SCREEN_POSITION[1] / 1.07)
  return [0, screenY, LANDRUSH_ISLAND_TV_SCREEN_POSITION[2]]
}

function resolveLandrushIslandPlacedTvInteractionBounds(
  screenPosition: readonly [number, number, number],
): {
  position: [number, number, number]
  size: [number, number, number]
} {
  return {
    position: [screenPosition[0], screenPosition[1], screenPosition[2]],
    size: [
      LANDRUSH_ISLAND_TV_SCREEN_WIDTH_METERS + LANDRUSH_ISLAND_TV_INTERACTION_MARGIN_X_METERS,
      LANDRUSH_ISLAND_TV_SCREEN_HEIGHT_METERS + LANDRUSH_ISLAND_TV_INTERACTION_MARGIN_Y_METERS,
      LANDRUSH_ISLAND_TV_INTERACTION_DEPTH_METERS + LANDRUSH_ISLAND_TV_ITEM_SCREEN_FRONT_OFFSET * 2,
    ],
  }
}

function multiplyLandrushIslandTvScales(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): [number, number, number] {
  return [a[0] * b[0], a[1] * b[1], a[2] * b[2]]
}

function isLandrushIslandTvObjectVisibleInHierarchy(object: Object3D) {
  let current: Object3D | null = object
  while (current) {
    if (!current.visible) return false
    current = current.parent
  }
  return true
}

function firstLandrushIslandTvOcclusionHit({
  candidates,
  direction,
  distance,
  ignoredRoots,
  raycaster,
  source,
}: {
  candidates: Object3D[]
  direction: Vector3
  distance: number
  ignoredRoots: readonly (Object3D | null)[]
  raycaster: Raycaster
  source: Vector3
}) {
  if (!Number.isFinite(distance) || distance <= 0) return null

  const previousFar = raycaster.far
  raycaster.far = distance
  raycaster.set(source, direction)
  const hit =
    raycaster
      .intersectObjects(candidates, false)
      .find((candidate) => isLandrushIslandTvOcclusionObject(candidate.object, ignoredRoots)) ??
    null
  raycaster.far = previousFar
  return hit
}

function collectLandrushIslandTvOcclusionCandidates(scene: Object3D) {
  const candidates: Object3D[] = []
  scene.traverse((object) => {
    if (isLandrushIslandTvPotentialOcclusionCandidate(object)) candidates.push(object)
  })
  return candidates
}

function isLandrushIslandTvPotentialOcclusionCandidate(object: Object3D) {
  const candidate = object as Object3D & {
    isInstancedMesh?: boolean
    isMesh?: boolean
  }
  if (candidate.isMesh !== true && candidate.isInstancedMesh !== true) return false
  if (!object.visible) return false

  let hasSceneNodeIdentity = false
  let current: Object3D | null = object
  while (current) {
    if (current.userData?.pascalExcludeFromToolConeTarget) return false
    if (current.userData?.landrushRobotOccluder === true) return false
    if (typeof current.userData?.nodeId === 'string') hasSceneNodeIdentity = true
    current = current.parent
  }
  if (!hasSceneNodeIdentity && isLandrushIslandTvTransparentVisualObject(object)) return false
  return true
}

function isLandrushIslandTvOcclusionObject(
  object: Object3D,
  ignoredRoots: readonly (Object3D | null)[],
) {
  let hasSceneNodeIdentity = false
  let current: Object3D | null = object
  while (current) {
    if (ignoredRoots.some((root) => root !== null && current === root)) return false
    if (current.userData?.pascalExcludeFromToolConeTarget) return false
    if (current.userData?.landrushRobotOccluder === true) return false
    if (typeof current.userData?.nodeId === 'string') hasSceneNodeIdentity = true
    current = current.parent
  }
  if (!hasSceneNodeIdentity && isLandrushIslandTvTransparentVisualObject(object)) return false
  return object.visible
}

function isLandrushIslandTvTransparentVisualObject(object: Object3D) {
  const material = (object as Object3D & { material?: unknown }).material
  const materials = Array.isArray(material) ? material : [material]
  return materials.some((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const candidate = entry as {
      depthWrite?: unknown
      opacity?: unknown
      transparent?: unknown
      userData?: Object3D['userData']
    }
    if (candidate.userData?.landrushRobotScreenRevealSoftMask === true) return true
    if (candidate.transparent !== true) return false
    if (candidate.depthWrite === false) return true
    return typeof candidate.opacity === 'number' && candidate.opacity < 0.999
  })
}

function resolveLandrushIslandTvParcelId(item: ItemNode) {
  const metadata = item.metadata as { landrushParcelId?: unknown } | undefined
  return typeof metadata?.landrushParcelId === 'string' ? metadata.landrushParcelId : null
}

function mediaSettingsFromTvState(
  state: LandrushIslandTvMediaState,
): LandrushIslandTvMediaSettings {
  return {
    muted: state.muted,
    playbackSeconds: Math.max(0, finiteLandrushIslandTvNumber(state.playbackSeconds, 0)),
    playbackUpdatedAt: Math.max(0, finiteLandrushIslandTvNumber(state.playbackUpdatedAt, 0)),
    playing: state.playing,
    url: state.url,
    userVolume: clampLandrushIslandTvVolume(state.userVolume),
  }
}

type LandrushIslandTvInteractionPanelProps = {
  draftUrl: string
  embed: LandrushIslandTvEmbed | null
  onClose: () => void
  onDraftUrlChange: (url: string) => void
  onLoad: (event?: FormEvent<HTMLFormElement>) => void
  onPlayerHostReady: (node: HTMLDivElement | null) => void
  open: boolean
  urlError: string | null
}

function LandrushIslandTvInteractionPanel(props: LandrushIslandTvInteractionPanelProps) {
  const rootRef = useRef<Root | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = document.createElement('div')
    container.dataset.landrushTvPanelRoot = '1'
    document.body.appendChild(container)
    const root = createRoot(container)
    containerRef.current = container
    rootRef.current = root

    return () => {
      root.unmount()
      container.remove()
      if (containerRef.current === container) containerRef.current = null
      if (rootRef.current === root) rootRef.current = null
    }
  }, [])

  useEffect(() => {
    rootRef.current?.render(<LandrushIslandTvInteractionPanelContent {...props} />)
  }, [props])

  return null
}

function LandrushIslandTvInteractionPanelContent({
  draftUrl,
  embed,
  onClose,
  onDraftUrlChange,
  onLoad,
  onPlayerHostReady,
  open,
  urlError,
}: LandrushIslandTvInteractionPanelProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    overlayRef.current?.focus({ preventScroll: true })
  }, [open])

  const focusOverlaySoon = useCallback(() => {
    requestAnimationFrame(() => overlayRef.current?.focus({ preventScroll: true }))
  }, [])

  return (
    <div
      aria-hidden={!open}
      className={`fixed inset-0 z-[10000] grid place-items-center bg-slate-950/18 p-3 transition-opacity md:p-6 ${
        open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
      }`}
      onKeyDownCapture={(event) => {
        if (!open) return
        if (event.code !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }}
      onPointerDown={(event) => {
        if (!open) return
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }}
      ref={overlayRef}
      tabIndex={-1}
    >
      <div
        className="pointer-events-auto flex h-[50vh] min-h-[360px] w-[50vw] min-w-[560px] max-w-[960px] flex-col rounded-md border border-white/18 bg-slate-950/92 p-4 shadow-2xl backdrop-blur-md max-md:h-[70vh] max-md:w-[92vw] max-md:min-w-0 md:p-5"
        data-landrush-ui
        onPointerDown={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
      >
        <form className="flex items-center gap-2" onSubmit={onLoad}>
          <label
            className="shrink-0 font-black text-white/72 text-xs uppercase"
            htmlFor="landrush-island-tv-url"
          >
            url:
          </label>
          <input
            className="h-10 min-w-0 flex-1 rounded border border-white/16 bg-slate-950/90 px-3 text-white text-sm outline-none transition placeholder:text-white/32 focus:border-sky-200/70"
            id="landrush-island-tv-url"
            onChange={(event) => onDraftUrlChange(event.target.value)}
            spellCheck={false}
            value={draftUrl}
          />
          <button
            className="h-10 shrink-0 rounded border border-sky-100/50 bg-sky-300 px-4 font-black text-slate-950 text-xs uppercase transition hover:bg-sky-200"
            type="submit"
          >
            Load
          </button>
          <button
            aria-label="Close TV controls"
            className="grid size-10 shrink-0 place-items-center rounded border border-white/16 bg-white/7 font-black text-white/70 text-xs transition hover:border-white/32 hover:text-white"
            onClick={(event) => {
              event.preventDefault()
              onClose()
            }}
            type="button"
          >
            X
          </button>
        </form>
        {urlError ? <div className="mt-2 text-rose-100 text-xs">{urlError}</div> : null}
        <div
          className="relative mt-4 min-h-0 flex-1 overflow-hidden rounded border border-white/12 bg-black"
          onPointerDownCapture={focusOverlaySoon}
        >
          <div className="h-full w-full" ref={onPlayerHostReady} />
          {embed ? null : (
            <div className="pointer-events-none absolute inset-0">
              <LandrushIslandTvBlankScreen />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function LandrushIslandTvBlankScreen() {
  return (
    <div className="grid h-full w-full place-items-center bg-slate-950 text-white/34 text-xs" />
  )
}

function resolveLandrushIslandTvEmbed(value: string): LandrushIslandTvEmbed | null {
  const input = value.trim()
  if (!input) return null

  const videoId = resolveLandrushIslandYoutubeVideoId(input)
  if (videoId) {
    return {
      kind: 'youtube',
      screenSrc: createLandrushIslandYoutubeEmbedSrc(videoId, { autoplay: false, muted: true }),
      title: `YouTube ${videoId}`,
    }
  }

  try {
    const url = new URL(input)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return {
      kind: 'iframe',
      screenSrc: url.toString(),
      title: url.hostname,
    }
  } catch {
    return null
  }
}

function resolveLandrushIslandYoutubeVideoId(value: string) {
  const input = value.trim()
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input

  try {
    const url = new URL(input)
    const host = url.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] ?? null
    if (!host.endsWith('youtube.com') && !host.endsWith('youtube-nocookie.com')) return null

    const watchId = url.searchParams.get('v')
    if (watchId && /^[a-zA-Z0-9_-]{11}$/.test(watchId)) return watchId

    const [, route, id] = url.pathname.split('/')
    if ((route === 'embed' || route === 'shorts' || route === 'live') && id) {
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null
    }
  } catch {
    return null
  }

  return null
}

function createLandrushIslandYoutubeEmbedSrc(
  videoId: string,
  { autoplay, muted }: { autoplay: boolean; muted: boolean },
) {
  const params = new URLSearchParams({
    autoplay: autoplay ? '1' : '0',
    controls: '1',
    enablejsapi: '1',
    mute: muted ? '1' : '0',
    playsinline: '1',
    rel: '0',
  })
  if (typeof window !== 'undefined') params.set('origin', window.location.origin)
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`
}

function sendLandrushIslandYoutubeVolume(
  iframe: HTMLIFrameElement | null,
  volume01: number,
  muted: boolean,
) {
  const contentWindow = iframe?.contentWindow
  if (!contentWindow) return

  const volume = Math.round(clampLandrushIslandTvVolume(volume01) * 100)
  postLandrushIslandYoutubeCommand(contentWindow, 'setVolume', [volume])
  postLandrushIslandYoutubeCommand(contentWindow, muted ? 'mute' : 'unMute', [])
}

function sendLandrushIslandYoutubeSeek(iframe: HTMLIFrameElement | null, seconds: number) {
  const contentWindow = iframe?.contentWindow
  if (!contentWindow || !Number.isFinite(seconds)) return
  postLandrushIslandYoutubeCommand(contentWindow, 'seekTo', [Math.max(0, seconds), true])
}

function sendLandrushIslandYoutubePlayback(iframe: HTMLIFrameElement | null, play: boolean) {
  const contentWindow = iframe?.contentWindow
  if (!contentWindow) return
  postLandrushIslandYoutubeCommand(contentWindow, play ? 'playVideo' : 'pauseVideo', [])
}

function postLandrushIslandYoutubeCommand(
  contentWindow: Window,
  func: string,
  args: readonly (boolean | number | string)[],
) {
  contentWindow.postMessage(JSON.stringify({ args, event: 'command', func }), '*')
}

function requestLandrushIslandTvPointerLock(canvas: HTMLCanvasElement) {
  if (document.pointerLockElement === canvas) return

  try {
    void Promise.resolve(canvas.requestPointerLock()).catch(() => undefined)
  } catch {
    // FPV can still recover on the next canvas click if the browser denies this gesture.
  }
}

function isLandrushIslandTvEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest('input,textarea,select,[contenteditable="true"]'))
  )
}

function resolveLandrushIslandTvEffectiveVolume(
  media: LandrushIslandTvMediaSettings,
  spatialGain: number,
  interacting: boolean,
) {
  if (media.muted) return 0
  return clampLandrushIslandTvVolume(media.userVolume * (interacting ? 1 : spatialGain))
}

function shouldLandrushIslandTvPlayLocally(
  media: LandrushIslandTvMediaSettings,
  spatialGain: number,
  interacting: boolean,
) {
  return media.playing && (interacting || spatialGain > LANDRUSH_ISLAND_TV_LOCAL_PLAY_GAIN_EPSILON)
}

function clampLandrushIslandTvVolume(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
}

function resolveLandrushIslandTvEffectivePlaybackSeconds(
  media: LandrushIslandTvMediaSettings,
  at = Date.now(),
) {
  const base = Math.max(0, finiteLandrushIslandTvNumber(media.playbackSeconds, 0))
  if (!media.playing || media.playbackUpdatedAt <= 0) return base
  return Math.max(0, base + Math.max(0, at - media.playbackUpdatedAt) / 1000)
}

function isLandrushIslandYoutubePlayerStatePlaying(playerState: number) {
  return playerState === 1 || playerState === 3
}

function finiteLandrushIslandTvNumber(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function areLandrushIslandTvVolumeSettingsEqual(
  first: LandrushIslandTvMediaSettings,
  second: LandrushIslandTvMediaSettings,
) {
  return first.muted === second.muted && Math.abs(first.userVolume - second.userVolume) < 0.005
}

function parseLandrushIslandYoutubeInfoDelivery(
  data: unknown,
): { currentTime?: number; muted?: boolean; playerState?: number; volume?: number } | null {
  let payload: unknown = data
  if (typeof data === 'string') {
    try {
      payload = JSON.parse(data)
    } catch {
      return null
    }
  }
  if (!payload || typeof payload !== 'object') return null

  const message = payload as { event?: unknown; info?: unknown }
  if (message.event !== 'infoDelivery' || !message.info || typeof message.info !== 'object') {
    return null
  }

  const info = message.info as {
    currentTime?: unknown
    muted?: unknown
    playerState?: unknown
    volume?: unknown
  }
  return {
    currentTime:
      typeof info.currentTime === 'number' && Number.isFinite(info.currentTime)
        ? info.currentTime
        : undefined,
    muted: typeof info.muted === 'boolean' ? info.muted : undefined,
    playerState:
      typeof info.playerState === 'number' && Number.isFinite(info.playerState)
        ? info.playerState
        : undefined,
    volume:
      typeof info.volume === 'number' && Number.isFinite(info.volume) ? info.volume : undefined,
  }
}
