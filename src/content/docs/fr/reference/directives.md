---
title: Directives
h1_emoji: '🧾'
description: Syntaxe, valeurs par défaut, contexte, refus et différences avec Caddy pour les directives et options globales du Pingclairfile couvertes par cette référence.
---

Chaque entrée s'ouvre sur un en-tête fixe : la syntaxe, le comportement par
défaut quand la directive est absente, et l'endroit où elle peut apparaître.
Viennent ensuite ce que fait la directive, ce qu'elle refuse et ce qui la
distingue de Caddy.

📌 Cette page décrit **v0.2.0-rc.3**, la dernière version publiée. Quand la
prochaine version change un comportement, l'entrée le signale sous
**Prochaine version** ; ce comportement se trouve sur la branche `main` du
serveur et ne figure encore dans aucun build publié.

📖 La page couvre une partie du langage. Une directive absente de cette page
est tout de même contrôlée par `pingclair validate`, et une directive que le
serveur n'implémente pas est refusée par son nom au lieu d'être acceptée puis
ignorée.

## basic_auth

```text
Syntax:   basic_auth [<matcher>] [bcrypt|argon2id [<realm>]] {
              <username> <hashed_password>
              ...
          }
Default:  no authentication
Context:  site block, handle, route
```

Exige des identifiants HTTP Basic avant que la requête n'aille plus loin.
Chaque ligne du bloc est un compte : un nom d'utilisateur et une empreinte de
mot de passe, jamais le mot de passe lui-même. `pingclair hash-password` produit
l'empreinte
([Ligne de commande](/fr/reference/command-line/#pingclair-hash-password)).

L'algorithme indiqué sur la ligne de la directive est celui avec lequel toutes
les empreintes du bloc sont vérifiées ; il vaut `bcrypt` par défaut. Tout autre
nom d'algorithme est refusé, de même qu'un `basic_auth` sans bloc.

```caddyfile
http://:8080 {
    basic_auth /admin/* {
        alice $2b$04$aKz8E/FgvYZuyOZpoHXKJuenUlormXHm8m7WJff0S8hMu7ehuMY7i
    }
    respond "ok"
}
```

## encode

```text
Syntax:   encode [*] [<format> ...]
          encode off
Default:  gzip in v0.2.0-rc.3; no compression in the next release
Context:  site block
```

Compresse les réponses. Les formats sont listés par ordre de préférence : quand
un client en accepte plusieurs, le premier listé l'emporte. Les formats pris en
charge sont `zstd` et `gzip`, et un `encode` seul signifie `gzip`. `encode off`
désactive la compression pour le site.

Refus :

- `encode br` est refusé au chargement. Le proxy n'a pas d'encodeur Brotli en
  flux, et le serveur ne se replie pas en silence sur gzip :
  `` `encode br`: Brotli is not implemented for proxied responses; use `encode zstd gzip` ``.
- Un format inconnu est refusé, avec la liste des formats valides.
- Un matcher de chemin ou un matcher nommé est refusé, car la compression se
  règle par site et non par route. Le matcher `*`, qui correspond à tout, est
  accepté.

Différences avec Caddy : dans v0.2.0-rc.3, un site de Pingclairfile sans ligne
`encode` compresse tout de même en gzip. Caddy ne compresse que là où `encode`
le demande.

**Prochaine version :** un site ne compresse que là où `encode` le demande,
comme dans Caddy. Un site qui comptait sur l'ancien comportement par défaut doit
ajouter `encode gzip` ou `encode zstd gzip`.

```caddyfile
example.com {
    encode zstd gzip
    file_server ./public
}
```

## file_server

```text
Syntax:   file_server [<matcher>] [<root>] [browse]
          file_server [<matcher>] [<root>] {
              root                  <path>
              index                 <filenames...>
              browse
              compress              [off|false]
              precompressed         [br|zstd|gzip ...]
              hide                  <paths...>
              status                <code>
              pass_thru
              disable_canonical_uris
              etag_file_extensions  <extensions...>
          }
Default:  disabled
Context:  site block, handle, route
```

Sert des fichiers depuis le disque. Il détecte le type MIME, répond aux requêtes
partielles et envoie `ETag` et `Last-Modified`. Les fichiers proviennent de la
racine du site fixée par `root`, ou d'une racine propre à cette directive.

- `index` nomme les fichiers essayés pour un répertoire ; la valeur par défaut
  est `index.html`.
- `browse` affiche une liste pour un répertoire dépourvu de fichier d'index.
- `compress off` exempte ce serveur de fichiers sur un site qui compresse par
  ailleurs.
- `precompressed` sert un fichier compagnon comme `app.js.gz` quand le client
  accepte ce codage. Sans argument, l'ordre est `br zstd gzip`.
- `hide` empêche de servir les chemins nommés. Les lignes répétées
  s'additionnent.
- `status` répond à chaque fichier avec ce code, pour une page de maintenance.
- `pass_thru` confie un fichier manquant au gestionnaire suivant au lieu de
  répondre `404`.
- `disable_canonical_uris` supprime la redirection qui ajoute une barre oblique
  finale à un répertoire.

Refus : `fs` est refusé, car seul le système de fichiers local est pris en
charge. Un `status` hors de l'intervalle 100–599 et une sous-directive inconnue
sont refusés.

Différences avec Caddy : l'argument positionnel `<root>` est un ajout de
Pingclair. Dans Caddy, un chemin nu après `file_server` est un matcher de
chemin. Préférez `root` quand la configuration doit aussi se charger dans Caddy.

**Prochaine version :**

- `browse` accepte un bloc d'options, et `file_limit <n>` plafonne le nombre
  d'entrées affichées dans une liste. Un modèle de liste, `reveal_symlinks` et
  `sort` sont refusés par leur nom.
- Les méthodes autres que `GET` et `HEAD` reçoivent `405` avec
  `Allow: GET, HEAD`.
- Les requêtes conditionnelles reçoivent une réponse : un `If-None-Match` qui
  correspond ou un `If-Modified-Since` à jour obtient `304`, et un `If-Match` ou
  un `If-Unmodified-Since` en échec obtient `412`.

```caddyfile
localhost:8080 {
    file_server ./public
}
```

## header

```text
Syntax:   header [<matcher>] <field> [<value> [<replacement>]]
          header [<matcher>] {
              <field> <value>                  # set
              +<field> <value>                 # append
              -<field>                         # remove
              ?<field> <value>                 # set only if absent
              <field> <search> <replacement>   # regular-expression replace
              defer
          }
Default:  none
Context:  site block, handle, route
```

Modifie les en-têtes de réponse. Un nom de champ seul définit l'en-tête, un
préfixe `+` ajoute une valeur, et un préfixe `-` retire le champ. Un préfixe `?`
ne définit la valeur que si la réponse ne porte pas déjà ce champ. Avec trois
arguments, le deuxième est une expression régulière et le troisième remplace ce
qu'elle trouve.

Les en-têtes sont toujours appliqués à la réponse terminée ; `defer` et le
préfixe `>` sont donc acceptés et ne changent rien.

Refus :

- Une directive qui a à la fois des arguments et un bloc est refusée.
- `header X-Name` sans valeur est refusé. Caddy définirait une valeur vide, mais
  un en-tête de réponse vide est presque toujours une suppression mal écrite.
- Un matcher de réponse `match` dans le bloc est refusé comme non implémenté.

⚠️ Il n'existe pas de mot-clé `set`. Une ligne de bloc `set X-Name value` est
lue comme un remplacement par expression régulière sur un en-tête nommé `set`.

**Prochaine version :** `Strict-Transport-Security` n'est envoyé que sur les
réponses chiffrées, et il est retiré de toute réponse en clair, comme l'exige la
RFC 6797. Écrire `header Strict-Transport-Security "max-age=…"` est la façon
d'activer HSTS.

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
Syntax:   log [<name>] [{ <options> }]
Default:  no access log
Context:  site block; named channels in global options
```

Écrit un journal d'accès. Les quatre formes n'ont pas le même sens :

- `log` active le journal d'accès par défaut du site, sur la sortie standard.
- `log { … }` configure le journal d'accès du site.
- `log <name> { … }` ajoute au site un logger nommé, avec sa propre sortie.
- `log <name>` envoie les enregistrements du site vers un canal de ce nom,
  déclaré dans les options globales avec `log <name> { … }`.

Les options du bloc comprennent `output` (`stdout`, `stderr` ou `file <path>`),
`format` (`json` ou `console`), `level`, le sélecteur `hostnames`, les filtres
`include` et `exclude`, `sampling`, et la rotation des fichiers (`roll_size`,
`roll_keep`, `roll_keep_for`, `mode`, `dir_mode` et les autres options
`roll_*`).

Refus : un canal global ne peut pas utiliser `hostnames`, puisqu'il n'est
rattaché à aucun site. Un canal déclaré deux fois est refusé.

Les enregistrements sont regroupés par lots avant d'être écrits. Une sortie qui
ne suit pas le rythme perd des enregistrements et les compte dans
`pingclair_access_log_dropped_total`.

**Prochaine version :** un bloc global `log { … }` sans nom est refusé. Dans
v0.2.0-rc.3, il est accepté et ne fait rien.

```caddyfile
example.com {
    log {
        output file /var/log/pingclair/access.log
    }
}
```

## reverse_proxy

```text
Syntax:   reverse_proxy [<matcher>] <upstream> [<upstream> ...]
          reverse_proxy [<matcher>] [<upstream> ...] { ... }
Default:  none
Context:  site block, handle, route
```

Transmet les requêtes à un ou plusieurs upstreams. `lb_policy` choisit comment
les requêtes sont réparties entre eux ; dans v0.2.0-rc.3, la valeur par défaut
est `round_robin`.

Un upstream désigné par nom d'hôte est résolu de nouveau à l'intervalle fixé
par l'option globale `dns_refresh` ; un backend qui redémarre sur une nouvelle
adresse est donc suivi sans rechargement. Une résolution en échec garde
l'adresse précédente en rotation.

Les contrôles de santé actifs sondent chaque upstream en dehors du trafic. Un
upstream défaillant quitte la rotation avant qu'une requête d'utilisateur ne
l'atteigne, et la rejoint après le nombre configuré de sondes réussies. Un
upstream `backup` n'est utilisé que lorsque tous les upstreams principaux sont
indisponibles.

Refus : une option inconnue est refusée avec son nom complet, comme
`Unknown directive 'reverse_proxy: dial_timeout'`. Les délais se placent dans
un bloc `transport http`.

**Prochaine version :**

- La valeur par défaut de `lb_policy` devient `random`, celle de Caddy. Écrivez
  `lb_policy round_robin` pour conserver le comportement actuel.
- `lb_policy first` choisit toujours le premier upstream disponible. Dans
  v0.2.0-rc.3, il se comporte comme `round_robin`.
- Un `502` ou un `504` que Pingclair génère lui-même porte
  `Proxy-Status: pingclair; error=…`, ce qui permet de le distinguer d'un code
  envoyé par le backend.

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

Le [guide du reverse proxy](/fr/guides/reverse-proxy/) passe en revue chaque
option.

## root

```text
Syntax:   root [<matcher>] <path>
Default:  none
Context:  site block, handle, route
```

Fixe la racine du site : le répertoire par rapport auquel `file_server`,
`try_files` et les autres directives de fichiers résolvent les chemins.
`file_server` peut recevoir sa propre racine, mais la fixer ici garde toutes les
directives pointées vers un seul emplacement.

```caddyfile
example.com {
    root * /srv/public
    file_server
}
```

## tls

```text
Syntax:   tls internal
          tls <cert_file> <key_file>
          tls { <options> }
Default:  automatic HTTPS for public names
Context:  site block
```

Détermine d'où vient le certificat du site. Sans ligne `tls`, un nom public
obtient automatiquement un certificat de Let's Encrypt.

| Forme | Comportement |
| --- | --- |
| `tls internal` | Émet depuis une autorité de certification locale persistante. Les clients doivent faire confiance à sa racine ; `pingclair trust` l'installe. |
| `tls <cert> <key>`, ou `cert` et `key` dans le bloc | Utilise des fichiers de certificat et de clé émis ailleurs. |
| `tls { auto }` | Obtient un certificat public via ACME et le renouvelle ; c'est aussi le comportement par défaut pour un nom public. |

Le bloc accepte aussi `acme_email` (ou `email`), `http3`, `default_sni`,
`client_auth` et les options DNS-01 (`dns`, `resolvers`, `dns_ttl`,
`propagation_delay`, `propagation_timeout`, `dns_challenge_override_domain`).

`http3 off` retire ce site de HTTP/3. Il ne crée ni ne supprime l'écouteur
QUIC ; c'est la liste globale `servers { protocols … }` qui en décide
([TLS : ce qui se règle](/fr/guides/tls-tuning/#-quels-protocoles-sont-servis)).

Refus :

- `dns` n'accepte que `cloudflare`. Tout autre fournisseur est refusé :
  ``DNS provider `route53` is not implemented; this build ships `cloudflare` only``.
- `protocols`, `ciphers`, `curves`, `alpn`, `on_demand`, `key_type`, `issuer` et
  les autres options de Caddy non listées ci-dessus sont refusés par leur nom.
- `tls internal` ne peut pas se combiner avec `auto`, un e-mail ACME ou des
  fichiers de certificat.

**Prochaine version :**

- `http3 off` prend effet. Dans v0.2.0-rc.3, l'option est acceptée et reste
  sans effet. Les réponses du site cessent aussi d'annoncer HTTP/3 dans
  `Alt-Svc`.
- La racine de l'autorité interne passe dans
  `<store>/pki/authorities/local/root.crt`, l'organisation qu'utilise Caddy.
  L'ancienne arborescence `<store>/internal/` n'est pas migrée : une nouvelle
  autorité est créée, et les clients doivent de nouveau faire confiance à sa
  racine.

```caddyfile
example.com {
    tls {
        cert /etc/pingclair/certs/example.com.pem
        key /etc/pingclair/certs/example.com.key
    }
    reverse_proxy localhost:3000
}
```

## Global options

Les options globales se placent dans le bloc sans nom en tête du fichier. Les
options que Caddy imbrique sous `servers { … }`, comme `protocols` et
`trusted_proxies`, y sont aussi acceptées.

| Option | Syntaxe | Remarques |
| --- | --- | --- |
| `admin` | `admin [<address> [<token>]] \| off` | Active l'API d'administration ; l'adresse par défaut est `127.0.0.1:2019`. Sans jeton, seuls les clients de la boucle locale sont admis. Sans cette option, il n'y a pas d'API d'administration. |
| `auto_https` | `auto_https on \| off \| disable_redirects` | Commande le HTTPS automatique et la redirection du port 80. `disable_certs` et `ignore_loaded_certs` sont refusés par leur nom. |
| `dns_refresh` | `dns_refresh <duration> \| off` | Intervalle de nouvelle résolution des upstreams désignés par nom d'hôte. La valeur par défaut est `30s`. `off` conserve les adresses résolues au démarrage. Un nombre nu est refusé. |
| `email` | `email <address>` | E-mail du compte ACME. |
| `grace_period` | `grace_period <duration>` | Durée pendant laquelle un arrêt en douceur attend les requêtes en cours. |
| `protocols` | `protocols h1 h2 h3` | Détermine si l'écouteur HTTP/3 existe. Voir [TLS : ce qui se règle](/fr/guides/tls-tuning/#-quels-protocoles-sont-servis). |
| `trusted_proxies` | `trusted_proxies <cidr> ...` | Pairs autorisés à indiquer l'adresse du client dans les en-têtes de transfert. Une modification exige un redémarrage. **Prochaine version :** accepte aussi l'écriture de Caddy, `trusted_proxies static <cidr \| private_ranges> ...`. |

```caddyfile
{
    email admin@example.com
    admin 127.0.0.1:2019
    dns_refresh 30s
}
```
