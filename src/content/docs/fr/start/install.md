---
title: Installation
h1_emoji: '📦'
sidebar:
  order: 1
description: Installer Pingclair sur un hôte Linux depuis un binaire de version, avec Docker, ou depuis les sources, et vérifier que le service répond.
---

Pingclair est distribué comme un unique binaire Linux. Cette page l'installe,
montre ce que l'installateur a laissé derrière lui et vérifie que le serveur
répond. La version courante est **v0.2.0-rc.3**, une release candidate, et
toutes les pages de ce site décrivent cette version.

## 🧾 Ce qu'il faut

- Un hôte Linux en `x86_64` ou `aarch64` ; des binaires de version existent pour
  les deux.
- `sudo` ou root : l'installateur écrit dans `/usr/local/bin`, `/etc/Pingclair`,
  `/var/lib/pingclair` et `/etc/systemd/system`.
- `systemd` pour le chemin du service. Sur un hôte qui n'en a pas, utilisez
  Docker ou lancez le serveur au premier plan ; les deux sont traités plus bas.
- Les ports 80 et 443 joignables depuis Internet si vous voulez des certificats
  publics ([HTTPS](/fr/start/https/)). Sur une instance cloud, cela suppose
  généralement de les ouvrir aussi dans le pare-feu du fournisseur.

La compilation depuis les sources sous macOS est prise en charge pour le
développement. macOS n'est pas une plateforme de distribution.

## 📦 Installation depuis un binaire de version

```bash
curl -fsSL https://raw.githubusercontent.com/dorianverlaine/pingclair/main/scripts/install.sh | sudo bash
```

Le script interroge l'API des releases GitHub pour connaître le tag le plus
récent, affiche le tag qu'il s'apprête à installer, vérifie la somme SHA-256
publiée de l'archive et refuse une archive qui ne correspond pas. Il crée ensuite
l'utilisateur de service, lui accorde la capacité de se lier aux ports bas, écrit
la configuration par défaut, installe l'unité et démarre le service. Une
exécution complète se termine ainsi :

```text
Detected architecture: x86_64
Fetching latest release from dorianverlaine/pingclair...
Installing v0.2.0-rc.3 — a release candidate, not a final release.
Downloading https://github.com/dorianverlaine/pingclair/releases/download/v0.2.0-rc.3/pingclair-linux-x86_64.tar.gz...
pingclair-linux-x86_64.tar.gz: OK
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

Installez `main` plutôt que le binaire de version lorsqu'il vous faut un
correctif non publié :

```bash
curl -fsSL https://raw.githubusercontent.com/dorianverlaine/pingclair/main/scripts/install.sh | sudo bash -s -- --main
```

`--main` clone et compile le serveur sur l'hôte. Il exige Rust 1.98 ou plus
récent ainsi que la chaîne d'outils C dont BoringSSL et jemalloc ont besoin :
`cmake`, `clang`, `libclang-dev`, `g++` et `git`. Le script installe lui-même
ces paquets sur les systèmes `apt` comme `dnf`. La première compilation prend
plusieurs minutes, car BoringSSL est compilé depuis les sources.

## 🗂️ Ce que l'installateur a laissé derrière lui

| Chemin | Contenu |
| --- | --- |
| `/usr/local/bin/pingclair` | Le binaire du serveur. |
| `/usr/local/bin/pc` | Un lien symbolique vers le même binaire, pour la forme courte. |
| `/etc/Pingclair/Pingclairfile` | La configuration que le service exécute. |
| `/etc/Pingclair/Pingclairfile.example` | Un exemple commenté, jamais écrasé par une mise à jour. |
| `/var/lib/pingclair/certs` | Le magasin de certificats, nommé par `PINGCLAIR_TLS_STORE` dans l'unité. |
| `/var/lib/pingclair/html` | Le site d'attente servi sur le port 80. |
| `/var/log/pingclair` | Là où une destination `log` écrit dès que vous en configurez une. |
| `/etc/systemd/system/pingclair.service` | L'unité, activée et démarrée. |

Le service sert déjà quand le script se termine. La configuration qu'il exécute
est celle d'attente, et elle tient sur un écran :

```caddyfile
# 🦀 Pingclair default configuration file
# Management commands: pc service <start|stop|reload|status>

