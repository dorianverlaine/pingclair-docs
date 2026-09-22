---
title: Modèle de configuration
h1_emoji: '🧠'
description: Comment un Pingclairfile est analysé, compilé, validé et transformé en état d'exécution.
---

Un Pingclairfile est compilé une fois, au chargement, en l'état d'exécution que
le serveur exécute. Deux conséquences en découlent, et elles expliquent
l'essentiel du comportement du projet : le travail que la configuration peut
décider a lieu avant la première requête, et une configuration qui ne peut pas
être honorée arrête le serveur au lieu de se dégrader au moment des requêtes.

## 🗂️ Structure du fichier

Un fichier contient un bloc d'options globales facultatif, suivi d'un ou
plusieurs blocs de site.

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

- **Les options globales** s'écrivent dans un bloc sans nom, placé en premier.
  Elles configurent un état qui n'appartient pas à un site : l'adresse e-mail du
  compte ACME, l'Admin API, le comportement de HTTPS automatique, les proxys de
  confiance et la résolution DNS des amonts désignés par un nom d'hôte. Les
  options disponibles sont listées dans la
  [référence des directives](/fr/reference/directives/#global-options).
- **Les blocs de site** sont nommés par une adresse : un hôte, un port, ou les
  deux. Le port fait partie de l'adresse plutôt que d'une directive séparée :
  il n'existe donc qu'un seul endroit où l'adresse et l'écouteur doivent
  s'accorder.
- **Les directives** sont les instructions à l'intérieur d'un bloc de site.
  Certaines prennent une liste d'arguments, d'autres un bloc imbriqué, d'autres
  les deux.
- **Les commentaires** commencent par `#` et vont jusqu'à la fin de la ligne.
- **Les valeurs contenant des espaces sont mises entre guillemets.** Les durées
  portent une unité : `30s` vaut trente secondes, alors qu'un `30` nu est
  refusé là où une durée est attendue.

## 🧭 Matchers

Un matcher sélectionne les requêtes auxquelles une directive s'applique. Les
matchers nommés sont déclarés avec `@nom` et référencés par ce nom :

```caddyfile
example.com {
    @api path /api/*
    header @api Cache-Control "no-store"

    @assets path /assets/*
    header @assets Cache-Control "public, max-age=31536000, immutable"
}
```

Les blocs `handle` regroupent le comportement par route et acceptent un repli
sans matcher :

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

## 🧩 Fragments et imports

Un fragment est un morceau réutilisable déclaré sous la forme `(nom) { ... }`
et inclus avec `import nom`. Un fragment peut recevoir un bloc de son appelant,
qui est inséré là où le fragment écrit `{block}` :

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

Les définitions de fragments présentes dans un fichier importé sont visibles
par les imports qui suivent. Les placeholders à l'intérieur d'une liste
d'arguments sont refusés, car l'arbre de directives ne peut pas réanalyser une
ligne après l'insertion comme le fait la couche de tokens.

## 🛡️ Validation

`pingclair validate` compile le fichier et applique des contrôles sémantiques :
arguments des directives, syntaxe des matchers, chemins de certificats et de
clés, et contraintes de politique telles que les pairs autorisés à affirmer des
en-têtes d'identité client.

Les échecs sont fermés et explicites :

- **Les noms non implémentés sont refusés par leur nom.** Chaque nom défini par
  le format est reconnu, et un nom que le serveur n'implémente pas produit un
  message indiquant que la fonctionnalité manque. Il n'est jamais pris pour une
  faute de frappe et jamais ignoré : une configuration qui en contient un ne
  démarre pas.
- **Les options qui ne peuvent pas être honorées sont refusées, pas
  dégradées.** Demander Brotli dans `encode` est une erreur de compilation, car
  le proxy n'a pas d'encodeur Brotli en flux ; le serveur ne sert pas
  silencieusement du gzip à la place.
- **Un fichier valide qui référence du matériel absent est tout de même
  rejeté.** Le fichier `examples/full_featured.pingclair` du dépôt est une
  syntaxe Caddyfile valide et il est pourtant rejeté, à juste titre, parce que
  les chemins de certificats qu'il nomme n'existent pas sur la machine qui
  exécute le contrôle.

Les mêmes contrôles s'exécutent au chargement : une configuration qui échoue
pendant un rechargement laisse l'état précédent en place.

## 🔁 Rechargements

Un rechargement relit la configuration sans redémarrer le processus. Le signal
est `SIGUSR1` :

```bash
sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"
```

`pingclair reload` atteint le même code par l'Admin API et rapporte ce que le
serveur a pensé du fichier, ce qui exige l'option `admin` du bloc des options
globales.

`pc service reload` envoie ce signal par l'unité installée : la commande évidente
est celle qui fonctionne. Sa réponse n'est pas dans le code de sortie —
`systemctl reload` peut seulement signaler que le signal a été délivré — mais sur
la ligne d'état de l'unité et dans le journal, et un rechargement refusé laisse
l'ancienne configuration en service
([issue #66](https://github.com/dorianverlaine/pingclair/issues/66) décrit la
version dont l'unité annonçait un succès malgré tout). La politique valable pour
tout le processus, établie au démarrage — par exemple `trusted_proxies` — ne
prend effet qu'après un redémarrage, et une configuration qui change d'écouteurs
en exige un aussi.
