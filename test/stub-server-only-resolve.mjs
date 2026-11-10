/** Empty stub so `import "server-only"` is safe under `node --test` (Next forbids real package here). */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return {
      shortCircuit: true,
      url: "data:text/javascript,export {}",
    };
  }
  return nextResolve(specifier, context);
}
