---
title: Derrière un Cloudflare Tunnel
h1_emoji: '☁️'
sidebar:
  order: 5
description: Publier un site par un Cloudflare Tunnel pour que l'origine n'ait besoin d'aucun port entrant, et faire apparaître le vrai client dans les journaux de Pingclair plutôt que le connecteur.
---

Un Cloudflare Tunnel relie l'origine vers l'extérieur : `cloudflared` appelle
Cloudflare, et Cloudflare renvoie les requêtes par cette connexion. Rien
n'écoute sur un port public, l'edge termine TLS, et l'origine reçoit du HTTP en
clair sur la boucle locale. Cette page met cela en place, puis règle le premier
problème que tout le monde rencontre : chaque requête est journalisée comme
provenant de `127.0.0.1`.

📌 Cette page décrit Pingclair **v0.2.0-rc.3**, la dernière version publiée.

## 🧾 Avant de commencer

- Le domaine dans un compte Cloudflare, avec Zero Trust disponible.
- `cloudflared` sur le même hôte que Pingclair, et Pingclair qui sert le site
  ([Servir un site statique](/fr/guides/static-site/)).
- Soit le tableau de bord (Zero Trust → Networks → Tunnels), soit un jeton
  d'API doté de **Cloudflare Tunnel: Write** et **DNS: Edit** sur la zone. Les
  exemples utilisent l'API, avec `$CF_TOKEN`, `$ACCOUNT` et `$ZONE` définis
  respectivement sur le jeton, l'identifiant du compte et l'identifiant de la
  zone.

## 🌐 Créer le tunnel

```bash
curl -s -X POST -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"name":"docs-origin","config_src":"cloudflare"}' \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel"
```

```text
{"success":true,"result":{"id":"bc6869fa-19cf-4780-b95b-f11be77eb329","name":"docs-origin", …}}
```

`config_src: cloudflare` signifie que le tunnel est **géré à distance** : ses
règles d'entrée vivent chez Cloudflare et sont poussées par l'API ; rien n'a
donc besoin d'être écrit à côté du connecteur.

L'identifiant du connecteur s'obtient par un appel séparé :

```bash
curl -s -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel/$TUNNEL_ID/token"
```

Ce jeton est un secret : il permet à n'importe quel hôte de rejoindre le
tunnel. Traitez-le comme un mot de passe, et renouvelez-le s'il fuit.

## 🔌 Connecter l'hôte

```bash
curl -fsSL -o /tmp/cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i /tmp/cloudflared.deb
sudo cloudflared service install "$TUNNEL_TOKEN"
```

```text
INF Linux service for cloudflared installed successfully
```

Le connecteur ouvre quatre connexions vers des sites Cloudflare proches, sur
QUIC par défaut :

```text
INF Registered tunnel connection connIndex=2 … location=pdx02 protocol=quic
INF Registered tunnel connection connIndex=3 … location=sea10 protocol=quic
```

## 🌍 Router un nom d'hôte

Les règles d'entrée décident quel nom d'hôte atteint quel service de
l'origine :

```bash
curl -s -X PUT -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"config":{"ingress":[
    {"hostname":"tunnel-test.pingclair.com","service":"http://127.0.0.1:80"},
    {"service":"http_status:404"}]}}' \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel/$TUNNEL_ID/configurations"
```

La dernière règle attrape tout le reste : une requête pour n'importe quel autre
nom d'hôte reçoit `404` au lieu d'atteindre l'origine.

Faites ensuite pointer le nom vers le tunnel, proxy activé :

```bash
curl -s -X POST -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"type":"CNAME","name":"tunnel-test.pingclair.com","content":"'$TUNNEL_ID'.cfargotunnel.com","proxied":true,"ttl":60}' \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records"
```

Depuis n'importe où :

```bash
curl -I https://tunnel-test.pingclair.com/
```

```text
HTTP/2 200
content-type: text/html; charset=utf-8
accept-ranges: bytes
server: cloudflare
```

`server: cloudflare` montre que c'est l'edge qui répond. L'origine a été
atteinte par le tunnel, sans qu'aucun port entrant ne soit ouvert pour elle.

## 🎯 Que l'origine voie le client

Chaque requête arrive du connecteur par la boucle locale ; par défaut, le
journal d'accès enregistre donc le connecteur, et non le client :

```text
📝 Access … host="tunnel-test.pingclair.com" status=200 remote_ip=127.0.0.1 user_agent="curl/8.7.1"
```

`trusted_proxies` liste les pairs autorisés à indiquer l'adresse du client dans
les en-têtes de transfert. Le connecteur tourne sur le même hôte ; la boucle
locale constitue donc toute la liste :

```caddyfile
{
    admin 127.0.0.1:2019
    trusted_proxies 127.0.0.1/32
}

http://:80 {
    root * /srv/site
    file_server
}
```

Mesuré, avec la même requête avant et après l'option :

```text
remote_ip=127.0.0.1          # before
remote_ip=16.162.199.171     # after: the client that started the request
```

C'est ce même réglage qui permet aux limites de débit par client et au matcher
`client_ip` de voir le vrai client derrière un tunnel. Il est lu au démarrage :
une modification exige donc un redémarrage plutôt qu'un rechargement
([ce que signifie un rechargement](/fr/start/service/#-ce-que-signifie-un-rechargement)).

**Prochaine version :** le matcher `remote_ip` compare le pair de la connexion
elle-même, qui, derrière un tunnel, est toujours le connecteur. Utilisez
`client_ip` pour cibler les clients ; dans v0.2.0-rc.3, les deux matchers voient
le client transmis.

## ⚠️ Quand cela ne marche pas

- **`HTTP/2 530` avec `error code: 1033`.** Le tunnel n'a aucun connecteur.
  `systemctl is-active cloudflared` sur l'origine indique s'il tourne ; les
  requêtes répondent de nouveau `200` quelques secondes après l'enregistrement
  du connecteur.
- **Une requête atteint un autre site, ou reçoit `404`.** Les règles d'entrée
  sont évaluées dans l'ordre et se terminent par la règle fourre-tout ;
  vérifiez l'orthographe du nom d'hôte dans la règle avant d'accuser le DNS.
- **`502` renvoyé par l'edge.** Le connecteur fonctionne, mais le service de
  l'origine a refusé la connexion : Pingclair n'écoute pas sur le port que
  nomme la règle.
- **Le journal d'accès indique toujours `127.0.0.1`.** `trusted_proxies` manque,
  comme ci-dessus.
- **Le nom d'hôte ne se résout pas.** L'enregistrement doit être un CNAME
  proxifié vers `<tunnel-id>.cfargotunnel.com` ; un enregistrement « nuage
  gris » contourne entièrement le tunnel.
- **Le jeton du connecteur a fuité.** Renouvelez le jeton du tunnel et
  réinstallez le service avec le nouveau.

## 🧭 Étapes suivantes

- [Servir un site statique](/fr/guides/static-site/) : l'origine vers laquelle
  pointent ces exemples.
- [TLS : ce qui se règle](/fr/guides/tls-tuning/) : ce que l'origine peut faire
  des certificats quand ce n'est pas l'edge qui termine TLS.
- [Exécution comme service](/fr/start/service/) : l'unité sur l'origine, et la
  sémantique de rechargement à laquelle renvoie la note sur `trusted_proxies`.
