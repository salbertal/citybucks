# City Bucks

Juego de construir ciudades para **2 jugadores en la misma pantalla**, creado por Philipp Lenssen para el iPad original (2010). Esta es la versión 1.0 que salió al App Store, revivida para jugar en cualquier navegador.

## Jugar

**Si te pasaron el zip:** descomprimilo, entrá a la carpeta `City Bucks` y hacé doble click en `index.html`. No hay que instalar nada. Anda en Mac, Windows y Linux, y en iPad/tablet se juega como el original.

**En esta Mac:** abrí `City Bucks.app` (lo genera `scripts/make-mac-app.sh`).

**Cómo se juega:** cada jugador arrastra edificios desde su barra (uno arriba, otro abajo) a los lotes vacíos. Los ciudadanos van al lugar más cercano que mejor satisface lo que buscan (comida, compras, cultura, diversión, descanso…) y te dejan plata. Gana el primero que llega a $50.000.000. Con los add-ons podés mejorar tus edificios o mandarle meteoritos y ladrones al otro jugador.

## Para desarrollar

| Qué | Cómo |
|---|---|
| Correr en el navegador | `scripts/serve.sh` → http://localhost:8770 |
| Zip para compartir | `scripts/build.sh` → `dist/CityBucks.zip` |
| App de Mac | `scripts/make-mac-app.sh` → `dist/City Bucks.app` |

El juego original está intacto en `game/`. Lo que hace falta para que funcione hoy (modo iPad, mouse y touch, audio, escala, modo offline) vive en `game/compat.js`. Los detalles técnicos están en [CLAUDE.md](CLAUDE.md).

## Créditos y licencia

City Bucks © Philipp Lenssen ([VersusPad](http://versuspad.com)). Código liberado bajo GNU GPL v2 ([LICENSE](LICENSE)) en [github.com/JPhilipp/VersusPad](https://github.com/JPhilipp/VersusPad). Los recursos de la versión 1.0 salen del IPA preservado en [archive.org](https://archive.org/details/ios-ipa-com.outer-court.city-bucks). Sonidos: FreeSound.org y NagranD, según los créditos originales del juego.
