# Bot emocional compartido (GitHub Pages + Firebase)

Este proyecto es un **chat en vivo multiusuario** con un **único bot compartido** por todas las personas conectadas.

## Características

- Chat en tiempo real para múltiples usuarios.
- Un solo bot global (misma "personalidad" para todos).
- Estado emocional interno persistido en base de datos:
  - felicidad
  - enojo
  - tristeza
- El bot cambia de estilo según su emoción dominante.
- Simula tiempo de pensamiento antes de responder.
- 100% frontend estático (compatible con GitHub Pages).

## 1) Crear proyecto Firebase

1. Ir a [Firebase Console](https://console.firebase.google.com/).
2. Crear proyecto.
3. Activar **Authentication** > método **Anónimo**.
4. Crear **Realtime Database** (modo producción recomendado).
5. En configuración del proyecto, crear app web y copiar el objeto `firebaseConfig`.

## 2) Configurar `app.js`

Editar `app.js` y reemplazar:

```js
const firebaseConfig = {
  apiKey: "REEMPLAZAR_API_KEY",
  authDomain: "REEMPLAZAR_AUTH_DOMAIN",
  databaseURL: "REEMPLAZAR_DATABASE_URL",
  projectId: "REEMPLAZAR_PROJECT_ID",
  storageBucket: "REEMPLAZAR_STORAGE_BUCKET",
  messagingSenderId: "REEMPLAZAR_MESSAGING_SENDER_ID",
  appId: "REEMPLAZAR_APP_ID",
};
```

## 3) Reglas de Realtime Database

En Realtime Database > Rules, usar:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

> Para un entorno real, ajustar reglas por autenticación y límites de escritura.

## 4) Publicar en GitHub Pages

1. Subir estos archivos a un repo en GitHub.
2. En Settings > Pages:
   - Source: `Deploy from a branch`
   - Branch: `main` (root)
3. Guardar y esperar el deploy.

## Estructura

- `index.html`: UI del chat y estado emocional.
- `styles.css`: estilos.
- `app.js`: lógica de tiempo real, emociones, respuestas y sincronización global del bot.

