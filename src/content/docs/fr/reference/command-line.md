---
title: Ligne de commande
h1_emoji: '⌨️'
description: Chaque sous-commande de pingclair avec ses options, ses valeurs par défaut et ses prérequis, vérifiés d'après la sortie --help du binaire.
---

Pingclair est un binaire unique. Chaque tâche, de l'exécution du serveur au
contrôle d'une configuration, en est une sous-commande :

```bash
pingclair <command> [<args…>]
```

Les chevrons marquent une valeur obligatoire, les crochets une valeur
facultative, et `…` une valeur répétable. Chaque commande répond à `--help`, et
`pingclair help <command>` affiche le même texte. Lancé sans commande, le binaire
affiche la liste des commandes.

📌 Cette page décrit **v0.2.0-rc.3**, la dernière version publiée. Les
changements qui n'existent que sur la branche `main` du serveur sont signalés
par **Prochaine version**.

L'installateur lie aussi le binaire sous le nom `pc` ; chaque commande
ci-dessous a donc une forme en deux lettres : `pc validate`,
`pc service reload`, etc. Les deux sont le même programme : `pc` est un lien
symbolique, pas un second binaire.

## 🚩 Options globales

| Option | Effet |
| --- | --- |
| `-v`, `--verbose` | Élève le niveau de journalisation à `debug` pour cette exécution. Acceptée avant ou après la commande. Contrairement à `caddy -v`, elle n'affiche pas la version. |
| `-h`, `--help` | Affiche l'aide de la commande à laquelle elle est attachée. |
| `-V`, `--version` | Affiche la version. Au niveau supérieur uniquement. |

## 🧭 Les commandes en un coup d'œil

| Commande | Effet |
| --- | --- |
| `run` | Exécute le serveur au premier plan. |
| `reload` | Applique une configuration modifiée par l'API d'administration, et rapporte l'avis du serveur. |
| `start` | Démarre une copie détachée du serveur. |
| `stop` | Arrête un serveur en cours d'exécution par l'API d'administration. |
| `completion` | Affiche un script de complétion pour un shell. |
| `environ` | Affiche l'environnement que verra le serveur. |
| `list-modules` | Liste les modules compilés dans ce binaire. |
| `build-info` | Affiche les métadonnées de build, dont la chaîne d'outils. |
| `manpage` | Écrit les pages de manuel dans un répertoire. |
| `storage-export` | Écrit le magasin de certificats dans une archive tar. |
| `storage-import` | Restaure un magasin de certificats depuis cette archive. |
| `trust` | Installe la racine de l'autorité interne dans le magasin de confiance du système. |
| `untrust` | La retire. |
| `respond` | Sert une réponse fixe, pour le développement. |
| `reverse-proxy` | Relaie vers un upstream sans fichier de configuration. |
| `file-server` | Sert un répertoire sans fichier de configuration. |
| `validate` | Compile une configuration et signale ce qui ne va pas. |
| `adapt` | Affiche la forme JSON compilée d'un Pingclairfile. |
| `fmt` | Met en forme un Pingclairfile, ou montre ce que la mise en forme changerait. |
| `hash-password` | Produit une empreinte de mot de passe pour `basic_auth`. |
| `version` | Affiche la version. |
| `service` | Pilote l'unité systemd installée. |

**Prochaine version :** `storage export` et `storage import` s'ajoutent, comme
écritures de Caddy pour `storage-export` et `storage-import`. Les noms à trait
d'union continuent de fonctionner.

## pingclair run

Exécute le serveur au premier plan avec un seul document de configuration. Les
journaux vont sur la sortie standard et la sortie d'erreur, et `Ctrl-C` arrête
le serveur.

```bash
pingclair run [OPTIONS] [CONFIG]
```

| Argument | Défaut | Effet |
| --- | --- | --- |
| `CONFIG` | `./Pingclairfile`, puis `./Caddyfile` | Fichier ou répertoire de configuration à charger. |

