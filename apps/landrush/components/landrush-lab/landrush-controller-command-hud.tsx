import type { MouseEventHandler, ReactNode, RefObject } from 'react'

export type LandrushControllerCommandId =
  | 'circle'
  | 'cross'
  | 'l1'
  | 'l2'
  | 'r1'
  | 'r2'
  | 'square'
  | 'triangle'

export type LandrushControllerCommand = Readonly<{
  active?: boolean
  buttonRef?: RefObject<HTMLButtonElement | null>
  disabled?: boolean
  label: string
  onActivate?: MouseEventHandler<HTMLButtonElement>
}>

export type LandrushControllerCommands = Readonly<
  Partial<Record<LandrushControllerCommandId, LandrushControllerCommand>>
>

type LandrushControllerCommandHudProps = {
  className?: string
  commands: LandrushControllerCommands
  label?: string
}

const SHOULDER_LAYOUT = [
  { column: 'left', id: 'l1', row: '1' },
  { column: 'right', id: 'r1', row: '1' },
  { column: 'left', id: 'l2', row: '2' },
  { column: 'right', id: 'r2', row: '2' },
] as const satisfies readonly {
  column: 'left' | 'right'
  id: LandrushControllerCommandId
  row: '1' | '2'
}[]

const FACE_LAYOUT = [
  { id: 'triangle', position: 'top', slotClassName: 'col-start-2 row-start-1' },
  { id: 'square', position: 'left', slotClassName: 'col-start-1 row-start-2' },
  { id: 'circle', position: 'right', slotClassName: 'col-start-3 row-start-2' },
  { id: 'cross', position: 'bottom', slotClassName: 'col-start-2 row-start-3' },
] as const satisfies readonly {
  id: LandrushControllerCommandId
  position: 'bottom' | 'left' | 'right' | 'top'
  slotClassName: string
}[]

const CONTROL_NAMES: Record<LandrushControllerCommandId, string> = {
  circle: 'Circle',
  cross: 'Cross',
  l1: 'L1',
  l2: 'L2',
  r1: 'R1',
  r2: 'R2',
  square: 'Square',
  triangle: 'Triangle',
}

export function LandrushControllerCommandHud({
  className = '',
  commands,
  label = 'Controller commands',
}: LandrushControllerCommandHudProps) {
  return (
    <section
      aria-label={label}
      className={[
        'pointer-events-none flex w-[9.25rem] flex-col gap-1.5 rounded-xl border border-white/15 bg-slate-950/62 p-2 text-white shadow-2xl backdrop-blur-md',
        className,
      ].join(' ')}
      data-landrush-controller-command-hud
      role="group"
    >
      <div className="grid grid-cols-2 gap-1" data-landrush-controller-shoulder-layout>
        {SHOULDER_LAYOUT.map(({ column, id, row }) => (
          <ControllerCommandPrompt
            command={commands[id]}
            control={id}
            key={id}
            layout="shoulder"
            layoutColumn={column}
            layoutRow={row}
          />
        ))}
      </div>
      <div
        className="grid grid-cols-[repeat(3,2.625rem)] grid-rows-[repeat(3,2.5rem)] gap-0.5"
        data-landrush-controller-face-layout
      >
        {FACE_LAYOUT.map(({ id, position, slotClassName }) => (
          <ControllerCommandPrompt
            className={slotClassName}
            command={commands[id]}
            control={id}
            key={id}
            layout="face"
            position={position}
          />
        ))}
      </div>
    </section>
  )
}

function ControllerCommandPrompt({
  className = '',
  command,
  control,
  layout,
  layoutColumn,
  layoutRow,
  position,
}: {
  className?: string
  command: LandrushControllerCommand | undefined
  control: LandrushControllerCommandId
  layout: 'face' | 'shoulder'
  layoutColumn?: 'left' | 'right'
  layoutRow?: '1' | '2'
  position?: 'bottom' | 'left' | 'right' | 'top'
}) {
  const controlName = CONTROL_NAMES[control]
  const accessibleLabel = command ? `${controlName}: ${command.label}` : undefined
  const content = (
    <>
      <span aria-hidden="true" className="shrink-0">
        <ControllerGlyph control={control} />
      </span>
      <span
        aria-hidden="true"
        className={[
          'min-w-0 truncate font-bold uppercase leading-none tracking-[0.05em]',
          layout === 'face' ? 'max-w-10 text-[7px]' : 'max-w-[3rem] text-[8px]',
        ].join(' ')}
      >
        {command?.label ?? '—'}
      </span>
    </>
  )
  const sharedProps = {
    'data-landrush-controller-bound': command ? 'true' : 'false',
    'data-landrush-controller-column': layoutColumn,
    'data-landrush-controller-control': control,
    'data-landrush-controller-position': position,
    'data-landrush-controller-row': layoutRow,
  }
  const promptClassName = [
    'flex min-w-0 items-center justify-center border leading-none shadow-md',
    layout === 'face' ? 'size-10 flex-col gap-0.5 rounded-lg' : 'h-8 gap-1 rounded-md px-1.5',
    command
      ? 'border-white/22 bg-slate-900/82 text-white/92'
      : 'border-dashed border-white/12 bg-slate-950/30 text-white/35 opacity-45',
    command?.active ? 'border-amber-200/65 bg-amber-300 text-slate-950' : '',
    command?.disabled ? 'opacity-45' : '',
    command?.onActivate && !command.disabled
      ? 'pointer-events-auto transition hover:border-white/45 hover:bg-slate-800/92 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70'
      : '',
    className,
  ].join(' ')

  if (command?.onActivate) {
    return (
      <button
        {...sharedProps}
        aria-label={accessibleLabel}
        className={promptClassName}
        disabled={command.disabled}
        onClick={command.onActivate}
        ref={command.buttonRef}
        type="button"
      >
        {content}
      </button>
    )
  }

  return (
    <div {...sharedProps} aria-hidden={command ? undefined : true} className={promptClassName}>
      {accessibleLabel ? <span className="sr-only">{accessibleLabel}</span> : null}
      {content}
    </div>
  )
}

function ControllerGlyph({ control }: { control: LandrushControllerCommandId }) {
  if (control === 'l1' || control === 'l2' || control === 'r1' || control === 'r2') {
    return <span className="font-black font-mono text-[10px]">{control.toUpperCase()}</span>
  }

  const glyph: ReactNode =
    control === 'triangle' ? (
      <path d="M10 3 17 16H3Z" />
    ) : control === 'square' ? (
      <rect height="12" rx="1" width="12" x="4" y="4" />
    ) : control === 'circle' ? (
      <circle cx="10" cy="10" r="6.5" />
    ) : (
      <path d="m5 5 10 10M15 5 5 15" />
    )

  return (
    <svg
      aria-hidden="true"
      className={[
        'size-4 fill-none stroke-current stroke-[2.1]',
        control === 'triangle'
          ? 'text-emerald-200'
          : control === 'square'
            ? 'text-fuchsia-200'
            : control === 'circle'
              ? 'text-rose-200'
              : 'text-sky-200',
      ].join(' ')}
      viewBox="0 0 20 20"
    >
      {glyph}
    </svg>
  )
}
