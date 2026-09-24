---
title: Modèle de configuration
h1_emoji: '🧠'
description: La structure d'un Pingclairfile, sa compilation et sa validation avant l'arrivée de toute requête, le choix des routes, et ce que change un rechargement.
---

Un Pingclairfile est compilé une seule fois, au chargement, dans l'état que le
serveur exécute. Deux conséquences en découlent, et elles expliquent l'essentiel
du comportement de Pingclair. Le travail que la configuration permet de
trancher, comme l'analyse des adresses ou la compilation des matchers, se fait
avant la première requête plutôt qu'à chaque requête. Et une configuration qui
ne peut pas être respectée arrête le serveur au chargement, au lieu de mal se
comporter plus tard sur une requête que personne n'a testée. Cette page décrit
**v0.2.0-rc.3**.

## 🗂️ Un fichier, ce sont des options globales suivies de blocs de site

```caddyfile
{
    email admin@example.com
}

example.com {
    encode zstd gzip
    reverse_proxy 10.0.0.10:8080 10.0.0.11:8080
}

:8080 {
    file_server ./public
}
```

- **Les options globales** se placent dans un bloc sans nom en tête du fichier.
  Elles règlent ce qui n'est propre à aucun site : l'adresse e-mail du compte
  ACME, l'API d'administration, le HTTPS automatique, les proxys de confiance et
  le rafraîchissement DNS des upstreams désignés par nom d'hôte. La
  [référence des directives](/fr/reference/directives/#global-options) les
  liste.
- **Les blocs de site** sont nommés par leur adresse : un hôte, un port, ou les
  deux. Le port fait partie de l'adresse au lieu d'être une directive séparée ;
  l'adresse et l'écouteur ne peuvent donc pas se contredire.
- **Les directives** sont les instructions d'un bloc de site. Certaines
  prennent des arguments, d'autres un bloc imbriqué, d'autres les deux.
- **Les commentaires** commencent par `#` et courent jusqu'à la fin de la
  ligne.
- **Les valeurs qui contiennent des espaces se mettent entre guillemets.** Les
  durées portent une unité : `30s` vaut trente secondes, et un `30` nu est
  refusé là où une durée est attendue.

## 🧭 Les matchers choisissent les requêtes auxquelles s'applique une directive

Un matcher nommé se déclare avec `@nom` et s'utilise en écrivant ce nom après la
directive :

```caddyfile
example.com {
    @api path /api/*
    header @api Cache-Control "no-store"

    @assets path /assets/*
    header @assets Cache-Control "public, max-age=31536000, immutable"
}
```

Un bloc `handle` regroupe les directives d'une route. Un seul bloc `handle`
répond à une requête donnée, et un `handle` sans matcher attrape tout ce que les
autres n'ont pas pris :

```caddyfile
example.com {
    handle /assets/* {
        file_server ./assets
    }

    handle {
        respond "Page Not Found" 404
    }
}
```

## 🚦 Quelle route répond à une requête

Quand plusieurs routes d'un site correspondent à la même requête, l'une d'elles
doit répondre. Dans v0.2.0-rc.3, la route au chemin le plus spécifique
l'emporte, quelle que soit sa place dans le fichier.

📌 **Prochaine version, changement incompatible.** Sur `main`, les routes
suivent à la place l'ordre des directives de Caddy : les directives sont
classées par nature (par exemple, `respond` passe avant `file_server` et
`reverse_proxy`), et la première route correspondante dans cet ordre répond. Un
site qui compte sur une route plus étroite écrite sous une route plus large d'un
rang antérieur répondra autrement après la mise à jour. Deux façons conservent
l'ancienne réponse sur les deux versions : placer chaque route dans son propre
bloc `handle`, comme le fait déjà l'exemple ci-dessus, ou lister les routes dans
un bloc `route`, qui garde l'ordre d'écriture. Le
[CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md)
consigne le classement complet sous Unreleased.

## 🧩 Les fragments et les imports réutilisent la configuration

Un fragment (snippet) est un morceau réutilisable déclaré sous la forme
`(nom) { ... }` et inséré avec `import nom`. L'appelant peut passer des
arguments et un bloc ; le fragment reçoit ce bloc là où il écrit `{block}` :

```caddyfile
(site) {
    https://{args[0]} {
        {block}
    }
}

import site example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Les fragments définis dans un fichier importé sont visibles des imports qui le
suivent. Un placeholder situé dans la liste d'arguments d'une directive est
refusé : Caddy relit la ligne après avoir inséré le fragment, ce que l'analyseur
de Pingclair ne sait pas faire ; il le dit donc au lieu de deviner ce que la
ligne devait être.

## 🛡️ La validation refuse ce que le serveur ne sait pas faire

`pingclair validate` compile le fichier et applique les contrôles qui vont
au-delà de la syntaxe : arguments des directives, syntaxe des matchers,
existence des fichiers de certificat et de clé, et contraintes de politique,
comme les pairs autorisés à définir les en-têtes d'identité du client.

Une configuration qui échoue à ces contrôles ne s'exécute pas. Trois règles
décident de ce qui échoue :

- **Un nom non implémenté est refusé par son nom.** Pingclair reconnaît tous
  les noms que définit le format Caddyfile. Un nom qu'il n'implémente pas
  produit un message indiquant que la fonctionnalité manque ; il n'est jamais
  pris pour une faute de frappe, ni ignoré en silence.
- **Une option qui ne peut pas être respectée est refusée, pas dégradée.**
  `encode br` est une erreur de compilation, faute d'encodeur Brotli en flux ;
  le serveur ne sert pas gzip à la place en silence.
- **Une syntaxe correcte qui désigne des fichiers absents reste une erreur.**
  `examples/full_featured.pingclair`, dans le dépôt du serveur, a une syntaxe
  valide, et `validate` le rejette pourtant sur une machine où les chemins de
  certificats qu'il nomme n'existent pas.

Le serveur applique les mêmes contrôles quand il charge un fichier, y compris
lors d'un rechargement.

## 🔁 Un rechargement remplace la configuration sans redémarrage

Un rechargement relit le fichier, le compile et met le résultat en place
pendant que le processus continue de tourner. Si le nouveau fichier ne compile
pas, la configuration précédente reste en service. Il existe trois façons d'en
demander un :

- `pc service reload` (ou `systemctl reload pingclair`) envoie `SIGUSR1` par
  l'unité installée.
- `sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"` envoie
  directement le même signal.
- `pingclair reload` passe par l'API d'administration et affiche le verdict du
  serveur. Il exige l'option globale `admin`.

`systemctl reload` ne peut rapporter que la remise du signal ; le verdict du
serveur apparaît donc sur la ligne d'état de l'unité et dans le journal.

Certaines modifications ne peuvent pas être appliquées par un rechargement :
le serveur refuse alors le rechargement et garde l'ancienne configuration
plutôt que d'en appliquer une partie.

- **Modifications d'écouteur.** Ajouter, retirer ou déplacer une adresse, ou
  faire passer un écouteur du texte clair à TLS ou l'inverse, exige un
  redémarrage, car les sockets d'écoute sont créés au démarrage.
- **Options globales.** Les options fixées au démarrage, comme
  `trusted_proxies`, s'appliquent à tout le processus ; toute modification du
  bloc d'options globales exige donc un redémarrage.
- **Topologie des certificats.** Ajouter un nom d'hôte TLS, ou changer la façon
  dont un site obtient son certificat, exige un redémarrage.

Le refus nomme la modification, par exemple `listener topology changed (added:
…, removed: …)`, et `sudo pc service restart` l'applique.

[Exécution comme service](/fr/start/service/#-ce-que-signifie-un-rechargement)
montre à quoi ressemble chaque issue.

## 🧭 Pages liées

- [Pingclairfile](/fr/reference/pingclairfile/) : le langage en entier.
- [Référence des directives](/fr/reference/directives/) : chaque directive et
  chaque option.
- [Architecture](/fr/concepts/architecture/) : ce qui exécute la configuration
  compilée.
