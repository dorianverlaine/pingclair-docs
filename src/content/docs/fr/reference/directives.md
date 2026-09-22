---
title: Directives
h1_emoji: '🧾'
description: Syntaxe, valeurs par défaut et contexte des directives couvertes par cette documentation.
---

Chaque entrée indique la syntaxe, la valeur par défaut lorsque la directive est
absente, et les endroits où la directive peut apparaître. L'attestation de
version — la ligne `Since:` qui indiquerait depuis quand une directive existe —
n'est pas encore publiée.

📖 Cette page documente un sous-ensemble de départ. Les directives acceptées
mais pas encore documentées ici sont tout de même validées par
`pingclair validate` ; une directive que le serveur n'implémente pas est refusée
par son nom plutôt qu'acceptée en silence.

## encode

```text
Syntax:   encode <format> [<format> ...]
Default:  no compression
Context:  site block
```

Compresse les réponses. Les arguments sont listés par ordre de préférence : le
premier format accepté par le client est utilisé. Les formats pris en charge
sont `zstd` et `gzip`.

Demander Brotli est une erreur de compilation plutôt qu'une dégradation
silencieuse vers gzip : le proxy n'a pas d'encodeur Brotli en flux, l'option ne
peut donc pas être honorée.

```caddyfile
example.com {
    encode zstd gzip
    file_server ./public
}
```

## file_server

```text
Syntax:   file_server [<root>]
Default:  disabled
Context:  site block
```

Sert des fichiers depuis le disque, avec détection du type MIME, requêtes
partielles et validation par ETag et `Last-Modified`. L'argument facultatif
définit la racine pour cette seule directive. Lorsqu'il est omis, la racine du
site définie par `root` est utilisée.

```caddyfile
localhost:8080 {
    file_server ./public
}
```

## header

```text
Syntax:   header [<matcher>] <field> <value>
          header [<matcher>] {
              <field> <value>      # set
              +<field> <value>     # append
              -<field>             # remove
              set <field> <value>  # set, spelled explicitly
          }
Default:  none
Context:  site block
```

Ajoute, remplace ou supprime des en-têtes de réponse. Un nom de champ seul
définit l'en-tête ; le préfixe `+` l'ajoute à la suite et le préfixe `-` le
supprime.

```caddyfile
example.com {
    header {
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        -X-Powered-By
    }
}
```

## log

```text
Syntax:   log [<name>] { <options> }
Default:  no access sink
Context:  site block, global options
```

Configure une destination de journal d'accès. Un `log` seul active la
destination par défaut du site ; `log <nom> { ... }` configure un journal
nommé, et `log <nom>` sans bloc renvoie à un canal déclaré dans les options
globales.

Les options de bloc couvrent la destination et le format (`output`, `format`),
le sélecteur `hostnames`, les filtres `include` et `exclude`, l'échantillonnage
(`sampling`) et les réglages de rotation des fichiers (`mode`, `dir_mode`,
`roll_*`).

```caddyfile
example.com {
    log {
        output file /var/log/pingclair/access.log
    }
}
```

Les enregistrements sont regroupés en lots avant d'être écrits, et une
destination qui ne suit pas le rythme perd des enregistrements et les compte
dans `pingclair_access_log_dropped_total`. Écrire chaque requête dans le journal
du système entraîne également le coût du récepteur de ce journal.

## reverse_proxy

```text
Syntax:   reverse_proxy [<matcher>] <upstream> [<upstream> ...]
          reverse_proxy [<matcher>] { ... }
Default:  none
Context:  site block
```

Transmet les requêtes à un ou plusieurs amonts. La politique de répartition de
charge par défaut est le tourniquet. Les amonts désignés par un nom d'hôte sont
résolus à nouveau à l'intervalle défini par `dns_refresh` : un backend qui
redémarre sur une nouvelle adresse est suivi sans intervention, et une
résolution en échec conserve l'adresse précédente dans la rotation.

```caddyfile
:80 :8080 {
    reverse_proxy {
        lb_policy least_conn
        to 10.0.0.1:8080 {
            weight 3
        }
        to 10.0.0.2:8080
        to 10.0.0.3:8080 {
            backup
        }
        health_check {
            path /health
            interval 5s
            timeout 2s
            status 200 204
            consecutive_failure 3
            consecutive_success 2
        }
    }
}
```

Les contrôles de santé actifs s'exécutent hors du chemin des requêtes : un
backend en échec quitte la rotation avant qu'une requête utilisateur ne
l'atteigne, et y revient après le nombre configuré de sondes réussies. Un amont
`backup` n'est utilisé que lorsque tous les amonts principaux sont
indisponibles.

## root

```text
Syntax:   root [<matcher>] <path>
Default:  none
Context:  site block
```

Définit la racine du site. `file_server` peut prendre sa propre racine, mais la
définir ici est ce qui permet au serveur de fichiers et aux autres directives
manipulant des fichiers de s'accorder sur un emplacement unique.

```caddyfile
example.com {
    root * /srv/public
    file_server
}
```

## tls

```text
Syntax:   tls <mode>
          tls { <options> }
Default:  automatic HTTPS for public names
Context:  site block
```

Contrôle la façon dont les certificats sont obtenus.

| Mode | Comportement |
| --- | --- |
| `tls auto` | Obtient des certificats publics via ACME et les renouvelle. |
| `tls internal` | Émet depuis une autorité de certification locale persistante. La racine est publiée dans `$PINGCLAIR_TLS_STORE/internal/root.crt` et doit être approuvée par les clients. |
| `tls { cert ...; key ... }` | Utilise les fichiers de certificat et de clé nommés dans le bloc. |

La forme en bloc active aussi HTTP/3 avec `http3`, et prend en charge l'émission
DNS-01 avec `dns cloudflare <token>`, seul fournisseur DNS implémenté. Nommer un
autre fournisseur est refusé au démarrage plutôt qu'accepté et ignoré, car
DNS-01 est ce qui rend possibles les certificats wildcard.

```caddyfile
example.com {
    tls {
        cert /etc/pingclair/certs/example.com.pem
        key /etc/pingclair/certs/example.com.key
        http3
    }
    reverse_proxy localhost:3000
}
```

## 🌍 Global options

Les options globales s'écrivent dans le bloc sans nom, en tête de fichier.

| Option | Syntax | Notes |
| --- | --- | --- |
| `admin` | `admin <address> [<token>]` | Écouteur de l'Admin API. Sans jeton, seules les connexions de boucle locale sont acceptées. |
| `auto_https` | `auto_https on \| off \| disable_redirects` | Contrôle HTTPS automatique et la redirection du port 80. |
| `dns_refresh` | `dns_refresh <duration>` | Intervalle de résolution des amonts désignés par un nom d'hôte. `off` fige les adresses résolues au démarrage. |
| `email` | `email <address>` | Adresse e-mail du compte ACME utilisée pour l'émission. |
| `trusted_proxies` | `trusted_proxies <cidr> [<cidr> ...]` | Pairs autorisés à affirmer des en-têtes d'identité client. Un changement exige un redémarrage. |

```caddyfile
{
    email admin@example.com
    admin 127.0.0.1:2019
    dns_refresh 30s
}
```
