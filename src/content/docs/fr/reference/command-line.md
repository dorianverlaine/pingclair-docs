---
title: Ligne de commande
h1_emoji: '⌨️'
description: Chaque sous-commande du binaire, avec ses options, ses valeurs par défaut et ses prérequis, vérifiée contre `pingclair --help`.
---

Pingclair se présente comme un seul binaire, dont la ligne de commande suit la
forme Unix habituelle :

```bash
pingclair <command> [<args…>]
```

Les chevrons marquent ce qui est obligatoire, les crochets ce qui est facultatif,
et `…` une valeur répétable. Chaque commande répond à `--help` avec le texte même
qui a servi à écrire cette page, et `pingclair help <command>` l'affiche aussi.
Lancer le binaire sans commande affiche la liste.

L'installateur crée aussi un lien `pc`, donc chaque commande ci-dessous a une
orthographe de deux lettres : `pc validate`, `pc service reload`, etc. Les deux
sont le même programme ; `pc` est un lien symbolique, pas un second binaire.

## 🚩 Options globales

| Option | Effet |
| --- | --- |
| `-v`, `--verbose` | Passe le niveau de journal à `debug` pour cette exécution. Acceptée avant ou après la commande. |
| `-h`, `--help` | Affiche l'aide de la commande à laquelle elle est attachée. |
| `-V`, `--version` | Affiche la version. Au niveau supérieur uniquement. |

## 🧭 Les commandes en un coup d'œil

| Commande | Effet |
| --- | --- |
| `run` | Exécute le serveur au premier plan. |
| `reload` | Applique une configuration modifiée par l'Admin API, et rapporte ce que le serveur en a pensé. |
| `start` | Démarre une copie détachée du serveur. |
| `stop` | Arrête un serveur en cours par l'Admin API. |
| `completion` | Affiche un script de complétion pour un shell. |
| `environ` | Affiche l'environnement que verra le serveur. |
| `list-modules` | Liste les modules compilés dans ce binaire. |
| `build-info` | Affiche les métadonnées de compilation, chaîne d'outils comprise. |
| `manpage` | Écrit les pages de manuel dans un répertoire. |
| `storage-export` | Déplace le magasin de certificats dans une archive tar. |
| `storage-import` | Restaure ce magasin depuis cette archive. |
| `trust` | Installe la racine de l'autorité interne dans le magasin de confiance du système. |
| `untrust` | La retire. |
| `respond` | Sert une réponse fixe, pour le développement. |
| `reverse-proxy` | Proxy vers un amont sans fichier de configuration. |
| `file-server` | Sert un répertoire sans fichier de configuration. |
| `validate` | Compile une configuration et dit ce qui ne va pas. |
| `adapt` | Affiche la forme JSON compilée d'un Pingclairfile. |
| `fmt` | Formate un Pingclairfile, ou montre ce que le formatage changerait. |
| `hash-password` | Produit un hachage de mot de passe pour `basic_auth`. |
| `version` | Affiche la version. |
| `service` | Pilote l'unité systemd installée. |

## pingclair run

Exécute le serveur au premier plan avec un document de configuration. Les
journaux vont sur la sortie standard et l'erreur standard, et `Ctrl-C` arrête le
serveur.

```bash
pingclair run [OPTIONS] [CONFIG]
```

| Argument | Défaut | Effet |
| --- | --- | --- |
| `CONFIG` | `./Pingclairfile`, puis `./Caddyfile` | Fichier ou répertoire de configuration à charger. |

| Option | Effet |
| --- | --- |
| `-r`, `--resume` | Charge la configuration que l'Admin API a sauvegardée en dernier, comme `caddy run --resume`. Remplace `CONFIG` quand les deux sont présents. |
| `-w`, `--watch` | Surveille le fichier de configuration — mtime, interrogé une fois par seconde — et envoie le signal de rechargement au processus après chaque changement. Prévu pour le développement local, où une modification refusée se voit vite. |

```bash
pingclair run --watch
```

Pour un serveur qui survit au terminal, utilisez l'unité installée
([Exécution comme service](/fr/start/service/)) ou
[Démarrage rapide](/fr/start/quickstart/), qui déroule la même commande en
service.

## pingclair reload

