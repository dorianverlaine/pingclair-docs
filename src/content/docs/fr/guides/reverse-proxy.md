---
title: Proxifier une application
h1_emoji: '🔀'
sidebar:
  order: 1
description: Placer Pingclair devant une application, répartir le trafic sur plusieurs instances, et continuer de servir quand l'une d'elles tombe.
---

Un reverse proxy place une adresse publique unique devant une ou plusieurs
instances d'une application, sans modifier l'application. Cette page part d'un
seul upstream et aboutit à un pool avec contrôles de santé, délais et secours.
Elle se termine par ce que voit l'application de l'autre côté.

📌 Cette page décrit **v0.2.0-rc.3**, la dernière version publiée. Les
changements qui n'existent que sur la branche `main` du serveur sont signalés
par **Prochaine version**.

## 🧾 Avant de commencer

- Pingclair installé et en cours d'exécution ([Installation](/fr/start/install/)),
  avec le service arrêté le temps de vos essais : `sudo pc service stop`.
- Une application à l'écoute sur un port local. Les exemples utilisent
  `127.0.0.1:3000`.
- Un port pour le proxy lui-même : `:8080` dans les exemples.

## 🔀 Un seul upstream

```caddyfile
{
    admin 127.0.0.1:2019
}

http://:8080 {
    reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo cp Pingclairfile /etc/Pingclair/Pingclairfile
sudo pingclair validate /etc/Pingclair/Pingclairfile
sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"
curl -i http://localhost:8080/
```

