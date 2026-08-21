export function LandrushIslandLoadingShell() {
  return (
    <main
      aria-label="Loading Landrush island"
      className="fixed inset-0 grid place-items-center bg-[#0f1720] text-white"
      data-landrush-island-loading-shell
    >
      <div className="w-[50vw] max-w-[760px]">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-medium text-sm tracking-[0.18em] uppercase">Loading</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full border border-white/24 bg-slate-950/70 shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
          <div className="h-full w-1/5 rounded-full bg-gradient-to-r from-amber-200 via-lime-200 to-sky-200 opacity-70" />
        </div>
      </div>
    </main>
  )
}
