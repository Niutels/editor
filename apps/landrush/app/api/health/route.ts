export function GET() {
  return Response.json({
    status: 'ok',
    app: 'landrush',
    mode: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  })
}
