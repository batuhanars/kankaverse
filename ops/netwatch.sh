#!/bin/bash
# Çıkış bağlantısı izleyici (2026-11-12, DeHost aralıklı çıkış kesintisi).
# Her dakika cron ile çalışır: dış hedeflere TCP bağlantısı dener. Koparsa zaman damgasıyla kaydeder ve
# (en çok 10 dakikada bir) traceroute alır; düzelince "DÜZELDİ" yazar. Sağlayıcıya kanıt toplamak için.
# Kurulum: /usr/local/bin/kv-netwatch + /etc/cron.d/kv-netwatch ("* * * * * root /usr/local/bin/kv-netwatch").
# Kayıt: /var/log/kv-netwatch.log

LOG=/var/log/kv-netwatch.log
STATE=/run/kv-netwatch.state
LAST_TRACE=/run/kv-netwatch.trace
TARGETS="140.82.121.3:443 140.82.121.34:443 1.1.1.1:443 8.8.8.8:443 185.125.190.81:80"

ts=$(date '+%F %T %z')
fail=""
for t in $TARGETS; do
  h=${t%:*}; p=${t#*:}
  timeout 5 bash -c "</dev/tcp/$h/$p" 2>/dev/null || fail="$fail $t"
done

prev=$(cat "$STATE" 2>/dev/null || echo ok)

trace() { # $1 host, $2 port, $3 etiket
  echo "-- traceroute $1:$2 $3 ($ts)" >> "$LOG"
  if command -v traceroute >/dev/null; then
    traceroute -T -p "$2" -n -w 2 -q 1 -m 20 "$1" >> "$LOG" 2>&1
  else
    # traceroute paketi yoksa Caddy konteynerindeki busybox (ICMP; UDP'de son adımlar zaten yanıtsız)
    docker exec kankaverse-caddy-1 traceroute -I -n -w 2 -m 20 "$1" >> "$LOG" 2>&1
  fi
}

if [ -z "$fail" ]; then
  if [ "$prev" != "ok" ]; then
    echo "== $ts DÜZELDİ (tüm hedefler erişilebilir)" >> "$LOG"
    # Karşılaştırma için sağlıklı durumun izi: kesintideki izle yan yana konunca nerede koptuğu görünür.
    trace 140.82.121.3 443 "SAĞLIKLI"
  fi
  echo ok > "$STATE"
  exit 0
fi

echo "== $ts KOPUK:$fail" >> "$LOG"
echo fail > "$STATE"

now=$(date +%s)
last=$(cat "$LAST_TRACE" 2>/dev/null || echo 0)
[ $((now - last)) -lt 600 ] && exit 0
echo "$now" > "$LAST_TRACE"

for t in $fail; do
  trace "${t%:*}" "${t#*:}" "KOPUK"
done
