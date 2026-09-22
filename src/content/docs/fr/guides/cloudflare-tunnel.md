---
title: Derrière un Cloudflare Tunnel
h1_emoji: '☁️'
sidebar:
  order: 5
description: Publier un site via un Cloudflare Tunnel, pour que l'origine n'ait besoin d'aucun port entrant, et faire afficher le vrai client dans les journaux de Pingclair.
---

Un Cloudflare Tunnel connecte l'origine vers l'extérieur : `cloudflared` appelle
Cloudflare, et Cloudflare renvoie les requêtes par cette connexion. Rien n'écoute
sur un port public, le bord termine le TLS, et l'origine voit du HTTP en clair sur
la boucle locale. Cette page met cela en place et corrige la première chose qui
va de travers : toutes les requêtes journalisées en `127.0.0.1`.

## 🧾 Avant de commencer

- Le domaine dans un compte Cloudflare, avec Zero Trust disponible.
- `cloudflared` sur la même machine que Pingclair, et Pingclair qui sert le site
  ([Servir un site statique](/fr/guides/static-site/)).
- Soit le tableau de bord (Zero Trust → Networks → Tunnels), soit un jeton d'API
  avec **Cloudflare Tunnel: Write** et **DNS: Edit** sur la zone. Les exemples
  utilisent l'API, avec `$CF_TOKEN`, `$ACCOUNT` et `$ZONE`.

## 🌐 Créer le tunnel

```bash
curl -s -X POST -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"name":"docs-origin","config_src":"cloudflare"}' \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel"
```

```text
{"success":true,"result":{"id":"bc6869fa-19cf-4780-b95b-f11be77eb329","name":"docs-origin", …}}
```

`config_src: cloudflare` rend le tunnel **géré à distance** : ses règles d'ingress
vivent dans Cloudflare et sont poussées par l'API, donc rien n'a besoin d'être
écrit à côté du connecteur.

Le justificatif du connecteur s'obtient par un appel séparé :

```bash
curl -s -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel/$TUNNEL_ID/token"
```

Ce jeton est un secret : c'est lui qui permet à une machine de rejoindre le
tunnel. Traitez-le comme un mot de passe et changez-le s'il fuit.

## 🔌 Connecter la machine

```bash
curl -fsSL -o /tmp/cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i /tmp/cloudflared.deb
sudo cloudflared service install "$TUNNEL_TOKEN"
```

```text
INF Linux service for cloudflared installed successfully
```

Le connecteur enregistre quatre connexions vers les points Cloudflare les plus
proches, en QUIC par défaut :

```text
INF Registered tunnel connection connIndex=2 … location=pdx02 protocol=quic
INF Registered tunnel connection connIndex=3 … location=sea10 protocol=quic
```

## 🌍 Router un nom d'hôte

Les règles d'ingress décident quel nom atteint quel service d'origine :

```bash
curl -s -X PUT -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"config":{"ingress":[
    {"hostname":"tunnel-test.pingclair.com","service":"http://127.0.0.1:80"},
    {"service":"http_status:404"}]}}' \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/cfd_tunnel/$TUNNEL_ID/configurations"
```

La dernière règle est le fourre-tout : un nom inconnu obtient `404` plutôt que le
site par défaut.

Ensuite, pointez le nom vers le tunnel, proxy activé :

```bash
curl -s -X POST -H "Authorization: Bearer $CF_TOKEN" -H 'Content-Type: application/json' \
  --data '{"type":"CNAME","name":"tunnel-test.pingclair.com","content":"'$TUNNEL_ID'.cfargotunnel.com","proxied":true,"ttl":60}' \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records"
```

Depuis n'importe où :

```bash
curl -I https://tunnel-test.pingclair.com/
```

```text
HTTP/2 200
content-type: text/html; charset=utf-8
accept-ranges: bytes
server: cloudflare
```

`server: cloudflare` est le bord qui répond ; l'origine a été atteinte par le
tunnel, sans ouvrir aucun port.

## 🎯 Que l'origine voie le client

Par défaut, chaque requête arrive du connecteur sur la boucle locale : le journal
d'accès ne dit alors rien de qui était le client.

```text
📝 Access … host="tunnel-test.pingclair.com" status=200 remote_ip=127.0.0.1 user_agent="curl/8.7.1"
```

`trusted_proxies` indique à Pingclair quels pairs peuvent affirmer l'adresse du
client. Le connecteur tourne sur la même machine : la boucle locale suffit.

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

Mesuré, la même requête avant et après l'option :

```text
remote_ip=127.0.0.1          # avant
remote_ip=16.162.199.171     # après : le client qui a lancé la requête
```

C'est aussi ce réglage qui donne un sens à la limitation par IP et aux règles par
IP derrière un tunnel. Il est établi au démarrage : le changer demande un
redémarrage, pas un rechargement
([ce que signifie un rechargement](/fr/start/service/#-ce-que-signifie-un-rechargement)).

## ⚠️ Quand cela ne marche pas

- **`HTTP/2 530` avec `error code: 1033`.** Le tunnel n'a pas de connecteur.
  `systemctl is-active cloudflared` sur l'origine le dit ; les requêtes
  répondent `200` quelques secondes après l'enregistrement du connecteur.
- **Une requête atteint un autre site, ou `404`.** Les règles d'ingress sont
  évaluées dans l'ordre et finissent par le fourre-tout ; vérifiez l'orthographe
  du nom dans la règle avant d'accuser le DNS.
- **`502` depuis le bord.** Le connecteur est là, mais le service d'origine a
  refusé la connexion : Pingclair n'écoute pas sur le port de la règle.
- **Le journal d'accès dit toujours `127.0.0.1`.** `trusted_proxies` manque, comme
  ci-dessus.
- **Le nom ne résout pas.** L'enregistrement doit être un CNAME proxifié vers
  `<tunnel-id>.cfargotunnel.com` ; un enregistrement en nuage gris contourne le
  tunnel.
- **Le jeton du connecteur a fuité.** Supprimez les jetons du tunnel et
  réinstallez le service avec le nouveau ; l'ancien n'est de toute façon pas
  récupérable par l'API.

## 🧭 Étapes suivantes

- [Servir un site statique](/fr/guides/static-site/) : l'origine que ces exemples
  visent.
- [TLS : ce qui se règle](/fr/guides/tls-tuning/) : ce que l'origine peut faire
  des certificats quand le bord ne termine pas.
- [Exécution comme service](/fr/start/service/) : l'unité sur l'origine, et la
  sémantique de rechargement que la note sur `trusted_proxies` rappelle.
