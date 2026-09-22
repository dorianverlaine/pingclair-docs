---
title: Exécution comme service
h1_emoji: '🔁'
sidebar:
  order: 4
description: Ce que fait l'unité systemd installée, comment la démarrer, l'arrêter et la recharger, où vont les journaux, et à quoi ressemble une configuration en échec vue de l'extérieur.
---

L'installateur laisse une unité `systemd` activée et démarrée. Cette page lit
cette unité ligne par ligne, montre comment la piloter, et décrit les deux formes
d'échec telles qu'on les voit de l'extérieur : un serveur qui ne démarre pas et
une configuration que le serveur en cours refuse.

## 🧾 Ce que fait l'unité

```bash
systemctl cat pingclair
```

Les clés qui comptent sont celles-ci :

```text
[Service]
Type=notify
NotifyAccess=main
User=pingclair
Group=pingclair
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
Environment="RUST_LOG=info"
Environment="PINGCLAIR_TLS_STORE=/var/lib/pingclair/certs"
ExecStartPre=/usr/local/bin/pingclair validate /etc/Pingclair/Pingclairfile
ExecStart=/usr/local/bin/pingclair run /etc/Pingclair/Pingclairfile
ExecReload=/bin/kill -HUP $MAINPID
WorkingDirectory=/var/lib/pingclair
Restart=always
RestartSec=5s
LimitNOFILE=1048576
```

Lisez-les dans l'ordre :

- `Type=notify` et `NotifyAccess=main` : le serveur prévient `systemd` quand ses
  écouteurs sont liés, donc `systemctl start` bloque jusqu'à ce que le proxy
  puisse répondre, et non jusqu'à ce que le processus existe.
- `User=pingclair` avec `AmbientCapabilities=CAP_NET_BIND_SERVICE` : le serveur
  tourne sans privilèges et peut tout de même se lier aux ports 80 et 443.
- `PINGCLAIR_TLS_STORE` : les certificats vivent dans
  `/var/lib/pingclair/certs`. Le compte de service n'a pas de répertoire
  personnel ; laisser la valeur par défaut du binaire enverrait le magasin vers
  un `$HOME` inexistant.
- `ExecStartPre` exécute `validate` avant chaque démarrage. Une configuration qui
  ne compile pas n'atteint jamais le serveur.
