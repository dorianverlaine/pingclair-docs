---
title: Démarrage rapide
h1_emoji: '🏃'
sidebar:
  order: 2
description: Écrire un premier Pingclairfile, le valider, l'exécuter au premier plan ou en arrière-plan, et servir un vrai répertoire.
---

Cette page mène d'un hôte installé à un serveur que vous maîtrisez : une
configuration sur disque, une compilation validée, un serveur que vous pouvez
démarrer, arrêter et observer, et une vérification qui prouve que le serveur de
fichiers a répondu. Elle suppose l'[installation](/fr/start/install/) terminée.

## 🧾 Avant de commencer

L'installateur a laissé un service à l'écoute sur le port 80, qui exécute la
configuration de `/etc/Pingclair/Pingclairfile`. Arrêtez-le le temps de vos
essais pour libérer les ports :

```bash
sudo pc service stop
```

```bash
mkdir -p ~/demo/public
cd ~/demo
echo '<h1>hello from ~/demo/public</h1>' > public/index.html
```

## 1. ✍️ Écrire une configuration

Créez `~/demo/Pingclairfile` :

```caddyfile
{
    admin 127.0.0.1:2019
}

http://localhost:8080 {
    file_server ./public
}
```

Trois détails comptent :

- Le bloc sans nom en tête contient les options globales. `admin` ouvre l'API
  d'administration, par laquelle `pingclair start`, `stop` et `reload`
  joignent le serveur en cours d'exécution.
- Le schéma `http://` dans l'adresse du site impose le texte clair. Sans lui,
  Pingclair traite `localhost` comme un nom, sert HTTPS avec un certificat de sa
  propre autorité, et un client HTTP en clair reçoit une réponse vide
  ([HTTPS](/fr/start/https/)).
- La racine de `file_server` est relative au répertoire de travail.

## 2. ✅ Valider avant d'exécuter

```bash
pingclair validate
```

```text
✅ Configuration 'Pingclairfile' is valid!
```

`validate` lit `./Pingclairfile` par défaut et détecte aussi `./Caddyfile`. Il
compile la configuration et applique des contrôles sémantiques, par exemple
l'existence des chemins de certificats. La validation n'est pas indicative :
une configuration refusée ne s'exécute pas, et la dernière ligne affichée en
donne la raison.

## 3. 🧭 Lire ce que devient la configuration

```bash
pingclair adapt --pretty
```

```text
{
  "debug": false,
  "servers": [
    {
      "name": "localhost",
      "names": [
        "localhost"
      ],
      "listen": [
        "[::]:8080"
      ],
```

Le JSON compilé est la forme que le serveur exécute réellement. Quand une
directive ne se comporte pas comme la documentation l'annonce, c'est le premier
endroit où regarder. Pour voir plutôt ce que `pingclair fmt` changerait dans le
fichier :

```bash
pingclair fmt --diff
```

```text
-    file_server ./public
+  file_server ./public
```

`fmt` affiche la forme canonique, indentée de deux espaces.

## 4. 🚀 L'exécuter

Au premier plan, le journal reste attaché à votre terminal :

```bash
pingclair run Pingclairfile
```

```text
🚀 Starting Pingclair with config: Pingclairfile
🚀 Starting Pingclair v0.2.0-rc.3
📄 Loaded configuration from: Pingclairfile
🔧 Configured 1 server(s)
🔐 Auto HTTPS: enabled
```

Ajoutez `--watch` pour recharger la configuration à chaque enregistrement ;
c'est la boucle de développement :

```bash
pingclair run --watch Pingclairfile
```

```text
♻️ Configuration reloaded successfully
✅ Configuration reloaded completed successfully in 2.478622ms
```

Ou lancez-le en arrière-plan, où il survit à la fermeture de votre shell :

```bash
pingclair start -c Pingclairfile
```

```text
✅ Pingclair started in the background (pid 4432)
```

`pingclair start`, `stop` et `reload` joignent le serveur par l'API
d'administration ; c'est pourquoi la configuration ci-dessus définit `admin`.
`pingclair run` n'en a pas besoin.

## 5. 🔍 Vérifier

```bash
curl -i http://localhost:8080/
```

