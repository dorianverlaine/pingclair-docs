---
title: Servir un site statique
h1_emoji: '🗂️'
sidebar:
  order: 2
description: Servir un répertoire avec compression, en-têtes de cache, requêtes partielles, un repli pour application d'une seule page, et une règle qui garde les fichiers cachés privés.
---

Cette page sert un répertoire de fichiers, en commençant par `root` et
`file_server`, puis en ajoutant la compression, les en-têtes de cache, les
requêtes partielles et le repli dont une application d'une seule page a besoin.
Chaque étape montre ce que le serveur a répondu sur un hôte réel.

📌 Cette page décrit **v0.2.0-rc.3**, la dernière version publiée. Les
changements qui n'existent que sur la branche `main` du serveur sont signalés
par **Prochaine version**.

## 🧾 Avant de commencer

- Pingclair installé et en cours d'exécution ([Installation](/fr/start/install/)),
  avec le service arrêté le temps de vos essais : `sudo pc service stop`.
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

`root *` fixe la racine du site pour toutes les requêtes, et `file_server` sert
les fichiers qui s'y trouvent. Un chemin inexistant répond `404`.

## 🗜️ Compression

```caddyfile
http://:8080 {
    root * /srv/site
    encode zstd gzip
    file_server
}
```

`encode` liste les formats par ordre de préférence. Le même fichier texte de
36 Ko, demandé avec trois en-têtes `Accept-Encoding` différents :

```text
zstd      200   65 bytes   content-encoding: zstd
gzip      200  301 bytes   content-encoding: gzip
identity  200 36000 bytes  (no content-encoding)
```

Brotli n'est pas implémenté pour les réponses relayées, et le demander est une
erreur de compilation plutôt qu'une dégradation silencieuse :

```text
Error: ❌ Configuration Error: Compile error: Unsupported feature: `encode br`: Brotli is not implemented for proxied responses; use `encode zstd gzip`
```

Le message nomme l'alternative. Une configuration qui demande ce que le serveur
ne sait pas faire ne s'exécute pas du tout.

Dans v0.2.0-rc.3, un site sans ligne `encode` compresse tout de même en gzip ;
écrivez `encode off` pour servir les octets tels qu'ils sont sur le disque.
**Prochaine version :** un site ne compresse que là où `encode` le demande,
comme dans Caddy ; conservez donc la ligne `encode` lors de la mise à jour.

## ⏳ En-têtes de cache

`file_server` envoie `ETag` et `Last-Modified`, mais dans v0.2.0-rc.3 il
n'évalue ni `If-None-Match` ni `If-Modified-Since` : un client qui revalide
télécharge de nouveau le fichier entier. **Prochaine version :** les requêtes
conditionnelles reçoivent `304 Not Modified` ou `412 Precondition Failed`.

La durée pendant laquelle un client peut garder un fichier est une décision
propre au site, et elle s'applique aux chemins où elle est vraie :

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

Mesuré : `Cache-Control: public, max-age=60` sur la page, et
`public, max-age=31536000, immutable` sur `/assets/*`. `immutable` n'est sûr que
si le nom d'un fichier change chaque fois que son contenu change ; c'est
pourquoi les outils de build ajoutent une empreinte du contenu au nom des
ressources.

Les requêtes partielles ne demandent aucune configuration ; un client qui
demande les dix premiers octets les obtient :

```text
HTTP/1.1 206 Partial Content
Content-Length: 10
Content-Range: bytes 0-9/36000
```

## 🧭 Applications d'une seule page

Une application qui gère ses routes dans le navigateur a besoin que chaque
chemin inconnu renvoie son document d'entrée, tandis que les vrais fichiers
restent servis tels quels :

```caddyfile
http://:8080 {
    root * /srv/site
    try_files {path} /index.html
    file_server
}
```

Mesuré : `/assets/big.txt` répond toujours `200` avec son propre contenu, et
`/some/spa/route` répond `200` avec `index.html`. Sans la ligne `try_files`, la
seconde requête donne un `404`.

## 🗂️ Listes de répertoire

`file_server browse` affiche une liste pour un répertoire dépourvu de fichier
d'index :

```caddyfile
http://:8080 {
    root * /srv/site
    file_server browse
}
```

La liste nomme les entrées : `/assets/` montre `big.txt` sous un titre
`Index of`. Laissez `browse` désactivé, sauf si le répertoire est fait pour être
parcouru ainsi.

## 🔒 Masquer des fichiers

⚠️ Les fichiers cachés (dotfiles) sont servis comme n'importe quel autre
fichier : `.hidden` a répondu `200` avec la configuration ci-dessus. C'est ainsi
que `.git`, `.env` et les sauvegardes d'éditeur se retrouvent sur Internet. Pour
les tenir à l'écart, répondez à ces chemins avant le serveur de fichiers :

```caddyfile
http://:8080 {
    root * /srv/site

    @hidden path /.*
    respond @hidden "Not found" 404

    file_server
}
```

Mesuré : `/.hidden` répond `404`, tandis que `/` et `/assets/big.txt` répondent
toujours `200`. Le code est `404` plutôt que `403`, volontairement : un `403`
confirme que le fichier existe. `/.*` ne correspond qu'aux fichiers cachés situés
à la racine du site ; l'option `file_server { hide … }` masque des chemins où
qu'ils se trouvent.

## ⚠️ Quand cela ne marche pas

- **`Unsupported feature: 'encode br'`.** Brotli est refusé par son nom ;
  utilisez `encode zstd gzip`.
- **`Unknown directive 'file_server: …'`.** L'option n'existe pas, et
  `validate` nomme l'écriture refusée au lieu de l'ignorer.
- **Une liste de répertoire au lieu de la page.** Le répertoire n'a pas
  d'`index.html`, ce qui est soit voulu, soit un fichier manquant.
- **`404` sur une route gérée par l'application.** Le repli pour application
  d'une seule page manque : `try_files {path} /index.html`.
- **Une modification n'apparaît pas après un rechargement.** Les fichiers sont
  lus à chaque requête ; un nouveau fichier apparaît donc aussitôt, sans
  rechargement. Un écouteur nouveau ou déplacé exige un redémarrage
  ([Exécution comme service](/fr/start/service/#-ce-que-signifie-un-rechargement)).

## 🧭 Étapes suivantes

- [Proxifier une application](/fr/guides/reverse-proxy/) : l'autre moitié du
  serveur.
- [`file_server`](/fr/reference/directives/#file_server) : la référence de la
  directive.
- [Pingclairfile](/fr/reference/pingclairfile/) : les matchers et l'ordre des
  routes.
