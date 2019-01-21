function qu_assert(expr: boolean, msg?: string) {
    if (!expr) throw new Error(`Assert failed: ${msg}`);
}