```text
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Content-Length: 34
Last-Modified: Tue, 22 Sep 2026 03:26:39 GMT
ETag: "22-6ab1f56f"
Vary: Accept-Encoding
Accept-Ranges: bytes
server: Pingclair
```

`ETag` et `Last-Modified` indiquent que le serveur de fichiers a lu le fichier
sur le disque ; le corps est `public/index.html`. Pour arrêter un serveur en
arrière-plan :

```bash
pingclair stop
```

```text
✅ Pingclair stopped
```

## ⚡ Des serveurs en une commande

Trois sous-commandes servent sans fichier de configuration, ce qui est pratique
pour un essai ou pour un hôte jetable :

```bash
pingclair file-server --listen :8081 --root ./public
pingclair reverse-proxy --from :8082 --to 127.0.0.1:8081
pingclair respond --listen :8083 -s 200 -b "hello from respond"
```

Chacune affiche son écouteur au démarrage :

```text
🚀 Starting file server on :8081 serving ./public (browse: false)
🚀 Starting reverse proxy: :8082 -> ["127.0.0.1:8081"]
Server address: [::]:8083
```

Chaque requête vers `:8082` est relayée au serveur de fichiers de `:8081`, et
`:8083` répond avec le corps passé en argument. `respond` est réservé au
développement.

## 🔁 Le confier au service

Le service exécute `/etc/Pingclair/Pingclairfile` ; y placer votre
configuration est donc ce qui lui permet de survivre à un redémarrage :

```bash
sudo cp Pingclairfile /etc/Pingclair/Pingclairfile
sudo pingclair validate /etc/Pingclair/Pingclairfile
sudo pc service reload
curl -i http://localhost/
```

`pc service reload` demande au serveur en cours d'exécution de relire le
fichier, ce que l'unité fait en envoyant `SIGUSR1`. `pingclair reload` atteint
le même code par l'API d'administration et rapporte en plus l'avis du serveur
sur le fichier, ce qui exige l'option `admin` dans le bloc d'options globales ;
enfin, `sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"` s'en
passe dans les deux cas.

Quelle que soit la voie, validez d'abord et lisez la réponse ensuite :
`systemctl reload` rapporte seulement que le signal a été remis, si bien que le
verdict du serveur (appliqué, ou refusé avec une raison) se trouve sur la ligne
d'état de l'unité et dans le journal. Un rechargement refusé laisse la
configuration précédente en service, et c'est tout l'intérêt du refus.
[Exécution comme service](/fr/start/service/#-ce-que-signifie-un-rechargement)
en donne la version longue.

## ⚠️ Quand cela ne marche pas

- **`Address already in use`.** Le service de l'installateur occupe encore
  `:80`, ou un autre processus occupe votre port. `sudo ss -ltnp | grep :80`
  nomme le propriétaire ; `sudo pc service stop` libère le port par défaut.
- **`Empty reply from server` sur `http://localhost:8080`.** Vous parlez en
  clair à un écouteur TLS. Ajoutez le schéma `http://` à l'adresse du site, ou
  adressez-vous à lui en `https://` après avoir fait confiance au certificat
  interne.
- **`Cannot reach admin API at 127.0.0.1:2019`.** La configuration n'a pas
  d'option `admin` : rien n'écoute pour `pingclair stop` et `pingclair reload`.
  Ajoutez-la au bloc d'options globales, ou arrêtez le processus au premier
  plan avec Ctrl-C.
- **`curl` reste bloqué sur une adresse de boucle locale.** Un proxy système
  intercepte la requête. Relancez-la avec `curl --noproxy '*'`.
- **La validation échoue avec `Unsupported feature`.** La directive est
  reconnue mais pas implémentée, et le message nomme l'alternative, comme pour
  `encode br` : Brotli n'est pas implémenté pour les réponses relayées, donc le
  message renvoie vers `encode zstd gzip`.

## 🧭 Étapes suivantes

- [HTTPS](/fr/start/https/) : des certificats pour un nom public, émis par
  Let's Encrypt ou par l'autorité interne.
- [Exécution comme service](/fr/start/service/) : l'unité, la sémantique de ses
  rechargements et ses journaux.
- [Pingclairfile](/fr/reference/pingclairfile/) : le langage lui-même, avec les
  matchers, les fragments et les imports.
