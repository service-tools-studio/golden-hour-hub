/** Empty stub so `import "server-only"` is safe under `node --test` (Next forbids real package here). */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return {
      shortCircuit: true,
      url: "data:text/javascript,export {}",
    };
  }
  const path = specifier.split("?")[0];
  const isRelative = path.startsWith("./") || path.startsWith("../");
  const hasExtension = /\.[a-zA-Z0-9]+$/.test(path);
  if (isRelative && !hasExtension) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      // fall through to default resolution
    }
  }
  return nextResolve(specifier, context);
}
