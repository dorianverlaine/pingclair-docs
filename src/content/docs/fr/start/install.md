---
title: Installation
h1_emoji: '📦'
sidebar:
  order: 1
description: Installer Pingclair sur un hôte Linux à partir d'un binaire publié, avec Docker ou depuis les sources, puis vérifier que le service répond.
---

Pingclair est distribué sous la forme d'un unique binaire Linux. Cette page
l'installe, montre ce que l'installateur laisse sur la machine et vérifie que le
serveur répond. La version courante est **v0.2.0-rc.3**, une release candidate ;
toutes les pages de ce site décrivent cette version.

## 🧾 Ce qu'il vous faut

- Un hôte Linux `x86_64` ou `aarch64` ; des binaires sont publiés pour les deux.
- `sudo` ou root : l'installateur écrit dans `/usr/local/bin`, `/etc/Pingclair`,
  `/var/lib/pingclair` et `/etc/systemd/system`.
- `systemd` pour l'installation en service. Sur un hôte qui n'en dispose pas,
  utilisez Docker ou lancez le serveur au premier plan ; les deux cas sont
  décrits plus bas.
- Les ports 80 et 443 joignables depuis Internet si vous voulez des certificats
  publics ([HTTPS](/fr/start/https/)). Sur une instance cloud, il faut en
  général aussi les ouvrir dans le pare-feu du fournisseur.

macOS se compile depuis les sources et reste pris en charge pour le
développement, mais ce n'est pas une plateforme de production.

## 📦 Installer depuis un binaire publié

```bash
curl -fsSL https://pingclair.com/install.sh | sudo bash
```

Le script lit le canal de publication sur `releases.pingclair.com`, affiche le
tag qu'il s'apprête à installer et contrôle l'archive avec le SHA-256 que ce
canal publie pour elle : une archive qui ne correspond pas est refusée, jamais
extraite. Si cet hôte est injoignable, il se replie sur l'API des releases
GitHub et sur le fichier de sommes de contrôle publié à côté de l'archive ;
l'installation ne dépend donc pas d'un seul fournisseur. Il crée ensuite
l'utilisateur du service, lui accorde la capacité d'écouter sur les ports bas,
écrit la configuration par défaut, installe l'unité et démarre le service. Une
exécution complète se termine ainsi :

```text
Detected architecture: x86_64
Installing v0.2.0-rc.3 — a release candidate, not a final release.
Downloading https://releases.pingclair.com/pingclair/releases/0.2.0-rc.3/pingclair-linux-x86_64.tar.gz (from releases.pingclair.com)...
✅ sha256 matches the release channel document
Creating system user 'pingclair'...
Setting capabilities...
Configuring directories and assets...
Fetching default landing page...
Creating default Pingclairfile...
Installing Systemd service...
Creating 'pc' symlink...
✅ Installation Complete!
Use pc service status to check the service.
Config: /etc/Pingclair/Pingclairfile
```

Pour utiliser un correctif pas encore publié, compilez plutôt `main` sur
l'hôte :

```bash
curl -fsSL https://pingclair.com/install.sh | sudo bash -s -- --main
```

`--main` clone et compile le serveur sur l'hôte. Il faut Rust 1.98 ou plus
récent, ainsi que la chaîne d'outils C dont BoringSSL et jemalloc ont besoin :
`cmake`, `clang`, `libclang-dev`, `g++` et `git`. Le script installe lui-même
ces paquets sur les systèmes `apt` comme `dnf`. La première compilation prend
plusieurs minutes, car BoringSSL est compilé depuis les sources.

## 🗂️ Ce que l'installateur laisse derrière lui

| Chemin | Contenu |
| --- | --- |
| `/usr/local/bin/pingclair` | Le binaire du serveur. |
| `/usr/local/bin/pc` | Un lien symbolique vers le même binaire, pour la forme courte. |
| `/etc/Pingclair/Pingclairfile` | La configuration exécutée par le service. |
| `/etc/Pingclair/Pingclairfile.example` | Un exemple commenté, jamais écrasé par une mise à jour. |
| `/var/lib/pingclair/.local/share/pingclair` | Le magasin de certificats : le répertoire de données de l'utilisateur du service, là où le binaire cherche par défaut. |
| `/var/lib/pingclair/html` | Le site d'attente servi sur le port 80. |
| `/var/log/pingclair` | L'emplacement où écrit une sortie `log`, une fois configurée. |
| `/etc/systemd/system/pingclair.service` | L'unité, activée et en cours d'exécution. |

Le service répond déjà quand le script se termine. Il exécute la configuration
d'attente, assez courte pour tenir sur un écran :

```caddyfile
# 🦀 Pingclair default configuration file
# Management commands: pc service <start|stop|reload|status>

:80 {
    # Welcome page
    file_server /var/lib/pingclair/html
}
```

L'utilisateur du service et le magasin de certificats ne sont créés que s'ils
manquent, et un `/etc/Pingclair/Pingclairfile` existant n'est jamais remplacé.
C'est ce qui fait d'une nouvelle exécution de l'installateur une mise à jour, et
non une remise à zéro ([Mise à jour et désinstallation](/fr/start/upgrade/)).

## ✅ Vérifier l'installation

Demandez sa version au binaire :

```bash
pingclair version
```

```text
v0.2.0-rc.3
```

