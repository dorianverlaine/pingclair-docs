---
title: Servir un site statique
h1_emoji: '🗂️'
sidebar:
  order: 2
description: Servir un répertoire avec compression, en-têtes de cache, requêtes partielles, repli pour application d'une seule page, et une règle qui garde les fichiers cachés privés.
---

Servir des fichiers est l'autre moitié du travail de Pingclair. Cette page
construit un site statique à partir de `root` et `file_server`, puis ajoute la
compression, les en-têtes de cache, les requêtes partielles et le repli dont une
application d'une seule page a besoin, en montrant ce que le serveur répond
réellement à chaque étape.

## 🧾 Avant de commencer

- Pingclair installé et en service ([Installation](/fr/start/install/)), service
  arrêté le temps des essais : `sudo pc service stop`.
- Un répertoire à servir. Les exemples utilisent `/srv/site`.

## 📁 Servir un répertoire

```caddyfile
http://:8080 {
    root * /srv/site
    file_server
}
```

```bash
sudo cp Pingclairfile /etc/Pingclair/Pingclairfile
sudo pingclair validate /etc/Pingclair/Pingclairfile
sudo systemctl restart pingclair
curl -i http://localhost:8080/
```

```text
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Last-Modified: Tue, 22 Sep 2026 04:37:54 GMT
ETag: "5e-6ab20622"
Accept-Ranges: bytes
```

`root *` définit la racine du site pour chaque requête, et `file_server` sert
depuis celle-ci. Un chemin inexistant répond `404`.

## 🗜️ Compression

```caddyfile
http://:8080 {
    root * /srv/site
    encode zstd gzip
    file_server
}
```

Les arguments sont dans l'ordre de préférence. Le même fichier texte de 36 Ko,
demandé avec trois en-têtes `Accept-Encoding` différents, mesuré sur cette
configuration :

```text
zstd      200   65 bytes   content-encoding: zstd
gzip      200  301 bytes   content-encoding: gzip
identity  200 36000 bytes  (no content-encoding)
```

Brotli n'est pas implémenté pour les réponses proxifiées, et le demander est une
erreur de compilation plutôt qu'une dégradation silencieuse :

```text
Error: ❌ Configuration Error: Compile error: Unsupported feature: `encode br`: Brotli is not implemented for proxied responses; use `encode zstd gzip`
```

Le message nomme l'alternative, et c'est le but : une configuration qui demande
ce que le serveur ne peut pas honorer ne s'exécute pas du tout.

## ⏳ En-têtes de cache

`file_server` répond déjà aux requêtes conditionnelles — l'`ETag` et le
`Last-Modified` ci-dessus sont ce qu'un client renvoie dans `If-None-Match` ou
`If-Modified-Since`. La durée de conservation vous appartient, et elle se place
sur les chemins où elle est vraie :

```caddyfile
http://:8080 {
    root * /srv/site
    encode zstd gzip
    header Cache-Control "public, max-age=60"

    @assets path /assets/*
    header @assets Cache-Control "public, max-age=31536000, immutable"

    file_server
}
```

Mesuré : `Cache-Control: public, max-age=60` sur la page,
`public, max-age=31536000, immutable` sur `/assets/*`. Une valeur immuable n'est
honnête que si les noms de fichiers changent avec le contenu, ce que font les
outils de build en ajoutant un hachage.

Les requêtes partielles ne demandent aucune configuration ; un client qui demande
les dix premiers octets les obtient :

```text
HTTP/1.1 206 Partial Content
Content-Length: 10
Content-Range: bytes 0-9/36000
```

## 🧭 Applications d'une seule page

Une application qui route dans le navigateur a besoin que tout chemin inconnu
renvoie son document d'entrée, tandis que les vrais fichiers continuent d'être
servis :

```caddyfile
http://:8080 {
    root * /srv/site
    try_files {path} /index.html
    file_server
}
```

Mesuré : `/assets/big.txt` répond toujours `200` avec son propre contenu, et
`/some/spa/route` répond `200` avec `index.html`. Sans la ligne `try_files`, la
seconde requête est un `404`.

## 🗂️ Listes de répertoire

`file_server browse` affiche une liste pour un répertoire sans fichier d'index :

```caddyfile
http://:8080 {
    root * /srv/site
    file_server browse
}
```

La liste nomme les entrées : `/assets/` affiche `big.txt` sous un titre
`Index of`. Laissez `browse` de côté sauf si le répertoire est fait pour être lu
ainsi.

## 🔒 Masquer des fichiers

⚠️ Les fichiers commençant par un point sont servis comme les autres : `.hidden` a
répondu `200` dans la configuration ci-dessus, et c'est ainsi que `.git`, `.env`
et les sauvegardes d'éditeur finissent sur Internet. Pour les écarter, répondez
avant que le serveur de fichiers ne s'exécute :

```caddyfile
http://:8080 {
    root * /srv/site

    @hidden path /.*
    respond @hidden "Not found" 404

    file_server
}
```

Mesuré : `/.hidden` répond `404` tandis que `/` et `/assets/big.txt` répondent
toujours `200`. Le `404` plutôt que `403` est délibéré — un `403` confirme que le
fichier existe.

## ⚠️ Quand cela ne marche pas

- **`Unsupported feature: 'encode br'`.** Brotli est refusé par son nom ; utilisez
  `encode zstd gzip`.
- **`Unknown directive 'file_server: …'`.** L'option n'existe pas, et `validate`
  nomme l'orthographe refusée au lieu de l'ignorer.
- **Une liste de répertoire au lieu de la page.** Le répertoire n'a pas
  d'`index.html` : c'est soit voulu, soit un fichier manquant.
- **`404` pour une route que l'application gère.** Le repli manque :
  `try_files {path} /index.html`.
- **Une nouvelle page n'apparaît pas après un rechargement.** Le rechargement
  applique la politique, pas un nouvel écouteur ; les fichiers sont lus à chaque
  requête, donc ajouter un fichier est immédiat et déplacer l'écouteur ne l'est
  pas ([Exécution comme service](/fr/start/service/#-what-a-reload-means)).

## 🧭 Étapes suivantes

- [Proxifier une application](/fr/guides/reverse-proxy/) : l'autre moitié du
  serveur.
- [`file_server`](/fr/reference/directives/#file_server) : la référence de la
  directive.
- [`try_files`](/fr/reference/pingclairfile/) : comment le repli est compilé.
