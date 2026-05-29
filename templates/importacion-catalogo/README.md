# Plantillas de importacion (sin IDs)

Estas plantillas estan disenadas para que operacion capture datos sin campos tecnicos.

## Recomendacion de uso

- Para captura humana: usa **un solo archivo Excel** con 16 pestanas (una por plantilla).
- Para importacion tecnica: exporta cada pestana a CSV.

## Archivos

- `01_categorias_producto.csv`
- `02_productos.csv`
- `03_categorias_ingrediente.csv`
- `04_ingredientes.csv`
- `05_categorias_insumo.csv`
- `06_insumos.csv`
- `07_grupos_variacion.csv`
- `08_opciones_grupo_variacion.csv`
- `09_producto_grupos_variacion.csv`
- `10_variaciones_producto.csv`
- `11_selecciones_variacion_producto.csv`
- `12_recetas_producto.csv`
- `13_modificadores.csv`
- `14_opciones_modificador.csv`
- `15_componentes_opcion_modificador.csv`
- `16_producto_modificadores.csv`

## Reglas generales de llenado

- No usar IDs. Todas las relaciones van por nombre legible.
- `ruta_categoria_producto` usa formato jerarquico: `Padre > Hija`.
- `categoria_padre` se llena con el nombre exacto de la categoria padre (o vacio si es raiz).
- `color_hex` siempre en formato `#RRGGBB` (ej. `#8B5E3C`).
- `aplica_4_mas_1`: `SI` o `NO`.
- `precio_mxn` y `costo_por_unidad` se capturan en decimal con punto (`.`), no coma.
- `unidad_venta` y `unidad_base` deben coincidir con una unidad existente en el sistema
  (por ejemplo: `pza`, `ml`, `g`, `kg`, `l`).
- En `01_categorias_producto.csv`, `archivo_imagen` es opcional:
  - si lo llenas, usa nombre de archivo (ej. `categoria-cafe.png`) o ruta absoluta
  - si lo dejas vacio y usas `--images-dir`, el script intenta buscar una imagen por nombre de categoría
- En `02_productos.csv`, `archivo_imagen` es opcional:
  - si lo llenas, usa nombre de archivo (ej. `americano-frio.png`) o ruta absoluta
  - si lo dejas vacio y usas `--images-dir`, el script intenta buscar una imagen por nombre de producto

## Reglas de productos, variaciones y recetas

- `tipo_producto` solo puede ser: `simple`, `assembled`, `compound`.
- Producto SIN variaciones:
  - llenar `02_productos.csv`
  - `precio_mxn` obligatorio
- Producto CON variaciones:
  - llenar `02_productos.csv` + `09` + `10` + `11`
  - en `02_productos.csv`, `precio_mxn` debe ir vacio
  - cada `alias_variacion` debe tener exactamente 1 opcion por cada grupo ligado al producto
  - el importador debe consolidar `09` + `10` + `11` para crear el producto con sus variaciones
- Recetas:
  - archivo `12_recetas_producto.csv`
  - `tipo_componente` solo puede ser `ingrediente` o `insumo`
  - `nivel_receta = producto`: receta base del producto (dejar `alias_variacion` vacio)
  - `nivel_receta = variacion`: receta de una variacion especifica (llenar `alias_variacion`)

### Regla especial para `assembled`

- `assembled` SIN variaciones: requiere receta a nivel `producto` en archivo `12`.
- `assembled` CON variaciones: no debe tener receta a nivel `producto`; cada variacion en `10` debe tener su receta en `12` con `nivel_receta = variacion`.

## Reglas de modificadores

- Modificadores base:
  - archivo `13_modificadores.csv`
  - `seleccion_multiple`: `SI` o `NO`
  - si `seleccion_multiple = NO`, `minimo_selecciones` y `maximo_selecciones` deben ser `0` o `1`
  - `maximo_selecciones` puede ir vacio para representar "sin limite"
- Opciones del modificador:
  - archivo `14_opciones_modificador.csv`
  - solo puede haber 1 opcion default (`opcion_default = SI`) por modificador
  - `precio_extra_mxn` no puede ser negativo
  - `orden_opcion` se usa para ordenar las opciones antes de crear el payload final
- Componentes por opcion:
  - archivo `15_componentes_opcion_modificador.csv`
  - `tipo_componente`: `ingrediente` o `insumo`
  - `nombre_componente` debe existir en `04_ingredientes.csv` o `06_insumos.csv`
  - `cantidad` debe ser positiva
