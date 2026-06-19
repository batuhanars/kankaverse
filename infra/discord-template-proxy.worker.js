/**
 * Kankaverse — Discord template proxy (Cloudflare Worker)
 *
 * NEDEN: Türkiye Discord'u DPI ile (SNI bazında) engelliyor → TR'deki VPS doğrudan
 * discord.com'a çıkamaz (TLS reset). Bu worker Cloudflare edge'inde (TR-dışı) çalışır,
 * Discord template API'sini çağırıp JSON'u aynen döner. Backend bunu çağırır.
 *
 * DEPLOY:
 *   1. dash.cloudflare.com → Workers & Pages → Create → Worker → bu kodu yapıştır → Deploy.
 *   2. Worker → Settings → Variables and Secrets → PROXY_SECRET = <rastgele uzun dize> (Secret/Encrypt).
 *   3. Worker URL'ini al: https://<isim>.<hesap>.workers.dev
 *
 * BACKEND ENV (/home/deploy/kankaverse/.env.production):
 *   DISCORD_TEMPLATE_PROXY=https://<isim>.<hesap>.workers.dev
 *   DISCORD_TEMPLATE_PROXY_SECRET=<aynı PROXY_SECRET>
 *   (sonra: docker compose --env-file .env.production -f docker-compose.prod.yml up -d api)
 *
 * Backend çağrısı: GET {DISCORD_TEMPLATE_PROXY}?code=<şablonKodu>  (header: x-proxy-secret)
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code') || '';

    // Secret ayarlıysa zorunlu (worker'ı herkese açık bırakmamak için)
    if (env.PROXY_SECRET && request.headers.get('x-proxy-secret') !== env.PROXY_SECRET) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (!/^[A-Za-z0-9-]{1,64}$/.test(code)) {
      return new Response(JSON.stringify({ error: 'bad_code' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const r = await fetch(`https://discord.com/api/v10/guilds/templates/${code}`, {
      headers: { 'User-Agent': 'Kankaverse-Proxy/1.0' },
    });
    const body = await r.text();
    // Discord'un status'unu aynen geçir (404 → backend TEMPLATE_NOT_FOUND'a eşler)
    return new Response(body, {
      status: r.status,
      headers: { 'content-type': 'application/json' },
    });
  },
};
