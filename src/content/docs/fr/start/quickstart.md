---
title: Démarrage rapide
h1_emoji: '🏃'
sidebar:
  order: 2
description: Écrire un premier Pingclairfile, le valider, l'exécuter au premier plan ou en arrière-plan, et servir un vrai répertoire.
---

Cette page mène d'un hôte installé à un serveur que vous contrôlez : une
configuration sur disque, une compilation validée, un serveur que vous démarrez,
arrêtez et surveillez, et une vérification qui prouve que le serveur de fichiers
a répondu. Elle suppose l'[installation](/fr/start/install/) déjà faite.

## 🧾 Avant de commencer

L'installateur a laissé un service en écoute sur le port 80, et ce service garde
la configuration de `/etc/Pingclair/Pingclairfile`. Arrêtez-le le temps de vos
essais, pour libérer les ports :

```bash
sudo pc service stop
```

```bash
mkdir -p ~/demo/public
cd ~/demo
echo '<h1>hello from ~/demo/public</h1>' > public/index.html
```

## 1. ✍️ Écrire une configuration

Créez `~/demo/Pingclairfile` :

```caddyfile
{
    admin 127.0.0.1:2019
}

http://localhost:8080 {
    file_server ./public
}
```

Trois choses méritent d'être nommées. Le bloc sans nom en tête contient les
options globales, et `admin` est ce qui permet à `pingclair start`, `stop` et
`reload` de parler au serveur en cours d'exécution. L'adresse du site porte le
schéma, et `http://` force le texte en clair ; sans lui, Pingclair traite
`localhost` comme un nom et sert HTTPS depuis sa propre autorité de
certification, ce qu'un client HTTP simple voit comme une réponse vide
([HTTPS](/fr/start/https/)). La racine de `file_server` est relative au
répertoire courant.

## 2. ✅ Valider avant d'exécuter

```bash
pingclair validate
```

```text
✅ Configuration 'Pingclairfile' is valid!
```

`validate` lit `./Pingclairfile` par défaut et détecte aussi `./Caddyfile`. Il
compile la configuration et applique des contrôles sémantiques, comme
l'existence des chemins de certificats. La validation n'est pas consultative :
une configuration en échec ne s'exécute pas, et la dernière ligne en donne la
raison.

## 3. 🧭 Voir ce que la configuration devient

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
fichier :

```bash
pingclair fmt --diff
```

```text
-    file_server ./public
+  file_server ./public
```

`fmt` imprime la forme canonique, qui indente de deux espaces.

## 4. 🚀 L'exécuter

Au premier plan, où le journal reste attaché à votre terminal :

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

Ajoutez `--watch` pour recharger la configuration à chaque enregistrement, ce qui
donne la boucle de développement :

```bash
pingclair run --watch Pingclairfile
```

```text
♻️ Configuration reloaded successfully
✅ Configuration reloaded completed successfully in 2.478622ms
```

Ou exécutez-le en arrière-plan, où il survit à votre shell :

```bash
pingclair start -c Pingclairfile
```

```text
✅ Pingclair started in the background (pid 4432)
```

`pingclair start`, `stop` et `reload` joignent le serveur en cours d'exécution
par l'Admin API, ce qui explique l'option `admin` ci-dessus. `pingclair run` n'en
a pas besoin.

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

`ETag` et `Last-Modified` signifient que le serveur de fichiers a lu le fichier
sur le disque. Le corps est `public/index.html`. Pour arrêter un serveur en
arrière-plan :

```bash
pingclair stop
```

```text
✅ Pingclair stopped
```

## ⚡ Des serveurs en une commande

Trois sous-commandes servent sans fichier de configuration, ce qui est pratique
pour un essai ou un hôte jetable :

```bash
pingclair file-server --listen :8081 --root ./public
pingclair reverse-proxy --from :8082 --to 127.0.0.1:8081
pingclair respond --listen :8083 -s 200 -b "hello from respond"
```

Chacune annonce son écouteur au démarrage :

```text
🚀 Starting file server on :8081 serving ./public (browse: false)
🚀 Starting reverse proxy: :8082 -> ["127.0.0.1:8081"]
Server address: [::]:8083
```

Chaque requête vers `:8082` est transmise au serveur de fichiers sur `:8081`, et
`:8083` répond avec le corps que vous avez fourni. `respond` est réservé au
développement.

## 🔁 Le confier au service

Le service exécute `/etc/Pingclair/Pingclairfile` : c'est donc y placer votre
configuration qui la fait survivre à un redémarrage :

```bash
sudo cp Pingclairfile /etc/Pingclair/Pingclairfile
sudo pingclair validate /etc/Pingclair/Pingclairfile
sudo kill -USR1 "$(systemctl show -p MainPID --value pingclair)"
curl -i http://localhost/
```

`SIGUSR1` est le signal de rechargement, et il fonctionne sans configuration
supplémentaire. `pingclair reload` fait la même chose par l'Admin API et rapporte
en plus ce que le serveur a pensé du fichier, ce qui exige l'option `admin` du
bloc des options globales.

Validez d'abord dans tous les cas. `pc service reload` a l'air de la commande
évidente et n'en est pas une : l'unité installée envoie `SIGHUP`, que le serveur
ignore, donc elle annonce un succès pendant que l'ancienne configuration continue
de servir ([issue #66](https://github.com/dorianverlaine/pingclair/issues/66)).

## ⚠️ Quand cela ne marche pas

- **`Address already in use`.** Le service de l'installateur occupe encore
  `:80`, ou un autre processus occupe votre port.
  `sudo ss -ltnp | grep :80` nomme le propriétaire, et `sudo pc service stop`
  libère celui par défaut.
- **`Empty reply from server` sur `http://localhost:8080`.** Vous parlez en clair
  à un écouteur TLS. Ajoutez le schéma `http://` à l'adresse du site, ou
  adressez-vous à lui en `https://` en faisant confiance au certificat interne.
- **`Cannot reach admin API at 127.0.0.1:2019`.** La configuration n'a pas
  d'option `admin` : rien n'écoute pour `pingclair stop` et `pingclair reload`.
  Ajoutez-la au bloc des options globales, ou arrêtez le processus au premier
  plan avec Ctrl-C.
- **`curl` se bloque sur une adresse de boucle locale.** Un proxy système
  intercepte la requête. Rejouez-la avec `curl --noproxy '*'`.
- **La validation échoue avec `Unsupported feature`.** La directive est
  reconnue mais non implémentée, et le message nomme l'alternative, comme pour
  `encode br` : Brotli n'est pas implémenté pour les réponses proxifiées, le
  message renvoie donc vers `encode zstd gzip`.

## 🧭 Étapes suivantes

- [HTTPS](/fr/start/https/) : des certificats pour un nom public, depuis Let's
  Encrypt ou depuis l'autorité interne.
- [Exécution comme service](/fr/start/service/) : l'unité, sa sémantique de
  rechargement et ses journaux.
- [Pingclairfile](/fr/reference/pingclairfile/) : le langage lui-même, avec les
  matchers, les fragments et les imports.