:80 {
    # Welcome page
    file_server /var/lib/pingclair/html
}
```

L'utilisateur de service et le magasin de certificats ne sont créés que
s'ils manquent, et un `/etc/Pingclair/Pingclairfile` existant n'est jamais
remplacé. C'est ce qui fait d'une réexécution de l'installateur une mise à jour
plutôt qu'une remise à zéro ([Mise à jour et désinstallation](/fr/start/upgrade/)).

## ✅ Vérifier l'installation

Demandez sa version au binaire :

```bash
pingclair version
```

```text
v0.2.0-rc.3
```

`pc` est le même binaire : `pc version` affiche la même chaîne. Demandez ensuite
à `systemd` ce qu'il en pense :

```bash
pc service status
```

```text
● pingclair.service - Pingclair High-Performance Web Server
     Loaded: loaded (/etc/systemd/system/pingclair.service; enabled; preset: enabled)
     Active: active (running) since Tue 2026-09-22 03:21:55 UTC; 42s ago
       Docs: https://github.com/dorianverlaine/pingclair
   Main PID: 1808 (pingclair)
     Status: "Serving"
      Tasks: 12 (limit: 627)
     Memory: 8.2M (peak: 8.5M)
```

`Status: "Serving"` vient du serveur lui-même, et non de `systemd` qui
constaterait qu'un processus est encore vivant : l'unité est de type `notify`,
et le serveur signale qu'il est prêt seulement une fois tous ses écouteurs liés.

Demandez enfin au serveur :

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

Un `200` avec `ETag` et `Last-Modified` signifie que le serveur de fichiers a
répondu, et le corps est la page d'attente de `/var/lib/pingclair/html`.

## 🐳 Docker

L'image publiée s'exécute en mode fichier de configuration : son entrypoint est
`pingclair` et sa commande par défaut est `run /etc/pingclair/Pingclairfile`.
L'image déclare `/etc/pingclair` et `/var/lib/pingclair` comme volumes et expose
les ports 80 et 443.

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

Trois points sont faciles à manquer :

- **N'ajoutez pas de `command:`.** La commande par défaut de l'image est déjà
  `run /etc/pingclair/Pingclairfile`, et la redéfinir remplace cette commande.
- **Ne montez pas `/var/lib/pingclair/certs` seul.** Le magasin conserve de
  l'état à côté du répertoire des certificats, et un conteneur recréé avec
  seulement `certs` monté le perd. Montez `/var/lib/pingclair`.
- **Épinglez un tag publié.** `latest` suit la version la plus récente ; la
  production doit nommer la version, comme dans l'exemple. Les tags publiés sont
  listés sur la
  [page du paquet](https://github.com/dorianverlaine/pingclair/pkgs/container/pingclair).

Sur un hôte où votre utilisateur n'est pas dans le groupe `docker`, préfixez les
commandes par `sudo`, ou rejoignez le groupe une fois avec
`sudo usermod -aG docker "$USER"` puis ouvrez une nouvelle session. Sur Ubuntu,
le plugin `docker compose` vient du paquet `docker-compose-v2`.

## 🛠️ Compilation depuis les sources

```bash
git clone https://github.com/dorianverlaine/pingclair
cd pingclair
cargo build --release
```

Prérequis : Rust 1.98.1 (la version épinglée par la CI), `cmake`, `clang`,
`libclang-dev`, `g++` et `git`. BoringSSL est compilé depuis les sources pendant
la compilation, la première compilation prend donc plusieurs minutes.

## ⚠️ Quand l'installation échoue

- **`This script must be run as root`.** Le script écrit en dehors de votre
  répertoire personnel et installe une unité. Relancez-le avec `sudo`.
- **`setcap: command not found` sous Fedora.** C'est le paquet `libcap`.
  L'installateur l'ajoute, mais un hôte monté à la main peut en manquer, et sans
  cette capacité le service ne peut pas se lier aux ports 80 et 443.
- **`Job for pingclair.service failed` juste après l'installation.** Lisez
  `journalctl -u pingclair -n 20`. Les causes habituelles sont une configuration
  qui ne passe pas la validation, ou un autre programme déjà à l'écoute sur le
  port 80.
- **Le service tourne mais rien ne répond de l'extérieur.** Les écouteurs sont
  liés et les paquets n'arrivent pas. Vérifiez d'abord le pare-feu ou le groupe
  de sécurité du fournisseur, puis les règles de l'hôte.
- **L'hôte n'a pas `systemd`.** Le binaire est installé et utilisable, mais
  l'étape de service de l'installateur ne peut pas s'exécuter. Utilisez Docker,
  ou `pingclair run`.

## 🧹 Le désinstaller

[Mise à jour et désinstallation](/fr/start/upgrade/) détaille le démontage et
nomme les répertoires qui contiennent des données à conserver.

## 🧭 Étapes suivantes

- [Démarrage rapide](/fr/start/quickstart/) : remplacer la page d'attente par
  votre propre configuration et servir un vrai site.
- [HTTPS](/fr/start/https/) : des certificats pour un nom public.
- [Exécution comme service](/fr/start/service/) : ce que fait l'unité et
  comment la recharger sans risque.
