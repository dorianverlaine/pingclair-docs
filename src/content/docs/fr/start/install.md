---
title: Installation
h1_emoji: '📦'
description: Installer Pingclair depuis un binaire de version, avec Docker, ou en compilant depuis les sources.
---

Pingclair cible Linux. Des binaires de version sont publiés pour `x86_64` et
`aarch64`. La compilation depuis les sources sous macOS est prise en charge pour
le développement ; macOS n'est pas une plateforme de distribution.

## 📌 État de la version

La cible d'installation par défaut est **v0.2.0-rc.3**, une release candidate.
Le script d'installation affiche le tag qu'il installe et vérifie la somme
SHA-256 publiée avant de décompresser l'archive.

La branche `v0.1.x` n'est plus maintenue : elle ne reçoit ni correctifs, ni
rétroportages, ni avis de sécurité. Une raison de migrer est que `v0.1.x`
analysait le champ `api_key` de l'Admin API sans jamais le lire : ce champ ne
protégeait donc rien.

## 📦 Installation depuis un binaire de version

```bash
curl -fsSL https://raw.githubusercontent.com/dorianverlaine/pingclair/main/scripts/install.sh | sudo bash
```

Le script télécharge le binaire de version correspondant à l'architecture
courante, vérifie sa somme de contrôle, installe `pingclair` avec l'alias `pc`,
crée un utilisateur `pingclair` non privilégié, accorde à cet utilisateur les
capacités nécessaires pour écouter sur les ports bas, et installe une unité
`systemd`.

Pour compiler et installer la branche `main` au lieu de la dernière version :

```bash
curl -fsSL https://raw.githubusercontent.com/dorianverlaine/pingclair/main/scripts/install.sh | sudo bash -s -- --main
```

`--main` compile le serveur localement. Il exige Rust 1.98 ou plus récent ainsi
que la chaîne d'outils C dont BoringSSL et jemalloc ont besoin : `cmake`,
`clang`, `libclang-dev`, `g++` et `git`.

Vérifier l'une ou l'autre installation :

```bash
pingclair version
pc version
```

## 🐳 Docker

L'image s'exécute déjà en mode fichier de configuration : son entrypoint est
`pingclair` et sa commande par défaut est `run /etc/pingclair/Pingclairfile`. Un
service Compose n'a donc qu'à monter la configuration et le stockage de
données.

```yaml
services:
  pingclair:
    image: ghcr.io/dorianverlaine/pingclair:latest
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp" # HTTP/3
    volumes:
      - ./conf:/etc/pingclair:ro
      - ./site:/srv
      - pingclair_tls:/var/lib/pingclair/certs

volumes:
  pingclair_tls:
```

Placez le `Pingclairfile` dans `./conf/` et les fichiers statiques sous
`./site/`, que la configuration atteint par un chemin absolu dans le conteneur,
par exemple `root /srv`. HTTPS, la redirection du port 80 et HTTP/3 se
comportent comme sur une installation directe sur l'hôte.

Deux points sont faciles à manquer :

- **🔒 Le volume TLS est un état, pas un cache.** Il contient les certificats
  émis, les clés de compte ACME et l'autorité de certification interne. Le
  supprimer oblige à réémettre les certificats, et les clients qui font
  confiance à l'ancienne racine interne doivent faire confiance à la nouvelle.
- **⚠️ N'ajoutez pas de `command:`.** La commande par défaut de l'image est
  déjà `run /etc/pingclair/Pingclairfile` ; la redéfinir remplace cette
  commande.

En production, épinglez un tag publié plutôt que `latest`. Les tags publiés sont
listés sur la
[page du paquet](https://github.com/dorianverlaine/pingclair/pkgs/container/pingclair).

## 🛠️ Compilation depuis les sources

```bash
git clone https://github.com/dorianverlaine/pingclair
cd pingclair
cargo build --release
```

Prérequis : Rust 1.98.1 (la version épinglée par la CI), `cmake`, `clang`,
`libclang-dev`, `g++` et `git`. BoringSSL est compilé depuis les sources pendant
la compilation, la première compilation prend donc plusieurs minutes.

## 🧭 Étapes suivantes

- [Démarrage rapide](/fr/start/quickstart/) : une première configuration,
  validée et en service.
- [Modèle de configuration](/fr/concepts/configuration/) : comment la validation
  décide de ce qui s'exécute.
