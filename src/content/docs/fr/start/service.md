---
title: Exécution comme service
h1_emoji: '🔁'
sidebar:
  order: 4
description: Ce que fait l'unité systemd installée, comment la démarrer, l'arrêter et la recharger, où vont les journaux, et à quoi ressemble de l'extérieur une configuration en échec.
---

L'installateur laisse une unité `systemd` activée et en cours d'exécution.
Cette page lit cette unité ligne par ligne, montre comment la piloter et décrit
les deux formes d'échec telles qu'elles apparaissent de l'extérieur : un serveur
qui refuse de démarrer, et une configuration que le serveur en cours
d'exécution refuse.

## 🧾 Ce que fait l'unité

```bash
systemctl cat pingclair
```

Les clés qui comptent sont les suivantes :

```text
[Service]
Type=notify
NotifyAccess=main
User=pingclair
Group=pingclair
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
Environment="RUST_LOG=info"
ExecStart=/usr/local/bin/pingclair run /etc/Pingclair/Pingclairfile
ExecReload=/bin/kill -USR1 $MAINPID
WorkingDirectory=/var/lib/pingclair
Restart=on-failure
RestartPreventExitStatus=1
RestartSec=5s
LimitNOFILE=1048576
LimitNPROC=512
ProtectSystem=full
PrivateTmp=true
NoNewPrivileges=true
```

Dans l'ordre :

- `Type=notify` et `NotifyAccess=main` : le serveur prévient `systemd` quand ses
  écouteurs sont liés, si bien que `systemctl start` attend que le proxy puisse
  répondre, et pas seulement que le processus existe.
- `User=pingclair` avec `AmbientCapabilities=CAP_NET_BIND_SERVICE` : le serveur
  s'exécute sans privilèges et peut tout de même écouter sur les ports 80
  et 443.
- `PINGCLAIR_TLS_STORE` est volontairement absent. Le répertoire personnel du
  compte de service est `/var/lib/pingclair`, donc les certificats se trouvent
  dans `/var/lib/pingclair/.local/share/pingclair` : c'est la valeur par défaut
  du binaire, le répertoire que l'installateur crée et vers lequel il migre, et
  le chemin qu'affiche `pingclair environ`. Nommer un magasin ici donnerait une
  seconde réponse à une question qui en a déjà une.
- Aucun `ExecStartPre` n'exécute volontairement `validate`. Cela semble l'endroit
  sûr pour ce contrôle, et c'est justement le piège : `systemd` applique
  `RestartPreventExitStatus=` au processus principal, pas à une pré-commande en
  échec, si bien qu'une configuration refusée par le compilateur était retentée
  toutes les cinq secondes au lieu de laisser l'unité en échec. Le serveur
  compile lui-même le fichier avant de lier quoi que ce soit et sort avec le
  code 1 s'il le refuse, code pour lequel la politique de redémarrage ci-dessus
  a été écrite : `pingclair run` existe pour être ce processus.
