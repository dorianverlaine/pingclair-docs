---
title: Pingclairfile
h1_emoji: '📖'
description: La structure d'un Pingclairfile, avec les règles lexicales, les adresses de site, les matchers, l'ordre des routes, les fragments et les outils qui le contrôlent.
---

Un Pingclairfile est le fichier de configuration de Pingclair, écrit dans le
langage Caddyfile : un bloc d'options globales facultatif, puis un bloc par
site, chacun contenant des directives. Un Caddyfile qui n'utilise que des
directives prises en charge se charge sans modification. Cette page décrit le
langage ; la [référence des directives](/fr/reference/directives/) décrit ce que
fait chaque directive.

📌 Cette page décrit **v0.2.0-rc.3**, la dernière version publiée.

## 🔤 Règles lexicales

| Règle | Détail |
| --- | --- |
| Commentaires | De `#` jusqu'à la fin de la ligne. |
| Guillemets | Une valeur contenant des espaces se met entre `"`. Les guillemets sont retirés avant l'analyse de la valeur. |
| Durées | Écrites avec une unité : `30s`, `5m`, `1h`. Un nombre nu est refusé là où une durée est attendue. |
| Casse | Les noms de directives et d'options sont en minuscules. |
| Placeholders | `{host}`, `{path}`, `{args[0]}`, `{block}` et le reste de l'ensemble des placeholders sont développés là où la directive le documente. |

## 🌐 Adresses

Un bloc de site est nommé par son adresse. L'adresse décide du port sur lequel
le site écoute et s'il est servi en HTTPS.

```text
example.com {          # HTTPS on 443 with a public certificate; 80 redirects
example.com:8443 {     # HTTPS on 8443: a host with a port is still HTTPS
localhost:8080 {       # HTTPS on 8080, from the internal authority
:8080 {                # plaintext HTTP on 8080, for any host
http://example.com {   # plaintext HTTP on 80
```

Un hôte accompagné d'un port et sans schéma est servi en HTTPS, comme dans
Caddy. Écrivez `http://` devant l'adresse pour demander du texte clair sur
n'importe quel port. Deux sites qui partagent un port doivent s'accorder sur
TLS, faute de quoi la configuration est refusée.

## 🧭 Matchers

Un matcher restreint une directive à certaines requêtes. Il s'écrit en ligne,
par exemple un chemin comme `/api/*`, ou se déclare une fois sous la forme
`@nom` pour être désigné ensuite par ce nom.

```caddyfile
example.com {
    @api path /api/*
    header @api Cache-Control "no-store"

    handle /assets/* {
        file_server ./assets
    }
}
```

Un bloc `handle` regroupe des directives en une route. Les blocs `handle` frères
s'excluent mutuellement : exactement un d'entre eux s'exécute, et un `handle`
sans matcher sert de repli au site. Dans v0.2.0-rc.3, c'est celui dont le
chemin correspondant est le plus spécifique qui s'exécute. **Prochaine
version :** c'est celui qui est trié en premier, les chemins longs avant les
courts et sinon dans l'ordre du fichier (voir
[Quelle route répond](#-quelle-route-répond)).

`client_ip` compare l'adresse du client après application de
`trusted_proxies`. **Prochaine version :** `remote_ip` compare à la place le
pair de la connexion elle-même, comme dans Caddy ; dans v0.2.0-rc.3, les deux
comparent le client transmis.

## 🧭 Quelle route répond

Dans v0.2.0-rc.3, quand plusieurs routes correspondent à une requête, celle
dont le chemin est le plus spécifique répond, quelle que soit sa place dans le
fichier.

**Prochaine version :** les routes sont essayées dans l'ordre des directives de
Caddy, et la première correspondance répond. Par exemple, `respond` passe avant
`file_server` ; dans le site ci-dessous, `/assets/a.txt` reçoit donc `hello` au
lieu du fichier :

```caddyfile
example.com {
    root * /srv
    file_server /assets/*
    respond "hello" 200
}
```

Pour garder une route plus étroite en tête, enveloppez les routes dans des blocs
`handle`, déplacez une directive avec l'option globale `order`, ou listez-les
dans un bloc `route`, qui conserve l'ordre d'écriture.

## 🧩 Fragments et imports

Les fragments (snippets) sont des morceaux réutilisables. Un fragment déclaré
sous la forme `(nom) { ... }` est inséré avec `import nom`, et peut recevoir un
bloc de l'appelant :

```caddyfile
(proxied) {
    https://{args[0]} {
        encode zstd gzip
        {block}
    }
}

import proxied example.com {
    reverse_proxy 127.0.0.1:3000
}
```

`{args[0]}` est le premier argument après le nom du fragment, et `{block}` est
le bloc fourni par l'appelant. Quand l'appelant ne fournit aucun bloc, `{block}`
se développe en rien et le fragment compile tout de même.

## 🧰 Outillage en ligne de commande

Trois commandes aident à écrire une configuration :

- `pingclair validate` compile le fichier et nomme le premier problème.
- `pingclair adapt --pretty` affiche le JSON issu de la compilation du fichier.
- `pingclair fmt` met le fichier en forme.

[Ligne de commande](/fr/reference/command-line/) liste chaque sous-commande et
chaque option.

## 🚫 Ce qui ne fait pas partie du langage

Le langage Caddyfile définit plus de directives et d'options que Pingclair n'en
implémente. Un nom que Pingclair reconnaît sans l'implémenter est refusé au
chargement du fichier, avec un message qui nomme la fonctionnalité manquante ;
une configuration ne s'exécute donc jamais avec un réglage abandonné en
silence. Le README du dépôt du serveur tient la liste complète, et
[État du projet](/fr/project/status/) la résume.