| Option | Effet |
| --- | --- |
| `-r`, `--resume` | Charge la dernière configuration enregistrée automatiquement par l'API d'administration au lieu du fichier, comme `caddy run --resume`. L'emporte sur `CONFIG` quand les deux sont présents. |
| `-w`, `--watch` | Vérifie chaque seconde la date de modification du fichier de configuration, et recharge après chaque modification. Destinée au développement local. |

```bash
pingclair run --watch
```

Sans `CONFIG` et sans aucun des deux fichiers par défaut, `run` sort avec le
code 1. Caddy démarre alors un serveur vide ; Pingclair refuse, si bien qu'un
`run` tapé dans le mauvais répertoire échoue de manière visible.

Pour un serveur qui survit au terminal, utilisez l'unité installée
([Exécution comme service](/fr/start/service/)).

## pingclair reload

Envoie un fichier de configuration à un serveur en cours d'exécution par l'API
d'administration (`POST /load`). Le serveur répond lui-même à la requête ; la
commande rapporte donc si le fichier a été appliqué. Un signal ne le permet pas :
systemd peut seulement confirmer qu'il a été remis.

```bash
pingclair reload [OPTIONS]
```

| Option | Défaut | Effet |
| --- | --- | --- |
| `-c`, `--config <CONFIG>` | `./Pingclairfile`, puis `./Caddyfile` | Fichier de configuration à appliquer. |
| `--address <ADDRESS>` | `127.0.0.1:2019` | Adresse de l'API d'administration. |

La configuration en service doit activer l'API d'administration avec l'option
globale `admin` ; sans elle, il n'y a rien à joindre. Quand le serveur ne peut
pas appliquer le nouveau fichier, le plus souvent parce qu'un écouteur a été
ajouté ou déplacé, la commande échoue et la configuration précédente reste en
service.

```bash
sudo pingclair reload -c /etc/Pingclair/Pingclairfile
```

## pingclair start

Démarre le serveur comme processus d'arrière-plan qui continue de tourner après
la fermeture du shell, sans gestionnaire de services.

```bash
pingclair start [OPTIONS]
```

| Option | Défaut | Effet |
| --- | --- | --- |
| `-c`, `--config <CONFIG>` | `./Pingclairfile`, puis `./Caddyfile` | Fichier de configuration à charger. |

Le processus est détaché du terminal et sa sortie est abandonnée : son journal
n'est conservé nulle part. Sur un hôte doté de systemd, l'unité installée est le
meilleur outil : elle capture le journal, redémarre en cas d'échec et sait quand
les écouteurs sont liés. Voir [Exécution comme service](/fr/start/service/).

## pingclair stop

Arrête un serveur en cours d'exécution par le `POST /stop` de l'API
d'administration. Comme `reload`, elle exige l'option `admin` dans la
configuration en service.

```bash
pingclair stop [OPTIONS]
```

| Option | Défaut | Effet |
| --- | --- | --- |
| `--address <ADDRESS>` | `127.0.0.1:2019` | Adresse de l'API d'administration. |

## pingclair completion

Affiche un script de complétion pour un shell. Les noms pris en charge sont
exactement ceux qu'accepte l'argument : `bash`, `zsh`, `fish`, `powershell`,
`elvish`.

```bash
pingclair completion <SHELL>
```

```bash
pingclair completion zsh > ~/.zfunc/_pingclair
```

## pingclair environ

Affiche l'environnement dont ce processus a hérité, une ligne `NAME=value` par
variable, pour vérifier une valeur comme `PINGCLAIR_TLS_STORE` avant un
démarrage. Contrairement à `caddy environ`, elle n'affiche pas les chemins
calculés par le serveur.

```bash
pingclair environ
```

## pingclair list-modules

Liste les modules compilés dans ce binaire. `--json` affiche la même liste en
JSON, pour les scripts.

