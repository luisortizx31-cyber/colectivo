# Colectivo

App para registrar los cobros del colectivo: tocas el precio (S/ 3.50 Centro, 3.00 Terminal, 2.50 Villa María, 2.00 Cerca…) y queda guardado con la hora, la fecha y si fue **Efectivo** o **Yape**. Para un pasaje de monto distinto (por ejemplo un taxi) está el botón **Taxi**, donde escribes cuánto cobraste. En **Cobros** anotas la gasolina y el gas del día y te muestra la **ganancia** (lo cobrado menos los gastos). Pensada para usarla con una mano en el celular. Funciona sin internet.

## Usarla

**En el celular:** abre https://luisortizx31-cyber.github.io/colectivo/ en Chrome y elige ⋮ → *Instalar app* (o *Agregar a la pantalla de inicio*). Queda como una app más, en pantalla completa y sin necesitar internet.

**Probarla en la PC (para desarrollar):**

- Doble clic en `iniciar.bat` (abre http://localhost:8080).
- Desde el celular en el mismo Wi-Fi: la dirección `http://192.168.x.x:8080` que muestra la ventana de `iniciar.bat`. Si Windows pregunta por el firewall, permite el acceso en redes privadas. Ahí no se puede instalar como app (el navegador pide HTTPS).

## Publicar cambios

La página se publica con GitHub Pages desde la rama `main`. Después de cambiar algo:

1. Sube `VERSION` en `sw.js` (si no, los celulares siguen con la versión vieja).
2. `git add -A`, `git commit -m "..."` y `git push`. En ~1 minuto queda publicado.
3. En el celular aparece un puntito naranja en Ajustes → toca **Actualizar la app**.

Los datos de cada dispositivo son independientes: lo que pruebas en la PC no aparece en el celular.

## Archivos

| Archivo | Para qué sirve |
| --- | --- |
| `index.html` | Las 3 pantallas: Cobrar, Cobros (historial) y Ajustes |
| `styles.css` | Diseño (colores por modo Efectivo/Yape, tamaños según el celular) |
| `app.js` | Toda la lógica y el guardado de datos |
| `sw.js` | Modo sin internet. **Sube `VERSION` cada vez que cambies `index.html`, `styles.css` o `app.js`**, si no los celulares siguen con la versión vieja |
| `manifest.webmanifest`, `icons/` | Datos e íconos para instalarla como app |

## Cómo se guardan los datos

En el `localStorage` del navegador del celular (no hay servidor ni cuenta). Cada cobro es `[hora en ms, céntimos, 0|1 (1 = Yape), destino]` en la clave `colectivo.cobros.v1`; los gastos son `[hora en ms, céntimos, tipo]` en `colectivo.gastos.v1` (tipos: `gasolina`, `gas`; se pueden sumar más en `TIPOS_GASTO` de `app.js`); las tarifas y ajustes tienen sus propias claves. Los montos son enteros en céntimos (350 = S/ 3.50). Si borras los datos del navegador, cambias de celular o lo pierdes, se pierden los cobros. Por eso existe **Ajustes → Guardar copia de seguridad**: en el celular abre el menú de compartir (Drive, WhatsApp…) y en la PC descarga un archivo `.json`. Para volver a cargarla: **Ajustes → Restaurar copia de seguridad**, que permite *unir* (solo agrega los cobros que faltan) o *reemplazar todo*, y se puede deshacer. Si pasan 7 días sin copia aparece un puntito naranja en la pestaña Ajustes. **Exportar cobros y gastos (Excel / CSV)** sirve para verlos en Excel (los gastos van en negativo, así la suma de la columna Monto es la ganancia), pero ese archivo no se puede volver a cargar.

Cuando publiques una versión nueva, la app la detecta sola y marca Ajustes con el mismo puntito para que toques **Actualizar la app** (no se recarga sola por si estás cobrando).

## Ideas para seguir mejorándola

- Gráfico de los últimos 7 días y cierre del día (efectivo que debes tener vs. Yape por verificar).
- Que el “día” pueda empezar de madrugada (hoy cambia a las 12:00 a. m.).
- Cobrar varios pasajeros de una vez (×2, ×3).
