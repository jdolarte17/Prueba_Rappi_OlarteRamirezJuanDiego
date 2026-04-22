# Rappi Store Availability Intelligence

Dashboard inteligente de análisis de disponibilidad de tiendas para Rappi. Carga archivos CSV, visualiza KPIs, gráficas interactivas y obtén análisis en tiempo real mediante un chatbot impulsado por IA.

## 🎯 Características Principales

### 1. **Carga de Datos CSV**
- Interfaz drag & drop para cargar múltiples archivos CSV simultáneamente
- Validación automática de formato y estructura
- Soporte para timestamps en formato `Mon Jan 01 2024 00:00:00 GMT-0500`
- Visualización de estado de carga (válido/error) para cada archivo

### 2. **Dashboard de Análisis**

#### KPIs (Indicadores Clave)
- **Tiendas en Pico**: Valor máximo con timestamp exacto
- **Promedio**: Media aritmética de todos los valores
- **Mínimo**: Valor mínimo con timestamp exacto
- **Puntos de Datos**: Total de puntos cargados y rango temporal

#### Filtros de Rango Horario
Analiza los datos en ventanas específicas del día:
- **Todo**: Todos los datos disponibles
- **0–8h**: Madrugada y primeras horas
- **8–12h**: Mañana
- **12–18h**: Tarde
- **18–24h**: Noche

Los filtros afectan KPIs, gráfica de línea y tabla de eventos. La gráfica de barras por hora siempre usa todos los datos para contexto.

#### Gráficas Interactivas (Recharts)
- **Línea Temporal**: Evolución de disponibilidad en el tiempo con muestreo inteligente (máximo 300 puntos para optimizar performance)
- **Barras por Hora**: Promedio de tiendas visibles para cada hora del día (0–23h), calculado sobre todos los datos

#### Tabla de Eventos Destacados
Muestra hasta 8 eventos representativos del período filtrado:
- **Timestamp**: Fecha y hora exacta del evento
- **Tiendas Visibles**: Cantidad de tiendas en ese momento
- **Variación %**: Cambio porcentual respecto al punto anterior
- **Estado**: Badge visual (PEAK en verde, MÍNIMO en rojo, Normal en gris)
- **Nota**: Contexto del evento (Máximo del período, Mínimo del período, Madrugada, Crecimiento matutino, Operación normal)

Siempre incluye el punto máximo y mínimo del período filtrado.

### 3. **Chatbot Asistente IA**

#### Configuración
- Integración con OpenRouter API (`anthropic/claude-3-haiku`)
- Modal de configuración de API Key opcional (puede omitirse)
- Soporte para múltiples idiomas (responde en español por defecto)

#### Funcionalidades
- **Historial de Mensajes**: Burbujas de chat con diferenciación usuario/asistente
- **4 Sugerencias Rápidas**:
  - "¿A qué hora hubo más tiendas?"
  - "¿Hubo caídas significativas?"
  - "Dame un resumen ejecutivo"
  - "¿Cuándo fue el mínimo y por qué?"
- **System Prompt Dinámico**: Construido automáticamente con los datos del CSV (métrica, período, KPIs, promedios por hora, caídas >10%)
- **Indicador de Escritura**: Animación de tres puntos mientras espera respuesta
- **Input de Texto**: Campo con soporte para Enter para enviar

#### Parámetros de API
```
POST https://openrouter.ai/api/v1/chat/completions
Modelo: anthropic/claude-3-haiku
Max Tokens: 800
```

## 🎨 Diseño Visual

### Filosofía de Diseño
**Editorial Financiero** — Estética de periódico financiero / Bloomberg Terminal moderno con densidad informacional sin decoración superflua.

### Paleta de Colores
| Variable | Hex | Uso |
|----------|-----|-----|
| Cream | `#F5F0E8` | Fondo principal |
| Paper | `#FDFAF4` | Tarjetas y componentes |
| Ink | `#1A1208` | Texto principal y topbar |
| Rappi Red | `#C8321A` | Logo, alertas críticas |
| Rappi Red Light | `#E84C2E` | Variantes de rojo |
| Sand | `#E8DFC8` | Elementos secundarios |
| Sand Dark | `#CFC0A0` | Bordes y separadores |
| Teal | `#1A7A6E` | Tendencias positivas, acentos |
| Teal Light | `#24A898` | Indicadores activos |
| Amber | `#D4820A` | Advertencias, valores mínimos |
| Border | `#D4C8B0` | Líneas divisoras |
| Muted | `#8A7D6A` | Texto secundario |

### Tipografía
- **Playfair Display** (700, 900): Títulos, valores KPI, números destacados
- **IBM Plex Mono** (400, 500): Labels, timestamps, badges, elementos monoespaciados
- **Source Serif 4** (300, 400, 600): Cuerpo de texto, chat, descripciones

### Componentes Visuales
- **Topbar Oscura** (48px): Logo "RAPPI" en rojo, título "STORE AVAILABILITY INTELLIGENCE", contador de puntos con indicador pulsante, botón "↩ NUEVO"
- **Bordes Mínimos**: Radio máximo de 4px, líneas de 1px para separadores
- **Sin Cards Flotantes**: Secciones delimitadas por líneas horizontales estilo periódico
- **Animaciones Sutiles**: Transiciones de 150ms ease-out, contador de KPIs con fade-in

## 📊 Formato de Entrada CSV

