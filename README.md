# Control Financiero

App web (PWA) para controlar gastos personales desde el iPhone. Funciona sin conexión y guarda todos los datos **solo en tu iPhone**, sin cuentas ni servidores.

- Dinero total = cuenta + efectivo (la inversión va aparte).
- Gastos, ingresos y traspasos manuales, editables y borrables.
- Gastos fijos que se cobran solos de la cuenta el día indicado.
- Reparto mensual por porcentajes, con barras que se ponen naranjas al 80 % y rojas al pasarte.
- Inversión separada, cierre de mes, historial y gráficas.
- Atajo de iPhone para apuntar gastos rápidos (ver [ATAJO.md](ATAJO.md)).

---

## 1. Publicarla en GitHub Pages (solo una vez)

1. Entra en el repositorio en github.com e inicia sesión.
2. Si hay una *Pull request* pendiente con la app, ábrela y pulsa **Merge pull request** → **Confirm merge**.
3. Ve a **Settings** (pestaña con la rueda dentada, arriba del repositorio).
4. En el menú de la izquierda, entra en **Pages**.
5. En **Build and deployment → Source**, elige **Deploy from a branch**.
6. En **Branch**, elige **main** y la carpeta **/ (root)**. Pulsa **Save**.
7. Espera 1–2 minutos y recarga la página. Arriba saldrá: *"Your site is live at …"*.
   La dirección será: **https://mariogonzalvez.github.io/App-Control-financiero-/**

> El repositorio debe ser **público** para usar GitHub Pages gratis (Settings → General → abajo del todo, *Danger Zone → Change visibility*). Tus datos **no** se suben: solo se publica el código de la app.

## 2. Instalarla en el iPhone

1. Abre **Safari** (tiene que ser Safari) y entra en la dirección de arriba.
2. Pulsa el botón **Compartir** (el cuadrado con la flecha hacia arriba).
3. Baja y pulsa **Añadir a pantalla de inicio**.
4. Comprueba que el nombre sea **Control Financiero** y pulsa **Añadir**.
5. Abre la app **desde el icono** de la pantalla de inicio (no desde Safari) y escribe tu saldo inicial.

A partir de ahí funciona como cualquier app, también sin conexión.

**Importante sobre tus datos**
- Se guardan dentro de la app instalada. Si la borras de la pantalla de inicio, **se borran los datos**.
- Lo que hagas en Safari no aparece en la app instalada (iOS las separa). Usa siempre el icono.

## 3. Actualizaciones

Cuando se publique una versión nueva, abre la app con conexión a internet; al cerrarla y volverla a abrir tendrás la nueva versión. Tus datos se mantienen.
