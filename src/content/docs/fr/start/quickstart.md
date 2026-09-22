---
title: Démarrage rapide
h1_emoji: '🏃'
description: Écrire un premier Pingclairfile, le valider et servir du trafic.
---

Cette page mène d'une installation neuve à un serveur en service : un site
statique sur le port 8080, puis un reverse proxy devant une application
backend.

## 1. ✍️ Écrire une configuration

Créez un fichier nommé `Pingclairfile` :

```caddyfile
localhost:8080 {
    file_server ./public
}
```

Le fichier contient un seul bloc de site. `localhost:8080` est l'adresse sur
laquelle le site répond, `file_server` sert des fichiers, et `./public` est le
répertoire depuis lequel ils sont lus, relativement au répertoire courant.

## 2. ✅ La valider

```bash
pingclair validate
```

`validate` lit `./Pingclairfile` par défaut ; `./Caddyfile` est également
détecté. La commande compile la configuration, applique des contrôles
sémantiques — par exemple l'existence des chemins de certificats — et se
termine avec un code non nul en cas d'erreur. La validation n'est pas
consultative : une configuration en échec ne s'exécute pas.

Deux commandes associées sont utiles pendant l'écriture d'une configuration :

```bash
pingclair adapt --pretty   # afficher la forme JSON compilée
pingclair fmt --diff       # montrer les changements de formatage sans les écrire
```

## 3. 🚀 Le lancer

```bash
pingclair run Pingclairfile
```

Le processus journalise chaque écouteur qu'il ouvre, puis sert les requêtes
jusqu'à recevoir un signal d'arrêt.

## 4. 🔍 Vérifier

Dans un second terminal :

```bash
curl -i http://localhost:8080/
```

Attendez-vous à `200` avec les en-têtes `ETag` et `Last-Modified` du fichier
servi.

Si la requête reste bloquée, vérifiez qu'un proxy système n'intercepte pas le
trafic de boucle locale et rejouez la requête avec `curl --noproxy '*'`.

## 5. 🔁 Proxifier une application

Remplacez le bloc de site par un reverse proxy devant un backend qui écoute sur
le port 3000 :

```caddyfile
localhost:8080 {
    reverse_proxy localhost:3000
}
```

Validez et relancez avec les mêmes commandes. La réponse provient désormais du
backend. Les amonts multiples, la politique de répartition de charge, les
contrôles de santé et le comportement en cas de panne sont décrits sous
[`reverse_proxy`](/fr/reference/directives/#reverse_proxy).

## 6. 🔒 Terminer TLS

Les noms publics obtiennent leurs certificats automatiquement :

```caddyfile
{
    email admin@example.com
}

example.com {
    reverse_proxy localhost:3000
}
```

HTTPS automatique exige que l'adresse du site soit un nom public et que le défi
ACME puisse atteindre le serveur, ce qui suppose normalement le port 80. Pour
les origines privées, `tls internal` émet depuis une autorité de certification
locale ; les clients doivent faire confiance à sa racine, publiée dans
`$PINGCLAIR_TLS_STORE/internal/root.crt`.

## 7. ⚙️ L'exécuter comme service

L'installateur crée une unité `systemd` que la commande `pc` pilote :

```bash
pc service start
pc service status
pc service reload   # relire la configuration sans redémarrer
```

## 🧭 Étapes suivantes

- [Modèle de configuration](/fr/concepts/configuration/)
- [Architecture](/fr/concepts/architecture/)
- [Référence des directives](/fr/reference/directives/)