### Estructura Requerida
```
Fila 0 (Headers):
- Columnas 0–3: Metadata (ignoradas)
- Columnas 4+: Timestamps en formato "Mon Jan 01 2024 00:00:00 GMT-0500"

Fila 1 (Datos):
- Columna 2: Nombre de la métrica
- Columnas 4+: Valores enteros (pueden contener comas como separador de miles)
```

### Ejemplo Válido
```csv
Metadata1,Metadata2,Disponibilidad de Tiendas,Metadata4,Mon Jan 01 2024 00:00:00 GMT-0500,Mon Jan 01 2024 01:00:00 GMT-0500,Mon Jan 01 2024 02:00:00 GMT-0500
Store_Data,Region_A,Disponibilidad de Tiendas,Active,1250,1200,1180
```

## 🚀 Flujo de Uso

### Paso 1: Carga de Datos
1. Abre la aplicación
2. Arrastra uno o más archivos CSV al área de drop, o haz clic para seleccionar
3. Verifica que todos los archivos muestren estado "Válido"
4. Haz clic en "Generar Dashboard →"

### Paso 2: Configuración de IA (Opcional)
1. Se abre un modal pidiendo la API Key de OpenRouter
2. Obtén tu key en [openrouter.ai/keys](https://openrouter.ai/keys)
3. Pega la key o haz clic en "Omitir" para usar el dashboard sin chatbot

### Paso 3: Análisis
1. Visualiza los KPIs en la parte superior
2. Usa los filtros de rango horario para enfocarte en períodos específicos
3. Explora las gráficas de línea y barras
4. Revisa la tabla de eventos destacados
5. Haz preguntas al chatbot (si está habilitado) o usa las sugerencias rápidas

### Paso 4: Nuevo Análisis
- Haz clic en "↩ NUEVO" en la topbar para volver a la pantalla de carga

## 🛠️ Stack Técnico

- **Frontend**: React 19 + TypeScript
- **Gráficas**: Recharts
- **Estilos**: Tailwind CSS 4 + CSS personalizado
- **Tipografía**: Google Fonts (Playfair Display, IBM Plex Mono, Source Serif 4)
- **IA**: OpenRouter API (Anthropic Claude 3 Haiku)
- **Build**: Vite
- **Hosting**: Manus (web-static)

## 📁 Estructura del Proyecto

```
rappi-store-dashboard/
├── client/
│   ├── public/
│   │   └── (archivos de configuración)
│   ├── src/
│   │   ├── pages/
│   │   │   └── Home.tsx          # Monolito principal (todas las pantallas)
│   │   ├── contexts/
│   │   │   └── ThemeContext.tsx  # Contexto de tema
│   │   ├── components/
│   │   │   └── (componentes UI)
│   │   ├── App.tsx               # Entrada principal
│   │   ├── main.tsx              # Bootstrap React
│   │   └── index.css             # Estilos globales + paleta
│   └── index.html                # HTML con Google Fonts
├── README.md                      # Este archivo
└── package.json                   # Dependencias
```

## 🔧 Desarrollo Local

### Requisitos
- Node.js 18+
- pnpm (gestor de paquetes)

### Instalación
```bash
cd rappi-store-dashboard
pnpm install
```

### Ejecutar en Desarrollo
```bash
pnpm dev
```
Abre `http://localhost:3000` en tu navegador.

### Build para Producción
```bash
pnpm build
```

## 📝 Notas Importantes

### Parsing de CSV
- El parser es tolerante a comillas en valores
- Los timestamps se parsean automáticamente del formato RFC
- Los valores con comas se limpian (ej: "1,250" → 1250)
- Si hay filas adicionales después de la fila 1, se ignoran

### Optimización de Gráficas
- La línea temporal muestrea automáticamente hasta 300 puntos para evitar lag
- La gráfica de barras siempre usa todos los datos (24 horas)
- Los tooltips personalizados usan la paleta editorial

### Chatbot
- El system prompt se construye dinámicamente con los datos cargados
- para la KEY API iniciar sesión en openrouter y generar una API KEY
- Las respuestas están limitadas a 800 tokens
- El chat permanece deshabilitado si se omite la configuración
- Si la API Key es inválida, se muestra un error en el chat
### Rendimiento
- Soporta archivos CSV con miles de puntos de datos
- Las gráficas se renderizan sin lag gracias al muestreo inteligente
- El scroll del dashboard es suave incluso con muchos datos

## 🎯 Próximas Mejoras Sugeridas

1. **Exportar Reporte PDF** — Agregar botón para descargar un PDF con KPIs, gráficas y tabla
2. **Comparación Multimétricas** — Mostrar múltiples líneas de color en la gráfica cuando se cargan varios CSVs
3. **Detección de Anomalías** — Resaltar automáticamente caídas >10% en la gráfica con marcadores rojos
4. **Descarga de Datos Filtrados** — Exportar tabla de eventos como CSV
5. **Historial de Análisis** — Guardar análisis anteriores en localStorage para comparación

## 📄 Licencia

Este proyecto es propiedad de Rappi. Uso interno únicamente.

## 🤝 Soporte

Para reportar bugs o sugerencias, contacta al equipo de desarrollo.

---

**Versión**: 1.0.0  
**Última actualización**: Abril 2026  
**Desarrollado con**: React + TypeScript + Recharts + OpenRouter API