- `ExecReload` envoie `SIGUSR1`, le signal que le serveur interprète comme
  « relire le fichier ». `SIGHUP` est volontairement ignoré, et une unité qui
  l'envoyait signalait un succès pendant que l'ancienne configuration restait
  en service ([issue #66](https://github.com/dorianverlaine/pingclair/issues/66)).
  Comme `systemd` ne peut observer que la sortie de `kill`, le serveur publie
  sur la ligne d'état de l'unité ce qu'il a fait du fichier (`Serving (reloaded
  1 listener(s) in 323.341µs)`, ou `Reload rejected: …`), que `systemctl status`
  affiche. La [section sur le rechargement](#-ce-que-signifie-un-rechargement)
  ci-dessous en donne la version longue.
- `Restart=on-failure` avec `RestartPreventExitStatus=1` et `RestartSec=5s` : le
  code de sortie 1 signifie que la configuration ou le magasin de certificats
  est inutilisable, donc l'unité reste `failed` pour qu'un opérateur s'en
  occupe, au lieu d'être relancée toutes les cinq secondes. Tout autre échec
  provoque un redémarrage.
- `ProtectSystem=full`, `PrivateTmp`, `NoNewPrivileges`, `LimitNPROC` et
  `LimitNOFILE` : le serveur reçoit la vue du système de fichiers et les limites
  de processus dont il a besoin, et rien de plus.

Les deux voies d'installation écrivent ce même fichier. La commande en une ligne
embarque une copie octet pour octet de `scripts/pingclair.service` (`just
repo-lint` échoue quand les deux divergent), si bien qu'une installation neuve
par `curl | bash` et une installation depuis un clone produisent la même unité,
et `systemd-analyze verify /etc/systemd/system/pingclair.service` ne signale
rien sur cette unité dans les deux cas.

## 🎛️ Piloter le service

`pc service` enveloppe `systemctl` pour cette unité ; les deux sont donc
interchangeables :

| Tâche | Avec `pc` | Avec `systemctl` |
| --- | --- | --- |
| Démarrer | `sudo pc service start` | `sudo systemctl start pingclair` |
| Arrêter | `sudo pc service stop` | `sudo systemctl stop pingclair` |
| Recharger la configuration | `sudo pc service reload` | `sudo systemctl reload pingclair` |
| Redémarrer, après une modification d'écouteur ou de portée globale | `sudo pc service restart` | `sudo systemctl restart pingclair` |
| État | `pc service status` | `systemctl status pingclair` |
| Suivre le journal | — | `journalctl -u pingclair -f` |

`pc service status` affiche la vue de l'unité elle-même, y compris la ligne de
disponibilité envoyée par le serveur :

```text
● pingclair.service - Pingclair High-Performance Web Server
     Loaded: loaded (/etc/systemd/system/pingclair.service; enabled; preset: enabled)
     Active: active (running) since Tue 2026-09-22 05:57:21 UTC; 18s ago
       Docs: https://pingclair.com/start/service/
   Main PID: 27630 (pingclair)
     Status: "Serving"
```

## 🔁 Ce que signifie un rechargement

Un `/etc/Pingclair/Pingclairfile` modifié atteint le serveur en cours
d'exécution par un seul signal, que deux commandes savent envoyer.

`SIGUSR1` est le signal de rechargement, et il n'exige aucune configuration
particulière :

```bash
sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"
```

`pc service reload` (ou `sudo systemctl reload pingclair`, qui revient au même)
envoie ce signal pour vous. L'`ExecReload` de l'unité est
`/bin/kill -USR1 $MAINPID`, si bien que la commande évidente est désormais celle
qui fonctionne ; une unité qui envoyait `SIGHUP` signalait un succès sans rien
appliquer, comme l'a consigné
[l'issue #66](https://github.com/dorianverlaine/pingclair/issues/66).

`pingclair reload` atteint le même code par l'API d'administration et rapporte
l'avis du serveur sur le fichier, ce qui exige l'option `admin` dans le bloc
d'options globales :

```text
✅ Configuration reloaded successfully
```

```text
Error: ❌ Reload failed (400): HTTP/1.1 400 Bad Request
```

`systemctl reload` ne peut rapporter qu'une chose : que `kill` a remis le
signal. Le serveur lit le fichier ensuite, donc son verdict va sur la ligne
d'état de l'unité et dans le journal. `pc service reload` le dit, au lieu
d'affirmer que la configuration a été appliquée :

```text
$ sudo pc service reload
✅ Reload signal delivered to pingclair.service
ℹ️  The result lands a moment later: `systemctl status pingclair`
   or `journalctl -u pingclair -n 20`
$ systemctl status pingclair --no-pager | grep Status
     Status: "Serving (reloaded 1 listener(s) in 323.341µs)"
```

Quand le serveur en cours d'exécution ne peut pas appliquer ce que demande le
fichier, l'ancienne configuration reste en service et la ligne d'état indique
quelle modification a été refusée. Déplacer le site de `:80` vers `:8080` est le
cas courant, car la topologie des écouteurs est construite avec les sockets au
démarrage :

```text
     Status: "Reload rejected: listener topology changed (added: ["[::]:8080"], removed: ["[::]:80"]); restart Pingclair to rebuild H1, H2, H3, and TLS together"
```

Quelle que soit la voie, une configuration qui ne compile pas laisse la
précédente en service, et le site continue de répondre. Validez d'abord :

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

Les modifications qu'un processus en cours d'exécution ne peut pas absorber
font exception. Les options fixées au démarrage, comme `trusted_proxies`, ne
prennent effet qu'après un redémarrage : `sudo pc service restart`. Une
configuration qui ajoute ou déplace un écouteur est refusée de la même manière
(la ligne d'état nomme les adresses ajoutées et retirées), car un rechargement
applique une politique, pas un nouveau socket d'écoute.

## 🛑 Ce que signifie un arrêt

`systemctl stop` envoie `SIGTERM`. Dans v0.2.0-rc.3, le processus se termine
environ un quart de seconde plus tard, quelle que soit la valeur de
`grace_period` ; une requête encore en cours à cet instant est coupée sans
réponse. Arrêtez ou redémarrez quand une brève interruption est acceptable, et
préférez un rechargement quand seule la configuration du site a changé.

📌 **Prochaine version.** Sur `main`, un arrêt commence par vider le serveur :
`/ready` répond `503`, les écouteurs se ferment, les requêtes en cours se
terminent, et le processus sort quand la dernière est achevée ou quand
`grace_period` (30 secondes par défaut) est écoulé.

## 📜 Journaux

L'unité définit `RUST_LOG=info` et envoie tout au journal :

```bash
sudo journalctl -u pingclair -f
sudo journalctl -u pingclair --since '10 min ago'
```

Le démarrage, les rechargements, le travail sur les certificats et une ligne
d'accès par requête y apparaissent :

```text
INFO pingclair::run: 🚀 Starting Pingclair v0.2.0-rc.3
INFO pingclair::run: 📄 Loaded configuration from: /etc/Pingclair/Pingclairfile
INFO pingclair::run: 🔔 Received SIGUSR1, reloading configuration from: /etc/Pingclair/Pingclairfile
INFO pingclair::run: ✅ Configuration reload completed successfully in 323.341µs
INFO pingclair::run:    📊 1 listener(s) updated
INFO pingclair_proxy::server: 📝 Access request_id="65c09fa25d457-6" method="GET" host="localhost" path="/" status=200 bytes=18747 duration_ms=0 remote_ip=::1 user_agent="curl/8.18.0"
```

Un rechargement refusé par le serveur est journalisé de la même façon, avec la
raison et une note indiquant que rien n'a changé :

```text
ERROR pingclair::run: ❌ Configuration reload rejected after 414.491µs: listener topology changed (added: ["[::]:8080"], removed: ["[::]:80"]); restart Pingclair to rebuild H1, H2, H3, and TLS together kind=RestartRequired
ERROR pingclair::run:    💡 Previous configuration remains active, unchanged
```

Pour un journal distinct, avec rotation, configurez une sortie `log` et
écrivez-la sous `/var/log/pingclair`, que l'installateur crée et attribue à
l'utilisateur du service.

## ⚠️ Quand le service ne démarre pas

- **`is-active` indique `activating` et `NRestarts` ne cesse d'augmenter.**
  L'unité a été écrite par un ancien installateur, qui avait deux défauts. Elle
  portait `Restart=always` sans `RestartPreventExitStatus`, et elle exécutait
  `validate` comme commande `ExecStartPre`, que `RestartPreventExitStatus` ne
  couvre pas : une configuration refusée par le compilateur était retentée
  toutes les cinq secondes et ressemblait à une unité qui ne se stabilise jamais
  plutôt qu'à une unité en échec. L'unité installée porte
  `Restart=on-failure` + `RestartPreventExitStatus=1` et aucune pré-commande, et
  un démarrage refusé laisse `is-active` à `failed` avec `NRestarts` à zéro. Sur
  une ancienne installation, arrêtez la boucle avant de déboguer :
  `sudo systemctl stop pingclair`, corrigez le fichier, puis
  `sudo systemctl reset-failed pingclair`.
- **`Job for pingclair.service failed because the control process exited with
  error code`.** Le serveur a refusé la configuration avant de lier quoi que ce
  soit, et la raison donnée par le compilateur est dans le journal, par exemple
  ``Error: ❌ Configuration Error: Compile error: Unsupported feature: `encode br`: Brotli is not implemented for proxied responses; use `encode zstd gzip` ``.
- **`TLS store /var/lib/pingclair/.local/share/pingclair is not writable: Permission denied`.**
  Le magasin appartient au compte de service. Vérifiez
  `sudo ls -ld /var/lib/pingclair/.local/share/pingclair` ; son propriétaire doit
  être `pingclair`.
- **`systemd-analyze verify` signale `Missing '=', ignoring line` pour l'unité
  installée.** Une ancienne installation en une ligne écrivait une unité dont
  les commentaires avaient été développés par le shell : 25 lignes de sortie
  `--help`, que `systemd` ignore. Réinstaller avec l'installateur actuel écrit
  l'unité telle quelle, et le message disparaît.
- **Rien ne répond alors que l'unité tourne.** Les écouteurs sont liés et les
  requêtes n'arrivent pas. Vérifiez le pare-feu du fournisseur puis celui de
  l'hôte, comme sur la [page d'installation](/fr/start/install/).

## 🧭 Étapes suivantes

- [Mise à jour et désinstallation](/fr/start/upgrade/) : ce qu'une nouvelle
  exécution préserve, et comment tout retirer.
- [HTTPS](/fr/start/https/) : les certificats, dont l'emplacement du magasin et
  la raison pour laquelle `pingclair trust` a besoin de `PINGCLAIR_TLS_STORE`.
- [`log`](/fr/reference/directives/#log) : la sortie de journal d'accès que
  cette page lit dans le journal système.