**Prochaine version :** `--versions`, `--packages` et `-s`/`--skip-standard`
sont acceptées, si bien que les scripts écrits pour `caddy list-modules`
s'exécutent sans modification.

```bash
pingclair list-modules [--json]
```

## pingclair build-info

Affiche les métadonnées de build : version, cible et chaîne d'outils qui a
produit le binaire. Utile pour signaler un défaut, car elle nomme le build
exact.

```bash
pingclair build-info
```

## pingclair manpage

Écrit les pages de manuel dans un répertoire qui doit déjà exister. L'option est
obligatoire, pour que rien ne soit écrit par mégarde dans le répertoire courant.

```bash
pingclair manpage --directory /usr/local/share/man/man1
```

## pingclair storage-export

Écrit le magasin de certificats dans une archive tar. Le magasin est celui que
désigne `PINGCLAIR_TLS_STORE`, ou à défaut le répertoire de données de
l'utilisateur qui exécute la commande. Dans l'exemple, le préfixe oriente un
shell root vers le magasin du compte de service plutôt que vers celui de root.
`-o -` écrit l'archive sur la sortie standard.

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair \
  pingclair storage-export -o /tmp/store.tar
```

L'archive contient des clés privées : elle est écrite avec le mode `600` et sa
place est sur un support chiffré, pas dans une sauvegarde expédiée vers un
bucket. Le [guide TLS](/fr/guides/tls-tuning/) décrit ce qu'elle contient et
quand la déplacer.

## pingclair storage-import

Restaure un magasin depuis une archive écrite par `storage-export`. `-i -` lit
l'archive sur l'entrée standard.

**Prochaine version :** les deux commandes acceptent `-c`/`--config <file>`, et
une option globale `storage file_system <path>` dans ce fichier désigne le
magasin. Un import qui ne restaurerait rien est refusé.

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair \
  pingclair storage-import -i /tmp/store.tar
```

## pingclair trust

Installe le certificat racine de l'autorité interne (`tls internal`) dans le
magasin de confiance du système. Ensuite, les clients qui utilisent ce magasin
acceptent les certificats émis par l'autorité. La racine est lue dans le magasin
que désigne `PINGCLAIR_TLS_STORE`.

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair trust
```

La page [HTTPS](/fr/start/https/) explique quand c'est nécessaire et comment
vérifier que cela a fonctionné.

## pingclair untrust

Retire ce certificat racine du magasin de confiance du système. Les certificats
émis restent sur le disque, mais les clients cessent de leur faire confiance.

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair untrust
```

## pingclair respond

Sert une réponse fixe (code, en-têtes et corps) à chaque requête. Elle est
destinée au développement, et au test d'un client face à une origine qui répond
toujours de la même façon.

```bash
pingclair respond [OPTIONS]
```

| Option | Défaut | Effet |
| --- | --- | --- |
| `-s`, `--status <STATUS>` | `200` | Code de statut à renvoyer. |
| `-H`, `--header <HEADERS>` | aucun | En-tête de réponse, sous la forme `Field: value`. Répétable. |
| `-b`, `--body <BODY>` | vide | Corps de la réponse. |
| `-l`, `--listen <LISTEN>` | un port de boucle locale aléatoire | Adresse d'écoute. |

```bash
pingclair respond --status 503 --header 'Retry-After: 30' --body 'down for maintenance'
```

Sans `--listen`, un port libre de la boucle locale est choisi et affiché ; deux
serveurs de développement ne se disputent donc jamais le même port.

## pingclair reverse-proxy

Relaie un écouteur vers un ou plusieurs upstreams sans fichier de
configuration. `--to` est obligatoire ; le répéter répartit les requêtes sur
plusieurs upstreams. Le [guide du reverse proxy](/fr/guides/reverse-proxy/)
couvre le même terrain avec un fichier de configuration.

```bash
pingclair reverse-proxy [OPTIONS] --to <TO>
```