Applique une configuration modifiée à un serveur en cours par l'Admin API. Comme
c'est le serveur qui répond à la requête, cette commande rapporte ce qu'il a
pensé du fichier — contrairement à un signal, dont systemd peut seulement
confirmer qu'il a été délivré.

```bash
pingclair reload [OPTIONS]
```

| Option | Défaut | Effet |
| --- | --- | --- |
| `-c`, `--config <CONFIG>` | `./Pingclairfile`, puis `./Caddyfile` | Fichier de configuration à appliquer. |
| `--address <ADDRESS>` | `127.0.0.1:2019` | Adresse de l'Admin API. |

L'Admin API doit tourner : l'option globale `admin` l'active, et une configuration
sans cette option n'a aucun point de terminaison à joindre. Un rechargement que le
serveur en cours ne peut pas appliquer — un changement de topologie d'écouteurs
est le cas courant — laisse la configuration précédente en service.

```bash
sudo pingclair reload -c /etc/Pingclair/Pingclairfile
```

## pingclair start

Démarre une copie du serveur qui continue après la fermeture du shell, sans
gestionnaire de services.

```bash
pingclair start [OPTIONS]
```

| Option | Défaut | Effet |
| --- | --- | --- |
| `-c`, `--config <CONFIG>` | `./Pingclairfile`, puis `./Caddyfile` | Fichier de configuration à charger. |

Le processus est détaché du terminal et sa sortie est jetée, donc rien n'est
journalisé nulle part. Sur un hôte avec systemd, l'unité installée est le meilleur
outil : elle capture le journal, redémarre en cas d'échec et sait quand les
écouteurs sont liés. Voir [Exécution comme service](/fr/start/service/).

## pingclair stop

Arrête un serveur en cours par l'Admin API — le même `POST /stop` que l'Admin API
expose. Exige l'option `admin`, comme `reload`.

```bash
pingclair stop [OPTIONS]
```

| Option | Défaut | Effet |
| --- | --- | --- |
| `--address <ADDRESS>` | `127.0.0.1:2019` | Adresse de l'Admin API. |

## pingclair completion

Affiche un script de complétion pour un shell. Les noms acceptés sont exactement
ceux que prend l'argument : `bash`, `zsh`, `fish`, `powershell`, `elvish`.

```bash
pingclair completion <SHELL>
```

```bash
pingclair completion zsh > ~/.zfunc/_pingclair
```

## pingclair environ

Affiche l'environnement avec lequel le serveur s'exécutera, pour vérifier une
valeur telle que `PINGCLAIR_TLS_STORE` avant un démarrage plutôt que de la déduire
d'un échec après coup.

```bash
pingclair environ
```

## pingclair list-modules

Liste les modules et fonctions compilés dans ce binaire. `--json` affiche la même
liste en sortie structurée, pour les scripts.

```bash
pingclair list-modules [--json]
```

## pingclair build-info

Affiche les métadonnées de compilation : version, cible et chaîne d'outils qui a
produit le binaire. Utile pour rapporter un défaut, car cela nomme la compilation
exacte.

```bash
pingclair build-info
```

## pingclair manpage

Écrit les pages de manuel dans un répertoire qui doit déjà exister. L'option est
obligatoire, donc rien ne s'écrit dans le répertoire courant par accident.

```bash
pingclair manpage --directory /usr/local/share/man/man1
```

## pingclair storage-export

Écrit le magasin de certificats nommé par `PINGCLAIR_TLS_STORE` dans une archive
tar. `-` comme chemin de sortie écrit l'archive sur la sortie standard.

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/certs \
  pingclair storage-export -o /tmp/store.tar
```

L'archive contient des clés privées : elle est écrite en mode `600` et appartient à
un support chiffré, pas à une sauvegarde qui part dans un bucket. Le
[guide TLS](/fr/guides/tls-tuning/) décrit ce qu'elle transporte et quand la
déplacer.

## pingclair storage-import

Restaure un magasin depuis une archive écrite par `storage-export`. `-` lit
l'archive sur l'entrée standard.

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/certs \
  pingclair storage-import -i /tmp/store.tar
```

## pingclair trust

