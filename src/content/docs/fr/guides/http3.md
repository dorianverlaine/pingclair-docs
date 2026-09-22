---
title: Servir HTTP/3
h1_emoji: '⚡'
sidebar:
  order: 4
description: Activer HTTP/3, prouver qu'un client l'a réellement utilisé, et savoir quelles requêtes se comportent autrement sur QUIC.
---

HTTP/3 est actif au sens où rien n'est à installer : le serveur ouvre un écouteur
QUIC sur UDP 443 dès que l'ensemble de protocoles le permet. Ce qui demande du
soin, c'est la vérification, car un client qui retombe silencieusement sur HTTP/2
ressemble exactement à un succès.

## 🧾 Avant de commencer

- Un nom qui résout vers l'hôte, et un certificat pour ce nom
  ([HTTPS](/fr/start/https/)).
- **UDP 443 ouvert** dans le pare-feu du fournisseur et celui de l'hôte. QUIC n'a
  pas de repli : si UDP est bloqué, les clients utilisent HTTP/2 et ne le disent
  pas.
- Un client compatible HTTP/3. Le `curl` système de la plupart des distributions
  ne l'est pas — le demander est explicite :

  ```text
  curl: option --http3: the installed libcurl version doesn't support this
  ```

## 🔌 L'activer

```caddyfile
{
    email pingclair@aqeo.dev
    servers {
        protocols h1 h2 h3
    }
}

example.com {
    file_server /srv/site
}
```

Mesuré sur l'hôte, le site en service :

```bash
sudo ss -lunp | grep ':443 '
```

```text
UNCONN 0 0 *:443 *:* users:(("pingclair",pid=5425,fd=22))
```

Retirer `h3` de la liste enlève cet écouteur ; la liste est l'interrupteur
([TLS : ce qui se règle](/fr/guides/tls-tuning/#-which-protocols-are-served)). Un
site seul peut être sorti de HTTP/3 sans arrêter l'écouteur :

```caddyfile
example.com {
    tls {
        http3 off
    }
    file_server /srv/site
}
```

## ✅ Prouver qu'un client l'a utilisé

Le journal d'accès du serveur ne nomme pas le protocole : la preuve vient du
client. Tout curl construit avec ngtcp2 ou quiche convient ; un conteneur est le
plus rapide sur un hôte dont le curl ne sait pas faire HTTP/3 :

```bash
docker run --rm --network host \
  ymuski/curl-http3 curl -sI --http3 https://example.com/
```

```text
curl 8.2.1-DEV (x86_64-pc-linux-gnu) libcurl/8.2.1-DEV BoringSSL zlib/1.2.13 nghttp2/1.52.0 quiche/0.18.0
```

```text
HTTP/3 200
content-type: text/html; charset=utf-8
etag: "5e-6ab20622"
accept-ranges: bytes
x-served-by: pingclair
server: Pingclair
```

`--network host` est ce qui laisse le conteneur utiliser le chemin UDP de l'hôte ;
sans cela, la requête peut passer par un espace de noms réseau qui bloque QUIC.

La première ligne est toute la réponse : la ligne de statut dit `HTTP/3`, pas
`HTTP/2`. Demander la même URL avec `--http2` et `--http1.1` montre les deux
autres, ce qui prouve que le client ne retombe pas simplement.

Quand aucun conteneur n'est disponible, une poignée de main QUIC se vérifie avec
l'OpenSSL du système, s'il est 3.5 ou plus récent :

```bash
openssl s_client -quic -alpn h3 -connect example.com:443 -servername example.com </dev/null
```

```text
Protocol: QUICv1
ALPN protocol: h3
    Protocol  : TLSv1.3
    Verify return code: 0 (ok)
```

`ALPN protocol: h3` avec une chaîne vérifiée prouve que l'écouteur QUIC répond pour
ce nom avec un certificat en lequel le client a confiance. Cela ne prouve pas une
requête HTTP/3 complète : c'est le rôle du contrôle curl.

## 🧭 Ce qui diffère sur HTTP/3

La couche de politique est partagée avec HTTP/1.1 et HTTP/2 : routage, matchers,
en-têtes, limitation de débit et journal d'accès se comportent pareil. Ce qui
diffère, c'est là où le transport ne peut pas transporter quelque chose :

| Domaine | En HTTP/3 |
| --- | --- |
| Trailers de requête déclarés | Non transmis : `501` avant l'engagement de la réponse, réinitialisation du flux ensuite. |
| Trailers de réponse d'amont | `502`. |
| `CONNECT` et `CONNECT` étendu | `501` jusqu'à l'implémentation des tunnels. |
| `php_fastcgi` | `501` ; FastCGI n'est servi qu'en HTTP/1.1 et HTTP/2. |

Un CDN devant termine lui-même HTTP/3 et parle HTTP/1.1 ou HTTP/2 à l'origine :
l'écouteur ici ne prouve donc rien sur ce que le navigateur du visiteur a utilisé.
Pour cela, regardez le réglage HTTP/3 du CDN.

## ⚠️ Quand cela ne marche pas

- **`option --http3: the installed libcurl version doesn't support this`.** Le
  client n'a pas HTTP/3 ; utilisez un conteneur comme ci-dessus.
- **`curl --http3` se bloque ou expire.** UDP 443 est bloqué quelque part.
  Vérifiez d'abord le pare-feu ou le groupe de sécurité du fournisseur, puis
  l'hôte.
- **Aucun écouteur UDP sur l'hôte.** `h3` manque dans la liste de protocoles, ou
  le fichier en service n'est pas celui que vous avez édité
  ([ce que signifie un rechargement](/fr/start/service/#-what-a-reload-means)).
- **HTTP/3 marche localement mais pas depuis l'extérieur.** Le réseau du client
  bloque UDP 443, ce qui est courant en entreprise et à l'hôtel ; les navigateurs
  retombent silencieusement.
- **Les routes FastCGI répondent `501`.** C'est le comportement prévu en HTTP/3 ;
  la [page d'état](/fr/project/status/) liste ce qui est servi où.

## 🧭 Étapes suivantes

- [TLS : ce qui se règle](/fr/guides/tls-tuning/) : la liste des protocoles, les
  certificats et les certificats clients.
- [État du projet](/fr/project/status/) : ce qui est pris en charge, refusé et
  connu comme cassé dans cette version.
- [`tls`](/fr/reference/directives/#tls) : l'option `http3` en contexte.