| Option | Défaut | Effet |
| --- | --- | --- |
| `--from <FROM>` | `localhost` | Adresse d'écoute. |
| `--to <TO>` | obligatoire | Adresse de l'upstream. À répéter pour plusieurs. |
| `--header-up <HEADERS_UP>` | aucun | En-tête de requête à envoyer à l'upstream, sous la forme `Field: value`. Répétable. |
| `--header-down <HEADERS_DOWN>` | aucun | En-tête de réponse à renvoyer au client, sous la forme `Field: value`. Répétable. |
| `--insecure` | désactivé | Ne vérifie pas le certificat TLS de l'upstream. |
| `--internal-certs` | désactivé | Émet les certificats de cet écouteur depuis l'autorité interne au lieu d'essayer d'en obtenir un public. |
| `--disable-redirects` | désactivé | Ne crée pas l'écouteur de redirection HTTP vers HTTPS. |
| `-c`, `--change-host-header` | désactivé | Réécrit l'en-tête `Host` envoyé à l'upstream avec l'adresse de l'upstream, comme le fait Caddy. |

```bash
pingclair reverse-proxy --from :8080 --to 127.0.0.1:3000
```

## pingclair file-server

Sert un répertoire en HTTP sans fichier de configuration.

```bash
pingclair file-server [OPTIONS]
```

| Option | Défaut | Effet |
| --- | --- | --- |
| `--listen <LISTEN>` | `:80` | Adresse d'écoute. |
| `--root <ROOT>` | `.` | Répertoire à servir. |
| `-b`, `--browse` | désactivé | Affiche les listes de répertoire. |
| `-d`, `--domain <DOMAIN>` | aucun | Sert ce domaine en HTTPS ; exige que `--listen` soit un port. |
| `--access-log` | désactivé | Écrit une ligne d'accès par requête. |
| `--no-compress` | désactivé | Désactive la compression des réponses. |
| `--file-limit <FILE_LIMIT>` | aucun | Nombre maximal de fichiers affichés dans une liste de répertoire. |
| `--templates` | désactivé | Rend les fichiers `.html` comme des modèles, comme le fait Caddy. |

```bash
pingclair file-server --root ./public --browse --listen :8080
```

La compression, les en-têtes de cache et les replis pour application d'une seule
page relèvent d'un fichier de configuration ; le
[guide du site statique](/fr/guides/static-site/) les traite.

## pingclair validate

Compile une configuration et signale le premier problème trouvé, sans rien
démarrer. Le code de sortie est non nul quand la configuration est refusée ; la
commande sert donc de garde-fou dans un script de déploiement.

```bash
pingclair validate [/etc/Pingclair/Pingclairfile]
```

| Argument | Défaut | Effet |
| --- | --- | --- |
| `CONFIG` | `./Pingclairfile`, puis `./Caddyfile` | Fichier ou répertoire de configuration à contrôler. |

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

## pingclair adapt

Affiche le document JSON issu de la compilation d'un Pingclairfile. C'est le
schéma propre à Pingclair, celui qu'acceptent `validate`, `run` et le `/load` de
l'API d'administration. Contrairement à `caddy adapt`, la sortie n'a pas la
forme `{"apps": …}` de Caddy, et Caddy ne peut pas la charger.

`--pretty` indente le JSON. `--validate` exécute en plus les contrôles de
`validate`, comme l'existence des fichiers de certificat.

**Prochaine version :** `adapt` valide toujours avant d'afficher ; un code de
sortie 0 signifie donc que ce build peut charger le résultat. `--validate` reste
accepté et ne change rien.

```bash
pingclair adapt [OPTIONS]
```

| Option | Défaut | Effet |
| --- | --- | --- |
| `-c`, `--config <CONFIG>` | `./Pingclairfile`, puis `./Caddyfile` | Fichier de configuration à lire. |
| `-p`, `--pretty` | désactivé | Indente le JSON. |
| `--validate` | désactivé | Exécute aussi les contrôles de `validate`. |

