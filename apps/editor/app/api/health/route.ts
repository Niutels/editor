export function GET() {
  return Response.json({
    status: 'ok',
    app: 'editor',
    mode: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  })
}
