export type BenchPixelRatioRenderer = {
  getPixelRatio(): number
}

export function readBenchRenderScale(renderer: BenchPixelRatioRenderer, deviceDpr: number) {
  return {
    dpr: deviceDpr,
    rendererDpr: renderer.getPixelRatio(),
  }
}
