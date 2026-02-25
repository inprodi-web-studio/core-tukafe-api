import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FEATURES_ROOT = path.resolve(__dirname, "../../src/features");

const AREA_OPTIONS = ["admin", "customer"];

function toPascalCase(value) {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

function toCamelCase(value) {
  const pascal = toPascalCase(value);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function normalizeName(value) {
  return value.trim().toLowerCase();
}

function isValidSlug(value) {
  return /^[a-z][a-z0-9]*$/.test(value);
}

function ensureImport(content, importLine) {
  if (content.includes(importLine)) {
    return content;
  }

  const importMatches = [...content.matchAll(/^import .*;$/gm)];
  if (importMatches.length === 0) {
    return `${importLine}\n${content}`;
  }

  const lastImport = importMatches.at(-1);
  const insertAt = lastImport.index + lastImport[0].length;

  return `${content.slice(0, insertAt)}\n${importLine}${content.slice(insertAt)}`;
}

function ensureRouteRegistration(content, registerLine) {
  if (content.includes(registerLine)) {
    return content;
  }

  const routeFunctionPattern =
    /export async function\s+\w+\s*\(\s*server:\s*FastifyInstance\s*\)\s*\{/m;
  const match = routeFunctionPattern.exec(content);

  if (!match || match.index === undefined) {
    throw new Error("No se pudo encontrar la función de rutas del feature.");
  }

  const openBraceIndex = match.index + match[0].length - 1;
  let depth = 0;
  let closeBraceIndex = -1;

  for (let index = openBraceIndex; index < content.length; index += 1) {
    const char = content[index];

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        closeBraceIndex = index;
        break;
      }
    }
  }

  if (closeBraceIndex === -1) {
    throw new Error("No se pudo determinar el cierre de la función de rutas.");
  }

  const bodyStart = openBraceIndex + 1;
  const currentBody = content.slice(bodyStart, closeBraceIndex);
  const normalizedBody = currentBody.trim().length ? `${currentBody.replace(/\s*$/, "")}\n` : "\n";
  const nextBody = `${normalizedBody}${registerLine}\n`;

  return `${content.slice(0, bodyStart)}${nextBody}${content.slice(closeBraceIndex)}`;
}

function toFeatureData(answers) {
  const areaLower = answers.area;
  const featureName = normalizeName(answers.featureName);
  const featurePascal = toPascalCase(featureName);

  return {
    areaLower,
    areaPascal: toPascalCase(areaLower),
    featureName,
    featurePascal,
    featureCamel: toCamelCase(featureName),
    serviceInterface: `${toPascalCase(areaLower)}${featurePascal}Service`,
    serviceFunction: `${areaLower}${featurePascal}Service`,
    routesFunction: `${areaLower}${featurePascal}Routes`,
    pluginSymbol: `${areaLower}${featurePascal}ServicesPlugin`,
    namespaceInterface: areaLower === "customer" ? "CusstomerNamespace" : "AdminNamespace",
    namespaceKey: areaLower,
    featureDir: path.join(FEATURES_ROOT, areaLower, featureName),
  };
}

function toActionData(answers) {
  const base = toFeatureData(answers);
  const actionName = normalizeName(answers.actionName);

  return {
    ...base,
    actionName,
    actionPascal: toPascalCase(actionName),
    actionCamel: toCamelCase(actionName),
    actionRoutesFunction: `${toCamelCase(actionName)}Routes`,
    actionDir: path.join(base.featureDir, actionName),
    featureRoutesPath: path.join(
      FEATURES_ROOT,
      base.areaLower,
      base.featureName,
      `${base.featureName}.routes.ts`,
    ),
  };
}

export default (plop) => {
  plop.setGenerator("feature", {
    description: "Crea un nuevo feature en admin o customer",
    prompts: [
      {
        type: "list",
        name: "area",
        message: "¿Dónde quieres crear el feature?",
        choices: AREA_OPTIONS,
      },
      {
        type: "input",
        name: "featureName",
        message: "Nombre del feature (ej: auth):",
        validate: (input) => {
          const normalized = normalizeName(input);
          if (!normalized) {
            return "El nombre es obligatorio.";
          }

          if (!isValidSlug(normalized)) {
            return "Usa solo letras minúsculas y números, iniciando con letra.";
          }

          return true;
        },
      },
    ],
    actions(answers) {
      const data = toFeatureData(answers);

      return [
        {
          type: "add",
          path: "{{featureDir}}/{{featureName}}.types.ts",
          templateFile: "templates/feature/feature.types.hbs",
          data,
          skipIfExists: true,
        },
        {
          type: "add",
          path: "{{featureDir}}/{{featureName}}.service.ts",
          templateFile: "templates/feature/feature.service.hbs",
          data,
          skipIfExists: true,
        },
        {
          type: "add",
          path: "{{featureDir}}/{{featureName}}.routes.ts",
          templateFile: "templates/feature/feature.routes.hbs",
          data,
          skipIfExists: true,
        },
        {
          type: "add",
          path: "{{featureDir}}/{{featureName}}.plugin.ts",
          templateFile: "templates/feature/feature.plugin.hbs",
          data,
          skipIfExists: true,
        },
        {
          type: "add",
          path: "{{featureDir}}/index.ts",
          templateFile: "templates/feature/index.hbs",
          data,
          skipIfExists: true,
        },
      ];
    },
  });

  plop.setGenerator("action", {
    description: "Crea una nueva acción dentro de un feature y la registra en routes",
    prompts: [
      {
        type: "list",
        name: "area",
        message: "¿En qué área está el feature?",
        choices: AREA_OPTIONS,
      },
      {
        type: "input",
        name: "featureName",
        message: "Nombre del feature (ej: auth):",
        validate: (input, answers) => {
          const normalized = normalizeName(input);

          if (!normalized) {
            return "El nombre del feature es obligatorio.";
          }

          if (!isValidSlug(normalized)) {
            return "Usa solo letras minúsculas y números, iniciando con letra.";
          }

          const featurePath = path.join(FEATURES_ROOT, answers.area, normalized);
          if (!fs.existsSync(featurePath)) {
            return `No existe el feature: ${featurePath}`;
          }

          return true;
        },
      },
      {
        type: "input",
        name: "actionName",
        message: "Nombre de la acción (ej: signup):",
        validate: (input) => {
          const normalized = normalizeName(input);
          if (!normalized) {
            return "El nombre de la acción es obligatorio.";
          }

          if (!isValidSlug(normalized)) {
            return "Usa solo letras minúsculas y números, iniciando con letra.";
          }

          return true;
        },
      },
    ],
    actions(answers) {
      const data = toActionData(answers);
      const importLine = `import { ${data.actionRoutesFunction} } from "./${data.actionName}";`;
      const registerLine = `  await server.register(${data.actionRoutesFunction}, { prefix: "/${data.actionName}" });`;

      return [
        {
          type: "add",
          path: "{{actionDir}}/{{actionName}}.controllers.ts",
          templateFile: "templates/action/action.controllers.hbs",
          data,
          skipIfExists: true,
        },
        {
          type: "add",
          path: "{{actionDir}}/{{actionName}}.routes.ts",
          templateFile: "templates/action/action.routes.hbs",
          data,
          skipIfExists: true,
        },
        {
          type: "add",
          path: "{{actionDir}}/{{actionName}}.schemas.ts",
          templateFile: "templates/action/action.schemas.hbs",
          data,
          skipIfExists: true,
        },
        {
          type: "add",
          path: "{{actionDir}}/index.ts",
          templateFile: "templates/action/index.hbs",
          data,
          skipIfExists: true,
        },
        () => {
          if (!fs.existsSync(data.featureRoutesPath)) {
            throw new Error(
              `No se encontró el archivo de rutas del feature: ${data.featureRoutesPath}`,
            );
          }

          const current = fs.readFileSync(data.featureRoutesPath, "utf8");
          const withImport = ensureImport(current, importLine);
          const withRoute = ensureRouteRegistration(withImport, registerLine);

          fs.writeFileSync(data.featureRoutesPath, withRoute);

          return `Actualizado ${data.featureRoutesPath}`;
        },
      ];
    },
  });
};