Installe la racine de l'autorité interne dans le magasin de confiance du système,
après quoi les navigateurs et les clients en ligne de commande acceptent les
certificats que cette autorité émet. La racine est lue depuis le magasin nommé par
`PINGCLAIR_TLS_STORE`.

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/certs pingclair trust
```

La page [HTTPS](/fr/start/https/) décrit quand c'est nécessaire et comment
vérifier que cela a fonctionné.

## pingclair untrust

Retire cette racine du magasin de confiance du système. Les certificats déjà émis
gardent leurs fichiers ; les clients cessent de leur faire confiance.

```bash
sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/certs pingclair untrust
```

## pingclair respond

Sert une réponse fixe — statut, en-têtes, corps — pour le développement et pour
tester des clients contre une origine qui répond toujours de la même façon.

```bash
pingclair respond [OPTIONS]
```

| Option | Défaut | Effet |
| --- | --- | --- |
| `-s`, `--status <STATUS>` | `200` | Code de statut à renvoyer. |
| `-H`, `--header <HEADERS>` | aucun | En-tête de réponse au format `Field: value`. Répétable. |
| `-b`, `--body <BODY>` | vide | Corps de la réponse. |
| `-l`, `--listen <LISTEN>` | un port de boucle locale aléatoire | Adresse d'écoute. |

```bash
pingclair respond --status 503 --header 'Retry-After: 30' --body 'down for maintenance'
```

Sans `--listen`, le port est choisi pour vous et affiché, ce qui évite que deux
serveurs de développement se disputent un port fixe.

## pingclair reverse-proxy

Démarre un proxy d'un écouteur vers un ou plusieurs amonts sans écrire de fichier
de configuration. C'est la version en une ligne du
[guide du reverse proxy](/fr/guides/reverse-proxy/), et elle sert une
configuration de forme production plutôt qu'un jouet : l'amont est obligatoire, et
plusieurs valeurs `--to` répartissent la charge.

```bash
pingclair reverse-proxy [OPTIONS] --to <TO>
```

| Option | Défaut | Effet |
| --- | --- | --- |
| `--from <FROM>` | `localhost` | Adresse d'écoute. |
| `--to <TO>` | obligatoire | Adresse amont. Répétable pour en avoir plusieurs. |
| `--header-up <HEADERS_UP>` | aucun | En-tête de requête à envoyer en amont, au format `Field: value`. Répétable. |
| `--header-down <HEADERS_DOWN>` | aucun | En-tête de réponse à envoyer en aval, au format `Field: value`. Répétable. |
| `--insecure` | désactivé | Ignore la vérification TLS quand le certificat de l'amont ne correspond pas. |
| `--internal-certs` | désactivé | Émet les certificats de cet écouteur depuis l'autorité interne au lieu d'en demander un public. |
| `--disable-redirects` | désactivé | Ne provisionne pas l'écouteur de redirection HTTP vers HTTPS. |
| `-c`, `--change-host-header` | désactivé | Réécrit l'en-tête `Host` de l'amont avec l'adresse de l'amont, comme Caddy. |

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
| `-d`, `--domain <DOMAIN>` | aucun | Sert ce domaine en HTTPS ; exige que `--listen` soit un port. |
| `--access-log` | désactivé | Écrit une ligne d'accès par requête. |
| `--no-compress` | désactivé | Désactive la compression des réponses. |
| `--file-limit <FILE_LIMIT>` | aucun | Nombre maximal de fichiers affichés dans une liste de répertoire. |
| `--templates` | désactivé | Traite les fichiers `.html` comme des gabarits, comme Caddy. |

```bash
pingclair file-server --root ./public --browse --listen :8080
```

La compression, les en-têtes de cache et les replis d'application monopage
relèvent d'un fichier de configuration : le
[guide du site statique](/fr/guides/static-site/) les couvre.

## pingclair validate

Compile une configuration et rapporte le premier problème trouvé, sans rien
démarrer. Le code de sortie est non nul quand la configuration est refusée, ce qui
la rend utilisable dans un pipeline ou un script de déploiement.

```bash
pingclair validate [/etc/Pingclair/Pingclairfile]
```

| Argument | Défaut | Effet |
| --- | --- | --- |
| `CONFIG` | `./Pingclairfile`, puis `./Caddyfile` | Fichier ou répertoire de configuration à vérifier. |

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

## pingclair adapt

Affiche la forme JSON dans laquelle la configuration se compile. `--pretty`
l'indente pour la lecture, et `--validate` exécute les contrôles qui touchent au
système de fichiers — chemins de certificats, par exemple — au lieu de la seule
syntaxe.

```bash
pingclair adapt [OPTIONS]
```

| Option | Défaut | Effet |
| --- | --- | --- |
| `-c`, `--config <CONFIG>` | `./Pingclairfile`, puis `./Caddyfile` | Fichier de configuration à lire. |
| `-p`, `--pretty` | désactivé | Indente le JSON. |
| `--validate` | désactivé | Valide aussi ce à quoi le document adapté fait référence. |

```bash
pingclair adapt --pretty --validate
```

## pingclair fmt

Formate un Pingclairfile et affiche le résultat. Sans chemin, il lit
`./Pingclairfile` ; `-` lit l'entrée standard.

```bash
pingclair fmt [OPTIONS] [PATH]
```

| Option | Effet |
| --- | --- |
| `-o`, `--overwrite` | Réécrit le texte formaté dans le fichier au lieu de l'afficher. |
| `-d`, `--diff` | Affiche un diff visuel plutôt que le fichier formaté. |

```bash
pingclair fmt --diff              # ce qui changerait
pingclair fmt --overwrite         # l'appliquer
```

## pingclair hash-password

Produit un hachage de mot de passe pour la directive `basic_auth`. Le mot de passe
est lu sur l'entrée standard quand `--plaintext` est omis, ce qui le garde hors de
l'historique du shell.

```bash
pingclair hash-password [OPTIONS]
```

| Option | Défaut | Effet |
| --- | --- | --- |
| `-p`, `--plaintext <PLAINTEXT>` | lu sur l'entrée standard | Mot de passe à hacher. |
| `--algorithm <ALGORITHM>` | `bcrypt` | `bcrypt` ou `argon2id`. |
| `--bcrypt-cost <COST>` | `14` | Coût bcrypt, de 4 à 31. Plus haut est plus lent et plus fort. |
| `--argon2id-time <TIME>` | `1` | Itérations argon2id. |
| `--argon2id-memory <MEMORY>` | `65536` | Coût mémoire argon2id, en Kio. |
| `--argon2id-threads <THREADS>` | `4` | Parallélisme argon2id. |
| `--argon2id-keylen <KEYLEN>` | `32` | Longueur de sortie argon2id, en octets. |

```bash
pingclair hash-password --algorithm argon2id
```

Collez la sortie dans la directive ; l'entrée
[`basic_auth`](/fr/reference/directives/#basic_auth) montre la syntaxe autour.

## pingclair version

Affiche la version, comme `v0.2.0-rc.3` pour une version candidate.

```bash
pingclair version
```

## pingclair service

Gère l'unité systemd écrite par l'installateur. C'est une enveloppe autour de
`systemctl`, donc les deux sont interchangeables ; elle existe pour que les
commandes de l'unité soient au même endroit que les autres.

```bash
pingclair service <start|stop|restart|reload|status>
```

| Sous-commande | Effet |
| --- | --- |
| `start` | Démarre l'unité. |
| `stop` | Arrête l'unité. |
| `restart` | Redémarre l'unité, ce qu'exige un écouteur changé ou une option valable pour tout le processus. |
| `reload` | Demande au serveur en cours de relire son fichier de configuration, par signal. Le résultat est sur la ligne d'état de l'unité et dans le journal, pas dans le code de sortie de cette commande. |
| `status` | Affiche l'état de l'unité. |

Linux avec systemd uniquement. Sur toute autre plateforme la commande refuse au
lieu de faire semblant, et [Exécution comme service](/fr/start/service/) est
l'endroit où l'unité elle-même est documentée.

## 🧾 D'où viennent ces options

La ligne de commande est définie dans un seul fichier du code du serveur,
`pingclair/src/cli/mod.rs`, et la page ci-dessus suit son ordre. La version
affichée par chaque écran `--help` et la version contre laquelle cette page a été
vérifiée sont la même ; quand les options d'une commande changent, cette page
change avec elles.
