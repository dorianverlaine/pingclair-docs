---
title: Mise à jour et désinstallation
h1_emoji: '🧹'
sidebar:
  order: 5
description: Relancer l'installateur pour mettre à jour, épingler un tag de conteneur, revenir à une version antérieure, et tout retirer sans perdre ce qui mérite de rester.
---

Une mise à jour remplace deux choses — le binaire et l'unité de service — et
laisse votre configuration et vos certificats tranquilles. Cette page le montre,
donne l'équivalent pour un conteneur, le chemin de retour arrière quand une
version doit reculer, et le démontage.

## 🧾 Ce qui survit à quoi

| Chemin | Une mise à jour |
| --- | --- |
| `/etc/Pingclair/Pingclairfile` | Conservé. L'installateur ne l'écrit que s'il manque. |
| `/etc/Pingclair/Pingclairfile.example` | Remplacé par l'exemple courant. |
| `/var/lib/pingclair/certs` | Conservé. Certificats émis et état ACME restent en place. |
| `/var/lib/pingclair/html` | Conservé. |
| `/usr/local/bin/pingclair` et `pc` | Remplacés par la nouvelle version. |
| `/etc/systemd/system/pingclair.service` | Réécrit, puis le service est redémarré. |

## ⬆️ Mettre à jour avec l'installateur

```bash
curl -fsSL https://raw.githubusercontent.com/dorianverlaine/pingclair/main/scripts/install.sh | sudo bash
```

Le script demande à GitHub le tag de la dernière version, l'affiche, vérifie la
somme SHA-256 de l'archive, remplace le binaire et l'unité, puis redémarre le
service. Un fichier de configuration existant n'est pas touché, ce qui fait de
cette opération une mise à jour et non une remise à zéro :

```text
Detected architecture: x86_64
Fetching latest release from dorianverlaine/pingclair...
Installing v0.2.0-rc.3 — a release candidate, not a final release.
pingclair-linux-x86_64.tar.gz: OK
✅ Installation Complete!
Config: /etc/Pingclair/Pingclairfile
```

Confirmez la nouvelle version et que l'ancienne configuration sert toujours :

```bash
pingclair version
pc service status
curl -i http://localhost/
```

```text
v0.2.0-rc.3
```

L'installateur installe toujours la dernière version. Il n'existe pas d'option
pour une version précise ; c'est le retour arrière ci-dessous qui s'en charge.

## 🐳 Mettre à jour un conteneur

Rien n'est installé sur l'hôte : une mise à jour est un changement de tag et un
pull. Épinglez la nouvelle version dans le fichier compose :

```yaml
services:
  pingclair:
    image: ghcr.io/dorianverlaine/pingclair:v0.2.0-rc.3
```

```bash
docker compose pull
docker compose up -d
docker logs pingclair 2>&1 | head -3
```

```text
🚀 Starting Pingclair with config: /etc/pingclair/Pingclairfile
🚀 Starting Pingclair v0.2.0-rc.3
📄 Loaded configuration from: /etc/pingclair/Pingclairfile
```

La configuration et le magasin de certificats vivent dans les volumes, donc le
nouveau conteneur les retrouve là où l'ancien les a laissés. Deux points à
surveiller :

- **Un conteneur qui publie le port 80 ne peut pas démarrer tant que le service
  systemd tourne.** Arrêtez l'un des deux : `sudo pc service stop`, ou changez le
  port publié côté conteneur.
- **`latest` suit la version la plus récente.** Épinglez une version en
  production, pour qu'une mise à jour soit une décision et non un effet de bord
  d'un pull.

## ⏪ Revenir à une version antérieure

Quand une version doit reculer, récupérez la précédente depuis GitHub Releases,
vérifiez-la et remplacez le binaire :

```bash
mkdir -p /tmp/rollback && cd /tmp/rollback
curl -fsSLO https://github.com/dorianverlaine/pingclair/releases/download/v0.2.0-rc.2/pingclair-linux-x86_64.tar.gz
curl -fsSLO https://github.com/dorianverlaine/pingclair/releases/download/v0.2.0-rc.2/SHA256SUMS-x86_64.txt
sha256sum -c SHA256SUMS-x86_64.txt
mkdir -p extract && tar -xzf pingclair-linux-x86_64.tar.gz -C extract
```

```text
pingclair-linux-x86_64.tar.gz: OK
```

```bash
sudo systemctl stop pingclair
sudo install -m 0755 extract/pingclair /usr/local/bin/pingclair
sudo systemctl start pingclair
pingclair version
```

```text
v0.2.0-rc.2
```

Validez ensuite la configuration face à la version restaurée : une directive que
cette version n'implémente pas est refusée par son nom plutôt qu'ignorée.

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

## 🧹 Le désinstaller

```bash
sudo pc service stop
sudo systemctl disable pingclair
sudo rm /etc/systemd/system/pingclair.service
sudo systemctl daemon-reload
sudo rm /usr/local/bin/pingclair /usr/local/bin/pc
```

Après cela, `systemctl status pingclair` répond `Unit pingclair.service could not
be found`, la commande a disparu et rien n'écoute sur le port 80. Ce qui reste
sur le disque est volontairement vos données :

```text
/etc/Pingclair/Pingclairfile      la configuration, toujours valide
/var/lib/pingclair/certs          certificats émis et état ACME
/var/lib/pingclair/html           le site d'attente
/var/log/pingclair                le répertoire d'une destination de journal
```

Gardez `/var/lib/pingclair/certs` si vous prévoyez de réinstaller : les
certificats et la racine interne survivent, et les clients qui font confiance à
cette racine continuent de fonctionner. Supprimez tout, y compris le compte de
service, quand l'hôte a fini avec Pingclair :

```bash
sudo rm -rf /etc/Pingclair /var/lib/pingclair /var/log/pingclair
sudo userdel pingclair
```

## ⚠️ Quand cela se passe mal

- **L'installateur a installé une version inattendue.** Il prend toujours le
  dernier tag de version. Vérifiez avec `pingclair version` et utilisez le retour
  arrière ci-dessus s'il vous fallait une version précise.
- **Le service ne démarre plus après une mise à jour.** Lisez
  `sudo pingclair validate /etc/Pingclair/Pingclairfile`. Une directive que la
  nouvelle version refuse échoue de façon fermée, avec son nom et
  l'alternative : le journal donne la ligne à changer.
- **Un conteneur s'arrête immédiatement.** `docker logs <container>` en donne la
  raison. Les causes habituelles sont un `/etc/pingclair/Pingclairfile` absent du
  répertoire de configuration monté, ou un port déjà utilisé sur l'hôte.
- **Les clients rejettent le certificat après une reconstruction du magasin.**
  Si l'autorité interne a été régénérée, l'ancienne racine ne signe plus rien.
  Installez la nouvelle avec
  `sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/certs pingclair trust`.

## 🧭 Étapes suivantes

- [Installation](/fr/start/install/) : l'arborescence que cette page conserve ou
  supprime.
- [Exécution comme service](/fr/start/service/) : l'unité qu'une mise à jour
  réécrit.
- [État du projet](/fr/project/status/) : ce que la version courante prend en
  charge et ce qu'elle refuse.