```bash
pingclair adapt --pretty --validate
```

## pingclair fmt

Met en forme un Pingclairfile et affiche le résultat. Sans chemin, elle lit
`./Pingclairfile` ; `-` lit l'entrée standard.

**Prochaine version :** `fmt` sort avec le code 1 quand l'entrée n'était pas
déjà mise en forme, pour pouvoir bloquer un commit comme le fait `caddy fmt` ;
`--overwrite` sort toujours avec 0. `--config <path>` et `-w` sont acceptés
comme écritures de Caddy, et l'indentation devient une tabulation par niveau au
lieu de deux espaces.

```bash
pingclair fmt [OPTIONS] [PATH]
```

| Option | Effet |
| --- | --- |
| `-o`, `--overwrite` | Réécrit le texte mis en forme dans le fichier au lieu de l'afficher. |
| `-d`, `--diff` | Affiche un diff visuel plutôt que le fichier mis en forme. |

```bash
pingclair fmt --diff              # what would change
pingclair fmt --overwrite         # apply it
```

## pingclair hash-password

Produit une empreinte de mot de passe pour la directive `basic_auth`. Le mot de
passe est lu sur l'entrée standard quand `--plaintext` est omis, ce qui le tient
à l'écart de l'historique du shell.

```bash
pingclair hash-password [OPTIONS]
```

| Option | Défaut | Effet |
| --- | --- | --- |
| `-p`, `--plaintext <PLAINTEXT>` | lu sur l'entrée standard | Mot de passe à hacher. |
| `--algorithm <ALGORITHM>` | `bcrypt` | `bcrypt` ou `argon2id`. |
| `--bcrypt-cost <COST>` | `14` | Coût bcrypt, de 4 à 31. Plus il est élevé, plus le calcul est lent et robuste. |
| `--argon2id-time <TIME>` | `1` | Nombre d'itérations argon2id. |
| `--argon2id-memory <MEMORY>` | `65536` | Coût mémoire argon2id, en Kio. |
| `--argon2id-threads <THREADS>` | `4` | Parallélisme argon2id. |
| `--argon2id-keylen <KEYLEN>` | `32` | Longueur de la sortie argon2id, en octets. |

```bash
pingclair hash-password --algorithm argon2id
```

Collez la sortie dans la directive ; l'[entrée `basic_auth`](/fr/reference/directives/#basic_auth)
montre la syntaxe qui l'entoure.

## pingclair version

Affiche la version, par exemple `v0.2.0-rc.3` pour une release candidate.

```bash
pingclair version
```

## pingclair service

Pilote l'unité systemd écrite par l'installateur. Elle enveloppe `systemctl` ;
l'une ou l'autre peut donc servir, et cette sous-commande garde les commandes de
l'unité à côté des autres.

```bash
pingclair service <start|stop|restart|reload|status>
```

| Sous-commande | Effet |
| --- | --- |
| `start` | Démarre l'unité. |
| `stop` | Arrête l'unité. |
| `restart` | Redémarre l'unité, ce qu'exige un écouteur modifié ou une option de portée globale. |
| `reload` | Demande au serveur en cours d'exécution de relire son fichier de configuration, par signal. Le résultat figure sur la ligne d'état de l'unité et dans le journal, pas dans le code de sortie de cette commande. |
| `status` | Affiche l'état de l'unité. |

Elle ne fonctionne que sous Linux avec systemd ; sur toute autre plateforme,
elle refuse de s'exécuter. [Exécution comme service](/fr/start/service/)
documente l'unité elle-même.

## 🧾 D'où viennent ces options

La ligne de commande est définie dans un seul fichier des sources du serveur,
`pingclair/src/cli/mod.rs`, et cette page en suit l'ordre. Quand les options
d'une commande y changent, cette page change avec elles.
