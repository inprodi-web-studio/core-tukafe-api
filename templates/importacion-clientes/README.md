# Plantillas de importacion de clientes

Estas plantillas separan dos conceptos:

- `cliente`: identidad comercial para pedidos, promociones, cashback e historial. Puede existir solo con telefono y nombre.
- `usuario`: cuenta que puede iniciar sesion en la app. Siempre debe quedar ligada a un cliente.

## Archivos

- `01_clientes.csv`: clientes base. Este archivo es obligatorio.
- `02_usuarios_clientes.csv`: usuarios con acceso a la app. Este archivo es opcional y solo se llena para clientes que deben iniciar sesion.
- `03_cashback_inicial.csv`: saldo inicial de cashback. Este archivo es opcional y solo se llena para clientes que arrancan con cashback disponible.

## Flujo recomendado

1. Importar `01_clientes.csv`.
2. Importar `02_usuarios_clientes.csv`.
3. Para cada fila de usuarios, ligar por `telefono_cliente` al cliente ya importado.
4. Si el cliente ya existe por telefono, actualizar los datos no vacios y reutilizar el mismo registro.
5. Si el usuario ya existe por correo o telefono, validarlo y ligar el `customer.user_id` existente cuando no haya conflicto.
6. Importar `03_cashback_inicial.csv`.
7. Para cada fila de cashback, ligar por `telefono_cliente` al cliente ya importado y crear o actualizar su cuenta de cashback.

## `01_clientes.csv`

Campos requeridos:

- `telefono`: telefono en formato internacional E.164, por ejemplo `+5214421234567`.
- `nombres`: nombre visible del cliente.

Campos opcionales:

- `apellido_paterno`: se guarda en `middle_name`.
- `apellido_materno`: se guarda en `last_name`.
- `correo`: correo de contacto del cliente. No implica acceso a la app.
- `fecha_nacimiento`: formato `YYYY-MM-DD`.
- `genero`: texto libre normalizado por el importador si aplica.
- `grupo_cliente`: nombre legible de `customer_group`. Si no existe, el importador puede crearlo o rechazarlo segun el modo elegido.
- `observaciones`: solo para captura humana; el importador puede ignorarlo.

Reglas:

- `telefono` es la llave natural del cliente.
- Un cliente sin usuario debe quedar con `user_id = null`.
- No usar IDs manuales.
- No repetir telefonos activos. En base de datos existe unicidad para `customer.phone` cuando `deleted_at is null`.

## `02_usuarios_clientes.csv`

Campos requeridos:

- `telefono_cliente`: telefono del cliente en `01_clientes.csv` al que se ligara el usuario.
- `correo_login`: correo unico del usuario. El esquema actual de `user.email` es obligatorio.
- `password_modo`: estrategia de contrasena.

Campos recomendados:

- `telefono_login`: si se deja vacio, usar `telefono_cliente`.
- `nombres`, `apellido_paterno`, `apellido_materno`: si se dejan vacios, tomar los valores del cliente.
- `telefono_verificado`: `SI` o `NO`. Para migraciones controladas normalmente `SI`.
- `correo_verificado`: `SI` o `NO`.
- `usuario_activo`: `SI` o `NO`. Si es `NO`, guardar el usuario como bloqueado/inactivo segun soporte el importador.

Campos de contrasena:

- `password_hash_actual`: hash tal como existe en la base anterior. Tratar el archivo lleno como secreto.
- `password_algoritmo`: por ejemplo `better-auth-scrypt`, `legacy-bcrypt`, `legacy-argon2id` o `custom`.
- `password_parametros`: parametros no secretos del algoritmo, por ejemplo `cost=10` o `N=16384;r=16;p=1;dkLen=64`.
- `password_secret_env`: nombre de la variable de entorno necesaria para verificar el hash legado, por ejemplo `LEGACY_PASSWORD_PEPPER`. No poner el valor secreto en el CSV.
- `password_temporal`: usar solo con `password_modo = reset_temporal`.
- `forzar_cambio_password`: `SI` o `NO`.

## Estrategias de contrasena

### `hash_better_auth`

Usar solo cuando `password_hash_actual` ya fue generado por Better Auth.

En este proyecto Better Auth verifica `account.password` con scrypt y formato:

```text
salt_hex:key_hex
```

Parametros actuales:

```text
N=16384; r=16; p=1; dkLen=64
```

Para importar:

- Crear/actualizar `user`.
- Crear/actualizar `account` con `provider_id = credential`.
- Usar `account_id = user.id`.
- Guardar `password_hash_actual` en `account.password`.

