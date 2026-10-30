/**
 * C35 §2.3 (R7) — gelen webhook adresi `/webhooks/:id/:token` biçiminde gizli token taşır.
 * Hata gövdesine (`path`) ve her log satırına yazılacak adres ÖNCE buradan geçer:
 * `/webhooks/:id/<token>` → `/webhooks/:id/***`.
 *
 * Başa sabitlenir (`^`): yönetim uçları (`/guilds/:g/webhooks/:id/token`) token taşımaz ve
 * eşleşmemeli. Caddy `/api` önekini soyar ama doğrudan `api.` alan adı ya da önek korunan
 * kurulumlar için `/api` öneki de kabul edilir. Sorgu dizesi/parça korunur.
 */
export function maskWebhookPath(url: string): string {
  return url.replace(/^((?:\/api)?\/webhooks\/[^/?#]+\/)[^/?#]+/, '$1***');
}
