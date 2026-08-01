import { LANDRUSH_ROBOT_SCREEN_REVEAL_CURVE_POWER_RANGE } from '@/components/landrush-lab/robot-screen-reveal-curve'

const DEBUG_DOCUMENT = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Radial opacity continuity lab</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #050912;
        color: #e2e8f0;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-width: 760px;
        min-height: 100vh;
        overflow: hidden;
        background: #050912;
      }

      button,
      input {
        font: inherit;
      }

      .app {
        display: flex;
        height: 100vh;
        flex-direction: column;
      }

      .header {
        display: flex;
        flex: 0 0 auto;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        background: #08101c;
        padding: 12px 20px;
      }

      .eyebrow,
      .section-title {
        margin: 0;
        color: #67e8f9;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.2em;
        text-transform: uppercase;
      }

      h1 {
        margin: 2px 0 0;
        font-size: 18px;
      }

      .badges {
        display: flex;
        gap: 8px;
        font: 10px ui-monospace, SFMono-Regular, Menlo, monospace;
      }

      .badge {
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.05);
        padding: 5px 9px;
        color: #cbd5e1;
      }

      .badge span {
        color: #64748b;
      }

      .layout {
        display: grid;
        min-height: 0;
        flex: 1 1 auto;
        grid-template-columns: minmax(0, 1fr) 380px;
      }

      .main-panel,
      .controls {
        min-height: 0;
        overflow-y: auto;
      }

      .main-panel {
        padding: 16px;
      }

      .controls {
        border-left: 1px solid rgba(255, 255, 255, 0.1);
        background: #080f1a;
        padding: 16px;
      }

      .preview {
        position: relative;
        height: min(58vh, 560px);
        min-height: 420px;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        background-color: #2bc4c9;
        background-image:
          linear-gradient(rgba(3, 13, 24, 0.3) 1px, transparent 1px),
          linear-gradient(90deg, rgba(3, 13, 24, 0.3) 1px, transparent 1px),
          repeating-conic-gradient(from 0deg, #f4b942 0deg 90deg, #2bc4c9 90deg 180deg);
        background-position: center;
        background-size: 48px 48px, 48px 48px, 96px 96px;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
      }

      .mask-layer,
      .guide-layer {
        position: absolute;
        inset: 0;
      }

      .guide-layer {
        pointer-events: none;
        overflow: hidden;
      }

      .cross-x,
      .cross-y {
        position: absolute;
        background: rgba(255, 255, 255, 0.15);
      }

      .cross-x {
        top: 50%;
        left: 0;
        width: 100%;
        height: 1px;
      }

      .cross-y {
        top: 0;
        left: 50%;
        width: 1px;
        height: 100%;
      }

      .radius-circle {
        position: absolute;
        top: 50%;
        left: 50%;
        border: 1px solid #67e8f9;
        border-radius: 50%;
        transform: translate(-50%, -50%);
      }

      .radius-circle.outer {
        border-color: #fcd34d;
        border-style: dashed;
      }

      .radius-circle.hard {
        border-color: #fb7185;
        box-shadow: 0 0 12px rgba(251, 113, 133, 0.55);
      }

      .legend {
        position: absolute;
        top: 12px;
        left: 12px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        background: rgba(0, 0, 0, 0.58);
        padding: 5px 8px;
        color: #cbd5e1;
        font: 9px ui-monospace, SFMono-Regular, Menlo, monospace;
      }

      .chart-card {
        margin-top: 16px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        background: #08101c;
        padding: 16px;
      }

      .chart-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }

      .chart-title {
        margin: 0;
        font-size: 14px;
      }

      .muted {
        margin: 3px 0 0;
        color: #64748b;
        font-size: 10px;
      }

      .mono {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }

      .chart {
        display: block;
        width: 100%;
        height: 250px;
      }

      .mode-switch {
        display: flex;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.2);
        padding: 4px;
      }

      .mode-button {
        flex: 1 1 0;
        border: 0;
        border-radius: 6px;
        background: transparent;
        padding: 8px 12px;
        color: #64748b;
        cursor: pointer;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .mode-button.active {
        background: rgba(103, 232, 249, 0.15);
        color: #cffafe;
      }

      .sliders {
        display: grid;
        gap: 16px;
        margin-top: 16px;
      }

      .slider-row.disabled {
        opacity: 0.35;
      }

      .slider-label {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 6px;
        color: #cbd5e1;
        font-size: 10px;
      }

      .value-wrap {
        display: flex;
        align-items: center;
        gap: 5px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }

      input[type="number"] {
        width: 64px;
        height: 26px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        background: rgba(0, 0, 0, 0.3);
        padding: 0 6px;
        color: #f1f5f9;
        text-align: right;
      }

      input[type="range"] {
        display: block;
        width: 100%;
        accent-color: #67e8f9;
        cursor: pointer;
      }

      .reset {
        width: 100%;
        margin-top: 16px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.05);
        padding: 9px 12px;
        color: #cbd5e1;
        cursor: pointer;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .metric-section {
        margin-top: 20px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        padding-top: 16px;
      }

      .metric-grid {
        display: grid;
        gap: 6px;
        margin-top: 9px;
      }

      .metric {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        font-size: 10px;
      }

      .metric-label {
        color: #64748b;
      }

      .metric-value {
        color: #e2e8f0;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }

      .good {
        color: #6ee7b7;
      }

      .bad {
        color: #fda4af;
      }

      .finding {
        margin: 8px 0 0;
        color: #64748b;
        font-size: 10px;
        line-height: 1.5;
      }

      .sweep-wrap {
        overflow: hidden;
        margin-top: 9px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        font: 9px ui-monospace, SFMono-Regular, Menlo, monospace;
      }

      th,
      td {
        padding: 6px 8px;
      }

      th {
        background: rgba(255, 255, 255, 0.05);
        color: #94a3b8;
        text-align: left;
      }

      th:not(:first-child),
      td:not(:first-child) {
        text-align: right;
      }

      td {
        border-top: 1px solid rgba(255, 255, 255, 0.05);
        color: #94a3b8;
      }

      td:first-child {
        color: #cbd5e1;
      }
    </style>
  </head>
  <body>
    <main class="app">
      <header class="header">
        <div>
          <p class="eyebrow">Robot passthrough diagnostic</p>
          <h1>Radial opacity continuity lab</h1>
        </div>
        <div class="badges">
          <div class="badge"><span>camera:</span> fixed</div>
          <div class="badge"><span>DPR:</span> 1</div>
          <div class="badge"><span>runtime:</span> standalone</div>
          <div class="badge"><span>post:</span> none</div>
        </div>
      </header>

      <div class="layout">
        <section class="main-panel">
          <div class="preview" id="preview" data-testid="reveal-preview">
            <div class="mask-layer" id="maskLayer"></div>
            <div class="guide-layer">
              <div class="cross-x"></div>
              <div class="cross-y"></div>
              <div class="radius-circle" id="innerCircle"></div>
              <div class="radius-circle outer" id="outerCircle"></div>
              <div class="legend">cyan/red = inner · amber = outer</div>
            </div>
          </div>

          <div class="chart-card">
            <div class="chart-header">
              <div>
                <h2 class="chart-title">Measured radial transfer</h2>
                <p class="muted">Cyan is opacity. Amber is the absolute per-pixel slope.</p>
              </div>
              <span class="mono" id="annulusWidth">192 px annulus</span>
            </div>
            <svg class="chart" viewBox="0 0 1000 250" preserveAspectRatio="none" role="img" aria-label="Radial opacity and slope profile">
              <rect width="1000" height="250" rx="10" fill="#050a12"></rect>
              <g stroke="rgba(148,163,184,0.15)" stroke-width="1">
                <line x1="0" x2="1000" y1="20" y2="20"></line>
                <line x1="0" x2="1000" y1="95" y2="95"></line>
                <line x1="0" x2="1000" y1="170" y2="170"></line>
                <line x1="0" x2="1000" y1="190" y2="190"></line>
                <line x1="0" x2="1000" y1="238" y2="238"></line>
              </g>
              <polyline id="opacityLine" fill="none" stroke="#67e8f9" stroke-width="3" stroke-linejoin="round"></polyline>
              <polyline id="slopeLine" fill="none" stroke="#fbbf24" stroke-width="2" stroke-linejoin="round"></polyline>
              <text x="12" y="18" fill="#94a3b8" font-family="monospace" font-size="18">1.0</text>
              <text x="12" y="168" fill="#94a3b8" font-family="monospace" font-size="18">0.0</text>
              <text x="12" y="234" fill="#fbbf24" font-family="monospace" font-size="16">Δ/px</text>
            </svg>
          </div>
        </section>

        <aside class="controls">
          <div class="mode-switch">
            <button class="mode-button active" id="softMode" type="button" aria-pressed="true">Soft mask</button>
            <button class="mode-button" id="hardMode" type="button" aria-pressed="false">Hard threshold</button>
          </div>

          <div class="sliders">
            <label class="slider-row">
              <span class="slider-label">
                <span>Complete see-through radius</span>
                <span class="value-wrap">
                  <input id="innerNumber" aria-label="Complete see-through radius value" type="number" min="16" max="596" step="1" value="96" />
                  <span>px</span>
                </span>
              </span>
              <input id="innerRange" aria-label="Complete see-through radius slider" type="range" min="16" max="596" step="1" value="96" />
            </label>

            <label class="slider-row">
              <span class="slider-label">
                <span>Fully opaque outer radius</span>
                <span class="value-wrap">
                  <input id="outerNumber" aria-label="Fully opaque outer radius value" type="number" min="20" max="600" step="1" value="288" />
                  <span>px</span>
                </span>
              </span>
              <input id="outerRange" aria-label="Fully opaque outer radius slider" type="range" min="20" max="600" step="1" value="288" />
            </label>

            <label class="slider-row" id="smoothRow">
              <span class="slider-label">
                <span>Transition smoothness</span>
                <span class="value-wrap">
                  <input id="smoothNumber" aria-label="Transition smoothness value" type="number" min="0" max="100" step="1" value="100" />
                  <span>%</span>
                </span>
              </span>
              <input id="smoothRange" aria-label="Transition smoothness slider" type="range" min="0" max="100" step="1" value="100" />
            </label>
          </div>

          <button class="reset" id="reset" type="button">Reset deterministic view</button>

          <section class="metric-section">
            <h2 class="section-title">Transfer function</h2>
            <div class="metric-grid">
              <div class="metric"><span class="metric-label">Continuity</span><span class="metric-value" id="continuity"></span></div>
              <div class="metric"><span class="metric-label">Largest 1 px delta</span><span class="metric-value" id="maxDelta"></span></div>
              <div class="metric"><span class="metric-label">Largest 8-bit step</span><span class="metric-value" id="maxStep"></span></div>
              <div class="metric"><span class="metric-label">Jump radius</span><span class="metric-value" id="jumpRadius"></span></div>
              <div class="metric"><span class="metric-label">First visible offset</span><span class="metric-value" id="visibleOffset"></span></div>
              <div class="metric"><span class="metric-label">Slope concentration</span><span class="metric-value" id="slopeConcentration"></span></div>
              <div class="metric"><span class="metric-label">Monotonicity errors</span><span class="metric-value good" id="monotonicity"></span></div>
            </div>
          </section>

          <section class="metric-section">
            <h2 class="section-title">Production composition finding</h2>
            <div class="metric-grid">
              <div class="metric"><span class="metric-label">Soft-mask maximum</span><span class="metric-value good">2 codes / px</span></div>
              <div class="metric"><span class="metric-label">Object clip</span><span class="metric-value bad">255-code jump</span></div>
            </div>
            <p class="finding">The object clipping branch cuts at the inner radius and does not read the smoothness value.</p>
          </section>

          <section class="metric-section">
            <h2 class="section-title">Smoothness sweep</h2>
            <div class="sweep-wrap">
              <table>
                <thead>
                  <tr><th>Mode</th><th>Onset</th><th>Δ/px</th><th>8-bit</th></tr>
                </thead>
                <tbody id="sweepBody"></tbody>
              </table>
            </div>
          </section>
        </aside>
      </div>
    </main>

    <script>
      (() => {
        const CURVE_POWER_RANGE = ${LANDRUSH_ROBOT_SCREEN_REVEAL_CURVE_POWER_RANGE};
        const DEFAULTS = { innerRadiusPx: 96, outerRadiusPx: 288, smoothnessPercent: 100, mode: "soft-mask" };
        const state = { ...DEFAULTS };
        const byId = (id) => document.getElementById(id);
        const elements = {
          annulusWidth: byId("annulusWidth"),
          continuity: byId("continuity"),
          hardMode: byId("hardMode"),
          innerCircle: byId("innerCircle"),
          innerNumber: byId("innerNumber"),
          innerRange: byId("innerRange"),
          jumpRadius: byId("jumpRadius"),
          maskLayer: byId("maskLayer"),
          maxDelta: byId("maxDelta"),
          maxStep: byId("maxStep"),
          monotonicity: byId("monotonicity"),
          opacityLine: byId("opacityLine"),
          outerCircle: byId("outerCircle"),
          outerNumber: byId("outerNumber"),
          outerRange: byId("outerRange"),
          reset: byId("reset"),
          slopeConcentration: byId("slopeConcentration"),
          slopeLine: byId("slopeLine"),
          smoothNumber: byId("smoothNumber"),
          smoothRange: byId("smoothRange"),
          smoothRow: byId("smoothRow"),
          softMode: byId("softMode"),
          sweepBody: byId("sweepBody"),
          visibleOffset: byId("visibleOffset"),
        };

        function clamp(value, minimum, maximum) {
          return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
        }

        function normalizeState(editedRadius) {
          state.outerRadiusPx = clamp(state.outerRadiusPx, 20, 600);
          state.innerRadiusPx = clamp(state.innerRadiusPx, 16, 596);
          if (state.innerRadiusPx > state.outerRadiusPx - 4) {
            if (editedRadius === "outerRadiusPx") {
              state.outerRadiusPx = state.innerRadiusPx + 4;
            } else {
              state.innerRadiusPx = state.outerRadiusPx - 4;
            }
          }
          state.smoothnessPercent = clamp(state.smoothnessPercent, 0, 100);
        }

        function resolveCurvePower(smoothnessPercent) {
          const smoothness = clamp(smoothnessPercent / 100, 0, 1);
          return 1 + Math.pow(1 - smoothness, 2) * CURVE_POWER_RANGE;
        }

        function sampleSoftOpacity(distancePx, smoothnessPercent) {
          const safeOuter = Math.max(state.innerRadiusPx + 1, state.outerRadiusPx);
          const ratio = clamp(
            (distancePx - state.innerRadiusPx) / (safeOuter - state.innerRadiusPx),
            0,
            1,
          );
          const power = resolveCurvePower(smoothnessPercent);
          const opaqueWeight = Math.pow(ratio, power);
          const clearWeight = Math.pow(1 - ratio, power);
          return opaqueWeight / (opaqueWeight + clearWeight);
        }

        function evaluateOpacity(distancePx, mode, smoothnessPercent) {
          return mode === "hard-threshold"
            ? distancePx >= state.innerRadiusPx
              ? 1
              : 0
            : sampleSoftOpacity(distancePx, smoothnessPercent);
        }

        function invertSymmetricPowerCurve(opacity, curvePower) {
          const opaqueRoot = Math.pow(opacity, 1 / curvePower);
          const clearRoot = Math.pow(1 - opacity, 1 / curvePower);
          return opaqueRoot / (opaqueRoot + clearRoot);
        }

        function measure(mode, smoothnessPercent) {
          const transitionWidthPx = state.outerRadiusPx - state.innerRadiusPx;
          const curvePower = mode === "soft-mask" ? resolveCurvePower(smoothnessPercent) : null;
          let largestJumpRadiusPx = state.innerRadiusPx;
          let maxDeltaPerPixel = 0;
          let maxQuantizedStep = 0;
          let monotonicityViolations = 0;
          let previousOpacity = evaluateOpacity(Math.max(0, state.innerRadiusPx - 2), mode, smoothnessPercent);
          let previousQuantized = Math.round(previousOpacity * 255);

          for (
            let distancePx = Math.max(0, state.innerRadiusPx - 1);
            distancePx <= state.outerRadiusPx + 1;
            distancePx += 1
          ) {
            const opacity = evaluateOpacity(distancePx, mode, smoothnessPercent);
            const delta = opacity - previousOpacity;
            const quantized = Math.round(opacity * 255);
            if (delta < -1e-9) monotonicityViolations += 1;
            if (Math.abs(delta) > maxDeltaPerPixel) {
              maxDeltaPerPixel = Math.abs(delta);
              largestJumpRadiusPx = distancePx - 0.5;
            }
            maxQuantizedStep = Math.max(maxQuantizedStep, Math.abs(quantized - previousQuantized));
            previousOpacity = opacity;
            previousQuantized = quantized;
          }

          const firstVisibleRatio =
            mode === "soft-mask"
              ? invertSymmetricPowerCurve(1 / 255, curvePower)
              : 0;
          const graphStartPx = Math.max(0, state.innerRadiusPx - transitionWidthPx * 0.12);
          const graphEndPx = state.outerRadiusPx + transitionWidthPx * 0.12;
          const graphStepPx = (graphEndPx - graphStartPx) / 320;
          const samples = [];
          let previousGraphOpacity = evaluateOpacity(graphStartPx, mode, smoothnessPercent);
          for (let index = 0; index <= 320; index += 1) {
            const distancePx = graphStartPx + graphStepPx * index;
            const opacity = evaluateOpacity(distancePx, mode, smoothnessPercent);
            samples.push({
              deltaPerPixel:
                index === 0 ? 0 : Math.abs(opacity - previousGraphOpacity) / graphStepPx,
              opacity,
            });
            previousGraphOpacity = opacity;
          }

          return {
            continuous: mode === "soft-mask",
            curvePower,
            largestJumpRadiusPx,
            maxDeltaPerPixel,
            maxQuantizedStep,
            monotonicityViolations,
            samples,
            slopeConcentration: maxDeltaPerPixel / (1 / transitionWidthPx),
            transitionWidthPx,
            visibleOnsetOffsetPx: firstVisibleRatio * transitionWidthPx,
          };
        }

        function renderControls() {
          elements.innerRange.value = String(state.innerRadiusPx);
          elements.innerNumber.value = String(state.innerRadiusPx);
          elements.outerRange.value = String(state.outerRadiusPx);
          elements.outerNumber.value = String(state.outerRadiusPx);
          elements.smoothRange.value = String(state.smoothnessPercent);
          elements.smoothNumber.value = String(state.smoothnessPercent);
          const hard = state.mode === "hard-threshold";
          elements.smoothRange.disabled = hard;
          elements.smoothNumber.disabled = hard;
          elements.smoothRow.classList.toggle("disabled", hard);
          elements.softMode.classList.toggle("active", !hard);
          elements.hardMode.classList.toggle("active", hard);
          elements.softMode.setAttribute("aria-pressed", String(!hard));
          elements.hardMode.setAttribute("aria-pressed", String(hard));
        }

        function renderPreview() {
          const dark = "7, 17, 30";
          let radialMask;
          if (state.mode === "hard-threshold") {
            radialMask =
              "radial-gradient(circle at center, rgba(" +
              dark +
              ", 0) 0px, rgba(" +
              dark +
              ", 0) " +
              state.innerRadiusPx +
              "px, rgba(" +
              dark +
              ", 1) " +
              (state.innerRadiusPx + 0.01) +
              "px, rgba(" +
              dark +
              ", 1) 100%)";
          } else {
            const stops = [
              "rgba(" + dark + ", 0) 0px",
              "rgba(" + dark + ", 0) " + state.innerRadiusPx + "px",
            ];
            for (let index = 1; index < 64; index += 1) {
              const ratio = index / 64;
              const distancePx =
                state.innerRadiusPx +
                (state.outerRadiusPx - state.innerRadiusPx) * ratio;
              const opacity = sampleSoftOpacity(distancePx, state.smoothnessPercent);
              stops.push(
                "rgba(" +
                  dark +
                  ", " +
                  opacity.toFixed(5) +
                  ") " +
                  distancePx.toFixed(2) +
                  "px",
              );
            }
            stops.push(
              "rgba(" + dark + ", 1) " + state.outerRadiusPx + "px",
              "rgba(" + dark + ", 1) 100%",
            );
            radialMask = "radial-gradient(circle at center, " + stops.join(", ") + ")";
          }
          elements.maskLayer.style.backgroundImage = radialMask;
          elements.innerCircle.style.width = state.innerRadiusPx * 2 + "px";
          elements.innerCircle.style.height = state.innerRadiusPx * 2 + "px";
          elements.innerCircle.classList.toggle("hard", state.mode === "hard-threshold");
          elements.outerCircle.style.width = state.outerRadiusPx * 2 + "px";
          elements.outerCircle.style.height = state.outerRadiusPx * 2 + "px";
        }

        function renderChart(measurement) {
          const opacityPoints = measurement.samples
            .map((sample, index) => {
              const x = (index / Math.max(1, measurement.samples.length - 1)) * 1000;
              return x + "," + (170 - sample.opacity * 150);
            })
            .join(" ");
          const maximumSlope = Math.max(
            measurement.maxDeltaPerPixel,
            ...measurement.samples.map((sample) => sample.deltaPerPixel),
            0.000001,
          );
          const slopePoints = measurement.samples
            .map((sample, index) => {
              const x = (index / Math.max(1, measurement.samples.length - 1)) * 1000;
              const y = 238 - (sample.deltaPerPixel / maximumSlope) * 48;
              return x + "," + y;
            })
            .join(" ");
          elements.opacityLine.setAttribute("points", opacityPoints);
          elements.slopeLine.setAttribute("points", slopePoints);
        }

        function renderMetrics(measurement) {
          elements.annulusWidth.textContent =
            measurement.transitionWidthPx.toFixed(0) + " px annulus";
          elements.continuity.textContent = measurement.continuous
            ? "continuous"
            : "binary jump";
          elements.continuity.className =
            "metric-value " + (measurement.continuous ? "good" : "bad");
          elements.maxDelta.textContent = measurement.maxDeltaPerPixel.toFixed(6);
          elements.maxStep.textContent = measurement.maxQuantizedStep + " codes";
          elements.jumpRadius.textContent = measurement.largestJumpRadiusPx.toFixed(1) + " px";
          elements.visibleOffset.textContent =
            measurement.visibleOnsetOffsetPx.toFixed(2) + " px";
          elements.slopeConcentration.textContent =
            measurement.slopeConcentration.toFixed(3) + "x";
          elements.monotonicity.textContent = String(measurement.monotonicityViolations);
        }

        function renderSweep() {
          const rows = [0, 25, 50, 75, 90, 100].map((smoothness) => {
            const measurement = measure("soft-mask", smoothness);
            return (
              "<tr><td>" +
              smoothness +
              "%</td><td>" +
              measurement.visibleOnsetOffsetPx.toFixed(1) +
              "</td><td>" +
              measurement.maxDeltaPerPixel.toFixed(4) +
              "</td><td>" +
              measurement.maxQuantizedStep +
              "</td></tr>"
            );
          });
          const hard = measure("hard-threshold", 0);
          rows.push(
            "<tr><td>hard</td><td>0.0</td><td>" +
              hard.maxDeltaPerPixel.toFixed(4) +
              "</td><td>" +
              hard.maxQuantizedStep +
              "</td></tr>",
          );
          elements.sweepBody.innerHTML = rows.join("");
        }

        function render(editedRadius) {
          normalizeState(editedRadius);
          const measurement = measure(state.mode, state.smoothnessPercent);
          const hardThresholdReference = measure("hard-threshold", 0);
          renderControls();
          renderPreview();
          renderChart(measurement);
          renderMetrics(measurement);
          renderSweep();
          window.__LANDRUSH_ROBOT_SCREEN_REVEAL_DEBUG__ = {
            actions: {
              reset() {
                Object.assign(state, DEFAULTS);
                render();
              },
              setInnerRadiusPx(value) {
                state.innerRadiusPx = Number(value);
                render("innerRadiusPx");
              },
              setMode(value) {
                state.mode = value === "hard-threshold" ? "hard-threshold" : "soft-mask";
                render();
              },
              setOuterRadiusPx(value) {
                state.outerRadiusPx = Number(value);
                render("outerRadiusPx");
              },
              setSmoothnessPercent(value) {
                state.smoothnessPercent = Number(value);
                render();
              },
            },
            backend: "standalone-dom",
            controls: { ...state },
            cpu: measurement,
            hardThresholdReference,
            noPostBaseline: true,
          };
          document.body.dataset.ready = "true";
        }

        function bindValuePair(range, number, key) {
          range.addEventListener("input", () => {
            state[key] = Number(range.value);
            render(key === "smoothnessPercent" ? undefined : key);
          });
          number.addEventListener("input", () => {
            state[key] = Number(number.value);
            render(key === "smoothnessPercent" ? undefined : key);
          });
        }

        bindValuePair(elements.innerRange, elements.innerNumber, "innerRadiusPx");
        bindValuePair(elements.outerRange, elements.outerNumber, "outerRadiusPx");
        bindValuePair(elements.smoothRange, elements.smoothNumber, "smoothnessPercent");
        elements.softMode.addEventListener("click", () => {
          state.mode = "soft-mask";
          render();
        });
        elements.hardMode.addEventListener("click", () => {
          state.mode = "hard-threshold";
          render();
        });
        elements.reset.addEventListener("click", () => {
          Object.assign(state, DEFAULTS);
          render();
        });
        render();
      })();
    </script>
  </body>
</html>`

export function GET() {
  return new Response(DEBUG_DOCUMENT, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8',
    },
  })
}
