import { Prisma } from '@prisma/client';

/**
 * Huni sorgusu. Gün sınırı Europe/Istanbul; ham sütunlar UTC "timestamp without tz" olduğu için
 * önce UTC kabul edilip sonra İstanbul'a çevrilir. Sayılmayanlar: silinmiş hesap, platform yöneticisi.
 * Session satırları revoke sonrası silinmez, bu yüzden aktivite günlüğü gibi okunur.
 */
export function funnelQuery(cohortDays: number): Prisma.Sql {
  return Prisma.sql`
    WITH u AS (
      SELECT id, "createdAt" c,
        date_trunc('day', ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul') cd,
        (${cohortDays}::int = 0
          OR "createdAt" > (now() AT TIME ZONE 'UTC') - make_interval(days => ${cohortDays}::int)) in_cohort
      FROM "User" WHERE "deletedAt" IS NULL AND NOT "isModerator"
    ),
    s AS (
      SELECT "userId",
        date_trunc('day', ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul') d,
        max("createdAt") last_at
      FROM "Session" GROUP BY 1, 2
    ),
    r AS (
      SELECT u.id,
        bool_or(s.d >= u.cd + interval '1 day') ret1,
        bool_or(s.d >= u.cd + interval '7 day') ret7,
        count(s.d) days,
        max(s.last_at) last_at
      FROM u LEFT JOIN s ON s."userId" = u.id GROUP BY u.id
    )
    SELECT
      count(*) FILTER (WHERE u.in_cohort) registered,
      count(*) FILTER (WHERE u.in_cohort AND EXISTS (SELECT 1 FROM "GuildMember" g WHERE g."userId" = u.id)) joined_guild,
      count(*) FILTER (WHERE u.in_cohort AND EXISTS (SELECT 1 FROM "Message" m WHERE m."authorId" = u.id AND m."webhookId" IS NULL)) sent_message,
      count(*) FILTER (WHERE u.in_cohort AND r.ret1) returned_next_day,
      count(*) FILTER (WHERE u.in_cohort AND r.ret7) returned_after_7_days,
      count(*) FILTER (WHERE u.in_cohort AND r.days >= 3) active_on_3_days,
      count(*) FILTER (WHERE r.last_at > (now() AT TIME ZONE 'UTC') - interval '7 day') active_last_7_days,
      count(*) FILTER (WHERE r.last_at > (now() AT TIME ZONE 'UTC') - interval '30 day') active_last_30_days,
      count(*) FILTER (WHERE u.c > (now() AT TIME ZONE 'UTC') - interval '7 day') registered_last_7_days
    FROM u JOIN r ON r.id = u.id`;
}
