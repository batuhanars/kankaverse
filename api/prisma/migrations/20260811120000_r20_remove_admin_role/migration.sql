-- AlterEnum
BEGIN;

-- R20 §1.4: VERİ göçü tip göçünden ÖNCE. `ADMIN` rolündeki üyeler `MEMBER`'a düşürülür — gerçek
-- yetki artık enum'dan değil rol sisteminden gelir (ADMINISTRATOR bayraklı rol atamak). Enum tipi
-- küçültülmeden önce hiçbir satır yeni enum'a sığmayan bir değer taşımamalı; aksi halde aşağıdaki
-- `USING ("role"::text::"GuildRole_new")` cast'i "invalid input value for enum" ile patlar.
UPDATE "GuildMember" SET "role" = 'MEMBER' WHERE "role" = 'ADMIN';

CREATE TYPE "GuildRole_new" AS ENUM ('OWNER', 'MEMBER');
ALTER TABLE "public"."GuildMember" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "GuildMember" ALTER COLUMN "role" TYPE "GuildRole_new" USING ("role"::text::"GuildRole_new");
ALTER TYPE "GuildRole" RENAME TO "GuildRole_old";
ALTER TYPE "GuildRole_new" RENAME TO "GuildRole";
DROP TYPE "public"."GuildRole_old";
ALTER TABLE "GuildMember" ALTER COLUMN "role" SET DEFAULT 'MEMBER';
COMMIT;
