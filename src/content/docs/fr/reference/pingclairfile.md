---
title: Pingclairfile
h1_emoji: '📖'
description: Le langage de configuration, sa structure de fichier, ses adresses, ses matchers, ses fragments et son outillage.
---

Le Pingclairfile est le langage de configuration. Il suit les conventions de
Caddyfile : un bloc d'options globales facultatif, puis des blocs de site
contenant des directives. Cette page décrit le langage lui-même ; les directives
qu'il accepte sont décrites dans la
[référence des directives](/fr/reference/directives/).

## 🔤 Règles lexicales

| Règle | Détail |
| --- | --- |
| Commentaires | `#` jusqu'à la fin de la ligne. |
| Guillemets | Une valeur contenant des espaces est mise entre `"`. Les guillemets sont retirés avant l'analyse de la valeur. |
| Durées | Écrites avec une unité : `30s`, `5m`, `1h`. Un nombre nu est refusé là où une durée est attendue. |
| Casse | Les noms de directives et d'options sont en minuscules. |
| Placeholders | `{host}`, `{path}`, `{args[0]}`, `{block}` et le reste de l'ensemble des placeholders sont développés là où la directive le documente. |

## 🌐 Adresses

Un bloc de site est nommé par une adresse. L'adresse détermine l'écouteur et,
pour les noms publics, si HTTPS automatique s'applique.

```caddyfile
example.com {              # host: ports 443 and 80, automatic HTTPS
localhost:8080 {           # host and port
:8080 {                    # any host on this port
http://example.com {       # force plaintext
```

Le port appartient à l'adresse plutôt qu'à une directive `listen` séparée :
l'adresse et l'écouteur ne peuvent donc pas diverger.

## 🧭 Matchers

Une directive qui accepte un matcher ne s'applique qu'aux requêtes
correspondantes. Les matchers s'écrivent en ligne ou sont déclarés avec `@nom`
puis référencés par ce nom.

```caddyfile
example.com {
    @api path /api/*
    header @api Cache-Control "no-store"

    handle /assets/* {
        file_server ./assets
    }
}
```

Les blocs `handle` regroupent les directives par route ; un `handle` sans
matcher est le repli de son site.

## 🧩 Fragments et imports

Les fragments sont des morceaux réutilisables. Un fragment déclaré sous la
forme `(nom) { ... }` est inclus avec `import nom` et peut recevoir un bloc de
son appelant :

```caddyfile
(proxied) {
    https://{args[0]} {
        encode zstd gzip
        {block}
    }
}

import proxied example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Un placeholder qui ne reçoit rien n'insère rien : un fragment écrit avec
`{block}` compile donc encore lorsque son appelant ne fournit aucun bloc.

## 🧰 Outillage en ligne de commande

| Commande | Objet |
| --- | --- |
| `pingclair validate [path]` | Compiler et vérifier une configuration. Par défaut `./Pingclairfile`, puis `./Caddyfile`. |
| `pingclair adapt --pretty` | Afficher la forme JSON compilée de la configuration. |
| `pingclair fmt [--diff] [--overwrite]` | Formater un Pingclairfile, ou montrer les changements. |
| `pingclair run <path>` | Exécuter le serveur avec la configuration donnée. |
| `pingclair list-modules` | Lister les modules avec lesquels le binaire a été compilé. |
| `pingclair build-info` | Afficher les métadonnées de compilation, y compris la chaîne d'outils utilisée. |

## 🚫 Ce qui ne fait pas partie du langage

Le format définit plus de noms que le serveur n'en implémente. Un nom reconnu
mais non implémenté est refusé par son nom au chargement, avec un message
indiquant que la fonctionnalité manque. La liste de référence des noms refusés
se trouve dans le README du dépôt du serveur, et la page
[état du projet](/fr/project/status/) en résume les catégories.
