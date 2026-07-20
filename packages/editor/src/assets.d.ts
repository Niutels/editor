declare module '*.webp' {
  const asset: { src: string; height: number; width: number; blurDataURL?: string }
  export default asset
}
