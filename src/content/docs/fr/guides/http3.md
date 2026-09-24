---
title: Servir HTTP/3
h1_emoji: '⚡'
sidebar:
  order: 4
description: Activer HTTP/3, prouver qu'un client l'a réellement utilisé, et savoir quelles requêtes se comportent autrement sur QUIC.
---

HTTP/3 est activé par défaut : un site HTTPS reçoit un écouteur QUIC sur
UDP 443, sauf si la liste globale des protocoles omet `h3`. Ce qui demande de
l'attention, c'est de prouver qu'un client l'a réellement utilisé, car un client
qui se replie discrètement sur HTTP/2 ressemble en tout point à un succès.

📌 Cette page décrit **v0.2.0-rc.3**, la dernière version publiée. Les
changements qui n'existent que sur la branche `main` du serveur sont signalés
par **Prochaine version**.

## 🧾 Avant de commencer

- Un nom qui pointe vers l'hôte, et un certificat pour ce nom
  ([HTTPS](/fr/start/https/)).
- **UDP 443 ouvert** dans le pare-feu du fournisseur et dans celui de l'hôte.
  QUIC n'a pas de solution de repli propre : si UDP est bloqué, les clients
  utilisent HTTP/2 sans le signaler.
- Un client qui prend en charge HTTP/3. Le `curl` système de la plupart des
  distributions ne le fait pas, et le lui demander quand même le dit
  clairement :

  ```text
  curl: option --http3: the installed libcurl version doesn't support this
  ```

## 🔌 L'activer

```caddyfile
{
    email bonjour@pingclair.com
    servers {
        protocols h1 h2 h3
    }
}

example.com {
    file_server /srv/site
}
```

Mesuré sur l'hôte, le site en service :

```bash
sudo ss -lunp | grep ':443 '
```

```text
UNCONN 0 0 *:443 *:* users:(("pingclair",pid=5425,fd=22))
```

Retirer `h3` de la liste supprime cet écouteur ; la liste fait office
d'interrupteur ([TLS : ce qui se règle](/fr/guides/tls-tuning/#-quels-protocoles-sont-servis)).
Sans ligne `protocols`, HTTP/3 reste activé.

Le bloc `tls` accepte aussi un interrupteur par site :

```caddyfile
example.com {
    tls {
        http3 off
    }
    file_server /srv/site
}
```

⚠️ Dans v0.2.0-rc.3, `http3 off` est accepté et reste sans effet : le site est
toujours servi sur QUIC. **Prochaine version :** l'option tient ce site à
l'écart de QUIC pendant que l'écouteur sert les autres sites, et ses réponses
cessent d'annoncer HTTP/3 dans `Alt-Svc`.

## ✅ Prouver qu'un client l'a utilisé

La preuve vient du client. N'importe quel curl compilé avec ngtcp2 ou quiche
convient, et un conteneur est le moyen le plus rapide d'en obtenir un sur un
hôte dont le curl ne sait pas faire HTTP/3 :

```bash
docker run --rm --network host \
  ymuski/curl-http3 curl -sI --http3 https://example.com/
```

```text
curl 8.2.1-DEV (x86_64-pc-linux-gnu) libcurl/8.2.1-DEV BoringSSL zlib/1.2.13 nghttp2/1.52.0 quiche/0.18.0
```

`--network host` permet au conteneur d'utiliser directement le réseau de
l'hôte. Sans cette option, la requête peut traverser un espace de noms réseau
qui bloque QUIC.

```text
HTTP/3 200
content-type: text/html; charset=utf-8
etag: "5e-6ab20622"
accept-ranges: bytes
x-served-by: pingclair
server: Pingclair
```

La réponse est dans la première ligne : la ligne d'état indique `HTTP/3`, et non
`HTTP/2`. Demander la même URL avec `--http2` et `--http1.1` montre les deux
autres protocoles, ce qui confirme que le client ne se replie pas.

Faute de conteneur, une négociation QUIC peut se vérifier avec l'OpenSSL du
système, s'il est en version 3.5 ou plus récente :

```bash
openssl s_client -quic -alpn h3 -connect example.com:443 -servername example.com </dev/null
```

```text
Protocol: QUICv1
ALPN protocol: h3
    Protocol  : TLSv1.3
    Verify return code: 0 (ok)
```

`ALPN protocol: h3` avec une chaîne vérifiée prouve que l'écouteur QUIC répond
pour ce nom avec un certificat auquel le client fait confiance. Cela ne prouve
pas qu'une requête HTTP/3 complète fonctionne ; c'est le rôle du contrôle avec
curl.

## 🧭 Ce qui diffère sur HTTP/3

HTTP/3 partage son code de politique avec HTTP/1.1 et HTTP/2 : le routage, les
matchers, les en-têtes, la limitation de débit, FastCGI et le journal d'accès se
comportent de la même façon. Les différences se trouvent là où HTTP/3 ne peut
pas transporter quelque chose :

| Domaine | Sur HTTP/3 |
| --- | --- |
| Trailers de requête déclarés | Non transmis : `501` avant l'engagement de la réponse, réinitialisation du flux après. |
| Trailers de réponse de l'upstream | `502`. |
| `CONNECT` | Pingclair n'ouvre aucun tunnel. **Prochaine version :** `405` avec `Allow`, la même réponse que sur HTTP/1.1 et HTTP/2. |

Un CDN placé devant l'origine termine lui-même HTTP/3 et parle HTTP/1.1 ou
HTTP/2 à l'origine. L'écouteur de cette page ne dit alors rien de ce qu'a
utilisé le navigateur du visiteur ; consultez plutôt le réglage HTTP/3 du CDN.

## ⚠️ Quand cela ne marche pas

- **`option --http3: the installed libcurl version doesn't support this`.** Le
  client ne sait pas faire HTTP/3 ; utilisez un conteneur comme ci-dessus.
- **`curl --http3` reste bloqué ou expire.** UDP 443 est bloqué quelque part.
  Vérifiez d'abord le pare-feu ou le groupe de sécurité du fournisseur, puis
  celui de l'hôte.
- **Aucun écouteur UDP sur l'hôte.** `h3` manque dans la liste des protocoles de
  `servers`, ou le fichier en service n'est pas celui que vous avez modifié
  ([ce que signifie un rechargement](/fr/start/service/#-ce-que-signifie-un-rechargement)).
- **HTTP/3 fonctionne en local mais pas depuis l'extérieur.** Le réseau du
  client bloque UDP 443, ce qui est courant sur les réseaux d'entreprise et
  d'hôtel ; les navigateurs se replient en silence.
- **Un site avec `http3 off` répond toujours en HTTP/3.** Dans v0.2.0-rc.3,
  l'option est sans effet ; retirez `h3` de la liste globale si aucun site ne
  doit utiliser HTTP/3.

## 🧭 Étapes suivantes

- [TLS : ce qui se règle](/fr/guides/tls-tuning/) : la liste des protocoles, les
  certificats et les certificats clients.
- [État du projet](/fr/project/status/) : ce qui est pris en charge, refusé ou
  connu comme défectueux dans cette version.
- [`tls`](/fr/reference/directives/#tls) : l'option `http3` dans son contexte.