### `migracion_primer_login`

Camino recomendado cuando la base anterior usa bcrypt, argon2, pbkdf2, un pepper, o cualquier hash que Better Auth no puede verificar directamente.

Requiere implementar soporte temporal de login legado:

1. Importar el usuario y guardar el hash legado y sus metadatos en una tabla de migracion segura, no en `account.password`.
2. En login, si Better Auth rechaza la contrasena, buscar el hash legado por usuario.
3. Verificar la contrasena con el algoritmo anterior usando los env originales.
4. Si es valida, generar un nuevo hash Better Auth para esa misma contrasena.
5. Crear/actualizar `account.password` con el hash Better Auth.
6. Eliminar o marcar como migrado el hash legado.
7. Continuar el login normal.

Ventaja: el usuario entra con la misma contrasena sin reset masivo.

Condicion: debemos conocer exactamente algoritmo, parametros, codificacion, sal/pepper y env usados por el proyecto anterior.

### `reset_temporal`

Usar cuando no sea posible verificar correctamente el hash anterior.

- Crear la cuenta con `password_temporal`.
- Marcar `forzar_cambio_password = SI`.
- Comunicar al cliente el proceso de cambio o recuperacion.

### `sin_acceso`

No llenar `02_usuarios_clientes.csv`. El cliente queda solo como cliente.

## `03_cashback_inicial.csv`

Este archivo sirve para clientes que deben iniciar con cashback disponible.

Campos requeridos:

- `telefono_cliente`: telefono del cliente en `01_clientes.csv`. Debe venir en el mismo formato E.164, por ejemplo `+5214421234567`.
- `saldo_cashback_mxn`: saldo disponible inicial en pesos. Usar punto decimal, por ejemplo `150`, `150.50` o `0`.

Campos opcionales:

- `total_ganado_historico_mxn`: total historico ganado antes de la migracion. Si se deja vacio, usar el mismo valor de `saldo_cashback_mxn`.
- `total_canjeado_historico_mxn`: total historico canjeado antes de la migracion. Si se deja vacio, usar `0`.
- `fecha_saldo`: fecha de corte del saldo en formato `YYYY-MM-DD`.
- `motivo`: texto para auditoria humana, por ejemplo `Saldo inicial migracion`.
- `observaciones`: solo para captura humana; el importador puede ignorarlo.

Reglas:

- Si un cliente no viene en este archivo, arranca con cashback `0`.
- No repetir `telefono_cliente`.
- Rechazar telefonos que no existan en `01_clientes.csv`.
- Rechazar montos negativos o con mas de 2 decimales.
- Convertir pesos a centavos al importar: `saldo_cashback_mxn * 100`.
- Al crear `customer_cashback_account`, guardar:
  - `balance_cents = saldo_cashback_mxn * 100`
  - `total_earned_cents = total_ganado_historico_mxn * 100`
  - `total_redeemed_cents = total_canjeado_historico_mxn * 100`
- Si se llenan los totales historicos, validar que `total_ganado_historico_mxn - total_canjeado_historico_mxn = saldo_cashback_mxn`.
- Si no necesitamos historicos reales, dejar los totales vacios. El importador interpretara el saldo inicial como cashback ganado migrado y canjeado `0`.

Nota tecnica: el esquema actual permite registrar el saldo inicial en `customer_cashback_account`. Para mostrar un movimiento historico tipo `Saldo inicial migracion`, habria que ajustar `customer_cashback_ledger`, porque actualmente cada movimiento requiere `order_id` y solo acepta movimientos `earned` o `redeemed`.

## Notas de seguridad

- Un CSV lleno con hashes o passwords temporales es material sensible.
- No commitear archivos reales de importacion.
- No poner valores de `pepper`, secretos o llaves privadas en el CSV.
- Probar primero con una copia de staging y 3 casos: cliente sin usuario, usuario con hash compatible, usuario con hash legado.

## Importacion automatica

El importador corre en modo dry-run por defecto:

```bash
yarn customers:import -- --csv-dir templates/importacion-clientes
```

Para escribir en base de datos:

```bash
yarn customers:import -- --apply --csv-dir templates/importacion-clientes
```

Opciones utiles:

- `--skip-users`: importa solo clientes.
- `--skip-cashback`: omite saldos iniciales de cashback.
- `--overwrite-cashback`: reemplaza cuentas de cashback existentes con saldo distinto.
- `--report-dir <ruta>`: escribe `customer-import-summary.json` con el resumen.