- `ExecReload` envoie `SIGHUP`, que le serveur ignore : `systemctl reload` — et
  `pc service reload`, qui l'enveloppe — annonce un succès et ne change rien
  ([issue #66](https://github.com/dorianverlaine/pingclair/issues/66)). Le signal
  qui recharge est `SIGUSR1`.
- `Restart=always` avec `RestartSec=5s` : un démarrage en échec est retenté
  toutes les cinq secondes. Voir les modes d'échec plus bas, car c'est le
  réglage qui surprend.

⚠️ L'installation par `curl | bash` écrit une copie réduite de l'unité. Le
fichier `scripts/pingclair.service` du dépôt ajoute un durcissement
(`ProtectSystem=full`, `PrivateTmp`, `NoNewPrivileges`, `LimitNPROC`) et une
politique de redémarrage différente (`Restart=on-failure` avec
`RestartPreventExitStatus=1`). Pour utiliser cette unité plus stricte :

```bash
git clone https://github.com/dorianverlaine/pingclair
sudo cp pingclair/scripts/pingclair.service /etc/systemd/system/pingclair.service
sudo systemctl daemon-reload
sudo systemctl restart pingclair
```

## 🎛️ Piloter le service

`pc service` enveloppe `systemctl` pour cette unité : les deux sont
interchangeables.

| Tâche | Avec `pc` | Avec `systemctl` |
| --- | --- | --- |
| Démarrer | `sudo pc service start` | `sudo systemctl start pingclair` |
| Arrêter | `sudo pc service stop` | `sudo systemctl stop pingclair` |
| Redémarrer | `sudo pc service restart` | `sudo systemctl restart pingclair` |
| Recharger la configuration | — | `sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"` |
| Recharger, tel qu'installé (ne fait rien) | `sudo pc service reload` | `sudo systemctl reload pingclair` |
| État | `pc service status` | `systemctl status pingclair` |
| Suivre le journal | — | `journalctl -u pingclair -f` |

`pc service status` affiche la vue de l'unité, y compris la ligne de disponibilité
envoyée par le serveur :

```text
● pingclair.service - Pingclair High-Performance Web Server
     Loaded: loaded (/etc/systemd/system/pingclair.service; enabled; preset: enabled)
     Active: active (running)
    Process: 1805 ExecStartPre=/usr/local/bin/pingclair validate /etc/Pingclair/Pingclairfile (code=exited, status=0/SUCCESS)
   Main PID: 1808 (pingclair)
     Status: "Serving"
```

## 🔁 Ce que signifie un rechargement

Deux commandes appliquent une configuration modifiée, et une troisième, qui en a
l'air, ne fait rien du tout.

`SIGUSR1` est le signal de rechargement. Il n'exige aucune configuration :

```bash
sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"
```

`pingclair reload` atteint le même code par l'Admin API et rapporte ce que le
serveur a pensé du fichier, ce qui exige l'option `admin` du bloc des options
globales :

```text
✅ Configuration reloaded successfully
```

```text
Error: ❌ Reload failed (400): HTTP/1.1 400 Bad Request
```

`pc service reload` a l'air de la commande évidente et c'est celle qui ne fait
rien : l'`ExecReload` de l'unité installée envoie `SIGHUP`, et le serveur ignore
ce signal, donc la commande annonce un succès pendant que l'ancienne
configuration continue de servir. Mesuré sur cette unité : avec
`x-version: four` en service et `five` écrit dans le fichier, `pc service reload`
a répondu `✅ Service reloaded successfully` et l'en-tête est resté `four` ; la
même modification appliquée par `SIGUSR1` ou `pingclair reload` a pris effet
immédiatement ([issue #66](https://github.com/dorianverlaine/pingclair/issues/66)).

Quelle que soit la voie choisie, une configuration qui ne compile pas laisse la
précédente en service, et le serveur ne journalise pas ce refus. Validez d'abord :

```bash
sudo pingclair validate /etc/Pingclair/Pingclairfile
```

La politique valable pour tout le processus fait exception. Les options établies
au démarrage, comme `trusted_proxies`, ne prennent effet qu'après un redémarrage :
`sudo pc service restart`. Une configuration qui ajoute ou déplace un écouteur
exige elle aussi un redémarrage : le rechargement applique la politique, pas un
nouveau socket d'écoute.

## 📜 Journaux

L'unité fixe `RUST_LOG=info` et envoie tout au journal :

```bash
sudo journalctl -u pingclair -f
sudo journalctl -u pingclair --since '10 min ago'
```

Le démarrage, les rechargements, le travail sur les certificats et une ligne
d'accès par requête y apparaissent :

```text
INFO pingclair::run: 🚀 Starting Pingclair v0.2.0-rc.3
INFO pingclair::run: 📄 Loaded configuration from: /etc/Pingclair/Pingclairfile
INFO pingclair_proxy::server: ♻️ Configuration reloaded successfully
INFO pingclair_proxy::server: 📝 Access request_id="65c09fa25d457-6" method="GET" host="localhost" path="/" status=200 bytes=18747 duration_ms=0 remote_ip=::1 user_agent="curl/8.18.0"
```

Pour un journal à part, avec rotation, configurez une destination `log` et
écrivez-la sous `/var/log/pingclair`, que l'installateur crée et attribue à
l'utilisateur de service.

## ⚠️ Quand le service ne démarre pas

- **`is-active` affiche `activating` et `NRestarts` ne cesse d'augmenter.** C'est
  la politique de redémarrage installée à l'œuvre : `Restart=always` réessaie
  toutes les cinq secondes, donc une configuration cassée ressemble à une unité
  qui ne se stabilise jamais plutôt qu'à une unité en échec. Arrêtez la boucle
  avant de déboguer : `sudo systemctl stop pingclair`, corrigez le fichier, puis
  `sudo systemctl reset-failed pingclair`.
- **`Job for pingclair.service failed because the control process exited with
  error code`.** `ExecStartPre` a refusé la configuration et la raison du
  compilateur est dans le journal, par exemple
  `Error: ❌ Configuration Error: Compile error: Unsupported feature: 'encode br': Brotli is not implemented for proxied responses; use 'encode zstd gzip'`.
- **`TLS store /var/lib/pingclair/certs is not writable: Permission denied`.** Le
  magasin appartient au compte de service. Vérifiez
  `sudo ls -ld /var/lib/pingclair/certs` : il doit appartenir à `pingclair`.
- **`systemd-analyze verify` signale `Missing '=', ignoring line` pour l'unité
  installée.** La copie réduite écrite par l'installateur contient des lignes
  parasites issues d'une substitution du shell, et `systemd` les ignore.
  Installer le `scripts/pingclair.service` du dépôt les supprime.
- **Rien ne répond alors que l'unité tourne.** Les écouteurs sont liés et les
  requêtes n'arrivent pas. Vérifiez le pare-feu du fournisseur puis celui de
  l'hôte, comme sur la [page d'installation](/fr/start/install/).

## 🧭 Étapes suivantes

- [Mise à jour et désinstallation](/fr/start/upgrade/) : ce qu'une réexécution
  conserve, et comment tout retirer.
- [HTTPS](/fr/start/https/) : les certificats, où vit le magasin, et pourquoi
  `pingclair trust` a besoin de `PINGCLAIR_TLS_STORE`.
- [`log`](/fr/reference/directives/#log) : la destination de journal d'accès que
  cette page lit depuis le journal système.