- Ligado de modificadores a producto:
  - archivo `16_producto_modificadores.csv`
  - `orden_en_producto` define el orden de aplicacion en el configurador
  - el importador debe crear primero los productos y los modificadores para despues ligar ambos

## Orden recomendado de importacion

1. `01_categorias_producto.csv`
2. `03_categorias_ingrediente.csv`
3. `05_categorias_insumo.csv`
4. `04_ingredientes.csv`
5. `06_insumos.csv`
6. `07_grupos_variacion.csv`
7. `08_opciones_grupo_variacion.csv`
8. `13_modificadores.csv`
9. `14_opciones_modificador.csv`
10. `15_componentes_opcion_modificador.csv`
11. `02_productos.csv`
12. `09_producto_grupos_variacion.csv`
13. `10_variaciones_producto.csv`
14. `11_selecciones_variacion_producto.csv`
15. `12_recetas_producto.csv`
16. `16_producto_modificadores.csv`

## Importacion automatica (script)

Si ya llenaron los CSV de esta carpeta, pueden ejecutar un solo comando:

```bash
cd core-tukafe-api
yarn catalog:import
```

Opcionalmente pueden pasar parametros:

```bash
node --env-file=.env --import tsx scripts/import-catalog-from-csv.ts \
  --api-url http://localhost:3000 \
  --images-dir ./templates/importacion-catalogo/imagenes-productos \
  --email amurillo@inprodi.com.mx \
  --password Asdf123456
```

Notas:

- El script crea entidades en este orden: categorias -> ingredientes/insumos -> grupos -> modificadores -> productos.
- Antes de importar productos, el script asegura una organizacion `Pop Up`: si no existe, la crea.
- Todos los productos se registran con la organizacion `Pop Up`.
- Todos los productos se registran con el impuesto `IVA`: si no existe, lo crea con tasa 16%.
- Si una unidad no existe (`ml`, `pza`, etc.), la crea automaticamente y la reutiliza.
- El script aplica normalizacion basica de texto para corregir artefactos de acentos/mojibake comunes (por ejemplo `Caf�` -> `Café`, `Fr�o` -> `Frío`).
- Si encuentra un registro existente (conflicto), intenta reutilizarlo por nombre legible.
- Si usas `--images-dir`, el script sube imagenes a `/api/admin/uploads` y asigna `imageUploadId` al crear categorías y productos.
- Si una categoría o producto ya existe, no se actualiza su imagen (la importación actual solo crea registros).

## Campos requeridos por archivo

- `01_categorias_producto.csv`: `nombre_categoria`, `icono`, `color_hex` (`archivo_imagen` opcional)
- `02_productos.csv`: `nombre_producto`, `tipo_producto`, `unidad_venta` + `precio_mxn` si no hay variaciones (`archivo_imagen` opcional)
- `03_categorias_ingrediente.csv`: `nombre_categoria`, `icono`, `color_hex`
- `04_ingredientes.csv`: `nombre_ingrediente`, `categoria_ingrediente`, `unidad_base`, `costo_por_unidad`
- `05_categorias_insumo.csv`: `nombre_categoria`, `icono`, `color_hex`
- `06_insumos.csv`: `nombre_insumo`, `categoria_insumo`, `unidad_base`, `costo_por_unidad`
- `07_grupos_variacion.csv`: `nombre_grupo_variacion`, `orden_grupo`
- `08_opciones_grupo_variacion.csv`: `nombre_grupo_variacion`, `nombre_opcion`
- `09_producto_grupos_variacion.csv`: `nombre_producto`, `nombre_grupo_variacion`, `orden_en_producto`
- `10_variaciones_producto.csv`: `nombre_producto`, `alias_variacion`, `precio_mxn`
- `11_selecciones_variacion_producto.csv`: `nombre_producto`, `alias_variacion`, `nombre_grupo_variacion`, `nombre_opcion`
- `12_recetas_producto.csv`: `nivel_receta`, `nombre_producto`, `tipo_componente`, `nombre_componente`, `cantidad`
- `13_modificadores.csv`: `nombre_modificador`, `seleccion_multiple`, `minimo_selecciones`
- `14_opciones_modificador.csv`: `nombre_modificador`, `nombre_opcion`
- `15_componentes_opcion_modificador.csv`: `nombre_modificador`, `nombre_opcion`, `tipo_componente`, `nombre_componente`, `cantidad`
- `16_producto_modificadores.csv`: `nombre_producto`, `nombre_modificador`, `orden_en_producto`