La réponse est celle de l'application, avec ses propres en-têtes. L'option
`admin` permet à `pingclair reload` de joindre le serveur en cours d'exécution ;
le rechargement par `SIGUSR1` montré ci-dessus fonctionne sans elle
([ce que signifie un rechargement](/fr/start/service/#-ce-que-signifie-un-rechargement)).

## ⚖️ Plusieurs upstreams

Listez les instances avec `to`, puis choisissez comment répartir le trafic :

```caddyfile
http://:8080 {
    reverse_proxy {
        to 127.0.0.1:3000
        to 127.0.0.1:3001
        lb_policy round_robin
    }
}
```

Avec une application qui indique le port qui a répondu, six requêtes alternent
entre les deux instances :

```text
3000 3001 3000 3001 3000 3001
```

| `lb_policy` | Comportement |
| --- | --- |
| `round_robin` | Une requête par upstream, dans l'ordre. Valeur par défaut dans v0.2.0-rc.3. |
| `random` | N'importe quel upstream, tiré au hasard. |
| `least_conn` | L'upstream qui a le moins de connexions en cours. |
| `ip_hash` | Une même adresse cliente atteint toujours le même upstream. |
| `first` | Censé choisir le premier upstream disponible. Dans v0.2.0-rc.3, il se comporte comme `round_robin`. |
| `header <name>`, `cookie <name>`, `query <name>` | Hachage sur ce champ, pour qu'une session reste sur une même instance. |
| `weighted_round_robin <w> …` | Un poids par upstream, sur la même ligne. |

**Prochaine version :** sans `lb_policy`, l'upstream est tiré au hasard, comme
par défaut dans Caddy ; écrivez `lb_policy round_robin` pour conserver
l'alternance. Et `first` s'en tient réellement au premier upstream disponible.

Un poids peut aussi se déclarer sur chaque upstream, ce qui se lit mieux quand
chaque instance a sa propre raison :

```caddyfile
http://:8080 {
    reverse_proxy {
        to 127.0.0.1:3000 {
            weight 3
        }
        to 127.0.0.1:3001
    }
}
```

⚠️ `lb_policy weighted_round_robin 3 1` associe ses poids aux upstreams écrits
au-dessus de lui ; les lignes `to` doivent donc venir **avant**. Dans l'ordre
inverse, `validate` refuse le fichier avec
`2 weights were given for 0 upstreams`.

Un upstream marqué `backup` n'est utilisé que lorsque tous les autres sont
indisponibles :

```caddyfile
http://:8080 {
    reverse_proxy {
        to 127.0.0.1:3000
        to 127.0.0.1:3001 {
            backup
        }
    }
}
```

Tant que les deux sont vivants, chaque requête va à `3000`. Arrêtez ce
processus, et la requête suivante reçoit sa réponse de `3001`.

## 🩺 Contrôles de santé

Sans contrôle de santé, un upstream ne sort de la rotation qu'après l'échec
d'une requête qui lui était destinée. Un contrôle de santé sonde chaque upstream
en arrière-plan et retire celui qui défaille avant qu'une requête d'utilisateur
ne l'atteigne :

```caddyfile
http://:8080 {
    reverse_proxy {
        to 127.0.0.1:3000
        to 127.0.0.1:3001
        health_check {
            path /health
            interval 2s
            timeout 1s
            status 200
            consecutive_failure 2
            consecutive_success 1
        }
    }
}
```

L'application a besoin d'un point de terminaison qui répond à peu de frais,
ici `/health`. Chaque changement d'état est journalisé ; c'est ainsi que l'on
sait quand une instance a quitté la rotation :

```text
INFO pingclair_proxy::health_check: 🩺 Active upstream health changed backend=Inet(127.0.0.1:3001) healthy=false
INFO pingclair_proxy::health_check: 🩺 Active upstream health changed backend=Inet(127.0.0.1:3001) healthy=true
```

Mesuré sur cette configuration : la seconde instance arrêtée, tout le trafic est
allé à la première ; à son retour, elle a rejoint la rotation après
`consecutive_success` sondes réussies. L'écriture à plat de Caddy
(`health_uri`, `health_interval`, `health_timeout`, `health_status`,
`health_fails`, `health_passes`) configure le même contrôle.

## ⏱️ Délais

Les délais se placent dans un bloc `transport http` à l'intérieur de
`reverse_proxy`, et non directement sous lui :

```caddyfile
http://:8080 {
    reverse_proxy {
        to 127.0.0.1:3099
        to 127.0.0.1:3000
        transport http {
            connect_timeout 1s
            first_byte_timeout 1s
            read_timeout 30s
            write_timeout 30s
        }
    }
}
```

Mesuré : avec `127.0.0.1:3099` qui n'accepte rien, `connect_timeout 1s` coûte
une seconde, puis la requête est retentée sur le second upstream, qui répond
`200`. Une application qui accepte la connexion puis attend 3 secondes avant
d'envoyer un corps se voit appliquer `first_byte_timeout 1s`, et le client
reçoit `504`.

`dial_timeout` n'est pas une option de `reverse_proxy` ; écrite à cet endroit,
`validate` refuse le fichier avec
`Unknown directive 'reverse_proxy: dial_timeout'`. Le nom à utiliser dans
`transport http` est `connect_timeout`.

## 🔁 Upstreams désignés par nom d'hôte

Un upstream peut être un nom d'hôte plutôt qu'une adresse. C'est ce dont a
besoin un conteneur qui redémarre sur une nouvelle adresse IP :

```caddyfile
{
    dns_refresh 5s
}

http://:8080 {
    reverse_proxy {
        to api.internal:3000
    }
}
```

Le nom est résolu de nouveau à cet intervalle, et chaque rafraîchissement est
journalisé :

```text
INFO pingclair_proxy::dns: 🔄 Upstream DNS scheduler enabled interval_secs=5 pools=1
INFO pingclair_proxy::dns: 🔄 Upstream DNS refresh changed=1 adopted=0 kept_stale=0 unresolved=0
```

Mesuré avec `/etc/hosts` comme source de vérité : `api.internal` pointant vers
`127.0.0.1` a servi la première instance ; après modification du fichier vers
`127.0.0.2`, la seconde a été servie dans l'intervalle, sans redémarrage et sans
aucune requête en échec. Une résolution qui échoue garde l'adresse précédente
en rotation.

## 📨 Ce que voit l'upstream

L'application reçoit le `Host` d'origine et l'adresse du client dans les
en-têtes habituels :

```text
{
  "host": "127.0.0.1:8080",
  "x_forwarded_for": "127.0.0.1",
  "x_forwarded_proto": "http",
  "x_real_ip": "127.0.0.1"
}
```

Derrière un autre proxy, l'adresse figurant dans ces en-têtes est celle de ce
proxy, à moins qu'il ne soit listé dans `trusted_proxies` ; le
[guide Cloudflare Tunnel](/fr/guides/cloudflare-tunnel/) traite ce cas.

## ⚠️ Quand cela ne marche pas

- **`502` renvoyé par le proxy.** Aucun upstream n'a répondu. Vérifiez que
  l'application écoute (`sudo ss -ltnp | grep :3000`) et que l'adresse
  correspond. **Prochaine version :** un `502` ou un `504` généré par Pingclair
  porte `Proxy-Status: pingclair; error=…` ; un code sans ce champ vient de
  l'application.
- **`504` après une pause.** Un délai a expiré : `first_byte_timeout` pour un
  backend lent, `read_timeout` pour un corps lent, `connect_timeout` pour un
  hôte qui n'accepte jamais.
- **`Unknown directive 'reverse_proxy: …'`.** L'option appartient à un bloc
  imbriqué (les délais sous `transport http`, les contrôles sous
  `health_check`), et `validate` nomme l'écriture exacte qu'il a refusée.
- **Une modification de configuration ne prend pas effet.** Un rechargement ne
  peut ni ajouter ni déplacer un écouteur. Quand le nouveau fichier le fait, la
  ligne d'état de l'unité nomme les adresses modifiées, et
  `sudo pc service restart` les applique. Voir
  [Exécution comme service](/fr/start/service/#-ce-que-signifie-un-rechargement).
- **Toutes les requêtes arrivent sur une seule instance.** C'est la seule en
  bonne santé. Le journal du contrôle de santé indique quand les autres ont
  quitté la rotation, et pourquoi (`ConnectRefused`, `failure_statuses`, etc.).

## 🧭 Étapes suivantes

- [Servir un site statique](/fr/guides/static-site/) : compression, cache et
  repli pour les applications d'une seule page.
- [`reverse_proxy`](/fr/reference/directives/#reverse_proxy) : la référence de
  la directive.
- [Exécution comme service](/fr/start/service/) : rechargements, redémarrages
  et journaux.
