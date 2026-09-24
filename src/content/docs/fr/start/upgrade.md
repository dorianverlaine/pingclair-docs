---
title: Mise à jour et désinstallation
h1_emoji: '🧹'
sidebar:
  order: 5
description: Relancer l'installateur pour mettre à jour, épingler un tag de conteneur, revenir à une version antérieure et tout retirer sans perdre ce qui mérite d'être conservé.
---

Une mise à jour remplace deux choses, le binaire et l'unité de service, et
laisse intactes votre configuration et vos certificats. Cette page le montre,
puis donne l'équivalent pour un conteneur, la marche à suivre pour revenir à une
version antérieure, et le démontage.

## 🧾 Ce qui survit à quoi

| Chemin | Lors d'une mise à jour |
| --- | --- |
| `/etc/Pingclair/Pingclairfile` | Conservé. L'installateur ne l'écrit que s'il manque. |
| `/etc/Pingclair/Pingclairfile.example` | Remplacé par l'exemple actuel. |
| `/var/lib/pingclair/.local/share/pingclair` | Conservé. Les certificats émis et l'état ACME restent en place. |
| `/var/lib/pingclair/html` | Conservé. |
| `/usr/local/bin/pingclair` et `pc` | Remplacés par la nouvelle version. |
| `/etc/systemd/system/pingclair.service` | Réécrite, puis le service est redémarré. |

## ⬆️ Mettre à jour avec l'installateur

```bash
curl -fsSL https://pingclair.com/install.sh | sudo bash
```

Le script trouve la version la plus récente sur le canal de publication,
affiche son tag, vérifie le SHA-256 de l'archive, remplace le binaire et
l'unité, puis redémarre le service. Quand l'hôte du canal est injoignable, il
interroge à la place l'API des releases GitHub ; l'exécution ci-dessous a suivi
ce chemin, d'où la ligne `Fetching latest release`. Un fichier de configuration
existant n'est pas touché, et c'est ce qui en fait une mise à jour plutôt
qu'une remise à zéro :

```text
Detected architecture: x86_64
Fetching latest release from dorianverlaine/pingclair...
Installing v0.2.0-rc.3 — a release candidate, not a final release.
pingclair-linux-x86_64.tar.gz: OK
✅ Installation Complete!
Config: /etc/Pingclair/Pingclairfile
```

Vérifiez la nouvelle version, et que l'ancienne configuration est toujours
servie :

```bash
pingclair version
pc service status
curl -i http://localhost/
```

```text
v0.2.0-rc.3
```

L'installateur installe toujours la version la plus récente. Aucune option ne
permet d'installer une version précise ; c'est à cela que sert le retour
arrière décrit plus bas.

## ⚠️ Lire les notes de mise à jour avant 0.2.0

La prochaine version change des comportements qu'une configuration inchangée
peut remarquer : quelle route répond à une requête, si un site sans `encode`
compresse, la limite par défaut du corps de requête, ce que `remote_ip` compare,
et l'endroit où l'autorité interne conserve sa racine.
[État du projet](/fr/project/status/#-ce-qui-change-dans-la-prochaine-version)
les résume, et le
[CHANGELOG](https://github.com/dorianverlaine/pingclair/blob/main/CHANGELOG.md)
consacre à chacun une note de mise à jour. Validez votre configuration avec le
nouveau binaire avant de redémarrer le service dessus.

## 🐳 Mettre à jour un conteneur

Rien n'est installé sur l'hôte : une mise à jour se résume à changer de tag et
à tirer l'image. Épinglez la nouvelle version dans le fichier compose :

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

La configuration et le magasin de certificats vivent dans les volumes ; le
nouveau conteneur les retrouve donc là où l'ancien les a laissés. Deux points de
vigilance :

- **Un conteneur qui publie le port 80 ne peut pas démarrer tant que le service
  systemd tourne.** Arrêtez l'un des deux : `sudo pc service stop`, ou changez
  le port publié côté conteneur.
- **`latest` suit la version la plus récente.** Épinglez une version en
  production, pour qu'une mise à jour soit une décision et non l'effet de bord
  d'un `pull`.

## ⏪ Revenir à une version antérieure

Quand une nouvelle version doit être retirée, récupérez la précédente sur l'hôte
de publication, vérifiez-la avec l'empreinte que cette version a publiée, et
mettez-la à la place du binaire :

```bash
mkdir -p /tmp/rollback && cd /tmp/rollback
version=0.2.0-rc.2
base="https://releases.pingclair.com/pingclair/releases/$version"
curl -fsSL "$base/release.json" -o release.json
tarball=pingclair-linux-x86_64.tar.gz
expected="$(jq -r ".assets[] | select(.name == \"$tarball\") | .digest" release.json | sed 's/^sha256://')"
curl -fsSLO "$base/$tarball"
printf '%s  %s\n' "$expected" "$tarball" | sha256sum -c -
mkdir -p extract && tar -xzf "$tarball" -C extract
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

Validez ensuite la configuration avec la version rétablie, car une directive que
l'ancienne version n'implémente pas est refusée par son nom plutôt qu'ignorée :

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

Ensuite, `systemctl status pingclair` répond `Unit pingclair.service could not
be found`, la commande a disparu et plus rien n'écoute sur le port 80. Ce qui
reste sur le disque, ce sont vos données, et c'est voulu :

```text
/etc/Pingclair/Pingclairfile      the configuration, still valid
/var/lib/pingclair/.local/share/pingclair          issued certificates and ACME state
/var/lib/pingclair/html           the placeholder site
/var/log/pingclair                a log sink's directory
```

Conservez `/var/lib/pingclair/.local/share/pingclair` si vous prévoyez de
réinstaller : les certificats et la racine interne sont préservés, et les
clients qui font confiance à cette racine continuent de fonctionner. Supprimez
tout, y compris le compte de service, quand l'hôte en a fini avec Pingclair :

```bash
sudo rm -rf /etc/Pingclair /var/lib/pingclair /var/log/pingclair
sudo userdel pingclair
```

## ⚠️ Quand cela se passe mal

- **L'installateur a installé une version inattendue.** Il prend toujours le tag
  de la version la plus récente. Vérifiez avec `pingclair version`, et revenez
  en arrière comme ci-dessus s'il vous fallait une version précise.
- **Le service ne démarre plus après une mise à jour.** Lisez
  `sudo pingclair validate /etc/Pingclair/Pingclairfile`. Une directive que la
  nouvelle version refuse échoue de manière fermée, avec son nom et
  l'alternative ; le journal nomme donc la ligne à modifier.
- **Un conteneur s'arrête aussitôt.** `docker logs <container>` en donne la
  raison. Les causes habituelles sont un `/etc/pingclair/Pingclairfile` absent du
  répertoire de configuration monté, ou un port déjà utilisé sur l'hôte.
- **Les clients rejettent le certificat après une reconstruction du magasin.**
  Si l'autorité interne a été régénérée, l'ancienne racine ne signe plus rien.
  Installez la nouvelle avec
  `sudo PINGCLAIR_TLS_STORE=/var/lib/pingclair/.local/share/pingclair pingclair trust`.

## 🧭 Étapes suivantes

- [Installation](/fr/start/install/) : l'arborescence que cette page conserve ou
  supprime.
- [Exécution comme service](/fr/start/service/) : l'unité qu'une mise à jour
  réécrit.
- [État du projet](/fr/project/status/) : ce que la version courante prend en
  charge et ce qu'elle refuse.
