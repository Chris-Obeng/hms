import { offlineDocument } from "@/lib/pwa/offline-document";

const headers = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-cache",
  "X-RoomLine-Offline": "1",
};

export function GET() {
  return new Response(offlineDocument, { headers });
}

export function HEAD() {
  return new Response(null, { headers });
}