`pc` est le même binaire, donc `pc version` affiche la même chaîne. Demandez
ensuite l'avis de `systemd` :

```bash
pc service status
```

```text
● pingclair.service - Pingclair High-Performance Web Server
     Loaded: loaded (/etc/systemd/system/pingclair.service; enabled; preset: enabled)
     Active: active (running) since Tue 2026-09-22 03:21:55 UTC; 42s ago
       Docs: https://pingclair.com/start/service/
   Main PID: 27630 (pingclair)
     Status: "Serving"
      Tasks: 12 (limit: 627)
     Memory: 8.2M (peak: 8.5M)
```

`Status: "Serving"` provient du serveur lui-même, et non de `systemd` qui
constaterait simplement qu'un processus est vivant : l'unité est de type
`notify`, et le serveur ne se déclare prêt qu'une fois tous ses écouteurs liés.

Enfin, interrogez le serveur :

```bash
curl -i http://localhost/
```

```text
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Content-Length: 18747
Last-Modified: Tue, 22 Sep 2026 03:21:54 GMT
ETag: "493b-6ab1f452"
Vary: Accept-Encoding
Accept-Ranges: bytes
server: Pingclair
```

Un `200` accompagné de `ETag` et `Last-Modified` signifie que le serveur de
fichiers a répondu ; le corps est la page d'attente de `/var/lib/pingclair/html`.

## 🐳 Docker

L'image publiée fonctionne en mode fichier de configuration : son point d'entrée
est `pingclair` et sa commande par défaut `run /etc/pingclair/Pingclairfile`.
L'image déclare `/etc/pingclair` et `/var/lib/pingclair` comme volumes, et
expose les ports 80 et 443.

```yaml
services:
  pingclair:
    image: ghcr.io/dorianverlaine/pingclair:v0.2.0-rc.3
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp" # HTTP/3
    volumes:
      - ./conf:/etc/pingclair:ro
      - ./site:/srv:ro
      - pingclair_tls:/var/lib/pingclair

volumes:
  pingclair_tls:
```

```bash
mkdir -p conf site
printf ':80 {\n    file_server /srv\n}\n' > conf/Pingclairfile
echo '<h1>hello from the container</h1>' > site/index.html
docker compose up -d
curl -i http://localhost/
```

Trois points sont faciles à manquer :

- **N'ajoutez pas de `command:`.** La commande par défaut de l'image est déjà
  `run /etc/pingclair/Pingclairfile`, et la redéfinir la remplace.
- **Montez tout `/var/lib/pingclair`, pas seulement le répertoire des
  certificats.** Le magasin conserve un état à côté des certificats, et un
  conteneur recréé avec un montage partiel perd cet état.
- **Épinglez un tag publié.** `latest` suit la version la plus récente ; en
  production, nommez la version, comme le fait l'exemple. Les tags publiés sont
  listés sur la
  [page du paquet](https://github.com/dorianverlaine/pingclair/pkgs/container/pingclair).

Sur un hôte où votre utilisateur n'appartient pas au groupe `docker`, préfixez
les commandes par `sudo`, ou rejoignez le groupe une fois pour toutes avec
`sudo usermod -aG docker "$USER"` puis ouvrez une nouvelle session. Sous Ubuntu,
le plugin `docker compose` est fourni par le paquet `docker-compose-v2`.

## 🛠️ Compiler depuis les sources

```bash
git clone https://github.com/dorianverlaine/pingclair
cd pingclair
cargo build --release
```

Prérequis : Rust 1.98.1 (la version épinglée par la CI), `cmake`, `clang`,
`libclang-dev`, `g++` et `git`. BoringSSL est compilé depuis les sources pendant
la compilation, si bien que la première prend plusieurs minutes.

## ⚠️ Quand l'installation échoue

- **`This script must be run as root`.** Le script écrit hors de votre
  répertoire personnel et installe une unité. Relancez-le avec `sudo`.
- **`setcap: command not found` sous Fedora.** La commande vient du paquet
  `libcap`. L'installateur l'ajoute, mais un hôte préparé à la main peut en être
  dépourvu, et sans cette capacité le service ne peut pas écouter sur les
  ports 80 et 443.
- **`Job for pingclair.service failed` juste après l'installation.** Lisez
  `journalctl -u pingclair -n 20`. Les causes habituelles sont une configuration
  qui ne passe pas la validation, ou un autre processus déjà à l'écoute sur le
  port 80.
- **Le service tourne mais rien ne répond depuis l'extérieur.** Les écouteurs
  sont liés et les paquets n'arrivent jamais. Vérifiez d'abord le pare-feu ou le
  groupe de sécurité du fournisseur, puis les règles de l'hôte lui-même.
- **L'hôte n'a pas `systemd`.** Le binaire est installé et utilisable, mais
  l'étape de service de l'installateur ne peut pas s'exécuter. Utilisez Docker,
  ou `pingclair run`.

## 🧹 Le désinstaller

[Mise à jour et désinstallation](/fr/start/upgrade/) décrit le démontage et
nomme les répertoires qui contiennent des données à conserver.

## 🧭 Étapes suivantes

- [Démarrage rapide](/fr/start/quickstart/) : remplacer la page d'attente par
  votre propre configuration et servir un vrai site.
- [HTTPS](/fr/start/https/) : des certificats pour un nom public.
- [Exécution comme service](/fr/start/service/) : ce que fait l'unité et comment la
  recharger sans risque.
