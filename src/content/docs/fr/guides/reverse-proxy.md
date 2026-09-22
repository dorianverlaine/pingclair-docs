---
title: Proxifier une application
h1_emoji: '🔀'
sidebar:
  order: 1
description: Placer Pingclair devant une application, répartir le trafic sur plusieurs instances et continuer à servir quand l'une d'elles tombe.
---

Le reverse proxy est la configuration pour laquelle on vient : une adresse
publique, une ou plusieurs instances d'application derrière, et aucune
modification de l'application. Cette page part d'un seul amont pour arriver à un
pool avec contrôles de santé, délais et secours, et montre ce que l'application
voit de l'autre côté.

## 🧾 Avant de commencer

- Pingclair installé et en service ([Installation](/fr/start/install/)), service
  arrêté le temps des essais : `sudo pc service stop`.
- Une application à l'écoute sur un port local. Les exemples utilisent
  `127.0.0.1:3000`.
- Un port pour le proxy lui-même : `:8080` dans les exemples.

## 🔀 Un seul amont

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

La réponse est celle de l'application, et ses en-têtes passent tels quels.
L'option `admin` est là pour que `pingclair reload` puisse joindre le serveur en
service ; `SIGUSR1` n'en a pas besoin
([ce que signifie un rechargement](/fr/start/service/#-what-a-reload-means)).

## ⚖️ Plusieurs amonts

Listez les instances avec `to`, puis choisissez la répartition :

```caddyfile
http://:8080 {
    reverse_proxy {
        to 127.0.0.1:3000
        to 127.0.0.1:3001
        lb_policy round_robin
    }
}
```

Six requêtes sur deux instances vivantes alternent, mesuré avec une application
qui indique quel port a répondu :

```text
3000 3001 3000 3001 3000 3001
```

| `lb_policy` | Comportement |
| --- | --- |
| `round_robin` | Une requête par amont, dans l'ordre. La valeur par défaut. |
| `random` | Un amont au hasard. |
| `least_conn` | L'amont qui a le moins de connexions en cours. |
| `ip_hash` | La même adresse cliente atteint toujours le même amont. |
| `first` | Le premier amont disponible. |
| `header <nom>`, `cookie <nom>`, `query <nom>` | Hachage sur ce champ : une session reste sur une instance. |
| `weighted_round_robin <p> …` | Un poids par amont, sur la même ligne. |

Les poids existent aussi par amont, ce qui se lit mieux quand les raisons
diffèrent :

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

⚠️ `lb_policy weighted_round_robin 3 1` compte les amonts déjà écrits : les lignes
`to` doivent donc venir **avant**. Dans l'autre ordre, `validate` refuse le
fichier avec `2 weights were given for 0 upstreams`.

Un amont marqué `backup` n'est utilisé que lorsque tous les autres sont
indisponibles :

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

Les deux vivants, chaque requête part vers `3000`. Arrêtez ce processus : la
requête suivante est servie par `3001`.

## 🩺 Contrôles de santé

Sans contrôle, un amont n'est retiré qu'après l'échec d'une requête. Le contrôle
l'en sort d'abord :

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

L'application a besoin d'un point de contrôle peu coûteux — ici `/health`. Chaque
changement d'état est journalisé, ce qui explique pourquoi une instance est sortie
de la rotation :

```text
INFO pingclair_proxy::health_check: 🩺 Active upstream health changed backend=Inet(127.0.0.1:3001) healthy=false
INFO pingclair_proxy::health_check: 🩺 Active upstream health changed backend=Inet(127.0.0.1:3001) healthy=true
```

Mesuré sur cette configuration : la seconde instance tuée, tout le trafic est allé
à la première ; revenue, elle a rejoint la rotation après `consecutive_success`
sondes réussies. Les mêmes options existent dans la forme plate qu'utilisent les
vrais Caddyfiles (`health_uri`, `health_interval`, `health_timeout`,
`health_status`, `health_fails`, `health_passes`) et configurent le même contrôle.

## ⏱️ Délais

Les délais vivent dans un bloc `transport http` à l'intérieur de `reverse_proxy`,
pas directement dessous :

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

Mesuré : `127.0.0.1:3099` n'acceptant rien, `connect_timeout 1s` coûte une seconde
et la requête est retentée sur le second amont, qui répond `200`. Une application
qui accepte la connexion puis attend 3 secondes avant le corps subit
`first_byte_timeout 1s`, et le client reçoit `504`.

`dial_timeout` n'est pas une option de `reverse_proxy` ; écrit là, `validate`
refuse le fichier avec `Unknown directive 'reverse_proxy: dial_timeout'`. Le nom
dans `transport http` est `connect_timeout`.

## 🔁 Amonts par nom

Un amont peut être un nom plutôt qu'une adresse, ce dont un conteneur qui redémarre
sur une nouvelle IP a besoin :

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

Le nom est résolu à nouveau à cet intervalle, et le changement est journalisé :

```text
INFO pingclair_proxy::dns: 🔄 Upstream DNS scheduler enabled interval_secs=5 pools=1
INFO pingclair_proxy::dns: 🔄 Upstream DNS refresh changed=1 adopted=0 kept_stale=0 unresolved=0
```

Mesuré avec `/etc/hosts` comme source de vérité : pointer `api.internal` sur
`127.0.0.1` servait la première instance, l'éditer vers `127.0.0.2` servait la
seconde dans l'intervalle, sans redémarrage et sans requête en échec. Une
résolution qui échoue garde l'adresse précédente dans la rotation.

## 📨 Ce que voit l'amont

L'application reçoit le `Host` d'origine et l'adresse du client dans les en-têtes
habituels :

```text
{
  "host": "127.0.0.1:8080",
  "x_forwarded_for": "127.0.0.1",
  "x_forwarded_proto": "http",
  "x_real_ip": "127.0.0.1"
}
```

Derrière un autre proxy, l'adresse de ces en-têtes est celle de ce proxy tant
qu'il n'est pas listé dans `trusted_proxies` ; le
[guide Cloudflare Tunnel](/fr/guides/cloudflare-tunnel/) traite ce cas.

## ⚠️ Quand cela ne marche pas

- **`502` du proxy.** Aucun amont n'a répondu. Vérifiez que l'application écoute
  (`sudo ss -ltnp | grep :3000`) et que l'adresse correspond.
- **`504` après une pause.** Un délai a expiré : `first_byte_timeout` pour un
  backend lent, `read_timeout` pour un corps lent, `connect_timeout` pour un hôte
  qui n'accepte jamais.
- **`Unknown directive 'reverse_proxy: …'`.** L'option appartient à un bloc
  imbriqué — les délais sous `transport http`, les contrôles sous `health_check`
  — et `validate` nomme l'orthographe refusée.
- **Un changement de configuration ne prend pas effet.** Le rechargement applique
  la politique, pas un nouvel écouteur, et `pc service reload` n'applique rien du
  tout ; voir [Exécution comme service](/fr/start/service/#-what-a-reload-means).
- **Toutes les requêtes arrivent sur une instance.** C'est la seule saine. Le
  journal des contrôles de santé dit quand les autres sont sorties, et pourquoi
  (`ConnectRefused`, `failure_statuses`, …).

## 🧭 Étapes suivantes

- [Servir un site statique](/fr/guides/static-site/) : compression, cache et repli
  pour les applications d'une seule page.
- [`reverse_proxy`](/fr/reference/directives/#reverse_proxy) : la référence de la
  directive.
- [Exécution comme service](/fr/start/service/) : rechargements, redémarrages et
  journaux.
