export const LANDRUSH_ZOMBIE_NAVIGATION_OVERLAY_CONTROLS_SELECTOR =
  '[data-landrush-zombie-navigation-overlay-controls="true"]'

export type LandrushIslandInputElement = Readonly<
  Pick<HTMLElement, 'closest' | 'isContentEditable' | 'tagName'>
>

export function landrushIslandInputElementBlocksGameplay(element: LandrushIslandInputElement) {
  return (
    element.isContentEditable ||
    element.tagName === 'BUTTON' ||
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.tagName === 'SELECT' ||
    element.closest(LANDRUSH_ZOMBIE_NAVIGATION_OVERLAY_CONTROLS_SELECTOR) !== null
  )
}

export function landrushIslandInputTargetBlocksGameplay(target: EventTarget | null) {
  return target instanceof HTMLElement && landrushIslandInputElementBlocksGameplay(target)
}
