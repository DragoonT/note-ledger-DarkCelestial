const runtimeVersion = process.env.APP_VERSION ?? `${Date.now()}`;
export function GET() {
  return Response.json(
    { version: runtimeVersion },
    { headers: { "Cache-Control": "no-store" } },
  );
}
