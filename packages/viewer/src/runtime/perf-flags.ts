export type PostFxVariant =
  | 'full'
  | 'orbit-lite'
  | 'no-ssgi'
  | 'no-denoise'
  | 'no-ink'
  | 'no-traa'
  | 'no-outlines'
  | 'off'

export type ViewerPerfFlags = {
  postFxVariant: PostFxVariant
  orbitPostFxVariant: PostFxVariant
  freezeShadowMapOnCameraMove: boolean
  suspendPickingDuringCameraMove: boolean
  enableCachedAO: boolean
  collectPerfMetrics: boolean
}

export type PostFxDisableFlags = {
  ao: boolean
  denoise: boolean
  ink: boolean
  outline: boolean
  postFx: boolean
}

export const DEFAULT_VIEWER_PERF_FLAGS: ViewerPerfFlags = {
  postFxVariant: 'full',
  orbitPostFxVariant: 'full',
  freezeShadowMapOnCameraMove: false,
  suspendPickingDuringCameraMove: false,
  enableCachedAO: false,
  collectPerfMetrics: false,
}

const POST_FX_VARIANTS: readonly PostFxVariant[] = [
  'full',
  'orbit-lite',
  'no-ssgi',
  'no-denoise',
  'no-ink',
  'no-traa',
  'no-outlines',
  'off',
]

const EMPTY_DISABLE_FLAGS: PostFxDisableFlags = {
  ao: false,
  denoise: false,
  ink: false,
  outline: false,
  postFx: false,
}

function parsePostFxVariant(value: string | null, fallback: PostFxVariant): PostFxVariant {
  if (!value) return fallback
  return POST_FX_VARIANTS.includes(value as PostFxVariant) ? (value as PostFxVariant) : fallback
}

function parseBooleanParam(value: string | null, fallback = false): boolean {
  if (value === null) return fallback
  if (value === '' || value === '1' || value === 'true' || value === 'yes') return true
  if (value === '0' || value === 'false' || value === 'no') return false
  return fallback
}

function parseFlagSet(params: URLSearchParams): Set<string> {
  return new Set(
    (params.get('viewerPerf') ?? params.get('perfFlags') ?? '')
      .split(',')
      .map((flag) => flag.trim())
      .filter(Boolean),
  )
}

export function readViewerPerfFlagsFromUrl(
  search = typeof window !== 'undefined' ? window.location.search : '',
): ViewerPerfFlags {
  const params = new URLSearchParams(search)
  const flagSet = parseFlagSet(params)
  const requestedPostFxVariant = parsePostFxVariant(
    params.get('postFxVariant'),
    DEFAULT_VIEWER_PERF_FLAGS.postFxVariant,
  )
  const postFxVariant = requestedPostFxVariant === 'orbit-lite' ? 'full' : requestedPostFxVariant
  const orbitPostFxVariant = parsePostFxVariant(
    params.get('orbitPostFxVariant'),
    DEFAULT_VIEWER_PERF_FLAGS.orbitPostFxVariant,
  )
  const usesOrbitLite =
    requestedPostFxVariant === 'orbit-lite' || orbitPostFxVariant === 'orbit-lite'

  return {
    postFxVariant,
    orbitPostFxVariant,
    freezeShadowMapOnCameraMove:
      usesOrbitLite ||
      flagSet.has('freezeShadowMapOnCameraMove') ||
      parseBooleanParam(
        params.get('freezeShadowMapOnCameraMove'),
        DEFAULT_VIEWER_PERF_FLAGS.freezeShadowMapOnCameraMove,
      ),
    suspendPickingDuringCameraMove:
      flagSet.has('suspendPickingDuringCameraMove') ||
      parseBooleanParam(
        params.get('suspendPickingDuringCameraMove'),
        DEFAULT_VIEWER_PERF_FLAGS.suspendPickingDuringCameraMove,
      ),
    enableCachedAO:
      flagSet.has('enableCachedAO') ||
      parseBooleanParam(params.get('enableCachedAO'), DEFAULT_VIEWER_PERF_FLAGS.enableCachedAO),
    collectPerfMetrics:
      params.has('perf') ||
      flagSet.has('collectPerfMetrics') ||
      parseBooleanParam(
        params.get('collectPerfMetrics'),
        DEFAULT_VIEWER_PERF_FLAGS.collectPerfMetrics,
      ),
  }
}

export function postFxVariantDisableFlags(variant: PostFxVariant): PostFxDisableFlags {
  switch (variant) {
    case 'orbit-lite':
      return { ...EMPTY_DISABLE_FLAGS, ao: true, denoise: true, ink: true, outline: true }
    case 'no-ssgi':
      return { ...EMPTY_DISABLE_FLAGS, ao: true, denoise: true }
    case 'no-denoise':
      return { ...EMPTY_DISABLE_FLAGS, denoise: true }
    case 'no-ink':
      return { ...EMPTY_DISABLE_FLAGS, ink: true }
    case 'no-outlines':
      return { ...EMPTY_DISABLE_FLAGS, outline: true }
    case 'off':
      return { ...EMPTY_DISABLE_FLAGS, postFx: true }
    case 'no-traa':
    case 'full':
      return EMPTY_DISABLE_FLAGS
  }
}

export function mergePostFxDisableFlags(
  first: PostFxDisableFlags,
  second: PostFxDisableFlags,
): PostFxDisableFlags {
  return {
    ao: first.ao || second.ao,
    denoise: first.denoise || second.denoise,
    ink: first.ink || second.ink,
    outline: first.outline || second.outline,
    postFx: first.postFx || second.postFx,
  }
}
