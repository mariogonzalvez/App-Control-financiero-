# Atajo de iPhone: "Gasto rápido"

## Por qué funciona así

En iOS, la app instalada en la pantalla de inicio guarda sus datos aparte de Safari, y la app **Atajos no puede escribir en ellos** ni abrir directamente la web app instalada. Sin un servidor, la forma más sencilla de conectarlos es **el portapapeles**:

1. El atajo te pregunta importe, categoría y si pagaste con cuenta o efectivo.
2. Copia un código como `CF;20261023143005;12,50;Comida;Efectivo`.
3. Abres **Control Financiero** y pulsas **Importar gasto desde el atajo** (en Inicio). iOS te pide confirmar con **Pegar** y el gasto queda guardado.

Cada código lleva la fecha y hora, así que **nunca se importa dos veces el mismo gasto**.

## Cómo crear el atajo (5 minutos)

Abre la app **Atajos** → pestaña **Atajos** → botón **+** (arriba a la derecha). Pon de nombre **Gasto rápido**. Añade estas acciones en orden (usa el buscador "Buscar acciones"):

1. **Solicitar entrada**
   - Tipo: **Número**. Pregunta: `¿Cuánto has gastado?`
2. **Establecer variable** → nombre: `Importe` (su valor es "Entrada proporcionada").
3. **Lista** con estos elementos (uno por línea):
   `Comida` · `Gasolina` · `Salud` · `Restauración` · `Ropa` · `Ocio`
4. **Elegir de la lista** (pregunta: `Categoría`).
5. **Establecer variable** → nombre: `Categoría` (valor: "Elemento elegido").
6. **Elegir del menú** con dos opciones: `Cuenta` y `Efectivo`.
   - Dentro de **Cuenta** añade **Texto** con `Cuenta`.
   - Dentro de **Efectivo** añade **Texto** con `Efectivo`.
7. **Establecer variable** → nombre: `Origen` (valor: "Resultado de Menú").
8. **Fecha actual**.
9. **Formatear fecha** → Formato de fecha: **Personalizado**, cadena: `yyyyMMddHHmmss`.
10. **Texto** y escribe exactamente (las variables se insertan tocando encima de la barra del teclado):
    `CF;`[Fecha formateada]`;`[Importe]`;`[Categoría]`;`[Origen]
11. **Copiar al portapapeles**.
12. **Mostrar notificación**: `Gasto copiado. Abre Control Financiero y pulsa Importar.`

Pulsa **OK**. Para tenerlo a mano:
- Mantén pulsado el atajo → **Compartir → Añadir a pantalla de inicio**, o
- **Ajustes → Accesibilidad → Tocar → Tocar atrás → Doble toque → Gasto rápido**, o
- Di **"Oye Siri, gasto rápido"**.

## Notas

- La categoría se reconoce por la primera palabra (`Comida`, `Gasolina`, `Salud`, `Restauración`, `Ropa`, `Ocio`). Si cambias los nombres en la app, en **Ajustes → Atajo de iPhone** verás las palabras que entiende. Si no la reconoce, la app te deja elegirla al importar.
- El portapapeles solo guarda **el último** gasto copiado: impórtalo antes de lanzar el atajo otra vez.
- Si al pulsar Importar no aparece el botón **Pegar**, la app te muestra un recuadro: mantenlo pulsado, elige **Pegar** y pulsa **Importar**.
